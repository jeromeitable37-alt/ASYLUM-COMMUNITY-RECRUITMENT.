import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createClient, Session } from '@supabase/supabase-js';
import { ApplicantNotificationPanel, OperationsHub } from './OperationsHub';
import StaffPushSettings, { disconnectStaffPush } from './StaffPushSettings';
import { Download, ArrowRight, BadgeCheck, Bot, CalendarClock, CheckCircle2, ClipboardList, Copy, Crosshair, Gamepad2, LogIn, LogOut, Mail, MessageCircle, Search, Send, ShieldCheck, Swords, Trophy, Upload, Users, X, Zap } from 'lucide-react';

const SUPABASE_URL = 'https://tyhszzztltamrohhyykh.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_cue7psRXDt6h-1oSAwnpIw_ro8Tvecn';
const EVIDENCE_API_URL = SUPABASE_URL + '/functions/v1/asy-recruitment-evidence';
const MESSAGING_API_URL = SUPABASE_URL + '/functions/v1/asy-community-messaging';
const OPERATIONS_API_URL = SUPABASE_URL + '/functions/v1/asy-operations';
const CASUAL_SHEETS_PILOT_API_URL = SUPABASE_URL + '/functions/v1/asy-casual-sheet-pilot';
const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
type Application = { id:string; application_code:string; ign:string; codm_uid:string; contact_email:string; discord_username:string|null; applicant_facebook_url:string|null; applicant_tiktok_url:string|null; streamer_mode_id:string|null; applicant_facebook_name:string|null; applicant_birthdate:string|null; applicant_clan_name:string|null; legendary_requirement_confirmed:boolean; mgc_verification_status:'not_checked'|'contact_needed'|'issue_found'|'verified'; mgc_applicant_contacted:boolean; mgc_checked_by_email:string|null; mgc_checked_at:string|null; mgc_verification_notes:string|null; region:string; rank:string; level:number|null; main_role:string; preferred_mode:string; availability:string; clan_experience:string|null; reason:string; status:string; reviewer_notes:string|null; application_type:'casual'|'referral'; referrer_name:string|null; referrer_facebook_url:string|null; meets_age_requirement:boolean; age_verification_status:'pending'|'verified'|'underage'|'needs_confirmation'; age_verified_by_email:string|null; age_verified_at:string|null; age_verification_notes:string|null; application_details_verified:boolean; application_details_verified_by_email:string|null; application_details_verified_at:string|null; membership_form_response_verified:boolean; membership_form_response_verified_by_email:string|null; membership_form_response_verified_at:string|null; legendary_series_count:number; legendary_series_mp:number|null; legendary_series_br:number|null; workflow_step:string; submitted_at:string; updated_at:string };
type Evidence = { id?:string; application_id?:string; requirement_key:string; requirement_label:string; stage_number:number; is_required?:boolean; status:'locked'|'not_submitted'|'pending'|'approved'|'needs_correction'; storage_path?:string|null; file_name?:string|null; content_type?:string|null; file_size_bytes?:number|null; applicant_note?:string|null; reviewer_notes?:string|null; submitted_at?:string|null; reviewed_at?:string|null; reviewed_by_email?:string|null };
type ApplicantProgress = { application:{application_code:string;ign:string;status:string;workflow_step:string;application_type:'casual'|'referral';submitted_at:string};evidence:Evidence[] };
type Roster = { id:string; ign:string; main_role:string; rank:string; member_status:string; joined_at:string; clan_name?:string|null };
type SavedApplication = { application_code:string; contact_email:string; ign:string; submitted_at:string };
type MemberAccount = { user_id:string; display_name:string; ign:string; codm_uid:string; discord_username:string; photo_url:string; approval_status:'pending'|'approved'|'rejected'; review_note:string|null; linked_application_id:string|null; linked_at:string|null; created_at:string; updated_at:string };
type LinkedMemberApplication = { application_code:string; ign:string; status:string; workflow_step:string; submitted_at:string; updated_at:string };
type AdminAccessRequest = { id:string; user_id:string; email:string; display_name:string; reason:string; status:'pending'|'approved'|'rejected'; reviewed_by_email:string|null; reviewed_at:string|null; created_at:string };
type MemberReviewProfile = { user_id:string; display_name:string; ign:string; codm_uid:string; discord_username:string; photo_url:string; approval_status:'pending'|'approved'|'rejected'; review_note:string|null; linked_application_id:string|null; created_at:string; updated_at:string; email?:string; role?:string|null; is_disabled?:boolean };
type IntakeSettings = { id:number; intake_open:boolean; application_limit:number|null; application_count:number; cycle_started_at:string; updated_at:string; screening_admin_url:string; casual_sheet_live_enabled:boolean };
type Announcement = { id:string; title:string; body:string; category:'general'|'recruitment'|'event'|'maintenance'; is_published:boolean; created_at:string; updated_at?:string; published_at?:string|null; created_by_email?:string; updated_by_email?:string|null };
type CommunityChatMessage = { id:string; display_name:string; body:string; created_at:string };
type ApplicationChatMessage = { id:string; application_id:string; sender_role:'applicant'|'recruiter'; sender_name:string; body:string; created_at:string; attachment_url?:string|null; attachment_type?:string|null; attachment_name?:string|null; applicant_read_at?:string|null; recruiter_read_at?:string|null };
function renderApplicationMessage(body:string){return body.split(/(https?:\/\/[^\s]+)/g).map((part,index)=>/^https?:\/\//i.test(part)?<a key={index} href={part} target="_blank" rel="noreferrer">{part}</a>:part);}
const emptyAnnouncementDraft = {id:'',title:'',body:'',category:'general' as Announcement['category'],is_published:true};
const statuses = ['pending','reviewing','interview','tryout','accepted','rejected','waitlisted'];
const labels: Record<string,string> = { pending:'Pending review', reviewing:'In review', interview:'Interview', tryout:'Tryout', accepted:'Accepted', rejected:'Rejected', waitlisted:'Waitlisted' };
const DEFAULT_SCREENING_ADMIN_URL = 'https://www.facebook.com/Shallow.Laren/';
const isValidScreeningAdminUrl = (value:string) => {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' &&
      ['facebook.com','www.facebook.com','m.facebook.com','fb.com','www.fb.com'].includes(url.hostname.toLowerCase()) &&
      url.pathname.length > 1 &&
      !url.username && !url.password;
  } catch { return false; }
};
const blankForm = { applicationType:'casual', referrerName:'', referrerFacebookUrl:'', applicantFacebookUrl:'', applicantTikTokUrl:'', streamerModeId:'', facebookName:'', birthdate:'', clanName:'', legendaryRequirementConfirmed:false, ageConfirmed:'', legendaryMpCount:'0', legendaryBrCount:'0', facebookNameAppropriate:false, willingToAddTag:false, willingToSubmitPhoto:false, ign:'', uid:'', email:'', discord:'', region:'Philippines', rank:'Grand Master', level:'', role:'Slayer', mode:'Ranked Multiplayer', availability:'Evenings / weekends', experience:'', reason:'' };
const createCode = () => { const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; const bytes=new Uint8Array(8); crypto.getRandomValues(bytes); return 'ASYLUM-'+Array.from(bytes,b=>alphabet[b%alphabet.length]).join(''); };
const isAllowedProfileUrl=(value:string,domains:string[])=>{
  if(!value.trim())return true;
  try{
    const url=new URL(value.trim());
    return (url.protocol==='https:'||url.protocol==='http:')&&domains.some(domain=>url.hostname===domain||url.hostname.endsWith('.'+domain));
  }catch{return false;}
};
const mgcStatusLabels:Record<Application['mgc_verification_status'],string>={not_checked:'Not checked',contact_needed:'Applicant contact needed',issue_found:'Form issue found',verified:'Manually verified'};

export default function App() {
  const [page,setPage]=useState('home');
  const [session,setSession]=useState<Session|null>(null);
  const [authorized,setAuthorized]=useState(false);
  const [staffRole,setStaffRole]=useState<string|null>(null);
  const [notice,setNotice]=useState('');
  const [hasError,setHasError]=useState(false);
  const [busy,setBusy]=useState(false);
  const [mobileOpen,setMobileOpen]=useState(false);
  const [email,setEmail]=useState('jeromeitable37@gmail.com');
  const [password,setPassword]=useState('');
  const [resetSource,setResetSource]=useState<'recruiter'|'member'>('member');
  const [resetEmail,setResetEmail]=useState('');
  const [resetEmailSent,setResetEmailSent]=useState(false);
  const [resetRecoveryActive,setResetRecoveryActive]=useState(false);
  const [resetNewPassword,setResetNewPassword]=useState('');
  const [resetConfirmPassword,setResetConfirmPassword]=useState('');
  const [resetBusy,setResetBusy]=useState(false);
  const [accountMode,setAccountMode]=useState<'signup'|'signin'>('signup');
  const [accountEmail,setAccountEmail]=useState('');
  const [accountPassword,setAccountPassword]=useState('');
  const [accountDisplayName,setAccountDisplayName]=useState('');
  const [accountIgn,setAccountIgn]=useState('');
  const [accountUid,setAccountUid]=useState('');
  const [accountDiscord,setAccountDiscord]=useState('');
  const [accountPhotoUrl,setAccountPhotoUrl]=useState('');
  const [accountProfile,setAccountProfile]=useState<MemberAccount|null>(null);
  const [linkedMemberApplication,setLinkedMemberApplication]=useState<LinkedMemberApplication|null>(null);
  const [accountAdminRequest,setAccountAdminRequest]=useState<AdminAccessRequest|null>(null);
  const [accountAdminReason,setAccountAdminReason]=useState('');
  const [accountLinkCode,setAccountLinkCode]=useState('');
  const [accountBusy,setAccountBusy]=useState(false);
  const [avatarUploading,setAvatarUploading]=useState(false);
  const [adminAccessRequests,setAdminAccessRequests]=useState<AdminAccessRequest[]>([]);
  const [memberReviewProfiles,setMemberReviewProfiles]=useState<MemberReviewProfile[]>([]);
  const [expandedManagedUser,setExpandedManagedUser]=useState<string|null>(null);
  const [userManagementQuery,setUserManagementQuery]=useState('');
  const [memberReviewNotes,setMemberReviewNotes]=useState<Record<string,string>>({});
  const [applications,setApplications]=useState<Application[]>([]);
  const [roster,setRoster]=useState<Roster[]>([]);
  const [query,setQuery]=useState('');
  const [filter,setFilter]=useState('all');
  const [selected,setSelected]=useState<Application|null>(null);
  const [editApplicationType,setEditApplicationType]=useState<'casual'|'referral'>('casual');
  const [editSaveFeedback,setEditSaveFeedback]=useState<{applicationId:string;kind:'success'|'error'|'info';message:string}|null>(null);
  const [notes,setNotes]=useState('');
  const [mgcNotes,setMgcNotes]=useState('');
  const [mgcContactConfirmed,setMgcContactConfirmed]=useState(false);
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
  const [casualWebsiteSync,setCasualWebsiteSync]=useState<{code:string;state:'testing'|'verified'|'queued'|'failed';message:string}|null>(null);
  const casualWebsiteSyncInFlight=useRef<Set<string>>(new Set());
  const rejectedSheetCleanupInFlight=useRef(false);
  const [screeningAdminUrl,setScreeningAdminUrl]=useState(DEFAULT_SCREENING_ADMIN_URL);
  const [screeningAdminDraft,setScreeningAdminDraft]=useState(DEFAULT_SCREENING_ADMIN_URL);
  const [screeningAdminSaving,setScreeningAdminSaving]=useState(false);
  const [applicantProgress,setApplicantProgress]=useState<ApplicantProgress|null>(null);
  const [evidenceServiceConfigured,setEvidenceServiceConfigured]=useState<boolean|null>(null);
  const [evidenceUploadKey,setEvidenceUploadKey]=useState('');
  const [selectedEvidence,setSelectedEvidence]=useState<Evidence[]>([]);
  const [evidenceNotes,setEvidenceNotes]=useState<Record<string,string>>({});
  const [applicantEvidenceNotes,setApplicantEvidenceNotes]=useState<Record<string,string>>({});
  const [announcements,setAnnouncements]=useState<Announcement[]>([]);
  const [announcementDraft,setAnnouncementDraft]=useState(emptyAnnouncementDraft);
  const [announcementBusy,setAnnouncementBusy]=useState(false);
  const [communityMessages,setCommunityMessages]=useState<CommunityChatMessage[]>([]);
  const [communityDisplayName,setCommunityDisplayName]=useState('');
  const [communityDraft,setCommunityDraft]=useState('');
  const [communityChatBusy,setCommunityChatBusy]=useState(false);
  const [applicantMessages,setApplicantMessages]=useState<ApplicationChatMessage[]>([]);
  const [applicantMessageDraft,setApplicantMessageDraft]=useState('');
  const [applicantMessageBusy,setApplicantMessageBusy]=useState(false);
  const [adminApplicationMessages,setAdminApplicationMessages]=useState<ApplicationChatMessage[]>([]);
  const [adminMessageDraft,setAdminMessageDraft]=useState('');
  const [applicantChatFile,setApplicantChatFile]=useState<File|null>(null);
  const [adminChatFile,setAdminChatFile]=useState<File|null>(null);
  const [adminMessageBusy,setAdminMessageBusy]=useState(false);
  const [desktopAlerts,setDesktopAlerts]=useState(false);
  const [alertCount,setAlertCount]=useState(0);
  const [alertHistory,setAlertHistory]=useState<string[]>([]);
  const appSeen=useRef<Set<string>|null>(null);
  const messageSeen=useRef<Map<string,Set<string>>>(new Map());
  function playStaffAlert(title:string,body:string,applicationId?:string){
    setAlertCount(v=>v+1);
    setAlertHistory(v=>[title+' — '+body,...v].slice(0,20));
    if(!desktopAlerts)return;
    try{
      const AudioContextClass=window.AudioContext;
      if(AudioContextClass){const ctx=new AudioContextClass();const oscillator=ctx.createOscillator();const gain=ctx.createGain();oscillator.type='sine';oscillator.frequency.value=780;gain.gain.value=.07;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+.16);oscillator.onended=()=>void ctx.close();}
    }catch{}
    if('Notification' in window&&Notification.permission==='granted'){
      try{
        const notification=new Notification(title,{body,icon:'/favicon.ico',tag:'asy-'+Date.now()});
        notification.onclick=()=>{window.focus();if(applicationId)void openStaffNotificationApplication(applicationId);notification.close();};
      }catch{}
    }
  }
  async function enableStaffAlerts(){
    if(!('Notification' in window)){notify('System notifications are not supported in this browser. In-app alerts will still work.',true);return;}
    const permission=await Notification.requestPermission();
    if(permission==='granted'){setDesktopAlerts(true);notify('Notifications enabled while the website is open.');}
    else notify('Notification permission was not granted. You can still see in-app alerts.',true);
  }
  useEffect(()=>{
    if(page!=='admin'||!authorized||!session?.access_token){appSeen.current=null;messageSeen.current.clear();return;}
    let cancelled=false;
    async function checkNewApplications(){
      const {data,error}=await supabase.from('asy_clan_applications').select('id,ign,submitted_at').order('submitted_at',{ascending:false}).limit(100);
      if(error||cancelled)return;
      const ids=new Set((data||[]).map(row=>row.id as string));
      if(appSeen.current!==null){
        const added=(data||[]).filter(row=>!appSeen.current?.has(row.id));
        if(added.length){
          if(added.length===1)playStaffAlert('New application: '+(added[0].ign||'Applicant'),'Open Recruiter Dashboard to review.',added[0].id);
          else playStaffAlert(added.length+' new applications','Open Recruiter Dashboard to review them.');
        }
      }
      appSeen.current=ids;
    }
    void checkNewApplications();
    const timer=window.setInterval(()=>void checkNewApplications(),15000);
    return()=>{cancelled=true;window.clearInterval(timer);};
  },[page,authorized,session?.access_token,desktopAlerts]);
  useEffect(()=>{
    if(page!=='admin'||!selected?.id||!authorized)return;
    const appId=selected.id;
    const current=new Set(adminApplicationMessages.map(message=>message.id));
    const seen=messageSeen.current.get(appId);
    if(seen&&current.size){
      const fresh=adminApplicationMessages.filter(message=>message.sender_role==='applicant'&&!seen.has(message.id));
      if(fresh.length)playStaffAlert('Message from '+selected.ign,selected.ign+' sent '+fresh.length+' private message'+(fresh.length>1?'s':'')+'.',selected.id);
    }
    messageSeen.current.set(appId,current);
  },[adminApplicationMessages,selected?.id,page,authorized]);
  const notify=(message:string,isError=false)=>{setNotice(message);setHasError(isError);};
  const intakeFull=Boolean(intakeSettings && (!intakeSettings.intake_open || (intakeSettings.application_limit!==null && intakeSettings.application_count>=intakeSettings.application_limit)));
  const intakeUsagePercent=intakeSettings?.application_limit ? Math.min(100,Math.round((intakeSettings.application_count/intakeSettings.application_limit)*100)) : 0;
  const updateForm=(key:keyof typeof form,value:string)=>setForm(old=>({...old,[key]:value}));

  useEffect(()=>{void loadIntakeSettings();void loadAnnouncements();},[]);
  useEffect(()=>{try{const raw=localStorage.getItem('asy-recruitment:last-application');if(raw){const saved=JSON.parse(raw) as SavedApplication;if(saved.application_code&&saved.contact_email){setSavedApplication(saved);setApplicationCode(saved.application_code);setContactEmail(saved.contact_email);}}}catch{}},[]);
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>setSession(data.session));
    const {data:listener}=supabase.auth.onAuthStateChange((event,next)=>{
      setSession(next);
      if(event==='PASSWORD_RECOVERY'){
        const source=new URLSearchParams(window.location.search).get('password-reset');
        setResetSource(source==='recruiter'?'recruiter':'member');
        setResetRecoveryActive(true);
        setResetEmailSent(false);
        setPage('reset-password');
        setNotice('Email verified. Choose a new password for your ASY account.');
        setHasError(false);
      }
    });
    return()=>listener.subscription.unsubscribe();
  },[]);
  useEffect(()=>{if(session?.user.email) void checkAdmin(session.user.email);else setAuthorized(false);},[session]);
  useEffect(()=>{if(page==='roster')void loadRoster();if(page==='account'&&session)void loadMemberAccount();if(page==='admin'&&session&&authorized){void loadIntakeSettings();void loadApplications();void loadAnnouncements();void loadMemberAccountReviews();if(staffRole==='owner')void loadAdminAccessRequests();}},[page,session,authorized,staffRole]);
  useEffect(()=>{if(page==='community'){void loadAnnouncements();void loadCommunityMessages();}},[page,authorized,session?.access_token]);
  useEffect(()=>{
    if(page!=='community')return;
    const timer=window.setInterval(()=>{void loadAnnouncements();void loadCommunityMessages();},12000);
    return()=>window.clearInterval(timer);
  },[page,authorized,session?.access_token]);
  useEffect(()=>{
    if(page!=='status'||!tracked){setApplicantMessages([]);return;}
    void loadApplicantMessages(applicationCode,contactEmail);
    const timer=window.setInterval(()=>void loadApplicantMessages(applicationCode,contactEmail),12000);
    return()=>window.clearInterval(timer);
  },[page,tracked?.application_code,applicationCode,contactEmail]);
  useEffect(()=>{
    if(page!=='status'||!tracked)return;
    const timer=window.setInterval(()=>{
      void loadApplicantProgress(applicationCode.trim(),contactEmail.trim().toLowerCase());
    },20000);
    return()=>window.clearInterval(timer);
  },[page,tracked?.application_code,applicationCode,contactEmail]);
  useEffect(()=>{
    if(page!=='admin'||!selected||!authorized){setAdminApplicationMessages([]);return;}
    void loadAdminApplicationMessages(selected.id);
    const timer=window.setInterval(()=>void loadAdminApplicationMessages(selected.id),10000);
    return()=>window.clearInterval(timer);
  },[page,selected?.id,authorized,session?.access_token]);
  useEffect(()=>{if(selected&&authorized)void loadSelectedEvidence(selected.id);else setSelectedEvidence([]);},[selected?.id,authorized]);
  useEffect(()=>{setMgcNotes(selected?.mgc_verification_notes||'');setMgcContactConfirmed(Boolean(selected?.mgc_applicant_contacted));setAdminMessageDraft('');},[selected?.id]);
  useEffect(()=>{setApplicantMessageDraft('');},[tracked?.application_code]);

  async function messagingRequest(payload:Record<string,unknown>):Promise<any>{
    const headers:Record<string,string>={apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
    if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
    const response=await fetch(MESSAGING_API_URL,{method:'POST',headers,body:JSON.stringify(payload),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Messaging service is temporarily unavailable.');
    return data;
  }
  async function loadAnnouncements(){
    try{
      const data=await messagingRequest({action:'announcements-list'});
      setAnnouncements(Array.isArray(data.announcements)?data.announcements as Announcement[]:[]);
    }catch(error){console.warn('Could not load ASY announcements.',error);}
  }
  async function loadCommunityMessages(){
    try{
      const data=await messagingRequest({action:'community-chat-list'});
      setCommunityMessages(Array.isArray(data.messages)?data.messages as CommunityChatMessage[]:[]);
    }catch(error){console.warn('Could not load community chat.',error);}
  }
  async function loadApplicantMessages(code=applicationCode,emailValue=contactEmail){
    if(!code.trim()||!emailValue.trim()||!tracked)return;
    try{
      const data=await messagingRequest({action:'application-messages-list',application_code:code.trim(),contact_email:emailValue.trim().toLowerCase()});
      setApplicantMessages(Array.isArray(data.messages)?data.messages as ApplicationChatMessage[]:[]);
    }catch(error){console.warn('Could not load private applicant messages.',error);}
  }
  async function loadAdminApplicationMessages(applicationId=selected?.id){
    if(!applicationId||!session?.access_token||!authorized)return;
    try{
      const data=await messagingRequest({action:'admin-application-messages-list',application_id:applicationId});
      setAdminApplicationMessages(Array.isArray(data.messages)?data.messages as ApplicationChatMessage[]:[]);
    }catch(error){console.warn('Could not load recruiter/applicant messages.',error);}
  }
  async function saveAnnouncement(event:FormEvent){
    event.preventDefault();
    const title=announcementDraft.title.trim();
    const body=announcementDraft.body.trim();
    if(title.length<3||!body){notify('Add a short title and announcement message.',true);return;}
    setAnnouncementBusy(true);
    try{
      await messagingRequest({action:'announcement-save',id:announcementDraft.id||undefined,title,body,category:announcementDraft.category,is_published:announcementDraft.is_published});
      setAnnouncementDraft(emptyAnnouncementDraft);
      await loadAnnouncements();
      notify(announcementDraft.is_published?'Announcement published.':'Announcement saved as a draft.');
    }catch(error){notify(error instanceof Error?error.message:'Could not save announcement.',true);}
    finally{setAnnouncementBusy(false);}
  }
  async function setAnnouncementPublished(item:Announcement,published:boolean){
    setAnnouncementBusy(true);
    try{
      await messagingRequest({action:'announcement-save',id:item.id,title:item.title,body:item.body,category:item.category,is_published:published});
      await loadAnnouncements();
      notify(published?'Announcement published.':'Announcement unpublished.');
    }catch(error){notify(error instanceof Error?error.message:'Could not update announcement.',true);}
    finally{setAnnouncementBusy(false);}
  }
  async function deleteAnnouncement(item:Announcement){
    if(!window.confirm('Delete this announcement?'))return;
    setAnnouncementBusy(true);
    try{
      await messagingRequest({action:'announcement-delete',id:item.id});
      if(announcementDraft.id===item.id)setAnnouncementDraft(emptyAnnouncementDraft);
      await loadAnnouncements();
      notify('Announcement deleted.');
    }catch(error){notify(error instanceof Error?error.message:'Could not delete announcement.',true);}
    finally{setAnnouncementBusy(false);}
  }
  async function sendCommunityMessage(event:FormEvent){
    event.preventDefault();
    const displayName=communityDisplayName.trim().slice(0,32);
    const body=communityDraft.trim().slice(0,500);
    if(displayName.length<2||!body){notify('Enter your display name and a short message.',true);return;}
    setCommunityChatBusy(true);
    try{
      await messagingRequest({action:'community-chat-send',display_name:displayName,body});
      setCommunityDraft('');
      await loadCommunityMessages();
    }catch(error){notify(error instanceof Error?error.message:'Could not send community message.',true);}
    finally{setCommunityChatBusy(false);}
  }
  async function reportCommunityMessage(message:CommunityChatMessage){
    const reason=window.prompt('Report reason: spam, harassment, personal_information, impersonation, or other','spam');
    if(!reason)return;
    const normalized=reason.trim().toLowerCase().replaceAll(' ','_');
    if(!['spam','harassment','personal_information','impersonation','other'].includes(normalized)){notify('Choose spam, harassment, personal_information, impersonation, or other.',true);return;}
    const details=window.prompt('Optional details (do not include private contact details)','')||'';
    try{
      const headers:Record<string,string>={apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
      const response=await fetch('https://tyhszzztltamrohhyykh.supabase.co/functions/v1/asy-operations',{method:'POST',headers,body:JSON.stringify({action:'chat-report',message_id:message.id,reporter_name:communityDisplayName.trim()||'Community member',reason:normalized,details}),cache:'no-store'});
      const data=await response.json().catch(()=>({}));
      if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'Could not submit report.');
      notify('Report submitted to ASY moderators.');
    }catch(error){notify(error instanceof Error?error.message:'Could not submit report.',true);}
  }
  async function hideCommunityMessage(message:CommunityChatMessage){
    if(!window.confirm('Hide this public message from the community chat?'))return;
    try{
      await messagingRequest({action:'community-chat-hide',id:message.id,moderation_note:'Hidden by authorized recruiter'});
      await loadCommunityMessages();
      notify('Community message hidden.');
    }catch(error){notify(error instanceof Error?error.message:'Could not hide message.',true);}
  }
  async function encodeChatFile(file:File|null){
    if(!file)return undefined;
    if(!['image/jpeg','image/png','image/webp','video/mp4','video/webm'].includes(file.type))throw new Error('Use JPG, PNG, WebP, MP4 or WebM.');
    const limit=file.type.startsWith('video/')?12*1024*1024:5*1024*1024;
    if(file.size>limit)throw new Error('File too large. Images: 5 MB; videos: 12 MB.');
    const base64=await new Promise<string>((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(String(reader.result).split(',')[1]||'');
      reader.onerror=()=>reject(new Error('Could not read attachment.'));
      reader.readAsDataURL(file);
    });
    return {name:file.name,type:file.type,base64};
  }
  function renderChatAttachment(message:ApplicationChatMessage){
    if(!message.attachment_url)return null;
    return <div className="chat-media">
      {message.attachment_type?.startsWith('image/')?<a href={message.attachment_url} target="_blank" rel="noreferrer"><img src={message.attachment_url} alt={message.attachment_name||'Chat screenshot'} loading="lazy"/></a>:
      message.attachment_type?.startsWith('video/')?<video controls preload="metadata" src={message.attachment_url}/>:
      <a href={message.attachment_url} target="_blank" rel="noreferrer">View attachment</a>}
      <small>{message.attachment_name}</small>
    </div>;
  }
  async function sendApplicantMessage(event:FormEvent){
    event.preventDefault();
    const body=applicantMessageDraft.trim().slice(0,2000);
    if(!tracked||(!body&&!applicantChatFile))return;
    setApplicantMessageBusy(true);
    try{
      const attachment=await encodeChatFile(applicantChatFile);
      await messagingRequest({action:'application-messages-send',application_code:applicationCode.trim(),contact_email:contactEmail.trim().toLowerCase(),body,attachment});
      setApplicantChatFile(null);
      setApplicantMessageDraft('');
      await loadApplicantMessages(applicationCode,contactEmail);
    }catch(error){notify(error instanceof Error?error.message:'Could not send your message.',true);}
    finally{setApplicantMessageBusy(false);}
  }
  async function sendAdminApplicantMessage(event:FormEvent){
    event.preventDefault();
    if(!selected)return;
    const body=adminMessageDraft.trim().slice(0,2000);
    if(!body&&!adminChatFile)return;
    setAdminMessageBusy(true);
    try{
      const attachment=await encodeChatFile(adminChatFile);
      await messagingRequest({action:'admin-application-messages-send',application_id:selected.id,body,attachment});
      setAdminChatFile(null);
      setAdminMessageDraft('');
      await loadAdminApplicationMessages(selected.id);
      notify('Reply sent to applicant.');
    }catch(error){notify(error instanceof Error?error.message:'Could not send recruiter reply.',true);}
    finally{setAdminMessageBusy(false);}
  }

  async function updateSharedScreeningAdminContact(link:string){
    if(!authorized || !session?.user.email){
      notify('Sign in as an authorized recruiter to change the screening contact.',true);
      return;
    }
    if(!isValidScreeningAdminUrl(link)){
      notify('Enter a valid HTTPS Facebook profile link for the Screening Admin.',true);
      return;
    }
    setScreeningAdminSaving(true);
    try {
      const {data,error}=await supabase.from('asy_recruitment_settings')
        .update({screening_admin_url:link,updated_at:new Date().toISOString()})
        .eq('id',1).select('screening_admin_url,updated_at').single();
      if(error||!data)throw new Error(error?.message||'Database did not confirm the change.');
      setScreeningAdminUrl(data.screening_admin_url);
      setScreeningAdminDraft(data.screening_admin_url);
      setIntakeSettings(old=>old?{...old,screening_admin_url:data.screening_admin_url,updated_at:data.updated_at}:old);
      notify('Screening Admin Facebook contact saved in Supabase. All authorized recruiters now use this shared link.');
    } catch(error) {
      notify(error instanceof Error?error.message:'Unable to save Screening Admin contact to Supabase.',true);
    } finally {
      setScreeningAdminSaving(false);
    }
  }
  async function saveScreeningAdminContact(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    await updateSharedScreeningAdminContact(screeningAdminDraft.trim());
  }
  async function resetScreeningAdminContact(){
    await updateSharedScreeningAdminContact(DEFAULT_SCREENING_ADMIN_URL);
  }
  async function sendScreeningAdminContact(){
    // Read the latest shared setting before sending so an old browser session
    // cannot accidentally send an outdated admin's Facebook profile.
    const {data,error}=await supabase.from('asy_recruitment_settings')
      .select('screening_admin_url').eq('id',1).single();
    if(error||!data||!isValidScreeningAdminUrl(data.screening_admin_url)){
      notify('Could not verify the current Screening Admin link. Refresh the dashboard and try again.',true);
      return;
    }
    setScreeningAdminUrl(data.screening_admin_url);
    setScreeningAdminDraft(data.screening_admin_url);
    await sendAdminQuickMessage(
      'Hello! If your request to join the main ASYLUM Community screening group chat is not being approved through Messenger, kindly send a message directly to the Screening Admin at the Facebook account below so they can add you manually.\n\n'+
      data.screening_admin_url+'\n\n'+
      'When contacting the admin, mention your ASY application IGN. Do not send passwords or verification codes.\n\n'+
      'Thank you for your understanding and cooperation!'
    );
  }
  async function sendAdminQuickMessage(body:string){
    if(!selected||!body.trim())return;
    setAdminMessageBusy(true);
    try{
      await messagingRequest({action:'admin-application-messages-send',application_id:selected.id,body:body.trim().slice(0,2000)});
      await loadAdminApplicationMessages(selected.id);
      notify('Link and instructions sent to '+selected.ign+' through the private application chat.');
    }catch(error){notify(error instanceof Error?error.message:'Could not send the private message.',true);}
    finally{setAdminMessageBusy(false);}
  }
  async function saveApplicantDetails(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    if(!selected)return;
    const applicationId=selected.id;
    const editError=(message:string)=>{setEditSaveFeedback({applicationId,kind:'error',message});notify(message,true);};
    setEditSaveFeedback(null);
    const values=new FormData(event.currentTarget);
    const get=(key:string)=>String(values.get(key)||'').trim();
    const email=get('contact_email').toLowerCase();
    const routeChanged=editApplicationType!==selected.application_type;
    const routeEditable=!['rejected','accepted'].includes(selected.status)&&['eligibility_review','tag_proofs','membership_proofs','discord_roster'].includes(selected.workflow_step);
    if(routeChanged&&!routeEditable){editError('Application type can only be changed before final review or a final decision. Other fields can still be corrected.');return;}
    if(editApplicationType==='referral'&&(!get('referrer_name')||!get('referrer_facebook_url'))){editError('Referral Application requires the referring member name and Facebook profile link.');return;}
    if(editApplicationType==='referral'&&!isAllowedProfileUrl(get('referrer_facebook_url'),['facebook.com','fb.com'])){editError('Enter a valid Facebook profile link for the referring member.');return;}
    const mpInput=get('legendary_series_mp');
    const brInput=get('legendary_series_br');
    const hasLegendaryBreakdown=mpInput!==''||brInput!=='';
    const legendaryMp=Number(mpInput);
    const legendaryBr=Number(brInput);
    if(hasLegendaryBreakdown&&(
      mpInput===''||brInput===''||!Number.isInteger(legendaryMp)||!Number.isInteger(legendaryBr)||
      legendaryMp<0||legendaryBr<0||legendaryMp+legendaryBr<6||legendaryMp+legendaryBr>100)){
      editError('Please enter valid MP and BR Legendary Series (0 if none). The combined total must be at least 6 and no more than 100.');
      return;
    }
    const levelText=get('level');
    const level=levelText?Number(levelText):null;
    if(!get('ign')||!get('codm_uid')||!email||!get('region')||!get('rank')||get('reason').length<10){
      editError('Please complete the required applicant details and enter a reason of at least 10 characters before saving.');return;
    }
    if(level!==null&&(!Number.isInteger(level)||level<1||level>500)){
      editError('Enter a valid player level.');return;
    }
    setEditSaveFeedback({applicationId,kind:'info',message:'Saving changes to the recruitment database…'});
    setBusy(true);
    try {
    const {data,error}=await supabase.from('asy_clan_applications').update({
      application_type:editApplicationType,
      ign:get('ign'),codm_uid:get('codm_uid'),contact_email:email,
      discord_username:get('discord_username')||null,
      applicant_facebook_url:get('applicant_facebook_url')||null,
      applicant_tiktok_url:get('applicant_tiktok_url')||null,
      streamer_mode_id:get('streamer_mode_id')||null,
      ...(editApplicationType==='casual'?{
        applicant_facebook_name:get('applicant_facebook_name')||null,
        applicant_birthdate:get('applicant_birthdate')||null,
        applicant_clan_name:get('applicant_clan_name')||null
      }:{}),
      region:get('region'),level,rank:get('rank'),reason:get('reason'),
      ...(hasLegendaryBreakdown?{legendary_series_mp:legendaryMp,legendary_series_br:legendaryBr}:{}),
      referrer_name:editApplicationType==='referral'?get('referrer_name'):null,
      referrer_facebook_url:editApplicationType==='referral'?get('referrer_facebook_url'):null,
      updated_at:new Date().toISOString()
    }).eq('id',selected.id).select('*').single();
    if(error||!data){editError(error?.message||'Database did not confirm the update. Check recruiter permissions and try again.');return;}
    // A second read prevents displaying a misleading success if the saved values were overridden.
    const {data:readBack,error:readError}=await supabase.from('asy_clan_applications').select('*').eq('id',applicationId).maybeSingle();
    const saved=(readBack||data) as Application;
    if(readBack&&(
      readBack.application_type!==editApplicationType ||
      readBack.ign!==get('ign') ||
      readBack.codm_uid!==get('codm_uid') ||
      readBack.contact_email!==email ||
      (hasLegendaryBreakdown&&(readBack.legendary_series_mp!==legendaryMp||readBack.legendary_series_br!==legendaryBr)) ||
      (readBack.referrer_name||'')!==(editApplicationType==='referral'?get('referrer_name'):'') ||
      (readBack.referrer_facebook_url||'')!==(editApplicationType==='referral'?get('referrer_facebook_url'):'')
    )){
      editError('The database returned different values than you submitted. Refresh the applicant and try again.');
      return;
    }
    setSelected(saved);
    setEditApplicationType(saved.application_type);
    await loadApplications();
    if(routeChanged)await loadSelectedEvidence(saved.id,saved.application_type);
    const message=routeChanged
      ? 'Saved: Application type changed to '+(saved.application_type==='referral'?'Referral':'Direct')+' Application. Tracking code kept; review required screenshots.'
      : 'Saved: Applicant details updated. Tracking code kept; review any changed details before the next step.';
    setEditSaveFeedback({applicationId,kind:'success',message:readError?message+' Database read-back was unavailable; initial save was confirmed.':message+' Verified in Supabase.'});
    notify(message);
    } catch(error) {
      editError(error instanceof Error?error.message:'Could not complete the save. Try again.');
    } finally {
      setBusy(false);
    }
  }

  async function confirmApplicationDetailsChecked(app:Application){
    if(!authorized||!session?.user.email){notify('Only an authorized recruiter can confirm applicant details.',true);return;}
    if(app.application_details_verified){notify('Applicant details are already marked as checked.');return;}
    const checkedAt=new Date().toISOString();
    const reviewerEmail=session.user.email.trim().toLowerCase();
    setBusy(true);
    const {data,error}=await supabase.from('asy_clan_applications').update({
      application_details_verified:true,
      application_details_verified_by_email:reviewerEmail,
      application_details_verified_at:checkedAt,
      updated_at:checkedAt
    }).eq('id',app.id).select('*').single();
    setBusy(false);
    if(error||!data){notify('Could not save the details review. Make sure the recruiter session is active.',true);return;}
    setSelected(data as Application);
    await loadApplications();
    notify('Applicant details review recorded. You can now unlock the separate CODM screenshot step once age verification is complete.');
  }

  async function loadIntakeSettings(){
    const {data,error}=await supabase.from('asy_recruitment_settings').select('id,intake_open,application_limit,application_count,cycle_started_at,updated_at,screening_admin_url,casual_sheet_live_enabled').eq('id',1).maybeSingle();
    if(error){console.error('Could not load recruitment intake settings.',error.message);return;}
    if(data){const settings=data as IntakeSettings;setIntakeSettings(settings);setIntakeLimitDraft(settings.application_limit===null?'':String(settings.application_limit));setIntakeOpenDraft(settings.intake_open);if(isValidScreeningAdminUrl(settings.screening_admin_url)){setScreeningAdminUrl(settings.screening_admin_url);setScreeningAdminDraft(settings.screening_admin_url);}}
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
  // Direct Application is automatically synced immediately after its DB insert.
  // The queue and tracking flow provide idempotent retries; no recruiter buttons needed.
  async function requestCasualSheetSync(code:string,emailValue:string):Promise<void>{
    if(casualWebsiteSyncInFlight.current.has(code))return;
    casualWebsiteSyncInFlight.current.add(code);
    setCasualWebsiteSync({code,state:'testing',message:'Automatically syncing your Direct Application to the private Google Sheet…'});
    try{
      for(let attempt=0;attempt<3;attempt++){
        try{
          const response=await fetch(CASUAL_SHEETS_PILOT_API_URL,{
            method:'POST',headers:{'Content-Type':'application/json',apikey:SUPABASE_PUBLISHABLE_KEY},
            body:JSON.stringify({action:'sync-submission',application_code:code,contact_email:emailValue}),
            cache:'no-store',keepalive:true
          });
          const result=await response.json().catch(()=>null) as {
            ok?:boolean;mode?:string;website_test_synced?:boolean;queued?:boolean;
            row?:number;destination?:string;message?:string;synced?:boolean;already_synced?:boolean;
          }|null;
          if(!response.ok||!result?.ok)throw new Error('Google Sheets transfer is temporarily unavailable.');
          if(result.synced||result.already_synced){
            setCasualWebsiteSync({code,state:'verified',
              message:'✅ Your Direct Application was automatically saved to the private SCREENING Google Sheet'+
                (result.row?' (row '+result.row+')':'')+'. No separate Google Membership Form is needed.'});
          }else if(result.mode==='test_only'&&result.website_test_synced){
            setCasualWebsiteSync({code,state:'verified',
              message:'Test-only Google Sheets sync completed. Real SCREENING transfer is not active.'});
          }else{
            setCasualWebsiteSync({code,state:'queued',
              message:'Application saved in Supabase. Google Sheets transfer is queued and will be retried automatically.'});
          }
          return;
        }catch(error){
          if(attempt===2)throw error;
          // Retry temporary network/Apps Script failures automatically. The
          // Apps Script upsert uses a unique application code, so it is safe
          // to retry even if a prior response was lost after the write.
          await new Promise(resolve=>setTimeout(resolve,attempt===0?2000:6000));
        }
      }
    }catch(error){
      console.warn('Automatic Direct Google Sheets sync is pending.',error);
      setCasualWebsiteSync({code,state:'failed',
        message:'Application saved in Supabase. Automatic Google Sheets transfer is pending; opening Tracking again will retry without a separate button.'});
    }finally{
      casualWebsiteSyncInFlight.current.delete(code);
    }
  }
  async function loadApplicantProgress(code:string,emailValue:string){
    try{
      const response=await fetch(EVIDENCE_API_URL+'?application_code='+encodeURIComponent(code)+'&contact_email='+encodeURIComponent(emailValue),{headers:{apikey:SUPABASE_PUBLISHABLE_KEY},cache:'no-store'});
      const data=await response.json();
      if(!response.ok){setEvidenceServiceConfigured(response.status!==503);setApplicantProgress(null);return;}
      setEvidenceServiceConfigured(true);setApplicantProgress(data as ApplicantProgress);
      if((data as ApplicantProgress)?.application?.application_type==='casual')void requestCasualSheetSync(code,emailValue);
    }catch{setEvidenceServiceConfigured(false);setApplicantProgress(null);}
  }
  async function uploadRequirement(key:string,file:File,silent=false):Promise<boolean>{
    if(!applicationCode.trim()||!contactEmail.trim()){if(!silent)notify('Check your tracking code and application email first.',true);return false;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){if(!silent)notify('Upload a JPG, PNG, or WEBP screenshot.',true);return false;}
    if(file.size>8*1024*1024){if(!silent)notify('Each screenshot must be 8 MB or smaller.',true);return false;}
    setEvidenceUploadKey(key);
    try{
      const createResponse=await fetch(EVIDENCE_API_URL,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'create-upload',application_code:applicationCode.trim(),contact_email:contactEmail.trim().toLowerCase(),requirement_key:key,content_type:file.type,file_size_bytes:file.size})});
      const uploadInfo=await createResponse.json();
      if(!createResponse.ok)throw new Error(uploadInfo.error||'Could not start the upload.');
      const {error:uploadError}=await supabase.storage.from('asy-recruitment-private').uploadToSignedUrl(uploadInfo.path,uploadInfo.token,file,{contentType:file.type,cacheControl:'3600'});
      if(uploadError)throw new Error(uploadError.message||'The screenshot upload failed.');
      const finalizeResponse=await fetch(EVIDENCE_API_URL,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'},body:JSON.stringify({action:'finalize-upload',application_code:applicationCode.trim(),contact_email:contactEmail.trim().toLowerCase(),requirement_key:key,path:uploadInfo.path,file_name:file.name,content_type:file.type,file_size_bytes:file.size,applicant_note:applicantEvidenceNotes[key]?.trim().slice(0,500)||null})});
      const finalInfo=await finalizeResponse.json();
      if(!finalizeResponse.ok)throw new Error(finalInfo.error||'Could not submit this screenshot for review.');
      await loadApplicantProgress(applicationCode.trim(),contactEmail.trim().toLowerCase());
      if(!silent)notify('Screenshot submitted privately. Wait for a recruiter to review it.');
      return true;
    }catch(error){if(!silent)notify(error instanceof Error?error.message:'Screenshot upload failed. Please try again.',true);return false;}
    finally{setEvidenceUploadKey('');}
  }

  async function loadSelectedEvidence(applicationId:string,applicationType?:string){
    const {data,error}=await supabase.from('asy_recruitment_evidence').select('*').eq('application_id',applicationId).order('stage_number').order('requirement_label');
    if(error){notify('Could not load requirement evidence. Confirm recruiter permissions.',true);return;}
    setSelectedEvidence(((data||[]) as Evidence[]).filter(item=>(applicationType||selected?.application_type)==='referral'||!['membership_form_screenshot','referral_conversation_screenshot'].includes(item.requirement_key)));
  }
  async function requestEvidenceCorrection(item:Evidence){
    if(!selected||!item.id||item.status!=='pending')return;
    const reviewerNotes=evidenceNotes[item.id]?.trim()||null;
    if(!reviewerNotes){
      notify('Write a correction note to explain which screenshot the applicant should replace.',true);
      return;
    }
    setBusy(true);
    const {error}=await supabase.from('asy_recruitment_evidence').update({
      status:'needs_correction',reviewer_notes:reviewerNotes,
      reviewed_by_email:session?.user.email||null,
      reviewed_at:new Date().toISOString(),updated_at:new Date().toISOString()
    }).eq('id',item.id).eq('status','pending');
    setBusy(false);
    if(error){
      notify('Could not request correction. Check your recruiter permissions.',true);
      return;
    }
    await loadSelectedEvidence(selected.id,selected.application_type);
    notify('Correction requested. The applicant can replace this screenshot without starting over.');
  }
  async function verifyAllScreeningProofs(app:Application){
    if(!authorized||!session?.access_token){
      notify('Recruiter sign-in is required to verify screenshots.',true);return;
    }
    const required=selectedEvidence.filter(item=>item.is_required!==false);
    if(!required.length||required.some(item=>
      !['pending','approved'].includes(item.status)||!item.storage_path)){
      notify('All required screenshots must be uploaded and any corrections completed first.',true);
      return;
    }
    if(app.age_verification_status!=='verified'||!app.application_details_verified){
      notify('Confirm applicant age and application details before final verification.',true);
      return;
    }
    if(!window.confirm('Verify all '+required.length+' required screenshots together and continue to Final Review? This does not approve ASYLUM membership yet.'))return;
    setBusy(true);
    const {error}=await supabase.rpc('asy_verify_all_screening_proofs',{p_application_id:app.id});
    setBusy(false);
    if(error){notify(error.message||'Could not verify all screenshots.',true);return;}
    const {data:updated}=await supabase.from('asy_clan_applications').select('*').eq('id',app.id).single();
    if(updated)setSelected(updated as Application);
    await loadSelectedEvidence(app.id,app.application_type);
    await loadApplications();
    notify('All screenshots verified together. Proceed with final MGC checks before Screening GC eligibility.');
  }
  async function setMembershipFormResponseVerified(app:Application,verified:boolean){
    if(!authorized||!session?.user.email){notify('Only an authorized recruiter can verify a Membership Form response.',true);return;}
    if(verified&&app.workflow_step!=='final_review'){notify('The form response is checked during Final Review, after all required screenshots are approved.',true);return;}
    const reviewerEmail=session.user.email.trim().toLowerCase();
    const checkedAt=verified?new Date().toISOString():null;
    setBusy(true);
    const update:Record<string,unknown>={
      membership_form_response_verified:verified,
      membership_form_response_verified_by_email:verified?reviewerEmail:null,
      membership_form_response_verified_at:checkedAt,
      updated_at:new Date().toISOString()
    };
    if(!verified){
      update.mgc_verification_status='not_checked';
      update.mgc_applicant_contacted=false;
      update.mgc_checked_by_email=null;
      update.mgc_checked_at=null;
      update.mgc_verification_notes=null;
    }
    const {data,error}=await supabase.from('asy_clan_applications').update(update).eq('id',app.id).select('*').single();
    setBusy(false);
    if(error||!data){notify('Could not save the Membership Form response check.',true);return;}
    setSelected(data as Application);
    await loadApplications();
    if(!verified){setMgcContactConfirmed(false);setMgcNotes('');}
    notify(verified?'Membership Form response check recorded. You can now complete the MGC contact check.':'Membership Form response check cleared. The final MGC check has been reset.');
  }

  async function saveMgcVerification(status:'contact_needed'|'issue_found'|'verified'){
    if(!selected)return;
    const note=mgcNotes.trim();
    if(!note){notify('Add a short note about the applicant contact or MGC check.',true);return;}
    if(status==='verified'&&selected.workflow_step!=='final_review'){
      notify('Finish and approve all required screenshot proofs before the final MGC check.',true);
      return;
    }
    if(status==='verified'&&!selected.membership_form_response_verified){
      notify('Open the Membership Form response, match the IGN and CODM UID, and confirm the response check first.',true);
      return;
    }
    if(status==='verified'&&!mgcContactConfirmed){
      notify('Confirm that you spoke with the applicant before marking MGC verified.',true);
      return;
    }
    const reviewerEmail=session?.user.email?.trim().toLowerCase();
    if(!reviewerEmail){notify('Recruiter session expired. Sign in again to record the MGC check.',true);return;}
    setBusy(true);
    try{
      const checkedAt=new Date().toISOString();
      const {data,error}=await supabase.from('asy_clan_applications').update({
        mgc_verification_status:status,
        mgc_applicant_contacted:mgcContactConfirmed,
        mgc_checked_by_email:reviewerEmail,
        mgc_checked_at:checkedAt,
        mgc_verification_notes:note,
        updated_at:checkedAt,
      }).eq('id',selected.id).select('*').single();
      if(error||!data){
        console.error('MGC manual verification save failed.',error?.message);
        notify(error?.message?.includes('authorized recruiter')?'Only authorized recruiters can save this check.':'Could not save the MGC check. Confirm recruiter access and try again.',true);
        return;
      }
      setSelected(data as Application);
      await loadApplications();
      notify(status==='verified'?'MGC double-check saved. Final Screening GC review can now continue.':status==='contact_needed'?'Applicant contact needed; final approval remains blocked.':'MGC issue recorded; resolve it before continuing.');
    }catch(error){
      console.error('MGC verification request failed.',error);
      notify('Connection error while saving the MGC check. Please retry.',true);
    }finally{
      setBusy(false);
    }
  }
  async function openEvidence(path:string){
    const {data,error}=await supabase.storage.from('asy-recruitment-private').createSignedUrl(path,300);
    if(error||!data?.signedUrl){notify('Could not open this private screenshot.',true);return;}
    window.open(data.signedUrl,'_blank','noopener,noreferrer');
  }
  async function updateAgeVerification(app:Application,status:'verified'|'underage'|'needs_confirmation'){
    const labels={verified:'16+ age requirement verified.',underage:'Applicant marked as under 16.',needs_confirmation:'Age needs further confirmation.'};
    if(status==='verified'&&!window.confirm('Confirm that you have checked an appropriate age confirmation and this applicant is at least 16? Do not collect or store an ID image unless separately required by an approved policy.'))return;
    setBusy(true);
    const {data,error}=await supabase.from('asy_clan_applications').update({age_verification_status:status,age_verified_by_email:session?.user.email||null,age_verified_at:new Date().toISOString(),age_verification_notes:status==='verified'?'Recruiter confirmed minimum age requirement.':status==='underage'?'Does not meet the 16+ minimum age requirement.':'Needs further age confirmation.',updated_at:new Date().toISOString()}).eq('id',app.id).select('*').single();
    setBusy(false);
    if(error||!data){notify('Could not save age verification. Check recruiter permissions.',true);return;}
    setSelected(data as Application);
    await loadApplications();
    notify(labels[status]);
  }
  async function advanceApplicationWorkflow(app:Application,nextStep:'tag_proofs'|'screening_gc_ready'){
    if(nextStep==='tag_proofs'&&!app.application_details_verified){
      notify('Review and confirm the applicant details before unlocking the CODM screenshot upload.',true);
      return;
    }
    if(nextStep==='tag_proofs'&&app.age_verification_status!=='verified'){
      notify('Verify that the applicant meets the minimum age requirement before approving eligibility.',true);
      return;
    }
    if(nextStep==='screening_gc_ready'&&(app.mgc_verification_status!=='verified'||!app.mgc_applicant_contacted||!app.mgc_checked_at||!app.mgc_verification_notes?.trim())){
      notify('Complete the MGC manual check and confirm applicant contact before marking Screening GC ready.',true);
      return;
    }
    setBusy(true);
    const {data,error}=await supabase.from('asy_clan_applications').update({workflow_step:nextStep,updated_at:new Date().toISOString()}).eq('id',app.id).select('*').single();
    setBusy(false);
    if(error||!data){notify('Could not advance the applicant. Make sure the evidence step is complete and recruiter permissions are active.',true);return;}
    setSelected(data as Application);
    await loadSelectedEvidence(app.id);
    await loadApplications();
    notify(nextStep==='tag_proofs'?'Eligibility approved. Step 1 screenshot submissions are now unlocked.':'Final review completed. Applicant is now eligible for the Screening GC decision.');
  }
  async function checkAdmin(userEmail:string){const {data,error}=await supabase.from('asy_recruitment_admins').select('email,role').eq('email',userEmail.toLowerCase()).maybeSingle();setAuthorized(!error&&Boolean(data));setStaffRole(!error&&data?String(data.role||'recruiter').toLowerCase():null);}
  async function signIn(event:FormEvent){event.preventDefault();setBusy(true);const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});setBusy(false);if(error){notify(error.message.toLowerCase().includes('invalid login credentials')?'Email or password is incorrect. Use the Supabase recruiter account connected to this website.':error.message,true);}else notify('Signed in. Checking recruiter permissions…');}
  async function signOut(){if(session?.access_token){try{await disconnectStaffPush(session.access_token);}catch(error){console.warn('Could not revoke push subscription during sign-out',error);}}await supabase.auth.signOut();setAuthorized(false);setApplications([]);setSelected(null);notify('Signed out.');}

  async function operationsRequest(payload:Record<string,unknown>):Promise<any>{
    const headers:Record<string,string>={apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json'};
    if(session?.access_token)headers.Authorization='Bearer '+session.access_token;
    const response=await fetch(OPERATIONS_API_URL,{method:'POST',headers,body:JSON.stringify(payload),cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok)throw new Error(typeof data.error==='string'?data.error:'ASY account service is temporarily unavailable.');
    return data;
  }
  async function loadMemberAccount(){
    if(!session?.access_token)return;
    try{
      const data=await operationsRequest({action:'member-account-get'});
      const profile=data.profile as MemberAccount;
      setAccountProfile(profile);
      setLinkedMemberApplication((data.linkedApplication||null) as LinkedMemberApplication|null);
      setAccountAdminRequest((data.adminRequest||null) as AdminAccessRequest|null);
      setAccountEmail(String(data.email||session.user.email||''));
      setAccountDisplayName(profile.display_name||'');
      setAccountIgn(profile.ign||'');
      setAccountUid(profile.codm_uid||'');
      setAccountDiscord(profile.discord_username||'');
      setAccountPhotoUrl(profile.photo_url||'');
      if(data.staffRole)setStaffRole(String(data.staffRole).toLowerCase());
    }catch(error){notify(error instanceof Error?error.message:'Could not load your ASY member account.',true);}
  }
  function openPasswordReset(source:'recruiter'|'member'){
    setResetSource(source);
    setResetEmail(source==='recruiter'?email:accountEmail);
    setResetEmailSent(false);
    setResetNewPassword('');
    setResetConfirmPassword('');
    setPage('password-reset');
    setNotice('');
  }

  async function sendPasswordResetEmail(event:FormEvent){
    event.preventDefault();
    const normalizedEmail=resetEmail.trim().toLowerCase();
    if(!normalizedEmail){notify('Enter the email address linked to your account.',true);return;}
    setResetBusy(true);
    try{
      const redirectTo=window.location.origin+'/?password-reset='+resetSource;
      const {error}=await supabase.auth.resetPasswordForEmail(normalizedEmail,{redirectTo});
      if(error){
        const message=error.message||'Could not send the password reset email.';
        if(/redirect|allow.?list|not allowed/i.test(message)){
          throw new Error('This website address is not yet allowed for password recovery. Add '+window.location.origin+'/** to Supabase Authentication → URL Configuration → Redirect URLs, then try again.');
        }
        throw error;
      }
      setResetEmailSent(true);
      notify('Password reset request processed. Check your inbox and spam folder for the recovery email.');
    }catch(error){
      notify(error instanceof Error?error.message:'Could not request a password reset. Please try again.',true);
    }finally{
      setResetBusy(false);
    }
  }

  async function saveRecoveredPassword(event:FormEvent){
    event.preventDefault();
    if(!resetRecoveryActive||!session){
      notify('Open the latest password recovery link from your email before choosing a new password.',true);return;
    }
    if(resetNewPassword.length<8){
      notify('Use a password with at least 8 characters.',true);return;
    }
    if(resetNewPassword!==resetConfirmPassword){
      notify('The new password and confirmation do not match.',true);return;
    }
    setResetBusy(true);
    try{
      const {error}=await supabase.auth.updateUser({password:resetNewPassword});
      if(error)throw error;
      await supabase.auth.signOut();
      setSession(null);
      setPassword('');
      setAccountPassword('');
      setResetNewPassword('');
      setResetConfirmPassword('');
      setResetRecoveryActive(false);
      setResetEmailSent(false);
      setPage(resetSource==='recruiter'?'admin':'account');
      notify('Password updated successfully. Sign in using your new password.');
    }catch(error){
      notify(error instanceof Error?error.message:'Could not update the password. Request a new recovery email and try again.',true);
    }finally{
      setResetBusy(false);
    }
  }

  async function submitAccountAuth(event:FormEvent){
    event.preventDefault();
    setAccountBusy(true);
    try{
      const normalizedEmail=accountEmail.trim().toLowerCase();
      if(accountMode==='signup'){
        if(accountDisplayName.trim().length<2)throw new Error('Enter your display name.');
        if(accountPassword.length<8)throw new Error('Use a password with at least 8 characters.');
        const {data,error}=await supabase.auth.signUp({email:normalizedEmail,password:accountPassword,options:{data:{display_name:accountDisplayName.trim()},emailRedirectTo:window.location.origin}});
        if(error)throw error;
        if(data.session){setAccountPassword('');setPage('account');notify('Account created. Verify your email if prompted, then complete your profile.');}
        else {setAccountPassword('');notify('Registration started. Check your email and verify it before signing in.');setAccountMode('signin');}
      }else{
        const {error}=await supabase.auth.signInWithPassword({email:normalizedEmail,password:accountPassword});
        if(error)throw error;
        setAccountPassword('');
        notify('Signed in. Loading your member account…');
      }
    }catch(error){notify(error instanceof Error?error.message:'Could not complete account sign-in.',true);}
    finally{setAccountBusy(false);}
  }
  async function uploadMemberAvatar(file:File){
    if(!session?.user.id){notify('Sign in before uploading a profile picture.',true);return;}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){notify('Choose a JPG, PNG, or WebP image.',true);return;}
    if(file.size>5*1024*1024){notify('Profile picture must be 5 MB or smaller.',true);return;}
    setAvatarUploading(true);
    try{
      const safeName=file.name.toLowerCase().replace(/[^a-z0-9._-]/g,'-').slice(-80)||'avatar';
      const path=session.user.id+'/'+crypto.randomUUID()+'-'+safeName;
      const {error}=await supabase.storage.from('asy-member-avatars').upload(path,file,{upsert:false,contentType:file.type,cacheControl:'3600'});
      if(error)throw error;
      const {data}=supabase.storage.from('asy-member-avatars').getPublicUrl(path);
      setAccountPhotoUrl(data.publicUrl);
      notify('Profile picture uploaded. Save your profile to apply it.');
    }catch(error){notify(error instanceof Error?error.message:'Could not upload the profile picture.',true);}
    finally{setAvatarUploading(false);}
  }
  async function saveMemberAccount(event:FormEvent){
    event.preventDefault();
    setAccountBusy(true);
    try{
      const data=await operationsRequest({action:'member-account-save',display_name:accountDisplayName,ign:accountIgn,codm_uid:accountUid,discord_username:accountDiscord,photo_url:accountPhotoUrl});
      setAccountProfile(data.profile as MemberAccount);
      notify('Profile saved. Your member account remains pending until ASY staff approves it.');
      await loadMemberAccount();
    }catch(error){notify(error instanceof Error?error.message:'Could not save your profile.',true);}
    finally{setAccountBusy(false);}
  }
  async function linkExistingApplication(event:FormEvent){
    event.preventDefault();
    setAccountBusy(true);
    try{
      const data=await operationsRequest({action:'member-account-link-application',application_code:accountLinkCode.trim()});
      setLinkedMemberApplication(data.application as LinkedMemberApplication);
      setAccountLinkCode('');
      notify('Existing application linked successfully. Your tracking history was preserved.');
      await loadMemberAccount();
    }catch(error){notify(error instanceof Error?error.message:'Could not link the application.',true);}
    finally{setAccountBusy(false);}
  }
  async function submitAdminAccessRequest(event:FormEvent){
    event.preventDefault();
    setAccountBusy(true);
    try{
      const data=await operationsRequest({action:'admin-access-request',display_name:accountDisplayName,reason:accountAdminReason});
      setAccountAdminRequest(data.request as AdminAccessRequest);
      notify('Admin access request submitted. The main Admin must approve it.');
    }catch(error){notify(error instanceof Error?error.message:'Could not submit the Admin request.',true);}
    finally{setAccountBusy(false);}
  }
  async function loadAdminAccessRequests(){
    try{const data=await operationsRequest({action:'admin-access-requests-list'});setAdminAccessRequests(Array.isArray(data.requests)?data.requests as AdminAccessRequest:[]);}
    catch(error){console.warn('Could not load Admin access requests.',error);}
  }
  async function reviewAdminAccessRequest(request:AdminAccessRequest,status:'approved'|'rejected'){
    if(!window.confirm((status==='approved'?'Approve':'Reject')+' Admin access for '+request.email+'?'))return;
    setAccountBusy(true);
    try{await operationsRequest({action:'admin-access-request-review',id:request.id,status});await loadAdminAccessRequests();notify(status==='approved'?'Admin access approved. The user can now sign in to the Admin Portal.':'Admin access request rejected.');}
    catch(error){notify(error instanceof Error?error.message:'Could not review Admin request.',true);}
    finally{setAccountBusy(false);}
  }
  async function loadMemberAccountReviews(){
    try{const data=await operationsRequest({action:'member-account-review-list'});setMemberReviewProfiles(Array.isArray(data.profiles)?data.profiles as MemberReviewProfile[]:[]);}
    catch(error){console.warn('Could not load member account reviews.',error);}
  }
  async function reviewMemberAccount(profile:MemberReviewProfile,status:'approved'|'rejected'){
    if(!window.confirm((status==='approved'?'Approve':'Reject')+' this member account?'))return;
    setAccountBusy(true);
    try{await operationsRequest({action:'member-account-review',user_id:profile.user_id,status,review_note:memberReviewNotes[profile.user_id]||''});await loadMemberAccountReviews();notify(status==='approved'?'Member account approved.':'Member account rejected.');}
    catch(error){notify(error instanceof Error?error.message:'Could not review member account.',true);}
    finally{setAccountBusy(false);}
  }
  async function manageMemberUser(profile:MemberReviewProfile, operation:'disable'|'enable'|'delete'|'admin'|'member'){
    const label=operation==='disable'?'disable':operation==='enable'?'enable':operation==='delete'?'permanently delete':operation==='admin'?'grant Admin access to':'remove Admin access from';
    if(!window.confirm('Are you sure you want to '+label+' '+(profile.email||profile.display_name)+'?'))return;
    setAccountBusy(true);
    try{
      await operationsRequest({action:'user-management-update',user_id:profile.user_id,operation});
      await loadMemberAccountReviews();
      notify(operation==='disable'?'User disabled.':operation==='enable'?'User enabled.':operation==='delete'?'User permanently deleted.':operation==='admin'?'Admin role granted.':'Admin role removed.');
    }catch(error){notify(error instanceof Error?error.message:'Could not update user management.',true);}
    finally{setAccountBusy(false);}
  }

  async function submitApplication(event:FormEvent) {
    event.preventDefault();

    if (!/^\d{19}$/.test(form.uid.trim())) {
      notify('CODM UID is required and must contain exactly 19 digits.', true);
      return;
    }
    if (!isAllowedProfileUrl(form.applicantFacebookUrl,['facebook.com','fb.com'])) {
      notify('Enter a valid Facebook profile link or leave it blank.', true);
      return;
    }
    if (!isAllowedProfileUrl(form.applicantTikTokUrl,['tiktok.com'])) {
      notify('Enter a valid TikTok profile link or leave it blank.', true);
      return;
    }
    if (form.ageConfirmed !== 'yes') {
      notify('Confirm that you are at least 16 years old before applying.', true);
      return;
    }
    const isCasual=form.applicationType==='casual';
    if(isCasual){
      const dob=form.birthdate.trim();
      const date=new Date(dob+'T00:00:00Z');
      const today=new Date();
      const cutoff=new Date(Date.UTC(today.getUTCFullYear()-16,today.getUTCMonth(),today.getUTCDate()));
      if(!form.facebookName.trim()||form.facebookName.trim().length<2||form.facebookName.trim().length>120||
         !form.clanName.trim()||form.clanName.trim().length<2||form.clanName.trim().length>120||
         !/^\d{4}-\d{2}-\d{2}$/.test(dob)||Number.isNaN(date.getTime())||
         date.toISOString().slice(0,10)!==dob||date>cutoff||date.getUTCFullYear()<1900){
        notify('Enter a valid Facebook name, birthdate (at least 16 years old), and clan name. Enter NO CLAN if applicable.',true);
        return;
      }
      if(!form.legendaryRequirementConfirmed){
        notify('Confirm that you meet the minimum six Legendary Series requirement.',true);
        return;
      }
      if(!form.applicantFacebookUrl.trim()||!form.applicantTikTokUrl.trim()){
        notify('Your Facebook and TikTok profile links are required for the Direct membership form.',true);
        return;
      }
    }
    const legendaryMp=Number(form.legendaryMpCount);
    const legendaryBr=Number(form.legendaryBrCount);
    const legendaryTotal=legendaryMp+legendaryBr;
    if(!isCasual&&(!form.legendaryMpCount.trim()||!form.legendaryBrCount.trim()||
       !Number.isInteger(legendaryMp)||!Number.isInteger(legendaryBr)||
       legendaryMp<0||legendaryBr<0||legendaryMp>100||legendaryBr>100||
       legendaryTotal<6||legendaryTotal>100)){
      notify('Enter MP and BR Legendary Series separately (0 if none). At least 6 in total are required.', true);
      return;
    }
    if (!form.facebookNameAppropriate || !form.willingToAddTag || !form.willingToSubmitPhoto) {
      notify('Confirm the Facebook name, ASY tag, and roster photo requirements before applying.', true);
      return;
    }
    if (form.applicationType === 'referral' && (!form.referrerName.trim() || !form.referrerFacebookUrl.trim())) {
      notify('Referral applications need the referrer name and Facebook link.', true);
      return;
    }
    if (intakeFull) {
      notify(!intakeSettings?.intake_open
        ? 'Recruitment is temporarily closed. Please check back later.'
        : 'The current recruitment application limit has been reached. Please check back later.', true);
      return;
    }

    setBusy(true);
    try {
      const code = createCode();
      const payload = {
        application_code: code,
        application_type: form.applicationType,
        workflow_enabled: true,
        referrer_name: form.applicationType === 'referral' ? form.referrerName.trim() : null,
        referrer_facebook_url: form.applicationType === 'referral' ? form.referrerFacebookUrl.trim() : null,
        meets_age_requirement: form.ageConfirmed === 'yes',
        legendary_series_mp: isCasual?null:legendaryMp,
        legendary_series_br: isCasual?null:legendaryBr,
        legendary_series_count: isCasual?0:legendaryTotal,
        legendary_requirement_confirmed: isCasual?form.legendaryRequirementConfirmed:false,
        applicant_facebook_name: isCasual?form.facebookName.trim():null,
        applicant_birthdate: isCasual?form.birthdate:null,
        applicant_clan_name: isCasual?form.clanName.trim():null,
        facebook_name_appropriate: form.facebookNameAppropriate,
        willing_to_add_asy_tag: form.willingToAddTag,
        willing_to_submit_roster_photo: form.willingToSubmitPhoto,
        ign: form.ign.trim(),
        codm_uid: form.uid.trim(),
        contact_email: form.email.trim().toLowerCase(),
        discord_username: form.discord.trim() || null,
        applicant_facebook_url: form.applicantFacebookUrl.trim() || null,
        applicant_tiktok_url: form.applicantTikTokUrl.trim() || null,
        streamer_mode_id: form.streamerModeId.trim() || null,
        region: isCasual?'Not specified':form.region,
        rank: isCasual?'Not specified':form.rank,
        level: isCasual?null:(form.level ? Number(form.level) : null),
        main_role: form.applicationType === 'referral' ? form.role : 'Not specified',
        preferred_mode: form.applicationType === 'referral' ? form.mode : 'Not specified',
        availability: form.applicationType === 'referral' ? form.availability : 'Not specified',
        clan_experience: form.applicationType === 'referral' ? (form.experience.trim() || null) : null,
        reason: isCasual?'Direct membership application via website.':form.reason.trim(),
        status: 'pending',
        reviewer_notes: null,
      };

      const { error } = await supabase.from('asy_clan_applications').insert(payload);
      if (error) {
        const message = error.message.toLowerCase();
        if (error.code === '23505' && (message.includes('codm uid') || message.includes('asy_one_active_application_per_codm_uid'))) {
          notify('This CODM UID already has an active application, even if a different email was used. Wait until that application is rejected before applying again, or ask a recruiter to correct the existing application.', true);
        } else if (error.code === '23505' && (message.includes('one_active_recruitment_application_per_email') || message.includes('asy_one_active_application_per_email') || message.includes('active application') || message.includes('already have an application'))) {
          notify('There is still an active application for this email. You can submit again after that application is rejected, or ask staff to correct its application type without rejecting.', true);
        } else if (message.includes('codm uid') && message.includes('19')) {
          notify('CODM UID must contain exactly 19 digits.', true);
        } else if (message.includes('temporarily closed')) {
          notify('Recruitment is temporarily closed. Please check back later.', true);
        } else if (message.includes('application limit reached')) {
          notify('The current recruitment application limit has been reached. Please check back later.', true);
        } else {
          console.error('Application insert failed.', error.message);
          notify('Could not submit your application. Check the required fields and try again.', true);
        }
        return;
      }

      if(isCasual)void requestCasualSheetSync(code,payload.contact_email);
      void loadIntakeSettings();
      try {
        await fetch('/api/notify-discord', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ign: payload.ign, rank: payload.rank, role: payload.main_role, mode: payload.preferred_mode, code }),
        });
      } catch (notifyError) {
        console.error('Discord recruitment notification failed.', notifyError);
      }

      setApplicationCode(code);
      setContactEmail(payload.contact_email);
      const saved: SavedApplication = {
        application_code: code,
        contact_email: payload.contact_email,
        ign: payload.ign,
        submitted_at: new Date().toISOString(),
      };
      setSavedApplication(saved);
      try {
        localStorage.setItem('asy-recruitment:last-application', JSON.stringify(saved));
      } catch (storageError) {
        console.warn('Could not save application tracking details on this device.', storageError);
      }
      setForm(blankForm);
      setTracked({ application_code: code, ign: payload.ign, status: 'pending', submitted_at: saved.submitted_at });
      void loadApplicantProgress(code, payload.contact_email);
      setPage('status');
      notify('Application submitted! Your tracking code is shown below and saved on this device.');
    } catch (submissionError) {
      console.error('Unexpected application submission failure.', submissionError);
      notify('A connection error stopped the submission. Please check your internet and try again.', true);
    } finally {
      setBusy(false);
    }
  }
  async function checkStatus(event:FormEvent){event.preventDefault();setBusy(true);setTracked(null);setApplicantProgress(null);const {data,error}=await supabase.rpc('asy_check_application',{p_application_code:applicationCode.trim(),p_contact_email:contactEmail.trim().toLowerCase()});setBusy(false);if(error)notify('We could not check the status right now. Please try again in a moment.',true);else if(!data?.length)notify('We could not find a match. Check your tracking code and the same email used in your application.',true);else{setTracked(data[0]);await loadApplicantProgress(applicationCode.trim(),contactEmail.trim().toLowerCase());notify('Application found. Your latest status is ready.');}}
  async function copyApplicationCode(codeToCopy=savedApplication?.application_code||applicationCode){if(!codeToCopy){notify('There is no tracking code to copy yet.',true);return;}try{await navigator.clipboard.writeText(codeToCopy);notify('Tracking code copied. Keep it private with your application email.');}catch{notify('Copy is unavailable in this browser. Select the code and copy it manually.',true);}}
  function clearSavedApplication(){try{localStorage.removeItem('asy-recruitment:last-application');}catch{}setSavedApplication(null);setApplicationCode('');setContactEmail('');setTracked(null);notify('Saved tracking details cleared from this device.');}
  // Automatically remove rejected website-originated Direct rows. This is a
  // staff-authenticated call; the backend verifies each rejected record and
  // only deletes an exact tracking-code match in SCREENING column L.
  async function reconcileRejectedDirectRows(){
    if(!authorized||!session?.access_token||rejectedSheetCleanupInFlight.current)return null;
    rejectedSheetCleanupInFlight.current=true;
    try{
      const response=await fetch(CASUAL_SHEETS_PILOT_API_URL,{
        method:'POST',headers:{
          'Content-Type':'application/json',
          apikey:SUPABASE_PUBLISHABLE_KEY,
          Authorization:'Bearer '+session.access_token
        },
        body:JSON.stringify({action:'sync-rejections'}),
        cache:'no-store'
      });
      const result=await response.json().catch(()=>null) as {
        ok?:boolean;removed?:number;already_missing?:number;failed?:number;pending?:number;
      }|null;
      if(!response.ok||!result?.ok)throw new Error('Automatic Sheet cleanup is pending.');
      return result;
    }catch(error){
      console.warn('Rejected Direct Sheet cleanup will retry on the next recruiter visit.',error);
      return null;
    }finally{
      rejectedSheetCleanupInFlight.current=false;
    }
  }
  async function loadApplications(){
    const {data,error}=await supabase.from('asy_clan_applications')
      .select('*').order('submitted_at',{ascending:false});
    if(error){notify('Unable to load applications. Confirm recruiter access.',true);return;}
    setApplications((data||[]) as Application[]);
    // Covers temporary network failures and earlier rejection actions that
    // happened while recruiters were offline. No manual sync buttons.
    void reconcileRejectedDirectRows();
  }
  async function openStaffNotificationApplication(applicationId:string){
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId))return;
    setPage('admin');
    if(!session||!authorized){
      notify('Sign in with your authorized recruiter account to open this application.');
      return;
    }
    const {data,error}=await supabase.from('asy_clan_applications').select('*').eq('id',applicationId).maybeSingle();
    if(error||!data){
      notify('Application unavailable. Your recruiter account may not have permission to view it.',true);
      return;
    }
    const app=data as Application;
    setSelected(app);
    setEditApplicationType(app.application_type);
    setEditSaveFeedback(null);
    setNotes(app.reviewer_notes||'');
    window.setTimeout(()=>document.getElementById('recruiter-application-detail')?.scrollIntoView({behavior:'smooth',block:'start'}),250);
    notify('Opened '+app.ign+' application.');
  }
  useEffect(()=>{
    const url=new URL(window.location.href);
    const applicationId=url.searchParams.get('open_application');
    if(!applicationId||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(applicationId))return;
    if(!session){setPage('admin');return;}
    if(!authorized)return;
    void openStaffNotificationApplication(applicationId).finally(()=>{
      url.searchParams.delete('open_application');
      window.history.replaceState(null,'',url.pathname+url.search+url.hash);
    });
  },[authorized,session?.user.id]);
  async function loadRoster(){const {data,error}=await supabase.from('asy_clan_roster_public').select('id,ign,main_role,rank,member_status,joined_at,clan_name').eq('member_status','active').order('joined_at');if(error)notify('Could not load the roster right now.',true);else setRoster((data||[]) as Roster[]);}
  async function updateApplication(app:Application,status:string){
    setBusy(true);
    const {error}=await supabase.from('asy_clan_applications')
      .update({status,reviewer_notes:notes.trim()||null,updated_at:new Date().toISOString()})
      .eq('id',app.id);
    if(error){setBusy(false);notify('Could not save this review. Check recruiter permissions.',true);return;}
    if(status==='accepted'){
      const {error:rosterError}=await supabase.from('asy_clan_roster')
        .upsert({application_id:app.id,ign:app.ign,codm_uid:app.codm_uid,
          main_role:app.main_role,rank:app.rank,
          discord_username:app.discord_username,member_status:'active'},
          {onConflict:'application_id'});
      if(rosterError)notify('Status updated, but roster sync failed. Check whether this UID already exists.',true);
    }
    let cleanupNote='';
    if(status==='rejected'&&app.application_type==='casual'){
      const cleanup=await reconcileRejectedDirectRows();
      cleanupNote=cleanup&&cleanup.failed===0&&cleanup.pending===0
        ?' The matching website row was removed from SCREENING (if present).'
        :' Google Sheets removal is queued and will retry automatically.';
    }
    setBusy(false);
    setSelected(null);
    await loadApplications();
    notify(status==='accepted'
      ?'Applicant accepted and added to community members.'
      :status==='rejected'
        ?'Application rejected and removed from the active queue.'+cleanupNote+
         ' They can reapply if no other active application exists for their email or CODM UID.'
        :'Application review saved.');
  }
  async function scheduleInterview(event:FormEvent){event.preventDefault();if(!selected||!interviewAt)return;setBusy(true);const {error}=await supabase.from('asy_recruitment_interviews').insert({application_id:selected.id,scheduled_at:new Date(interviewAt).toISOString(),channel:interviewChannel,meeting_details:interviewDetails.trim()||null,created_by:session?.user.email||null});setBusy(false);if(error)notify('Interview could not be saved.',true);else{await updateApplication(selected,'interview');setInterviewAt('');setInterviewDetails('');notify('Interview scheduled.');}}
  async function saveTryout(event:FormEvent){event.preventDefault();if(!selected)return;setBusy(true);const {error}=await supabase.from('asy_recruitment_tryouts').insert({application_id:selected.id,scheduled_at:tryoutAt?new Date(tryoutAt).toISOString():null,mode:tryoutMode,score:tryoutScore?Number(tryoutScore):null,result:tryoutResult,notes:tryoutNotes.trim()||null});setBusy(false);if(error)notify('Tryout result could not be saved.',true);else{await updateApplication(selected,tryoutResult==='fail'?'rejected':'tryout');setTryoutScore('');setTryoutNotes('');notify('Tryout record saved.');}}
  const duplicateActiveUids=useMemo(()=>{
    const counts=new Map<string,number>();
    for(const app of applications){
      if(app.status==='rejected')continue;
      const uid=app.codm_uid.replace(/[^0-9]/g,'');
      if(uid.length===19)counts.set(uid,(counts.get(uid)||0)+1);
    }
    return new Set([...counts].filter(([,n])=>n>1).map(([uid])=>uid));
  },[applications]);
  const filtered=useMemo(()=>applications.filter(app=>(filter==='all'?app.status!=='rejected':app.status===filter)&&[app.ign,app.codm_uid,app.contact_email,app.application_code].some(v=>v.toLowerCase().includes(query.toLowerCase()))),[applications,filter,query]);
  const count=(status:string)=>applications.filter(app=>app.status===status).length;
  function exportApplicantRecords(){
    if(!authorized){notify('Recruiter access is required to export applicant records.',true);return;}
    if(!applications.length){notify('There are no applicant records to export.',true);return;}
    const columns=Object.keys(applications[0]);
    const csvCell=(value:unknown)=>{
      let text=value==null?'':typeof value==='object'?JSON.stringify(value):String(value);
      if(/^[=+@\\-\\t\\r]/.test(text))text="'"+text;
      return '"'+text.replace(/"/g,'""')+'"';
    };
    const csv=[columns.map(csvCell).join(','),...applications.map(app=>columns.map(key=>csvCell((app as unknown as Record<string,unknown>)[key])).join(','))].join('\\r\\n');
    const blob=new Blob(['\\uFEFF',csv],{type:'text/csv;charset=utf-8;'});
    const url=URL.createObjectURL(blob);
    const link=document.createElement('a');
    link.href=url;
    link.download='ASY-Recruitment-Applicant-Records-'+new Date().toISOString().slice(0,10)+'.csv';
    document.body.appendChild(link);link.click();link.remove();URL.revokeObjectURL(url);
    notify('Applicant records exported as CSV.');
  }
  const navigation=[['home','Overview'],['community','Community'],['teams','Teams & Scrims'],['apply','Apply to join'],['status','Track application'],['account','Member account'],['screening','Screening guide'],['roster','Community members'],...(authorized?[['operations','Operations']]:[])];

  return <div className="shell">
    <div className="topline"><i/> ASYLUM COMMUNITY <span>/</span> GAMING COMMUNITY</div>
    <header className="nav">
      <button className="brand" onClick={()=>setPage('home')}><b className="mark"><img src="https://asy-clan-recruitment-1h073y.v2.appdeploy.ai/resources/asylum-community-logo.png" alt="Asylum Community logo" onError={event=>{event.currentTarget.style.opacity='0';}}/></b><span><strong>ASYLUM<span>.</span></strong><small>OFFICIAL COMMUNITY RECRUITMENT</small></span></button>
      <button className="mobile-toggle" aria-label="Open menu" onClick={()=>setMobileOpen(!mobileOpen)}>☰</button>
      <nav className={mobileOpen?'open':''}>{navigation.map(([id,label])=><button key={id} className={page===id?'active':''} onClick={()=>{setPage(id);setMobileOpen(false);setNotice('');}}>{label}</button>)}<button className="login-nav" onClick={()=>{setPage('admin');setMobileOpen(false);setNotice('');}}><ShieldCheck size={15}/> Recruiter login</button></nav>
    </header>
    {notice&&<div className={'notice '+(hasError?'bad':'')}><BadgeCheck size={17}/><span>{notice}</span><button onClick={()=>setNotice('')} aria-label="Dismiss"><X size={15}/></button></div>}
    <main>
      {page==='password-reset'&&<section className="page password-reset-page">
        <Heading kicker="ASYLUM COMMUNITY / ACCOUNT RECOVERY" title={<>RESET YOUR <em>PASSWORD.</em></>} desc={resetSource==='recruiter'?'Enter the email linked to your authorized recruiter account. We will email a secure recovery link.':'Enter the email linked to your ASY Member Account. We will email a secure recovery link.'}/>
        <div className="panel password-reset-panel">
          {!resetEmailSent?<form className="form" onSubmit={sendPasswordResetEmail}>
            <Field label="Account email"><input required type="email" autoComplete="email" value={resetEmail} onChange={event=>setResetEmail(event.target.value)} placeholder="you@example.com"/></Field>
            <button className="primary full" disabled={resetBusy}>{resetBusy?'Sending email…':'Send password reset email'} <Send size={15}/></button>
            <p className="muted">For privacy, the same confirmation message is shown whether or not an account exists for that email.</p>
          </form>:<div className="password-reset-sent">
            <span className="reset-email-icon"><Mail size={24}/></span>
            <h2>Check your email</h2>
            <p>When an account exists for <strong>{resetEmail}</strong>, Supabase sends a secure password recovery link. Check your inbox and spam folder. The link can only be used for a limited time.</p>
            <button type="button" className="secondary" onClick={()=>setResetEmailSent(false)}>Send another email</button>
          </div>}
          <button type="button" className="text-link" onClick={()=>{setPage(resetSource==='recruiter'?'admin':'account');setNotice('');}}>Back to {resetSource==='recruiter'?'Recruiter Login':'Member Account sign in'} <ArrowRight size={14}/></button>
        </div>
      </section>}
      {page==='reset-password'&&<section className="page password-reset-page">
        <Heading kicker="ASYLUM COMMUNITY / SECURE ACCOUNT" title={<>CHOOSE A NEW <em>PASSWORD.</em></>} desc="Your recovery link has been verified. Create a new password for your account."/>
        <div className="panel password-reset-panel">
          {resetRecoveryActive&&session?<form className="form" onSubmit={saveRecoveredPassword}>
            <Field label="New password"><input required type="password" minLength={8} autoComplete="new-password" value={resetNewPassword} onChange={event=>setResetNewPassword(event.target.value)} placeholder="At least 8 characters"/></Field>
            <Field label="Confirm new password"><input required type="password" minLength={8} autoComplete="new-password" value={resetConfirmPassword} onChange={event=>setResetConfirmPassword(event.target.value)} placeholder="Enter the new password again"/></Field>
            <button className="primary full" disabled={resetBusy}>{resetBusy?'Updating password…':'Save new password'} <CheckCircle2 size={15}/></button>
          </form>:<div className="password-reset-sent">
            <h2>Recovery link needed</h2>
            <p>Open the newest password reset email on this device. If the link expired or was already used, request a new recovery email.</p>
            <button type="button" className="primary" onClick={()=>{setResetRecoveryActive(false);setPage('password-reset');setResetEmailSent(false);}}>Request a new reset email</button>
          </div>}
        </div>
      </section>}
      {page==='home'&&<>
        <Home intakeSettings={intakeSettings} onApply={()=>setPage('apply')} onRoster={()=>setPage('roster')} onTrack={()=>setPage('status')} onGuide={()=>setPage('screening')}/>
        {announcements.some(item=>item.is_published)&&<section className="page announcement-preview">
          <div className="announcement-preview-head"><div><small className="kicker">LATEST UPDATES</small><h2>From the <em>ASY community.</em></h2></div><button type="button" className="secondary" onClick={()=>setPage('community')}>All updates &amp; chat <ArrowRight size={14}/></button></div>
          <div className="announcement-preview-grid">{announcements.filter(item=>item.is_published).slice(0,3).map(item=><article className="announcement-card" key={item.id}><span className={'announcement-category '+item.category}>{item.category}</span><h3>{item.title}</h3><p>{item.body}</p><small>{new Date(item.published_at||item.created_at).toLocaleDateString()}</small></article>)}</div>
        </section>}
      </>}
      {page==='community'&&<section className="page community-page">
        <Heading kicker="ASY COMMUNITY" title={<>NEWS &amp; <em>CHAT.</em></>} desc="Read official updates or talk in the public chat. Keep personal application details private."/>
        <div className="community-layout">
          <section className="panel community-announcements">
            <div className="community-panel-heading"><div><small className="kicker">OFFICIAL UPDATES</small><h2>Announcements</h2></div><button type="button" className="secondary compact-button" onClick={()=>void loadAnnouncements()}>Refresh</button></div>
            {(authorized?announcements:announcements.filter(item=>item.is_published)).length===0&&<p className="message-empty">No announcements yet. Check back for updates from ASY staff.</p>}
            {(authorized?announcements:announcements.filter(item=>item.is_published)).map(item=><article className="announcement-card" key={item.id}>
              <div className="announcement-card-meta"><span className={'announcement-category '+item.category}>{item.category}</span><small>{item.is_published?new Date(item.published_at||item.created_at).toLocaleString():'Draft · staff only'}</small></div>
              <h3>{item.title}</h3><p>{item.body}</p>
            </article>)}
          </section>
          <section className="panel community-chat-panel">
            <div className="community-panel-heading"><div><small className="kicker">PUBLIC ROOM</small><h2>General chat</h2><p>Messages are visible to everyone. Names are not verified.</p></div><button type="button" className="secondary compact-button" onClick={()=>void loadCommunityMessages()}>Refresh</button></div>
            <div className="public-chat-thread" aria-live="polite">
              {communityMessages.length===0&&<p className="message-empty">No messages yet. Start the conversation respectfully.</p>}
              {communityMessages.map(message=><article className="public-chat-message" key={message.id}>
                <div className="thread-message-meta"><strong>{message.display_name}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div>
                {message.body&&<p>{renderApplicationMessage(message.body)}</p>}{renderChatAttachment(message)}
                {!authorized&&<button type="button" className="moderate-message" onClick={()=>void reportCommunityMessage(message)}>Report message</button>}{authorized&&<><button type="button" className="moderate-message" onClick={()=>void reportCommunityMessage(message)}>Report message</button><button type="button" className="moderate-message" onClick={()=>void hideCommunityMessage(message)}>Hide message</button></>}
              </article>)}
            </div>
            <form className="community-chat-compose" onSubmit={sendCommunityMessage}>
              <Field label="Display name"><input required minLength={2} maxLength={32} value={communityDisplayName} onChange={event=>setCommunityDisplayName(event.target.value)} placeholder="Choose a nickname"/></Field>
              <Field label="Message"><textarea required rows={2} maxLength={500} value={communityDraft} onChange={event=>setCommunityDraft(event.target.value)} placeholder="Say hi to the community…"/></Field>
              <button type="submit" className="primary" disabled={communityChatBusy||!communityDisplayName.trim()||!communityDraft.trim()}>{communityChatBusy?'Sending…':'Send message'} <Send size={15}/></button>
            </form>
            <small className="message-privacy-note">Do not share emails, UIDs, screenshots, passwords, or login codes in public chat. Staff can hide inappropriate messages.</small>
          </section>
        </div>
      </section>}
      {page==='apply'&&<section className="page"><Heading kicker="01 / RECRUITMENT FORM" title={<>YOUR RUN <em>STARTS HERE.</em></>} desc="Complete the form honestly. Required fields are marked *. No account needed."/>
        <div className={'panel intake-banner '+(intakeFull?'closed':'open')}><div><strong>{intakeFull?(!intakeSettings?.intake_open?'Applications are temporarily closed':'Application limit reached'):'Recruitment intake is open'}</strong><p>{intakeSettings?.application_limit!==null&&intakeSettings?`${intakeSettings.application_count} of ${intakeSettings.application_limit} applications used this intake.`:'Check the eligibility requirements and complete the form once. Recruiters review applications individually.'}</p></div><span className="intake-dot"/></div>
        <form className="panel form" onSubmit={submitApplication}>
          <Section n="00" title="Application route" sub="Select Direct Application or Referral Application."/>
          <fieldset className="application-route-group">
            <legend>Application type <span aria-hidden="true">*</span></legend>
            <div className="application-route-options">
              <label className={'application-route-option'+(form.applicationType==='casual'?' selected':'')}>
                <input type="checkbox" name="direct-application" checked={form.applicationType==='casual'} onChange={()=>updateForm('applicationType','casual')}/>
                <span>Direct Application</span>
              </label>
              <label className={'application-route-option'+(form.applicationType==='referral'?' selected':'')}>
                <input type="checkbox" name="referral-application" checked={form.applicationType==='referral'} onChange={()=>updateForm('applicationType','referral')}/>
                <span>Referral Application</span>
              </label>
            </div>
            <small className="application-route-hint">Select one application type only.</small>
          </fieldset>
          {form.applicationType==='referral'&&<div className="form-grid">
            <Field label="Referring member name *"><input required value={form.referrerName} onChange={e=>updateForm('referrerName',e.target.value)} placeholder="Member who referred you"/></Field>
            <Field label="Referring member Facebook profile link *"><input required type="url" value={form.referrerFacebookUrl} onChange={e=>updateForm('referrerFacebookUrl',e.target.value)} placeholder="https://facebook.com/…"/></Field>
          </div>}
          <Section n="01" title="Eligibility" sub="Check the minimum requirements."/>
          <label className="screening-check eligibility-check"><input type="checkbox" required checked={form.ageConfirmed==='yes'} onChange={e=>updateForm('ageConfirmed',e.target.checked?'yes':'')}/><span>I confirm that I am at least 16 years old.</span></label>
          {form.applicationType==='referral'?<>
            <div className="form-grid">
              <Field label="MP Legendary Series *"><input type="number" min="0" max="100" step="1" inputMode="numeric" required value={form.legendaryMpCount} onChange={e=>updateForm('legendaryMpCount',e.target.value)} placeholder="0 if none"/></Field>
              <Field label="BR Legendary Series *"><input type="number" min="0" max="100" step="1" inputMode="numeric" required value={form.legendaryBrCount} onChange={e=>updateForm('legendaryBrCount',e.target.value)} placeholder="0 if none"/></Field>
            </div>
            <p className="muted form-helper">Combined Legendary Series: <strong>{Number(form.legendaryMpCount||0)+Number(form.legendaryBrCount||0)}</strong> / 6 minimum. Enter 0 for a mode you have not reached Legendary in.</p>
          </>:<label className="screening-check eligibility-check"><input type="checkbox" required checked={form.legendaryRequirementConfirmed} onChange={e=>setForm(old=>({...old,legendaryRequirementConfirmed:e.target.checked}))}/><span>I confirm that I meet the minimum 6 Legendary Series requirement. Recruiters will verify my eligibility.</span></label>}
          <div className="eligibility-confirmations">
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.facebookNameAppropriate} onChange={e=>setForm(old=>({...old,facebookNameAppropriate:e.target.checked}))}/><span>I confirm that my Facebook name is appropriate and not random or inappropriate.</span></label>
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.willingToAddTag} onChange={e=>setForm(old=>({...old,willingToAddTag:e.target.checked}))}/><span>I agree to put the ASY tag AFTER my IGN on my main CODM and TikTok accounts.</span></label>
            <label className="screening-check eligibility-check"><input type="checkbox" checked={form.willingToSubmitPhoto} onChange={e=>setForm(old=>({...old,willingToSubmitPhoto:e.target.checked}))}/><span>I agree to submit the required roster photo and follow the admin reference if accepted.</span></label>
          </div>
          {form.applicationType==='casual'?<>
            <Section n="02" title="Casual Membership Details" sub="Same applicant fields and order as the original SCREENING membership form. No Region, MP/BR breakdown, rank, or level needed."/>
            <div className="form-grid">
              <Field label="Facebook Name *"><input required minLength={2} maxLength={120} autoComplete="name" value={form.facebookName} onChange={e=>updateForm('facebookName',e.target.value)} placeholder="Your Facebook display name"/></Field>
              <Field label="Birthdate *"><input required type="date" max={new Date(new Date().setFullYear(new Date().getFullYear()-16)).toISOString().slice(0,10)} value={form.birthdate} onChange={e=>updateForm('birthdate',e.target.value)}/></Field>
              <Field label="Facebook Link *"><input required type="url" value={form.applicantFacebookUrl} onChange={e=>updateForm('applicantFacebookUrl',e.target.value)} placeholder="https://facebook.com/yourprofile"/></Field>
              <Field label="TikTok Link *"><input required type="url" value={form.applicantTikTokUrl} onChange={e=>updateForm('applicantTikTokUrl',e.target.value)} placeholder="https://tiktok.com/@yourprofile"/></Field>
              <Field label="IGN (In-Game Name) *"><input required minLength={2} maxLength={32} value={form.ign} onChange={e=>updateForm('ign',e.target.value)} placeholder="Your main CODM IGN"/></Field>
              <Field label="CODM UID (19 digits) *"><><input required type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{19}" minLength={19} maxLength={19} value={form.uid} onChange={e=>updateForm('uid',e.target.value.replace(/[^0-9]/g,'').slice(0,19))} placeholder="Enter your 19-digit UID"/><small className="field-hint">Numbers only · {form.uid.length}/19 digits</small></></Field>
              <Field label="Streamer Mode ID"><input value={form.streamerModeId} maxLength={100} onChange={e=>updateForm('streamerModeId',e.target.value)} placeholder="Optional"/></Field>
              <Field label="Clan Name *"><input required minLength={2} maxLength={120} value={form.clanName} onChange={e=>updateForm('clanName',e.target.value)} placeholder="Type NO CLAN if you are not in a clan"/></Field>
              <Field label="Discord Username"><input value={form.discord} maxLength={80} onChange={e=>updateForm('discord',e.target.value)} placeholder="Discord username"/></Field>
            </div>
            <Section n="03" title="Application tracking" sub="Used only to check your application status, not added to the public Master List."/>
            <Field label="Contact email *"><input required type="email" value={form.email} onChange={e=>updateForm('email',e.target.value)} placeholder="you@example.com"/></Field>
            <p className="muted form-helper">The original SCREENING spreadsheet's Version column is maintained by staff; you do not need to fill it in.</p>
          </>:<>
          <Section n="02" title="Player details" sub="Your game and contact information."/>
          <div className="form-grid">
            <Field label="In-game name (IGN) *"><input required minLength={2} maxLength={32} value={form.ign} onChange={e=>updateForm('ign',e.target.value)} placeholder="Your CODM name"/></Field>
            <Field label="CODM UID (19 digits) *"><><input required type="text" inputMode="numeric" autoComplete="off" pattern="[0-9]{19}" title="Enter exactly 19 digits for your CODM UID." minLength={19} maxLength={19} value={form.uid} onChange={e=>updateForm('uid',e.target.value.replace(/[^0-9]/g,'').slice(0,19))} placeholder="Enter your 19-digit UID"/><small className="field-hint">Required · Numbers only · {form.uid.length}/19 digits</small></></Field>
            <Field label="Contact email *"><input required type="email" value={form.email} onChange={e=>updateForm('email',e.target.value)} placeholder="you@example.com"/></Field>
            <Field label="Discord username"><input value={form.discord} onChange={e=>updateForm('discord',e.target.value)} placeholder="Optional"/></Field>
            <Field label="Region"><select value={form.region} onChange={e=>updateForm('region',e.target.value)}>{['Philippines','South East Asia','North America','Europe','Other'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Current rank *"><select value={form.rank} onChange={e=>updateForm('rank',e.target.value)}>{['Rookie','Veteran','Elite','Pro','Master','Grand Master','Legendary'].map(v=><option key={v}>{v}</option>)}</select></Field>
            <Field label="Current level"><input type="number" min="1" max="500" value={form.level} onChange={e=>updateForm('level',e.target.value)} placeholder="e.g. 220"/></Field>
          </div>
          <Section n="03" title="Social profiles" sub="Optional links for cross-checking your details."/>
          <div className="form-grid">
            <Field label="Facebook profile link"><input type="url" value={form.applicantFacebookUrl} onChange={e=>updateForm('applicantFacebookUrl',e.target.value)} placeholder="https://facebook.com/…"/><small className="field-hint">Optional · Profile link only.</small></Field>
            <Field label="TikTok profile link"><input type="url" value={form.applicantTikTokUrl} onChange={e=>updateForm('applicantTikTokUrl',e.target.value)} placeholder="https://tiktok.com/@…"/><small className="field-hint">Optional · Profile link only.</small></Field>
            <Field label="Streamer Mode ID"><input value={form.streamerModeId} maxLength={100} onChange={e=>updateForm('streamerModeId',e.target.value)} placeholder="Optional ID"/></Field>
          </div>
          <Field label="Why do you want to join ASY? *"><textarea required minLength={10} maxLength={1000} rows={3} value={form.reason} onChange={e=>updateForm('reason',e.target.value)} placeholder="A few sentences are enough…"/></Field>

          </>}
          <div className="privacy"><ShieldCheck size={17}/> Profile links and IDs are for recruitment review only. Never share passwords or login codes.</div>
          <button className="primary" disabled={busy||intakeFull}>{busy?'Submitting…':intakeFull?'Applications closed':'Submit application'} <ArrowRight size={16}/></button>
        </form></section>}
      {page==='status'&&<section className="page narrow"><Heading kicker="02 / APPLICATION STATUS" title={<>CHECK YOUR <em>STATUS.</em></>} desc="Check your progress with your tracking code and the same email address used on your application."/>
        {savedApplication&&<div className="panel saved-reference"><div className="saved-reference-head"><div><small className="kicker">SAVED ON THIS DEVICE</small><h2>Your tracking code</h2><p>We saved your latest application reference here so you can find it again after you leave the site.</p></div><span className="saved-reference-icon"><ClipboardList size={20}/></span></div><div className="reference-code-row"><code>{savedApplication.application_code}</code><button className="secondary" type="button" onClick={()=>void copyApplicationCode(savedApplication.application_code)}><Copy size={15}/> Copy code</button></div><p className="saved-email"><Mail size={15}/> Email used: <strong>{savedApplication.contact_email}</strong></p><p className="saved-help">Using another device? Contact an ASY recruiter with your in-game name and the email you applied with. Do not post your UID or email publicly.</p><button className="saved-clear" type="button" onClick={clearSavedApplication}>Forget saved details on this device</button></div>}
        <form className="panel form" onSubmit={checkStatus}><Field label="Application code"><input required value={applicationCode} onChange={e=>{setApplicationCode(e.target.value.toUpperCase());setTracked(null);setApplicantProgress(null);setApplicantMessages([]);}} placeholder="ASYLUM-XXXXXXXX"/></Field><Field label="Contact email"><input required type="email" value={contactEmail} onChange={e=>{setContactEmail(e.target.value);setTracked(null);setApplicantProgress(null);setApplicantMessages([]);}} placeholder="Email used in your application"/></Field><button className="primary full" disabled={busy}>{busy?'Checking…':'Check application'} <ArrowRight size={16}/></button></form>
        {tracked&&<div className="panel tracked"><small>APPLICATION FOUND</small><span className={'pill '+tracked.status}>{labels[tracked.status]||tracked.status}</span><h2>{tracked.ign}</h2><div className="tracked-reference"><p className="muted">Tracking code: <strong>{tracked.application_code}</strong></p><button className="saved-clear" type="button" onClick={()=>void copyApplicationCode(tracked.application_code)}><Copy size={14}/> Copy code</button></div><div className="timeline">{['pending','reviewing','interview','tryout','accepted'].map((stage,index)=><div className={'step '+(statuses.indexOf(tracked.status)>=statuses.indexOf(stage)&&tracked.status!=='rejected'?'done':'')} key={stage}><b>{index+1}</b><div><strong>{labels[stage]}</strong><small>{['Application received','Recruiter review','Interview stage','Tryout stage','Welcome to the roster'][index]}</small></div></div>)}</div><p className="muted">Submitted {new Date(tracked.submitted_at).toLocaleString()}</p>{tracked.status==='rejected'&&<div className="notice"><strong>Application rejected</strong><p>Your previous application and tracking code stay in your history. You may submit a new Direct or Referral Application using the same email if you do not have another active application.</p><button type="button" className="primary" onClick={()=>{setForm(blankForm);setPage('apply');}}>Apply again <ArrowRight size={15}/></button></div>}</div>}
        {casualWebsiteSync&&casualWebsiteSync.code===applicationCode&&<div className="notice" role="status" aria-live="polite"><strong>{casualWebsiteSync.state==='verified'?'Google Sheets auto-sync complete':casualWebsiteSync.state==='failed'?'Google Sheets auto-sync pending':'Google Sheets automatic sync'}</strong><p>{casualWebsiteSync.message}</p></div>}
         {tracked&&<div className="notice applicant-inbox-reminder"><strong>📩 Check recruiter updates before uploading.</strong><p>Read Notifications and Private Application Chat below for instructions, links and corrections. Stage 2 unlocks only after your CODM screenshot is approved.</p></div>}
        {tracked&&<ApplicantNotificationPanel applicationCode={applicationCode.trim()} contactEmail={contactEmail.trim().toLowerCase()} onNotify={notify}/>}
        {tracked&&<section className="panel application-chat">
          <div className="application-chat-heading"><div><small className="kicker">PRIVATE APPLICATION CHAT</small><h2>Message the recruitment team</h2><p>Ask about your application or reply to recruiter messages here.</p></div><span className="private-badge"><ShieldCheck size={13}/> Private</span></div>


          <p className="correction-help">Wrong screenshot or application detail? For screenshots, wait for a recruiter correction request and upload a replacement. For details, message the exact correction here. Do not submit a second application.</p>
          <div className="message-thread" aria-live="polite">
            {applicantMessages.length===0&&<p className="message-empty">No messages yet. Send a message if you need help with your application.</p>}
            {applicantMessages.map(message=><article key={message.id} className={'thread-message '+message.sender_role}>
              <div className="thread-message-meta"><strong>{message.sender_role==='recruiter'?'ASY Recruitment': 'You'}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div>
              {message.body&&<p>{renderApplicationMessage(message.body)}</p>}
              {renderChatAttachment(message)}
            </article>)}
          </div>
          <form className="message-compose" onSubmit={sendApplicantMessage}>
            <Field label="Your message"><textarea rows={2} maxLength={2000} value={applicantMessageDraft} onChange={event=>setApplicantMessageDraft(event.target.value)} placeholder="Type a question or reply…" /></Field>
            <label className="chat-attachment-picker">📎 Add screenshot / video <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>setApplicantChatFile(e.target.files?.[0]||null)}/></label>
            {applicantChatFile&&<small>Selected: {applicantChatFile.name} <button type="button" onClick={()=>setApplicantChatFile(null)}>Remove</button></small>}
            <button type="submit" className="primary" disabled={applicantMessageBusy||(!applicantMessageDraft.trim()&&!applicantChatFile)}>{applicantMessageBusy?'Sending…':'Send message'} <Send size={15}/></button>
          </form>
          <small className="message-privacy-note">Only you and authorized recruiters can access this application conversation. Never send passwords or login codes.</small>
        </section>}

        {applicantProgress&&<section className="panel applicant-progress">
          <div className="applicant-progress-head">
            <small className="kicker">SCREENING PROGRESS / {applicantProgress.application.application_type.toUpperCase()}</small>
            <h2>{({eligibility_review:'Upload your required screenshots',tag_proofs:'Upload your required screenshots',membership_proofs:'Upload your required screenshots',discord_roster:'Upload your required screenshots',final_review:'All screenshots verified · Final MGC review',screening_gc_ready:'Requirements verified · Screening GC eligibility',complete:'Recruitment completed'} as Record<string,string>)[applicantProgress.application.workflow_step]||'Application in review'}</h2>
            <p>Upload proofs in any order. You can replace a screenshot while it is waiting for final verification. Recruiters review all screenshots once, and can request a correction instead of rejecting your entire application.</p>
            <p className="muted">Uploaded {applicantProgress.evidence.filter(item=>['pending','approved'].includes(item.status)).length} of {applicantProgress.evidence.length} required screenshots.</p>
          </div>
          {evidenceServiceConfigured===false&&<div className="notice bad">Private upload service is not configured yet. Your application is saved; contact management while the upload service is configured.</div>}
          <div className="applicant-evidence-list">{applicantProgress.evidence.map(item=>{
            const uploadsOpen=['eligibility_review','tag_proofs','membership_proofs','discord_roster'].includes(applicantProgress.application.workflow_step);
            const canUpload=uploadsOpen&&['not_submitted','needs_correction','pending'].includes(item.status);
            const statusLabel=({locked:'Awaiting upload',not_submitted:'Awaiting upload',pending:'Uploaded · can replace',approved:'Verified by recruiter',needs_correction:'Needs correction'} as Record<string,string>)[item.status]||item.status;
            return <article className={'applicant-evidence-item '+item.status} key={item.requirement_key}>
              <div className="applicant-evidence-copy"><strong>{item.requirement_label}</strong><span className={'evidence-status '+item.status}>{statusLabel}</span>{item.file_name&&<small>Uploaded file: {item.file_name}</small>}{item.submitted_at&&<small>Submitted: {new Date(item.submitted_at).toLocaleString()}</small>}{item.reviewed_at&&<small>Reviewed: {new Date(item.reviewed_at).toLocaleString()}</small>}{item.reviewer_notes&&item.status==='needs_correction'&&<p className="correction-note">Recruiter feedback: {item.reviewer_notes}</p>}</div>
              {(item.requirement_key==='codm_tag_screenshot'||item.requirement_key==='tiktok_tag_screenshot'||item.requirement_key==='tiktok_follow_screenshot'||item.requirement_key==='membership_form_screenshot'||item.requirement_key==='roster_photo')&&<ExampleProof kind={({codm_tag_screenshot:'codm',tiktok_tag_screenshot:'tiktok',tiktok_follow_screenshot:'following',membership_form_screenshot:'form',roster_photo:'roster'} as Record<string,string>)[item.requirement_key]}/>}
              {canUpload&&<><Field label="Optional note for recruiter"><textarea rows={2} maxLength={500} value={applicantEvidenceNotes[item.requirement_key]??item.applicant_note??''} onChange={e=>setApplicantEvidenceNotes(old=>({...old,[item.requirement_key]:e.target.value}))} placeholder="Add context for this proof, if needed…"/></Field>
                <label className="upload-control"><span>{evidenceUploadKey===item.requirement_key?'Uploading…':item.status==='pending'?'Replace screenshot':item.status==='needs_correction'?'Upload corrected screenshot':'Upload screenshot'}</span>
                  <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!!evidenceUploadKey} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadRequirement(item.requirement_key,file);e.currentTarget.value='';}}/>
                </label>
              </>}
            </article>;
          })}</div>
          {['final_review','screening_gc_ready','complete'].includes(applicantProgress.application.workflow_step)&&<p className="success-note">Screenshot verification is complete. Continue following the recruiter's final instructions in Private Application Chat.</p>}
        </section>}

      </section>}
      {page==='account'&&<section className="page account-page">
        <Heading kicker="ASY COMMUNITY / MEMBER PORTAL" title={<>YOUR ASY <em>ACCOUNT.</em></>} desc="Manage your member profile, link your existing recruitment application, and request staff access if you are part of Management."/>
        {!session?<div className="panel account-auth-panel">
          <div className="section-heading"><div><small className="kicker">MEMBER PORTAL</small><h2>{accountMode==='signup'?'Create your account':'Sign in to ASY'}</h2><p className="muted">Member accounts require approval before you become an approved member. Staff access requires separate approval.</p></div></div>
          <form className="form" onSubmit={submitAccountAuth}>
            {accountMode==='signup'&&<Field label="Display name"><input required minLength={2} maxLength={80} value={accountDisplayName} onChange={e=>setAccountDisplayName(e.target.value)} placeholder="Your display name"/></Field>}
            <Field label="Email"><input required type="email" value={accountEmail} onChange={e=>setAccountEmail(e.target.value)} placeholder="you@example.com"/></Field>
            <Field label="Password"><input required type="password" minLength={8} value={accountPassword} onChange={e=>setAccountPassword(e.target.value)} placeholder="At least 8 characters"/></Field>
            <button className="primary" disabled={accountBusy}>{accountBusy?'Please wait…':accountMode==='signup'?'Create member account':'Sign in'} <ArrowRight size={16}/></button>
            {accountMode==='signin'&&<button type="button" className="text-link account-forgot-password" onClick={()=>openPasswordReset('member')}>Forgot password? <ArrowRight size={14}/></button>}
            <button type="button" className="secondary" onClick={()=>setAccountMode(accountMode==='signup'?'signin':'signup')}>{accountMode==='signup'?'Already registered? Sign in':'Need an account? Sign up'}</button>
          </form>
        </div>:<div className="account-layout">
          <section className="panel account-profile-panel"><div className="account-heading"><div><small className="kicker">MY PROFILE</small><h2>Member details</h2><p className="muted">{session.user.email}</p></div><span className={'pill '+(accountProfile?.approval_status||'pending')}>{accountProfile?.approval_status||'loading'}</span></div>
            {!accountProfile?<p className="muted">Loading your account…</p>:<><div className="account-avatar-row">{accountPhotoUrl?<img className="account-avatar" src={accountPhotoUrl} alt="Profile"/>:<div className="account-avatar placeholder"><Users size={28}/></div>}<label className="upload-control"><span>{avatarUploading?'Uploading…':'Upload profile picture *'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={avatarUploading} onChange={e=>{const file=e.target.files?.[0];if(file)void uploadMemberAvatar(file);e.currentTarget.value='';}}/></label></div>
            <form className="form" onSubmit={saveMemberAccount}><Field label="Display name"><input required minLength={2} maxLength={80} value={accountDisplayName} onChange={e=>setAccountDisplayName(e.target.value)}/></Field><Field label="IGN"><input required minLength={2} maxLength={40} value={accountIgn} onChange={e=>setAccountIgn(e.target.value)} placeholder="In-game name"/></Field><Field label="CODM UID (19 digits)"><input required inputMode="numeric" pattern="[0-9]{19}" maxLength={19} value={accountUid} onChange={e=>setAccountUid(e.target.value.replace(/[^0-9]/g,'').slice(0,19))} placeholder="19-digit UID"/></Field><Field label="Discord username"><input maxLength={80} value={accountDiscord} onChange={e=>setAccountDiscord(e.target.value)} placeholder="Discord username"/></Field><p className="muted">Your profile picture is required. Staff approval is needed before your account becomes an approved member.</p><button className="primary" disabled={accountBusy||avatarUploading||!accountPhotoUrl}>{accountBusy?'Saving…':'Save profile'} <CheckCircle2 size={16}/></button></form><div className="account-status-note"><strong>Status: {accountProfile.approval_status}</strong><p>{accountProfile.review_note||'Waiting for authorized ASY staff to review your profile.'}</p></div></>}
          </section>
          <section className="panel account-link-panel"><small className="kicker">RECRUITMENT CONNECTION</small><h2>Link existing application</h2><p className="muted">Use the tracking code from your original application. The verified email on your account must match the application email. Existing tracking data will be kept.</p>{linkedMemberApplication?<div className="linked-app-card"><span className="pill">{linkedMemberApplication.status}</span><h3>{linkedMemberApplication.ign}</h3><p>Tracking code: <strong>{linkedMemberApplication.application_code}</strong></p><p>Workflow: {linkedMemberApplication.workflow_step.replaceAll('_',' ')}</p><button className="secondary" type="button" onClick={()=>{setApplicationCode(linkedMemberApplication.application_code);setContactEmail(session.user.email||'');setTracked(null);setPage('status');}}>Open tracking <ArrowRight size={15}/></button></div>:<form className="form" onSubmit={linkExistingApplication}><Field label="Tracking code"><input required value={accountLinkCode} onChange={e=>setAccountLinkCode(e.target.value.toUpperCase())} placeholder="ASYLUM-XXXXXXXX"/></Field><button className="primary" disabled={accountBusy}>{accountBusy?'Verifying…':'Verify and link application'} <ShieldCheck size={15}/></button></form>}</section>
          
          <button type="button" className="secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button>
        </div>}
      </section>}
      {page==='screening'&&<ScreeningGuide intakeSettings={intakeSettings} onApply={()=>setPage('apply')} onTrack={()=>setPage('status')}/> }
      {page==='roster'&&<RosterPage roster={roster} onApply={()=>setPage('apply')}/>}
      {page==='teams'&&<OperationsHub mode="public" session={session} authorized={authorized} onNotify={notify}/>}
      {page==='operations'&&<OperationsHub mode="staff" session={session} authorized={authorized} onNotify={notify} onOpenApplication={id=>void openStaffNotificationApplication(id)}/>} 
      {page==='admin'&&<section className="page admin-page">
        {!session?<div className="login-wrap"><div><small className="kicker">RESTRICTED AREA</small><h1>RECRUITER<br/><em>COMMAND.</em></h1><p className="muted">Sign in with an authorized Asylum Community recruitment account to review applications, schedule interviews and track tryouts.</p><div className="secure"><ShieldCheck/> ACCESS CONTROLLED BY SUPABASE AUTH</div></div><form className="panel login" onSubmit={signIn}><div className="login-icon"><ShieldCheck/></div><h2>Recruiter sign in</h2><p className="muted">Only approved recruiter emails can access applicant data.</p><Field label="Email"><input required type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="jeromeitable37@gmail.com"/></Field><Field label="Password"><input required type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="Your password"/></Field><button className="primary full" disabled={busy}>{busy?'Signing in…':'Sign in securely'} <LogIn size={16}/></button><button type="button" className="text-link recruiter-forgot-password" onClick={()=>openPasswordReset('recruiter')}>Forgot password? <ArrowRight size={14}/></button><small className="muted">Account must exist in Supabase Auth and be added to the Asylum Community recruiter allowlist.</small></form></div>
        :!authorized?<div className="panel empty"><ShieldCheck size={38}/><h2>Account not authorized</h2><p>Signed in as {session.user.email}, but this email is not on the recruiter allowlist.</p><button className="secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></div>
        :<><div className="admin-head"><div><small className="kicker">ASYLUM COMMUNITY / RECRUITMENT CONTROL</small><h1>RECRUITER <em>DESK.</em></h1><p>{session.user.email}</p></div><div className="actions"><button className="secondary" onClick={exportApplicantRecords}><Download size={15}/> Export applicant records</button><button className="secondary" onClick={()=>void signOut()}><LogOut size={15}/> Sign out</button></div></div>
          <StaffPushSettings session={session} authorized={authorized}/>
          <div className="stats"><Stat icon={<ClipboardList/>} label="Total applicants" value={applications.length}/><Stat icon={<Zap/>} label="Pending review" value={count('pending')}/><Stat icon={<CalendarClock/>} label="In progress" value={count('reviewing')+count('interview')+count('tryout')}/><Stat icon={<Trophy/>} label="Accepted" value={count('accepted')}/></div>
          <section className="panel announcement-admin">
            <div className="announcement-admin-heading"><div><small className="kicker">MEMBER APPROVAL</small><h2>Member account requests</h2><p>Review profile information before marking an account as an approved member.</p></div><button type="button" className="secondary compact-button" onClick={()=>void loadMemberAccountReviews()}>Refresh</button></div>
            {memberReviewProfiles.filter(profile=>profile.approval_status==='pending').length===0?<p className="message-empty">No pending member accounts.</p>:memberReviewProfiles.filter(profile=>profile.approval_status==='pending').map(profile=><article className="announcement-card" key={profile.user_id}><div className="announcement-card-meta">{profile.photo_url?<img className="account-avatar small" src={profile.photo_url} alt="Member avatar"/>:null}<strong>{profile.display_name||'Unnamed member'}</strong><span className="pill pending">Pending</span></div><p>IGN: {profile.ign||'Not completed'} · CODM UID: {profile.codm_uid||'Not completed'}</p><p>Discord: {profile.discord_username||'Not provided'}</p><Field label="Review note"><textarea rows={2} maxLength={500} value={memberReviewNotes[profile.user_id]||''} onChange={e=>setMemberReviewNotes(old=>({...old,[profile.user_id]:e.target.value}))} placeholder="Optional feedback for the member…"/></Field><div className="actions"><button type="button" className="primary" disabled={accountBusy} onClick={()=>void reviewMemberAccount(profile,'approved')}>Approve member</button><button type="button" className="secondary" disabled={accountBusy} onClick={()=>void reviewMemberAccount(profile,'rejected')}>Reject</button></div></article>)}
          </section>
          <section className="panel announcement-admin">
            <div className="announcement-admin-heading"><div><small className="kicker">USER MANAGEMENT</small><h2>Manage user accounts</h2><p>Account status and role management are separate. Owner, Admin, and Management can change staff roles; only the Owner can permanently delete users.</p></div><button type="button" className="secondary compact-button" onClick={()=>void loadMemberAccountReviews()}>Refresh</button></div>
            <div className="user-management-toolbar">
              <label className="user-management-search"><Search size={16}/><input aria-label="Search user accounts" type="search" placeholder="Search name, email, IGN or CODM UID…" value={userManagementQuery} onChange={event=>setUserManagementQuery(event.target.value)}/></label>
              <span className="muted">{memberReviewProfiles.filter(profile=>[profile.display_name,profile.email,profile.ign,profile.codm_uid,profile.role].some(value=>String(value||'').toLowerCase().includes(userManagementQuery.trim().toLowerCase()))).length} users</span>
            </div>
            <div className="user-management-list">
              {memberReviewProfiles.length===0?<p className="message-empty">No user accounts found.</p>:memberReviewProfiles.filter(profile=>[profile.display_name,profile.email,profile.ign,profile.codm_uid,profile.role].some(value=>String(value||'').toLowerCase().includes(userManagementQuery.trim().toLowerCase()))).length===0?<p className="message-empty">No users match your search.</p>:memberReviewProfiles.filter(profile=>[profile.display_name,profile.email,profile.ign,profile.codm_uid,profile.role].some(value=>String(value||'').toLowerCase().includes(userManagementQuery.trim().toLowerCase()))).map(profile=>{
                const expanded=expandedManagedUser===profile.user_id;
                return <article className={'user-management-item'+(expanded?' expanded':'')} key={'user-'+profile.user_id}>
                  <div className="user-management-row">
                    <button type="button" className="user-management-person" aria-expanded={expanded} aria-controls={'managed-user-'+profile.user_id} onClick={()=>setExpandedManagedUser(expanded?null:profile.user_id)}>
                      {profile.photo_url?<img className="user-management-avatar" src={profile.photo_url} alt=""/>:<span className="user-management-avatar user-management-placeholder">{(profile.display_name||profile.email||'?').charAt(0).toUpperCase()}</span>}
                      <span className="user-management-identity"><strong>{profile.display_name||'Unnamed user'}</strong><small>{profile.email||'Email unavailable'}</small></span>
                    </button>
                    <div className="user-management-badges"><span className={'pill '+(profile.is_disabled?'rejected':profile.role?'approved':'pending')}>{profile.is_disabled?'Disabled':profile.role||'Member'}</span>{!profile.is_disabled&&<span className="user-management-active">Active</span>}</div>
                    <div className="user-management-controls">
                      {['owner','admin','management'].includes((staffRole||'').toLowerCase())&&<button type="button" className="secondary compact-button" disabled={accountBusy||profile.role==='owner'} onClick={()=>void manageMemberUser(profile,profile.role?'member':'admin')}>{profile.role?'Remove role':'Make Admin'}</button>}
                      <button type="button" className="secondary compact-button" disabled={accountBusy} onClick={()=>void manageMemberUser(profile,profile.is_disabled?'enable':'disable')}>{profile.is_disabled?'Activate':'Deactivate'}</button>
                      <button type="button" className="secondary compact-button user-management-expand" aria-label={expanded?'Collapse user details':'Expand user details'} aria-expanded={expanded} onClick={()=>setExpandedManagedUser(expanded?null:profile.user_id)}>{expanded?'Close':'Details'} <ArrowRight size={14}/></button>
                    </div>
                  </div>
                  {expanded&&<div className="user-management-details" id={'managed-user-'+profile.user_id}>
                    <div><small>In-game name</small><strong>{profile.ign||'Not completed'}</strong></div>
                    <div><small>CODM UID</small><strong>{profile.codm_uid||'Not completed'}</strong></div>
                    <div><small>Member approval</small><strong>{profile.approval_status||'Unknown'}</strong></div>
                    <div><small>Staff role</small><strong>{profile.role||'Member'}</strong></div>
                    {staffRole==='owner'&&profile.role!=='owner'&&<div className="user-management-danger"><button type="button" className="danger compact-button" disabled={accountBusy} onClick={()=>void manageMemberUser(profile,'delete')}>Delete user permanently</button></div>}
                  </div>}
                </article>;
              })}
            </div>
          </section>
          <section className="panel announcement-admin">
            <div className="announcement-admin-heading"><div><small className="kicker">COMMUNITY UPDATES</small><h2>Announcements</h2><p>Publish updates that appear on the public Community page.</p></div><span className="private-badge"><ShieldCheck size={13}/> Recruiter managed</span></div>
            <form className="announcement-form" onSubmit={saveAnnouncement}>
              <Field label="Title *"><input required minLength={3} maxLength={120} value={announcementDraft.title} onChange={event=>setAnnouncementDraft(old=>({...old,title:event.target.value}))} placeholder="Short announcement title"/></Field>
              <div className="form-grid compact">
                <Field label="Category"><select value={announcementDraft.category} onChange={event=>setAnnouncementDraft(old=>({...old,category:event.target.value as Announcement['category']}))}><option value="general">General</option><option value="recruitment">Recruitment</option><option value="event">Event</option><option value="maintenance">Maintenance</option></select></Field>
                <label className="announcement-publish-toggle"><input type="checkbox" checked={announcementDraft.is_published} onChange={event=>setAnnouncementDraft(old=>({...old,is_published:event.target.checked}))}/><span><strong>Publish now</strong><small>Visible to everyone on Community.</small></span></label>
              </div>
              <Field label="Message *"><textarea required rows={3} maxLength={3000} value={announcementDraft.body} onChange={event=>setAnnouncementDraft(old=>({...old,body:event.target.value}))} placeholder="Write the important details in a few clear sentences…"/></Field>
              <div className="announcement-form-actions"><button className="primary" disabled={announcementBusy}>{announcementBusy?'Saving…':announcementDraft.id?'Save changes':'Post announcement'} <Send size={14}/></button>{announcementDraft.id&&<button type="button" className="secondary" disabled={announcementBusy} onClick={()=>setAnnouncementDraft(emptyAnnouncementDraft)}>Cancel edit</button>}</div>
            </form>
            <div className="announcement-admin-list">
              <div className="announcement-list-heading"><strong>Recent announcements</strong><button type="button" className="secondary compact-button" onClick={()=>void loadAnnouncements()}>Refresh</button></div>
              {announcements.length===0&&<p className="message-empty">No announcements yet. Create one above.</p>}
              {announcements.map(item=><article className="announcement-admin-item" key={item.id}>
                <div className="announcement-admin-item-copy"><span className={'announcement-category '+item.category}>{item.category}</span><strong>{item.title}</strong><small>{item.is_published?'Published':'Draft'} · {new Date(item.updated_at||item.created_at).toLocaleString()}</small></div>
                <div className="announcement-admin-item-actions"><button type="button" className="secondary compact-button" disabled={announcementBusy} onClick={()=>setAnnouncementDraft({id:item.id,title:item.title,body:item.body,category:item.category,is_published:item.is_published})}>Edit</button><button type="button" className="secondary compact-button" disabled={announcementBusy} onClick={()=>void setAnnouncementPublished(item,!item.is_published)}>{item.is_published?'Unpublish':'Publish'}</button><button type="button" className="danger compact-button" disabled={announcementBusy} onClick={()=>void deleteAnnouncement(item)}>Delete</button></div>
              </article>)}
            </div>
          </section>
            <section className="panel intake-admin">
              <div className="intake-admin-heading">
                <div className="intake-admin-title">
                  <small className="kicker">RECRUITMENT INTAKE CONTROL</small>
                  <h2>Application capacity</h2>
                  <p>Set an optional application limit or pause submissions. The database enforces these settings when an application is submitted.</p>
                </div>
                <span className={'intake-status-badge '+(!intakeSettings?'loading':intakeSettings.intake_open?'open':'closed')}><i/>{!intakeSettings?'Loading status':intakeSettings.intake_open?'Intake open':'Intake closed'}</span>
              </div>
              <div className="intake-admin-layout">
                <div className="intake-admin-copy">
                  <div className="intake-summary">
                    <span className="intake-summary-label">Applications received this intake</span>
                    <strong className="intake-summary-value">{intakeSettings?.application_count??'—'} <span>/ {intakeSettings?.application_limit??'Unlimited'}</span></strong>
                    <span className="intake-summary-date">Cycle started {intakeSettings?new Date(intakeSettings.cycle_started_at).toLocaleDateString():'—'}</span>
                  </div>
                  <div className={'intake-meter '+(intakeSettings?.application_limit===null?'unlimited':'')} role="progressbar" aria-label="Application capacity used" aria-valuemin={0} aria-valuemax={100} aria-valuenow={intakeSettings?.application_limit?intakeUsagePercent:0}>
                    <span className={intakeFull?'closed':''} style={{width:intakeSettings?.application_limit?intakeUsagePercent+'%':'100%'}}/>
                  </div>
                  <p className="intake-capacity-note">{intakeSettings?.application_limit===null?'No numeric cap is set for this intake.':'Capacity usage is updated as applications are received.'} New submissions are blocked whenever intake is closed.</p>
                </div>
                <form className="intake-admin-form" onSubmit={saveIntakeSettings}>
                  <Field label="Maximum number of applications">
                    <input type="number" min="1" max="10000" step="1" value={intakeLimitDraft} onChange={event=>setIntakeLimitDraft(event.target.value)} placeholder="Unlimited"/>
                    <small className="field-hint">Leave blank to allow applications without a numeric cap.</small>
                  </Field>
                  <label className="toggle-row">
                    <span className="toggle-copy"><strong>Accept new applications</strong><small>Turn this off to temporarily close recruitment.</small></span>
                    <input type="checkbox" checked={intakeOpenDraft} onChange={event=>setIntakeOpenDraft(event.target.checked)} aria-label="Accept new applications"/>
                  </label>
                  <div className="intake-admin-actions">
                    <button className="primary" disabled={settingsBusy}>{settingsBusy?'Saving…':'Save intake settings'}</button>
                    <button className="secondary" type="button" disabled={settingsBusy} onClick={()=>void resetIntakeCycle()}>Start a new intake count</button>
                  </div>
                </form>
              </div>
            </section>
          <div className="tools"><div className="search"><Search size={16}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search IGN, UID, email, code…"/></div><select value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">All statuses</option>{statuses.map(stage=><option key={stage} value={stage}>{labels[stage]}</option>)}</select><button className="secondary" onClick={()=>void loadApplications()}>Refresh</button></div>
          <div className="app-list">{filtered.map(app=><button className={'app-row '+(selected?.id===app.id?'chosen':'')} key={app.id} onClick={()=>{setSelected(app);setEditApplicationType(app.application_type);setEditSaveFeedback(null);setNotes(app.reviewer_notes||'');}}><span className="app-icon"><Gamepad2 size={19}/></span><span className="app-main"><b>{app.ign}</b><small>{app.application_code} · {app.application_type==='referral'?'REFERRAL':'DIRECT'} · {app.workflow_step.replaceAll('_',' ')} · {app.rank}</small></span>{app.status!=='rejected'&&duplicateActiveUids.has(app.codm_uid.replace(/[^0-9]/g,''))&&<span className="duplicate-uid-flag" title="Another active application uses this CODM UID">Duplicate UID</span>}<span className={'pill '+app.status}>{labels[app.status]}</span><ArrowRight size={16}/></button>)}{!filtered.length&&<div className="empty-inline">No applications match these filters.</div>}</div>
          {selected&&<div className="panel detail" id="recruiter-application-detail">{selected.status!=='rejected'&&duplicateActiveUids.has(selected.codm_uid.replace(/[^0-9]/g,''))&&<div className="notice bad duplicate-uid-warning"><strong>Possible duplicate application</strong><p>Another active application uses this CODM UID. Compare both records and confirm with the applicant before deciding which submission to keep. No application has been automatically deleted or rejected.</p></div>}<header><div><small className="kicker">APPLICATION REVIEW</small><h2>{selected.ign}</h2><p className="muted">{selected.application_code} · {new Date(selected.submitted_at).toLocaleString()}</p></div><button className="close secondary" onClick={()=>setSelected(null)} aria-label="Close detail"><X/></button></header>
            <div className="details">{[['Application type',selected.application_type==='referral'?'Referral Application':'Direct Application'],['Referring member',selected.referrer_name||'Not applicable'],['Referrer Facebook',selected.referrer_facebook_url||'Not provided'],['Age requirement',selected.meets_age_requirement?'Confirmed age 16+':'Not confirmed'],['MP Legendary Series',selected.application_type==='casual'?'Not requested for Direct':selected.legendary_series_mp===null?'Not recorded separately':String(selected.legendary_series_mp)],['BR Legendary Series',selected.application_type==='casual'?'Not requested for Direct':selected.legendary_series_br===null?'Not recorded separately':String(selected.legendary_series_br)],['Legendary Series (total)',selected.application_type==='casual'?(selected.legendary_requirement_confirmed?'6+ self-declared · recruiter verifies':'Not yet confirmed'):String(selected.legendary_series_count)],['Facebook name',selected.facebook_name_appropriate?'Appropriate confirmed':'Not confirmed'],['ASY tag agreement',selected.willing_to_add_asy_tag?'Confirmed':'Not confirmed'],['Roster photo agreement',selected.willing_to_submit_roster_photo?'Confirmed':'Not confirmed'],['Workflow step',selected.workflow_step.replaceAll('_',' ')],['CODM UID',selected.codm_uid],['Streamer Mode ID',selected.streamer_mode_id||'Not provided'],['Facebook Name',selected.applicant_facebook_name||'Not recorded'],['Birthdate',selected.applicant_birthdate?'Recorded privately':'Not recorded'],['Clan',selected.applicant_clan_name||'Not recorded'],['Contact email',selected.contact_email],['Discord',selected.discord_username||'Not provided'],['Region / level',selected.region+' / '+(selected.level??'N/A')],['Rank',selected.rank]].map(([label,value])=><div key={label}><small>{label}</small><b>{value}</b></div>)}</div>
            <section className="panel application-details-review">
              <small className="kicker">FIRST REVIEW · BEFORE CODM</small>
              <h3>Check the applicant's details first</h3>
              <p className="muted">Before unlocking the CODM screenshot, compare IGN, UID, Facebook name, clan, contact details, social links, referral details (if applicable), and eligibility declarations. Open “Correct submitted applicant details” first if anything needs fixing.</p>
              {selected.workflow_step==='eligibility_review'?<>
                <p><strong>Status:</strong> {selected.application_details_verified?'Details checked':'Waiting for recruiter review'}</p>
                {selected.application_details_verified_at&&<small className="muted">Checked by {selected.application_details_verified_by_email||'recruiter'} · {new Date(selected.application_details_verified_at).toLocaleString()}</small>}
                <button type="button" className="primary" disabled={busy||selected.application_details_verified} onClick={()=>void confirmApplicationDetailsChecked(selected)}>Confirm details checked <CheckCircle2 size={15}/></button>
                {!selected.application_details_verified&&<small className="muted">This confirmation is required before Step 1 can be unlocked. Saving any corrected details resets this check.</small>}
              </>:<p className="success-note">This application has already passed the initial details/eligibility stage. The first-review lock is no longer applicable.</p>}
            </section>
            <details className="panel admin-edit-panel" key={selected.id}>
              <summary>Correct submitted applicant details</summary>
              <p className="muted">Correct details or change Direct ↔ Referral Application without rejection. The tracking code and existing proofs stay intact; referral requirements update automatically. Route changes are available before final review and reset verification checks.</p>
              <form className="admin-edit-grid" key={selected.id+':'+selected.updated_at} onSubmit={saveApplicantDetails} onInvalidCapture={event=>{const field=event.target as HTMLInputElement;setEditSaveFeedback({applicationId:selected.id,kind:'error',message:'Please correct the highlighted '+(field.name||'required')+' field before saving.'});}}>
                {(['accepted','rejected'].includes(selected.status)||!['eligibility_review','tag_proofs','membership_proofs','discord_roster'].includes(selected.workflow_step))&&<p className="admin-edit-hint">Application type is locked after final review or a final decision. Other application details can still be corrected.</p>}
                <Field label="Application type"><select value={editApplicationType} onChange={event=>setEditApplicationType(event.target.value as 'casual'|'referral')} disabled={busy||['accepted','rejected'].includes(selected.status)||!['eligibility_review','tag_proofs','membership_proofs','discord_roster'].includes(selected.workflow_step)}><option value="casual">Direct Application</option><option value="referral">Referral Application</option></select></Field>
                <Field label="IGN"><input name="ign" defaultValue={selected.ign} required /></Field>
                <Field label="CODM UID"><input name="codm_uid" defaultValue={selected.codm_uid} required /></Field>
                <Field label="Contact email"><input name="contact_email" type="email" defaultValue={selected.contact_email} required /></Field>
                <Field label="Discord username"><input name="discord_username" defaultValue={selected.discord_username||''} /></Field>
                {editApplicationType==='casual'&&<>
                  <Field label="Facebook Name (Casual membership form)"><input name="applicant_facebook_name" maxLength={120} defaultValue={selected.applicant_facebook_name||''} /></Field>
                  <Field label="Birthdate (private)"><input name="applicant_birthdate" type="date" defaultValue={selected.applicant_birthdate||''} /></Field>
                  <Field label="Clan Name"><input name="applicant_clan_name" maxLength={120} defaultValue={selected.applicant_clan_name||''} placeholder="NO CLAN if none"/></Field>
                </>}
                <Field label="Facebook profile link"><input name="applicant_facebook_url" type="url" defaultValue={selected.applicant_facebook_url||''} /></Field>
                <Field label="TikTok profile link"><input name="applicant_tiktok_url" type="url" defaultValue={selected.applicant_tiktok_url||''} /></Field>
                <Field label="Streamer Mode ID"><input name="streamer_mode_id" defaultValue={selected.streamer_mode_id||''} /></Field>
                <Field label="Region"><input name="region" defaultValue={selected.region} required /></Field>
                <Field label="Player level"><input name="level" type="number" min="1" max="500" defaultValue={selected.level??''} /></Field>
                <Field label="Rank"><input name="rank" defaultValue={selected.rank} required /></Field>
                <Field label="MP Legendary Series"><input name="legendary_series_mp" type="number" min="0" max="100" step="1" defaultValue={selected.legendary_series_mp??''} placeholder="0 if none" /></Field>
                <Field label="BR Legendary Series"><input name="legendary_series_br" type="number" min="0" max="100" step="1" defaultValue={selected.legendary_series_br??''} placeholder="0 if none" /></Field>
                {selected.legendary_series_mp===null&&selected.legendary_series_br===null&&<p className="admin-edit-hint">Legacy application: previously recorded total is {selected.legendary_series_count}, but MP/BR split was not captured. Enter both counts to correct it; leave both blank to keep the original total.</p>}
                <Field label="Reason for joining"><textarea name="reason" rows={3} required minLength={10} maxLength={1000} defaultValue={selected.reason} /></Field>
                {editApplicationType==='referral'&&<><Field label="Referring member"><input name="referrer_name" defaultValue={selected.referrer_name||''} required /></Field><Field label="Referrer Facebook link"><input name="referrer_facebook_url" type="url" defaultValue={selected.referrer_facebook_url||''} required /></Field></>}
                <div className="admin-edit-actions"><button type="submit" className="primary" disabled={busy}>{busy?'Saving…':'Save corrected details'} <CheckCircle2 size={15}/></button></div>
                {editSaveFeedback?.applicationId===selected.id&&<p className={'admin-edit-feedback '+editSaveFeedback.kind} role="status" aria-live="polite">{editSaveFeedback.message}</p>}
              </form>
            </details>
            <section className="panel admin-profile-links">
              <div><small className="kicker">PROFILE LINKS</small><h3>Applicant social profiles</h3></div>
              <div className="admin-profile-link-grid">
                <div><small>Facebook</small>{selected.applicant_facebook_url?<a href={selected.applicant_facebook_url} target="_blank" rel="noreferrer">Open profile <ArrowRight size={13}/></a>:<span>Not provided</span>}</div>
                <div><small>TikTok</small>{selected.applicant_tiktok_url?<a href={selected.applicant_tiktok_url} target="_blank" rel="noreferrer">Open profile <ArrowRight size={13}/></a>:<span>Not provided</span>}</div>
              </div>
            </section>
            {selected.application_type==='referral'&&<div className="reason"><b>Why they want to join</b><p>{selected.reason}</p></div>}
            <section className="panel age-verification-panel">
              <small className="kicker">AGE VERIFICATION · MINIMUM 16</small><h2>Confirm applicant age</h2>
              <p className="muted">The applicant has self-confirmed they are at least 16. A recruiter must verify this before approving eligibility and unlocking Step 1. Do not request or store a full ID image unless ASY has an approved policy requiring it.</p>
              <p><strong>Status:</strong> {({pending:'Pending verification',verified:'Verified · 16+',underage:'Does not meet minimum age',needs_confirmation:'Needs confirmation'} as Record<string,string>)[selected.age_verification_status||'pending']||'Pending verification'}</p>
              {selected.age_verified_at&&<small className="muted">Checked by {selected.age_verified_by_email||'recruiter'} · {new Date(selected.age_verified_at).toLocaleString()}</small>}
              <div className="action-row"><button type="button" className="primary" disabled={busy||selected.age_verification_status==='verified'} onClick={()=>void updateAgeVerification(selected,'verified')}>Confirm 16+ verified <CheckCircle2 size={15}/></button><button type="button" className="secondary" disabled={busy} onClick={()=>void updateAgeVerification(selected,'needs_confirmation')}>Needs confirmation</button><button type="button" className="secondary" disabled={busy} onClick={()=>void updateAgeVerification(selected,'underage')}>Under 16</button></div>
            </section>
            <ProofExamplesManager/>
            <section className="panel admin-evidence">
              <small className="kicker">SCREENSHOT VERIFICATION</small><h2>Review all required proofs once</h2>
              <p className="muted">Applicants can upload or replace screenshots without waiting for each stage to be approved. Check the complete set, request corrections only where needed, then click <strong>Verify all screenshots</strong> once.</p>
              <p className="muted">Uploaded {selectedEvidence.filter(item=>item.is_required!==false&&['pending','approved'].includes(item.status)&&!!item.storage_path).length} / {selectedEvidence.filter(item=>item.is_required!==false).length} required screenshots.</p>
              {selectedEvidence.map(item=><article className="admin-evidence-item" key={item.requirement_key}>
                <div className="admin-evidence-title"><div><strong>{item.requirement_label}</strong><small>{({locked:'Awaiting upload',not_submitted:'Awaiting upload',pending:'Uploaded · awaiting final verification',approved:'Verified',needs_correction:'Needs correction'} as Record<string,string>)[item.status]||item.status}</small>{item.file_name&&<small>{item.file_name} · {item.file_size_bytes?Math.round(item.file_size_bytes/1024)+' KB':''}</small>}{item.submitted_at&&<small>Submitted: {new Date(item.submitted_at).toLocaleString()}</small>}{item.reviewed_at&&<small>Reviewed: {new Date(item.reviewed_at).toLocaleString()}{item.reviewed_by_email?' · '+item.reviewed_by_email:''}</small>}{item.applicant_note&&<small>Applicant note: {item.applicant_note}</small>}</div>
                  {item.storage_path&&<button type="button" className="secondary compact-button" onClick={()=>void openEvidence(item.storage_path!)}>View private proof</button>}
                </div>
                {item.status==='pending'&&<><Field label="Correction note (if needed)"><textarea rows={2} value={evidenceNotes[item.id||'']??item.reviewer_notes??''} onChange={e=>setEvidenceNotes(old=>({...old,[item.id||'']:e.target.value}))} placeholder="Explain what needs to be replaced"/></Field><div className="action-row"><button type="button" className="secondary" disabled={busy} onClick={()=>void requestEvidenceCorrection(item)}>Request correction</button></div></>}
                {item.status==='needs_correction'&&<p className="correction-note">Correction requested. The applicant can replace this screenshot without restarting.</p>}
              </article>)}
              {['eligibility_review','tag_proofs','membership_proofs','discord_roster'].includes(selected.workflow_step)&&<>
                <button type="button" className="primary full"
                  disabled={busy||selected.age_verification_status!=='verified'||!selected.application_details_verified||!selectedEvidence.some(item=>item.is_required!==false)||selectedEvidence.some(item=>item.is_required!==false&&(!['pending','approved'].includes(item.status)||!item.storage_path))}
                  onClick={()=>void verifyAllScreeningProofs(selected)}>Verify all screenshots & continue to Final Review <CheckCircle2 size={15}/></button>
                {(selected.age_verification_status!=='verified'||!selected.application_details_verified)&&<small className="muted">First confirm the applicant details and minimum age, then verify all screenshots with one action.</small>}
              </>}
              {selected.workflow_step==='final_review'&&<><button type="button" className="primary full" disabled={busy||selected.mgc_verification_status!=='verified'||!selected.mgc_applicant_contacted||!selected.mgc_checked_at||!selected.mgc_verification_notes?.trim()} onClick={()=>void advanceApplicationWorkflow(selected,'screening_gc_ready')}>Mark Screening GC ready <CheckCircle2 size={15}/></button>{selected.mgc_verification_status!=='verified'&&<small className="mgc-unavailable-note">Complete the MGC check and confirm applicant contact below first.</small>}</>}
              {selected.workflow_step==='screening_gc_ready'&&<p className="success-note">All required evidence is verified. Final recruitment decision is ready.</p>}
            </section>
            <section className="panel mgc-review">
              <div className="mgc-review-head">
                <div><small className="kicker">FINAL MANUAL CHECK</small><h2>MGC / Membership Form</h2><p>For Direct applicants, compare the saved website membership details with the SCREENING spreadsheet once live auto-sync is enabled. Until then, keep the existing membership form confirmation process. Referral applicants continue the original Referral form. Match IGN and UID and resolve mismatches before confirming.</p></div>
                <span className={'mgc-status-badge '+selected.mgc_verification_status}>{mgcStatusLabels[selected.mgc_verification_status]}</span>
              </div>
              {selected.mgc_checked_at&&<p className="mgc-audit-line">Last updated by {selected.mgc_checked_by_email||'recruiter'} · {new Date(selected.mgc_checked_at).toLocaleString()}</p>}
              {selected.workflow_step==='final_review'&&<><label className="screening-check mgc-form-match-check"><input type="checkbox" checked={Boolean(selected.membership_form_response_verified)} disabled={busy} onChange={event=>void setMembershipFormResponseVerified(selected,event.target.checked)}/><span>I found the Membership Form response and matched the applicant’s IGN and CODM UID.</span></label>{selected.membership_form_response_verified_at&&<small className="mgc-audit-line">Form response matched by {selected.membership_form_response_verified_by_email||'recruiter'} · {new Date(selected.membership_form_response_verified_at).toLocaleString()}</small>}</>}
              <label className="screening-check mgc-contact-check"><input type="checkbox" checked={mgcContactConfirmed} onChange={event=>setMgcContactConfirmed(event.target.checked)}/><span>I have spoken with the applicant.</span></label>
              <Field label="MGC double-check note"><textarea rows={2} maxLength={1000} value={mgcNotes} onChange={event=>setMgcNotes(event.target.value)} placeholder="Example: Form response found; IGN and CODM UID matched; contacted applicant about any mismatch."/></Field>
              {selected.workflow_step!=='final_review'&&selected.workflow_step!=='screening_gc_ready'&&selected.workflow_step!=='complete'&&<p className="muted mgc-unavailable-note">Complete and approve the required proof stages before confirming MGC.</p>}
              <div className="mgc-actions">
                <button type="button" className="secondary" disabled={busy} onClick={()=>void saveMgcVerification('contact_needed')}>Contact needed</button>
                <button type="button" className="danger" disabled={busy} onClick={()=>void saveMgcVerification('issue_found')}>Flag form issue</button>
                <button type="button" className="primary" disabled={busy||selected.workflow_step!=='final_review'||!selected.membership_form_response_verified||!mgcContactConfirmed||!mgcNotes.trim()} onClick={()=>void saveMgcVerification('verified')}>Confirm MGC checked <CheckCircle2 size={15}/></button>
              </div>
            </section>
            <section className="panel application-chat admin-application-chat">
              <div className="application-chat-heading"><div><small className="kicker">APPLICANT CONVERSATION</small><h2>Chat with {selected.ign}</h2><p>Private messages for this application only.</p></div><span className="private-badge"><ShieldCheck size={13}/> Recruiter only</span></div>
              {((selectedEvidence.some(item=>item.requirement_key==='codm_tag_screenshot'&&item.status==='approved')&&['membership_proofs','discord_roster','final_review','screening_gc_ready','complete'].includes(selected.workflow_step))||['screening_gc_ready','complete'].includes(selected.workflow_step))&&<><div className="panel staff-alert-settings"><div><strong>🔔 Recruitment notifications</strong><p>New applications and messages from the open applicant conversation. Alerts work while this page is open.</p></div><button type="button" className="secondary" onClick={()=>void enableStaffAlerts()}>{desktopAlerts?'Notifications enabled':'Enable notifications + sound'}</button><span>Unread alerts: {alertCount}</span>{alertCount>0&&<button type="button" className="secondary" onClick={()=>setAlertCount(0)}>Mark read</button>}{alertHistory.length>0&&<details><summary>Recent alerts</summary><ul>{alertHistory.map((item,index)=><li key={index}>{item}</li>)}</ul></details>}</div><div className="recruiter-quick-links">
                <p><strong>Next-step links — manual delivery.</strong> Choose the link appropriate for this applicant's current stage. Messenger group-request issues can be handled using the Screening Admin contact below.</p>
                <form className="screening-admin-contact-form" onSubmit={saveScreeningAdminContact}>
                  <label htmlFor="screening-admin-facebook-url"><strong>Screening Admin Facebook contact</strong><span>Shared across all recruiter accounts and devices.</span></label>
                  <div className="screening-admin-contact-controls">
                    <input id="screening-admin-facebook-url" type="url" required maxLength={500} placeholder="https://www.facebook.com/ScreeningAdmin/" value={screeningAdminDraft} onChange={event=>setScreeningAdminDraft(event.target.value)} aria-label="Screening Admin Facebook profile link"/>
                    <button type="submit" className="secondary" disabled={screeningAdminSaving}>{screeningAdminSaving?'Saving…':'Save link'}</button>
                    <button type="button" className="secondary" onClick={()=>void resetScreeningAdminContact()} disabled={screeningAdminSaving}>Use default</button>
                  </div>
                  <small>Saved securely in the ASYLUM Supabase project. Authorized recruiters see the same link; changes apply to the next message sent.</small>
                </form>
                {selectedEvidence.some(item=>item.requirement_key==='codm_tag_screenshot'&&item.status==='approved')&&['membership_proofs','discord_roster','final_review','screening_gc_ready','complete'].includes(selected.workflow_step)&&<button type="button" className="secondary" disabled={adminMessageBusy} onClick={()=>void sendAdminQuickMessage('Your CODM screenshot has been approved. You can now join the official ASY Discord using this invite: https://discord.gg/HbJ5Jvw8y8\n\nAfter joining, go to #get-role and click the 😇 Angel emoji. Follow the server instructions. Use IGN ASY as your server nickname. If you see #NO ACCESS, follow its instructions; otherwise go to #SELECT YOUR VERSION HERE. Please ask an admin to confirm your game version before proceeding.')}>Send Discord invite + guide <Send size={14}/></button>}
                {selectedEvidence.some(item=>item.requirement_key==='codm_tag_screenshot'&&item.status==='approved')&&['membership_proofs','discord_roster','final_review','screening_gc_ready','complete'].includes(selected.workflow_step)&&<button type="button" className="secondary" disabled={adminMessageBusy} onClick={()=>void sendScreeningAdminContact()}>Send Screening Admin contact <Send size={14}/></button>}
                {selected.application_type!=='referral'&&!intakeSettings?.casual_sheet_live_enabled&&selected.workflow_step==='final_review'&&selectedEvidence.length>0&&selectedEvidence.every(item=>!item.is_required||item.status==='approved')&&<button type="button" className="primary" disabled={adminMessageBusy} onClick={()=>void sendAdminQuickMessage('All required screenshot proofs have been approved. Please complete the official ASY Membership Form using this link: https://docs.google.com/forms/d/e/1FAIpQLSfNfTuj1lu9m6uG1OVyppUUwI-T5GdQNIJJNQjjBnN2SVGhGw/viewform\n\nUse the same IGN and CODM UID from your application. After submitting, reply here with “Submitted” so the recruiter can check your response before the final MGC confirmation.')}>Send Membership Form (Non-Referral) <Send size={14}/></button>}
                {selected.application_type==='referral'&&<button type="button" className="primary" disabled={adminMessageBusy} onClick={()=>void sendAdminQuickMessage('Hello! Thank you for applying to ASYLUM Community through Referral Recruitment. Please complete the Referral Membership Form using this link: https://docs.google.com/forms/d/e/1FAIpQLSfMRLP7A9LiERdtPNS6juLH05it3m0buT-GGzeoM4cm0M57rQ/viewform\n\nUse the same IGN as your application. Once completed, send a screenshot of the form confirmation showing your IGN together with your referral conversation proof and other required screenshots in Track Application. Thank you!')}>Send Membership Form (Referral) <Send size={14}/></button>}
              </div></>}
              <div className="message-thread" aria-live="polite">
                {adminApplicationMessages.length===0&&<p className="message-empty">No messages from this applicant yet.</p>}
                {adminApplicationMessages.map(message=><article key={message.id} className={'thread-message '+message.sender_role}>
                  <div className="thread-message-meta"><strong>{message.sender_role==='recruiter'?'ASY Recruitment':selected.ign}</strong><time>{new Date(message.created_at).toLocaleString()}</time></div>
                  {message.body&&<p>{renderApplicationMessage(message.body)}</p>}
                  {renderChatAttachment(message)}
                </article>)}
              </div>
              <form className="message-compose" onSubmit={sendAdminApplicantMessage}>
                <Field label="Reply to applicant"><textarea rows={2} maxLength={2000} value={adminMessageDraft} onChange={event=>setAdminMessageDraft(event.target.value)} placeholder="Message about the application or MGC double-check…"/></Field>
                <label className="chat-attachment-picker">📎 Add screenshot / banner / video <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e=>setAdminChatFile(e.target.files?.[0]||null)}/></label>
                {adminChatFile&&<small>Selected: {adminChatFile.name} <button type="button" onClick={()=>setAdminChatFile(null)}>Remove</button></small>}
                <button type="submit" className="primary" disabled={adminMessageBusy||(!adminMessageDraft.trim()&&!adminChatFile)}>{adminMessageBusy?'Sending…':'Send reply'} <Send size={15}/></button>
              </form>
            </section>
            <Field label="Private reviewer notes"><textarea rows={2} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Internal notes — not shown to applicant"/></Field>
            <div className="action-row"><button className="secondary" disabled={busy} onClick={()=>void updateApplication(selected,'reviewing')}>Mark in review</button><button className="secondary" disabled={busy} onClick={()=>void updateApplication(selected,'waitlisted')}>Waitlist</button><button className="danger" disabled={busy} onClick={()=>void updateApplication(selected,'rejected')}>Reject</button><button className="primary" disabled={busy||selected.workflow_step!=='screening_gc_ready'||selected.mgc_verification_status!=='verified'||!selected.mgc_applicant_contacted||!selected.mgc_checked_at||!selected.mgc_verification_notes?.trim()} onClick={()=>void updateApplication(selected,'accepted')}>{selected.workflow_step==='screening_gc_ready'&&selected.mgc_verification_status==='verified'?'Accept + add member':'Complete proofs and MGC check first'} <CheckCircle2 size={15}/></button></div>
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
    <article className="community-tool active"><span className="community-tool-icon"><ClipboardList size={20}/></span><small className="tool-state">AVAILABLE NOW</small><h3>Screening guide</h3><p>Eligibility checks, step-by-step proof uploads, official links, and the full checklist in one place.</p><button className="text-link" onClick={onGuide}>Open screening guide <ArrowRight size={14}/></button></article>
    <article className="community-tool"><span className="community-tool-icon"><Users size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Team screening</h3><p>A dedicated route for team applications and captain review after management confirms the team rules.</p><span className="tool-note">Waiting for the team-screening process from management.</span></article>
    <article className="community-tool"><span className="community-tool-icon"><Swords size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Scrim hub</h3><p>Centralize scrim schedules, team requests, and match results when management is ready.</p><span className="tool-note">Scheduling and match records are not enabled yet.</span></article>
    <article className="community-tool"><span className="community-tool-icon"><ShieldCheck size={20}/></span><small className="tool-state planned">PLANNED</small><h3>Player reports</h3><p>A structured report form with evidence, context, and private management review.</p><span className="tool-note">Use the current official staff channel until this tool is enabled.</span></article>
  </div></section>
  <section className="journey"><div className="journey-heading"><small>HOW RECRUITMENT WORKS</small><h2>APPLY. <em>UPLOAD. GET REVIEWED.</em></h2><p>Three simple steps. Recruiters guide you through the rest.</p></div><div className="journey-grid"><article className="journey-card"><span className="journey-number">01</span><ClipboardList size={22}/><h3>Apply</h3><p>Choose Direct Application or Referral Application and send your details.</p></article><article className="journey-card"><span className="journey-number">02</span><Upload size={22}/><h3>Upload proofs</h3><p>Track your application and upload each stage when it unlocks.</p></article><article className="journey-card"><span className="journey-number">03</span><ShieldCheck size={22}/><h3>Final check</h3><p>Recruiters review your proofs and contact you for the MGC double-check.</p></article></div><div className="journey-footer"><p><ShieldCheck size={17}/> Keep your tracking code private. Applying does not guarantee acceptance.</p><button className="text-link" onClick={onTrack}>Already applied? Track your application <ArrowRight size={15}/></button></div></section>
  <section className="callout"><div><small>YOUR NEXT MOVE</small><h2>SHOW US WHAT YOU BRING.</h2><p>Tell us your role, your goals, and how you play.</p></div><button className="primary" onClick={onApply}>Start application <ArrowRight size={16}/></button></section>
 </>;
}
const EXAMPLE_PROOFS = [
  {key:'codm',title:'CODM ASY tag example',hint:'ASY tag appears after the in-game name.'},
  {key:'tiktok',title:'TikTok ASY tag example',hint:'ASY tag appears after the TikTok display name.'},
  {key:'following',title:'Official TikTok follow example',hint:'Show the ASYLUM Community TikTok profile and following proof.'},
  {key:'form',title:'Membership Form completion example',hint:'Show the recorded response with your IGN.'},
  {key:'roster',title:'Welcome banner roster photo example',hint:'Use the admin reference and include Facebook name in the Discord caption.'},
] as const;
function ExampleProof({kind,manage=false}:{kind:string;manage?:boolean}){
  const [version,setVersion]=useState(0);
  const [imageUrl,setImageUrl]=useState('');
  const [uploading,setUploading]=useState(false);
  const info=EXAMPLE_PROOFS.find(item=>item.key===kind);
  const bucket=supabase.storage.from('asy-recruitment-examples');
  useEffect(()=>{
    let alive=true;
    async function findExample(){
      for(const ext of ['png','jpg','webp']){
        const {data}=bucket.getPublicUrl('references/'+kind+'.'+ext);
        try{const response=await fetch(data.publicUrl+'?v='+version,{method:'HEAD',cache:'no-store'});
          if(response.ok){if(alive)setImageUrl(data.publicUrl+'?v='+version);return;}
        }catch{}
      }
      if(alive)setImageUrl('');
    }
    void findExample();return()=>{alive=false;};
  },[kind,version]);
  async function upload(file:File){
    const extensions:Record<string,string>={'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
    const extension=extensions[file.type];
    if(!extension||file.size>8*1024*1024){alert('Choose JPG, PNG or WebP up to 8 MB.');return;}
    setUploading(true);
    try{
      const path='references/'+kind+'.'+extension;
      const {error}=await bucket.upload(path,file,{upsert:true,contentType:file.type,cacheControl:'60'});
      if(error)throw error;
      setImageUrl(bucket.getPublicUrl(path).data.publicUrl+'?v='+Date.now());
      setVersion(Date.now());
    }catch(error){alert(error instanceof Error?error.message:'Could not upload example.');}
    finally{setUploading(false);}
  }
  return <div className="example-proof">
    <strong>📷 {info?.title||'Screenshot example'}</strong>
    {imageUrl?<a href={imageUrl} target="_blank" rel="noreferrer"><img src={imageUrl} alt={info?.title||'Reference screenshot'} loading="lazy" onError={()=>setImageUrl('')}/></a>:<p className="muted">Reference image will appear here once uploaded by recruitment staff.</p>}
    <small>{info?.hint}</small>
    {manage&&<label className="upload-control"><span>{uploading?'Uploading example…':'Upload / replace example image'}</span><input type="file" accept="image/jpeg,image/png,image/webp" disabled={uploading} onChange={e=>{const file=e.target.files?.[0];if(file)void upload(file);e.currentTarget.value='';}}/></label>}
  </div>;
}
function ProofExamplesManager(){
  return <details className="panel proof-example-manager">
    <summary className="proof-example-manager-toggle">
      <span className="proof-tools-heading">
        <small className="kicker">RECRUITER TOOLS</small>
        <strong>Screening reference images</strong>
      </span>
      <span className="proof-tools-action" aria-hidden="true">
        <span className="proof-tools-show">Show examples</span>
        <span className="proof-tools-hide">Hide examples</span>
        <span className="proof-tools-chevron"/>
      </span>
    </summary>
    <div className="proof-example-manager-content">
      <p>Upload the official example screenshots once. They will appear beside the applicant upload fields and in the Screening Guide.</p>
      <div className="example-proof-grid">{EXAMPLE_PROOFS.map(item=><ExampleProof key={item.key} kind={item.key} manage/>)}</div>
    </div>
  </details>;
}
function ScreeningGuide({intakeSettings,onApply,onTrack}:{intakeSettings:IntakeSettings|null;onApply:()=>void;onTrack:()=>void}) {
  const intakeFull=Boolean(intakeSettings && (!intakeSettings.intake_open || (intakeSettings.application_limit!==null && intakeSettings.application_count>=intakeSettings.application_limit)));
  return <section className="page screening-page">
    <Heading kicker="ASY RECRUITMENT" title={<>YOUR <em>CHECKLIST.</em></>} desc="Separate guides for Direct Application and Referral Application. Upload proofs in Track Application."/>
    <div className={'panel guide-intake '+(intakeFull?'closed':'open')}>
      <span className="intake-dot"/>
      <div>
        <small className="kicker">RECRUITMENT STATUS</small>
        <strong>{!intakeSettings?'Checking status…':!intakeSettings.intake_open?'Applications are closed':intakeSettings.application_limit!==null&&intakeSettings.application_count>=intakeSettings.application_limit?'Application limit reached':'Applications are open'}</strong>
        <p>Submit once. Recruiters review every application.</p>
      </div>
    </div>
    <section className="panel guide-eligibility">
      <div className="guide-section-heading">
        <small className="kicker">BEFORE YOU APPLY</small>
        <h2>Check eligibility</h2>
      </div>
      <div className="eligibility-grid">
        <article className="eligibility-item"><span>01</span><div><strong>Age 16+</strong><p>Confirm you meet the minimum age.</p></div></article>
        <article className="eligibility-item"><span>02</span><div><strong>6 Legendary Series</strong><p>MP + BR total.</p></div></article>
        <article className="eligibility-item"><span>03</span><div><strong>Facebook name</strong><p>Use an appropriate name.</p></div></article>
        <article className="eligibility-item"><span>04</span><div><strong>ASY tag</strong><p>After your IGN on CODM and TikTok.</p></div></article>
        <article className="eligibility-item"><span>05</span><div><strong>Roster photo</strong><p>Use the admin reference.</p></div></article>
      </div>
    </section>
    <div className="guide-screening-heading">
      <small className="kicker">DIRECT APPLICATION / 3 STEPS</small>
      <h2>What to <em>submit.</em></h2>
      <p>For Direct Application, follow the three steps below. Referral applicants should use the separate Referral Application guide that follows.</p>
    </div>
    <div className="guide-stage-grid">
      <article className="guide-stage">
        <div className="guide-stage-top"><span>01</span><small>CASUAL APPLICATION</small></div>
        <h3>Submit CODM proof</h3>
        <ul className="guide-list"><li>Upload your main CODM account screenshot with ASY after your IGN.</li></ul>
        <div className="guide-stage-foot">Wait for recruiter approval before proceeding to the remaining casual requirements.</div>
      </article>
      <article className="guide-stage">
        <div className="guide-stage-top"><span>02</span><small>CASUAL APPLICATION</small></div>
        <h3>Complete remaining proofs</h3>
        <ul className="guide-list">
          <li>TikTok account screenshot showing ASY after your IGN.</li>
          <li>Proof that you follow the official ASYLUM Community TikTok.</li>
          <li>Discord nickname screenshot showing <strong>IGN ASY</strong>.</li>
          <li>Roster photo for the welcome banner. Include your Facebook name in the Discord caption.</li>
        </ul>
        <div className="guide-stage-foot">Submit these screenshots together after CODM approval.</div>
      </article>
      <article className="guide-stage">
        <div className="guide-stage-top"><span>03</span><small>CASUAL APPLICATION</small></div>
        <h3>Final review</h3>
        <ul className="guide-list">
          <li>Recruiters check your screenshots.</li>
          <li>Complete the Membership Form when the recruiter sends it.</li>
          <li>Wait for the final screening and MGC confirmation.</li>
        </ul>
        <div className="guide-stage-foot">Keep your tracking code. Do not submit a duplicate application while under review.</div>
      </article>
    </div>
    <section className="panel guide-referral">
      <div className="guide-section-heading"><small className="kicker">REFERRAL APPLICATION • SEPARATE PROCESS</small><h2>Referral application — step by step</h2></div>
      <p className="guide-referral-intro">If an existing ASYLUM Community member referred you, follow these steps instead of the direct application screenshot sequence.</p>
      <div className="referral-steps">
        <article className="referral-step"><span className="referral-step-number">01</span><div><h3>Apply as a referral</h3><p>Select <strong>Referral Application</strong> in Apply to Join. Complete the required application details, submit once, and save your tracking code.</p></div></article>
        <article className="referral-step"><span className="referral-step-number">02</span><div><h3>Prepare your account screenshots</h3><p>Take screenshots of your <strong>CODM and TikTok accounts</strong> showing ASY after your IGN. Include proof that you follow the <strong>official ASYLUM Community TikTok</strong>.</p></div></article>
        <article className="referral-step"><span className="referral-step-number">03</span><div><h3>Complete the referral proofs</h3><p>Screenshot your conversation with the member who referred you. Fill out the Referral Membership Form and capture the confirmation showing your IGN.</p><a href="https://docs.google.com/forms/d/e/1FAIpQLSfMRLP7A9LiERdtPNS6juLH05it3m0buT-GGzeoM4cm0M57rQ/viewform" target="_blank" rel="noreferrer">Open Referral Membership Form ↗</a></div></article>
        <article className="referral-step"><span className="referral-step-number">04</span><div><h3>Set up your Discord and roster photo</h3><p>Join the official Discord, set your server nickname to <strong>IGN ASY</strong>, and take a screenshot. Upload your roster photo to <strong>#PICS-FOR-WELCOME-BANNER</strong> with your Facebook name in the caption.</p><a href="https://discord.gg/HbJ5Jvw8y8" target="_blank" rel="noreferrer">Join official ASYLUM Discord ↗</a></div></article>
        <article className="referral-step"><span className="referral-step-number">05</span><div><h3>Submit proofs together and wait for review</h3><p>Open <strong>Track Application</strong> using your tracking code and email. Upload all required screenshots in <strong>one batch</strong>. Recruiters will check your proofs and update your application status.</p></div></article>
      </div>
    </section>
    <section className="panel guide-example-section"><small className="kicker">OFFICIAL SCREENSHOT REFERENCES</small><h2>What correct proofs look like</h2><div className="example-proof-grid">{EXAMPLE_PROOFS.map(item=><ExampleProof key={item.key} kind={item.key}/>)}</div></section>
    <section className="panel discord-howto">
      <div className="guide-section-heading"><small className="kicker">DISCORD NEXT STEP</small><h2>Invite sent after review</h2></div>
      <p className="muted">Casual applicants receive their Discord invite after Step 1 approval. Referral applicants can use the official Discord invite in the Referral checklist above to prepare their proofs together. Set your server nickname to <strong>IGN ASY</strong> and follow the role instructions in the server.</p>
    </section>
    <section className="panel guide-links">
      <div className="guide-section-heading"><small className="kicker">PUBLIC RESOURCE</small><h2>ASY Community TikTok</h2></div>
      <div className="guide-link-grid">
        <a href="https://www.tiktok.com/@asy.community?_t=ZS-8wNEx3vdVab&_r=1" target="_blank" rel="noreferrer"><b>ASY Community TikTok</b><span>Follow account <ArrowRight size={14}/></span></a>
      </div>
      <p className="muted">The Discord invite is sent individually after CODM proof approval so you can complete the Discord and roster-photo screenshots. The Membership Form is sent after all required screenshots are approved; the recruiter then checks your response before the final MGC confirmation.</p>
    </section>
    <section className="panel guide-note"><ShieldCheck size={20}/><div><strong>Final check</strong><p>Recruiters will contact you to double-check the Membership Form/MGC because of the reported form bug. No GC invite or acceptance is automatic.</p></div></section>
    <div className="guide-cta-row"><div><strong>Ready?</strong><p>Apply or track your current screening.</p></div><div className="guide-cta-actions"><button className="primary" type="button" onClick={onApply}>Apply <ArrowRight size={15}/></button><button className="secondary" type="button" onClick={onTrack}>Track application <ArrowRight size={15}/></button></div></div>
  </section>;
}

function RosterPage({roster,onApply}:{roster:Roster[];onApply:()=>void}) {
 const [search,setSearch]=useState('');
 const [currentPage,setCurrentPage]=useState(1);
 const pageSize=24;
 const filtered=roster.filter(member=>[member.ign,member.clan_name||'',member.rank,member.main_role].some(value=>value.toLowerCase().includes(search.trim().toLowerCase())));
 const pageCount=Math.max(1,Math.ceil(filtered.length/pageSize));
 const visible=filtered.slice((currentPage-1)*pageSize,currentPage*pageSize);
 return <section className="page"><Heading kicker="03 / OFFICIAL DIRECTORY" title={<>THE ASYLUM <em>COMMUNITY.</em></>} desc="Search active ASY members by in-game name or clan. Personal contact details and CODM UIDs are not shown here."/>
 <div className="roster-tools"><label className="roster-search"><Search size={16}/><input value={search} onChange={event=>{setSearch(event.target.value);setCurrentPage(1);}} placeholder="Search IGN or clan name"/></label><span>{filtered.length} of {roster.length} members</span></div>
 {roster.length===0?<div className="panel empty"><Users size={38}/><h2>Community roster coming together.</h2><p>Approved community members can appear here once recruitment starts.</p><button className="secondary" onClick={onApply}>Be one of the first <ArrowRight size={15}/></button></div>:filtered.length===0?<div className="panel empty"><Search size={30}/><h2>No matching members</h2><p>Try a different in-game name or clan.</p></div>:<><div className="roster-grid">{visible.map((member,index)=><div className="roster-card" key={member.id}><span className="number">{String((currentPage-1)*pageSize+index+1).padStart(3,'0')}</span><div className="avatar"><Swords size={27}/></div><small>{member.clan_name||member.rank||'ASY Community'}</small><h3>{member.ign}</h3><span className="role">{member.main_role==='Community Member'?'ASY Member':member.main_role}</span><footer><i/> ACTIVE <span>CODM</span></footer></div>)}</div><div className="roster-pagination"><button className="secondary" disabled={currentPage===1} onClick={()=>setCurrentPage(page=>Math.max(1,page-1))}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="secondary" disabled={currentPage>=pageCount} onClick={()=>setCurrentPage(page=>Math.min(pageCount,page+1))}>Next</button></div></>}
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
];

function normalizeSupportText(value:string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}

function getRecruitmentReply(question: string, intakeSettings: IntakeSettings|null): Omit<ChatEntry, 'role'> {
  const q = normalizeSupportText(question);
  if (/^(hi|hello|hey|good morning|good afternoon|good evening|kamusta|kumusta)$/.test(q)) {
    return { text: 'Hi! Welcome to ASY Community. 😊 I can help with recruitment requirements, application tracking, screening proofs, referral applications, and basic dashboard questions. Ano ang gusto mong malaman?' };
  }
  if (/referral|referred|referrer/.test(q)) {
    return {
      text: 'For Referral Application, choose “Referral Application” in the application form and enter your referrer’s name plus Facebook profile link. Referral applicants complete the usual eligibility checks and screening proof stages, plus a screenshot of the conversation with the referring member. Upload it with your other remaining screenshots in Step 2, after the CODM screenshot is approved. A referral does not guarantee acceptance.',
      links: screeningLinks,
    };
  }
  if (/accepted|screening gc|screening group|screenshot|roster photo|cooldown|cool down|gc nickname|proofs|proof checklist|upload proof/.test(q)) {
    return {
      text: 'Use Track application with your tracking code and the same email you used to apply. Upload only the proof for the currently unlocked stage:\n\n1. Step 1: Upload your main CODM account screenshot showing the ASY tag after your IGN. Referral applicants should wait until Step 2 to upload referral proof.\n2. Step 2: After CODM approval, upload all remaining screenshots together: TikTok account with ASY tag, follow proof for the official ASY TikTok, Discord nickname in the format IGN ASY, and roster photo following the admin reference. Referral applicants also upload their referral conversation screenshot. Include your Facebook name in the roster photo caption.\n\nThe Membership Form link is sent privately after all required screenshots are approved. After you submit it, tell the recruiter in Private Application Chat so the team can check the response before the final MGC confirmation. Never share passwords or login codes.',
      links: screeningLinks,
    };
  }
  if (/eligible|eligibility|age|16|leg series|legendary series|requirements|minimum rank/.test(q)) {
    return {
      text: 'The current basic ASY recruitment requirements are:\n\n• At least 16 years old.\n• At least 6 Legendary Series combined across MP and BR. Direct applicants confirm eligibility; Referral applicants enter each mode separately.\n• An appropriate Facebook name.\n• Willing to add the ASY tag after your IGN on your main CODM and TikTok accounts.\n• Willing to provide a proper roster photo when requested.\n\nMeeting the minimum requirements does not guarantee acceptance; the recruitment team reviews applications.',
      links: screeningLinks,
    };
  }
  if (/tiktok|follow/.test(q)) {
    return { text: 'Follow the official ASY Community TikTok account. When the follow-proof step unlocks in Track application, upload a screenshot there for recruiter review. Keep the evidence private.', links: [screeningLinks[0]] };
  }
  if (/membership form|form link|member form/.test(q)) {
    return { text: 'The official Membership Form link is provided at the end of screening. First submit your CODM screenshot, wait for recruiter approval, then upload the remaining requirements together and pass the final check. Open Track application to see your current step.' };
  }
  if (/discord|server nickname|banner photo/.test(q)) {
    return { text: 'The official ASY Discord invite is sent by a recruiter through Private Application Chat after your Step 1 CODM screenshot is approved, so you can complete the remaining Discord and roster-photo proofs. Do not create another application while waiting.' };
  }
  if (/track|tracking code|application status|status|pending|review|where is my application/.test(q)) {
    return { text: 'Open “Track application” on this website and enter your tracking code plus the same contact email you used when applying. The page shows the latest status saved by the recruitment team. If something is incorrect, use Private Application Chat on your tracked application and ask a recruiter to correct the same record. Do not submit a duplicate application.' };
  }
  if (/limit|slots|capacity|how many applicants/.test(q)) {
    if (!intakeSettings) return { text: 'I could not load the current intake status. Refresh the page or check the latest official announcement before submitting.' };
    if (!intakeSettings.intake_open) return { text: 'Recruitment submissions are currently closed by management. Check official ASY announcements for the next intake.' };
    if (intakeSettings.application_limit !== null && intakeSettings.application_count >= intakeSettings.application_limit) return { text: 'The current application limit has been reached. Please check back after management opens a new intake.' };
    if (intakeSettings.application_limit === null) return { text: 'Recruitment is currently open. Management has not set a numeric application cap for this intake, so submit only one application and wait for its status.' };
    return { text: 'Recruitment is open. ' + intakeSettings.application_count + ' of ' + intakeSettings.application_limit + ' application slots have been used. Please submit only one application.' };
  }
  if (/casual group|casual team|casual player|looking for team|find teammates|team/.test(q)) {
    return { text: 'For now, ASY is focusing on Casual Groups so members can find teammates and play together. Competitive team management is paused while the competitive roster is small. Check official ASY announcements for group activity details; the dashboard’s team list may be updated by management.' };
  }
  if (/scrim|practice match|friendly match|match schedule/.test(q)) {
    return { text: 'For scrim updates, check the official ASY announcements and the scrim schedule on the dashboard. Confirm the date, time, game mode, and opponent with management before the match. If a schedule looks incorrect, report the event title and displayed time to an authorized admin.' };
  }
  if (/password|login code|otp|account hacked|facebook password/.test(q)) {
    return { text: 'For your safety, never send your password, OTP, or login code to this chat or any ASY staff member. Use the official account recovery process for the platform involved. ASY recruitment only needs the information and proof requested by the website.' };
  }
  if (/dashboard|website|bug|error|not working|does not work|cannot|can't|cant|problem|issue/.test(q)) {
    return { text: 'Sorry you’re having trouble with the dashboard. Try refreshing the page and checking that you entered the correct tracking code and the same application email. If it still fails, use the Private Application Chat on your tracked application to contact recruitment. Never share passwords or login codes in public chat.' };
  }
  if (/human|admin|recruiter|staff|help|assist|contact/.test(q)) {
    return { text: 'I can answer common ASY questions, but a recruiter or management member must handle account-specific issues and final decisions. Open Track application with your tracking code and application email, then message the recruitment team through Private Application Chat.' };
  }
  if (/apply|application|join|recruitment/.test(q)) {
    return { text: 'To join ASY, open “Apply to join” on this website and complete the application honestly. Save the ASYLUM tracking code shown after submission, then use “Track application” to check your status. Submit only one application and wait for recruiter review.' };
  }
  return { text: 'I don’t have a verified answer for that exact question yet, so I don’t want to guess. I can help with eligibility, applying, tracking your application, screening proofs, referral requirements, Casual Groups, scrims, and basic dashboard issues. For account-specific questions, use Private Application Chat on your tracked application.' };
}

const SUPPORT_HISTORY_KEY = 'asy-recruitment-support-history-v1';
const supportWelcome: ChatEntry = {
  role: 'assistant',
  text: 'Hi! I’m the ASY Recruitment Assistant. I can help with eligibility, applying, tracking, screening proofs, referrals, Casual Groups, and scrims. Your chat history is saved on this browser. Recruiters make all final decisions.',
};

function loadSupportHistory(): ChatEntry[] {
  try {
    const raw = window.localStorage.getItem(SUPPORT_HISTORY_KEY);
    if (!raw) return [supportWelcome];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [supportWelcome];
    const valid = parsed.filter((item): item is ChatEntry =>
      !!item && typeof item === 'object' &&
      ((item as ChatEntry).role === 'assistant' || (item as ChatEntry).role === 'user') &&
      typeof (item as ChatEntry).text === 'string'
    ).slice(-100);
    return valid.length ? valid : [supportWelcome];
  } catch {
    return [supportWelcome];
  }
}

function ChatSupport({intakeSettings}:{intakeSettings:IntakeSettings|null}) {
  const [open,setOpen]=useState(false);
  const [draft,setDraft]=useState('');
  const [chatBusy,setChatBusy]=useState(false);
  const [messages,setMessages]=useState<ChatEntry[]>(loadSupportHistory);

  useEffect(() => {
    try {
      window.localStorage.setItem(SUPPORT_HISTORY_KEY, JSON.stringify(messages.slice(-100)));
    } catch {
      // Chat remains usable even if the browser blocks local storage.
    }
  }, [messages]);

  async function ask(question:string) {
    const cleanQuestion=question.trim().slice(0,500);
    if(!cleanQuestion||chatBusy)return;
    const fallback=getRecruitmentReply(cleanQuestion,intakeSettings);
    const history=messages.slice(-8).map(item=>({role:item.role,text:item.text.slice(0,500)}));
    setMessages(old=>[...old,{role:'user',text:cleanQuestion}]);
    setChatBusy(true);
    try {
      const response=await fetch('/api/ai-support',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message:cleanQuestion,history}),
      });
      const data=await response.json() as {answer?:string;error?:string};
      if(!response.ok)throw new Error(data.error||'AI support unavailable');
      if(!data.answer?.trim())throw new Error('Empty AI response');
      setMessages(old=>[...old,{role:'assistant',text:data.answer.trim()}]);
    }catch(error){
      console.warn('Gemini support unavailable; using ASY FAQ.',error);
      const reason=error instanceof Error?error.message:'AI support unavailable';
      setMessages(old=>[...old,{role:'assistant',text:'AI support is temporarily unavailable ('+reason+'). Here is the verified ASY guide:\n\n'+fallback.text,links:fallback.links}]);
    }finally{
      setChatBusy(false);
    }
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
          <div><strong>ASY Recruitment Support</strong><small>Gemini AI + verified FAQ backup · chat history saved</small></div>
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
            <button type="button" disabled={chatBusy} onClick={()=>void ask('What proofs do I need to upload?')}>Screening proof checklist</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('What are the Referral Recruitment requirements?')}>Referral requirements</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('How do I track my application?')}>Track application</button>
            <button type="button" disabled={chatBusy} onClick={()=>void ask('Is there a limit on applications?')}>Application limit</button>
          </div>}
        </div>
        <form className="chat-input-row" onSubmit={sendMessage}>
          <input value={draft} onChange={event=>setDraft(event.target.value)} placeholder="Ask about ASY recruitment…" aria-label="Ask about ASY recruitment" maxLength={500} disabled={chatBusy}/>
          <button type="submit" disabled={!draft.trim()||chatBusy} aria-label="Send message"><Send size={17}/></button>
        </form>
        <p className="chat-disclaimer">AI answers general recruitment questions; if unavailable, the verified ASY FAQ is used. Do not share passwords, OTPs or private details. Chat history stays in this browser. Recruiters make final decisions.</p>
      </section>}
      <button type="button" className="chat-launcher" aria-label={open?'Close support chat':'Open support chat'} aria-expanded={open} onClick={()=>setOpen(value=>!value)}>
        {open?<X size={23}/>:<MessageCircle size={24}/>}
        {!open&&<span>ASK ASY</span>}
      </button>
    </div>
  );
}
