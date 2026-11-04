/**
 * ASYLUM COMMUNITY RECRUITMENT — Casual/Direct Google Sheet pilot.
 * Writes ONLY WEBSITE_CASUAL_TEST. Never SCREENING / REFERRALS / TEAMS.
 * Set Script Property ASY_CASUAL_SYNC_TOKEN (32+ random chars)
 * before deploying as an Apps Script web app.
 */
const ASY_CASUAL_PILOT = Object.freeze({
  spreadsheetId: '17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU',
  sheetName: 'WEBSITE_CASUAL_TEST',
  secretProperty: 'ASY_CASUAL_SYNC_TOKEN'
});
function pilotReply_(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
function pilotSafeText_(value, max) {
  const text = String(value == null ? '' : value).trim().replace(/[\u0000-\u001F\u007F]/g, ' ').slice(0, max);
  // Prevent untrusted applicant input from being interpreted as spreadsheet formulas.
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}
function pilotParse_(input) {
  if (!input || input.action !== 'casual_upsert' || input.application_type !== 'casual') throw Error('Invalid route.');
  const a = input.applicant || {};
  const code = String(input.application_code || '').trim().toUpperCase();
  const uid = String(a.codm_uid || '').trim();
  const dob = String(a.birthdate || '').trim();
  if (!/^ASYLUM-[A-Z0-9]{6,20}$/.test(code)) throw Error('Invalid application code.');
  if (!/^\d{19}$/.test(uid)) throw Error('Invalid CODM UID.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob)) throw Error('Birthdate must be YYYY-MM-DD.');
  const date = new Date(dob + 'T12:00:00Z');
  if (isNaN(date.getTime()) || date.toISOString().slice(0,10) !== dob) throw Error('Invalid birthdate.');
  if (!String(a.facebook_name||'').trim() || !String(a.ign||'').trim() || !String(a.version||'').trim()) throw Error('Missing Facebook Name, IGN, or Version.');
  const created = new Date(input.submitted_at || Date.now());
  if (isNaN(created.getTime())) throw Error('Invalid submit timestamp.');
  return {
    code,
    row: [
      created, pilotSafeText_(a.facebook_name,100), dob,
      pilotSafeText_(a.facebook_url,500), pilotSafeText_(a.tiktok_url,500),
      pilotSafeText_(a.ign,32), uid,
      pilotSafeText_(a.streamer_mode_id,100), pilotSafeText_(a.clan_name,120),
      pilotSafeText_(a.discord_username,80), pilotSafeText_(a.version,60),
      code // L is test-only dedup key; original form columns A:K remain unchanged.
    ]
  };
}
function doPost(e) {
  try {
    // Do not log the body: it may contain birthdate or applicant contact details.
    const body = JSON.parse(e && e.postData && e.postData.contents || '{}');
    const secret = PropertiesService.getScriptProperties().getProperty(ASY_CASUAL_PILOT.secretProperty);
    if (!secret || secret.length < 32 || body.token !== secret) return pilotReply_({ok:false,error:'Not authorized.'});
    const parsed = pilotParse_(body);
    const lock = LockService.getScriptLock();
    if (!lock.tryLock(20000)) return pilotReply_({ok:false,error:'Busy; retry.'});
    try {
      const ss = SpreadsheetApp.openById(ASY_CASUAL_PILOT.spreadsheetId);
      const tab = ss.getSheetByName(ASY_CASUAL_PILOT.sheetName);
      if (!tab) throw Error('Missing test sheet.');
      const last = tab.getLastRow();
      let rowNumber = 0;
      if (last > 1) {
        const codes = tab.getRange(2,12,last-1,1).getDisplayValues();
        const offset = codes.findIndex(row=>row[0]===parsed.code);
        if (offset >= 0) rowNumber = offset + 2;
      }
      const isUpdate = rowNumber > 0;
      rowNumber = rowNumber || last + 1;
      if (isUpdate) {
        const oldDate = tab.getRange(rowNumber,1).getValue();
        if (oldDate instanceof Date && !isNaN(oldDate.getTime())) parsed.row[0] = oldDate;
      }
      tab.getRange(rowNumber,7).setNumberFormat('@'); // Preserve 19-digit UID.
      tab.getRange(rowNumber,3).setNumberFormat('@'); // Preserve ISO birthdate.
      tab.getRange(rowNumber,1,1,12).setValues([parsed.row]);
      tab.getRange(rowNumber,1).setNumberFormat('yyyy-mm-dd hh:mm:ss');
      SpreadsheetApp.flush();
      return pilotReply_({ok:true,mode:'test',action:isUpdate?'updated':'inserted',row:rowNumber});
    } finally { lock.releaseLock(); }
  } catch (err) {
    return pilotReply_({ok:false,error:String(err.message||'Pilot sync failed.').slice(0,100)});
  }
}
function doGet() {
  return pilotReply_({ok:false,message:'POST only. Casual pilot not public.'});
}