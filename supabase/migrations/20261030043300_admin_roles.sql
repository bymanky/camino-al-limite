begin;
alter table trail_private.admins add column if not exists role text not null default 'administrador' check(role in ('superadministrador','administrador','cobros','acreditacion','consulta'));
alter table trail_private.admins add column if not exists email text not null default '';
alter table trail_private.admins add column if not exists created_at timestamptz not null default now();
update trail_private.admins a set email=lower(u.email) from auth.users u where a.user_id=u.id and a.email='';
-- Únicamente la cuenta administradora del propietario recibe el rol inicial.
update trail_private.admins set role='superadministrador' where username='bymanky' and active;
create or replace function public.trail_has_permission(p_id uuid,p_permission text) returns boolean language sql stable security invoker set search_path='' as $$
 select exists(select 1 from trail_private.admins a where a.user_id=p_id and a.active and case p_permission
 when 'users' then a.role='superadministrador'
 when 'manage' then a.role in ('superadministrador','administrador')
 when 'read' then a.role in ('superadministrador','administrador','cobros','consulta')
 when 'lookup' then true
 when 'payments' then a.role in ('superadministrador','administrador','cobros')
 when 'attendance' then a.role in ('superadministrador','administrador','acreditacion')
 else false end)
$$;
create or replace function public.trail_staff_profile(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select jsonb_build_object('id',a.user_id,'username',a.username,'role',a.role,'permissions',(select coalesce(jsonb_agg(p),'[]'::jsonb) from unnest(array['users','manage','read','lookup','payments','attendance']) p where public.trail_has_permission(a.user_id,p))) from trail_private.admins a where a.user_id=p_id and a.active
$$;
create or replace function public.trail_staff_list(p_admin uuid) returns jsonb language plpgsql security invoker set search_path='' as $$
begin
 if not public.trail_has_permission(p_admin,'users') then raise exception 'Acceso denegado';end if;
 return (select coalesce(jsonb_agg(jsonb_build_object('id',user_id,'username',username,'email',email,'role',role,'active',active,'created_at',created_at) order by username),'[]'::jsonb) from trail_private.admins);
end $$;
create or replace function public.trail_staff_add(p_admin uuid,p_id uuid,p_username text,p_email text,p_role text) returns void language plpgsql security invoker set search_path='' as $$
begin
 perform pg_advisory_xact_lock(728496103);
 if not public.trail_has_permission(p_admin,'users') then raise exception 'Acceso denegado';end if;
 insert into trail_private.admins(user_id,username,email,role) values(p_id,p_username,lower(p_email),p_role);
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'usuario_creado',jsonb_build_object('usuario',p_id,'rol',p_role));
end $$;
create or replace function public.trail_staff_update(p_admin uuid,p_id uuid,p_role text,p_active boolean) returns void language plpgsql security invoker set search_path='' as $$
declare previous trail_private.admins;begin
 perform pg_advisory_xact_lock(728496103);
 if not public.trail_has_permission(p_admin,'users') then raise exception 'Acceso denegado';end if;
 if p_admin=p_id then raise exception 'No podés cambiar tu propio rol ni suspender tu acceso';end if;
 select * into previous from trail_private.admins where user_id=p_id for update;
 if not found then raise exception 'Usuario inexistente';end if;
 update trail_private.admins set role=p_role,active=p_active where user_id=p_id;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'usuario_actualizado',jsonb_build_object('usuario',p_id,'rol_anterior',previous.role,'rol',p_role,'activo',p_active));
end $$;
create or replace function public.trail_admin_update(p_admin uuid,p_id uuid,p_patch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m jsonb;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 if not public.trail_has_permission(p_admin,'manage') and (not public.trail_has_permission(p_admin,'payments') or not (p_patch ? 'payment') or exists(select 1 from jsonb_object_keys(p_patch) k where k<>'payment')) then raise exception 'Acceso denegado';end if;
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
 if not public.trail_has_permission(p_admin,'attendance') then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id and deleted_at is null and status='activa' for update;if not found then raise exception 'Inscripción inexistente o cancelada';end if;
 if cardinality(p_ids) not between 1 and 4 or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.trail_members where id=x and team_id=p_id and deleted_at is null)) then raise exception 'Integrantes inválidos';end if;
 for m in update public.trail_members set present_at=now(),present_by=p_admin where team_id=p_id and id=any(p_ids) and present_at is null returning id loop
  insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,'asistencia',jsonb_build_object('participante',m.id));
 end loop;
 return public.trail_team(p_id);
end $$;
create or replace function public.trail_settings_update(p_admin uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings;begin
 if not public.trail_has_permission(p_admin,'manage') then raise exception 'Acceso denegado';end if;
 if (p->>'open')::boolean and (coalesce(p->>'rules','')='' or coalesce(p->>'privacy','')='') then raise exception 'Publicá el reglamento y el aviso de privacidad antes de abrir';end if;
 update public.trail_settings set date=p->>'date',time=p->>'time',location=p->>'location',deadline=p->>'deadline',contact=p->>'contact',rules=p->>'rules',privacy=p->>'privacy',open=(p->>'open')::boolean,min_members=4 where id=1 returning * into s;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'configuracion',jsonb_build_object('abiertas',s.open));return to_jsonb(s);
end $$;
create or replace function public.trail_admin_remove(p_admin uuid,p_id uuid,p_member uuid,p_restore boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
declare changed int;begin
 if not public.trail_has_permission(p_admin,'manage') then raise exception 'Acceso denegado';end if;
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
do $$declare f record;begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'trail_%' loop execute format('revoke all on function %s from public, anon, authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
commit;
