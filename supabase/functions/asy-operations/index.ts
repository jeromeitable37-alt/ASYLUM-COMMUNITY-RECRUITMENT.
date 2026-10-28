import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const url = Deno.env.get("SUPABASE_URL") || "";
const publishableKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn";
function getServerKey() {
  const value = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (value) {
    try { const parsed = JSON.parse(value); if (parsed.default) return String(parsed.default); } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const serverKey = getServerKey();
const db = url && serverKey ? createClient(url, serverKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const authClient = url && publishableKey ? createClient(url, publishableKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const limits = new Map<string, { count: number; resetAt: number }>();

function limited(key: string, max: number) {
  const now = Date.now();
  const item = limits.get(key);
  if (!item || item.resetAt <= now) { limits.set(key, { count: 1, resetAt: now + 60_000 }); return false; }
  item.count++;
  return item.count > max;
}
function json(status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function clean(v: unknown, max = 500) { return typeof v === "string" ? v.trim().slice(0, max) : ""; }
function ip(req: Request) { return (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim().slice(0, 80); }
function canManage(role: string) { return ["owner", "management", "admin", "moderator"].includes(role.trim().toLowerCase()); }
function canModerate(role: string) { return canManage(role); }
async function staff(req: Request) {
  if (!db || !authClient) return { email: "", role: "", error: "Operations service is not configured." };
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token || token === publishableKey) return { email: "", role: "", error: "Sign in with an authorized ASY staff account." };
  const { data: { user }, error: authError } = await authClient.auth.getUser(token);
  if (authError || !user?.email) return { email: "", role: "", error: "Your staff session is invalid or expired. Please sign in again." };
  const email = user.email.trim().toLowerCase();
  const { data, error } = await db.from("asy_recruitment_admins").select("email,role").eq("email", email).maybeSingle();
  if (error || !data) return { email: "", role: "", error: "This account is not authorized for ASY recruitment operations." };
  return { email, role: String(data.role || "recruiter"), error: "" };
}

async function accountUser(req: Request) {
  if (!db || !authClient) return { user: null as any, response: json(503, { error: "Accounts service is not configured." }) };
  const token = (req.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token || token === publishableKey) return { user: null as any, response: json(401, { error: "Sign in to continue." }) };
  const { data: { user }, error } = await authClient.auth.getUser(token);
  if (error || !user?.id || !user.email) return { user: null as any, response: json(401, { error: "Your session is invalid or expired. Sign in again." }) };
  if (!user.email_confirmed_at) return { user: null as any, response: json(403, { error: "Verify your email before using member accounts." }) };
  const { data: memberState, error: memberStateError } = await db.from("asy_member_accounts").select("is_disabled").eq("user_id", user.id).maybeSingle();
  if (memberStateError) return { user: null as any, response: json(503, { error: "Could not verify this member account status." }) };
  if (memberState?.is_disabled === true) return { user: null as any, response: json(403, { error: "This ASY account has been disabled. Contact an authorized administrator." }) };
  return { user, response: null as Response | null };
}

async function applicantApp(code: string, email: string) {
  if (!db || !code || !email) return null;
  const { data, error } = await db.from("asy_clan_applications").select("id,application_code,ign,status,workflow_step,contact_email,application_type,submitted_at,updated_at").eq("application_code", code.toUpperCase()).ilike("contact_email", email.toLowerCase()).maybeSingle();
  if (error) throw error;
  return data;
}
async function audit(actor: string, action: string, type: string, id: string | null, summary: string) {
  if (!db) return;
  const { error } = await db.from("asy_recruitment_audit_logs").insert({ actor_email: actor || "system", action, entity_type: type, entity_id: id, summary });
  if (error) console.error("Audit insert failed.", error.message);
}
async function requireStaff(req: Request, allowed: (role: string) => boolean = () => true) {
  const user = await staff(req);
  if (user.error) return { user, response: json(403, { error: user.error }) };
  if (!allowed(user.role)) return { user, response: json(403, { error: "Your staff role does not have permission for this action." }) };
  return { user, response: null as Response | null };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json(405, { error: "Use POST for ASY operations." });
  if (!db) return json(503, { error: "Operations service is not configured on the server." });
  const clientIp = ip(req);
  if (limited("all:" + clientIp, 100)) return json(429, { error: "Too many requests. Please wait a moment." });
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body) return json(400, { error: "Invalid request body." });
  const action = clean(body.action, 60);
  try {
    if (action === "directory-list") {
      const { data, error } = await db.from("asy_clan_roster_public").select("id,ign,main_role,rank,member_status,joined_at").eq("member_status", "active").order("joined_at", { ascending: true }).limit(500);
      if (error) throw error;
      return json(200, { members: data || [] });
    }


    if (action === "admin-access-request") {
      const { user, response } = await accountUser(req);
      if (response) return response;
      const displayName = clean(body.display_name, 80);
      const reason = clean(body.reason, 800);
      if (displayName.length < 2 || reason.length < 10) return json(400, { error: "Enter your name and at least 10 characters explaining why you need Admin access." });
      const email = String(user.email).trim().toLowerCase();
      const { data: existingStaff, error: staffError } = await db.from("asy_recruitment_admins").select("email,role").eq("email", email).maybeSingle();
      if (staffError) throw staffError;
      if (existingStaff) return json(409, { error: "This account already has staff access.", role: existingStaff.role });
      const { data, error } = await db.from("asy_admin_access_requests").upsert({
        user_id: user.id, email, display_name: displayName, reason,
        status: "pending", reviewed_by_email: null, reviewed_at: null, updated_at: new Date().toISOString()
      }, { onConflict: "user_id" }).select("id,status,created_at").single();
      if (error) throw error;
      return json(200, { request: data, message: "Admin access request submitted. The main Admin must approve it." });
    }

    if (action === "admin-access-requests-list") {
      const { user, response } = await requireStaff(req, (role) => role.trim().toLowerCase() === "owner");
      if (response) return response;
      const { data, error } = await db.from("asy_admin_access_requests")
        .select("id,user_id,email,display_name,reason,status,reviewed_by_email,reviewed_at,created_at")
        .order("created_at", { ascending: false }).limit(200);
      if (error) throw error;
      return json(200, { requests: data || [] });
    }

    if (action === "admin-access-request-review") {
      const { user, response } = await requireStaff(req, (role) => role.trim().toLowerCase() === "owner");
      if (response) return response;
      const id = clean(body.id, 80);
      const status = clean(body.status, 20);
      if (!id || !["approved", "rejected"].includes(status)) return json(400, { error: "Choose approve or reject." });
      const { data: request, error: requestError } = await db.from("asy_admin_access_requests")
        .select("id,user_id,email,display_name,status").eq("id", id).maybeSingle();
      if (requestError) throw requestError;
      if (!request) return json(404, { error: "Admin access request not found." });
      if (request.status !== "pending") return json(409, { error: "This request has already been reviewed." });
      if (status === "approved") {
        const { data: authUser, error: authError } = await db.auth.admin.getUserById(request.user_id);
        if (authError || !authUser?.user?.email_confirmed_at || String(authUser.user.email || "").toLowerCase() !== String(request.email).toLowerCase()) {
          return json(409, { error: "The requested account must still exist and have a verified matching email." });
        }
        const { error: upsertError } = await db.from("asy_recruitment_admins").upsert(
          { email: String(request.email).toLowerCase(), role: "admin" }, { onConflict: "email" }
        );
        if (upsertError) throw upsertError;
      }
      const { error: updateError } = await db.from("asy_admin_access_requests").update({
        status, reviewed_by_email: user.email.toLowerCase(), reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("id", id);
      if (updateError) throw updateError;
      await audit(user.email, "admin_access." + status, "admin_access_request", id, "Admin access request for " + request.email + " was " + status + ".");
      return json(200, { success: true, status });
    }

    if (action === "member-account-get") {
      const { user, response } = await accountUser(req);
      if (response) return response;
      let { data: profile, error } = await db.from("asy_member_accounts").select("user_id,display_name,ign,codm_uid,discord_username,photo_url,approval_status,review_note,linked_application_id,linked_at,created_at,updated_at").eq("user_id", user.id).maybeSingle();
      if (error) throw error;
      if (!profile) {
        const { data: created, error: createError } = await db.from("asy_member_accounts").insert({
          user_id: user.id, display_name: clean(user.user_metadata?.display_name, 80)
        }).select("user_id,display_name,ign,codm_uid,discord_username,photo_url,approval_status,review_note,linked_application_id,linked_at,created_at,updated_at").single();
        if (createError) throw createError;
        profile = created;
      }
      let linkedApplication = null;
      if (profile.linked_application_id) {
        const { data: app, error: appError } = await db.from("asy_clan_applications").select("application_code,ign,status,workflow_step,submitted_at,updated_at").eq("id", profile.linked_application_id).maybeSingle();
        if (appError) throw appError;
        linkedApplication = app;
      }
      const { data: ownRequest, error: ownRequestError } = await db.from("asy_admin_access_requests").select("id,status,reason,created_at,reviewed_at").eq("user_id", user.id).maybeSingle();
      if (ownRequestError) throw ownRequestError;
      const { data: staffRow, error: staffRowError } = await db.from("asy_recruitment_admins").select("role").eq("email", String(user.email).toLowerCase()).maybeSingle();
      if (staffRowError) throw staffRowError;
      return json(200, { profile, linkedApplication, adminRequest: ownRequest, staffRole: staffRow?.role || null, email: user.email });
    }

    if (action === "member-account-save") {
      const { user, response } = await accountUser(req);
      if (response) return response;
      const displayName = clean(body.display_name, 80);
      const ign = clean(body.ign, 40);
      const uid = clean(body.codm_uid, 32);
      const discord = clean(body.discord_username, 80);
      const photoUrl = clean(body.photo_url, 500);
      if (displayName.length < 2 || ign.length < 2 || !/^\d{19}$/.test(uid) || !photoUrl) {
        return json(400, { error: "Display name, IGN, 19-digit CODM UID, and profile picture are required." });
      }
      let parsedPhoto: URL;
      try { parsedPhoto = new URL(photoUrl); } catch { return json(400, { error: "Upload a valid profile picture." }); }
      if (parsedPhoto.protocol !== "https:" || parsedPhoto.hostname !== "tyhszzztltamrohhyykh.supabase.co") return json(400, { error: "Profile picture must be uploaded to the ASY member avatar storage." });
      const { data: currentProfile, error: currentProfileError } = await db.from("asy_member_accounts").select("approval_status").eq("user_id", user.id).maybeSingle();
      if (currentProfileError) throw currentProfileError;
      const profileUpdate: Record<string, unknown> = {
        display_name: displayName, ign, codm_uid: uid, discord_username: discord,
        photo_url: photoUrl, updated_at: new Date().toISOString()
      };
      if (currentProfile?.approval_status === "rejected") profileUpdate.approval_status = "pending";
      const { data, error } = await db.from("asy_member_accounts").update(profileUpdate)
        .eq("user_id", user.id).select("user_id,display_name,ign,codm_uid,discord_username,photo_url,approval_status,review_note,linked_application_id,linked_at,updated_at").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Member profile was not found. Please sign out and sign in again." });
      return json(200, { profile: data });
    }

    if (action === "member-account-link-application") {
      const { user, response } = await accountUser(req);
      if (response) return response;
      const code = clean(body.application_code, 80).toUpperCase();
      const email = String(user.email).trim().toLowerCase();
      if (!code) return json(400, { error: "Enter your existing application tracking code." });
      const app = await applicantApp(code, email);
      if (!app) return json(404, { error: "We couldn't match that tracking code to your verified account email. Existing application data has not been changed." });
      const { data: profile, error: profileError } = await db.from("asy_member_accounts").select("linked_application_id").eq("user_id", user.id).maybeSingle();
      if (profileError) throw profileError;
      if (!profile) return json(404, { error: "Member profile not found." });
      if (profile.linked_application_id && profile.linked_application_id !== app.id) return json(409, { error: "A different application is already linked. Contact ASY support if this is incorrect." });
      const { error } = await db.from("asy_member_accounts").update({
        linked_application_id: app.id, linked_at: new Date().toISOString(), updated_at: new Date().toISOString()
      }).eq("user_id", user.id);
      if (error) throw error;
      return json(200, { success: true, application: { application_code: app.application_code, ign: app.ign, status: app.status, workflow_step: app.workflow_step, submitted_at: app.submitted_at, updated_at: app.updated_at } });
    }

    if (action === "member-account-review-list") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const { data, error } = await db.from("asy_member_accounts")
        .select("user_id,display_name,ign,codm_uid,discord_username,photo_url,approval_status,review_note,linked_application_id,created_at,updated_at,is_disabled")
        .order("created_at", { ascending: false }).limit(300);
      if (error) throw error;
      const profiles = await Promise.all((data || []).map(async (profile: any) => {
        const { data: authData } = await db.auth.admin.getUserById(profile.user_id);
        const email = String(authData?.user?.email || "").toLowerCase();
        const { data: staffData } = email ? await db.from("asy_recruitment_admins").select("role").eq("email", email).maybeSingle() : { data: null };
        return { ...profile, email, role: staffData?.role || null, is_disabled: Boolean(profile.is_disabled) };
      }));
      return json(200, { profiles, role: user.role });
    }

    if (action === "user-management-update") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const userId = clean(body.user_id, 80);
      const operation = clean(body.operation, 20);
      if (!userId || !["disable", "enable", "delete", "admin", "member"].includes(operation)) return json(400, { error: "Choose a valid user-management action." });
      const token = (req.headers.get("authorization") || "").match(/^Bearer\\s+(.+)$/i)?.[1] || "";
      const { data: currentAuth } = await authClient!.auth.getUser(token);
      if (userId === currentAuth.user?.id && ["disable", "delete", "member"].includes(operation)) return json(409, { error: "You cannot disable or remove your own staff access." });
      if (["delete", "admin", "member"].includes(operation) && user.role.trim().toLowerCase() !== "owner") return json(403, { error: "Only the Owner can delete accounts or change Admin roles." });
      const { data: target, error: targetError } = await db.auth.admin.getUserById(userId);
      if (targetError || !target?.user?.email) return json(404, { error: "User account was not found." });
      const targetEmail = String(target.user.email).toLowerCase();
      const { data: targetStaff, error: targetStaffError } = await db.from("asy_recruitment_admins").select("role").eq("email", targetEmail).maybeSingle();
      if (targetStaffError) throw targetStaffError;
      if (targetStaff?.role?.trim().toLowerCase() === "owner" && ["delete", "admin", "member"].includes(operation)) return json(409, { error: "The Owner account cannot be deleted or demoted here." });
      if (operation === "disable" || operation === "enable") {
        const { error: authUpdateError } = await db.auth.admin.updateUserById(userId, { ban_duration: operation === "disable" ? "876000h" : "none" });
        if (authUpdateError) throw authUpdateError;
        const { error } = await db.from("asy_member_accounts").upsert({ user_id: userId, display_name: String(target.user.user_metadata?.display_name || targetEmail), is_disabled: operation === "disable", updated_at: new Date().toISOString() }, { onConflict: "user_id" });
        if (error) throw error;
      } else if (operation === "admin") {
        const { error } = await db.from("asy_recruitment_admins").upsert({ email: targetEmail, role: "admin" }, { onConflict: "email" });
        if (error) throw error;
      } else if (operation === "member") {
        const { error } = await db.from("asy_recruitment_admins").delete().eq("email", targetEmail);
        if (error) throw error;
      } else if (operation === "delete") {
        const { error } = await db.auth.admin.deleteUser(userId);
        if (error) throw error;
      }
      await audit(user.email, "user_management." + operation, "user", userId, "User management action " + operation + " performed for " + targetEmail + ".");
      return json(200, { success: true, operation });
    }

    if (action === "member-account-review") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const userId = clean(body.user_id, 80);
      const status = clean(body.status, 20);
      const note = clean(body.review_note, 500);
      if (!userId || !["approved", "rejected", "pending"].includes(status)) return json(400, { error: "Choose a valid member approval status." });
      const { data, error } = await db.from("asy_member_accounts").update({
        approval_status: status, review_note: note || null, updated_at: new Date().toISOString()
      }).eq("user_id", userId).select("user_id,approval_status").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Member account not found." });
      await audit(user.email, "member_account." + status, "member_account", userId, "Member account was marked " + status + ".");
      return json(200, { success: true, profile: data });
    }

    if (action === "dashboard-summary") {
      const { user, response } = await requireStaff(req);
      if (response) return response;
      const [{ data: apps, error: appError }, { data: evidence, error: evidenceError }, { data: notifications, error: noticeError }, { data: messages, error: messageError }, { data: reports, error: reportError }] = await Promise.all([
        db.from("asy_clan_applications").select("id,status,workflow_step,submitted_at,updated_at").order("submitted_at", { ascending: false }).limit(2000),
        db.from("asy_recruitment_evidence").select("id,status,submitted_at,reviewed_at").limit(5000),
        db.from("asy_recruitment_notifications").select("id,is_read,created_at").eq("recipient_role", "recruiter").eq("is_read", false).limit(500),
        db.from("asy_application_messages").select("id,created_at").eq("sender_role", "applicant").is("recruiter_read_at", null).limit(500),
        db.from("asy_community_reports").select("id,created_at").eq("status", "pending").limit(500),
      ]);
      if (appError || evidenceError || noticeError || messageError || reportError) throw appError || evidenceError || noticeError || messageError || reportError;
      const all = apps || [];
      const now = Date.now();
      const status = (name: string) => all.filter((a: any) => a.status === name).length;
      return json(200, {
        role: user.role,
        totals: {
          applications: all.length,
          pending: status("pending"),
          reviewing: status("reviewing"),
          interviews: status("interview"),
          tryouts: status("tryout"),
          accepted: status("accepted"),
          rejected: status("rejected"),
          waitlisted: status("waitlisted"),
          evidencePending: (evidence || []).filter((e: any) => e.status === "pending").length,
          unreadNotifications: (notifications || []).length,
          unreadApplicantMessages: (messages || []).length,
          openReports: (reports || []).length,
          newThisWeek: all.filter((a: any) => now - new Date(a.submitted_at).getTime() <= 7 * 86400000).length,
        },
        refreshedAt: new Date().toISOString(),
      });
    }

    if (action === "notifications-list" || action === "notification-read") {
      const code = clean(body.application_code, 80);
      const email = clean(body.contact_email, 254).toLowerCase();
      let recipientRole: "applicant" | "recruiter" = "applicant";
      let applicationId = "";
      let actor = "applicant";
      if (code && email) {
        const app = await applicantApp(code, email);
        if (!app) return json(404, { error: "Application not found. Check the tracking code and contact email." });
        applicationId = app.id;
      } else {
        const { user, response } = await requireStaff(req);
        if (response) return response;
        recipientRole = "recruiter";
        actor = user.email;
      }
      if (action === "notifications-list") {
        let query = db.from("asy_recruitment_notifications").select("id,application_id,title,body,notification_type,is_read,created_at").eq("recipient_role", recipientRole).order("created_at", { ascending: false }).limit(50);
        if (applicationId) query = query.eq("application_id", applicationId);
        const { data, error } = await query;
        if (error) throw error;
        return json(200, { notifications: data || [] });
      }
      const id = clean(body.id, 80);
      if (!id) return json(400, { error: "Notification ID is required." });
      let query = db.from("asy_recruitment_notifications").update({ is_read: true }).eq("id", id).eq("recipient_role", recipientRole);
      if (applicationId) query = query.eq("application_id", applicationId);
      const { data, error } = await query.select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Notification not found." });
      if (actor !== "applicant") await audit(actor, "notification.read", "notification", id, "Staff marked a notification as read.");
      return json(200, { success: true });
    }

    if (action === "audit-list") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const { data, error } = await db.from("asy_recruitment_audit_logs").select("id,actor_email,action,entity_type,entity_id,summary,created_at").order("created_at", { ascending: false }).limit(100);
      if (error) throw error;
      return json(200, { logs: data || [], role: user.role });
    }

    if (action === "chat-report") {
      if (limited("report:" + clientIp, 4)) return json(429, { error: "You have submitted several reports. Please wait before submitting another." });
      const messageId = clean(body.message_id, 80);
      const reporter = clean(body.reporter_name, 60) || "Community member";
      const reason = clean(body.reason, 40);
      const details = clean(body.details, 500);
      if (!messageId || reporter.length < 2 || !["spam", "harassment", "personal_information", "impersonation", "other"].includes(reason)) return json(400, { error: "Choose a valid report reason." });
      const { data: message, error: messageError } = await db.from("asy_community_chat_messages").select("id").eq("id", messageId).is("hidden_at", null).maybeSingle();
      if (messageError) throw messageError;
      if (!message) return json(404, { error: "That message is not available to report." });
      const { data, error } = await db.from("asy_community_reports").insert({ message_id: messageId, reporter_name: reporter, reason, details: details || null }).select("id").single();
      if (error) throw error;
      return json(200, { success: true, report_id: data.id });
    }

    if (action === "report-list" || action === "report-resolve") {
      const { user, response } = await requireStaff(req, canModerate);
      if (response) return response;
      if (action === "report-list") {
        const { data, error } = await db.from("asy_community_reports").select("id,message_id,reporter_name,reason,details,status,created_at,reviewed_by_email,reviewed_at").order("created_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json(200, { reports: data || [] });
      }
      const id = clean(body.id, 80);
      const status = clean(body.status, 20);
      if (!id || !["reviewed", "dismissed"].includes(status)) return json(400, { error: "Choose a valid report action." });
      const { data, error } = await db.from("asy_community_reports").update({ status, reviewed_by_email: user.email, reviewed_at: new Date().toISOString() }).eq("id", id).select("id").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Report not found." });
      await audit(user.email, "community.report_resolved", "community_report", id, "Staff updated a community report to " + status + ".");
      return json(200, { success: true });
    }

    if (action === "team-list") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
      let isStaff = false;
      if (token && token !== publishableKey && authClient) {
        const { data: { user } } = await authClient.auth.getUser(token);
        if (user?.email) {
          const { data } = await db.from("asy_recruitment_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
          isStaff = Boolean(data);
        }
      }
      let teamsQuery = db.from("asy_teams").select("id,name,division,description,captain_roster_id,is_active,created_at,updated_at").order("name").limit(200);
      if (!isStaff) teamsQuery = teamsQuery.eq("is_active", true);
      const { data: teams, error } = await teamsQuery;
      if (error) throw error;
      const ids = (teams || []).map((t: any) => t.id);
      let memberships: any[] = [];
      if (ids.length) {
        const { data, error: mError } = await db.from("asy_team_members").select("team_id,roster_id,team_position").in("team_id", ids);
        if (mError) throw mError;
        memberships = data || [];
      }
      const rosterIds = [...new Set(memberships.map((m: any) => m.roster_id))];
      let roster: any[] = [];
      if (rosterIds.length) {
        const { data, error: rError } = await db.from("asy_clan_roster_public").select("id,ign,main_role,rank,member_status").in("id", rosterIds);
        if (rError) throw rError;
        roster = data || [];
      }
      const result = (teams || []).map((team: any) => ({
        ...team,
        members: memberships.filter((m: any) => m.team_id === team.id).map((m: any) => ({ ...m, member: roster.find((p: any) => p.id === m.roster_id) || null })),
      }));
      return json(200, { teams: result });
    }

    if (action === "team-save") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const id = clean(body.id, 80);
      const name = clean(body.name, 80);
      const division = clean(body.division, 20) || "Casual";
      const description = clean(body.description, 1000);
      const captain = clean(body.captain_roster_id, 80) || null;
      const active = body.is_active !== false;
      if (name.length < 2 || !["Casual", "BR", "MP", "Mixed", "Academy"].includes(division)) return json(400, { error: "Enter a team name and choose a supported division." });
      if (captain) {
        const { data, error } = await db.from("asy_clan_roster").select("id").eq("id", captain).maybeSingle();
        if (error) throw error;
        if (!data) return json(400, { error: "Choose a valid roster member as captain." });
      }
      const values = { name, division, description, captain_roster_id: captain, is_active: active, updated_by_email: user.email, updated_at: new Date().toISOString() };
      let data: any; let error: any;
      if (id) {
        ({ data, error } = await db.from("asy_teams").update(values).eq("id", id).select("id,name,division,description,captain_roster_id,is_active,created_at,updated_at").maybeSingle());
      } else {
        ({ data, error } = await db.from("asy_teams").insert({ ...values, created_by_email: user.email }).select("id,name,division,description,captain_roster_id,is_active,created_at,updated_at").single());
      }
      if (error) throw error;
      if (!data) return json(404, { error: "Team was not found." });
      await audit(user.email, id ? "team.updated" : "team.created", "team", data.id, (id ? "Updated " : "Created ") + "team " + name + ".");
      return json(200, { team: data });
    }

    if (action === "team-delete") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const id = clean(body.id, 80);
      if (!id) return json(400, { error: "Team ID is required." });
      const { data, error } = await db.from("asy_teams").delete().eq("id", id).select("id,name").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Team was not found." });
      await audit(user.email, "team.deleted", "team", id, "Deleted team " + data.name + ".");
      return json(200, { success: true });
    }

    if (action === "team-member-save" || action === "team-member-remove") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const teamId = clean(body.team_id, 80);
      const rosterId = clean(body.roster_id, 80);
      if (!teamId || !rosterId) return json(400, { error: "Team and roster member are required." });
      if (action === "team-member-remove") {
        const { error } = await db.from("asy_team_members").delete().eq("team_id", teamId).eq("roster_id", rosterId);
        if (error) throw error;
        await audit(user.email, "team.member_removed", "team", teamId, "Removed a member from a team.");
        return json(200, { success: true });
      }
      const position = clean(body.team_position, 20) || "Player";
      if (!["Captain", "Player", "Substitute", "Coach"].includes(position)) return json(400, { error: "Choose a valid team position." });
      const { error } = await db.from("asy_team_members").upsert({ team_id: teamId, roster_id: rosterId, team_position: position, added_by_email: user.email }, { onConflict: "team_id,roster_id" });
      if (error) throw error;
      await audit(user.email, "team.member_added", "team", teamId, "Added a roster member to a team.");
      return json(200, { success: true });
    }

    if (action === "scrim-list") {
      const authHeader = req.headers.get("authorization") || "";
      const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1] || "";
      let isStaff = false;
      if (token && token !== publishableKey && authClient) {
        const { data: { user } } = await authClient.auth.getUser(token);
        if (user?.email) {
          const { data } = await db.from("asy_recruitment_admins").select("email").eq("email", user.email.toLowerCase()).maybeSingle();
          isStaff = Boolean(data);
        }
      }
      let query = db.from("asy_scrim_events").select("id,title,opponent,game_mode,team_id,starts_at,visibility,status,details,created_at,updated_at,asy_teams(name,division)").order("starts_at", { ascending: true }).limit(300);
      if (!isStaff) query = query.eq("visibility", "public").eq("status", "scheduled").gte("starts_at", new Date(Date.now() - 86400000).toISOString());
      const { data, error } = await query;
      if (error) {
        // Nested team relation is optional; retry without it for schema-cache delays.
        const retry = await db.from("asy_scrim_events").select("id,title,opponent,game_mode,team_id,starts_at,visibility,status,details,created_at,updated_at").order("starts_at", { ascending: true }).limit(300);
        if (retry.error) throw retry.error;
        return json(200, { events: (retry.data || []).filter((e: any) => isStaff || (e.visibility === "public" && e.status === "scheduled")) });
      }
      return json(200, { events: data || [] });
    }

    if (action === "scrim-save") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const id = clean(body.id, 80);
      const title = clean(body.title, 120);
      const opponent = clean(body.opponent, 100);
      const gameMode = clean(body.game_mode, 20) || "MP";
      const teamId = clean(body.team_id, 80) || null;
      const startsAt = clean(body.starts_at, 80);
      const visibility = clean(body.visibility, 20) || "public";
      const status = clean(body.status, 20) || "scheduled";
      const details = clean(body.details, 1000);
      const timestamp = Date.parse(startsAt);
      if (title.length < 3 || !Number.isFinite(timestamp) || timestamp < Date.now() - 60000) return json(400, { error: "Enter a title and a future date/time." });
      if (!["BR", "MP", "Mixed"].includes(gameMode) || !["public", "staff"].includes(visibility) || !["scheduled", "completed", "cancelled"].includes(status)) return json(400, { error: "Choose valid event options." });
      const values = { title, opponent, game_mode: gameMode, team_id: teamId, starts_at: new Date(timestamp).toISOString(), visibility, status, details, updated_by_email: user.email, updated_at: new Date().toISOString() };
      let data: any; let error: any;
      if (id) ({ data, error } = await db.from("asy_scrim_events").update(values).eq("id", id).select("id,title,opponent,game_mode,team_id,starts_at,visibility,status,details,created_at,updated_at").maybeSingle());
      else ({ data, error } = await db.from("asy_scrim_events").insert({ ...values, created_by_email: user.email }).select("id,title,opponent,game_mode,team_id,starts_at,visibility,status,details,created_at,updated_at").single());
      if (error) throw error;
      if (!data) return json(404, { error: "Scrim event was not found." });
      await audit(user.email, id ? "scrim.updated" : "scrim.created", "scrim_event", data.id, (id ? "Updated " : "Scheduled ") + data.title + ".");
      return json(200, { event: data });
    }

    if (action === "scrim-delete") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const id = clean(body.id, 80);
      if (!id) return json(400, { error: "Scrim ID is required." });
      const { data, error } = await db.from("asy_scrim_events").delete().eq("id", id).select("id,title").maybeSingle();
      if (error) throw error;
      if (!data) return json(404, { error: "Scrim event was not found." });
      await audit(user.email, "scrim.deleted", "scrim_event", id, "Deleted scrim event " + data.title + ".");
      return json(200, { success: true });
    }

    if (action === "attendance-save") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const eventId = clean(body.event_id, 80);
      const rosterId = clean(body.roster_id, 80);
      const status = clean(body.attendance_status, 20);
      const note = clean(body.note, 300);
      if (!eventId || !rosterId || !["pending", "going", "maybe", "declined", "attended", "absent"].includes(status)) return json(400, { error: "Choose a valid attendance status." });
      const { error } = await db.from("asy_scrim_attendance").upsert({ event_id: eventId, roster_id: rosterId, attendance_status: status, note: note || null, updated_by_email: user.email, updated_at: new Date().toISOString() }, { onConflict: "event_id,roster_id" });
      if (error) throw error;
      await audit(user.email, "scrim.attendance_updated", "scrim_event", eventId, "Updated scrim attendance.");
      return json(200, { success: true });
    }

    if (action === "backup-export") {
      const { user, response } = await requireStaff(req, canManage);
      if (response) return response;
      const [{ data: applications, error: appError }, { data: roster, error: rosterError }, { data: teams, error: teamsError }, { data: events, error: eventsError }, { data: evidence, error: evidenceError }] = await Promise.all([
        db.from("asy_clan_applications").select("*").order("submitted_at", { ascending: false }).limit(5000),
        db.from("asy_clan_roster").select("id,application_id,ign,codm_uid,main_role,rank,discord_username,member_status,joined_at").limit(2000),
        db.from("asy_teams").select("*").limit(1000),
        db.from("asy_scrim_events").select("*").limit(2000),
        db.from("asy_recruitment_evidence").select("id,application_id,requirement_key,requirement_label,stage_number,status,file_name,content_type,file_size_bytes,applicant_note,reviewer_notes,submitted_at,reviewed_at,reviewed_by_email").limit(10000),
      ]);
      if (appError || rosterError || teamsError || eventsError || evidenceError) throw appError || rosterError || teamsError || eventsError || evidenceError;
      await audit(user.email, "backup.exported", "backup", null, "Downloaded a structured recruitment data snapshot.");
      return json(200, { exported_at: new Date().toISOString(), exported_by: user.email, applications: applications || [], roster: roster || [], teams: teams || [], scrim_events: events || [], evidence_metadata: evidence || [], note: "Private screenshot contents are not included; evidence storage paths and secrets are intentionally excluded." });
    }

    return json(400, { error: "Unknown operations action." });
  } catch (error) {
    console.error("ASY operations request failed.", error);
    return json(500, { error: "The operation could not be completed. Please retry or contact an authorized administrator." });
  }
});
