import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn";
function getSecret() {
  const set = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (set) {
    try { const parsed = JSON.parse(set); if (typeof parsed.default === "string" && parsed.default) return parsed.default; } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const secret = getSecret();
const db = SUPABASE_URL && secret ? createClient(SUPABASE_URL, secret, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const authClient = SUPABASE_URL && PUBLISHABLE_KEY ? createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;

const limits = new Map<string,{count:number;resetAt:number}>();
function isLimited(key:string,max:number) {
  const now=Date.now();
  const item=limits.get(key);
  if (!item || item.resetAt <= now) { limits.set(key,{count:1,resetAt:now+60_000}); return false; }
  item.count++;
  return item.count > max;
}
function json(status:number,body:unknown) {
  return new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json"}});
}
function cleanText(value:unknown,max:number) {
  return typeof value==="string" ? value.trim().slice(0,max) : "";
}
function clientIp(req:Request) {
  return (req.headers.get("x-forwarded-for")||"unknown").split(",")[0].trim().slice(0,80);
}
async function authenticateRecruiter(req:Request) {
  if (!db || !authClient) return { email:"", error:"Messaging service is not configured." };
  const header=req.headers.get("authorization")||"";
  const token=header.match(/^Bearer\s+(.+)$/i)?.[1]||"";
  if (!token || token===PUBLISHABLE_KEY) return {email:"",error:"Please sign in with an authorized recruiter account."};
  const {data:{user},error:userError}=await authClient.auth.getUser(token);
  if (userError || !user?.email) return {email:"",error:"Recruiter session is invalid or expired. Sign in again."};
  const email=user.email.trim().toLowerCase();
  const {data:admin,error}=await db.from("asy_recruitment_admins").select("email,role").eq("email",email).maybeSingle();
  if (error || !admin) return {email:"",error:"Only authorized recruiters can manage announcements or applicant chats."};
  return {email,error:""};
}
async function findApplication(code:string,email:string) {
  if (!db) return null;
  const {data,error}=await db.from("asy_clan_applications")
    .select("id,application_code,ign,contact_email,application_type,status,workflow_step")
    .eq("application_code",code.toUpperCase()).eq("contact_email",email.toLowerCase()).maybeSingle();
  if(error) throw error;
  return data;
}
async function messagesForApplication(applicationId:string,viewer:"applicant"|"recruiter") {
  if(!db) throw new Error("Messaging service is not configured.");
  const opposite=viewer==="applicant"?"recruiter":"applicant";
  const readColumn=viewer==="applicant"?"applicant_read_at":"recruiter_read_at";
  const {error:markError}=await db.from("asy_application_messages")
    .update({[readColumn]:new Date().toISOString()})
    .eq("application_id",applicationId).eq("sender_role",opposite).is(readColumn,null);
  if(markError) throw markError;
  const {data,error}=await db.from("asy_application_messages")
    .select("id,application_id,sender_role,sender_name,body,created_at,applicant_read_at,recruiter_read_at")
    .eq("application_id",applicationId).order("created_at",{ascending:true}).limit(100);
  if(error) throw error;
  return data||[];
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS") return new Response("ok",{headers:corsHeaders});
  if(req.method!=="POST") return json(405,{error:"Use POST for community messaging."});
  if(!db) return json(503,{error:"Community messaging is not configured on the server."});
  const ip=clientIp(req);
  if(isLimited("all:"+ip,60)) return json(429,{error:"Too many requests. Please wait a moment."});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body) return json(400,{error:"Invalid request body."});
  const action=cleanText(body.action,40);
  try {
    if(action==="announcements-list") {
      const url = new URL(req.url);
      const authHeader=req.headers.get("authorization")||"";
      const token=authHeader.match(/^Bearer\s+(.+)$/i)?.[1]||"";
      let isAdmin=false;
      if(token && token!==PUBLISHABLE_KEY && authClient) {
        const {data:{user}}=await authClient.auth.getUser(token);
        if(user?.email) {
          const {data:admin}=await db.from("asy_recruitment_admins").select("email").eq("email",user.email.trim().toLowerCase()).maybeSingle();
          isAdmin=Boolean(admin);
        }
      }
      const query=db.from("asy_community_announcements")
        .select("id,title,body,category,is_published,created_at,updated_at,published_at,created_by_email,updated_by_email")
        .order("created_at",{ascending:false}).limit(50);
      const {data,error}=isAdmin?await query:await db.from("asy_community_announcements")
        .select("id,title,body,category,published_at,created_at")
        .eq("is_published",true).order("published_at",{ascending:false}).limit(20);
      if(error) throw error;
      return json(200,{announcements:data||[],is_admin:isAdmin});
    }

    if(action==="announcement-save") {
      const auth=await authenticateRecruiter(req);
      if(auth.error) return json(403,{error:auth.error});
      const title=cleanText(body.title,120);
      const text=cleanText(body.body,3000);
      const category=cleanText(body.category,20)||"general";
      const published=body.is_published===true;
      const id=cleanText(body.id,80);
      if(title.length<3||!text||text.length>3000) return json(400,{error:"Add a title (3–120 characters) and message (up to 3,000 characters)."});
      if(!["general","recruitment","event","maintenance"].includes(category)) return json(400,{error:"Choose a valid announcement category."});
      const now=new Date().toISOString();
      if(id) {
        const update={title,body:text,category,is_published:published,updated_by_email:auth.email,updated_at:now,published_at:published?now:null};
        const {data,error}=await db.from("asy_community_announcements").update(update).eq("id",id).select("id,title,body,category,is_published,created_at,updated_at,published_at").maybeSingle();
        if(error) throw error;
        if(!data) return json(404,{error:"Announcement not found."});
        return json(200,{announcement:data});
      }
      const {data,error}=await db.from("asy_community_announcements").insert({title,body:text,category,is_published:published,created_by_email:auth.email,updated_by_email:auth.email,published_at:published?now:null}).select("id,title,body,category,is_published,created_at,updated_at,published_at").single();
      if(error) throw error;
      return json(200,{announcement:data});
    }

    if(action==="announcement-delete") {
      const auth=await authenticateRecruiter(req);
      if(auth.error) return json(403,{error:auth.error});
      const id=cleanText(body.id,80);
      if(!id) return json(400,{error:"Announcement ID is required."});
      const {error,count}=await db.from("asy_community_announcements").delete({count:"exact"}).eq("id",id);
      if(error) throw error;
      return json(200,{deleted:true});
    }

    if(action==="community-chat-list") {
      const {data,error}=await db.from("asy_community_chat_messages")
        .select("id,display_name,body,created_at")
        .is("hidden_at",null).order("created_at",{ascending:false}).limit(80);
      if(error) throw error;
      return json(200,{messages:(data||[]).reverse()});
    }

    if(action==="community-chat-send") {
      if(isLimited("general:"+ip,8)) return json(429,{error:"Please slow down before sending another community message."});
      const displayName=cleanText(body.display_name,32);
      const text=cleanText(body.body,500);
      if(displayName.length<2||text.length<1) return json(400,{error:"Enter a display name and a message."});
      if(/\b(password|passcode|login code|verification code)\b/i.test(text)) return json(400,{error:"Do not post passwords or login codes in public chat."});
      const {data,error}=await db.from("asy_community_chat_messages").insert({display_name:displayName,body:text}).select("id,display_name,body,created_at").single();
      if(error) throw error;
      return json(200,{message:data});
    }

    if(action==="community-chat-hide") {
      const auth=await authenticateRecruiter(req);
      if(auth.error) return json(403,{error:auth.error});
      const id=cleanText(body.id,80);
      const note=cleanText(body.moderation_note,300);
      if(!id) return json(400,{error:"Message ID is required."});
      const {data,error}=await db.from("asy_community_chat_messages").update({hidden_at:new Date().toISOString(),hidden_by_email:auth.email,moderation_note:note||null}).eq("id",id).select("id").maybeSingle();
      if(error) throw error;
      if(!data) return json(404,{error:"Message not found."});
      return json(200,{hidden:true});
    }

    if(action==="application-messages-list"||action==="application-messages-send") {
      if(isLimited("applicant:"+ip,18)) return json(429,{error:"Too many requests. Please wait and try again."});
      const code=cleanText(body.application_code,80);
      const email=cleanText(body.contact_email,254).toLowerCase();
      if(!code||!email) return json(400,{error:"Tracking code and application email are required."});
      const app=await findApplication(code,email);
      if(!app) return json(404,{error:"Application not found. Check your tracking code and email."});
      if(action==="application-messages-list") {
        const messages=await messagesForApplication(app.id,"applicant");
        return json(200,{application:{application_code:app.application_code,ign:app.ign,status:app.status,workflow_step:app.workflow_step},messages});
      }
      const text=cleanText(body.body,2000);
      if(!text) return json(400,{error:"Type a message first."});
      if(["rejected","waitlisted"].includes(app.status) || app.workflow_step==="complete") return json(409,{error:"This conversation is closed. Contact staff through official ASY Discord if further help is needed."});
      const {data,error}=await db.from("asy_application_messages")
        .insert({application_id:app.id,sender_role:"applicant",sender_name:app.ign,body:text})
        .select("id,application_id,sender_role,sender_name,body,created_at,applicant_read_at,recruiter_read_at").single();
      if(error) throw error;
      return json(200,{message:data});
    }

    if(action==="admin-application-messages-list"||action==="admin-application-messages-send") {
      const auth=await authenticateRecruiter(req);
      if(auth.error) return json(403,{error:auth.error});
      const applicationId=cleanText(body.application_id,80);
      if(!applicationId) return json(400,{error:"Application ID is required."});
      const {data:app,error:appError}=await db.from("asy_clan_applications").select("id,ign,application_code,status,workflow_step").eq("id",applicationId).maybeSingle();
      if(appError) throw appError;
      if(!app) return json(404,{error:"Application not found."});
      if(action==="admin-application-messages-list") {
        const messages=await messagesForApplication(app.id,"recruiter");
        return json(200,{application:{id:app.id,ign:app.ign,application_code:app.application_code,status:app.status,workflow_step:app.workflow_step},messages});
      }
      if(isLimited("recruiter:"+ip+":"+applicationId,30)) return json(429,{error:"Please slow down before sending another message."});
      const text=cleanText(body.body,2000);
      if(!text) return json(400,{error:"Type a message first."});
      const {data,error}=await db.from("asy_application_messages")
        .insert({application_id:app.id,sender_role:"recruiter",sender_name:"ASY Recruiter",body:text})
        .select("id,application_id,sender_role,sender_name,body,created_at,applicant_read_at,recruiter_read_at").single();
      if(error) throw error;
      return json(200,{message:data});
    }

    return json(400,{error:"Unknown messaging action."});
  } catch(error) {
    console.error("ASY community messaging failed.",error);
    return json(500,{error:"Messaging is temporarily unavailable. Please retry."});
  }
});
