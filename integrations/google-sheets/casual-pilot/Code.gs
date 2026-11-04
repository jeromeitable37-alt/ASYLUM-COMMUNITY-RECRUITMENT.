/**
 * ASYLUM Direct membership Sheets connector — safe dual-mode deployment.
 *
 * Default: TEST (WEBSITE_CASUAL_TEST only).
 * Live: set Script Property ASY_CASUAL_SYNC_TARGET=live, only AFTER the
 * source Sheet is restricted to authorized users and management approves it.
 * All requests require ASY_CASUAL_SYNC_TOKEN (server secret, 32+ chars).
 *
 * Original Google Forms fields are A:K. L is the website-only tracking code
 * for idempotent upserts; Master List mapping should use A:K.
 */
const ASY_CASUAL_SYNC = Object.freeze({
  spreadsheetId:'17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU',
  testTab:'WEBSITE_CASUAL_TEST',
  liveTab:'SCREENING',
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
  if(mode==='live'&&code==='ASYLUM-PILOT20261104')throw Error('Pilot demo cannot enter SCREENING.');
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
  ]};
}
function pilotAccess_(id){
  const access=DriveApp.getFileById(id).getSharingAccess();
  return access===DriveApp.Access.PRIVATE?'restricted':'link-shared';
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
        ok:true,mode,
        access:pilotAccess_(ASY_CASUAL_SYNC.spreadsheetId),
        tab:mode==='live'?ASY_CASUAL_SYNC.liveTab:ASY_CASUAL_SYNC.testTab
      });
    }
    if(mode==='live'&&pilotAccess_(ASY_CASUAL_SYNC.spreadsheetId)!=='restricted')
      return pilotReply_({ok:false,error:'Restrict spreadsheet sharing to staff before live sync.'});
    const parsed=pilotParse_(body,mode);
    const lock=LockService.getScriptLock();
    if(!lock.tryLock(20000))return pilotReply_({ok:false,error:'Busy; retry.'});
    try{
      const target=mode==='live'?ASY_CASUAL_SYNC.liveTab:ASY_CASUAL_SYNC.testTab;
      const tab=SpreadsheetApp.openById(ASY_CASUAL_SYNC.spreadsheetId).getSheetByName(target);
      if(!tab)throw Error('Destination sheet missing.');
      const header=tab.getRange(1,12).getDisplayValue().trim();
      if(header&&!/application code/i.test(header))throw Error('Column L is occupied; cannot use it for website deduplication.');
      if(!header&&mode==='live')tab.getRange(1,12).setValue('Website Application Code');
      const last=tab.getLastRow();
      let rowIndex=0;
      if(last>1){
        const codes=tab.getRange(2,12,last-1,1).getDisplayValues();
        const match=codes.findIndex(row=>row[0]===parsed.code);
        if(match>=0)rowIndex=match+2;
      }
      const updated=rowIndex>0;
      rowIndex=rowIndex||last+1;
      if(rowIndex>tab.getMaxRows())tab.insertRowsAfter(tab.getMaxRows(),1);
      if(updated){
        const old=tab.getRange(rowIndex,1,1,12).getValues()[0];
        if(old[0] instanceof Date&&!isNaN(old[0].getTime()))parsed.row[0]=old[0];
        if(mode==='live')parsed.row[10]=old[10]||''; // K is STAFF's original Version/notes.
      }
      tab.getRange(rowIndex,3).setNumberFormat('@');
      tab.getRange(rowIndex,7).setNumberFormat('@');
      tab.getRange(rowIndex,1,1,12).setValues([parsed.row]);
      tab.getRange(rowIndex,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      SpreadsheetApp.flush();
      return pilotReply_({ok:true,mode,action:updated?'updated':'inserted',row:rowIndex});
    }finally{lock.releaseLock();}
  }catch(error){
    // Do not log applicant details, birthdate or token.
    return pilotReply_({ok:false,error:String(error&&error.message||'Sync failed').slice(0,130)});
  }
}
function doGet(){return pilotReply_({ok:false,message:'POST only. ASY Direct connector.'});}
