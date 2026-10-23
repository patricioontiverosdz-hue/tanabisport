-- TSI 2.2.0: aplicar exclusivamente en staging nksqpoigywfegcbvfhoa.
-- No contiene datos de participantes. Los resultados solo los escribe la función Edge.
create schema if not exists tsi_training;
revoke all on schema tsi_training from public, anon, authenticated;
grant usage on schema tsi_training to authenticated, service_role;

create table tsi_training.challenges (
  game text not null check (game in ('camera','editing')),
  scene_id text not null check (length(scene_id) between 1 and 80),
  primary key (game,scene_id)
);
alter table tsi_training.challenges enable row level security;
revoke all on tsi_training.challenges from public, anon, authenticated;
grant select on tsi_training.challenges to service_role;
insert into tsi_training.challenges(game,scene_id) values
('camera','daylight-action'),('camera','night-action'),('camera','team-portrait'),('camera','golden-hour-portrait'),
('camera','aerial-catch'),('camera','goalkeeper-save'),('camera','rainy-action'),('camera','indoor-basketball'),
('camera','daylight-context'),('camera','night-context'),('camera','team-detail'),('camera','golden-hour-detail'),
('camera','track-finish'),('camera','tennis-serve'),('camera','volleyball-block'),('camera','cycling-sprint'),
('camera','swimming-race'),('camera','baseball-swing'),('camera','soccer-celebration'),('camera','sideline-portrait'),
('editing','night-detail'),('editing','warm-cast'),('editing','bright-detail'),('editing','backlight'),
('editing','natural-colors'),('editing','rain-balance'),('editing','vertical-action'),('editing','flat-action'),
('editing','detail-track'),('editing','natural-tennis'),('editing','indoor-volleyball'),('editing','sunlit-cycling'),
('editing','pool-color'),('editing','late-baseball'),('editing','night-celebration'),('editing','shade-portrait');

create table tsi_training.best_results (
  user_id uuid not null references public.profiles(id) on delete cascade,
  game text not null,
  scene_id text not null,
  score integer not null check (score between 0 and 100),
  passed boolean not null,
  settings jsonb not null check (jsonb_typeof(settings)='object' and octet_length(settings::text)<=2048),
  created_at timestamptz not null default now(),
  improved_at timestamptz not null default now(),
  primary key (user_id,game,scene_id),
  foreign key (game,scene_id) references tsi_training.challenges(game,scene_id)
);
create index best_results_game_scene_idx on tsi_training.best_results(game,scene_id);
alter table tsi_training.best_results enable row level security;
revoke all on tsi_training.best_results from public, anon, authenticated;
grant select,insert,update on tsi_training.best_results to service_role;

create function public.tsi_game_save_result(p_user_id uuid,p_game text,p_scene_id text,p_score integer,p_passed boolean,p_settings jsonb)
returns jsonb language plpgsql security invoker set search_path=''
as $$
declare v_best integer;
begin
  if current_user<>'service_role' then raise insufficient_privilege using message='Guardado reservado al servidor.'; end if;
  if not exists(select 1 from public.profiles where id=p_user_id and role in ('admin','foto','editora')) then
    raise insufficient_privilege using message='Participante no habilitado.';
  end if;
  insert into tsi_training.best_results as saved(user_id,game,scene_id,score,passed,settings)
  values(p_user_id,p_game,p_scene_id,p_score,p_passed,p_settings)
  on conflict(user_id,game,scene_id) do update
    set score=excluded.score,passed=excluded.passed,settings=excluded.settings,improved_at=now()
    where excluded.score>saved.score;
  select score into v_best from tsi_training.best_results where user_id=p_user_id and game=p_game and scene_id=p_scene_id;
  return jsonb_build_object('best_score',v_best);
end;
$$;
revoke all on function public.tsi_game_save_result(uuid,text,text,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.tsi_game_save_result(uuid,text,text,integer,boolean,jsonb) to service_role;

-- El agregado necesita cruzar participantes, por eso la función privilegiada
-- vive en un esquema no expuesto y comprueba identidad y rol antes de consultar.
create function tsi_training.rankings(p_game text)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_rows jsonb;
begin
  if auth.uid() is null or not exists(select 1 from public.profiles where id=auth.uid() and role in ('admin','foto','editora')) then
    raise insufficient_privilege using message='Acceso exclusivo del equipo.';
  end if;
  if p_game is null or p_game not in ('all','camera','editing') then raise invalid_parameter_value using message='Clasificación inválida.'; end if;
  with totals as (
    select r.user_id,sum(r.score)::integer as total_score,count(*)::integer as challenges
    from tsi_training.best_results r join public.profiles p on p.id=r.user_id and p.role in ('admin','foto','editora')
    where p_game='all' or r.game=p_game group by r.user_id
  ), placed as (
    select t.*,rank() over(order by t.total_score desc) as rank,
      left(coalesce(nullif(btrim(p.name),''),'Participante'),80) as name
    from totals t join public.profiles p on p.id=t.user_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('user_id',user_id,'name',name,'rank',rank,'total_score',total_score,'challenges',challenges)
    order by total_score desc,user_id),'[]'::jsonb) into v_rows from placed;
  return jsonb_build_object('entries',v_rows,'server_now',now());
end;
$$;
revoke all on function tsi_training.rankings(text) from public,anon,authenticated;
grant execute on function tsi_training.rankings(text) to authenticated;

create function public.tsi_game_rankings(p_game text default 'all')
returns jsonb language sql stable security invoker set search_path=''
as $$ select tsi_training.rankings(p_game); $$;
revoke all on function public.tsi_game_rankings(text) from public,anon,authenticated;
grant execute on function public.tsi_game_rankings(text) to authenticated;

comment on schema tsi_training is 'Entrenamiento interno TSI 2.2.0, solo staging; sin acceso directo de participantes.';
