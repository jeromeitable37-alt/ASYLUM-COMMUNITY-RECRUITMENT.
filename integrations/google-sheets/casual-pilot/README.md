# ASYLUM — Casual / Direct Membership Form → Google Sheets

**Deployment state (Nov 4, 2026):** Backend and website form are updated. **Live Sheets sync is intentionally OFF.** This protects the personal birthdates in the original SCREENING sheet while its sharing setting is still "Anyone with the link — Viewer" and while the currently deployed Apps Script may still be the older test-only version. Referral and Master List are untouched.

## REFERRAL — automatic website-to-Google Sheets integration

The Referral workflow uses the same **private** Google spreadsheet but a separate, service-role-only sync queue and Edge Function. It does not change the working Direct SCREENING connector.

- New Referral applications collect the original Google Referral Form fields: Facebook Name, Birthdate, Facebook/TikTok links, IGN, 19-digit UID, Streamer Mode ID, Clan Name, Discord Username and the referring member's Facebook name and profile link. Referral MP/BR Legendary fields and private screenshot workflow remain intact.
- After a successful website save, the frontend invokes `asy-referral-sheet-sync` automatically. It retries temporary connection errors and rechecks on Track Application. No manual recruiter sync buttons are required.
- The backend requires Apps Script `referral_health` to confirm **LIVE + Restricted + referral-v1** before transmitting any real applicant data.
- The original `REFERRALS` tab columns **A:O** are preserved: A timestamp; B Facebook Name; C birthdate; D/E social links; F IGN; G UID; H Streamer ID; I Clan; J Discord; K note that screenshots are private in recruitment portal; L referrer FB name; M referrer FB link; N Version (staff-owned); O Notes (staff-owned). **P** is the unique Website Application Code used only for website-originated rows. Existing Google Form rows have no code in P and are not overwritten.
- Screenshots are **not** copied into Google Sheets, and no private Supabase Storage links or contact email are exposed in the spreadsheet.
- If a Referral Application is rejected, the database marks its private queue `remove_pending`. On the recruiter's next automatic reconciliation, the server asks Apps Script to delete only the `REFERRALS!P` exact tracking-code row. Original Google Form responses and rejected application history remain intact.
- Existing Referral applications that did not collect Facebook Name or Birthdate cannot be backfilled with invented values. Their queue entries stay `incomplete` until a recruiter corrects the same existing application using "Correct submitted applicant details." The database trigger then automatically retries syncing.
- If Apps Script has not been redeployed yet, the new site keeps Referral submissions in Supabase and its private pending queue. Direct sync remains operational.

### Google Apps Script update — required ONCE

The Google Apps Script web app is hosted in the owner's Google account and is **not** deployed by a GitHub/Vercel commit. The backend and frontend were deployed independently, but new Referral actions are not available at the Google endpoint until the existing deployment is updated.

1. Open the latest <https://github.com/jeromeitable37-alt/ASYLUM-COMMUNITY-RECRUITMENT./blob/main/integrations/google-sheets/casual-pilot/Code.gs>.
2. In the existing **ASYLUM Casual Sync Pilot** Google Apps Script project, replace the contents of `Code.gs` with that entire updated file and **Save**. Preserve all Script Properties and the token (do not share its value).
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. Reuse the existing deployment. It retains the same URL and Script Properties.
4. Do not change the `ASY_CASUAL_SYNC_TARGET=live` property or Google Sheet access: it must remain private (Restricted).
5. The website's first valid new Referral submission, or any authorized recruiter's next dashboard visit, will automatically sync eligible Referral rows to `REFERRALS`, set header `P1: Website Application Code`, and use that column for deduplication.
6. Verify via the `REFERRALS` tab. No extra manual sync buttons or separate Google Form submission needed for new website applicants. Existing legacy records missing original details need corrections first.

