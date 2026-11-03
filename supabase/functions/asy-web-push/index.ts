import { createClient } from "npm:@supabase/supabase-js@2.57.0";
import webpush from "npm:web-push@3.6.7";

// Only staff authenticated by Supabase Auth + recruitment allowlist can manage devices.
// VAPID credentials and the dispatch token remain in RLS-protected database rows.
const url = Deno.env.get("SUPABASE_URL")!;
const roleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const db = createClient(url, roleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Content-Type": "application/json; charset=utf-8",
};
function reply(body: unknown, status=200) { return new Response(JSON.stringify(body), {status,headers:cors}); }
const allowedPushHosts = (host: string) =>
  ["googleapis.com", "mozilla.com", "push.apple.com", "windows.com"].some(d => host === d || host.endsWith("." + d));
function validSubscription(s: any) {
  try {
    const endpoint = new URL(s?.endpoint);
    return endpoint.protocol === "https:" && allowedPushHosts(endpoint.hostname) &&
      s.endpoint.length < 2048 && typeof s?.keys?.p256dh === "string" &&
      s.keys.p256dh.length < 512 && typeof s?.keys?.auth === "string" &&
      s.keys.auth.length < 512;
  } catch { return false; }
}
async function loadConfig() {
  const { data, error } = await db.from("asy_webpush_config")
    .select("vapid_public_key,vapid_private_key,dispatch_token").eq("id", true).single();
  if (error || !data) throw new Error("Web Push is not configured");
  return data;
}
async function requireStaff(req: Request) {
  const token = /^Bearer\s+(.+)$/i.exec(req.headers.get("authorization") || "")?.[1];
  if (!token) return null;
  const { data: auth, error } = await db.auth.getUser(token);
  const user = !error ? auth.user : null;
  if (!user?.email || !user.id) return null;
  const { data: admins, error: adminError } = await db.from("asy_recruitment_admins").select("email");
  if (adminError || !admins?.some(a => a.email?.toLowerCase() === user.email!.toLowerCase())) return null;
  return user;
}
function configurePush(config: any) {
  webpush.setVapidDetails("mailto:jeromeitable37@gmail.com", config.vapid_public_key, config.vapid_private_key);
}
function statusCode(error: any) { return Number(error?.statusCode || error?.status || 0); }
async function sendDevice(sub: any, notification: any, config: any) {
  configurePush(config);
  const title = String(notification.title || "ASYLUM Recruitment").slice(0, 90);
  const body = String(notification.body || "You have a new recruitment update.").slice(0, 180);
  const tag = "asy-recruitment-" + notification.id;
  const appId = typeof notification.application_id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(notification.application_id)
      ? notification.application_id : null;
  const url = appId ? "/?open_application=" + encodeURIComponent(appId) : "/";
  await webpush.sendNotification({
    endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth },
  }, JSON.stringify({ title, body, tag, url }), { TTL: 3600, urgency: "normal" });
}
async function dispatch(config: any) {
  // Retry failed interrupted workers; never resend an already-sent delivery.
  await db.from("asy_webpush_deliveries").update({state:"pending",claimed_at:null})
    .eq("state","processing").lt("claimed_at",new Date(Date.now()-180000).toISOString()).lt("attempts",4);
  const { data: jobs, error } = await db.from("asy_webpush_deliveries")
    .select("id,notification_id,subscription_id,attempts")
    .eq("state","pending").lte("available_at",new Date().toISOString())
    .order("created_at",{ascending:true}).limit(40);
  if (error) throw error;
  if (!jobs?.length) return { processed:0, sent:0 };
  const { data: admins } = await db.from("asy_recruitment_admins").select("email");
  const approved = new Set((admins || []).map(a=>a.email?.toLowerCase()).filter(Boolean));
  let sent = 0;
  let processed = 0;
  for (const job of jobs) {
    const claimed = await db.from("asy_webpush_deliveries")
      .update({state:"processing",claimed_at:new Date().toISOString(),attempts:job.attempts+1})
      .eq("id",job.id).eq("state","pending").select("id").maybeSingle();
    if (!claimed.data) continue;
    processed++;
    try {
      const [s,n] = await Promise.all([
        db.from("asy_webpush_subscriptions").select("id,user_id,endpoint,p256dh,auth,enabled").eq("id",job.subscription_id).maybeSingle(),
        db.from("asy_recruitment_notifications").select("id,title,body,application_id,recipient_role,notification_type").eq("id",job.notification_id).maybeSingle(),
      ]);
      if (s.error || n.error || !s.data || !n.data) throw new Error("Missing subscription or notification");
      if (!s.data.enabled || n.data.recipient_role !== "recruiter") {
        await db.from("asy_webpush_deliveries").update({state:"failed",error_message:"Not eligible"}).eq("id",job.id);
        continue;
      }
      const {data: u, error: ue}=await db.auth.admin.getUserById(s.data.user_id);
      if (ue || !u.user?.email || !approved.has(u.user.email.toLowerCase())) {
        await db.from("asy_webpush_deliveries").update({state:"failed",error_message:"Staff access revoked"}).eq("id",job.id);
        continue;
      }
      await sendDevice(s.data,n.data,config);
      await db.from("asy_webpush_deliveries").update({state:"sent",sent_at:new Date().toISOString(),error_message:null}).eq("id",job.id);
      sent++;
    } catch(e) {
      const code=statusCode(e);
      if (code===404 || code===410) {
        // Invalidated by the browser push service: revoke the dead endpoint.
        await db.from("asy_webpush_subscriptions").delete().eq("id",job.subscription_id);
        continue;
      }
      await db.from("asy_webpush_deliveries").update({
        state:job.attempts+1>=4?"failed":"pending",
        available_at:new Date(Date.now()+Math.min(600000,60000*Math.pow(2,job.attempts))).toISOString(),
        error_message:(e instanceof Error?e.message:"Web Push delivery failed").slice(0,200),
      }).eq("id",job.id);
    }
  }
  return {processed,sent};
}
Deno.serve(async req => {
  if(req.method==="OPTIONS") return new Response(null,{status:204,headers:cors});
  try {
    if(req.method==="GET") {
      const c=await loadConfig();
      return reply({ publicKey:c.vapid_public_key });
    }
    if(req.method!=="POST") return reply({error:"Method not allowed"},405);
    const data=await req.json().catch(()=>({}));
    const action=data?.action;
    if(action==="dispatch"){
      const secret=req.headers.get("x-asy-push-secret") || "";
      const config=await loadConfig();
      if(secret.length<40 || secret!==config.dispatch_token) return reply({error:"Unauthorized"},401);
      return reply(await dispatch(config));
    }
    const user=await requireStaff(req);
    if(!user) return reply({error:"Authorized recruitment staff login required"},403);
    if(action==="subscribe") {
      const s=data?.subscription;
      if(!validSubscription(s)) return reply({error:"Invalid push subscription"},400);
      const {error}=await db.from("asy_webpush_subscriptions").upsert({
        user_id:user.id,endpoint:s.endpoint,p256dh:s.keys.p256dh,auth:s.keys.auth,
        enabled:true,updated_at:new Date().toISOString(),
      },{onConflict:"endpoint"});
      if(error) throw error;
      return reply({ok:true});
    }
    if(action==="unsubscribe") {
      const endpoint=data?.endpoint;
      if(typeof endpoint!=="string" || endpoint.length>2048) return reply({error:"Invalid endpoint"},400);
      const {error}=await db.from("asy_webpush_subscriptions").delete().eq("user_id",user.id).eq("endpoint",endpoint);
      if(error) throw error;
      return reply({ok:true});
    }
    if(action==="test") {
      const endpoint=data?.endpoint;
      if(typeof endpoint!=="string") return reply({error:"Invalid endpoint"},400);
      const {data: sub}=await db.from("asy_webpush_subscriptions")
        .select("id,endpoint,p256dh,auth").eq("endpoint",endpoint).eq("user_id",user.id).eq("enabled",true).maybeSingle();
      if(!sub) return reply({error:"Enable push on this device first"},400);
      const c=await loadConfig();
      try {
        await sendDevice(sub,{id:"test",title:"ASYLUM push test",body:"Push notifications are working, even when your website tab is closed."},c);
      }catch(e) {
        if([404,410].includes(statusCode(e))) await db.from("asy_webpush_subscriptions").delete().eq("id",sub.id);
        throw e;
      }
      return reply({ok:true});
    }
    return reply({error:"Unknown action"},400);
  }catch(e) {
    console.error("ASY web push error:", e);
    return reply({error:"Push service unavailable. Try again or contact ASYLUM staff."},500);
  }
});