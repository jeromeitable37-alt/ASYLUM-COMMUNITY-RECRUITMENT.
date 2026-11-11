/**
 * ASYLUM Direct membership Sheets connector — safe dual-mode deployment.
 *
 * Default: TEST (WEBSITE_CASUAL_TEST only).
 * Live: management uses the Recruiter Dashboard's guarded "Go Live" action
 * AFTER redeploying this version of Code.gs. The action restricts the
 * spreadsheet, preserves specific staff access, and sets LIVE atomically.
 * All requests require ASY_CASUAL_SYNC_TOKEN (server secret, 32+ chars).
 *
 * DIRECT fields A:J stay unchanged, K is staff's Version dropdown,
 * L is the existing Old GC (RETURNEE) column, M is Website Application Code.
 * TEST retains its historical A:L layout. Never insert or reorder columns.
 */
const ASY_CASUAL_SYNC = Object.freeze({
  spreadsheetId:'17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU',
  testTab:'WEBSITE_CASUAL_TEST',
  liveTab:'DIRECT',
  secretProperty:'ASY_CASUAL_SYNC_TOKEN',
  modeProperty:'ASY_CASUAL_SYNC_TARGET'
});
function pilotReply_(data){
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}
function pilotSafeText_(value,max){
  const s=String(value==null?'':value).trim().replace(/[\u0000-\u001F\u007F]/g,' ').slice(0,max);
  return /^[=+\-@]/.test(s)?"'"+s:s;
}
function pilotParse_(body,mode){
  if(body.action!=='casual_upsert'||body.application_type!=='casual')throw Error('Invalid application route.');
  const a=body.applicant||{};
  const code=String(body.application_code||'').toUpperCase().trim();
  const uid=String(a.codm_uid||'').trim();
  const dob=String(a.birthdate||'').trim();
  const ign=String(a.ign||'').trim();
  if(!/^ASYLUM-[A-Z0-9]{6,20}$/.test(code))throw Error('Invalid application code.');
  if(mode==='live'&&code==='ASYLUM-PILOT20261104')throw Error('Pilot demo cannot enter DIRECT.');
  if(!/^\d{19}$/.test(uid))throw Error('Invalid UID.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))throw Error('Invalid birthdate.');
  const date=new Date(dob+'T12:00:00Z');
  if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==dob)throw Error('Invalid birthdate.');
  if(mode==='live'){
    const today=new Date();
    const threshold=new Date(Date.UTC(today.getUTCFullYear()-16,today.getUTCMonth(),today.getUTCDate()));
    if(dob>threshold.toISOString().slice(0,10))throw Error('Applicant must be at least 16.');
  }
  if(!String(a.facebook_name||'').trim()||ign.length<2||!String(a.clan_name||'').trim())
    throw Error('Missing required Casual applicant fields.');
  const created=new Date(body.submitted_at||Date.now());
  if(isNaN(created.getTime()))throw Error('Invalid submitted timestamp.');
  return {code,row:[
    created,
    pilotSafeText_(a.facebook_name,120),
    dob,
    pilotSafeText_(a.facebook_url,500),
    pilotSafeText_(a.tiktok_url,500),
    pilotSafeText_(ign,32),
    uid,
    pilotSafeText_(a.streamer_mode_id,100),
    pilotSafeText_(a.clan_name,120),
    pilotSafeText_(a.discord_username,80),
    mode==='test'?pilotSafeText_(a.version||'',60):'',
    code
  ],oldVersion:body.is_returnee===true?pilotSafeText_(a.old_version||'',80):'',isReturnee:body.is_returnee===true};
}
function pilotAccess_(id){
  const access=DriveApp.getFileById(id).getSharingAccess();
  return access===DriveApp.Access.PRIVATE?'restricted':'link-shared';
}
/**
 * Private directory bridge. Returns only the minimum fields the existing
 * ASYLUM member-directory sync needs, never birthdates or contact details.
 * This action always requires the shared server token and is usable in
 * TEST mode before the Google Sheet is restricted.
 */