**Independent Master List caveat:** Writing directly to a Google Sheet through Apps Script does **not** invoke the Google Forms `onFormSubmit` event. Any separate Master List process dependent on that trigger must be evaluated separately. This integration does not edit Referral Google Forms, TEAMS or any other Supabase project.

## Automatic removal after Direct Application rejection

When an authorized recruiter rejects a **Direct/Casual** application (including a failed tryout that sets the application to `rejected`):

- A database trigger atomically changes its private sync queue status to `remove_pending`. Rejected application records and recruiter notes remain in Supabase for auditing and the reapplication process.
- The recruiter dashboard automatically calls `asy-casual-sheet-pilot` with `sync-rejections`. The server verifies staff authentication and the current rejected status.
- The authenticated Apps Script `casual_delete` action verifies `LIVE` mode and `Restricted` sharing. It only deletes an exact matching **website application code in `SCREENING!L`**; it never matches just an IGN or UID and never edits other tabs. It refuses duplicate-code ambiguities.
- If the Google row is already missing, the response is idempotent and the private queue becomes `removed`. If Google is offline or Code.gs is still the previous deployment, `remove_pending` stays queued and the dashboard silently retries on the next recruiter visit.
- Rejected Direct applicants cannot be re-synced through the public tracking endpoint. Race checks guard a simultaneous application submission and rejection. A new application after rejection gets its **own** unique tracking code.

**Deployment requirement:** This feature adds a new `casual_delete` handler to `Code.gs`. Because Apps Script is hosted in the Google account, copy the latest GitHub `Code.gs`, **Save → Deploy → Manage deployments → Edit → New version → Deploy** once to publish this handler. Keep the same deployment URL, Script Properties token and `LIVE` mode. The Supabase function and frontend were deployed independently. No recurring/manual cleanup button is needed afterward.

**Important:** Google Forms rows remain untouched and rejected applications are not deleted from Supabase. The independent Master List integration has not been verified; the new cleanup affects the `SCREENING` website row only.

## Production launch — exactly one Google Apps Script redeploy

The full Supabase backend and recruiter management interface are implemented and deployed. Google Apps Script is a separate Google-hosted project: the GitHub Code.gs file cannot update the live Google web-app deployment until the deploying Google account explicitly saves and redeploys it.

1. Open the exact maintained [Code.gs](./Code.gs) and copy **its entire current contents** into the existing "ASYLUM Casual Sync Pilot" Google Apps Script editor. Keep the existing project, **same deployment**, and existing `ASY_CASUAL_SYNC_TOKEN` Script Property. Do not publish the token.
2. Save. Select `authorizeSecureSync` in the function selector and Run. This only checks permissions and the SCREENING tab. Review Google's **new full Drive scope** request: it is necessary for the guarded Go Live action that restricts public Sheet sharing. Do not approve an unknown/untrusted script.
3. **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. This retains the established `/exec` URL.
4. Recruiter Dashboard → **Check connection**. The response must say **Secure directory bridge available**.
5. Sign in with an Owner/Management/Admin account and click **Go Live — make Sheet private**. Confirm. The server verifies the private bridge, asks Apps Script to revoke **anyone-with-link** permission while preserving named collaborators, verifies restricted Google access, enables `casual_sheet_live_enabled` in Supabase, and automatically backfills up to five eligible pending Direct applications. Use **Sync pending Direct applications** to retry any remaining rows.
6. Confirm via Google Drive **Share → General access: Restricted** (not just the backend response), and `SCREENING!L1` is the hidden key header `Website Application Code`; real website Direct applicants should appear with their A:K member fields populated. Staff-maintained Version is preserved; Referral and TEAMS tabs are untouched.
7. Finally test one genuine Direct application. Only one application is allowed per active UID/email. Do not create fabricated live applicant rows. TRACKING should say **Real Direct application synced to the private SCREENING Google Sheet**.

