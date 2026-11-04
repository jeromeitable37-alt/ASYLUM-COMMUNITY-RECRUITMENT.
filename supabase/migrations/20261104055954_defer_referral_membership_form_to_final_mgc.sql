-- Referral Membership Form is received during Final MGC, after the
-- initial screenshot bundle is verified. Do not lower the final gate.
create or replace function private.defer_referral_membership_screenshot()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  if new.requirement_key = 'membership_form_screenshot'
     and exists (
       select 1 from public.asy_clan_applications a
       where a.id=new.application_id and a.application_type='referral'
     ) then
    new.is_required:=false;
  end if;
  return new;
end;
$fn$;

drop trigger if exists asy_defer_referral_membership_screenshot on public.asy_recruitment_evidence;
create trigger asy_defer_referral_membership_screenshot
before insert or update of is_required on public.asy_recruitment_evidence
for each row execute function private.defer_referral_membership_screenshot();

update public.asy_recruitment_evidence e
set is_required=false,updated_at=now()
from public.asy_clan_applications a
where a.id=e.application_id
and a.application_type='referral'
and e.requirement_key='membership_form_screenshot'
and e.is_required=true;

create or replace function private.require_referral_form_at_mgc()
returns trigger language plpgsql security definer set search_path=''
as $fn$
begin
  if old.workflow_step='final_review'
     and new.workflow_step='screening_gc_ready'
     and new.application_type='referral'
     and not exists (
       select 1 from public.asy_recruitment_evidence e
       where e.application_id=new.id
       and e.requirement_key='membership_form_screenshot'
       and e.status in ('pending','approved')
       and e.storage_path is not null
       and length(btrim(e.storage_path))>0
       and e.submitted_at is not null
     ) then
    raise exception 'Referral Membership Form screenshot is required before Screening GC.';
  end if;
  return new;
end;
$fn$;

drop trigger if exists asy_require_referral_form_at_mgc on public.asy_clan_applications;
create trigger asy_require_referral_form_at_mgc
before update of workflow_step on public.asy_clan_applications
for each row execute function private.require_referral_form_at_mgc();
