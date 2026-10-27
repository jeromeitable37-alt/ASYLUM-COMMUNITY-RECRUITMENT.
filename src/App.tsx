import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { ArrowRight, BadgeCheck, Bot, CalendarClock, CheckCircle2, ClipboardList, Copy, Mail, Crosshair, Gamepad2, LogIn, LogOut, MessageCircle, Search, Send, ShieldCheck, Swords, Trophy, Users, X, Zap } from 'lucide-react';

const SUPABASE_URL = 'https://tyhszzztltamrohhyykh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn';
const EVIDENCE_API_URL = SUPABASE_URL + '/functions/v1/asy-recruitment-evidence';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
type Application = { id:string; application_code:string; ign:string; codm_uid:string; contact_email:string; discord_username:string|null; region:string; rank:string; level:number|null; main_role:string; preferred_mode:string; availability:string; clan_experience:string|null; reason:string; status:string; reviewer_notes:string|null; application_type:'casual'|'referral'; referrer_name:string|null; referrer_facebook_url:string|null; meets_age_requirement:boolean; legendary_series_count:number; workflow_step:string; submitted_at:string; updated_at:string };
type Evidence = { id?:string; application_id?:string; requirement_key:string; requirement_label:string; stage_number:number; status:'locked'|'not_submitted'|'pending'|'approved'|'needs_correction'; storage_path?:string|null; file_name?:string|null; content_type?:string|null; file_size_bytes?:number|null; applicant_note?:string|null; reviewer_notes?:string|null; submitted_at?:string|null; reviewed_at?:string|null; reviewed_by_email?:string|null };
type ApplicantProgress = { application:{application_code:string;ign:string;status:string;workflow_step:string;application_type:'casual'|'referral';submitted_at:string};evidence:Evidence[] };
type Roster = { id:string; ign:string; main_role:string; rank:string; member_status:string; joined_at:string };
type SavedApplication = { application_code:string; contact_email:string; ign:string; submitted_at:string };
type IntakeSettings = { id:number; intake_open:boolean; application_limit:number|null; application_count:number; cycle_started_at:string; updated_at:string };
const statuses = ['pending','reviewing','interview','tryout','accepted','rejected','waitlisted'];
const labels: Record<string,string> = { pending:'Pending review', reviewing:'In review', interview:'Interview', tryout:'Tryout', accepted:'Accepted', rejected:'Rejected', waitlisted:'Waitlisted' };
const blankForm = { applicationType:'casual', referrerName:'', referrerFacebookUrl:'', ageConfirmed:'', legendarySeriesCount:'6', facebookNameAppropriate:false, willingToAddTag:false, willingToSubmitPhoto:false, ign:'', uid:'', email:'', discord:'', region:'Philippines', rank:'Grand Master', level:'', role:'Slayer', mode:'Ranked Multiplayer', availability:'Evenings / weekends', experience:'', reason:'' };
const createCode = () => { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes=new Uint8Array(8); crypto.getRandomValues(bytes); return 'ASYLUM-'+Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''); };