function pilotDirectory_(){
  const book=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId);
  const tabs=['DIRECT','REFERRAL','TEAMS'];
  const records=[];
  for(const name of tabs){
    const tab=book.getSheetByName(name);
    if(!tab)throw Error('Directory tab '+name+' missing.');
    if(tab.getLastRow()<2)continue;
    const values=tab.getRange(1,1,tab.getLastRow(),Math.min(tab.getLastColumn(),12)).getDisplayValues();
    const heads=values[0].map(x=>String(x||'').toLowerCase().trim());
    const locate=(key)=>heads.findIndex(v=>v.includes(key));
    const ignCol=locate('ign (in-game name');
    const uidCol=heads.findIndex(v=>v==='uid'||v.startsWith('uid '));
    const clanCol=locate('clan name');
    const dateCol=locate('timestamp');
    if(ignCol<0||uidCol<0||clanCol<0)throw Error('Directory headers missing in '+name+'.');
    for(let i=1;i<values.length;i++){
      const row=values[i];
      const ign=String(row[ignCol]||'').trim().slice(0,32);
      const uid=String(row[uidCol]||'').trim().slice(0,40);
      if(ign.length<2||uid.length<5)continue;
      const clan=String(row[clanCol]||'').trim().slice(0,120);
      const timestamp=String(row[dateCol>=0?dateCol:0]||'').trim().slice(0,50);
      records.push({ign,uid,clan_name:clan,timestamp});
    }
  }
  return records;
}
/**
 * Management-triggered production switch (authenticated in Supabase first).
 * Only link-wide access is removed. Owner and named editors retain access.
 * If the connection cannot be made private, LIVE mode is never enabled.
 */
function pilotValidateDirectHeaders_(tab){
  // Fail closed rather than overwrite staff-owned Version or Old GC columns.
  const headers=tab.getRange(1,11,1,3).getDisplayValues()[0]
    .map(h=>String(h||'').trim().toLowerCase());
  if(!/^version$/.test(headers[0])||
     !/^old (gc|version)/.test(headers[1])||
     !/website application code/.test(headers[2])){
    throw Error('DIRECT headers K:M must be Version, Old GC (RETURNEE), Website Application Code. No cells changed.');
  }
}
function pilotGoLive_(props){
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw Error('Activation busy; retry.');
  try{
    const book=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId);
    const live=book.getSheetByName(ASY_CASUAL_SYNC.liveTab);
    if(!live)throw Error('DIRECT tab not found.');
    pilotValidateDirectHeaders_(live);
    const count=pilotDirectory_().length;
    if(count<10)throw Error('Private directory bridge did not return enough members.');
    const file=DriveApp.getFileById(ASY_CASUAL_SYNC.spreadsheetId);
    if(file.getSharingAccess()!==DriveApp.Access.PRIVATE){
      // Keep the current link permission value while removing the public class.
      // Google rejects Permission.NONE in this combination.
      file.setSharing(DriveApp.Access.PRIVATE,file.getSharingPermission());
    }
    if(file.getSharingAccess()!==DriveApp.Access.PRIVATE)
      throw Error('Google Sheet remains link-shared; refusing LIVE activation.');
    props.setProperty(ASY_CASUAL_SYNC.modeProperty,'live');
    return pilotReply_({ok:true,mode:'live',access:'restricted',directory_count:count});
  }finally{
    lock.releaseLock();
  }
}
/**
 * Remove ONLY a website-originated Direct Application row, matched by the
 * exact unique tracking code in DIRECT column M.
 * Never deletes original Google Forms rows, REFERRAL or TEAMS.
 * Idempotent: repeated requests for a missing row return not_found=true.
 */
