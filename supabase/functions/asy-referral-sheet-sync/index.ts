import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

// Referral synchronization is deliberately separate from the working Direct
// connector. Both use the existing private Google Apps Script deployment.
const URL=Deno.env.get("SUPABASE_URL")||"";
const getDefault=(key:string,legacy:string)=>{
  const raw=Deno.env.get(key);
  if(raw){try{return String(JSON.parse(raw).default||"");}catch{}}
  return Deno.env.get(legacy)||"";
};
const publicKey=getDefault("SUPABASE_PUBLISHABLE_KEYS","SUPABASE_PUBLISHABLE_KEY")
  ||Deno.env.get("SUPABASE_ANON_KEY")||"";
const privateKey=getDefault("SUPABASE_SECRET_KEYS","SUPABASE_SERVICE_ROLE_KEY");
const db=URL&&privateKey?createClient(URL,privateKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const userClient=URL&&publicKey?createClient(URL,publicKey,{auth:{persistSession:false,autoRefreshToken:false}}):null;
const scriptUrl="https://script.google.com/macros/s/AKfycbzf9DwgJl-Sa9cVWyvpYPWKWTTqlXTTgAK_-WhAT6nMgbmHhcteTwHDUVx2Uv1Lw46m/exec";
const secret=()=>Deno.env.get("ASY_CASUAL_SYNC_TOKEN")||"";
const cors={
 "Access-Control-Allow-Origin":"*",
 "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
 "Access-Control-Allow-Methods":"POST,OPTIONS",
 "Cache-Control":"no-store"
};
const json=(status:number,body:Record<string,unknown>)=>new Response(JSON.stringify(body),
 {status,headers:{...cors,"Content-Type":"application/json"}});
type ReferralRow={
 id:string;application_code:string;contact_email:string;application_type:string;
 status:string;workflow_enabled:boolean;submitted_at:string;
 applicant_facebook_name:string|null;applicant_birthdate:string|null;
 applicant_facebook_url:string|null;applicant_tiktok_url:string|null;
 applicant_clan_name:string|null;ign:string;codm_uid:string;
 streamer_mode_id:string|null;discord_username:string|null;
 referrer_name:string|null;referrer_facebook_url:string|null;
};
type ScriptReply={ok?:boolean;mode?:string;access?:string;version?:string;
 column_ready?:boolean;destination?:string;row?:number;route?:string;
 removed?:boolean;not_found?:boolean;action?:string;error?:string};
const fields="id,application_code,contact_email,application_type,status,workflow_enabled,submitted_at,applicant_facebook_name,applicant_birthdate,applicant_facebook_url,applicant_tiktok_url,applicant_clan_name,ign,codm_uid,streamer_mode_id,discord_username,referrer_name,referrer_facebook_url";
const safe=(v:unknown)=>String(v??"").trim();
const codeValid=(v:string)=>/^ASYLUM-[A-Z0-9]{8}$/.test(v);
async function script(payload:Record<string,unknown>):Promise<ScriptReply>{
 if(secret().length<32)throw Error("Server Google Sheets token is not configured.");
 const res=await fetch(scriptUrl,{method:"POST",
  headers:{"Content-Type":"application/json"},
  body:JSON.stringify({token:secret(),...payload}),redirect:"follow",
  signal:AbortSignal.timeout(18000)});
 let parsed:ScriptReply;
 try{parsed=await res.json() as ScriptReply;}
 catch{throw Error("Google Apps Script deployment returned an invalid response.");}
 if(!res.ok||!parsed.ok)throw Error(parsed.error||"Google Apps Script request failed.");
 return parsed;
}
async function liveReady(){
 try{
  const h=await script({action:"referral_health"});
  return h.mode==="live"&&h.access==="restricted"&&h.version==="referral-v1"
    &&h.destination==="REFERRALS"&&h.column_ready===true;
 }catch{return false;}
}
async function staffAuthorized(req:Request){
 if(!db||!userClient)return false;
 const match=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
 if(!match||match[1]===publicKey)return false;
 const {data:{user},error}=await userClient.auth.getUser(match[1]);
 if(error||!user?.email)return false;
 const {data,error:lookup}=await db.from("asy_recruitment_admins")
  .select("email").eq("email",user.email.toLowerCase()).maybeSingle();
 return !lookup&&!!data;
}
async function queueState(id:string){
 if(!db)throw Error("Service unavailable.");
 const {data,error}=await db.from("asy_referral_sheet_sync")
  .select("status,attempts").eq("application_id",id).maybeSingle();
 if(error)throw Error("Referral queue unavailable.");
 return data as {status:string;attempts:number}|null;
}
function isComplete(row:ReferralRow){
 return Boolean(
  row.workflow_enabled &&
  row.applicant_facebook_name?.trim() &&
  row.applicant_birthdate &&
  row.applicant_clan_name?.trim() &&
  row.applicant_facebook_url?.trim() &&
  row.applicant_tiktok_url?.trim() &&
  row.referrer_name?.trim() &&
  row.referrer_facebook_url?.trim() &&
  /^\d{19}$/.test(row.codm_uid)&&
  row.ign.trim().length>=2
 );
}
async function load(id:string):Promise<ReferralRow|null>{
 if(!db)return null;
 const {data,error}=await db.from("asy_clan_applications")
  .select(fields).eq("id",id).maybeSingle();
 if(error)throw Error("Could not read private Referral application.");
 return data as ReferralRow|null;
}
async function removeReferral(row:ReferralRow){
 if(!db)throw Error("Service unavailable.");
 const queue=await queueState(row.id);
 if(queue?.status==="removed")return {ok:true,already_removed:true};
 if(!queue||queue.status!=="remove_pending"||
    (row.application_type==="referral"&&row.status!=="rejected"))
  throw Error("Referral row deletion not authorized by the application state.");
 if(!await liveReady())throw Error("Referral Apps Script secure LIVE handler is not deployed.");
 const result=await script({action:"referral_delete",application_code:row.application_code});
 if(result.mode!=="live"||(!result.removed&&!result.not_found))
  throw Error("REFERRALS Sheet did not confirm deletion.");
 const now=new Date().toISOString();
 const {error}=await db.from("asy_referral_sheet_sync").update({
  status:"removed",attempts:(queue.attempts||0)+1,
  last_attempt_at:now,last_error:null,updated_at:now
 }).eq("application_id",row.id).eq("status","remove_pending");
 if(error)throw Error("Removal acknowledged by Google but the queue could not be updated.");
 return {ok:true,removed:result.removed===true,not_found:result.not_found===true};
}
async function syncReferral(row:ReferralRow){
 if(!db)throw Error("Service unavailable.");
 if(row.application_type!=="referral"||row.status==="rejected")
  throw Error("This is not an active Referral application.");
 const queue=await queueState(row.id);
 if(queue?.status==="synced")return {ok:true,already_synced:true,route:"referral"};
 if(queue?.status==="remove_pending"||queue?.status==="removed")
  throw Error("Referral cleanup in progress.");
 if(!isComplete(row)){
  await db.from("asy_referral_sheet_sync").upsert({
   application_id:row.id,status:"incomplete",updated_at:new Date().toISOString(),
   last_error:"Existing Referral is missing original membership form details."
  },{onConflict:"application_id"});
  return {ok:true,queued:true,missing_details:true,route:"referral"};
 }
 if(!await liveReady())return {
  ok:true,queued:true,awaiting_google_deployment:true,route:"referral",
  message:"Referral record saved. Private Google Apps Script needs the updated Referral handler."
 };
 const latest=await load(row.id);
 if(!latest||latest.status==="rejected"||latest.application_type!=="referral")
  throw Error("Referral is no longer eligible for synchronization.");
 const r=await script({action:"referral_upsert",application_type:"referral",
   application_code:latest.application_code,submitted_at:latest.submitted_at,
   applicant:{
    facebook_name:latest.applicant_facebook_name||"",
    birthdate:latest.applicant_birthdate||"",
    facebook_url:latest.applicant_facebook_url||"",
    tiktok_url:latest.applicant_tiktok_url||"",
    ign:latest.ign,codm_uid:latest.codm_uid,
    streamer_mode_id:latest.streamer_mode_id||"",
    clan_name:latest.applicant_clan_name||"",
    discord_username:latest.discord_username||"",
    referrer_name:latest.referrer_name||"",
    referrer_facebook_url:latest.referrer_facebook_url||""
   }});
 if(r.mode!=="live"||r.route!=="referral"||!Number.isInteger(r.row)||Number(r.row)<2)
  throw Error("REFERRALS Google Sheet did not acknowledge the website row.");
 const after=await load(row.id);
 if(!after||after.status==="rejected"||after.application_type!=="referral"){
  await removeReferral(after||{...latest,status:"rejected"});
  return {ok:true,removed_after_status_change:true,route:"referral"};
 }
 const now=new Date().toISOString();
 const {data:saved,error}=await db.from("asy_referral_sheet_sync").update({
  status:"synced",attempts:(queue?.attempts||0)+1,
  last_attempt_at:now,synced_at:now,last_error:null,updated_at:now
 }).eq("application_id",row.id).in("status",["pending","failed","incomplete","synced"])
   .select("application_id").maybeSingle();
 if(error)throw Error("Google Sheet was updated but the queue acknowledgment failed.");
 if(!saved){
  const current=await load(row.id);
  if(current&&(current.status==="rejected"||current.application_type!=="referral")){
   await removeReferral(current);
   return {ok:true,removed_after_status_change:true,route:"referral"};
  }
  throw Error("Referral sync queue changed during processing.");
 }
 return {ok:true,synced:true,row:r.row,route:"referral"};
}
async function submit(body:Record<string,unknown>){
 if(!db)return json(503,{ok:false,error:"Sync service unavailable."});
 const code=safe(body.application_code).toUpperCase();
 const email=safe(body.contact_email).toLowerCase();
 if(!codeValid(code)||email.length>254||
    !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email))
  return json(400,{ok:false,error:"Invalid referral reference."});
 const {data,error}=await db.from("asy_clan_applications")
  .select(fields).eq("application_code",code).eq("contact_email",email).maybeSingle();
 if(error||!data||data.application_type!=="referral"||
    data.status==="rejected"||!data.workflow_enabled)
  return json(404,{ok:false,error:"No matching active Referral application."});
 try{
  const result=await syncReferral(data as ReferralRow);
  return json(200,result);
 }catch(error){
  const reason=error instanceof Error?error.message:"Referral transfer unavailable.";
  await db.from("asy_referral_sheet_sync").update({
   status:"failed",last_error:reason.slice(0,150),
   last_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("application_id",data.id).in("status",["pending","failed","incomplete"]);
  console.error("Referral sync temporarily failed:",reason.slice(0,120));
  return json(503,{ok:false,error:"Referral saved, but private Google Sheets sync is pending."});
 }
}
async function reconcile(req:Request){
 if(!db)return json(503,{ok:false,error:"Sync service unavailable."});
 if(!await staffAuthorized(req))
  return json(403,{ok:false,error:"Recruiter authentication required."});
 let removed=0,synced=0,failed=0,incomplete=0;
 const {data:toRemove,error:remErr}=await db.from("asy_referral_sheet_sync")
  .select("application_id").eq("status","remove_pending")
  .order("updated_at",{ascending:true}).limit(5);
 if(remErr)return json(503,{ok:false,error:"Could not access referral cleanup queue."});
 for(const q of toRemove||[]){
  try{
   const row=await load(q.application_id);
   if(row){
    const result=await removeReferral(row);
    if(result.removed||result.not_found||result.already_removed)removed++;
   }
  }catch{failed++;}
 }
 if(await liveReady()){
  const {data:pending,error:pendingErr}=await db.from("asy_referral_sheet_sync")
   .select("application_id").in("status",["pending","failed"])
   .order("updated_at",{ascending:true}).limit(5);
  if(pendingErr)return json(503,{ok:false,error:"Referral sync queue unavailable."});
  for(const q of pending||[]){
   try{
    const row=await load(q.application_id);
    if(!row||row.application_type!=="referral"||row.status==="rejected")continue;
    const result=await syncReferral(row);
    if(result.synced) synced++;
    else if(result.missing_details)incomplete++;
   }catch{failed++;}
  }
 }
 const {count:pendingCount}=await db.from("asy_referral_sheet_sync")
  .select("application_id",{head:true,count:"exact"})
  .in("status",["pending","failed","remove_pending"]);
 return json(200,{ok:true,synced,removed,failed,incomplete,
  pending:pendingCount||0,mode:await liveReady()?"live":"pending_google_deployment"});
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
 if(req.method!=="POST")return json(405,{ok:false,error:"POST only."});
 const body=await req.json().catch(()=>null) as Record<string,unknown>|null;
 if(!body)return json(400,{ok:false,error:"JSON body required."});
 if(body.action==="sync-submission")return submit(body);
 if(body.action==="sync-batch")return reconcile(req);
 return json(400,{ok:false,error:"Unknown Referral sync operation."});
});
