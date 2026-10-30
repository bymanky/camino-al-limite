import { beforeAll, beforeEach, it, expect, vi } from "vitest";
declare global {
  var Deno: {
    env: { get(key: string): string | undefined };
    serve(handler: (req: Request) => Promise<Response>): void;
  };
}
const mock = vi.hoisted(() => ({
  handler: null as any,
  role: "consulta",
  permissions: ["read", "lookup"],
  active: true,
  rpc: vi.fn(),
  invites: vi.fn(),
  links: vi.fn(),
  authUsers: [] as any[],
}));
const uid = "4d240039-5059-4c95-afd5-685b953f88c0",
  teamId = "1d240039-5059-4c95-afd5-685b953f88c0";
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({
        data: {
          user: { id: uid, user_metadata: { role: "superadministrador" } },
        },
        error: null,
      }),
      admin: {
        listUsers: async () => ({
          data: { users: mock.authUsers },
          error: null,
        }),
        inviteUserByEmail: mock.invites,
        generateLink: mock.links,
      },
    },
    rpc: mock.rpc,
  }),
}));
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        key === "ALLOWED_ORIGINS" ? "https://bymanky.github.io" : "test-value",
    },
    serve: (handler: any) => {
      mock.handler = handler;
    },
  });
  await import("../supabase/functions/trail-api/index");
});
beforeEach(() => {
  mock.role = "consulta";
  mock.permissions = ["read", "lookup"];
  mock.active = true;
  mock.authUsers = [];
  mock.invites.mockReset();
  mock.links.mockReset();
  mock.rpc.mockReset();
  mock.rpc.mockImplementation(async (name: string) => ({
    error: null,
    data:
      name === "trail_staff_profile"
        ? mock.active
          ? {
              id: uid,
              username: "prueba",
              role: mock.role,
              permissions: mock.permissions,
            }
          : null
        : name === "trail_staff_list"
          ? []
          : name === "trail_rate"
            ? true
            : name === "trail_lookup"
              ? teamId
              : name === "trail_team" || name === "trail_attend"
                ? {
                    id: teamId,
                    code: "CAL-PRUEBA",
                    team: "Prueba",
                    payment: "confirmado",
                    status: "activa",
                    amount: 1200,
                    email: "privado@example.com",
                    phone: "099123456",
                    notes: "Privado",
                    receipt_path: "privado.pdf",
                    members: [
                      {
                        id: uid,
                        name: "Persona Prueba",
                        document: "FICTICIO",
                        present_at: null,
                      },
                    ],
                    removed_members: [{ name: "Privado" }],
                  }
                : null,
  }));
});
async function call(action: string, p: any = {}, auth = true) {
  const r = await mock.handler(
    new Request("https://example.com", {
      method: "POST",
      headers: {
        Origin: "https://bymanky.github.io",
        "Content-Type": "application/json",
        ...(auth ? { Authorization: "Bearer token" } : {}),
      },
      body: JSON.stringify({ action, ...p }),
    }),
  );
  return { status: r.status, body: await r.json() };
}
it("rechaza gestión de usuarios sin sesión y no confía en user_metadata", async () => {
  expect((await call("admin-users", {}, false)).status).toBe(401);
  expect((await call("admin-users")).status).toBe(403);
  expect(mock.invites).not.toHaveBeenCalled();
});
it.each([
  "admin-remove",
  "admin-update",
  "admin-settings",
  "admin-attend",
  "admin-file",
  "admin-user-create",
  "admin-user-update",
])("consulta rechaza %s antes de tocar datos", async (action) => {
  expect(
    (await call(action, { id: teamId, patch: { payment: "confirmado" } }))
      .status,
  ).toBe(403);
  expect(
    mock.rpc.mock.calls.every(([name]) => name === "trail_staff_profile"),
  ).toBe(true);
});
it("cobros rechaza un parche mixto aunque incluya un pago válido", async () => {
  mock.role = "cobros";
  mock.permissions = ["read", "lookup", "payments"];
  expect(
    (
      await call("admin-update", {
        id: teamId,
        patch: { payment: "confirmado", team: "Ataque" },
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await call("admin-update", {
        id: teamId,
        patch: { payment: "confirmado" },
      })
    ).status,
  ).toBe(200);
});
it("acreditación no recibe contactos, adjuntos ni participantes eliminados", async () => {
  mock.role = "acreditacion";
  mock.permissions = ["lookup", "attendance"];
  expect((await call("admin-list")).status).toBe(403);
  const lookup = await call("admin-lookup", { code: "CAL-PRUEBA" });
  expect(lookup.status).toBe(200);
  expect(lookup.body).not.toHaveProperty("email");
  expect(lookup.body).not.toHaveProperty("receipt_path");
  expect(lookup.body).not.toHaveProperty("removed_members");
  expect(lookup.body.members[0].document).toBe("FICTICIO");
  const attendance = await call("admin-attend", { id: teamId, ids: [uid] });
  expect(attendance.body).not.toHaveProperty("phone");
});
it("revocar el acceso bloquea la siguiente petición con el mismo token", async () => {
  expect((await call("admin-me")).status).toBe(200);
  mock.active = false;
  expect((await call("admin-me")).status).toBe(403);
});
it("solo superadministrador puede invitar, y no se envía una contraseña", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users", "manage", "read"];
  mock.invites.mockResolvedValue({
    data: { user: { id: teamId, email: "nuevo@example.com" } },
    error: null,
  });
  const r = await call("admin-user-create", {
    username: "nuevo",
    email: "nuevo@example.com",
    role: "consulta",
    mode: "invite",
  });
  expect(r.status).toBe(200);
  expect(mock.invites).toHaveBeenCalledWith("nuevo@example.com", {
    redirectTo: "https://bymanky.github.io/camino-al-limite/?recovery=1#/admin",
  });
  expect(mock.rpc).toHaveBeenCalledWith(
    "trail_staff_add",
    expect.objectContaining({ p_admin: uid, p_id: teamId, p_role: "consulta" }),
  );
});
it("vincula una cuenta existente sin cambiar su contraseña ni enviar invitación", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.authUsers = [{ id: teamId, email: "existente@example.com" }];
  const r = await call("admin-user-create", {
    username: "existente",
    email: "existente@example.com",
    role: "acreditacion",
    mode: "existing",
  });
  expect(r.status).toBe(200);
  expect(mock.invites).not.toHaveBeenCalled();
});
it("crea un enlace privado sin enviar correo ni usar contraseñas", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.links.mockResolvedValue({
    data: {
      user: { id: teamId, email: "nuevo@example.com" },
      properties: { action_link: "https://example.com/invitacion-ficticia" },
    },
    error: null,
  });
  const r = await call("admin-user-create", {
    username: "nuevo",
    email: "nuevo@example.com",
    role: "consulta",
    mode: "link",
  });
  expect(r.status).toBe(200);
  expect(r.body.invitation).toBe("https://example.com/invitacion-ficticia");
  expect(mock.invites).not.toHaveBeenCalled();
  expect(mock.links).toHaveBeenCalledWith({
    type: "invite",
    email: "nuevo@example.com",
    options: {
      redirectTo:
        "https://bymanky.github.io/camino-al-limite/?recovery=1#/admin",
    },
  });
});
it("un rol inferior no puede obtener enlaces de invitación", async () => {
  const r = await call("admin-user-create", {
    username: "nuevo",
    email: "nuevo@example.com",
    role: "superadministrador",
    mode: "link",
  });
  expect(r.status).toBe(403);
  expect(mock.links).not.toHaveBeenCalled();
  expect(r.body).not.toHaveProperty("invitation");
});
