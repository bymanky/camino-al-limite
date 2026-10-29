import { it, expect } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";

it("actualiza la base existente, conserva equipos anteriores y exige cuatro en las nuevas inscripciones", async () => {
  const db = new PGlite();
  try {
    await db.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key,email text);create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);`,
    );
    await db.exec(
      readFileSync(
        new URL("./fixtures/legacy-schema.sql", import.meta.url),
        "utf8",
      ),
    );
    await db.exec(
      "update public.trail_settings set open=true,rules='Reglamento existente',privacy='Privacidad existente',location='Largada existente'",
    );
    const old = {
      team: "Equipo anterior",
      responsible: "Ana Pérez",
      phone: "099123456",
      email: "ana@example.com",
      method: "ecos",
      members: [{ name: "Ana Pérez", document: "12345678" }],
      accepted: true,
      idempotency: crypto.randomUUID(),
    };
    const register = async (p: unknown, r: string) =>
      (
        await db.query<{ id: string }>(
          "select public.trail_register($1,$2,$3,$4) id",
          [p, r, "qr-" + r, "request-" + r],
        )
      ).rows[0].id;
    const oldId = await register(old, "anterior");
    const dir = new URL("../supabase/migrations/", import.meta.url);
    const file = readdirSync(dir).find((f) =>
      f.endsWith("_require_four_member_teams.sql"),
    )!;
    await db.exec(readFileSync(new URL(file, dir), "utf8"));
    const settings = (
      await db.query<any>("select * from public.trail_settings")
    ).rows[0];
    expect(settings.min_members).toBe(4);
    expect(settings.open).toBe(true);
    expect(settings.rules).toBe("Reglamento existente");
    expect(settings.location).toBe("Largada existente");
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_members where team_id=$1",
          [oldId],
        )
      ).rows[0].n,
    ).toBe(1);
    expect(await register(old, "anterior")).toBe(oldId);
    for (const n of [1, 2, 3, 5])
      await expect(
        register(
          {
            ...old,
            idempotency: crypto.randomUUID(),
            members: Array.from({ length: n }, (_, i) => ({
              name: "Persona " + i,
              document: "7654321" + i,
            })),
          },
          "nuevo-" + n,
        ),
      ).rejects.toThrow("Cantidad de integrantes inválida");
    const newId = await register(
      {
        ...old,
        idempotency: crypto.randomUUID(),
        members: Array.from({ length: 4 }, (_, i) => ({
          name: "Persona " + i,
          document: "7654321" + i,
        })),
      },
      "nuevo-4",
    );
    expect(
      (
        await db.query<{ n: number }>(
          "select count(*)::int n from public.trail_members where team_id=$1",
          [newId],
        )
      ).rows[0].n,
    ).toBe(4);
    await expect(
      db.exec("update public.trail_settings set min_members=1"),
    ).rejects.toThrow("trail_settings_min_members_check");
  } finally {
    await db.close();
  }
}, 30000);
