-- Block a second active ASY recruitment application even when a different
-- email is used for the same 19-digit CODM account. Preserve prior rejected
-- applications and already-existing duplicates for recruiter reconciliation.
-- Use a private SECURITY DEFINER trigger because public applicants cannot
-- SELECT other applicants under RLS.
create or replace function private.enforce_one_active_application_per_uid()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  normalized_uid text := pg_catalog.regexp_replace(coalesce(new.codm_uid,''),'[^0-9]','','g');
begin
  if new.status = 'rejected' then
    return new;
  end if;

  -- Existing active records may be in review or duplicated historically.
  -- Don't prevent staff from updating other details or changing review status.
  -- Re-activation from rejected, changed UIDs, and all new submissions are checked.
  if tg_op='UPDATE' then
    if old.status <> 'rejected'
       and pg_catalog.regexp_replace(coalesce(old.codm_uid,''),'[^0-9]','','g')=normalized_uid then
      return new;
    end if;
  end if;

  -- Legacy records may contain nonstandard identifiers. The existing
  -- workflow gate separately requires precisely 19 digits for new applicants.
  if pg_catalog.length(normalized_uid)<>19 then
    return new;
  end if;

  -- Serialize concurrent attempts involving the same CODM account.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('asy-codm-uid:'||normalized_uid,381421)
  );

  if exists(
    select 1 from public.asy_clan_applications a
    where a.id is distinct from new.id
      and a.status <> 'rejected'
      and pg_catalog.regexp_replace(coalesce(a.codm_uid,''),'[^0-9]','','g')=normalized_uid
  ) then
    raise exception 'An active application already exists for this CODM UID. Wait until that application is rejected before applying again.'
      using errcode='23505',
            constraint='asy_one_active_application_per_codm_uid';
  end if;
  return new;
end;
$function$;

revoke all on function private.enforce_one_active_application_per_uid() from public, anon, authenticated;

drop trigger if exists enforce_one_active_application_per_uid on public.asy_clan_applications;
create trigger enforce_one_active_application_per_uid
before insert or update of codm_uid, status on public.asy_clan_applications
for each row execute function private.enforce_one_active_application_per_uid();
