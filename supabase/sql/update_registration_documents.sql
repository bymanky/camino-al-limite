-- Requisitos de inscripción. Se activan desde Administración.
begin;
alter table public.trail_settings
  add column terms text not null default '',
  add column waiver text not null default '',
  add column requirements_enabled boolean not null default false,
  add column requirements_revision uuid not null default gen_random_uuid(),
  add column rules_pdf_id uuid;
create table trail_private.rules_pdfs (
  id uuid primary key default gen_random_uuid(),
  content bytea not null check (octet_length(content) between 1 and 5242880)
);
create table trail_private.health_documents (
  member_id uuid primary key references public.trail_members(id) on delete cascade,
  expires_on date not null,
  mime text not null check (mime in ('application/pdf','image/jpeg','image/png')),
  content bytea not null check (octet_length(content) between 1 and 1048576)
);
create table trail_private.registration_consents (
  team_id uuid primary key references public.trail_teams(id) on delete cascade,
  terms text not null,
  waiver text not null,
  rules_pdf_id uuid references trail_private.rules_pdfs(id)
);
alter table trail_private.rules_pdfs enable row level security;
alter table trail_private.health_documents enable row level security;
alter table trail_private.registration_consents enable row level security;
revoke all on trail_private.rules_pdfs, trail_private.health_documents,
  trail_private.registration_consents from public, anon, authenticated;
grant select, insert on trail_private.rules_pdfs, trail_private.health_documents,
  trail_private.registration_consents to service_role;

create function public.trail_public_rules_pdf(p_pdf uuid) returns text
language sql stable security invoker set search_path='' as $$
 select encode(f.content,'base64') from trail_private.rules_pdfs f
 join public.trail_settings s on s.rules_pdf_id=f.id where s.id=1 and f.id=p_pdf
$$;
create function public.trail_health_document(p_admin uuid,p_team uuid,p_member uuid,p_download boolean)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
begin
 if not public.trail_has_permission(p_admin,'manage') then raise exception 'Acceso denegado'; end if;
 return (select jsonb_build_object('expires_on',h.expires_on,'mime',h.mime,
    'data',case when p_download then encode(h.content,'base64') else null end)
  from trail_private.health_documents h join public.trail_members m on m.id=h.member_id
  join public.trail_teams t on t.id=m.team_id
  where m.id=p_member and t.id=p_team and m.deleted_at is null and t.deleted_at is null);