function pilotDeleteRejected_(code){
  const candidate=String(code||'').toUpperCase().trim();
  if(!/^ASYLUM-[A-Z0-9]{8}$/.test(candidate))throw Error('Invalid website application code.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw Error('Google Sheets row lock busy; retry.');
  try{
    const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId)
      .getSheetByName(ASY_CASUAL_SYNC.liveTab);
    if(!tab)throw Error('DIRECT tab missing.');
    pilotValidateDirectHeaders_(tab);
    const last=tab.getLastRow();
    if(last<2)return pilotReply_({ok:true,mode:'live',removed:false,not_found:true});
    const codes=tab.getRange(2,13,last-1,1).getDisplayValues();
    const matches=[];
    for(let i=0;i<codes.length;i++){
      if(String(codes[i][0]||'').trim()===candidate)matches.push(i+2);
    }
    if(matches.length>1)throw Error('Duplicate website application codes; manual review required.');
    if(!matches.length)return pilotReply_({ok:true,mode:'live',removed:false,not_found:true});
    tab.deleteRow(matches[0]);
    SpreadsheetApp.flush();
    return pilotReply_({ok:true,mode:'live',removed:true});
  }finally{
    lock.releaseLock();
  }
}
/**
 * REFERRAL route — original Google Form A:O retained verbatim.
 * Column P is exclusively the website tracking code. Version (N) and staff
 * Notes (O) remain staff-owned and are preserved on updates.
 * Evidence is private in Supabase; no screenshots or private storage links
 * are copied to Google Sheets.
 */
