begin;
alter table public.trail_settings drop constraint trail_settings_min_members_check;
alter table public.trail_settings add constraint trail_settings_min_members_check check(min_members between 2 and 6);
alter table public.trail_settings alter column min_members set default 2;
update public.trail_settings set min_members=2, requirements_revision=gen_random_uuid() where id=1;
alter table public.trail_members drop constraint trail_members_position_check;
alter table public.trail_members add constraint trail_members_position_check check(position between 1 and 6);
alter table public.trail_teams drop constraint trail_teams_amount_check;
alter table public.trail_teams add constraint trail_teams_amount_check check(amount in (700,1050,1200,1400,1750,2100));
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
 if coalesce(jsonb_array_length(p->'members'),0) not between 2 and 6 then raise exception 'Cantidad de integrantes inválida';end if;
 if p->>'accepted' is distinct from 'true' then raise exception 'Debés aceptar el reglamento';end if;
 if s.requirements_enabled then
  if p->>'accept_terms' is distinct from 'true' or p->>'accept_waiver' is distinct from 'true' then
   raise exception 'Aceptá los términos y el deslinde de responsabilidad';
  end if;
  if jsonb_typeof(p->'health') is distinct from 'array' or coalesce(jsonb_array_length(p->'health'),0)<>jsonb_array_length(p->'members') then
   raise exception 'Cargá un documento de salud por integrante';
  end if;
 end if;
 if (s.requirements_enabled or s.rules_pdf_id is not null) and
    p->>'requirements_revision' is distinct from s.requirements_revision::text then
  raise exception 'La información del evento cambió. Actualizá la página y volvé a revisar los documentos';
 end if;
 insert into public.trail_teams(code,team,responsible,phone,email,method,amount,accepted_rules,accepted_privacy)
 values('CAL-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,16)),p->>'team',p->>'responsible',p->>'phone',p->>'email',p->>'method',350*jsonb_array_length(p->'members'),s.rules,s.privacy) returning id into t;
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
  insert into trail_private.registration_consents (team_id,terms,waiver,rules_pdf_id,waiver_file_id) values
   (t,case when s.requirements_enabled then s.terms else '' end,
      case when s.requirements_enabled then s.waiver else '' end,s.rules_pdf_id,case when s.requirements_enabled then s.waiver_file_id else null end);
 end if;
 insert into trail_private.tokens values(t,p_receipt_hash,p_qr_hash,(p->>'idempotency')::uuid,p_request_hash);
 return t;
end $$;

create or replace function public.trail_settings_update(p_admin uuid,p jsonb) returns jsonb language plpgsql security invoker set search_path='' as $$
declare s public.trail_settings; pdf_id uuid; waiver_id uuid; requirements boolean;begin
 if not public.trail_has_permission(p_admin,'manage') then raise exception 'Acceso denegado';end if;
 select * into s from public.trail_settings where id=1 for update;
 pdf_id:=s.rules_pdf_id;
 if p->>'remove_rules_pdf'='true' then pdf_id:=null; end if;
 if p->>'rules_pdf' is not null then
  insert into trail_private.rules_pdfs(content) values(decode(p->>'rules_pdf','base64')) returning id into pdf_id;
 end if;
 waiver_id:=s.waiver_file_id;
 if p->>'remove_waiver_file'='true' then waiver_id:=null; end if;
 if p->'waiver_file' is not null then
  insert into trail_private.waiver_files(mime,content)
  values(p->'waiver_file'->>'mime',decode(p->'waiver_file'->>'data','base64'))
  returning id into waiver_id;
 end if;
 requirements:=coalesce((p->>'requirements_enabled')::boolean,s.requirements_enabled);
 if requirements and (coalesce(p->>'date','')='' or btrim(coalesce(p->>'terms',s.terms))='' or (btrim(coalesce(p->>'waiver',s.waiver))='' and waiver_id is null) or btrim(coalesce(p->>'privacy',''))='') then
  raise exception 'Publicá la fecha, los términos, el deslinde y el aviso de privacidad antes de activar los requisitos';
 end if;
 if (p->>'open')::boolean and ((btrim(coalesce(p->>'rules',''))='' and pdf_id is null) or coalesce(p->>'privacy','')='') then raise exception 'Publicá el reglamento y el aviso de privacidad antes de abrir';end if;
 update public.trail_settings set date=p->>'date',time=p->>'time',location=p->>'location',deadline=p->>'deadline',contact=p->>'contact',rules=p->>'rules',privacy=p->>'privacy',open=(p->>'open')::boolean,min_members=2, terms=coalesce(p->>'terms',s.terms), waiver=coalesce(p->>'waiver',s.waiver), rules_pdf_id=pdf_id, waiver_file_id=waiver_id, requirements_enabled=requirements, requirements_revision=gen_random_uuid() where id=1 returning * into s;
 insert into public.trail_audit(admin_id,action,details) values(p_admin,'configuracion',jsonb_build_object('abiertas',s.open));return to_jsonb(s);
end $$;
create or replace function public.trail_attend(p_admin uuid,p_id uuid,p_ids uuid[]) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m record;begin
 if not public.trail_has_permission(p_admin,'attendance') then raise exception 'Acceso denegado';end if;
 perform 1 from public.trail_teams where id=p_id and deleted_at is null and status='activa' for update;if not found then raise exception 'Inscripción inexistente o cancelada';end if;
 if cardinality(p_ids) not between 1 and 6 or exists(select 1 from unnest(p_ids) x where not exists(select 1 from public.trail_members where id=x and team_id=p_id and deleted_at is null)) then raise exception 'Integrantes inválidos';end if;
 for m in update public.trail_members set present_at=now(),present_by=p_admin where team_id=p_id and id=any(p_ids) and present_at is null returning id loop
  insert into public.trail_audit(admin_id,team_id,action,details) values(p_admin,p_id,'asistencia',jsonb_build_object('participante',m.id));
 end loop;
 return public.trail_team(p_id);
end $$;
commit;
