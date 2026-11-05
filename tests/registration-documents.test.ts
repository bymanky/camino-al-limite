import { afterAll, beforeAll, expect, it } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

const db = new PGlite();
const owner = crypto.randomUUID();
const settings = {
  date: "2035-12-12", time: "17:30", location: "Prueba", deadline: "",
  contact: "", rules: "", privacy: "Aviso ficticio", terms: "Términos ficticios",
  waiver: "Deslinde ficticio", open: true, requirements_enabled: true,
  rules_pdf: Buffer.from("%PDF-prueba").toString("base64"),
};
const health = { mime: "image/png", data: "iVBORw0KGgo=", expires_on: "2035-12-12" };
let revision: string;
let pdfId: string;
let teamId: string;
let memberId: string;
const draft = {
  team: "Equipo ficticio", responsible: "Persona ficticia", phone: "099000000",
  email: "ficticio@example.com", method: "ecos", accepted: true,
  accept_terms: true, accept_waiver: true, idempotency: crypto.randomUUID(),
  members: Array.from({ length: 4 }, (_, i) => ({ name: "Persona " + i, document: "FICTICIO" + i })),
};
const sql = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

beforeAll(async () => {
  await db.exec("create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);");
  await db.exec(sql("./fixtures/legacy-schema.sql"));
  await db.query("insert into auth.users values($1,$2)", [owner, "owner@example.com"]);
  await db.query("insert into trail_private.admins(user_id,username) values($1,'bymanky')", [owner]);
  for (const f of readdirSync(new URL("../supabase/migrations/", import.meta.url)).sort())
    await db.exec(sql("../supabase/migrations/" + f));
  await db.exec(sql("../supabase/sql/update_registration_documents.sql"));
  await db.exec(sql("../supabase/sql/update_waiver_file.sql"));
  const result = await db.query<{ saved: { rules_pdf_id: string; requirements_revision: string } }>(
    "select public.trail_settings_update($1,$2) saved", [owner, settings],
  );
  pdfId = result.rows[0].saved.rules_pdf_id;
  revision = result.rows[0].saved.requirements_revision;
}, 30000);
afterAll(() => db.close());
const register = (patch: Record<string, unknown> = {}) => db.query<{ id: string }>(
  "select public.trail_register($1,'receipt','qr','request') id",
  [{ ...draft, requirements_revision: revision, health: [health, health, health, health], ...patch }],
);

it("rechaza faltantes, vencimientos y textos desactualizados sin registrar parcialmente", async () => {
  await expect(register({ accept_waiver: false })).rejects.toThrow("Aceptá los términos");
  await expect(register({ health: [health] })).rejects.toThrow("por integrante");
  await expect(register({ requirements_revision: crypto.randomUUID() })).rejects.toThrow("información del evento cambió");
  await expect(register({ health: [health, health, health, { ...health, expires_on: "2035-12-11" }] })).rejects.toThrow("vigente");
  expect((await db.query("select id from public.trail_teams")).rows).toHaveLength(0);
});

it("guarda los cuatro documentos, el PDF y los textos aceptados, sin duplicar reintentos", async () => {
  teamId = (await register()).rows[0].id;
  expect((await register()).rows[0].id).toBe(teamId);
  expect((await db.query("select member_id from trail_private.health_documents")).rows).toHaveLength(4);
  expect((await db.query("select terms, waiver, rules_pdf_id from trail_private.registration_consents")).rows[0])
    .toEqual({ terms: settings.terms, waiver: settings.waiver, rules_pdf_id: pdfId });
  expect((await db.query("select public.trail_public_rules_pdf($1) as pdf", [pdfId])).rows[0]).toEqual({ pdf: settings.rules_pdf });
  memberId = (await db.query<{ id: string }>("select id from public.trail_members where team_id=$1 order by position limit 1", [teamId])).rows[0].id;
});

it("limita la descarga a quienes gestionan el evento y al integrante del equipo correcto", async () => {
  const query = "select public.trail_health_document($1,$2,$3,true) doc";
  await expect(db.query(query, [crypto.randomUUID(), teamId, memberId])).rejects.toThrow("Acceso denegado");
  expect((await db.query(query, [owner, crypto.randomUUID(), memberId])).rows[0]).toEqual({ doc: null });
  expect((await db.query(query, [owner, teamId, memberId])).rows[0]).toEqual({
    doc: { mime: health.mime, data: health.data, expires_on: health.expires_on },
  });
  await db.exec("set role anon");
  try {
    await expect(db.query(query, [owner, teamId, memberId])).rejects.toThrow("permission denied");
  } finally { await db.exec("reset role"); }
});

it("acepta un deslinde en archivo sin texto y conserva la versión aceptada", async () => {
  const document = { mime: "image/png", data: health.data };
  const save = (patch: object) => db.query<{
    saved: { waiver_file_id: string; requirements_revision: string };
  }>("select public.trail_settings_update($1,$2) saved", [owner, { ...settings, ...patch }]);
  const { rows: [{ saved }] } = await save({ waiver: "", waiver_file: document });
  const read = () => db.query("select public.trail_public_waiver_file($1) doc", [saved.waiver_file_id]);
  expect((await read()).rows[0]).toEqual({ doc: document });
  const { rows: [{ id }] } = await db.query<{ id: string }>(
    "select public.trail_register($1,'receipt-file','qr-file','request-file') id",
    [{ ...draft, idempotency: crypto.randomUUID(), requirements_revision: saved.requirements_revision, health: [health, health, health, health] }],
  );
  await expect(save({ waiver: "", remove_waiver_file: true })).rejects.toThrow("antes de activar los requisitos");
  await save({ remove_waiver_file: true });
  expect((await read()).rows[0]).toEqual({ doc: null });
  expect((await db.query("select waiver_file_id from trail_private.registration_consents where team_id=$1", [id])).rows[0])
    .toEqual({ waiver_file_id: saved.waiver_file_id });
});
