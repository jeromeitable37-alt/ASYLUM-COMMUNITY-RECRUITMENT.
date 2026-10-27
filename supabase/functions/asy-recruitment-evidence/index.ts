import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Cache-Control": "no-store",
};

const BUCKET = "asy-recruitment-private";
const MAX_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};
const STAGE_BY_STEP: Record<string, number> = {
  tag_proofs: 1,
  membership_proofs: 2,
  discord_roster: 3,
};

const requestCounts = new Map<string, { count: number; resetAt: number }>();
function limited(ip: string) {
  const now = Date.now();
  const current = requestCounts.get(ip);
  if (!current || current.resetAt <= now) {
    requestCounts.set(ip, { count: 1, resetAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 30;
}

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function safeFilename(value: string) {
  return value.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120) || "evidence";
}

function getSupabaseSecretKey() {
  const keySet = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (keySet) {
    try {
      const parsed = JSON.parse(keySet);
      if (typeof parsed.default === "string" && parsed.default) return parsed.default;
    } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SECRET_KEY = getSupabaseSecretKey();
const client = SUPABASE_URL && SUPABASE_SECRET_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SECRET_KEY, {
      auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    })
  : null;

async function findApplication(code: string, email: string) {
  if (!client) return null;
  const { data, error } = await client
    .from("asy_clan_applications")
    .select("id, application_code, ign, contact_email, status, workflow_step, application_type, workflow_enabled, submitted_at")
    .eq("application_code", code.toUpperCase())
    .eq("contact_email", email.toLowerCase())
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!client) return json(503, { error: "Private screening uploads are not configured on the server." });

  const forwardedFor = req.headers.get("x-forwarded-for") || "unknown";
  const ip = forwardedFor.split(",")[0].trim().slice(0, 80);
  if (limited(ip)) return json(429, { error: "Too many requests. Please wait a moment and try again." });

  try {
    if (req.method === "GET") {
      const url = new URL(req.url);
      const code = (url.searchParams.get("application_code") || "").trim();
      const email = (url.searchParams.get("contact_email") || "").trim();
      if (!code || !email || code.length > 80 || email.length > 254) {
        return json(400, { error: "Tracking code and application email are required." });
      }
      const application = await findApplication(code, email);
      if (!application) return json(404, { error: "Application not found. Check your tracking code and email." });
      if (!application.workflow_enabled) return json(409, { workflow_enabled: false, error: "This application uses the previous review flow." });
      const { data: evidence, error } = await client
        .from("asy_recruitment_evidence")
        .select("requirement_key, requirement_label, stage_number, status, file_name, applicant_note, reviewer_notes, submitted_at, reviewed_at")
        .eq("application_id", application.id)
        .order("stage_number")
        .order("requirement_label");
      if (error) throw error;
      return json(200, {
        configured: true,
        application: {
          application_code: application.application_code,
          ign: application.ign,
          status: application.status,
          workflow_step: application.workflow_step,
          application_type: application.application_type,
          submitted_at: application.submitted_at,
        },
        evidence: evidence || [],
      });
    }

    if (req.method !== "POST") {
      return json(405, { error: "Method not allowed." });
    }
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    if (!body) return json(400, { error: "Invalid request body." });
    const action = body.action;
    const code = typeof body.application_code === "string" ? body.application_code.trim() : "";
    const email = typeof body.contact_email === "string" ? body.contact_email.trim() : "";
    const key = typeof body.requirement_key === "string" ? body.requirement_key.trim() : "";
    if (!code || !email || !key || code.length > 80 || email.length > 254 || key.length > 100) {
      return json(400, { error: "Tracking code, application email, and requirement are required." });
    }
    const application = await findApplication(code, email);
    if (!application) return json(404, { error: "Application not found. Check your tracking code and email." });
    if (!application.workflow_enabled) return json(409, { error: "This application does not use the new step-by-step workflow." });
    if (["rejected", "waitlisted", "accepted"].includes(application.status) || application.workflow_step === "complete") {
      return json(409, { error: "This application is not open for requirement uploads." });
    }
    const { data: requirement, error: requirementError } = await client
      .from("asy_recruitment_evidence")
      .select("id, requirement_key, stage_number, status")
      .eq("application_id", application.id)
      .eq("requirement_key", key)
      .maybeSingle();
    if (requirementError || !requirement) return json(404, { error: "This requirement was not found for your application." });
    const activeStage = STAGE_BY_STEP[application.workflow_step];
    if (!activeStage || activeStage !== requirement.stage_number || requirement.status === "locked") {
      return json(409, { error: "This step is locked until a recruiter approves the previous step." });
    }
    if (["pending", "approved"].includes(requirement.status)) {
      return json(409, { error: "This requirement is already submitted or approved. Wait for recruiter review." });
    }

    if (action === "create-upload") {
      const contentType = typeof body.content_type === "string" ? body.content_type : "";
      const size = Number(body.file_size_bytes);
      const extension = ALLOWED_TYPES[contentType];
      if (!extension) return json(415, { error: "Upload a JPG, PNG, or WEBP screenshot only." });
      if (!Number.isFinite(size) || size < 1 || size > MAX_BYTES) {
        return json(413, { error: "Each screenshot must be 8 MB or smaller." });
      }
      const path = application.id + "/" + key + "-" + crypto.randomUUID() + "." + extension;
      const { data, error } = await client.storage.from(BUCKET).createSignedUploadUrl(path, { upsert: false });
      if (error || !data?.token) {
        console.error("Could not create signed evidence upload URL.", error?.message);
        return json(500, { error: "Could not create a private upload link. Please retry." });
      }
      return json(200, { configured: true, path, token: data.token, content_type: contentType, file_size_bytes: size });
    }

    if (action === "finalize-upload") {
      const path = typeof body.path === "string" ? body.path : "";
      const contentType = typeof body.content_type === "string" ? body.content_type : "";
      const size = Number(body.file_size_bytes);
      const rawName = typeof body.file_name === "string" ? body.file_name : "evidence";
      const extension = ALLOWED_TYPES[contentType];
      if (!extension) return json(415, { error: "Upload a JPG, PNG, or WEBP screenshot only." });
      if (!Number.isFinite(size) || size < 1 || size > MAX_BYTES) return json(413, { error: "Each screenshot must be 8 MB or smaller." });
      const prefix = application.id + "/" + key + "-";
      if (!path.startsWith(prefix) || !path.endsWith("." + extension)) {
        return json(400, { error: "The upload reference does not match this application requirement." });
      }
      const basename = path.slice((application.id + "/").length);
      const { data: objects, error: listError } = await client.storage.from(BUCKET).list(application.id, { search: basename, limit: 100 });
      if (listError || !objects?.some((object) => object.name === basename)) {
        return json(400, { error: "The screenshot upload could not be verified. Please upload it again." });
      }
      const { data: saved, error } = await client
        .from("asy_recruitment_evidence")
        .update({
          storage_path: path,
          file_name: safeFilename(rawName),
          content_type: contentType,
          file_size_bytes: size,
          status: "pending",
          submitted_at: new Date().toISOString(),
          applicant_note: null,
          reviewer_notes: null,
          reviewed_at: null,
          reviewed_by_email: null,
          updated_at: new Date().toISOString(),
        })
        .eq("application_id", application.id)
        .eq("requirement_key", key)
        .in("status", ["not_submitted", "needs_correction"])
        .select("requirement_key, status, file_name, submitted_at")
        .maybeSingle();
      if (error || !saved) return json(409, { error: "This requirement changed while uploading. Refresh progress and try again." });
      return json(200, { configured: true, evidence: saved });
    }
    return json(400, { error: "Unknown evidence action." });
  } catch (error) {
    console.error("ASY recruitment evidence handler failed.", error);
    return json(500, { error: "The screening service is temporarily unavailable. Please retry." });
  }
});