end $$;
revoke all on function public.trail_public_rules_pdf(uuid),
 public.trail_health_document(uuid,uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.trail_public_rules_pdf(uuid),
 public.trail_health_document(uuid,uuid,uuid,boolean) to service_role;

create or replace function public.trail_register(p jsonb,p_receipt_hash text,p_qr_hash text,p_request_hash text) returns uuid language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings; t uuid; prior trail_private.tokens; m jsonb; member_id uuid; health jsonb; i int=0;begin
 perform pg_advisory_xact_lock(hashtextextended(p->>'idempotency',0));
 select * into prior from trail_private.tokens where idempotency=(p->>'idempotency')::uuid;
 if found then
  if prior.request_hash<>p_request_hash or prior.receipt_hash<>p_receipt_hash then raise exception 'La solicitud ya fue utilizada'; end if;
  return prior.team_id;
 end if;
 select * into s from public.trail_settings where id=1 for share;
 if not s.open or (btrim(s.rules)='' and s.rules_pdf_id is null) or s.privacy='' then raise exception 'Las inscripciones están cerradas';end if;
 if s.deadline<>'' and (s.deadline||'-03:00')::timestamptz<now() then raise exception 'El plazo de inscripción finalizó';end if;
 if coalesce(jsonb_array_length(p->'members'),0)<>4 then raise exception 'Cantidad de integrantes inválida';end if;
 if p->>'accepted' is distinct from 'true' then raise exception 'Debés aceptar el reglamento';end if;
 if s.requirements_enabled then
  if p->>'accept_terms' is distinct from 'true' or p->>'accept_waiver' is distinct from 'true' then
   raise exception 'Aceptá los términos y el deslinde de responsabilidad';
  end if;
  if jsonb_typeof(p->'health') is distinct from 'array' or coalesce(jsonb_array_length(p->'health'),0)<>4 then
   raise exception 'Cargá un documento de salud por integrante';
  end if;
 end if;
 if (s.requirements_enabled or s.rules_pdf_id is not null) and
    p->>'requirements_revision' is distinct from s.requirements_revision::text then
  raise exception 'La información del evento cambió. Actualizá la página y volvé a revisar los documentos';
 end if;
 insert into public.trail_teams(code,team,responsible,phone,email,method,accepted_rules,accepted_privacy)
 values('CAL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p->>'team',p->>'responsible',p->>'phone',p->>'email',p->>'method',s.rules,s.privacy) returning id into t;
 for m in select * from jsonb_array_elements(p->'members') loop
  i=i+1;insert into public.trail_members(team_id,name,document,position) values(t,m->>'name',m->>'document',i) returning id into member_id;
  if s.requirements_enabled then
   health:=p->'health'->(i-1);
   if (health->>'expires_on')::date is null or (health->>'expires_on')::date < s.date::date then
    raise exception 'Cada documento de salud debe estar vigente el día de la carrera';
   end if;
   insert into trail_private.health_documents values
    (member_id,(health->>'expires_on')::date,health->>'mime',decode(health->>'data','base64'));
  end if;
 end loop;
 if s.requirements_enabled or s.rules_pdf_id is not null then
  insert into trail_private.registration_consents values
   (t,case when s.requirements_enabled then s.terms else '' end,
      case when s.requirements_enabled then s.waiver else '' end,s.rules_pdf_id);
 end if;
 insert into trail_private.tokens values(t,p_receipt_hash,p_qr_hash,(p->>'idempotency')::uuid,p_request_hash);
 return t;
end $$;

create or replace function public.trail_settings_update(p_admin uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings; pdf_id uuid; requirements boolean;begin
 if not public.trail_has_permission(p_admin,'manage') then raise exception 'Acceso denegado';end if;
 select * into s from public.trail_settings where id=1 for update;
 pdf_id:=s.rules_pdf_id;
 if p->>'remove_rules_pdf'='true' then pdf_id:=null; end if;
 if p->>'rules_pdf' is not null then
  insert into trail_private.rules_pdfs(content) values(decode(p->>'rules_pdf','base64')) returning id into pdf_id;
 end if;
 requirements:=coalesce((p->>'requirements_enabled')::boolean,s.requirements_enabled);
 if requirements and (coalesce(p->>'date','')='' or btrim(coalesce(p->>'terms',s.terms))='' or btrim(coalesce(p->>'waiver',s.waiver))='' or btrim(coalesce(p->>'privacy',''))='') then
  raise exception 'Publicá la fecha, los términos, el deslinde y el aviso de privacidad antes de activar los requisitos';
 end if;
 if (p->>'open')::boolean and ((btrim(coalesce(p->>'rules',''))='' and pdf_id is null) or coalesce(p->>'privacy','')='') then raise exception 'Publicá el reglamento y el aviso de privacidad antes de abrir';end if;
 update public.trail_settings set date=p->>'date',time=p->>'time',location=p->>'location',deadline=p->>'deadline',contact=p->>'contact',rules=p->>'rules',privacy=p->>'privacy',open=(p->>'open')::boolean,min_members=4, terms=coalesce(p->>'terms',s.terms), waiver=coalesce(p->>'waiver',s.waiver), rules_pdf_id=pdf_id, requirements_enabled=requirements, requirements_revision=gen_random_uuid() where id=1 returning * into s;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'configuracion',jsonb_build_object('abiertas',s.open));return to_jsonb(s);
end $$;
commit;
