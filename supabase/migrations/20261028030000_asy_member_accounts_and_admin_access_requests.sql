-- ASY member accounts and owner-approved staff access requests.
-- Existing recruitment applications and tracking codes are intentionally untouched.
create table if not exists public.asy_member_accounts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  ign text not null default '',
  codm_uid text not null default '',
  discord_username text not null default '',
  photo_url text not null default '',
  approval_status text not null default 'pending'
    check (approval_status in ('pending','approved','rejected')),
  review_note text,
  linked_application_id uuid references public.asy_clan_applications(id) on delete set null,
  linked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists asy_member_accounts_status_created_idx
  on public.asy_member_accounts (approval_status, created_at desc);
create index if not exists asy_member_accounts_linked_application_idx
  on public.asy_member_accounts (linked_application_id);

create table if not exists public.asy_admin_access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  display_name text not null,
  reason text not null default '',
  status text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_by_email text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id)
);
create index if not exists asy_admin_access_requests_status_created_idx
  on public.asy_admin_access_requests (status, created_at desc);

alter table public.asy_member_accounts enable row level security;
alter table public.asy_admin_access_requests enable row level security;

revoke all on table public.asy_member_accounts from anon, authenticated;
grant select on table public.asy_member_accounts to authenticated;
grant update (display_name, ign, codm_uid, discord_username, photo_url, updated_at)
  on public.asy_member_accounts to authenticated;
revoke all on table public.asy_admin_access_requests from anon, authenticated;

drop policy if exists "Members read own ASY account" on public.asy_member_accounts;
create policy "Members read own ASY account"
  on public.asy_member_accounts for select to authenticated
  using ((select auth.uid()) = user_id);
drop policy if exists "Members update own ASY profile fields" on public.asy_member_accounts;
create policy "Members update own ASY profile fields"
  on public.asy_member_accounts for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create or replace function public.create_asy_member_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.asy_member_accounts (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', ''))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_asy_member_account on auth.users;
create trigger on_auth_user_created_asy_member_account
  after insert on auth.users
  for each row execute function public.create_asy_member_account();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('asy-member-avatars', 'asy-member-avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
set public = true, file_size_limit = 5242880,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

drop policy if exists "Members upload own ASY avatar" on storage.objects;
create policy "Members upload own ASY avatar"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'asy-member-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Members update own ASY avatar" on storage.objects;
create policy "Members update own ASY avatar"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'asy-member-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'asy-member-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
drop policy if exists "Members delete own ASY avatar" on storage.objects;
create policy "Members delete own ASY avatar"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'asy-member-avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
