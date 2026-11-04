import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
function getPublishableKey(){
  const obj=Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if(obj){try{return String(JSON.parse(obj).default||"");}catch{}}
  return Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"";
}
function getServerKey(){
  const obj=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(obj){try{return String(JSON.parse(obj).default||"");}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const publishableKey=getPublishableKey();
const serverKey=getServerKey();
const db=SUPABASE_URL&&serverKey?createClient(SUPABASE_URL,serverKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const auth=SUPABASE_URL&&publishableKey?createClient(SUPABASE_URL,publishableKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const WEBAPP_URL="https://script.google.com/macros/s/AKfycbzf9DwgJl-Sa9cVWyvpYPWKWTTqlXTTgAK_-WhAT6nMgbmHhcteTwHDUVx2Uv1Lw46m/exec";
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"no-store",
};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const token=()=>Deno.env.get("ASY_CASUAL_SYNC_TOKEN")||"";
const text=(value:unknown)=>String(value??"").trim();
type AppsReply={
 ok?:boolean;mode?:string;action?:string;row?:number;error?:string;access?:string;
 version?:string;directory_count?:number;records?:unknown[];count?:number;removed?:boolean;not_found?:boolean
};
type RecruitRecord={
 id:string;application_type:string;application_code:string;contact_email:string;submitted_at:string;
 applicant_facebook_name:string|null;applicant_birthdate:string|null;applicant_clan_name:string|null;
 applicant_facebook_url:string|null;applicant_tiktok_url:string|null;ign:string;codm_uid:string;
 streamer_mode_id:string|null;discord_username:string|null;status:string;workflow_enabled:boolean
};
async function callAppsScript(payload:Record<string,unknown>):Promise<AppsReply>{
  const response=await fetch(WEBAPP_URL,{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({token:token(),...payload}),redirect:"follow",signal:AbortSignal.timeout(18000)
  });
  const raw=await response.text();
  let result:AppsReply;
  try{result=JSON.parse(raw);}catch{throw Error("Apps Script returned non-JSON. Verify its deployed code and web app permissions.");}
  if(!response.ok||result.ok!==true)throw Error(result.error||"Apps Script rejected the request.");
  return result;
}
async function checkStaff(req:Request){
  if(!db||!auth)return false;
  const match=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if(!match||match[1]===publishableKey)return false;
  const {data:{user},error}=await auth.auth.getUser(match[1]);
  if(error||!user?.email)return false;
  const {data:staff,error:roleError}=await db.from("asy_recruitment_admins")
    .select("email").eq("email",user.email.trim().toLowerCase()).maybeSingle();
  return !roleError&&Boolean(staff);
}
async function checkManagement(req:Request){
  if(!db||!auth)return false;
  const accessToken=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if(!accessToken||accessToken===publishableKey)return false;
  const {data:{user},error}=await auth.auth.getUser(accessToken);
  if(error||!user?.email)return false;
  const {data:staff,error:roleError}=await db.from("asy_recruitment_admins")
    .select("role").eq("email",user.email.trim().toLowerCase()).maybeSingle();
  return !roleError&&Boolean(staff&&["owner","management","admin"].includes(
    String(staff.role||"").trim().toLowerCase()));
}
async function isLiveEnabled(){
  if(!db)throw Error("Service not configured.");
  const {data,error}=await db.from("asy_recruitment_settings")
    .select("casual_sheet_live_enabled").eq("id",1).single();
  if(error)throw Error("Could not read Casual sync settings.");
  return data.casual_sheet_live_enabled===true;
}
type RejectedDirect={id:string;application_code:string;application_type:string;status:string};
async function removeRejectedFromSheet(row:RejectedDirect){
  if(!db)throw Error("Database service unavailable.");
  if(row.status!=="rejected"||row.application_type!=="casual")
    throw Error("Only rejected Direct applications may be removed from SCREENING.");
  if(!/^ASYLUM-[A-Z0-9]{8}$/.test(row.application_code))
    throw Error("Invalid website Direct application code.");
  const {data:queue,error:queueReadError}=await db.from("asy_casual_sheet_sync")
    .select("status,attempts").eq("application_id",row.id).maybeSingle();
  if(queueReadError)throw Error("Could not inspect private removal queue.");
  if(queue?.status==="removed")
    return {ok:true,already_removed:true};

  // Keep application history in Supabase. Only the exact website-code row
  // from SCREENING can be deleted, never Google Form rows or other tabs.
  const now=new Date().toISOString();
  try{
    if(!await isLiveEnabled())throw Error("Live Sheets sync is disabled.");
    const health=await callAppsScript({action:"casual_health"});
    if(health.mode!=="live"||health.access!=="restricted")
      throw Error("Google Sheet is not confirmed private and LIVE.");
    const result=await callAppsScript({
      action:"casual_delete",application_code:row.application_code
    });
    if(result.mode!=="live"||(!result.removed&&!result.not_found))
      throw Error("Apps Script did not acknowledge Direct row removal.");
    const {error}=await db.from("asy_casual_sheet_sync").upsert({
      application_id:row.id,status:"removed",
      attempts:(queue?.attempts||0)+1,last_attempt_at:now,
      last_error:null,updated_at:now
    },{onConflict:"application_id"});
    if(error)throw Error("Google deletion succeeded but queue acknowledgment failed.");
    return {ok:true,removed:result.removed===true,already_missing:result.not_found===true};
  }catch(error){
    const reason=error instanceof Error?error.message:"Google Sheet rejection cleanup failed.";
    await db.from("asy_casual_sheet_sync").upsert({
      application_id:row.id,status:"remove_pending",
      attempts:(queue?.attempts||0)+1,last_attempt_at:now,
      last_error:reason.slice(0,170),updated_at:now
    },{onConflict:"application_id"});
    throw error;
  }
}
async function performSync(row:RecruitRecord){
  if(!db)throw Error("Database service unavailable.");
  if(row.status==="rejected")
    throw Error("A rejected Direct application cannot be re-synced.");
  const {data:beforeSend,error:beforeError}=await db.from("asy_clan_applications")
    .select("status").eq("id",row.id).single();
  if(beforeError||!beforeSend||beforeSend.status==="rejected")
    throw Error("Direct application is no longer eligible for SCREENING sync.");
  const {data:queue,error:qerr}=await db.from("asy_casual_sheet_sync")
    .select("application_id,status,attempts").eq("application_id",row.id).maybeSingle();
  if(qerr)throw Error("Could not read sync queue.");
  if(queue?.status==="synced")return {ok:true,already_synced:true};
  if(token().length<32)throw Error("Server secret is missing.");
  // Before transferring ANY real birthdate, require Apps Script v2 with confirmed live mode
  // and a restricted (not anyone-with-link) destination spreadsheet.
  const health=await callAppsScript({action:"casual_health"});
  if(health.mode!=="live"||health.access!=="restricted")
    throw Error("Live Apps Script deployment is not yet approved/restricted.");
  const result=await callAppsScript({
    action:"casual_upsert",application_type:"casual",application_code:row.application_code,
    submitted_at:row.submitted_at,
    applicant:{
      facebook_name:row.applicant_facebook_name||"",
      birthdate:row.applicant_birthdate||"",
      facebook_url:row.applicant_facebook_url||"",
      tiktok_url:row.applicant_tiktok_url||"",
      ign:row.ign,codm_uid:row.codm_uid,
      streamer_mode_id:row.streamer_mode_id||"",
      clan_name:row.applicant_clan_name||"",
      discord_username:row.discord_username||"",
      version:""
    }
  });
  if(result.mode!=="live"||!Number.isInteger(result.row)||Number(result.row)<2)
    throw Error("Apps Script did not confirm a verified live SCREENING row.");
  const {data:afterSend,error:afterError}=await db.from("asy_clan_applications")
    .select("status").eq("id",row.id).single();
  if(afterError||!afterSend)throw Error("Could not recheck Direct application status after transfer.");
  if(afterSend.status==="rejected"){
    await removeRejectedFromSheet({...row,status:"rejected"});
    return {ok:true,rejected_removed:true};
  }
  const savedAt=new Date().toISOString();
  // If a concurrent rejection queued removal, never overwrite that queue
  // with "synced". The rejection cleanup will own the final state.
  const {data:saved,error:saveError}=await db.from("asy_casual_sheet_sync").update({
    status:"synced",attempts:(queue?.attempts||0)+1,
    synced_at:savedAt,last_attempt_at:savedAt,
    last_error:null,updated_at:savedAt
  }).eq("application_id",row.id)
    .in("status",["pending","failed","synced"])
    .select("application_id").maybeSingle();
  if(saveError)throw Error("Sync sent; database could not save acknowledgement.");
  if(!saved){
    const {data:latest}=await db.from("asy_clan_applications")
      .select("status").eq("id",row.id).maybeSingle();
    if(latest?.status==="rejected"){
      await removeRejectedFromSheet({...row,status:"rejected"});
      return {ok:true,rejected_removed:true};
    }
    throw Error("Direct Sheet sync queue changed during transfer.");
  }
  return {ok:true,synced:true,action:result.action,row:result.row};
}
// During pilot mode we write ONLY synthetic markers to the test tab.
// No applicant name, UID, birthdate, email, actual tracking code, or links are
// transmitted to the link-shared spreadsheet. Real data stays in Supabase.
async function performSafeWebsiteTest(row:RecruitRecord){
  if(!db)throw Error("Database service unavailable.");
  if(token().length<32)throw Error("The server's Apps Script token is not configured.");
  const {data:queue,error:qerr}=await db.from("asy_casual_sheet_sync")
    .select("test_synced_at,test_sheet_row,test_attempts,test_last_attempt_at")
    .eq("application_id",row.id).maybeSingle();
  if(qerr)throw Error("Could not read the private Casual sync queue.");
  if(queue?.test_synced_at)return {
    ok:true,mode:"test_only",website_test_synced:true,already_tested:true,
    destination:"WEBSITE_CASUAL_TEST",row:queue.test_sheet_row
  };
  const now=new Date();
  if(queue?.test_last_attempt_at&&now.getTime()-new Date(queue.test_last_attempt_at).getTime()<15000)
    return {ok:true,mode:"test_only",queued:true,retry_later:true,message:"Website test already in progress; reload tracking shortly."};

  // The deterministic HMAC is stable across retries, but cannot be linked back
  // to the private applicant tracking code by Sheet viewers.
  const key=await crypto.subtle.importKey(
    "raw",new TextEncoder().encode(token()),
    {name:"HMAC",hash:"SHA-256"},false,["sign"]);
  const signature=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode("website-casual-pilot:"+row.id));
  const testCode="ASYLUM-"+Array.from(new Uint8Array(signature).slice(0,9),
    b=>b.toString(16).padStart(2,"0")).join("").toUpperCase();

  // Never overwrite the real production queue status while recording a test.
  const {error:seedError}=await db.from("asy_casual_sheet_sync")
    .upsert({application_id:row.id},{onConflict:"application_id",ignoreDuplicates:true});
  if(seedError)throw Error("Could not initialize website test queue.");
  const {error:queueError}=await db.from("asy_casual_sheet_sync").update({
    test_last_attempt_at:now.toISOString(),
    test_attempts:(queue?.test_attempts||0)+1,
    test_last_error:null,updated_at:now.toISOString()
  }).eq("application_id",row.id);
  if(queueError)throw Error("Could not queue website test.");

  try{
    const health=await callAppsScript({action:"casual_health"});
    if(health.mode!=="test")throw Error("Website test requires Apps Script TEST mode.");
    const result=await callAppsScript({
      action:"casual_upsert",application_type:"casual",
      application_code:testCode,submitted_at:"2026-11-04T00:00:00.000Z",
      applicant:{
        facebook_name:"WEBSITE TEST - NO PERSONAL DATA",
        birthdate:"2000-01-01",
        facebook_url:"https://www.facebook.com/example",
        tiktok_url:"https://www.tiktok.com/@example",
        ign:"WEBTEST",codm_uid:"1234567890123456789",
        streamer_mode_id:"WEBTEST",clan_name:"NO CLAN",
        discord_username:"website_test",version:"WEBSITE TEST ONLY"
      }
    });
    if(result.mode!=="test"||!Number.isInteger(result.row)||Number(result.row)<2)
      throw Error("Apps Script did not acknowledge a test-only row.");
    const {error:saveError}=await db.from("asy_casual_sheet_sync").update({
      test_synced_at:new Date().toISOString(),test_sheet_row:result.row,
      test_last_error:null,updated_at:new Date().toISOString()
    }).eq("application_id",row.id);
    if(saveError)throw Error("Test row written; Supabase could not record acknowledgment.");
    return {
      ok:true,mode:"test_only",website_test_synced:true,
      action:result.action,row:result.row,destination:"WEBSITE_CASUAL_TEST",
      message:"Website-to-Supabase-to-Google-Sheets pilot confirmed using a synthetic row. No personal applicant information was transferred."
    };
  }catch(error){
    const reason=error instanceof Error?error.message:"Website test temporarily unavailable.";
    await db.from("asy_casual_sheet_sync").update({
      test_last_error:reason.slice(0,180),updated_at:new Date().toISOString()
    }).eq("application_id",row.id);
    throw error;
  }
}
async function handleApplicantSync(body:Record<string,unknown>){
  if(!db)return json(503,{ok:false,error:"Sheet service unavailable."});
  const code=text(body.application_code).toUpperCase();
  const email=text(body.contact_email).toLowerCase();
  if(!/^ASYLUM-[A-Z0-9]{8}$/.test(code)||email.length<5||email.length>254||
     !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
    return json(400,{ok:false,error:"Invalid application reference."});
  const {data,error}=await db.from("asy_clan_applications")
    .select("id,application_type,application_code,contact_email,submitted_at,applicant_facebook_name,applicant_birthdate,applicant_clan_name,applicant_facebook_url,applicant_tiktok_url,ign,codm_uid,streamer_mode_id,discord_username,status,workflow_enabled")
    .eq("application_code",code).eq("contact_email",email).maybeSingle();
  if(error||!data||data.application_type!=="casual"||!data.workflow_enabled||data.status==="rejected")
    return json(404,{ok:false,error:"No matching Direct application."});
  if(!data.applicant_facebook_name||!data.applicant_birthdate||!data.applicant_clan_name)
    return json(409,{ok:false,error:"Your Direct application is missing the original form details. Ask a recruiter to correct it."});
  let liveAttempted=false;
  try{
    liveAttempted=await isLiveEnabled();
    if(!liveAttempted){
      // This is a synthetic end-to-end test only. No applicant PII leaves Supabase.
      const test=await performSafeWebsiteTest(data as RecruitRecord);
      return json(200,test);
    }
    const result=await performSync(data as RecruitRecord);
    return json(200,result);
  }catch(error){
    // A failed test must not mark the real production sync failed.
    const message=error instanceof Error?error.message:"Sync temporarily unavailable.";
    if(liveAttempted){
      await db.from("asy_casual_sheet_sync").update({
        status:"failed",last_error:message.slice(0,200),last_attempt_at:new Date().toISOString(),
        updated_at:new Date().toISOString()
      }).eq("application_id",data.id).in("status",["pending","failed"]);
    }
    console.error("Casual sync failed:",message);
    return json(503,{ok:false,error:"Application saved, but Google Sheet sync is pending recruiter follow-up."});
  }
}
// Production activation does not write real data until the authenticated
// Apps Script has removed link-wide spreadsheet sharing and confirmed private
// directory access. This intentionally requires a management role.
async function activateLive(req:Request){
  if(!db)return json(503,{ok:false,error:"Database service unavailable."});
  if(!await checkManagement(req))
    return json(403,{ok:false,error:"Only Owner, Management, or Admin may enable live sync."});
  try{
    const health=await callAppsScript({action:"casual_health"});
    if(health.version!=="secure-v3")
      return json(409,{ok:false,error:"Deploy the latest Code.gs containing the secure directory bridge and Go Live action first. The current deployment is still test-only."});
    const directory=await callAppsScript({action:"casual_directory"});
    if(directory.version!=="secure-v3"||!Array.isArray(directory.records)||directory.records.length<10)
      return json(409,{ok:false,error:"The private member-directory bridge was not verified; real sync remains OFF."});
    const go=await callAppsScript({action:"casual_go_live"});
    if(go.mode!=="live"||go.access!=="restricted")
      throw Error("Google did not confirm restricted LIVE mode.");
    const verified=await callAppsScript({action:"casual_health"});
    if(verified.mode!=="live"||verified.access!=="restricted"||verified.version!=="secure-v3")
      throw Error("Google Sheet privacy verification failed after activation.");
    const {error}=await db.from("asy_recruitment_settings")
      .update({casual_sheet_live_enabled:true}).eq("id",1);
    if(error)throw Error("Google Sheet is private, but Supabase could not enable auto-sync. Retry activation.");
    let backfillSynced=0,backfillFailed=0;
    try{
      // Existing Direct applications are transferred immediately after the
      // privacy gate opens. Failed rows remain queued for staff retry.
      const backfill=await syncPending(req);
      const result=await backfill.json() as {synced?:number;failed?:number};
      backfillSynced=result.synced||0;
      backfillFailed=result.failed||0;
    }catch(error){
      console.error("Production activation completed; backfill needs retry.",
        error instanceof Error?error.message:"Backfill unavailable");
    }
    const {count}=await db.from("asy_casual_sheet_sync").select("application_id",{head:true,count:"exact"})
      .neq("status","synced");
    return json(200,{
      ok:true,live_sync_enabled:true,sheet_access:"restricted",backfill_synced:backfillSynced,
      backfill_failed:backfillFailed,
      directory_bridge:"private",pending_sync_count:count??0,
      message:"SCREENING live sync is ON and the Sheet is private. Existing Direct backfill synced "+
        backfillSynced+" application(s)."+(backfillFailed?" Some rows require retry.":"")
    });
  }catch(error){
    const msg=error instanceof Error?error.message:"Production activation failed.";
    console.error("Casual Go Live failed:",msg);
    return json(503,{ok:false,error:"Production activation did not finish: "+msg.slice(0,180)});
  }
}
async function syncPending(req:Request){
  if(!db)return json(503,{ok:false,error:"Database service unavailable."});
  if(!await checkManagement(req))
    return json(403,{ok:false,error:"Only Owner, Management, or Admin may backfill Direct applications."});
  if(!await isLiveEnabled())
    return json(409,{ok:false,error:"Production transfer is not enabled yet."});
  const health=await callAppsScript({action:"casual_health"});
  if(health.mode!=="live"||health.access!=="restricted"||health.version!=="secure-v3")
    return json(409,{ok:false,error:"Private LIVE Apps Script is not verified."});
  const {data,error}=await db.from("asy_clan_applications")
    .select("id,application_type,application_code,contact_email,submitted_at,applicant_facebook_name,applicant_birthdate,applicant_clan_name,applicant_facebook_url,applicant_tiktok_url,ign,codm_uid,streamer_mode_id,discord_username,status,workflow_enabled")
    .eq("application_type","casual").eq("workflow_enabled",true)
    .neq("status","rejected").order("submitted_at",{ascending:true}).limit(40);
  if(error)return json(503,{ok:false,error:"Could not read pending Direct applications."});
  let synced=0,skipped=0,failed=0;const errors:string[]=[];
  // Process at most five new writes per request to avoid Apps Script timeouts.
  for(const row of data||[]){
    const {data:queue}=await db.from("asy_casual_sheet_sync")
      .select("status").eq("application_id",row.id).maybeSingle();
    if(queue?.status==="synced"){skipped++;continue;}
    try{
      await performSync(row as RecruitRecord);
      synced++;
    }catch(error){
      failed++;
      const msg=error instanceof Error?error.message:"Sync failed";
      errors.push(msg.slice(0,120));
      console.error("Backfill Direct sync failed:",msg);
    }
    if(synced+failed>=5)break;
  }
  const {count:remaining}=await db.from("asy_casual_sheet_sync")
    .select("application_id",{head:true,count:"exact"}).neq("status","synced");
  return json(200,{
    ok:true,synced,already_synced:skipped,failed,
    pending_sync_count:remaining??0,
    message:"SCREENING backfill processed "+synced+" Direct application(s)."+
      (failed?" Some records still need review.":"")+
      (remaining?" Use Sync pending again if required.":" All queued rows are acknowledged."),
    errors:errors.length?["Some rows could not be synced. See server logs."]:undefined
  });
}
// Safe to call repeatedly. Queued removal is committed by a database
// trigger as soon as a Direct application is rejected, including tryout rejects.
async function reconcileRejected(req:Request){
  if(!db)return json(503,{ok:false,error:"Sync service unavailable."});
  if(!await checkStaff(req))
    return json(403,{ok:false,error:"Authorized recruiter sign-in required."});
  const {data:queued,error}=await db.from("asy_casual_sheet_sync")
    .select("application_id").eq("status","remove_pending")
    .order("updated_at",{ascending:true}).limit(8);
  if(error)return json(503,{ok:false,error:"Could not inspect pending Sheet cleanup."});
  let removed=0,missing=0,failed=0,skipped=0;
  for(const item of queued||[]){
    const {data:app,error:lookupError}=await db.from("asy_clan_applications")
      .select("id,application_code,application_type,status")
      .eq("id",item.application_id).maybeSingle();
    if(lookupError||!app||app.status!=="rejected"||app.application_type!=="casual"){
      skipped++;continue;
    }
    try{
      const result=await removeRejectedFromSheet(app as RejectedDirect);
      if(result.removed)removed++;
      else missing++;
    }catch(error){
      failed++;
      // Avoid logging applicant codes, emails or Google personal data.
      console.error("Automatic rejected Direct cleanup pending:",
        error instanceof Error?error.message:"Google cleanup unavailable");
    }
  }
  const {count:remaining}=await db.from("asy_casual_sheet_sync")
    .select("application_id",{head:true,count:"exact"}).eq("status","remove_pending");
  return json(200,{
    ok:true,removed,already_missing:missing,skipped,failed,pending:remaining??0,
    message:failed?"Rejected application saved; Google cleanup will retry automatically.":
      "Rejected Direct SCREENING row cleanup completed."
  });
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json(405,{ok:false,error:"POST only."});
  const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
  if(!body)return json(400,{ok:false,error:"JSON body required."});
  if(body.action==="sync-submission")return handleApplicantSync(body);
  if(body.action==="sync-rejections")return reconcileRejected(req);
  if(body.action==="activate-live")return activateLive(req);
  if(body.action==="sync-pending")return syncPending(req);
  if(!await checkStaff(req))return json(403,{ok:false,error:"Authorized recruiter sign-in required."});
  if(body.action==="status"){
    let liveEnabled=false;
    try{liveEnabled=await isLiveEnabled();}catch{}
    const hasSecret=token().length>=32;
    let scriptState:"updated"|"legacy_test"|"not_authorized"|"sheet_permission"|"non_json"|"unavailable"|"unexpected_response"|"missing_secret"="missing_secret";
    let scriptMode:"test"|"live"|"unknown"="unknown";
    let sheetAccess:"restricted"|"link-shared"|"unknown"="unknown";
    let secureScriptVersion=false;
    if(hasSecret){
      try{
        const health=await callAppsScript({action:"casual_health"});
        if((health.mode==="test"||health.mode==="live") &&
           (health.access==="restricted"||health.access==="link-shared")){
          secureScriptVersion=health.version==="secure-v3";
          scriptState="updated";
          scriptMode=health.mode;
          sheetAccess=health.access;
        }else{
          scriptState="unexpected_response";
        }
      }catch(error){
        // Return only a categorical diagnosis to staff; never echo secrets, raw HTML,
        // spreadsheet data, OAuth metadata, or untrusted error strings.
        const detail=error instanceof Error?error.message.toLowerCase():"";
        if(/invalid route|unsupported action|unknown action/.test(detail))
          scriptState="legacy_test";
        else if(/not authorized|unauthorized|invalid token|invalid secret/.test(detail))
          scriptState="not_authorized";
        else if(/permission|access denied|authorization is required|oauth|scope|not have access/.test(detail))
          scriptState="sheet_permission";
        else if(/non-json/.test(detail))
          scriptState="non_json";
        else scriptState="unavailable";
      }
    }
    const staffMessage:Record<string,string>={
      updated:scriptMode==="test"?
        "Updated Apps Script verified in TEST mode. Live transfer remains OFF.":
        "Updated Apps Script verified in LIVE mode; Supabase live switch is independently controlled.",
      legacy_test:"The deployed Apps Script responds, but does not recognize the new health-check action. The earlier DEMO version can still work. To enable live sync, deploy the latest Code.gs that contains casual_health; this is not a token failure.",
      not_authorized:"Apps Script rejected the health token. Confirm both Script Properties and Supabase share the exact same ASY_CASUAL_SYNC_TOKEN.",
      sheet_permission:"Apps Script cannot check Google Drive/Sheet permissions. The deploying Google account may need to authorize DriveApp or have Editor access to the spreadsheet.",
      non_json:"Apps Script returned a Google sign-in, authorization, or HTML response instead of JSON. Check web-app Execute as Me and deployment access.",
      unavailable:"Apps Script health check did not complete. Could be network timeout or a script exception; inspect Apps Script Executions.",
      unexpected_response:"The Apps Script response lacks the new mode/access fields. Confirm that the deployed Code.gs has the casual_health handler.",
      missing_secret:"Supabase has no valid 32+ character ASY_CASUAL_SYNC_TOKEN."
    };
    const {count:websiteTestCount}=db
      ? await db.from("asy_casual_sheet_sync").select("application_id",{head:true,count:"exact"})
        .not("test_synced_at","is",null)
      : {count:null};
    return json(200,{
      website_test_count:websiteTestCount??0,secure_script_ready:secureScriptVersion,
      ok:true,mode:"casual_test_only",webhook_url_configured:true,
      secret_configured:hasSecret,destination:"WEBSITE_CASUAL_TEST",
      live_sync_enabled:liveEnabled,script_state:scriptState,
      script_mode:scriptMode,sheet_access:sheetAccess,
      missing_website_fields:[],message:staffMessage[scriptState]
    });
  }
  if(body.action==="pilot-test"){
    if(token().length<32)return json(503,{ok:false,error:"Set matching ASY_CASUAL_SYNC_TOKEN in Supabase and Apps Script."});
    try{
      const result=await callAppsScript({
        action:"casual_upsert",application_type:"casual",
        application_code:"ASYLUM-PILOT20261104",submitted_at:"2026-11-04T00:00:00.000Z",
        applicant:{
          facebook_name:"PILOT DEMO - NOT A REAL APPLICANT",
          birthdate:"2000-01-01",facebook_url:"https://www.facebook.com/example",
          tiktok_url:"https://www.tiktok.com/@example",ign:"PILOTTEST",
          codm_uid:"1234567890123456789",streamer_mode_id:"TEST",
          clan_name:"NO CLAN",discord_username:"pilot_test",version:"PILOT TEST"
        }
      });
      if(result.mode!=="test")throw Error("Demo testing is allowed only while Apps Script targets WEBSITE_CASUAL_TEST.");
      return json(200,{ok:true,mode:"casual_test_only",destination:"WEBSITE_CASUAL_TEST",action:result.action,row:result.row});
    }catch(error){
      return json(502,{ok:false,error:error instanceof Error?error.message:"Demo failed."});
    }
  }
  return json(400,{ok:false,error:"Unsupported action."});
});