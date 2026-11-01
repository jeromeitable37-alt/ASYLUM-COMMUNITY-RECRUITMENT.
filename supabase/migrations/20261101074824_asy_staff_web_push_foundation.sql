-- ASYLUM recruitment: encrypted Web Push VAPID credentials are provisioned separately.
-- Applied to production in Supabase as migration 20261101074824.
-- Never commit actual VAPID private keys or dispatch tokens.
create extension if not exists pg_net;
create extension if not exists pg_cron;

create table if not exists public.asy_webpush_config (
  id boolean primary key default true check (id),
  vapid_public_key text not null,
  vapid_private_key text not null,
  dispatch_token text not null default encode(gen_random_bytes(32),'hex'),
  created_at timestamptz not null default now()
);
alter table public.asy_webpush_config enable row level security;
revoke all on public.asy_webpush_config from anon,authenticated;
grant all on public.asy_webpush_config to service_role;

create table if not exists public.asy_webpush_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asy_webpush_subscriptions_user_idx on public.asy_webpush_subscriptions(user_id);
alter table public.asy_webpush_subscriptions enable row level security;
revoke all on public.asy_webpush_subscriptions from anon,authenticated;
grant all on public.asy_webpush_subscriptions to service_role;

create table if not exists public.asy_webpush_deliveries (
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.asy_recruitment_notifications(id) on delete cascade,
  subscription_id uuid not null references public.asy_webpush_subscriptions(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending','processing','sent','failed')),
  attempts integer not null default 0,
  available_at timestamptz not null default now(),
  claimed_at timestamptz,
  sent_at timestamptz,
  error_message text,
  created_at timestamptz not null default now(),
  unique(notification_id,subscription_id)
);
create index if not exists asy_webpush_queue_idx on public.asy_webpush_deliveries(state,available_at);
alter table public.asy_webpush_deliveries enable row level security;
revoke all on public.asy_webpush_deliveries from anon,authenticated;
grant all on public.asy_webpush_deliveries to service_role;

create or replace function public.asy_webpush_enqueue() returns trigger
language plpgsql security definer set search_path=public, pg_temp
as $function$
declare inserted_count integer;
begin
  if new.recipient_role <> 'recruiter'
      or new.notification_type not in ('application_created','application_message','evidence_submitted')
  then return new; end if;
  insert into public.asy_webpush_deliveries(notification_id,subscription_id)
  select new.id,s.id from public.asy_webpush_subscriptions s
  join auth.users u on u.id=s.user_id
  join public.asy_recruitment_admins a on lower(a.email)=lower(u.email)
  where s.enabled=true
  on conflict (notification_id,subscription_id) do nothing;
  get diagnostics inserted_count = row_count;
  if inserted_count > 0 and exists(select 1 from public.asy_webpush_config) then
    begin
      perform net.http_post(
        url := 'https://tyhszzztltamrohhyykh.supabase.co/functions/v1/asy-web-push',
        headers := jsonb_build_object('Content-Type','application/json','x-asy-push-secret',
            (select dispatch_token from public.asy_webpush_config where id=true)),
        body := '{"action":"dispatch"}'::jsonb,
        timeout_milliseconds := 7000
      );
    exception when others then
      raise notice 'Webpush wakeup deferred to cron: %',SQLERRM;
    end;
  end if;
  return new;
end;
$function$;
revoke all on function public.asy_webpush_enqueue() from public,anon,authenticated;
drop trigger if exists asy_webpush_after_notification_insert on public.asy_recruitment_notifications;
create trigger asy_webpush_after_notification_insert after insert
on public.asy_recruitment_notifications for each row
execute function public.asy_webpush_enqueue();
