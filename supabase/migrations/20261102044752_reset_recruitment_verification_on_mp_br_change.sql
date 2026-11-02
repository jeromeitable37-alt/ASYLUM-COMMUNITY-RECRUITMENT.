-- Editing an MP/BR breakdown must invalidate old verification approvals,
-- just like changing other applicant-provided eligibility details.
create or replace function private.reset_application_details_verification()
returns trigger language plpgsql set search_path to ''
as $function$
begin
  if row(
    new.ign, new.codm_uid, new.contact_email, new.discord_username,
    new.applicant_facebook_url, new.applicant_tiktok_url, new.streamer_mode_id,
    new.region, new.level, new.rank, new.main_role, new.preferred_mode,
    new.availability, new.clan_experience, new.reason, new.referrer_name,
    new.referrer_facebook_url, new.age_range, new.meets_age_requirement,
    new.legendary_series_count, new.legendary_series_mp, new.legendary_series_br,
    new.facebook_name_appropriate,
    new.willing_to_add_asy_tag, new.willing_to_submit_roster_photo
  ) is distinct from row(
    old.ign, old.codm_uid, old.contact_email, old.discord_username,
    old.applicant_facebook_url, old.applicant_tiktok_url, old.streamer_mode_id,
    old.region, old.level, old.rank, old.main_role, old.preferred_mode,
    old.availability, old.clan_experience, old.reason, old.referrer_name,
    old.referrer_facebook_url, old.age_range, old.meets_age_requirement,
    old.legendary_series_count, old.legendary_series_mp, old.legendary_series_br,
    old.facebook_name_appropriate,
    old.willing_to_add_asy_tag, old.willing_to_submit_roster_photo
  ) then
    new.application_details_verified := false;
    new.application_details_verified_by_email := null;
    new.application_details_verified_at := null;
    new.membership_form_response_verified := false;
    new.membership_form_response_verified_by_email := null;
    new.membership_form_response_verified_at := null;
    new.mgc_verification_status := 'not_checked';
    new.mgc_applicant_contacted := false;
    new.mgc_checked_by_email := null;
    new.mgc_checked_at := null;
    new.mgc_verification_notes := null;
  end if;
  return new;
end;
$function$;