**Safety and external dependencies:** `asy-member-directory-sync` has a private `casual_directory` Apps Script bridge with a temporary public-CSV fallback, so the private switch no longer needs public Sheets access for that ASYLUM directory. Google Forms continue writing to the owner-maintained Sheet. But **writing rows through Apps Script does not fire the Google Forms `onFormSubmit` trigger**; any separately managed Master List powered by such a trigger will require its own separately verified synchronization. No Master List source file is linked or modified here. Do not represent Master List automation as tested.

**If Go Live fails:** The Supabase flag remains OFF unless private Google sharing and new Apps Script authorization both verify. The Spreadsheet owner may need to restrict sharing if the deploying account cannot manage permissions. Retry Go Live after permission is fixed; do not manually flip the Supabase flag first.

## Website submission → isolated Sheets test (now connected)

Every **new Direct/Casual application** is first saved to Supabase (unchanged workflow), then the website calls `asy-casual-sheet-pilot` with only its tracking reference and email for lookup. While the production flag remains OFF, the backend:

1. reads the saved application from Supabase;
2. derives a deterministic, non-identifying testing code using HMAC and the server-only sync token;
3. sends **synthetic demo fields** (`WEBTEST`, dummy UID, dummy birthdate, example URLs) to the already-deployed Apps Script in `test` mode;
4. upserts into `WEBSITE_CASUAL_TEST` with one row per unique website submission, deduplicated by the synthetic code in column L;
5. records `test_synced_at`, `test_sheet_row`, test attempts and test errors separately in the private `asy_casual_sheet_sync` table;
6. shows the result in the website's application tracking screen. Recruiters can also use **Check connection** to see the number of website-initiated pilot tests confirmed.

No real name, DOB, UID, email, contact links, or actual tracking code are ever placed on this link-shared Google Sheet while the production flag is OFF. **These are connectivity markers, not real enrollment responses.** Production queue status stays pending.

### Verify safely

- **Test Apps Script itself:** Recruiter Dashboard → Google Sheets / Casual Pilot → Run demo test. `PILOTTEST` should update row 2, not create duplicates.
- **Test a genuine Direct application:** Submit the real website Direct form with authorized, real applicant information, then visit its tracking page. A successful synthetic transfer shows `Google Sheets website pilot verified`. `WEBSITE_CASUAL_TEST` gets a **WEBTEST** marker row; private applicant details stay only in Supabase. Do **not** create fake live application records just to test; use only actual legitimate submissions. If there are none, staff can still use the Apps Script demo.
- **Test idempotency:** Reload/check the same application tracking again. No additional `WEBTEST` row should appear for that application, because the backend remembers the successful test.

The `WEBTEST` marker proves the cross-system request path, but **does not prove real applicant details have arrived in SCREENING**. The real `SCREENING` sync requires the privacy and management rollout steps below.

## What has been implemented
- Website Casual/Direct form matches actual applicant columns: Facebook Name, Birthdate (age 16+), Facebook Link, TikTok Link, IGN, CODM UID, Streamer ID, Clan Name (use NO CLAN), Discord username. Website contact email is required for private tracking, **not** added to the original form response columns.
- Removed unrelated Casual application questions for Region, rank, level, reason and separate MP/BR Legendary Series numerical totals. Eligibility confirmation still requires the minimum six Legendary Series and is reviewed by recruiters. Referral keeps its earlier form and separate MP/BR inputs.
- Supabase migration `20261104032103_casual_direct_form_alignment_private_sync_queue.sql` adds private fields, guards, and a locked queue table `asy_casual_sheet_sync` (RLS enabled; revoked from anon/authenticated). Site submits always save to Supabase first.
- Server function `asy-casual-sheet-pilot` deployed to Supabase, keeps the staff-only demo test and adds `sync-submission` for Casual applicants using tracking code + email. Backend re-reads applicant details from Supabase. While `casual_sheet_live_enabled=false`, it **writes only synthetic, non-identifying WEBTEST connectivity markers** to Google Sheets and keeps real applicant information private in Supabase.
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
