-- Equipos de exactamente cuatro personas. Conserva las inscripciones existentes.
begin;
alter table public.trail_settings drop constraint if exists trail_settings_min_members_check;
alter table public.trail_settings alter column min_members set default 4;
update public.trail_settings set min_members=4 where id=1;
alter table public.trail_settings add constraint trail_settings_min_members_check check (min_members=4);

create or replace function public.trail_register(p jsonb,p_receipt_hash text,p_qr_hash text,p_request_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
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

create or replace function public.trail_settings_update(p_admin uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings;begin
 if not public.trail_is_admin(p_admin) then raise exception 'Acceso denegado';end if;
 if (p->>'open')::boolean and (coalesce(p->>'rules','')='' or coalesce(p->>'privacy','')='') then raise exception 'Publicá el reglamento y el aviso de privacidad antes de abrir';end if;
 update public.trail_settings set date=p->>'date',time=p->>'time',location=p->>'location',deadline=p->>'deadline',contact=p->>'contact',rules=p->>'rules',privacy=p->>'privacy',open=(p->>'open')::boolean,min_members=4 where id=1 returning * into s;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'configuracion',jsonb_build_object('abiertas',s.open));return to_jsonb(s);
end $$;
commit;
