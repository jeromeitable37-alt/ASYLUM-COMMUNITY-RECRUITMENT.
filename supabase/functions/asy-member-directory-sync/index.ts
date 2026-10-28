import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Cache-Control": "no-store",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const PUBLISHABLE_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn";
function getServerKey() {
  const value = Deno.env.get("SUPABASE_SECRET_KEYS");
  if (value) {
    try { const parsed = JSON.parse(value); if (parsed.default) return String(parsed.default); } catch {}
  }
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
}
const serverKey = getServerKey();
const db = SUPABASE_URL && serverKey ? createClient(SUPABASE_URL, serverKey, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const auth = SUPABASE_URL && PUBLISHABLE_KEY ? createClient(SUPABASE_URL, PUBLISHABLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } }) : null;
const SHEET_ID = "17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU";
const TABS = ["SCREENING", "REFERRALS", "TEAMS"];

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}
function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field.length === 0) quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some(value => value.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field.length || row.length) { row.push(field); if (row.some(value => value.trim() !== "")) rows.push(row); }
  return rows;
}
function headerIndex(headers: string[], phrase: string) {
  return headers.findIndex(value => value.trim().toLowerCase().includes(phrase.toLowerCase()));
}
function safeCell(row: string[], index: number) { return index >= 0 ? (row[index] || "").trim() : ""; }
function normalizeUid(raw: string) {
  const value = raw.replace(/[\s,]/g, "");
  if (/^\d{5,32}$/.test(value)) return value;
  if (/^\d+(\.\d+)?e\+\d+$/i.test(value)) {
    try { return BigInt(Number(value)).toString(); } catch { return ""; }
  }
  return "";
}
function parseTimestamp(raw: string) {
  const n = Date.parse(raw);
  return Number.isFinite(n) ? n : 0;
}
async function fetchTab(tab: string) {
  const exportUrl = "https://docs.google.com/spreadsheets/d/" + SHEET_ID + "/gviz/tq?tqx=out:csv&sheet=" + encodeURIComponent(tab);
  const response = await fetch(exportUrl, { headers: { "Accept": "text/csv,text/plain;q=0.9,*/*;q=0.8" } });
  const content = await response.text();
  if (!response.ok || /<html|accounts\.google\.com|Sign in to continue|You need access/i.test(content.slice(0, 1200))) {
    throw new Error("Google Sheet tab " + tab + " is not publicly readable. Set General access to Anyone with the link (Viewer), or use a connected Google Drive integration.");
  }
  const rows = parseCsv(content);
  if (rows.length < 2) return [];
  const headers = rows[0];
  const ignIx = headerIndex(headers, "IGN (In-Game Name");
  const uidIx = headerIndex(headers, "UID");
  const clanIx = headerIndex(headers, "Clan Name");
  const timeIx = headerIndex(headers, "Timestamp");
  if (ignIx < 0 || uidIx < 0 || clanIx < 0) throw new Error("The " + tab + " tab is missing an expected IGN, UID, or Clan Name column.");
  return rows.slice(1).map(row => {
    const ign = safeCell(row, ignIx).slice(0, 32);
    const uid = normalizeUid(safeCell(row, uidIx));
    let clan = safeCell(row, clanIx).slice(0, 120);
    if (/no clan/i.test(clan)) clan = "";
    const rawTimestamp = safeCell(row, timeIx);
    return { ign, uid, clan_name: clan || null, timestamp: parseTimestamp(rawTimestamp) };
  }).filter(item => item.ign.length >= 2 && item.uid);
}
async function requireManagement(request: Request) {
  if (!db || !auth) return { error: "Member sync service is not configured." };
  const token = (request.headers.get("authorization") || "").match(/^Bearer\s+(.+)$/i)?.[1] || "";
  if (!token || token === PUBLISHABLE_KEY) return { error: "Sign in with an authorized ASY management account before syncing." };
  const { data: { user }, error: authError } = await auth.auth.getUser(token);
  if (authError || !user?.email) return { error: "Staff session expired. Sign in again." };
  const email = user.email.trim().toLowerCase();
  const { data: admin, error } = await db.from("asy_recruitment_admins").select("email,role").eq("email", email).maybeSingle();
  if (error || !admin || !["owner", "management", "admin"].includes(String(admin.role || "").toLowerCase())) {
    return { error: "Only authorized Owner, Management, or Admin roles can sync the member directory." };
  }
  return { email, error: "" };
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json(405, { error: "Use POST to sync the member directory." });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || body.action !== "sync-directory") return json(400, { error: "Unknown member sync action." });
  if (!db) return json(503, { error: "Member sync service is not configured." });
  const actor = await requireManagement(request);
  if (actor.error) return json(403, { error: actor.error });
  try {
    const all: Array<{ign:string;uid:string;clan_name:string|null;timestamp:number}> = [];
    for (const tab of TABS) all.push(...await fetchTab(tab));
    const dedup = new Map<string, {ign:string;uid:string;clan_name:string|null;timestamp:number}>();
    for (const item of all) {
      const prior = dedup.get(item.uid);
      if (!prior || item.timestamp >= prior.timestamp) dedup.set(item.uid, item);
    }
    const incoming = Array.from(dedup.values());
    if (incoming.length < 10) return json(422, { error: "The spreadsheet returned too few valid member rows; no directory records were changed." });
    const uids = incoming.map(item => item.uid);
    const existingRows: any[] = [];
    for (let i = 0; i < uids.length; i += 200) {
      const { data, error } = await db.from("asy_clan_roster").select("id,application_id,codm_uid,ign,main_role,rank,discord_username,member_status,joined_at").in("codm_uid", uids.slice(i, i + 200)).limit(250);
      if (error) throw error;
      existingRows.push(...(data || []));
    }
    const existing = new Map(existingRows.map(row => [row.codm_uid, row]));
    const now = new Date().toISOString();
    const records = incoming.map(item => {
      const old = existing.get(item.uid);
      return old ? {
        id: old.id, application_id: old.application_id, codm_uid: item.uid, ign: item.ign,
        clan_name: item.clan_name, main_role: old.main_role, rank: old.rank,
        discord_username: old.discord_username, member_status: old.member_status,
        joined_at: old.joined_at,
      } : {
        codm_uid: item.uid, ign: item.ign, clan_name: item.clan_name,
        main_role: "Community Member", rank: "Not provided", member_status: "active",
        joined_at: item.timestamp ? new Date(item.timestamp).toISOString() : now,
      };
    });
    let upserted = 0;
    for (let i = 0; i < records.length; i += 100) {
      const { data, error } = await db.from("asy_clan_roster").upsert(records.slice(i, i + 100), { onConflict: "codm_uid" }).select("id");
      if (error) throw error;
      upserted += data?.length || records.slice(i, i + 100).length;
    }
    await db.from("asy_recruitment_audit_logs").insert({
      actor_email: actor.email, action: "directory.synced", entity_type: "member_directory",
      entity_id: SHEET_ID, summary: "Synchronized " + upserted + " members from the official Google Sheets member register.",
    });
    return json(200, {
      success: true, rows_seen: all.length, unique_members: incoming.length, records_upserted: upserted,
      duplicate_uids_merged: all.length - incoming.length, existing_records: existing.size,
      private_fields_excluded: ["birthdate", "Facebook name/link", "TikTok link", "Streamer Mode ID", "Discord username"],
      message: "Only IGN, CODM UID (stored privately for matching), and clan name were used. Existing role/rank/status values were preserved, and missing rank/role values were not invented beyond the neutral Community Member label."
    });
  } catch (error) {
    console.error("ASY member directory sync failed.", error);
    return json(502, { error: error instanceof Error ? error.message : "Could not read the official Google Sheet. Check sharing access and try again." });
  }
});
