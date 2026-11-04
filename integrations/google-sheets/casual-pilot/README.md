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
