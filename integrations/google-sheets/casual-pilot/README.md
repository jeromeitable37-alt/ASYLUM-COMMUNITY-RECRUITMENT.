# ASYLUM — Casual / Direct Membership Form → Google Sheets

**Deployment state (Nov 4, 2026):** Backend and website form are updated. **Live Sheets sync is intentionally OFF.** This protects the personal birthdates in the original SCREENING sheet while its sharing setting is still "Anyone with the link — Viewer" and while the currently deployed Apps Script may still be the older test-only version. Referral and Master List are untouched.

## What has been implemented
- Website Casual/Direct form matches actual applicant columns: Facebook Name, Birthdate (age 16+), Facebook Link, TikTok Link, IGN, CODM UID, Streamer ID, Clan Name (use NO CLAN), Discord username. Website contact email is required for private tracking, **not** added to the original form response columns.
- Removed unrelated Casual application questions for Region, rank, level, reason and separate MP/BR Legendary Series numerical totals. Eligibility confirmation still requires the minimum six Legendary Series and is reviewed by recruiters. Referral keeps its earlier form and separate MP/BR inputs.
- Supabase migration `20261104032103_casual_direct_form_alignment_private_sync_queue.sql` adds private fields, guards, and a locked queue table `asy_casual_sheet_sync` (RLS enabled; revoked from anon/authenticated). Site submits always save to Supabase first.
- Server function `asy-casual-sheet-pilot` deployed to Supabase, keeps existing staff-only demo test and adds `sync-submission` for Casual applicants using tracking code + email. Backend re-reads applicant details from Supabase. While `casual_sheet_live_enabled=false`, it **queues without transmitting any applicant data** to Google Sheets.
- Verified a transaction-rolled-back synthetic insert creates a sync queue entry without persisting a fake applicant; GitHub CI passes.

## Verified Google destination
Spreadsheet: https://docs.google.com/spreadsheets/d/17qdrn3qwCjJTG7Ud10EEsIfZiI9n18PJLSPdw5TIQjU/edit

Original response sheet `SCREENING` (untouched): columns A:K contain Timestamp, Facebook Name, Birthdate, Facebook Link, TikTok Link, IGN, UID, Streamer Mode ID, Clan Name, Discord Username, Version. **Version is staff-maintained**: live website submissions leave K blank.

Test sheet `WEBSITE_CASUAL_TEST`: original A:K plus column L as tracking code. The synthetic `ASYLUM-PILOT20261104` was inserted at row 2 and idempotently updated at row 2.

When live, `SCREENING` would get a column L "Website Application Code" as a dedup key; its original A:K order remains unchanged. The new Apps Script preserves staff-entered Version on updates.

## Required management-owned final actions (in order)
1. **Change Google Sheet sharing to Restricted**, while retaining authorized staff Editors/Viewers. Google Drive link access is currently open to anyone who knows the URL. The original automatic `asy-member-directory-sync` currently reads a public Google Sheets CSV view; **restricting sharing can disrupt that separate directory feature**. Before restricting, coordinate a secure authenticated alternative for the member directory or temporarily pause it. Do not enable live transfers of birthdates while this remains public.
2. In the **existing Apps Script project** you own, replace its Code.gs with `integrations/google-sheets/casual-pilot/Code.gs` in this repository. Save, then Deploy → Manage deployments → Edit → New version → Deploy. Re-authorize the script if asked (the new access check uses DriveApp). Keep the same Secret Property `ASY_CASUAL_SYNC_TOKEN`; never paste it into GitHub or browser JS. New Apps Script code defaults to `ASY_CASUAL_SYNC_TARGET=test`.
3. Verify `Run demo test` again from Recruiter Dashboard while Apps Script targets TEST; check that the `PILOTTEST` stays at row 2 with no duplicates.
4. Management should verify Master List formulas/scripts with Dam Boni. Inserting a row with Apps Script is **not** a native Google Form submission and does not fire Google Form's `onFormSubmit` event automatically. If Master List depends on this event, it needs a separate authorized integration.
5. Only after privacy, Apps Script deployment and Master List checks: Set Apps Script Script Property `ASY_CASUAL_SYNC_TARGET=live`, then have management set Supabase `public.asy_recruitment_settings.casual_sheet_live_enabled=true`. Backend runs a signed `casual_health` check before transferring any real applicant data and refuses to sync if Apps Script is not live or detects link-shared spreadsheet. Keep Referral untouched.
6. Send one **authorized synthetic test record** to confirm the new SCREENING mapping and tracking key before allowing real submissions, then use staff-only dashboard to audit and retry pending sync records.

## Important security and workflow notes
- Applicant DOB, UID and social links must not be exposed in browser credentials or public API messages; only the opaque application code and tracking email travel to the server sync endpoint. The backend fetches saved data privately.
- The staff-only demo action always refuses to write unless the deployed Apps Script confirms TEST mode. The server never sends a real DOB while `casual_sheet_live_enabled` is false.
- The Apps Script live path checks restricted sharing before writing and rejects demo tracking codes in SCREENING.
- The website still offers the original **Send Membership Form (Non-Referral)** button as a fallback. Remove it only after confirmed live sync and successful Master List integration to avoid breaking ongoing applications.
- Do not use staff-maintained Version values (OK/V2/V3) as applicant form questions or invent a value in an automated submission.