function pilotReferralParse_(body){
  if(body.action!=='referral_upsert'||body.application_type!=='referral')
    throw Error('Invalid Referral route.');
  const applicant=body.applicant||{};
  const code=String(body.application_code||'').trim().toUpperCase();
  const uid=String(applicant.codm_uid||'').trim();
  const dob=String(applicant.birthdate||'').trim();
  const ign=String(applicant.ign||'').trim();
  if(!/^ASYLUM-[A-Z0-9]{8}$/.test(code))throw Error('Invalid Referral application code.');
  if(!/^\d{19}$/.test(uid)||ign.length<2)throw Error('Invalid Referral IGN or UID.');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(dob))throw Error('Referral birthdate is required.');
  const date=new Date(dob+'T12:00:00Z');
  if(isNaN(date.getTime())||date.toISOString().slice(0,10)!==dob)
    throw Error('Invalid Referral birthdate.');
  const now=new Date();
  const cutoff=new Date(Date.UTC(now.getUTCFullYear()-16,now.getUTCMonth(),now.getUTCDate()));
  if(dob>cutoff.toISOString().slice(0,10))throw Error('Referral applicant must be at least 16.');
  if(!String(applicant.facebook_name||'').trim()||
     !String(applicant.clan_name||'').trim()||
     !String(applicant.referrer_name||'').trim()||
     !String(applicant.referrer_facebook_url||'').trim())
    throw Error('Referral membership details are incomplete.');
  const submitted=new Date(body.submitted_at||Date.now());
  if(isNaN(submitted.getTime()))throw Error('Invalid Referral timestamp.');
  return {code,row:[
    submitted,
    pilotSafeText_(applicant.facebook_name,120),
    dob,
    pilotSafeText_(applicant.facebook_url,500),
    pilotSafeText_(applicant.tiktok_url,500),
    pilotSafeText_(ign,32),
    uid,
    pilotSafeText_(applicant.streamer_mode_id,100),
    pilotSafeText_(applicant.clan_name,120),
    pilotSafeText_(applicant.discord_username,80),
    'Screenshot proofs managed in private ASYLUM Recruitment',
    pilotSafeText_(applicant.referrer_name,120),
    pilotSafeText_(applicant.referrer_facebook_url,500),
    '', // N: Version, edited by staff
    '', // O: Notes, edited by staff
    code
  ]};
}
function pilotReferralUpsert_(body){
  const parsed=pilotReferralParse_(body);
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw Error('Referral Sheet is busy; retry.');
  try{
    const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId).getSheetByName('REFERRAL');
    if(!tab)throw Error('REFERRAL tab does not exist.');
    if(tab.getLastColumn()<15)throw Error('REFERRAL original columns are incomplete.');
    const header=String(tab.getRange(1,16).getDisplayValue()||'').trim();
    if(header&&!/website application code/i.test(header))
      throw Error('REFERRAL column P is already in use.');
    const last=tab.getLastRow();
    let matching=[];
    if(last>1){
      const codes=tab.getRange(2,16,last-1,1).getDisplayValues();
      codes.forEach((r,i)=>{if(String(r[0]||'').trim()===parsed.code)matching.push(i+2);});
    }
    if(matching.length>1)throw Error('Duplicate Referral website codes require review.');
    if(!header)tab.getRange(1,16).setValue('Website Application Code');
    const exists=matching.length===1;
    const rowIndex=exists?matching[0]:last+1;
    if(rowIndex>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),1);
    if(exists){
      const previous=tab.getRange(rowIndex,1,1,16).getValues()[0];
      if(previous[0] instanceof Date&&!isNaN(previous[0].getTime()))
        parsed.row[0]=previous[0];
      parsed.row[13]=previous[13]||'';
      parsed.row[14]=previous[14]||'';
      // Preserve any existing screenshot/reference notes in K.
      parsed.row[10]=previous[10]||parsed.row[10];
    }
    // REFERRAL is a Google Sheets typed table: formats are managed by the table.
    // Apps Script setNumberFormat() on its typed columns throws, blocking sync.
    // Preserve existing table types and write only the mapped row values.
    tab.getRange(rowIndex,1,1,16).setValues([parsed.row]);
    SpreadsheetApp.flush();
    return pilotReply_({ok:true,mode:'live',route:'referral',row:rowIndex,
      action:exists?'updated':'inserted'});
  }finally{lock.releaseLock();}
}
function pilotReferralDelete_(value){
  const code=String(value||'').trim().toUpperCase();
  if(!/^ASYLUM-[A-Z0-9]{8}$/.test(code))throw Error('Invalid Referral tracking code.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(20000))throw Error('Referral cleanup busy; retry.');
  try{
    const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId).getSheetByName('REFERRAL');
    if(!tab)throw Error('REFERRAL tab missing.');
    if(!/website application code/i.test(String(tab.getRange(1,16).getDisplayValue()||'')))
      throw Error('Website tracking column P is not configured.');
    const last=tab.getLastRow();
    if(last<2)return pilotReply_({ok:true,mode:'live',route:'referral',removed:false,not_found:true});
    const codes=tab.getRange(2,16,last-1,1).getDisplayValues();
    const matches=[];
    codes.forEach((row,i)=>{if(String(row[0]||'').trim()===code)matches.push(i+2);});
    if(matches.length>1)throw Error('Duplicate tracking codes; automatic deletion refused.');
    if(!matches.length)return pilotReply_({ok:true,mode:'live',route:'referral',removed:false,not_found:true});
    tab.deleteRow(matches[0]);SpreadsheetApp.flush();
    return pilotReply_({ok:true,mode:'live',route:'referral',removed:true});
  }finally{lock.releaseLock();}
}
function doPost(e){
  try{
    const body=JSON.parse((e&&e.postData&&e.postData.contents)||'{}');
    const props=PropertiesService.getScriptProperties();
    const secret=props.getProperty(ASY_CASUAL_SYNC.secretProperty);
    if(!secret||secret.length<32||body.token!==secret)return pilotReply_({ok:false,error:'Not authorized.'});
    const mode=props.getProperty(ASY_CASUAL_SYNC.modeProperty)==='live'?'live':'test';
    if(body.action==='casual_health'){
      return pilotReply_({
        ok:true,mode,version:'secure-v3',
        access:pilotAccess_(ASY_CASUAL_SYNC.spreadsheetId),
        tab:mode==='live'?ASY_CASUAL_SYNC.liveTab:ASY_CASUAL_SYNC.testTab
      });
    }
    if(body.action==='casual_directory'){
      const rows=pilotDirectory_();
      return pilotReply_({ok:true,version:'secure-v3',records:rows,count:rows.length});
    }
    if(body.action==='referral_health'){
      const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId).getSheetByName('REFERRAL');
      if(!tab)throw Error('REFERRAL tab missing.');
      const header=String(tab.getRange(1,16).getDisplayValue()||'').trim();
      return pilotReply_({ok:true,version:'referral-v1',mode:mode,
        access:pilotAccess_(ASY_CASUAL_SYNC.spreadsheetId),
        destination:'REFERRAL',key_column:'P',
        column_ready:!header||/website application code/i.test(header)});
    }
    if(body.action==='casual_go_live')return pilotGoLive_(props);
    if(mode==='live'&&pilotAccess_(ASY_CASUAL_SYNC.spreadsheetId)!=='restricted')
      return pilotReply_({ok:false,error:'Restrict spreadsheet sharing to staff before live sync.'});
    if(body.action==='casual_delete'){
      if(mode!=='live')throw Error('Direct rejection cleanup requires LIVE mode.');
      return pilotDeleteRejected_(body.application_code);
    }
    if(body.action==='referral_upsert'||body.action==='referral_delete'){
      if(mode!=='live')throw Error('Referral auto-sync requires private LIVE Google Sheets.');
      return body.action==='referral_delete'
        ?pilotReferralDelete_(body.application_code)
        :pilotReferralUpsert_(body);
    }
    const parsed=pilotParse_(body,mode);
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))return pilotReply_({ok:false,error:'Busy; retry.'});
    try{
      const isLive=mode==='live';
      const target=isLive?ASY_CASUAL_SYNC.liveTab:ASY_CASUAL_SYNC.testTab;
      const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId).getSheetByName(target);
      if(!tab)throw Error('Destination sheet missing.');
      const keyColumn=isLive?13:12; // M = DIRECT website code; L = TEST code.
      if(isLive)pilotValidateDirectHeaders_(tab);
      else if(!/application code/i.test(tab.getRange(1,12).getDisplayValue()))
        throw Error('TEST tracking column L is unavailable.');
      const last=tab.getLastRow();
      let rowIndex=0;
      if(last>1){
        const codes=tab.getRange(2,keyColumn,last-1,1).getDisplayValues();
        const matches=[];
        codes.forEach((row,i)=>{if(String(row[0]||'').trim()===parsed.code)matches.push(i+2);});
        if(matches.length>1)throw Error('Duplicate website application codes; manual review required.');
        if(matches.length)rowIndex=matches[0];
      }
      const updated=rowIndex>0;
      rowIndex=rowIndex||last+1;
      if(rowIndex>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),1);
      const row=isLive
        ? [...parsed.row.slice(0,10),'',parsed.oldVersion,parsed.code]
        : parsed.row;
      if(updated){
        const old=tab.getRange(rowIndex,1,1,isLive?13:12).getValues()[0];
        if(old[0] instanceof Date&&!isNaN(old[0].getTime()))row[0]=old[0];
        if(isLive){
          row[10]=old[10]||''; // K: never overwrite staff Version.
          if(!parsed.isReturnee)row[11]=old[11]||''; // Preserve older Old GC entries.
        }
      }
      // DIRECT is a typed Google Sheets table; do not call setNumberFormat on
      // typed columns. The table owns their formats and validation.
      tab.getRange(rowIndex,1,1,row.length).setValues([row]);
      SpreadsheetApp.flush();
      return pilotReply_({ok:true,mode,action:updated?'updated':'inserted',row:rowIndex});
    }finally{lock.releaseLock();}
  }catch(error){
    // Do not log applicant details, birthdate or token.
    return pilotReply_({ok:false,error:String(error&&error.message||'Sync failed').slice(0,130)});
  }
}
function authorizeSecureSync(){
  // Safe local authorization check; this never changes sharing settings
  // or applicant records. Run it once in the Apps Script editor after
  // replacing Code.gs so Google can request the newly required Drive scope.
  const file=DriveApp.getFileById(ASY_CASUAL_SYNC.spreadsheetId);
  const book=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId);
  if(!book.getSheetByName(ASY_CASUAL_SYNC.liveTab))throw Error('DIRECT tab missing.');
  Logger.log('Secure sync authorization completed. Current access: '+file.getSharingAccess());
}
function doGet(){return pilotReply_({ok:false,message:'POST only. ASY Direct connector.'});}
