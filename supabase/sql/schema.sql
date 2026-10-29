-- Ejecutar una sola vez en un proyecto NUEVO de Supabase.
create schema if not exists trail_private;
revoke all on schema trail_private from public, anon, authenticated;
grant usage on schema trail_private to service_role;

create table public.trail_settings (
 id int primary key default 1 check(id=1), date text not null default '', time text not null default '',
 location text not null default '', deadline text not null default '', contact text not null default '',
 rules text not null default '', privacy text not null default '', open boolean not null default false,
 min_members int not null default 4 check(min_members=4)
);
insert into public.trail_settings(id) values(1);
create table trail_private.admins(user_id uuid primary key references auth.users(id) on delete cascade, username text unique not null check(username=lower(username) and username ~ '^[a-z0-9_.-]{3,40}$'), active boolean not null default true);
create table public.trail_teams (
 id uuid primary key default gen_random_uuid(), code text not null unique,
 team text not null check(length(team) between 2 and 80), responsible text not null check(length(responsible) between 3 and 100),
 phone text not null check(length(phone) between 7 and 30), email text not null check(length(email) between 3 and 150),
 method text not null check(method in ('ecos','fomento','transferencia')), amount int not null default 1200 check(amount=1200),
 payment text not null default 'pendiente' check(payment in ('pendiente','en_revision','confirmado')),
 status text not null default 'activa' check(status in ('activa','cancelada')), notes text not null default '',
 deleted_at timestamptz, receipt_path text, created_at timestamptz not null default now(), accepted_at timestamptz not null default now(),
 accepted_rules text not null, accepted_privacy text not null
);
create table public.trail_members (
 id uuid primary key default gen_random_uuid(), team_id uuid not null references public.trail_teams(id) on delete cascade,
 name text not null check(length(name) between 3 and 100), document text not null check(length(document) between 5 and 30),
 deleted_at timestamptz, position int not null check(position between 1 and 4), present_at timestamptz, present_by uuid references auth.users(id),
 unique(team_id,position), unique(team_id,document)
);
create table trail_private.tokens(team_id uuid primary key references public.trail_teams(id) on delete cascade, receipt_hash text not null unique, qr_hash text not null unique, idempotency uuid unique not null, request_hash text not null);
create table public.trail_audit(id bigint generated always as identity primary key, admin_id uuid not null references auth.users(id), team_id uuid references public.trail_teams(id), action text not null, details jsonb not null default '{}', created_at timestamptz not null default now());
create table trail_private.rate_limits(key text primary key, hits int not null default 1, expires_at timestamptz not null);
create index trail_members_team_idx on public.trail_members(team_id);
create index trail_teams_status_payment_idx on public.trail_teams(status,payment);
create index trail_audit_team_idx on public.trail_audit(team_id,created_at);
create index trail_audit_admin_idx on public.trail_audit(admin_id);
create index trail_members_present_by_idx on public.trail_members(present_by);
alter table public.trail_settings enable row level security;
alter table public.trail_teams enable row level security;
alter table public.trail_members enable row level security;
alter table public.trail_audit enable row level security;
alter table trail_private.admins enable row level security;
alter table trail_private.tokens enable row level security;
alter table trail_private.rate_limits enable row level security;
-- Sin políticas públicas: toda operación pasa por Edge Function autorizada.
revoke all on public.trail_settings,public.trail_teams,public.trail_members,public.trail_audit from anon,authenticated;
grant all on public.trail_settings,public.trail_teams,public.trail_members,public.trail_audit to service_role;
grant all on all tables in schema trail_private to service_role;
grant usage,select on sequence public.trail_audit_id_seq to service_role;

create function public.trail_is_admin(p_id uuid) returns boolean language sql stable security invoker set search_path='' as $$select exists(select 1 from trail_private.admins where user_id=p_id and active)$$;
create function public.trail_admin_identity(p_username text) returns uuid language sql stable security invoker set search_path='' as $$select a.user_id from trail_private.admins a where a.username=p_username and a.active$$;
create function public.trail_rate(p_key text,p_limit int) returns boolean language plpgsql security invoker set search_path='' as $$
declare n int;begin
 insert into trail_private.rate_limits(key,hits,expires_at) values(p_key,1,now()+interval '15 minutes')
 on conflict(key) do update set hits=case when trail_private.rate_limits.expires_at<now() then 1 else trail_private.rate_limits.hits+1 end, expires_at=case when trail_private.rate_limits.expires_at<now() then now()+interval '15 minutes' else trail_private.rate_limits.expires_at end returning hits into n;
 return n<=p_limit;
end $$;
create function public.trail_team(p_id uuid) returns jsonb language sql stable security invoker set search_path='' as $$
 select (to_jsonb(t)-'accepted_rules'-'accepted_privacy') || jsonb_build_object('members',coalesce((select jsonb_agg(to_jsonb(m)-'team_id' order by position) from public.trail_members m where m.team_id=t.id and m.deleted_at is null),'[]'::jsonb),'removed_members',coalesce((select jsonb_agg(to_jsonb(m)-'team_id' order by position) from public.trail_members m where m.team_id=t.id and m.deleted_at is not null),'[]'::jsonb)) from public.trail_teams t where t.id=p_id
