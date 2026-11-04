import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL=Deno.env.get("SUPABASE_URL")||"";
const PUBLISHABLE_KEY=Deno.env.get("SUPABASE_PUBLISHABLE_KEY")||Deno.env.get("SUPABASE_ANON_KEY")||"";
function serverKey() {
  const value=Deno.env.get("SUPABASE_SECRET_KEYS");
  if(value){try{const data=JSON.parse(value);if(data.default)return String(data.default);}catch{}}
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
}
const SECRET_KEY=serverKey();
const WEBAPP_URL="https://script.google.com/macros/s/AKfycbzf9DwgJl-Sa9cVWyvpYPWKWTTqlXTTgAK_-WhAT6nMgbmHhcteTwHDUVx2Uv1Lw46m/exec";
const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization,apikey,content-type,x-client-info",
  "Access-Control-Allow-Methods":"POST,OPTIONS",
  "Cache-Control":"no-store",
};
const json=(status:number, body:Record<string,unknown>)=>
  new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});
const db=SUPABASE_URL&&SECRET_KEY
  ?createClient(SUPABASE_URL,SECRET_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  :null;
const auth=SUPABASE_URL&&PUBLISHABLE_KEY
  ?createClient(SUPABASE_URL,PUBLISHABLE_KEY,{auth:{persistSession:false,autoRefreshToken:false}})
  :null;
async function requireStaff(req:Request){
  if(!db||!auth)return {ok:false,message:"Supabase service is not configured."};
  const match=req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i);
  if(!match||match[1]===PUBLISHABLE_KEY)return {ok:false,message:"Sign in as a recruiter to test sheet syncing."};
  const {data:{user},error}=await auth.auth.getUser(match[1]);
  if(error||!user?.email)return {ok:false,message:"Recruiter session expired or invalid."};
  const email=user.email.trim().toLowerCase();
  const {data:staff,error:roleError}=await db.from("asy_recruitment_admins")
    .select("email").ilike("email",email).maybeSingle();
  if(roleError||!staff)return {ok:false,message:"Only authorized ASY recruiters can run the pilot."};
  return {ok:true,message:""};
}
Deno.serve(async (req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json(405,{ok:false,error:"POST only."});
  const staff=await requireStaff(req);
  if(!staff.ok)return json(403,{ok:false,error:staff.message});
  const body=await req.json().catch(()=>null) as {action?:string}|null;
  if(!body||!["status","pilot-test"].includes(body.action||""))
    return json(400,{ok:false,error:"Unknown Casual pilot action."});
  const token=Deno.env.get("ASY_CASUAL_SYNC_TOKEN")||"";
  if(body.action==="status"){
    return json(200,{
      ok:true,mode:"casual_test_only",webhook_url_configured:true,
      secret_configured:token.length>=32,
      destination:"WEBSITE_CASUAL_TEST",
      live_sync_enabled:false,
      missing_website_fields:["facebook_name","birthdate","clan_name","version"]
    });
  }
  // No genuine applicant data is ever transmitted by this endpoint.
  if(token.length<32)return json(503,{
    ok:false,error:"Set ASY_CASUAL_SYNC_TOKEN in Supabase Edge Function Secrets to exactly the same 32+ character value as the Apps Script Project property. Do not put the token in the website or chat."
  });
  const payload={
    action:"casual_upsert",
    application_type:"casual",
    application_code:"ASYLUM-PILOT20261104",
    submitted_at:"2026-11-04T00:00:00.000Z",
    token,
    applicant:{
      facebook_name:"PILOT DEMO - NOT A REAL APPLICANT",
      birthdate:"2000-01-01",
      facebook_url:"https://www.facebook.com/example",
      tiktok_url:"https://www.tiktok.com/@example",
      ign:"PILOTTEST",
      codm_uid:"1234567890123456789",
      streamer_mode_id:"TEST",
      clan_name:"NO CLAN",
      discord_username:"pilot_test",
      version:"PILOT TEST"
    }
  };
  try{
    const response=await fetch(WEBAPP_URL,{
      method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify(payload),redirect:"follow",
      signal:AbortSignal.timeout(18000),
    });
    const raw=await response.text();
    let result:{ok?:boolean;mode?:string;action?:string;row?:number;error?:string};
    try{result=JSON.parse(raw);}catch{
      return json(502,{ok:false,error:"Apps Script returned non-JSON. Check the deployment URL, permissions and deployed version."});
    }
    if(!response.ok||result.ok!==true||result.mode!=="test"){
      return json(502,{ok:false,error:result.error||"Apps Script did not confirm the test write."});
    }
    return json(200,{ok:true,mode:"casual_test_only",action:result.action,
      row:result.row,destination:"WEBSITE_CASUAL_TEST",
      message:"Synthetic test row verified by Apps Script. Live applicant sync remains disabled."});
  }catch(error){
    console.error("Casual Sheets pilot request failed:",error instanceof Error?error.name:"unknown");
    return json(502,{ok:false,error:"Could not reach the Google Apps Script deployment. Confirm its /exec URL and access settings."});
  }
});