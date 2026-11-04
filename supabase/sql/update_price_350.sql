-- Nuevas inscripciones: $350 por persona, cuatro integrantes. No modifica importes existentes.
begin;
alter table public.trail_teams drop constraint trail_teams_amount_check;
alter table public.trail_teams add constraint trail_teams_amount_check check (amount in (1200,1400));
alter table public.trail_teams alter column amount set default 1400;
commit;
