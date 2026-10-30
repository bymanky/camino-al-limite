import { beforeAll, afterAll, it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
const db = new PGlite();
const roles = [
  "superadministrador",
  "administrador",
  "cobros",
  "acreditacion",
  "consulta",
];
const ids = Object.fromEntries(roles.map((r) => [r, crypto.randomUUID()]));
const legacy = crypto.randomUUID();
let team: string, member: string;
const grants: Record<string, string[]> = {
  superadministrador: [
    "users",
    "manage",
    "read",
    "lookup",
    "payments",
    "attendance",
  ],
  administrador: ["manage", "read", "lookup", "payments", "attendance"],
  cobros: ["read", "lookup", "payments"],
  acreditacion: ["lookup", "attendance"],
  consulta: ["read", "lookup"],
};
beforeAll(async () => {
  await db.exec(
    "create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);",
  );
  await db.exec(
    readFileSync(
      new URL("./fixtures/legacy-schema.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.query("insert into auth.users values($1,$2),($3,$4)", [
    ids.superadministrador,
    "owner@example.com",
    legacy,
    "legacy@example.com",
  ]);
  await db.query(
    "insert into trail_private.admins(user_id,username) values($1,$2),($3,$4)",
    [ids.superadministrador, "bymanky", legacy, "anterior"],
  );
  for (const f of readdirSync(
    new URL("../supabase/migrations/", import.meta.url),
  ).sort())
    await db.exec(
      readFileSync(
        new URL("../supabase/migrations/" + f, import.meta.url),
        "utf8",
      ),
    );
  for (const role of roles.slice(1)) {
    await db.query("insert into auth.users values($1,$2)", [
      ids[role],
      role + "@example.com",
    ]);
    await db.query("select trail_staff_add($1,$2,$3,$4,$5)", [
      ids.superadministrador,
      ids[role],
      role,
      role + "@example.com",
      role,
    ]);
  }
  await db.exec(
    "update trail_settings set open=true,rules='Prueba',privacy='Prueba'",
  );
  const p = {
    team: "Prueba roles",
    responsible: "Persona Prueba",
    phone: "099123456",
    email: "prueba@example.com",
    method: "ecos",
    accepted: true,
    idempotency: crypto.randomUUID(),
    members: Array.from({ length: 4 }, (_, i) => ({
      name: "Prueba " + i,
      document: "FICTICIO-" + i,
    })),
  };
  team = (
    await db.query<any>("select trail_register($1,$2,$3,$4) id", [
      p,
      "r-role",
      "q-role",
      "h-role",
    ])
  ).rows[0].id;
  member = (await db.query<any>("select trail_team($1) t", [team])).rows[0].t
    .members[0].id;
}, 30000);
afterAll(() => db.close());
it("promueve solo al propietario existente y conserva los otros administradores", async () => {
  const rows = (
    await db.query<any>(
      "select username,role,email from trail_private.admins where user_id=any($1)",
      [[ids.superadministrador, legacy]],
    )
  ).rows;
  expect(rows.find((r) => r.username === "bymanky")).toMatchObject({
    role: "superadministrador",
    email: "owner@example.com",
  });
  expect(rows.find((r) => r.username === "anterior").role).toBe(
    "administrador",
  );
});
it.each(roles)("aplica la matriz exacta de permisos de %s", async (role) => {
  for (const permission of [
    "users",
    "manage",
    "read",
    "lookup",
    "payments",
    "attendance",
    "inventado",
  ]) {
    const r = (
      await db.query<any>("select trail_has_permission($1,$2) ok", [
        ids[role],
        permission,
      ])
    ).rows[0].ok;
    expect(r, role + ":" + permission).toBe(grants[role].includes(permission));
  }
});
it.each(roles.slice(1))(
  "%s no puede gestionar usuarios ni elevarse a superadministrador",
  async (role) => {
    await expect(
      db.query("select trail_staff_list($1)", [ids[role]]),
    ).rejects.toThrow("Acceso denegado");
    await expect(
      db.query("select trail_staff_update($1,$2,$3,$4)", [
        ids[role],
        ids[role],
        "superadministrador",
        true,
      ]),
    ).rejects.toThrow("Acceso denegado");
  },
);
it("superadministrador lista y modifica accesos, sin poder suspenderse ni cambiar su propio rol", async () => {
  const r = (
    await db.query<any>("select trail_staff_list($1) users", [
      ids.superadministrador,
    ])
  ).rows[0].users;
  expect(r).toHaveLength(6);
  await expect(
    db.query("select trail_staff_update($1,$1,$2,$3)", [
      ids.superadministrador,
      "consulta",
      false,
    ]),
  ).rejects.toThrow("No podés cambiar tu propio rol");
});
it("cobros solo puede modificar el pago y rechaza parches con campos adicionales", async () => {
  await db.query("select trail_admin_update($1,$2,$3)", [
    ids.cobros,
    team,
    { payment: "confirmado" },
  ]);
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      ids.cobros,
      team,
      { payment: "pendiente", notes: "No permitido" },
    ]),
  ).rejects.toThrow("Acceso denegado");
  const t = (await db.query<any>("select trail_team($1) t", [team])).rows[0].t;
  expect(t.payment).toBe("confirmado");
  expect(t.notes).toBe("");
});
it("acreditación marca asistencia y no modifica pagos ni equipos", async () => {
  await db.query("select trail_attend($1,$2,$3)", [
    ids.acreditacion,
    team,
    [member],
  ]);
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      ids.acreditacion,
      team,
      { payment: "confirmado" },
    ]),
  ).rejects.toThrow("Acceso denegado");
  await expect(
    db.query("select trail_admin_remove($1,$2,null,false)", [
      ids.acreditacion,
      team,
    ]),
  ).rejects.toThrow("Acceso denegado");
});
it("consulta no puede cambiar pagos, asistencia ni configuración", async () => {
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      ids.consulta,
      team,
      { payment: "pendiente" },
    ]),
  ).rejects.toThrow("Acceso denegado");
  await expect(
    db.query("select trail_attend($1,$2,$3)", [ids.consulta, team, [member]]),
  ).rejects.toThrow("Acceso denegado");
  await expect(
    db.query("select trail_settings_update($1,$2)", [
      ids.consulta,
      { open: false },
    ]),
  ).rejects.toThrow("Acceso denegado");
});
it("suspender o bajar un rol tiene efecto inmediato sin esperar a renovar el JWT", async () => {
  await db.query("select trail_staff_update($1,$2,$3,$4)", [
    ids.superadministrador,
    ids.cobros,
    "consulta",
    true,
  ]);
  expect(
    (
      await db.query<any>("select trail_has_permission($1,$2) ok", [
        ids.cobros,
        "payments",
      ])
    ).rows[0].ok,
  ).toBe(false);
  await db.query("select trail_staff_update($1,$2,$3,$4)", [
    ids.superadministrador,
    ids.cobros,
    "consulta",
    false,
  ]);
  expect(
    (await db.query<any>("select trail_staff_profile($1) p", [ids.cobros]))
      .rows[0].p,
  ).toBeNull();
  await expect(
    db.query("select trail_admin_update($1,$2,$3)", [
      ids.cobros,
      team,
      { payment: "confirmado" },
    ]),
  ).rejects.toThrow("Acceso denegado");
});
it("visitantes y usuarios comunes no pueden invocar la gestión de roles", async () => {
  for (const role of ["anon", "authenticated"]) {
    await db.exec("set role " + role);
    try {
      await expect(
        db.query("select trail_staff_update($1,$2,$3,$4)", [
          ids.superadministrador,
          ids.consulta,
          "superadministrador",
          true,
        ]),
      ).rejects.toThrow("permission denied");
      await expect(
        db.query("select trail_staff_profile($1)", [ids.superadministrador]),
      ).rejects.toThrow("permission denied");
    } finally {
      await db.exec("reset role");
    }
  }
});
