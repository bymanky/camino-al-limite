import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const admin = crypto.randomUUID(),
  other = crypto.randomUUID();
let id: string, members: any[];
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  // Probar la actualización de una base ya existente, no solo el esquema nuevo.
  const legacy = readFileSync(
    new URL("./fixtures/legacy-schema.sql", import.meta.url),
    "utf8",
  );
  await db.exec(legacy);
  for (const file of readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  ).sort())
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  await db.query("insert into auth.users values($1,$2),($3,$4)", [
    admin,
    "admin@example.com",
    other,
    "other@example.com",
  ]);
  await db.query(
    "insert into trail_private.admins(user_id,username) values($1,$2)",
    [admin, "prueba"],
  );
  await db.exec(
    "update trail_settings set open=true,rules='Prueba',privacy='Prueba'",
  );
  const p = {
    team: "Equipo prueba",
    responsible: "Persona Prueba",
    phone: "099123456",
    email: "prueba@example.com",
    method: "ecos",
    accepted: true,
    idempotency: crypto.randomUUID(),
    members: Array.from({ length: 4 }, (_, i) => ({
      name: "Persona " + i,
      document: "1234567" + i,
    })),
  };
  id = (
    await db.query<any>("select trail_register($1,$2,$3,$4) id", [
      p,
      "receipt",
      "qr",
      "hash",
    ])
  ).rows[0].id;
  members = (await team()).members;
}, 30000);
afterAll(() => db.close());
async function team() {
  return (await db.query<any>("select trail_team($1) t", [id])).rows[0].t;
}
async function remove(member: string | null, restore = false, actor = admin) {
  return (
    await db.query<any>("select trail_admin_remove($1,$2,$3,$4) t", [
      actor,
      id,
      member,
      restore,
    ])
  ).rows[0].t;
}
it("edita equipo y participantes sin cambiar IDs ni asistencia", async () => {
  await db.query("select trail_attend($1,$2,$3)", [admin, id, [members[0].id]]);
  const before = await team();
  const after = (
    await db.query<any>("select trail_admin_update($1,$2,$3) t", [
      admin,
      id,
      {
        team: "Equipo corregido",
        members: members.map((m, i) => ({
          id: m.id,
          name: i === 0 ? "Nombre corregido" : m.name,
          document: m.document,
        })),
      },
    ])
  ).rows[0].t;
  expect(after.team).toBe("Equipo corregido");
  expect(after.members[0].name).toBe("Nombre corregido");
  expect(after.members[0].id).toBe(members[0].id);
  expect(after.members[0].present_at).toBe(before.members[0].present_at);
});
it("rechaza IDs duplicados en la edición y revierte el cambio del equipo", async () => {
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      admin,
      id,
      {
        team: "No guardar",
        members: Array(4).fill({
          id: members[0].id,
          name: "Duplicado",
          document: "00000000",
        }),
      },
    ]),
  ).rejects.toThrow("La lista de integrantes cambió");
  expect((await team()).team).toBe("Equipo corregido");
});
it("usuarios comunes y visitantes no pueden borrar ni restaurar", async () => {
  await expect(remove(null, false, other)).rejects.toThrow("Acceso denegado");
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await expect(remove(null)).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  }
});
it("elimina un participante de la nómina, conserva sus datos y permite restaurarlo", async () => {
  const after = await remove(members[0].id);
  expect(after.members).toHaveLength(3);
  expect(after.removed_members[0].id).toBe(members[0].id);
  await expect(
    db.query("select trail_attend($1,$2,$3)", [admin, id, [members[0].id]]),
  ).rejects.toThrow("Integrantes inválidos");
  const restored = await remove(members[0].id, true);
  expect(restored.members).toHaveLength(4);
  expect(restored.members[0].present_at).toBeTruthy();
});
it("no permite quitar participantes de otro equipo ni repetir eliminaciones", async () => {
  await expect(remove(crypto.randomUUID())).rejects.toThrow(
    "El registro cambió",
  );
  await remove(members[3].id);
  await expect(remove(members[3].id)).rejects.toThrow("El registro cambió");
  await remove(members[3].id, true);
});
it("elimina y restaura un equipo completo conservando comprobantes y auditoría", async () => {
  const removed = await remove(null);
  expect(removed.deleted_at).toBeTruthy();
  expect(
    (await db.query<any>("select trail_lookup($1,$2) id", [removed.code, "qr"]))
      .rows[0].id,
  ).toBeNull();
  expect(
    (await db.query<any>("select trail_receipt_id($1) id", ["receipt"])).rows[0]
      .id,
  ).toBeNull();
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      admin,
      id,
      { team: "Oculto" },
    ]),
  ).rejects.toThrow("Inscripción inexistente");
  await expect(
    db.query("select trail_attend($1,$2,$3)", [admin, id, [members[0].id]]),
  ).rejects.toThrow("Inscripción inexistente");
  await expect(remove(members[0].id, true)).rejects.toThrow("Restaurá primero");
  const restored = await remove(null, true);
  expect(restored.deleted_at).toBeNull();
  expect(restored.members).toHaveLength(4);
  expect(
    (await db.query<any>("select trail_receipt_id($1) id", ["receipt"])).rows[0]
      .id,
  ).toBe(id);
  expect(
    (
      await db.query<any>(
        "select count(*)::int n from trail_audit where action in ('papelera','restauracion')",
      )
    ).rows[0].n,
  ).toBe(6);
});
