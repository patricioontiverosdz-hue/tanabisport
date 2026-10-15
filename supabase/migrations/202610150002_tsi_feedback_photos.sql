-- TSI: Fotos de comentarios, hasta 3 por partido, almacenamiento privado
create table if not exists public.feedback_photos (
 id uuid primary key default gen_random_uuid(),
 match_id text not null references public.matches(id) on delete cascade,
 feedback_id text not null references public.feedback(id) on delete cascade,
 slot smallint not null check (slot between 1 and 3),
 author_id uuid not null references auth.users(id),
 storage_path text generated always as (match_id||'/'||id::text||'.jpg') stored,
 created_at timestamptz not null default now(),
 unique(match_id,slot), unique(storage_path)
);
create index if not exists feedback_photos_comment_idx on public.feedback_photos(feedback_id);
alter table public.feedback_photos enable row level security;
grant select,insert,delete on public.feedback_photos to authenticated;
create policy fb_photo_select on public.feedback_photos for select to authenticated using (
 public.my_role() in ('admin','editora') or exists (
  select 1 from public.matches m where m.id=match_id and
  ((m.data->>'f1')=(select auth.uid())::text or (m.data->>'f2')=(select auth.uid())::text)));
create policy fb_photo_insert on public.feedback_photos for insert to authenticated with check (
 public.my_role() in ('admin','editora') and author_id=(select auth.uid()) and
 exists(select 1 from public.feedback f where f.id=feedback_id and f.data->>'mid'=match_id
 and f.data->>'by'=(select auth.uid())::text));
create policy fb_photo_delete on public.feedback_photos for delete to authenticated using (
 public.my_role()='admin' or (public.my_role()='editora' and author_id=(select auth.uid())));
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('tsi-feedback','tsi-feedback',false,5242880,array['image/jpeg'])
 on conflict(id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg'];
create policy tsi_fb_storage_select on storage.objects for select to authenticated
 using (bucket_id='tsi-feedback' and exists(select 1 from public.feedback_photos p where p.storage_path=name));
create policy tsi_fb_storage_insert on storage.objects for insert to authenticated
 with check(bucket_id='tsi-feedback' and exists(select 1 from public.feedback_photos p
 where p.storage_path=name and p.author_id=(select auth.uid())));
create policy tsi_fb_storage_delete on storage.objects for delete to authenticated
 using(bucket_id='tsi-feedback' and exists(select 1 from public.feedback_photos p
 where p.storage_path=name and (public.my_role()='admin' or
 (public.my_role()='editora' and p.author_id=(select auth.uid())))));