$$;
create function public.trail_register(p jsonb,p_receipt_hash text,p_qr_hash text,p_request_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings; t uuid; prior trail_private.tokens; m jsonb; i int=0;begin
 perform pg_advisory_xact_lock(hashtextextended(p->>'idempotency',0));
 select * into prior from trail_private.tokens where idempotency=(p->>'idempotency')::uuid;
 if found then
  if prior.request_hash<>p_request_hash or prior.receipt_hash<>p_receipt_hash then raise exception 'La solicitud ya fue utilizada'; end if;
  return prior.team_id;
 end if;
 select * into s from public.trail_settings where id=1 for share;
 if not s.open or s.rules='' or s.privacy='' then raise exception 'Las inscripciones están cerradas';end if;
 if s.deadline<>'' and (s.deadline||'-03:00')::timestamptz<now() then raise exception 'El plazo de inscripción finalizó';end if;
 if coalesce(jsonb_array_length(p->'members'),0)<>4 then raise exception 'Cantidad de integrantes inválida';end if;
 if p->>'accepted'<>'true' then raise exception 'Debés aceptar el reglamento';end if;
 insert into public.trail_teams(code,team,responsible,phone,email,method,accepted_rules,accepted_privacy)
 values('CAL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p->>'team',p->>'responsible',p->>'phone',p->>'email',p->>'method',s.rules,s.privacy) returning id into t;
 for m in select * from jsonb_array_elements(p->'members') loop
  i=i+1;insert into public.trail_members(team_id,name,document,position) values(t,m->>'name',m->>'document',i);
 end loop;
 insert into trail_private.tokens values(t,p_receipt_hash,p_qr_hash,(p->>'idempotency')::uuid,p_request_hash);
 return t;
end $$;
create function public.trail_receipt_id(p_hash text) returns uuid language sql stable security invoker set search_path='' as $$select k.team_id from trail_private.tokens k join public.trail_teams t on t.id=k.team_id where k.receipt_hash=p_hash and t.deleted_at is null$$;
create function public.trail_receipt_seed(p_id uuid) returns text language sql stable security invoker set search_path='' as $$select idempotency::text from trail_private.tokens where team_id=p_id$$;
create function public.trail_lookup(p_code text,p_hash text) returns uuid language sql stable security invoker set search_path='' as $$select t.id from public.trail_teams t join trail_private.tokens k on k.team_id=t.id where t.deleted_at is null and (t.code=upper(p_code) or k.qr_hash=p_hash) limit 1$$;
create function public.trail_admin_update(p_admin uuid,p_id uuid,p_patch jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
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
create function public.trail_attend(p_admin uuid,p_id uuid,p_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m record;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id and deleted_at is null and status='activa' for update;if not found then raise exception 'Inscripción inexistente o cancelada';end if;
 if cardinality(p_ids) not between 1 and 4 or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.trail_members where id=x and team_id=p_id and deleted_at is null)) then raise exception 'Integrantes inválidos';end if;
 for m in update public.trail_members set present_at=now(),present_by=p_admin where team_id=p_id and id=any(p_ids) and present_at is null returning id loop
  insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,'asistencia',jsonb_build_object('participante',m.id));
 end loop;
 return public.trail_team(p_id);
end $$;
create function public.trail_attach(p_id uuid,p_path text) returns void language sql security invoker set search_path='' as $$update public.trail_teams set receipt_path=p_path,payment=case when payment='pendiente' then 'en_revision' else payment end where id=p_id$$;
create function public.trail_settings_update(p_admin uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 if (p->>'open')::boolean and (coalesce(p->>'rules','')='' or coalesce(p->>'privacy','')='') then raise exception 'Publicá el reglamento y el aviso de privacidad antes de abrir';end if;
 update public.trail_settings set date=p->>'date',time=p->>'time',location=p->>'location',deadline=p->>'deadline',contact=p->>'contact',rules=p->>'rules',privacy=p->>'privacy',open=(p->>'open')::boolean,min_members=4 where id=1 returning * into s;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'configuracion',jsonb_build_object('abiertas',s.open));return to_jsonb(s);
end $$;
create function public.trail_admin_remove(p_admin uuid,p_id uuid,p_member uuid,p_restore boolean) returns jsonb language plpgsql security invoker set search_path='' as $$
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
-- Los RPC también están bloqueados para visitantes y usuarios comunes.
do $$declare f record;begin for f in select oid::regprocedure as signature from pg_proc where pronamespace='public'::regnamespace and proname like 'trail_%' loop execute format('revoke all on function %s from public, anon, authenticated',f.signature);execute format('grant execute on function %s to service_role',f.signature);end loop;end $$;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('trail-receipts','trail-receipts',false,5242880,array['application/pdf','image/jpeg','image/png']);
-- No hay políticas Storage para anon/authenticated. La Edge Function valida y sube los archivos.
