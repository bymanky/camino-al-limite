import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
const db = new PGlite();
const admin = "290a5365-3b83-4ff5-856b-0b865ba12850";
const other = "90421ed4-d479-4c26-b8de-cddfa234179a";
let teamId: string;
let memberId: string;
const p = {
  team: "Equipo prueba",
  responsible: "Ana Pérez",
  phone: "099123456",
  email: "ana@example.com",
  method: "ecos",
  members: Array.from({ length: 4 }, (_, i) => ({
    name: `Persona ${i}`,
    document: `1234567${i}`,
  })),
  accepted: true,
  idempotency: "90e3c52a-7ce3-4be1-894c-1c4e423777e2",
};
beforeAll(async () => {
  await db.exec(
    `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
  );
  await db.exec(
    readFileSync(
      new URL("../supabase/sql/schema.sql", import.meta.url),
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
    [admin, "organizacion"],
  );
  await db.exec(
    "update public.trail_settings set open=true,rules='Reglamento de prueba',privacy='Privacidad de prueba'",
  );
}, 30000);
afterAll(async () => {
  await db.close();
});
async function register(
  payload: unknown = p,
  receipt = "r",
  qr = "q",
  request = "h",
) {
  const r = await db.query<{ id: string }>(
    "select public.trail_register($1,$2,$3,$4) as id",
    [payload, receipt, qr, request],
  );
  return r.rows[0].id;
}
describe.sequential("Base de datos y permisos", () => {
  it("guarda el equipo completo y fija el precio en 1200", async () => {
    teamId = await register({ ...p, amount: 1 });
    const r = await db.query<{ data: any }>(
      "select public.trail_team($1) data",
      [teamId],
    );
    expect(r.rows[0].data.amount).toBe(1200);
    expect(r.rows[0].data.members).toHaveLength(4);
    memberId = r.rows[0].data.members[0].id;
  });
  it("reintentar no duplica una inscripción", async () => {
    expect(await register()).toBe(teamId);
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_teams",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("impide reutilizar el intento con otro contenido", async () => {
    await expect(
      register({ ...p, team: "Cambiado" }, "r", "q", "different"),
    ).rejects.toThrow("La solicitud ya fue utilizada");
  });
  it("rechaza cinco integrantes sin dejar un equipo parcial", async () => {
    await expect(
      register(
        {
          ...p,
          idempotency: crypto.randomUUID(),
          members: Array.from({ length: 5 }, (_, i) => ({
            name: "Persona " + i,
            document: "1234567" + i,
          })),
        },
        "r2",
        "q2",
        "h2",
      ),
    ).rejects.toThrow("Cantidad de integrantes inválida");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_teams",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it.each([0, 1, 2, 3])(
    "la base rechaza equipos de %i sin dejar registros parciales",
    async (n) => {
      await expect(
        register(
          {
            ...p,
            idempotency: crypto.randomUUID(),
            members: p.members.slice(0, n),
          },
          `r-short-${n}`,
          `q-short-${n}`,
          `h-short-${n}`,
        ),
      ).rejects.toThrow("Cantidad de integrantes inválida");
      expect(
        (
          await db.query<{ n: number }>(
            "select count(*)::int n from public.trail_teams",
          )
        ).rows[0].n,
      ).toBe(1);
    },
  );
  it("la configuración no permite reducir el equipo a una persona", async () => {
    await db.query("select public.trail_settings_update($1,$2)", [
      admin,
      {
        date: "",
        time: "",
        location: "",
        deadline: "",
        contact: "",
        rules: "Prueba",
        privacy: "Prueba",
        open: true,
        min_members: 1,
      },
    ]);
    expect(
      (
        await db.query<{ min_members: number }>(
          "select min_members from public.trail_settings",
        )
      ).rows[0].min_members,
    ).toBe(4);
  });
  it("revierte todo si un integrante tiene datos inválidos", async () => {
    await expect(
      register(
        {
          ...p,
          idempotency: crypto.randomUUID(),
          members: [
            p.members[0],
            { name: "X", document: "00000" },
            p.members[2],
            p.members[3],
          ],
        },
        "r3",
        "q3",
        "h3",
      ),
    ).rejects.toThrow();
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_teams",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("un visitante no puede leer la nómina ni invocar funciones", async () => {
    await db.exec("set role anon");
    try {
      await expect(
        db.query("select * from public.trail_teams"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select public.trail_team($1)", [teamId]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("un usuario autenticado común tampoco accede a los datos", async () => {
    await db.exec("set role authenticated");
    try {
      await expect(
        db.query("select * from public.trail_members"),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select public.trail_admin_identity($1)", ["organizacion"]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  });
  it("exige autorización administrativa para modificar", async () => {
    await expect(
      db.query("select public.trail_admin_update($1,$2,$3)", [
        other,
        teamId,
        { payment: "confirmado" },
      ]),
    ).rejects.toThrow("Acceso denegado");
  });
  it("confirma el pago y deja auditoría", async () => {
    const r = await db.query<{ data: any }>(
      "select public.trail_admin_update($1,$2,$3) data",
      [admin, teamId, { payment: "confirmado" }],
    );
    expect(r.rows[0].data.payment).toBe("confirmado");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_audit where action='correccion'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("dos registros de asistencia conservan una sola hora y auditoría", async () => {
    const a = await db.query<{ data: any }>(
      "select public.trail_attend($1,$2,$3) data",
      [admin, teamId, [memberId]],
    );
    const b = await db.query<{ data: any }>(
      "select public.trail_attend($1,$2,$3) data",
      [admin, teamId, [memberId]],
    );
    expect(a.rows[0].data.members[0].present_at).toBe(
      b.rows[0].data.members[0].present_at,
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_audit where action='asistencia'",
        )
      ).rows[0].n,
    ).toBe(1);
  });
  it("una inscripción cancelada no puede registrar asistencia", async () => {
    await db.query("select public.trail_admin_update($1,$2,$3)", [
      admin,
      teamId,
      { status: "cancelada" },
    ]);
    await expect(
      db.query("select public.trail_attend($1,$2,$3)", [
        admin,
        teamId,
        [memberId],
      ]),
    ).rejects.toThrow("Inscripción inexistente o cancelada");
  });
  it("permite recuperar solo un token exacto", async () => {
    expect(
      (
        await db.query<{ id: string }>(
          "select public.trail_receipt_id($1) id",
          ["r"],
        )
      ).rows[0].id,
    ).toBe(teamId);
    expect(
      (
        await db.query<{ id: string | null }>(
          "select public.trail_receipt_id($1) id",
          ["otro"],
        )
      ).rows[0].id,
    ).toBeNull();
  });
  it("limita intentos y rechaza abrir sin textos publicados", async () => {
    for (let i = 0; i < 2; i++)
      expect(
        (
          await db.query<{ ok: boolean }>(
            "select public.trail_rate($1,$2) ok",
            ["ip", 2],
          )
        ).rows[0].ok,
      ).toBe(true);
    expect(
      (
        await db.query<{ ok: boolean }>("select public.trail_rate($1,$2) ok", [
          "ip",
          2,
        ])
      ).rows[0].ok,
    ).toBe(false);
    await expect(
      db.query("select public.trail_settings_update($1,$2)", [
        admin,
        { open: true, rules: "", privacy: "", min_members: 1 },
      ]),
    ).rejects.toThrow("Publicá el reglamento");
  });
});
