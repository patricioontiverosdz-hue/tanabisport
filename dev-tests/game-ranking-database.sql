-- Prueba transaccional de staging: todas las marcas de comprobación se revierten.
begin;
do $$
declare
 v_user uuid; v_before integer; v_best integer; v_count integer; v_result jsonb;
begin
 select id into v_user from public.profiles where role in ('admin','foto','editora') order by id limit 1;
 if v_user is null then raise exception 'Se necesita una cuenta interna para comprobar el ranking.'; end if;
 select coalesce(max(score),0) into v_before from tsi_training.best_results where user_id=v_user and game='camera' and scene_id='daylight-action';
 set local role service_role;
 v_result:=public.tsi_game_save_result(v_user,'camera','daylight-action',40,false,'{}');
 if (v_result->>'best_score')::integer<>greatest(v_before,40) then raise exception 'La primera marca no se guardó.'; end if;
 v_result:=public.tsi_game_save_result(v_user,'camera','daylight-action',10,false,'{}');
 if (v_result->>'best_score')::integer<>greatest(v_before,40) then raise exception 'Un intento peor redujo la marca.'; end if;
 v_result:=public.tsi_game_save_result(v_user,'camera','daylight-action',90,true,'{}');
 if (v_result->>'best_score')::integer<>greatest(v_before,90) then raise exception 'No se conservó la mejora.'; end if;
 perform public.tsi_game_save_result(v_user,'camera','daylight-action',90,true,'{}');
 set local role postgres;
 select count(*),max(score) into v_count,v_best from tsi_training.best_results where user_id=v_user and game='camera' and scene_id='daylight-action';
 if v_count<>1 or v_best<>greatest(v_before,90) then raise exception 'El reintento duplicó o cambió el resultado.'; end if;
 perform set_config('request.jwt.claim.sub',v_user::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',v_user,'role','authenticated')::text,true);
 set local role authenticated;
 v_result:=public.tsi_game_rankings('camera');
 if not exists(select 1 from jsonb_array_elements(v_result->'entries') e where e->>'user_id'=v_user::text and (e->>'total_score')::integer>=v_best) then raise exception 'La clasificación no incluyó la marca.'; end if;
 if exists(select 1 from jsonb_array_elements(v_result->'entries') e where e ? 'email') then raise exception 'La clasificación expuso correos.'; end if;
 perform public.tsi_game_rankings('editing');perform public.tsi_game_rankings('all');
 begin perform public.tsi_game_rankings('invalid');raise exception 'Filtro inválido aceptado.';exception when invalid_parameter_value then null;end;
 begin perform public.tsi_game_save_result(v_user,'camera','daylight-action',100,true,'{}');raise exception 'Un participante pudo escribir puntos.';exception when insufficient_privilege then null;end;
 begin perform 1 from tsi_training.best_results;raise exception 'Un participante accedió a resultados privados.';exception when insufficient_privilege then null;end;
 perform set_config('request.jwt.claim.sub','',true);perform set_config('request.jwt.claims','{}',true);
 begin perform public.tsi_game_rankings('all');raise exception 'Se aceptó una identidad vacía.';exception when insufficient_privilege then null;end;
 set local role anon;
 begin perform public.tsi_game_rankings('all');raise exception 'El podio admitió acceso anónimo.';exception when insufficient_privilege then null;end;
 set local role postgres;
end;
$$;
rollback;
select 'Mejores marcas, reintentos, filtros, identidad, privilegios y reversión aprobados.' as verification;
