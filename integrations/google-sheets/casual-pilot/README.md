## Current pilot deployment (Nov 4, 2026)

The owner provided this deployed Google Apps Script endpoint:
`https://script.google.com/macros/s/AKfycbzf9DwgJl-Sa9cVWyvpYPWKWTTqlXTTgAK_-WhAT6nMgbmHhcteTwHDUVx2Uv1Lw46m/exec`

The public URL was installed **server-side** in the new Supabase Edge Function `asy-casual-sheet-pilot` (not in browser code). The function performs full Supabase Auth verification and checks the existing `asy_recruitment_admins` allowlist, with two authorized actions:

- `status`: report whether the secret is present in Supabase; never reveals its value
- `pilot-test`: write/update only the fixed **synthetic** `ASYLUM-PILOT20261104` row in `WEBSITE_CASUAL_TEST` using the Google Apps Script endpoint

**Still required from the owner:** In Supabase Dashboard for project `tyhszzztltamrohhyykh` → **Edge Functions → Secrets**, create `ASY_CASUAL_SYNC_TOKEN` with **exactly the same 32+ character value** that was already saved in Google Apps Script → Project Settings → Script Properties. Never paste the token in ChatGPT, GitHub or Vercel frontend variables.

After saving the secret, go to the Recruiter Dashboard and use **Google Sheets / Casual Pilot → Check connection**, then **Run demo test**. Confirm the demo row in the test tab, and repeat to test idempotent update. If the function reports a non-JSON Apps Script response, check the Apps Script Web App deployment permissions/version.

**Not yet enabled:** automatic live applicant syncing, live SCREENING writes, and removal of extra website questions. The website currently lacks Facebook Name, Birthdate, Clan Name and Version, and the original responses spreadsheet currently permits public link-viewer access despite birthdate data. Resolve both before enabling real applicant data.

# ASYLUM Casual → Google Sheets Pilot

**Status: staged only. Not a live automatic sync yet.** No changes to Referral, official `SCREENING` responses, or the master list.

## Verified destination
- Spreadsheet: https://docs.google.com/spreadsheets/d/17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU/edit
- Official direct/casual responses tab: `SCREENING`
- Isolated write target: `WEBSITE_CASUAL_TEST` (created and verified; sheetId `1254136764`)
- The existing `SCREENING!A1` timestamp header is unexpectedly `hahahahah3232_`; it was **not** changed. The new test tab's A1 is `Timestamp`.

## Columns (original form order)
| Column | Original Casual Form response | Data required from website |
|:--:|---|---|
| A | Timestamp | submission time |
| B | Facebook Name | `facebook_name` **missing in website** |
| C | Birthdate | `birthdate` **missing in website; sensitive** |
| D | Facebook Link | applicant Facebook URL |
| E | TikTok Link | applicant TikTok URL |
| F | IGN (In-Game Name) | IGN |
| G | UID | CODM UID (19 digits, text) |
| H | Streamer mode ID | Streamer Mode ID |
| I | Clan Name | `clan_name` **missing in website** |
| J | Discord Username | Discord username |
| K | Version | `version` **missing in website** |
| L | **Test-only column** | Application Code — safe dedup/update key |

The existing website asks extra items including Region, MP and BR Legendary Series, rank and level. **Do not remove these blindly**: existing Supabase constraints and screening approval checks require a coordinated migration, not invented replacement values. Get the exact Google Form choices for `Version` and any form-required fields before enabling submissions.

## Prepare the one-time Apps Script webhook

1. Open the linked spreadsheet as an editor → **Extensions → Apps Script**.
2. If this spreadsheet already has an operational Apps Script project, keep its existing code intact; use a separate Apps Script project to avoid replacing operational functions.
3. Copy `Code.gs` from this folder to the new script project.
4. In **Project Settings → Script properties**, set `ASY_CASUAL_SYNC_TOKEN` to a **unique, random 32+ character secret**. Keep it out of the frontend, repository, messages and screenshots.
5. **Deploy → New deployment → Web app**. Choose **Execute as: Me** and access **Anyone**, gated by the secret. A Google App Script web app accepts `doPost(e)`: https://developers.google.com/apps-script/guides/web.
6. Copy the `/exec` URL and store it, along with the token, as **server-side Supabase Edge Function secrets**. The script must not be invoked with a secret from public browser JavaScript.
7. After the secure server-side sender is configured, make one **synthetic** direct application test, verify the A:K field positions and L tracking code, then repeat with the **same tracking code** to confirm one row updates instead of duplicating.
8. Keep the Apps Script fixed on `WEBSITE_CASUAL_TEST` until reviewed and approved; do not switch to `SCREENING` before verifying downstream master-list handling and all required website fields.

### Webhook contract (server only)

```json
{
  "token": "SERVER_SIDE_SECRET_ONLY",
  "action": "casual_upsert",
  "application_type": "casual",
  "application_code": "ASYLUM-PILOT888",
  "submitted_at": "2026-11-04T00:00:00.000Z",
  "applicant": {
    "facebook_name": "PILOT DEMO",
    "birthdate": "2000-01-01",
    "facebook_url": "https://facebook.com/example",
    "tiktok_url": "https://tiktok.com/@example",
    "ign": "PILOT_TEST",
    "codm_uid": "1234567890123456789",
    "streamer_mode_id": "TEST",
    "clan_name": "NO CLAN",
    "discord_username": "pilot_test",
    "version": "PILOT"
  }
}
```

A successful write returns `{"ok":true,"mode":"test","action":"inserted"|"updated","row":N}`.
Apps Script often returns HTTP 200 even on a response with `ok:false`, so the sender must inspect `ok`. The webhook accepts only direct/casual applications.

## Privacy and operational safety

- Drive metadata currently shows the responses spreadsheet as **Anyone with the link → Viewer**; it contains birthdates and game identifiers. Management should restrict sharing to trusted staff before putting real applicant DOBs there from the website.
- **No real applicant data has been sent via this pilot.**
- Do not hardcode OAuth credentials, webhook secret, Google account tokens or birthdates into GitHub.
- Referral remains completely out of scope.
- This pilot script and test tab do **not** automatically connect the live website. Finish the backend sender and field mapping after the script deploy credentials are available.
