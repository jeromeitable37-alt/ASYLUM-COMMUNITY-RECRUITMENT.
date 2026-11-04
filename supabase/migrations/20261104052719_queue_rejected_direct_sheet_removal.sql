-- Extend the private sync queue to track rejection-driven removal.
alter table public.asy_casual_sheet_sync
  drop constraint if exists asy_casual_sheet_sync_status_check;
alter table public.asy_casual_sheet_sync
  add constraint asy_casual_sheet_sync_status_check
  check (status in ('pending','synced','failed','remove_pending','removed'));

create or replace function private.queue_casual_sheet_removal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $body$
begin
  if new.application_type = 'casual'
     and new.status = 'rejected'
     and old.status is distinct from 'rejected' then
    insert into public.asy_casual_sheet_sync
      (application_id, status, updated_at, last_error)
    values (new.id, 'remove_pending', now(), null)
    on conflict (application_id)
    do update set status = 'remove_pending',
                  updated_at = now(),
                  last_error = null;
  end if;
  return new;
end;
$body$;

drop trigger if exists asy_queue_casual_sheet_removal on public.asy_clan_applications;
create trigger asy_queue_casual_sheet_removal
after update of status on public.asy_clan_applications
for each row execute function private.queue_casual_sheet_removal();

update public.asy_casual_sheet_sync as q
set status = 'remove_pending', updated_at = now(), last_error = null
from public.asy_clan_applications as app
where q.application_id = app.id
  and app.application_type = 'casual'
  and app.status = 'rejected'
  and q.status in ('synced','pending','failed');
