begin;
alter table public.trail_teams add column if not exists deleted_at timestamptz;
alter table public.trail_members add column if not exists deleted_at timestamptz;
create or replace function public.trail_team(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select (to_jsonb(t)-'accepted_rules'-'accepted_privacy') || jsonb_build_object('members',coalesce((select jsonb_agg(to_jsonb(m)-'team_id' order by position) from public.trail_members m where m.team_id=t.id and m.deleted_at is null),'[]'::jsonb),'removed_members',coalesce((select jsonb_agg(to_jsonb(m)-'team_id' order by position) from public.trail_members m where m.team_id=t.id and m.deleted_at is not null),'[]'::jsonb)) from public.trail_teams t where t.id=p_id
$$;
create or replace function public.trail_receipt_id(p_hash text) returns uuid language sql stable security invoker set search_path='' as $$select k.team_id from trail_private.tokens k join public.trail_teams t on t.id=k.team_id where k.receipt_hash=p_hash and t.deleted_at is null$$;
create or replace function public.trail_lookup(p_code text,p_hash text) returns uuid language sql stable security invoker set search_path='' as $$select t.id from public.trail_teams t join trail_private.tokens k on k.team_id=t.id where t.deleted_at is null and (t.code=upper(p_code) or k.qr_hash=p_hash) limit 1$$;
create or replace function public.trail_admin_update(p_admin uuid,p_id uuid,p_patch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id and deleted_at is null for update;if not found then raise exception 'Inscripción inexistente';end if;
 update public.trail_teams set team=coalesce(p_patch->>'team',team),responsible=coalesce(p_patch->>'responsible',responsible),phone=coalesce(p_patch->>'phone',phone),email=coalesce(p_patch->>'email',email),notes=coalesce(p_patch->>'notes',notes),payment=coalesce(p_patch->>'payment',payment),status=coalesce(p_patch->>'status',status) where id=p_id;
 if p_patch ? 'members' then
  if jsonb_array_length(p_patch->'members')<>(select count(*) from public.trail_members where team_id=p_id and deleted_at is null) or (select count(distinct x->>'id') from jsonb_array_elements(p_patch->'members') x)<>jsonb_array_length(p_patch->'members') then raise exception 'La lista de integrantes cambió. Actualizá la inscripción';end if;
  for m in select * from jsonb_array_elements(p_patch->'members') loop
   update public.trail_members set name=m->>'name',document=m->>'document' where id=(m->>'id')::uuid and team_id=p_id and deleted_at is null;
   if not found then raise exception 'Integrante inválido';end if;
  end loop;
 end if;
 insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,'correccion',jsonb_build_object('campos',(select jsonb_agg(k) from jsonb_object_keys(p_patch) k),'pago',p_patch->>'payment','estado',p_patch->>'status'));
 return public.trail_team(p_id);
end $$;
create or replace function public.trail_attend(p_admin uuid,p_id uuid,p_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m record;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id and deleted_at is null and status='activa' for update;if not found then raise exception 'Inscripción inexistente o cancelada';end if;
 if cardinality(p_ids) not between 1 and 4 or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.trail_members where id=x and team_id=p_id and deleted_at is null)) then raise exception 'Integrantes inválidos';end if;
 for m in update public.trail_members set present_at=now(),present_by=p_admin where team_id=p_id and id=any(p_ids) and present_at is null returning id loop
  insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,'asistencia',jsonb_build_object('participante',m.id));
 end loop;
 return public.trail_team(p_id);
end $$;
create or replace function public.trail_admin_remove(p_admin uuid,p_id uuid,p_member uuid,p_restore boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare changed int;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id for update;
 if not found then raise exception 'Inscripción inexistente';end if;
 if p_member is null then
  update public.trail_teams set deleted_at=case when p_restore then null else now() end where id=p_id and (deleted_at is not null)=p_restore;
 else
  if exists(select 1 from public.trail_teams where id=p_id and deleted_at is not null) then raise exception 'Restaurá primero el equipo';end if;
  update public.trail_members set deleted_at=case when p_restore then null else now() end where id=p_member and team_id=p_id and (deleted_at is not null)=p_restore;
 end if;
 get diagnostics changed=row_count;
 if changed=0 then raise exception 'El registro cambió. Actualizá la inscripción';end if;
 insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,case when p_restore then 'restauracion' else 'papelera' end,jsonb_build_object('participante',p_member));
 return public.trail_team(p_id);
end $$;
revoke all on function public.trail_admin_remove(uuid,uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.trail_admin_remove(uuid,uuid,uuid,boolean) to service_role;
commit;