export default function App() {
  const [page,setPage]=useState('home');
  const [session,setSession]=useState<Session|null>(null);
  const [authorized,setAuthorized]=useState(false);
  const [notice,setNotice]=useState('');
  const [hasError,setHasError]=useState(false);
  const [busy,setBusy]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [email,setEmail]=useState('jeromeitable37@gmail.com');
  const [password,setPassword]=useState('');
  const [applications,setApplications]=useState<Application[]>([]);
  const [roster,setRoster]=useState<Roster[]>([]);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [selected,setSelected]=useState<Application|null>(null);
  const [notes,setNotes]=useState('');
  const [applicationCode,setApplicationCode]=useState('');
  const [contactEmail,setContactEmail]=useState('');
  const [tracked,setTracked]=useState<{application_code:string;ign:string;status:string;submitted_at:string}|null>(null);
  const [savedApplication,setSavedApplication]=useState<SavedApplication|null>(null);
  const [interviewAt,setInterviewAt]=useState('');
  const [interviewChannel,setInterviewChannel]=useState('Discord');
  const [interviewDetails,setInterviewDetails]=useState('');
  const [tryoutAt,setTryoutAt]=useState('');
  const [tryoutMode,setTryoutMode]=useState('Ranked');
  const [tryoutScore,setTryoutScore]=useState('');
  const [tryoutResult,setTryoutResult]=useState('pending');
  const [tryoutNotes,setTryoutNotes]=useState('');
  const [form,setForm]=useState(blankForm);
  const [intakeSettings,setIntakeSettings]=useState<IntakeSettings|null>(null);
  const [intakeLimitDraft,setIntakeLimitDraft]=useState('');
  const [intakeOpenDraft,setIntakeOpenDraft]=useState(true);
  const [settingsBusy,setSettingsBusy]=useState(false);
  const [applicantProgress,setApplicantProgress]=useState<ApplicantProgress|null>(null);
  const [evidenceServiceConfigured,setEvidenceServiceConfigured]=useState<boolean|null>(null);
  const [evidenceUploadKey,setEvidenceUploadKey]=useState('');
  const [selectedEvidence,setSelectedEvidence]=useState<Evidence[]>([]);
  const [evidenceNotes,setEvidenceNotes]=useState<Record<string,string>>({});
  const notify=(message:string,isError=false)=>{setNotice(message);setHasError(isError);};
  const intakeFull=Boolean(intakeSettings && (!intakeSettings.intake_open || (intakeSettings.application_limit!==null && intakeSettings.application_count>=intakeSettings.application_limit)));
  const updateForm=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));

  useEffect(()=>{void loadIntakeSettings();},[]);
  useEffect(()=>{try{const raw=localStorage.getItem('asy-recruitment:last-application');if(raw){const saved=JSON.parse(raw) as SavedApplication;if(saved.application_code&&saved.contact_email){setSavedApplication(saved);setApplicationCode(saved.application_code);setContactEmail(saved.contact_email);}}}catch{}},[]);
  useEffect(()=>{supabase.auth.getSession().then(({data})=>setSession(data.session));const {data:listener}=supabase.auth.onAuthStateChange((_event,next)=>setSession(next));return()=>listener.subscription.unsubscribe();},[]);
  useEffect(()=>{if(session?.user.email) void checkAdmin(session.user.email);else setAuthorized(false);},[session]);
  useEffect(()=>{if(page==='roster')void loadRoster();if(page==='admin'&&session&&authorized)void loadApplications();},[page,session,authorized]);
  useEffect(()=>{if(selected&&authorized)void loadSelectedEvidence(selected.id);else setSelectedEvidence([]);},[selected?.id,authorized]);

  async function loadIntakeSettings(){
    const {data,error}=await supabase.from('asy_recruitment_settings').select('id,intake_open,application_limit,application_count,cycle_started_at,updated_at').eq('id',1).maybeSingle();
    if(error){console.error('Could not load recruitment intake settings.',error.message);return;}
    if(data){const settings=data as IntakeSettings;setIntakeSettings(settings);setIntakeLimitDraft(settings.application_limit===null?'':String(settings.application_limit));setIntakeOpenDraft(settings.intake_open);}
  }
  async function saveIntakeSettings(event:FormEvent){
    event.preventDefault();
    const limitText=intakeLimitDraft.trim();
    const limit=limitText===''?null:Number(limitText);
    if(limit!==null&&(!Number.isInteger(limit)||limit<1||limit>10000)){notify('Enter a whole-number limit from 1 to 10,000, or leave it blank for unlimited intake.',true);return;}
    setSettingsBusy(true);
    const {error}=await supabase.from('asy_recruitment_settings').update({intake_open:intakeOpenDraft,application_limit:limit,updated_at:new Date().toISOString()}).eq('id',1);
    setSettingsBusy(false);
    if(error){notify('Could not save intake settings. Make sure your recruiter account is authorized.',true);return;}
    await loadIntakeSettings();
    notify(intakeOpenDraft?'Recruitment intake settings saved.':'Recruitment intake is now closed.');
  }
  async function resetIntakeCycle(){
    if(!window.confirm('Start a new intake count? This resets only the application counter; it does not delete application records.'))return;
    setSettingsBusy(true);
    const now=new Date().toISOString();
    const {error}=await supabase.from('asy_recruitment_settings').update({application_count:0,cycle_started_at:now,updated_at:now}).eq('id',1);
    setSettingsBusy(false);
    if(error){notify('Could not reset the intake counter.',true);return;}
    await loadIntakeSettings();
    notify('New intake cycle started. Existing application history was kept.');
  }
  async function loadApplicantProgress(code:string,emailValue:string){
    try{
      const response=await fetch(EVIDENCE_API_URL+'?application_code='+encodeURIComponent(code)+'&contact_email='+encodeURIComponent(emailValue),{headers:{apikey:SUPABASE_PUBLISHABLE_KEY},cache:'no-store'});
      const data=await response.json();
      if(!response.ok){setEvidenceServiceConfigured(response.status!==503);setApplicantProgress(null);return;}
      setEvidenceServiceConfigured(true);setApplicantProgress(data as ApplicantProgress);
    }catch{setEvidenceServiceConfigured(false);setApplicantProgress(null);}
  }
  async function uploadRequirement(key:string,file:File){
    if(!applicationCode.trim()||!contactEmail.trim()){notify('Check your tracking code and application email first.',true);return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notify('Upload a JPG, PNG, or WEBP screenshot.',true);return;}
    if(file.size>8*1024*1024){notify('Each screenshot must be 8 MB or smaller.',true);return;}
    setEvidenceUploadKey(key);
    try{
      const createResponse=await fetch(EVIDENCE_API_URL,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'create-upload',application_code:applicationCode.trim(),contact_email:contactEmail.trim().toLowerCase(),requirement_key:key,content_type:file.type,file_size_bytes:file.size})});
      const uploadInfo=await createResponse.json();
      if(!createResponse.ok)throw new Error(uploadInfo.error||'Could not start the upload.');
      const {error:uploadError}=await supabase.storage.from('asy-recruitment-private').uploadToSignedUrl(uploadInfo.path,uploadInfo.token,file,{contentType:file.type,cacheControl:'3600'});
      if(uploadError)throw new Error(uploadError.message||'The screenshot upload failed.');
      const finalizeResponse=await fetch(EVIDENCE_API_URL,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize-upload',application_code:applicationCode.trim(),contact_email:contactEmail.trim().toLowerCase(),requirement_key:key,path:uploadInfo.path,file_name:file.name,content_type:file.type,file_size_bytes:file.size})});
      const finalInfo=await finalizeResponse.json();
      if(!finalizeResponse.ok)throw new Error(finalInfo.error||'Could not submit this screenshot for review.');
      await loadApplicantProgress(applicationCode.trim(),contactEmail.trim().toLowerCase());
      notify('Screenshot submitted privately. Wait for a recruiter to review it.');
    }catch(error){notify(error instanceof Error?error.message:'Screenshot upload failed. Please try again.',true);}
    finally{setEvidenceUploadKey('');}
  }
  async function loadSelectedEvidence(applicationId:string){
    const {data,error}=await supabase.from('asy_recruitment_evidence').select('*').eq('application_id',applicationId).order('stage_number').order('requirement_label');
    if(error){notify('Could not load requirement evidence. Confirm recruiter permissions.',true);return;}
    setSelectedEvidence((data||[]) as Evidence[]);
  }
  async function reviewEvidence(item:Evidence,status:'approved'|'needs_correction'){
    if(!selected||!item.id)return;
    setBusy(true);
    const reviewerNotes=evidenceNotes[item.id]?.trim()||null;
    const {error}=await supabase.from('asy_recruitment_evidence').update({status,reviewer_notes:reviewerNotes,reviewed_by_email:session?.user.email||null,reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq('id',item.id);
    setBusy(false);
    if(error){notify('Could not update this requirement. Check recruiter access.',true);return;}
    await loadSelectedEvidence(selected.id);
    await loadApplications();
    notify(status==='approved'?'Requirement approved. The next step unlocks when all required items in this step are approved.':'Correction requested. The applicant can upload a replacement screenshot.');
  }
  async function openEvidence(path:string){
    const {data,error}=await supabase.storage.from('asy-recruitment-private').createSignedUrl(path,300);
    if(error||!data?.signedUrl){notify('Could not open this private screenshot.',true);return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
  async function advanceApplicationWorkflow(app:Application,nextStep:'tag_proofs'|'screening_gc_ready'){
    setBusy(true);
    const {data,error}=await supabase.from('asy_clan_applications').update({workflow_step:nextStep,updated_at:new Date().toISOString()}).eq('id',app.id).select('*').single();
    setBusy(false);
    if(error||!data){notify('Could not advance the applicant. Make sure the evidence step is complete and recruiter permissions are active.',true);return;}
    setSelected(data as Application);
    await loadSelectedEvidence(app.id);
    await loadApplications();
    notify(nextStep==='tag_proofs'?'Eligibility approved. Step 1 screenshot submissions are now unlocked.':'Final review completed. Applicant is now eligible for the Screening GC decision.');
  }
  async function checkAdmin(userEmail:string){const {data,error}=await supabase.from('asy_recruitment_admins').select('email').eq('email',userEmail.toLowerCase()).maybeSingle();setAuthorized(!error&&Boolean(data));}
  async function signIn(event:FormEvent){event.preventDefault();setBusy(true);const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error){notify(error.message.toLowerCase().includes('invalid login credentials')?'Email or password is incorrect. Use the Supabase recruiter account connected to this website.':error.message,true);}else notify('Signed in. Checking recruiter permissions…');}
  async function signOut(){await supabase.auth.signOut();setAuthorized(false);setApplications([]);setSelected(null);notify('Signed out.');}
  async function submitApplication(event:FormEvent){event.preventDefault();if(form.ageConfirmed!=='yes'){notify('Confirm that you are at least 16 years old before applying.',true);return;}if(Number(form.legendarySeriesCount)<6){notify('You need at least 6 Legendary Series in BR or MP to apply.',true);return;}if(!form.facebookNameAppropriate||!form.willingToAddTag||!form.willingToSubmitPhoto){notify('Confirm the Facebook name, ASY tag, and roster photo requirements before applying.',true);return;}if(form.applicationType==='referral'&&(!form.referrerName.trim()||!form.referrerFacebookUrl.trim())){notify('Referral applications need the referrer name and Facebook link.',true);return;}if(intakeFull){notify(!intakeSettings?.intake_open?'Recruitment is temporarily closed. Please check back later.':'The current recruitment application limit has been reached. Please check back later.',true);return;}setBusy(true);const code=createCode();const payload={application_code:code,application_type:form.applicationType,workflow_enabled:true,referrer_name:form.applicationType==='referral'?form.referrerName.trim():null,referrer_facebook_url:form.applicationType==='referral'?form.referrerFacebookUrl.trim():null,meets_age_requirement:form.ageConfirmed==='yes',legendary_series_count:Number(form.legendarySeriesCount),facebook_name_appropriate:form.facebookNameAppropriate,willing_to_add_asy_tag:form.willingToAddTag,willing_to_submit_roster_photo:form.willingToSubmitPhoto,ign:form.ign.trim(),codm_uid:form.uid.trim(),contact_email:form.email.trim().toLowerCase(),discord_username:form.discord.trim()||null,region:form.region,rank:form.rank,level:form.level?Number(form.level):null,main_role:form.role,preferred_mode:form.mode,availability:form.availability,clan_experience:form.experience.trim()||null,reason:form.reason.trim(),status:'pending',reviewer_notes:null};const {error}=await supabase.from('asy_clan_applications').insert(payload);if(error){setBusy(false);const message=error.message.toLowerCase();notify(message.includes('temporarily closed')?'Recruitment is temporarily closed. Please check back later.':message.includes('application limit reached')?'The current recruitment application limit has been reached. Please check back later.':'Could not submit your application. Please check your details and try again.',true);return;}void loadIntakeSettings();try{await fetch('/api/notify-discord',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ign:payload.ign,rank:payload.rank,role:payload.main_role,mode:payload.preferred_mode,code})});}catch{}setBusy(false);setApplicationCode(code);setContactEmail(payload.contact_email);const saved:SavedApplication={application_code:code,contact_email:payload.contact_email,ign:payload.ign,submitted_at:new Date().toISOString()};setSavedApplication(saved);try{localStorage.setItem('asy-recruitment:last-application',JSON.stringify(saved));}catch{}setForm(blankForm);setTracked({application_code:code,ign:payload.ign,status:'pending',submitted_at:saved.submitted_at,updated_at:saved.submitted_at});void loadApplicantProgress(code,payload.contact_email);setPage('status');notify('Application submitted! Your tracking code is shown below and saved on this device.');}
  async function checkStatus(event:FormEvent){event.preventDefault();setBusy(true);setTracked(null);setApplicantProgress(null);const {data,error}=await supabase.rpc('asy_check_application',{p_application_code:applicationCode.trim(),p_contact_email:contactEmail.trim().toLowerCase()});setBusy(false);if(error)notify('We could not check the status right now. Please try again in a moment.',true);else if(!data?.length)notify('We could not find a match. Check your tracking code and the same email used in your application.',true);else{setTracked(data[0]);await loadApplicantProgress(applicationCode.trim(),contactEmail.trim().toLowerCase());notify('Application found. Your latest status is ready.');}}
  async function copyApplicationCode(codeToCopy=savedApplication?.application_code||applicationCode){if(!codeToCopy){notify('There is no tracking code to copy yet.',true);return;}try{await navigator.clipboard.writeText(codeToCopy);notify('Tracking code copied. Keep it private with your application email.');}catch{notify('Copy is unavailable in this browser. Select the code and copy it manually.',true);}}
  function clearSavedApplication(){try{localStorage.removeItem('asy-recruitment:last-application');}catch{}setSavedApplication(null);setApplicationCode('');setContactEmail('');setTracked(null);notify('Saved tracking details cleared from this device.');}
  async function loadApplications(){const {data,error}=await supabase.from('asy_clan_applications').select('*').order('submitted_at',{ascending:false});if(error)notify('Unable to load applications. Confirm recruiter access.',true);else setApplications((data||[]) as Application[]);}
  async function loadRoster(){const {data,error}=await supabase.from('asy_clan_roster_public').select('id,ign,main_role,rank,member_status,joined_at').eq('member_status','active').order('joined_at');if(error)notify('Could not load the roster right now.',true);else setRoster((data||[]) as Roster[]);}
  async function updateApplication(app:Application,status:string){setBusy(true);const {error}=await supabase.from('asy_clan_applications').update({status,reviewer_notes:notes.trim()||null,updated_at:new Date().toISOString()}).eq('id',app.id);if(error){setBusy(false);notify('Could not save this review. Check recruiter permissions.',true);return;}if(status==='accepted'){const {error:rosterError}=await supabase.from('asy_clan_roster').upsert({application_id:app.id,ign:app.ign,codm_uid:app.codm_uid,main_role:app.main_role,rank:app.rank,discord_username:app.discord_username,member_status:'active'},{onConflict:'application_id'});if(rosterError)notify('Status updated, but roster sync failed. Check whether this UID already exists.',true);}setBusy(false);setSelected(null);await loadApplications();notify(status==='accepted'?'Applicant accepted and added to community members.':'Application review saved.');}
  async function scheduleInterview(event:FormEvent){event.preventDefault();if(!selected||!interviewAt)return;setBusy(true);const {error}=await supabase.from('asy_recruitment_interviews').insert({application_id:selected.id,scheduled_at:new Date(interviewAt).toISOString(),channel:interviewChannel,meeting_details:interviewDetails.trim()||null,created_by:session?.user.email||null});setBusy(false);if(error)notify('Interview could not be saved.',true);else{await updateApplication(selected,'interview');setInterviewAt('');setInterviewDetails('');notify('Interview scheduled.');}}
  async function saveTryout(event:FormEvent){event.preventDefault();if(!selected)return;setBusy(true);const {error}=await supabase.from('asy_recruitment_tryouts').insert({application_id:selected.id,scheduled_at:tryoutAt?new Date(tryoutAt).toISOString():null,mode:tryoutMode,score:tryoutScore?Number(tryoutScore):null,result:tryoutResult,notes:tryoutNotes.trim()||null});setBusy(false);if(error)notify('Tryout result could not be saved.',true);else{await updateApplication(selected,tryoutResult==='fail'?'rejected':'tryout');setTryoutScore('');setTryoutNotes('');notify('Tryout record saved.');}}
  const filtered=useMemo(()=>applications.filter(app=>(filter==='all'||app.status===filter)&&[app.ign,app.codm_uid,app.contact_email,app.application_code].some(v=>v.toLowerCase().includes(query.toLowerCase()))),[applications,filter,query]);
  const count=(status:string)=>applications.filter(app=>app.status===status).length;
  const navigation=[['home','Overview'],['apply','Apply to join'],['status','Track application'],['screening','Screening guide'],['roster','Community members']];

  return <div className="shell">
    <div className="topline"><i/> ASYLUM COMMUNITY <span>/</span> GAMING COMMUNITY</div>
    <header className="nav">
      <button className="brand" onClick={()=>setPage('home')}><b className="mark"><img src="https://asy-clan-recruitment-1h073y.v2.appdeploy.ai/resources/asylum-community-logo.png" alt="Asylum Community logo" onError={event=>{event.currentTarget.style.opacity='0';}}/></b><span><strong>ASYLUM<span>.</span></strong><small>OFFICIAL COMMUNITY RECRUITMENT</small></span></button>
      <button className="mobile-toggle" aria-label="Open menu" onClick={()=>setMobileOpen(!mobileOpen)}>☰</button>
      <nav className={mobileOpen?'open':''}>{navigation.map(([id,label])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setMobileOpen(false);setNotice('');}}>{label}</button>)}<button className="login-nav" onClick={()=>{setPage('admin');setMobileOpen(false);setNotice('');}}><ShieldCheck size={15}/> Recruiter login</button></nav>
    </header>
    {notice&&<div className={'notice '+(hasError?'bad':'')}><BadgeCheck size={17}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
    <main>
      {page==='home'&&<Home intakeSettings={intakeSettings} onApply={()=>setPage('apply')} onRoster={()=>setPage('roster')} onTrack={()=>setPage('status')} onGuide={()=>setPage('screening')}/>}
      {page==='apply'&&<section className="page"><Heading kicker="01 / RECRUITMENT FORM" title={<>YOUR RUN <em>STARTS HERE.</em></>} desc="Complete the form honestly. Required fields are marked *. No account needed."/>
        <div className={'panel intake-banner '+(intakeFull?'closed':'open')}><div><strong>{intakeFull?(!intakeSettings?.intake_open?'Applications are temporarily closed':'Application limit reached'):'Recruitment intake is open'}</strong><p>{intakeSettings?.application_limit!==null&&intakeSettings?`${intakeSettings.application_count} of ${intakeSettings.application_limit} applications used this intake.`:'Check the eligibility requirements and complete the form once. Recruiters review applications individually.'}</p></div><span className="intake-dot"/></div>
        <form className="panel form" onSubmit={submitApplication}>
          <Section n="00" title="Application route" sub="Choose the correct recruitment path so the team can verify the right proofs."/>
          <Field label="Application type *"><select value={form.applicationType} onChange={e=>updateForm('applicationType',e.target.value)}><option value="casual">Casual Recruitment</option><option value="referral">Referral Recruitment</option></select></Field>
          {form.applicationType==='referral'&&<div className="form-grid">
            <Field label="Referring member name *"><input required value={form.referrerName} onChange={e=>updateForm('referrerName',e.target.value)} placeholder="Member who referred you"/></Field>
            <Field label="Referring member Facebook profile link *"><input required type="url" value={form.referrerFacebookUrl} onChange={e=>updateForm('referrerFacebookUrl',e.target.value)} placeholder="https://facebook.com/…"/></Field>
          </div>}
          <Section n="01" title="Eligibility confirmation" sub="Confirm the minimum requirements before submitting your application."/>
          <label className="screening-check eligibility-check"><input type="checkbox" required checked={form.ageConfirmed==='yes'} onChange={e=>updateForm('ageConfirmed',e.target.checked?'yes':'')}/><span>I confirm that I am at least 16 years old.</span></label>
          <div className="form-grid">
            <Field label="Legendary Series achieved (BR or MP) *"><input type="number" min="6" max="100" required value={form.legendarySeriesCount} onChange={e=>updateForm('legendarySeriesCount',e.target.value)} placeholder="At least 6"/></Field>
          </div>
          <p className="muted form-helper">You must have at least 6 Legendary Series in BR or MP and confirm the community rules below. Your social account logins are never requested.</p>
          <div className="eligibility-confirmations">
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.facebookNameAppropriate} onChange={e=>setForm(old=>({...old,facebookNameAppropriate:e.target.checked}))}/><span>I confirm that my Facebook name is appropriate and not random or inappropriate.</span></label>
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.willingToAddTag} onChange={e=>setForm(old=>({...old,willingToAddTag:e.target.checked}))}/><span>I agree to put the ASY tag AFTER my IGN on my main CODM and TikTok accounts.</span></label>
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.willingToSubmitPhoto} onChange={e=>setForm(old=>({...old,willingToSubmitPhoto:e.target.checked}))}/><span>I agree to submit the required roster photo and follow the admin reference if accepted.</span></label>
          </div>
          <Section n="02" title="Player details" sub="How recruiters can identify and contact you."/>
          <div className="form-grid">
            <Field label="In-game name (IGN) *"><input required minLength={2} maxLength={32} value={form.ign} onChange={e=>updateForm('ign',e.target.value)} placeholder="Your CODM name"/></Field>
            <Field label="CODM UID *"><input required minLength={5} maxLength={32} value={form.uid} onChange={e=>updateForm('uid',e.target.value)} placeholder="Player UID"/></Field>
            <Field label="Contact email *"><input required type="email" value={form.email} onChange={e=>updateForm('email',e.target.value)} placeholder="you@example.com"/></Field>
            <Field label="Discord username"><input value={form.discord} onChange={e=>updateForm('discord',e.target.value)} placeholder="Optional"/></Field>
            <Field label="Region"><select value={form.region} onChange={e=>updateForm('region',e.target.value)}>{['Philippines','South East Asia','North America','Europe','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Current rank *"><select value={form.rank} onChange={e=>updateForm('rank',e.target.value)}>{['Rookie','Veteran','Elite','Pro','Master','Grand Master','Legendary'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Current level"><input type="number" min="1" max="500" value={form.level} onChange={e=>updateForm('level',e.target.value)} placeholder="e.g. 220"/></Field>
          </div>
          <Section n="03" title="Your playstyle" sub="Help us understand where you fit."/>
          <div className="form-grid">
            <Field label="Main role *"><select value={form.role} onChange={e=>updateForm('role',e.target.value)}>{['Slayer','Support','Sniper','Objective','Flex','Entry Fragger','IGL / Shot-caller'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Preferred mode *"><select value={form.mode} onChange={e=>updateForm('mode',e.target.value)}>{['Ranked Multiplayer','Search & Destroy','Hardpoint','Domination','Battle Royale','Scrims / Competitive','Casual / Mixed'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Availability *"><select value={form.availability} onChange={e=>updateForm('availability',e.target.value)}>{['Weekdays','Evenings / weekends','Weekends only','Flexible schedule','Varies weekly'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Previous community / team experience"><input value={form.experience} onChange={e=>updateForm('experience',e.target.value)} placeholder="Optional"/></Field>
          </div>
          <Field label="Why do you want to join Asylum Community? *"><textarea required minLength={10} maxLength={1000} rows={5} value={form.reason} onChange={e=>updateForm('reason',e.target.value)} placeholder="Tell us about your goals, teamwork, and what you can bring…"/></Field>
          <div className="privacy"><ShieldCheck size={17}/> Your email and UID are for recruitment review only. Email is not shown on the public roster.</div>
          <button className="primary" disabled={busy||intakeFull}>{busy?'Submitting…':intakeFull?'Applications closed':'Submit application'} <ArrowRight size={16}/></button>
        </form></section>}
      {page==='status'&&<section className="page narrow"><Heading kicker="02 / APPLICATION STATUS" title={<>CHECK YOUR <em>STATUS.</em></>} desc="Check your progress with your tracking code and the same email address used on your application."/>
        {savedApplication&&<div className="panel saved-reference"><div className="saved-reference-head"><div><small className="kicker">SAVED ON THIS DEVICE</small><h2>Your tracking code</h2><p>We saved your latest application reference here so you can find it again after you leave the site.</p></div><span className="saved-reference-icon"><ClipboardList size={20}/></span></div><div className="reference-code-row"><code>{savedApplication.application_code}</code><button className="secondary" type="button" onClick={()=>void copyApplicationCode(savedApplication.application_code)}><Copy size={15}/> Copy code</button></div><p className="saved-email"><Mail size={15}/> Email used: <strong>{savedApplication.contact_email}</strong></p><p className="saved-help">Using another device? Contact an ASy recruiter with your in-game name and the email you applied with. Do not post your UID or email publicly.</p><button className="saved-clear" type="button" onClick={clearSavedApplication}>Forget saved details on this device</button></div>}
        <form className="panel form" onSubmit={checkStatus}><Field label="Application code"><input required value={applicationCode} onChange={e=>setApplicationCode(e.target.value.toUpperCase())} placeholder="ASYLUM-XXXXXXXX"/></Field><Field label="Contact email"><input required type="email" value={contactEmail} onChange={e=>setContactEmail(e.target.value)} placeholder="Email used in your application"/></Field><button className="primary full" disabled={busy}>{busy?'Checking…':'Check application'} <ArrowRight size={16}/></button></form>
        {tracked&&<div className="panel tracked"><small>APPLICATION FOUND</small><span className={'pill '+tracked.status}>{labels[tracked.status]||tracked.status}</span><h2>{tracked.ign}</h2><div className="tracked-reference"><p className="muted">Tracking code: <strong>{tracked.application_code}</strong></p><button className="saved-clear" type="button" onClick={()=>void copyApplicationCode(tracked.application_code)}><Copy size={14}/> Copy code</button></div><div className="timeline">{['pending','reviewing','interview','tryout','accepted'].map((stage,index)=><div className={'step '+(statuses.indexOf(tracked.status)>=statuses.indexOf(stage)&&tracked.status!=='rejected'?'done':'')} key={stage}><b>{index+1}</b><div><strong>{labels[stage]}</strong><small>{['Application received','Recruiter review','Interview stage','Tryout stage','Welcome to the roster'][index]}</small></div></div>)}</div><p className="muted">Submitted {new Date(tracked.submitted_at).toLocaleString()}</p></div>}
        {applicantProgress&&<section className="panel applicant-progress">
          <div className="applicant-progress-head"><small className="kicker">SCREENING PROGRESS / {applicantProgress.application.application_type.toUpperCase()}</small><h2>{({eligibility_review:'Step 0 · Recruiter eligibility review',tag_proofs:'Step 1 · CODM and TikTok tag proofs',membership_proofs:'Step 2 · Follow and Membership Form',discord_roster:'Step 3 · Discord nickname and roster photo',final_review:'Final recruiter double-check',screening_gc_ready:'Requirements approved · Screening GC review',complete:'Recruitment completed'} as Record<string,string>)[applicantProgress.application.workflow_step]||'Application in review'}</h2><p>Your next step unlocks after the recruiter approves all required items in the current step. Keep your tracking code and application email private.</p></div>
          {evidenceServiceConfigured===false&&<div className="notice bad">Private upload service is not configured yet. Your application is saved; contact management while the upload service is configured.</div>}
          <div className="applicant-evidence-list">{applicantProgress.evidence.map(item=>{
            const currentStage=({tag_proofs:1,membership_proofs:2,discord_roster:3} as Record<string,number>)[applicantProgress.application.workflow_step]||0;
            const canUpload=currentStage===item.stage_number&&(item.status==='not_submitted'||item.status==='needs_correction');
            const statusLabel=({locked:'Locked',not_submitted:'Awaiting upload',pending:'Pending recruiter review',approved:'Approved',needs_correction:'Needs correction'} as Record<string,string>)[item.status]||item.status;
            return <article className={'applicant-evidence-item '+item.status} key={item.requirement_key}>
              <div className="applicant-evidence-copy"><strong>{item.requirement_label}</strong><span className={'evidence-status '+item.status}>{statusLabel}</span>{item.file_name&&<small>Uploaded file: {item.file_name}</small>}{item.reviewer_notes&&item.status==='needs_correction'&&<p className="correction-note">Recruiter note: {item.reviewer_notes}</p>}</div>
              {canUpload&&<label className="upload-control"><span>{evidenceUploadKey===item.requirement_key?'Uploading…':item.status==='needs_correction'?'Upload replacement':'Choose screenshot'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!evidenceUploadKey} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadRequirement(item.requirement_key,file);e.currentTarget.value='';}}/></label>}
            </article>;
          })}</div>
          {!['tag_proofs','membership_proofs','discord_roster'].includes(applicantProgress.application.workflow_step)&&<p className="muted">Uploads will unlock here when an authorized recruiter approves your current step.</p>}
        </section>}
      </section>}
      {page==='screening'&&<ScreeningGuide intakeSettings={intakeSettings}/>}
      {page==='roster'&&<RosterPage roster={roster} onApply={()=>setPage('apply')}/>}
      {page==='admin'&&<section className="page admin-page">
        {!session?<div className="login-wrap"><div><small className="kicker">RESTRICTED AREA</small><h1>RECRUITER<br/><em>COMMAND.</em></h1><p className="muted">Sign in with an authorized Asylum Community recruitment account to review applications, schedule interviews and track tryouts.</p><div className="secure"><ShieldCheck/> ACCESS CONTROLLED BY SUPABASE AUTH</div></div><form className="panel login" onSubmit={signIn}><div className="login-icon"><ShieldCheck/></div><h2>Recruiter sign in</h2><p className="muted">Only approved recruiter emails can access applicant data.</p><Field label="Email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jeromeitable37@gmail.com"/></Field><Field label="Password"><input required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></Field><button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in securely'} <LogIn size={16}/></button><small className="muted">Account must exist in Supabase Auth and be added to the Asylum Community recruiter allowlist.</small></form></div>
        :!authorized?<div className="panel empty"><ShieldCheck size={38}/><h2>Account not authorized</h2><p>Signed in as {session.user.email}, but this email is not on the recruiter allowlist.</p><button className="secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></div>
        :<><div className="admin-head"><div><small className="kicker">ASYLUM COMMUNITY / RECRUITMENT CONTROL</small><h1>RECRUITER <em>DESK.</em></h1><p>{session.user.email}</p></div><button className="secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></div>
          <div className="stats"><Stat icon={<ClipboardList/>} label="Total applicants" value={applications.length}/><Stat icon={<Zap/>} label="Pending review" value={count('pending')}/><Stat icon={<CalendarClock/>} label="In progress" value={count('reviewing')+count('interview')+count('tryout')}/><Stat icon={<Trophy/>} label="Accepted" value={count('accepted')}/></div>
           <section className="panel intake-admin">
             <div className="intake-admin-copy"><small className="kicker">RECRUITMENT INTAKE CONTROL</small><h2>Application capacity</h2><p>Set a cap for this intake or close submissions temporarily. The database enforces the limit during submission.</p><div className="intake-meter"><span className={intakeFull?'closed':''}/></div><strong>{intakeSettings?.application_count??'—'} / {intakeSettings?.application_limit??'Unlimited'} applications</strong><small>{intakeSettings?.intake_open?'Intake toggle is open':'Intake is closed'} · Cycle started {intakeSettings?new Date(intakeSettings.cycle_started_at).toLocaleDateString():'—'}</small></div>
             <form className="intake-admin-form" onSubmit={saveIntakeSettings}>
               <Field label="Maximum applications (blank = unlimited)"><input type="number" min="1" max="10000" step="1" value={intakeLimitDraft} onChange={event=>setIntakeLimitDraft(event.target.value)} placeholder="Unlimited"/></Field>
               <label className="toggle-row"><input type="checkbox" checked={intakeOpenDraft} onChange={event=>setIntakeOpenDraft(event.target.checked)}/> Accept new applications</label>
               <button className="primary full" disabled={settingsBusy}>{settingsBusy?'Saving…':'Save intake settings'}</button>
               <button className="secondary full" type="button" disabled={settingsBusy} onClick={()=>void resetIntakeCycle()}>Start a new intake count</button>
             </form>
           </section>
          <div className="tools"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search IGN, UID, email, code…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(stage=><option key={stage} value={stage}>{labels[stage]}</option>)}</select><button className="secondary" onClick={()=>void loadApplications()}>Refresh</button></div>
          <div className="app-list">{filtered.map(app=><button className={'app-row '+(selected?.id===app.id?'chosen':'')} key={app.id} onClick={()=>{setSelected(app);setNotes(app.reviewer_notes||'');}}><span className="app-icon"><Gamepad2 size={19}/></span><span className="app-main"><b>{app.ign}</b><small>{app.application_code} · {app.application_type==='referral'?'REFERRAL':'CASUAL'} · {app.workflow_step.replaceAll('_',' ')} · {app.rank}</small></span><span className={'pill '+app.status}>{labels[app.status]}</span><ArrowRight size={16}/></button>)}{!filtered.length&&<div className="empty-inline">No applications match these filters.</div>}</div>
          {selected&&<div className="panel detail"><header><div><small className="kicker">APPLICATION REVIEW</small><h2>{selected.ign}</h2><p className="muted">{selected.application_code} · {new Date(selected.submitted_at).toLocaleString()}</p></div><button className="close secondary" onClick={()=>setSelected(null)} aria-label="Close detail"><X/></button></header>
            <div className="details">{[['Application type',selected.application_type==='referral'?'Referral':'Casual'],['Referring member',selected.referrer_name||'Not applicable'],['Referrer Facebook',selected.referrer_facebook_url||'Not provided'],['Age requirement',selected.meets_age_requirement?'Confirmed age 16+':'Not confirmed'],['Legendary Series (BR/MP)',String(selected.legendary_series_count)],['Facebook name',selected.facebook_name_appropriate?'Appropriate confirmed':'Not confirmed'],['ASY tag agreement',selected.willing_to_add_asy_tag?'Confirmed':'Not confirmed'],['Roster photo agreement',selected.willing_to_submit_roster_photo?'Confirmed':'Not confirmed'],['Workflow step',selected.workflow_step.replaceAll('_',' ')],['CODM UID',selected.codm_uid],['Contact email',selected.contact_email],['Discord',selected.discord_username||'Not provided'],['Region / level',selected.region+' / '+(selected.level??'N/A')],['Rank',selected.rank],['Main role',selected.main_role],['Mode',selected.preferred_mode],['Availability',selected.availability],['Community / team experience',selected.clan_experience||'Not provided']].map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
            <div className="reason"><b>Why they want to join</b><p>{selected.reason}</p></div>
            <section className="panel admin-evidence">
              <small className="kicker">STEPWISE SCREENING</small><h2>Required proofs</h2><p className="muted">Approve each submitted screenshot. The database unlocks the next step only when every required item in this step is approved.</p>
              {selectedEvidence.map(item=><article className="admin-evidence-item" key={item.requirement_key}>
                <div className="admin-evidence-title"><div><strong>{item.requirement_label}</strong><small>Stage {item.stage_number} · {item.status.replace('_',' ')}</small>{item.file_name&&<small>{item.file_name} · {item.file_size_bytes?Math.round(item.file_size_bytes/1024)+' KB':''}</small>}</div>
                  {item.storage_path&&<button type="button" className="secondary compact-button" onClick={()=>void openEvidence(item.storage_path!)}>View private proof</button>}
                </div>
                {item.status==='pending'&&<><Field label="Feedback for applicant"><textarea rows={2} value={evidenceNotes[item.id||'']??item.reviewer_notes??''} onChange={e=>setEvidenceNotes(old=>({...old,[item.id||'']:e.target.value}))} placeholder="Optional note; add one if requesting correction"/></Field><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={()=>void reviewEvidence(item,'needs_correction')}>Request correction</button><button type="button" className="primary" disabled={busy} onClick={()=>void reviewEvidence(item,'approved')}>Approve proof <CheckCircle2 size={15}/></button></div></>}
                {item.status==='needs_correction'&&<p className="correction-note">Correction requested. The applicant can upload a replacement at the current step.</p>}
              </article>)}
              {selected.workflow_step==='eligibility_review'&&<button type="button" className="primary full" disabled={busy} onClick={()=>void advanceApplicationWorkflow(selected,'tag_proofs')}>Approve eligibility & unlock Step 1 <ArrowRight size={15}/></button>}
              {selected.workflow_step==='final_review'&&<button type="button" className="primary full" disabled={busy} onClick={()=>void advanceApplicationWorkflow(selected,'screening_gc_ready')}>Complete final double-check · mark Screening GC ready <CheckCircle2 size={15}/></button>}
              {selected.workflow_step==='screening_gc_ready'&&<p className="success-note">All required evidence is approved. The final recruitment decision is ready.</p>}
            </section>
            <Field label="Private reviewer notes"><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal notes — not shown to applicant"/></Field>
            <div className="action-row"><button className="secondary" disabled={busy} onClick={()=>void updateApplication(selected,'reviewing')}>Mark in review</button><button className="secondary" disabled={busy} onClick={()=>void updateApplication(selected,'waitlisted')}>Waitlist</button><button className="danger" disabled={busy} onClick={()=>void updateApplication(selected,'rejected')}>Reject</button><button className="primary" disabled={busy||selected.workflow_step!=='screening_gc_ready'} onClick={()=>void updateApplication(selected,'accepted')}>{selected.workflow_step==='screening_gc_ready'?'Accept + add member':'Complete all screening steps first'} <CheckCircle2 size={15}/></button></div>
            <div className="workflow"><div className="workflow-card"><h3><CalendarClock size={17}/> Schedule interview</h3><form onSubmit={scheduleInterview}><Field label="Date and time"><input type="datetime-local" required value={interviewAt} onChange={e=>setInterviewAt(e.target.value)}/></Field><Field label="Channel"><select value={interviewChannel} onChange={e=>setInterviewChannel(e.target.value)}><option>Discord</option><option>In-game voice</option><option>Other</option></select></Field><Field label="Details / invite"><input value={interviewDetails} onChange={e=>setInterviewDetails(e.target.value)} placeholder="Channel or meeting notes"/></Field><button className="secondary full" disabled={busy}>Save interview</button></form></div>
              <div className="workflow-card"><h3><Crosshair size={17}/> Record tryout</h3><form onSubmit={saveTryout}><Field label="Tryout date"><input type="datetime-local" value={tryoutAt} onChange={e=>setTryoutAt(e.target.value)}/></Field><Field label="Mode"><select value={tryoutMode} onChange={e=>setTryoutMode(e.target.value)}>{['Ranked','Scrim','Search & Destroy','Hardpoint','Battle Royale'].map(v=><option key={v}>{v}</option>)}</select></Field><div className="form-grid compact"><Field label="Score /100"><input type="number" min="0" max="100" value={tryoutScore} onChange={e=>setTryoutScore(e.target.value)} placeholder="Optional"/></Field><Field label="Result"><select value={tryoutResult} onChange={e=>setTryoutResult(e.target.value)}><option value="pending">Pending</option><option value="pass">Pass</option><option value="fail">Fail</option><option value="reschedule">Reschedule</option></select></Field></div><Field label="Tryout notes"><textarea rows={2} value={tryoutNotes} onChange={e=>setTryoutNotes(e.target.value)} placeholder="Performance, comms, teamwork…"/></Field><button className="secondary full" disabled={busy}>Save tryout</button></form></div></div>
          </div>}
        </>}
      </section>}
    </main>
    <footer className="footer"><div className="brand"><b className="mark"><img src="https://asy-clan-recruitment-1h073y.v2.appdeploy.ai/resources/asylum-community-logo.png" alt="Asylum Community logo" onError={event=>{event.currentTarget.style.opacity='0';}}/></b><span><strong>ASYLUM<span>.</span></strong><small>OFFICIAL COMMUNITY RECRUITMENT</small></span></div><p>A gaming community built on teamwork and respect.</p><span>© {new Date().getFullYear()} ASYLUM COMMUNITY</span></footer>
    <ChatSupport intakeSettings={intakeSettings} />
  </div>;
}

function Home({intakeSettings,onApply,onRoster,onTrack,onGuide}:{intakeSettings:IntakeSettings|null;onApply:()=>void;onRoster:()=>void;onTrack:()=>void;onGuide:()=>void}) {
 const intakeFull=Boolean(intakeSettings && (!intakeSettings.intake_open || (intakeSettings.application_limit!==null && intakeSettings.application_count>=intakeSettings.application_limit)));
 return <>
  <section className="hero"><div className="hero-copy"><div className="eyebrow">— COMPETE WITH PURPOSE</div><h1>BUILT FOR THE<br/><em>NEXT LEVEL.</em></h1><p>A CODM community for players who value teamwork, respect, and growth. Find your squad, sharpen your skills, and make your mark with ASY.</p><div className="actions"><button className="primary" onClick={onApply}>Apply to join <ArrowRight size={16}/></button><button className="secondary" onClick={onRoster}>Meet the community <Users size={16}/></button></div><div className="trust"><span><ShieldCheck size={15}/> Fair review process</span><span><Zap size={15}/> Competitive mindset</span></div></div>
   <div className="art"><div className="grid"/><div className="ring"/><div className="emblem"><img src="https://asy-clan-recruitment-1h073y.v2.appdeploy.ai/resources/asylum-community-logo.png" alt="Asylum Community emblem" onError={event=>{event.currentTarget.style.opacity='0';}}/></div><div className="art-top"><i className={intakeFull?'off':''}/> {intakeFull?'APPLICATIONS CLOSED':'MEMBERSHIP OPEN'}</div><div className="art-bottom"><b>ASYLUM</b><span>PLAY TOGETHER. GROW TOGETHER.</span></div><div className="vertical">ASYLUM COMMUNITY // CODM</div></div>
   <div className="hero-foot"><span>01 / JOIN THE COMMUNITY</span><span>PHILIPPINES · GLOBAL PLAYERS WELCOME</span></div>
  </section>
  <section className="features"><Feature icon={<Crosshair/>} title="Competitive play" desc="Improve together through ranked and scrims."/><Feature icon={<Users/>} title="Team-first culture" desc="Respect, communication, and consistency."/><Feature icon={<Trophy/>} title="Earn your spot" desc="Every application gets a fair review."/></section>
  <section className="community-tools"><div className="journey-heading"><small>MORE FROM ASYLUM</small><h2>ONE COMMUNITY. <em>MORE IN ONE PLACE.</em></h2><p>Follow one clear roadmap instead of searching through old chats for each instruction.</p></div><div className="community-tools-grid">
    <article className="community-tool active"><span className="community-tool-icon"><ClipboardList size={20}/></span><small className="tool-state">AVAILABLE NOW</small><h3>Screening guide</h3><p>Eligibility, post-acceptance requirements, official links, and the full checklist in one place.</p><button className="text-link" onClick={onGuide}>Open screening guide <ArrowRight size={14}/></button></article>
    <article className="community-tool"><span className="community-tool-icon"><Users size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Teams & referrals</h3><p>A single place for team interest, referral details, and recruitment follow-up.</p><span className="tool-note">Needs management workflow and database fields.</span></article>
    <article className="community-tool"><span className="community-tool-icon"><Swords size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Scrim hub</h3><p>Centralize scrim schedules, team requests, and match results when management is ready.</p><span className="tool-note">Scheduling and match records are not enabled yet.</span></article>
    <article className="community-tool"><span className="community-tool-icon"><ShieldCheck size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Player reports</h3><p>A structured report form with evidence, context, and private management review.</p><span className="tool-note">Use the current official staff channel until this tool is enabled.</span></article>
  </div></section>
  <section className="journey"><div className="journey-heading"><small>THE ASY RECRUITMENT ROADMAP</small><h2>ONE SQUAD. <em>THREE CLEAR STEPS.</em></h2><p>No guessing, no confusing process. Here is what happens after you apply.</p></div><div className="journey-grid"><article className="journey-card"><span className="journey-number">01</span><ClipboardList size={22}/><h3>Send your application</h3><p>Share your CODM details, playstyle, and the best email to reach you.</p></article><article className="journey-card"><span className="journey-number">02</span><CalendarClock size={22}/><h3>Recruiters review it</h3><p>The team checks your application and updates its status as the review moves forward.</p></article><article className="journey-card"><span className="journey-number">03</span><CheckCircle2 size={22}/><h3>Track every step</h3><p>Your reference code and application email let you check your latest status anytime.</p></article></div><div className="journey-footer"><p><ShieldCheck size={17}/> Your tracking code appears after submission and is saved on this browser for next time.</p><button className="text-link" onClick={onTrack}>Already applied? Track your application <ArrowRight size={15}/></button></div></section>
  <section className="callout"><div><small>YOUR NEXT MOVE</small><h2>SHOW US WHAT YOU BRING.</h2><p>Tell us your role, your goals, and how you play.</p></div><button className="primary" onClick={onApply}>Start application <ArrowRight size={16}/></button></section>
 </>;
}
function ScreeningGuide({intakeSettings}:{intakeSettings:IntakeSettings|null}) {
  const [checked,setChecked]=useState<Record<string,boolean>>({});
  const preApply=[
    ['age','I am at least 16 years old.'],
    ['series','I have at least 6 Legendary Series in BR or MP.'],
    ['fb','My Facebook name is appropriate and not random/inappropriate.'],
    ['tag','I am willing to add the ASY tag after my IGN on my main CODM and TikTok accounts.'],
    ['photo','I am willing to submit a proper roster photo for the welcome banner.'],
  ];
  const postAccept=[
    ['codm','Screenshot of my main CODM account with the ASY tag after my IGN.'],
    ['tiktok','Screenshot of my TikTok account with the ASY tag after my IGN.'],
    ['follow','Screenshot proving I follow the official ASY Community TikTok account.'],
    ['form','Screenshot of my completed Membership Form showing my IGN.'],
    ['discord','My Discord server nickname is set to IGN ASY.'],
    ['roster','I have my roster photo ready; my Facebook name goes in the caption and I follow the admin reference.'],
  ];
  const toggle=(key:string)=>setChecked(old=>({...old,[key]:!old[key]}));
  return <section className="page screening-page">
    <Heading kicker="04 / ONE-STOP RECRUITMENT GUIDE" title={<>YOUR ASY <em>CHECKLIST.</em></>} desc="Use this step-by-step roadmap from eligibility to the requirements after Screening GC acceptance."/>
    <div className={'panel guide-intake '+(intakeSettings && (!intakeSettings.intake_open || (intakeSettings.application_limit!==null && intakeSettings.application_count>=intakeSettings.application_limit))?'closed':'open')}><span className="intake-dot"/><div><strong>{!intakeSettings?'Checking intake status…':!intakeSettings.intake_open?'Applications are temporarily closed':intakeSettings.application_limit!==null&&intakeSettings.application_count>=intakeSettings.application_limit?'Application limit reached':'Recruitment intake is open'}</strong><p>{intakeSettings?.application_limit!==null&&intakeSettings?`${intakeSettings.application_count} of ${intakeSettings.application_limit} applications used in this intake.`:'Review the requirements below before applying. Submitting an application does not guarantee acceptance.'}</p></div></div>
    <div className="guide-grid">
      <section className="panel guide-card"><small className="kicker">STEP 01 / BEFORE APPLYING</small><h2>Check eligibility</h2><p>Tick each item as you verify it. This checklist stays in this browser session and is not sent to recruiters.</p>
        <div className="screening-checks">{preApply.map(([key,label])=><label className="screening-check" key={key}><input type="checkbox" checked={!!checked[key]} onChange={()=>toggle(key)}/><span>{label}</span></label>)}</div>
      </section>
      <section className="panel guide-card"><small className="kicker">STEP 02 / AFTER ACCEPTANCE</small><h2>Screening requirements</h2><p>These items are required after recruiters accept you into the Screening GC. They are not all required at initial application.</p>
        <div className="screening-checks">{postAccept.map(([key,label])=><label className="screening-check" key={key}><input type="checkbox" checked={!!checked[key]} onChange={()=>toggle(key)}/><span>{label}</span></label>)}</div>
      </section>
    </div>
    <section className="panel guide-links"><small className="kicker">STEP 03 / OFFICIAL RESOURCES</small><h2>Keep the official links together</h2><p>Open the right resource from here instead of searching old messages.</p>
      <div className="guide-link-grid"><a href="https://www.tiktok.com/@asy.community?_t=ZS-8wNEx3vdVab&_r=1" target="_blank" rel="noreferrer"><b>ASY Community TikTok</b><span>Follow the official account <ArrowRight size={14}/></span></a><a href="https://docs.google.com/forms/d/e/1FAIpQLSfNfTuj1lu9m6uG1OVyppUUwI-T5GdQNIJJNQjjBnN2SVGhGw/viewform" target="_blank" rel="noreferrer"><b>Membership Form</b><span>Complete the membership form <ArrowRight size={14}/></span></a><a href="https://discord.gg/HbJ5Jvw8y8" target="_blank" rel="noreferrer"><b>Official ASY Discord</b><span>Nickname, roster photo, and staff guidance <ArrowRight size={14}/></span></a></div>
    </section>
    <section className="panel guide-note"><ShieldCheck size={20}/><div><strong>Submission note</strong><p>This page centralizes the instructions and links. Secure screenshot uploads are not enabled yet, so until the private upload portal is configured, follow the recruitment admins’ latest submission instructions. Never post private screenshots, email addresses, passwords, or account codes in public channels.</p></div></section>
  </section>;
}

function RosterPage({roster,onApply}:{roster:Roster[];onApply:()=>void}) {
 return <section className="page"><Heading kicker="03 / OUR PLAYERS" title={<>THE ASYLUM <em>COMMUNITY.</em></>} desc="Meet the active members of Asylum Community."/>
 {roster.length===0?<div className="panel empty"><Users size={38}/><h2>Community roster coming together.</h2><p>Approved community members can appear here once recruitment starts.</p><button className="secondary" onClick={onApply}>Be one of the first <ArrowRight size={15}/></button></div>:<div className="roster-grid">{roster.map((member,index)=><div className="roster-card" key={member.id}><span className="number">{String(index+1).padStart(2,'0')}</span><div className="avatar"><Swords size={27}/></div><small>{member.rank}</small><h3>{member.ign}</h3><span className="role">{member.main_role}</span><footer><i/> ACTIVE <span>CODM</span></footer></div>)}</div>}
 <section className="callout"><div><small>NEXT UP COULD BE YOU</small><h2>READY TO JOIN ASYLUM COMMUNITY?</h2><p>Bring your best game and a team-first mindset.</p></div><button className="primary" onClick={onApply}>Apply now <ArrowRight size={16}/></button></section></section>;
}
function Heading({kicker,title,desc}:{kicker:string;title:React.ReactNode;desc:string}){return <div className="heading"><small>{kicker}</small><h1>{title}</h1><p>{desc}</p></div>;}
function Field({label,children}:{label:string;children:React.ReactNode}){return <label className="field"><span>{label}</span>{children}</label>;}
function Section({n,title,sub}:{n:string;title:string;sub:string}){return <div className="section-title"><b>{n}</b><div><strong>{title}</strong><small>{sub}</small></div></div>;}
function Feature({icon,title,desc}:{icon:React.ReactNode;title:string;desc:string}){return <div className="feature"><span>{icon}</span><div><b>{title}</b><small>{desc}</small></div></div>;}
function Stat({icon,label,value}:{icon:React.ReactNode;label:string;value:number}){return <div className="stat"><span>{icon}</span><div><small>{label}</small><b>{value}</b></div></div>;}

type ChatLink = { label: string; href: string };
type ChatEntry = { role: 'assistant' | 'user'; text: string; links?: ChatLink[] };

const screeningLinks: ChatLink[] = [
  { label: 'ASY Community TikTok', href: 'https://www.tiktok.com/@asy.community?_t=ZS-8wNEx3vdVab&_r=1' },
  { label: 'Membership Form', href: 'https://docs.google.com/forms/d/e/1FAIpQLSfNfTuj1lu9m6uG1OVyppUUwI-T5GdQNIJJNQjjBnN2SVGhGw/viewform' },
  { label: 'Official Discord', href: 'https://discord.gg/HbJ5Jvw8y8' },
];

function getRecruitmentReply(question: string, intakeSettings: IntakeSettings|null): Omit<ChatEntry, 'role'> {
  const q = question.toLowerCase();
  if (/accepted|screening gc|screening group|requirements after|screenshot|roster photo|cooldown|cool down|gc nickname/.test(q)) {
    return {
      text: `If you've been accepted into the ASY Screening GC, follow these steps:

1. If your CODM or TikTok name is still in cooldown, set your GC nickname to: IGN.DATE.CODM/TIKTOK.
2. Send a screenshot of your main CODM account with the ASY tag AFTER your IGN.
3. Send a screenshot of your TikTok account with the ASY tag AFTER your IGN.
4. Send proof that you follow the official ASY Community TikTok account.
5. Submit the Membership Form and provide a screenshot showing your IGN.
6. In Discord, set your server nickname to: IGN ASY.
7. Upload your proper roster photo in Discord. Put your Facebook name in the caption first, and follow the photo references from the admin.
8. Submit the requested proofs in the Screening GC as instructed by the admins.

Important: the Screening GC invite is sent only when your CODM account already shows the ASY tag. Never send passwords or account login codes.`,
      links: screeningLinks,
    };
  }
  if (/eligible|eligibility|age|16\+|leg series|legendary series|requirements to join|requirements before|before applying/.test(q)) {
    return {
      text: `Before applying, check that you meet the current ASY recruitment requirements:

• At least 16 years old.
• At least 6 Legendary Series in BR or MP.
• Use an appropriate Facebook name (no inappropriate or random names).
• Be willing to add the ASY tag AFTER your IGN on your main CODM and TikTok accounts.
• Be willing to submit a proper roster photo for the welcome banner.

The Screening GC invite is sent only after the ASY tag appears on your CODM account. Final screening decisions are made by the recruitment team.`,
      links: screeningLinks,
    };
  }
  if (/tiktok|follow/.test(q)) {
    return {
      text: 'Please follow the official Asylum Community TikTok account. If you are already accepted into the Screening GC, send a screenshot showing that you follow it with your other required proofs.',
      links: [screeningLinks[0]],
    };
  }
  if (/membership form|form link|member form/.test(q)) {
    return {
      text: 'Use the official Membership Form. After completing it, make sure your IGN is visible in the screenshot if you have been accepted into the Screening GC.',
      links: [screeningLinks[1]],
    };
  }
  if (/discord|server nickname|roster photo|banner photo/.test(q)) {
    return {
      text: 'Join the official ASY Discord. After you are accepted into the Screening GC, set your server nickname to IGN ASY and upload your roster photo using the admin-provided reference. Include your Facebook name in the caption.',
      links: [screeningLinks[2]],
    };
  }
  if (/apply|application|join|recruitment/.test(q)) {
    return {
      text: 'To join ASY, open “Apply to join” on this website and complete the application honestly. Save the ASYLUM tracking code shown after submission, then use “Track application” to check your status. Meeting the minimum requirements does not guarantee acceptance; recruiters review every application.',
    };
  }
  if (/status|tracking|tracking code|pending|review/.test(q)) {
    return {
      text: 'Choose “Track application” on this website and enter the tracking code plus the same contact email you used when applying. The website shows the latest status saved by the recruitment team.',
    };
  }
  if (/limit|slots|capacity|how many applicants/.test(q)) {
    if (!intakeSettings) return { text: 'I could not load the current intake status. Please refresh the page or check with an ASY recruiter.' };
    if (!intakeSettings.intake_open) return { text: 'Recruitment submissions are currently closed by management. Please check the official ASY announcements for the next intake.' };
    if (intakeSettings.application_limit !== null && intakeSettings.application_count >= intakeSettings.application_limit) return { text: 'The current recruitment application limit has been reached. Please check back after management opens a new intake.' };
    if (intakeSettings.application_limit === null) return { text: 'Recruitment is open right now. Management has not set a numeric application cap for this intake, so please submit only one application and wait for its status.' };
    return { text: `Recruitment is open. ${intakeSettings.application_count} of ${intakeSettings.application_limit} application slots have been used in this intake. Please submit only one application.` };
  }
  if (/human|admin|recruiter|staff|help|assist/.test(q)) {
    return {
      text: 'I can answer common recruitment questions here. For a case that needs a human decision, contact the recruitment team through the official Discord and follow the admins’ instructions.',
      links: [screeningLinks[2]],
    };
  }
  return {
    text: 'I can help with ASY eligibility, how to apply, application tracking, or the requirements after you are accepted into the Screening GC. Try asking “What are the screening GC requirements?” or tap one of the quick questions below.',
  };
}

function ChatSupport({intakeSettings}:{intakeSettings:IntakeSettings|null}) {
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState('');
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<ChatEntry[]>([
    {role:'assistant',text:'Hi! I’m the ASY Recruitment Assistant. Ask me about eligibility, applying, tracking, or what to prepare at each screening step. Recruiters make all final decisions.'},
  ]);

  async function ask(question:string) {
    const cleanQuestion=question.trim().slice(0,500);
    if(!cleanQuestion||chatBusy)return;
    const fallback=getRecruitmentReply(cleanQuestion,intakeSettings);
    const history=messages.slice(-8).map(item=>({role:item.role,text:item.text.slice(0,500)}));
    setMessages(old=>[...old,{role:'user',text:cleanQuestion}]);
    setChatBusy(true);
    let answerText='';
    try {
      const response=await fetch('/api/support-chat',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({question:cleanQuestion,history}),
      });
      const data=await response.json().catch(()=>({}));
      if(response.ok&&data.configured===true&&typeof data.answer==='string'&&data.answer.trim()) answerText=data.answer.trim();
    } catch {
      // Keep the curated FAQ available if the AI route is not configured or temporarily unavailable.
    }
    setChatBusy(false);
    setMessages(old=>[...old,{role:'assistant',...(answerText?{text:answerText,links:fallback.links}:{...fallback})}]);
  }

  function sendMessage(event:FormEvent) {
    event.preventDefault();
    const question=draft.trim();
    if(!question)return;
    setDraft('');
    void ask(question);
  }

  return (
    <div className="chat-support">
      {open&&<section className="chat-panel" role="dialog" aria-label="ASY Recruitment Support">
        <header className="chat-header">
          <span className="chat-bot-icon"><Bot size={19}/></span>
          <div><strong>ASY Recruitment Support</strong><small>AI assistant + official recruitment guide</small></div>
          <button type="button" aria-label="Close chat" onClick={()=>setOpen(false)}><X size={18}/></button>
        </header>
        <div className="chat-messages" aria-live="polite">
          {messages.map((message,index)=><div key={index} className={'chat-message '+message.role}>
            <p>{message.text}</p>
            {message.links?.length?<div className="chat-links">{message.links.map(link=><a key={link.href} href={link.href} target="_blank" rel="noreferrer">{link.label} <ArrowRight size={12}/></a>)}</div>:null}
          </div>)}
          {chatBusy&&<div className="chat-message assistant"><p>Checking the ASY guide…</p></div>}
          {messages.length===1&&<div className="chat-quick-questions">
            <button type="button" disabled={chatBusy} onClick={()=>void ask('What are the eligibility requirements before applying?')}>Eligibility</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('What are the requirements after accepted into the Screening GC?')}>Screening GC requirements</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('How do I track my application?')}>Track application</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('Is there a limit on applications?')}>Application limit</button>
          </div>}
        </div>
        <form className="chat-input-row" onSubmit={sendMessage}>
          <input value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Ask about ASY recruitment…" aria-label="Ask about ASY recruitment" maxLength={500} disabled={chatBusy}/>
          <button type="submit" disabled={!draft.trim()||chatBusy} aria-label="Send message"><Send size={17}/></button>
        </form>
        <p className="chat-disclaimer">AI replies use a private server key; official FAQ answers remain the fallback. Recruiters make final decisions.</p>
      </section>}
      <button type="button" className="chat-launcher" aria-label={open?'Close support chat':'Open support chat'} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
        {open?<X size={23}/>:<MessageCircle size={24}/>}
        {!open&&<span>ASK ASY</span>}
      </button>
    </div>
  );
}
