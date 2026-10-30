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
  staffUsers: [] as any[],
  creates: vi.fn(),
  signIn: vi.fn(),
}));
const uid = "4d240039-5059-4c95-afd5-685b953f88c0",
  teamId = "1d240039-5059-4c95-afd5-685b953f88c0";
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    auth: {
      signInWithPassword: mock.signIn,
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
        createUser: mock.creates,
        getUserById: async (id: string) => ({
          data: { user: mock.authUsers.find((u) => u.id === id) },
          error: null,
        }),
      },
    },
    rpc: mock.rpc,
  }),
}));
beforeAll(async () => {
  vi.stubGlobal("Deno", {
    env: {
      get: (key: string) =>
        key === "ALLOWED_ORIGINS" ? "https://bymanky.github.io" : key === "TRAIL_TOKEN_SECRET" ? "test-secret-with-more-than-thirty-two-characters" : "test-value",
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
  mock.staffUsers = [];
  mock.creates.mockReset();
  mock.signIn.mockReset();
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
          ? mock.staffUsers
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
const localPassword = "Test-only-password-42!";
it("crea una cuenta con usuario, contraseña y rol sin pedir correo ni enviar invitaciones", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.creates.mockImplementation(async (input) => ({
    data: { user: { id: teamId, email: input.email } },
    error: null,
  }));
  const r = await call("admin-user-create", {
    username: "nuevo",
    password: localPassword,
    role: "consulta",
  });
  expect(r.status).toBe(200);
  expect(mock.creates).toHaveBeenCalledWith({
    email: expect.stringMatching(/^cal-[a-f0-9]{40}@camino-staff\.invalid$/),
    password: localPassword,
    email_confirm: true,
    app_metadata: { trail_local: true, trail_username: "nuevo" },
  });
  expect(mock.invites).not.toHaveBeenCalled();
  expect(mock.links).not.toHaveBeenCalled();
  expect(r.body).not.toHaveProperty("password");
  expect(r.body).not.toHaveProperty("email");
  expect(r.body).not.toHaveProperty("invitation");
  expect(mock.rpc).toHaveBeenCalledWith(
    "trail_staff_add",
    expect.objectContaining({ p_admin: uid, p_id: teamId, p_role: "consulta" }),
  );
});
it.each(["corta", "a".repeat(73), "🙂".repeat(30)])(
  "rechaza contraseñas inválidas sin crear cuentas",
  async (password) => {
    mock.role = "superadministrador";
    mock.permissions = ["users"];
    expect(
      (
        await call("admin-user-create", {
          username: "nuevo",
          password,
          role: "consulta",
        })
      ).status,
    ).toBe(400);
    expect(mock.creates).not.toHaveBeenCalled();
  },
);
it("rechaza nombres duplicados antes de crear una cuenta de acceso", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.staffUsers = [
    { id: teamId, username: "ocupado", email: "privado@example.com" },
  ];
  expect(
    (
      await call("admin-user-create", {
        username: "ocupado",
        password: localPassword,
        role: "consulta",
      })
    ).status,
  ).toBe(400);
  expect(mock.creates).not.toHaveBeenCalled();
});
it("retira las altas por correo y los enlaces de invitación", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  expect(
    (
      await call("admin-user-create", {
        username: "nuevo",
        password: localPassword,
        role: "consulta",
        email: "externo@example.com",
        mode: "link",
      })
    ).status,
  ).toBe(400);
  expect(mock.links).not.toHaveBeenCalled();
  expect(mock.invites).not.toHaveBeenCalled();
});
it("la lista de administración no devuelve correos reales ni identificadores internos", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.staffUsers = [
    {
      id: uid,
      username: "bymanky",
      email: "privado@example.com",
      role: "superadministrador",
      active: true,
    },
    {
      id: teamId,
      username: "local",
      email: "cal-123@camino-staff.invalid",
      role: "consulta",
      active: true,
    },
  ];
  const r = await call("admin-users");
  expect(r.status).toBe(200);
  expect(r.body.users[0]).not.toHaveProperty("email");
  expect(r.body.users[1]).not.toHaveProperty("email");
  expect(r.body.users[1].local).toBe(true);
  expect(r.body.users[0].local).toBe(false);
});
it("un alta incompleta solo se reintenta acreditando la contraseña original", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.creates.mockImplementation(async (input) => ({
    data: { user: { id: teamId, email: input.email } },
    error: null,
  }));
  await call("admin-user-create", {
    username: "nuevo",
    password: localPassword,
    role: "consulta",
  });
  const email = mock.creates.mock.calls[0][0].email;
  mock.authUsers = [
    {
      id: teamId,
      email,
      app_metadata: { trail_local: true, trail_username: "nuevo" },
    },
  ];
  mock.signIn.mockResolvedValue({
    data: { user: { id: teamId } },
    error: null,
  });
  mock.creates.mockClear();
  expect(
    (
      await call("admin-user-create", {
        username: "nuevo",
        password: localPassword,
        role: "consulta",
      })
    ).status,
  ).toBe(200);
  expect(mock.creates).not.toHaveBeenCalled();
  expect(mock.signIn).toHaveBeenCalledWith({ email, password: localPassword });
  mock.signIn.mockResolvedValue({
    data: { user: null },
    error: { message: "Invalid credentials" },
  });
  expect(
    (
      await call("admin-user-create", {
        username: "nuevo",
        password: "Another-test-password-42!",
        role: "consulta",
      })
    ).status,
  ).toBe(409);
});
it("no toma control de cuentas que no fueron creadas por este sistema", async () => {
  mock.role = "superadministrador";
  mock.permissions = ["users"];
  mock.creates.mockImplementation(async (input) => ({
    data: { user: { id: teamId, email: input.email } },
    error: null,
  }));
  await call("admin-user-create", {
    username: "nuevo",
    password: localPassword,
    role: "consulta",
  });
  const email = mock.creates.mock.calls[0][0].email;
  mock.authUsers = [{ id: teamId, email, app_metadata: {} }];
  expect(
    (
      await call("admin-user-create", {
        username: "nuevo",
        password: localPassword,
        role: "consulta",
      })
    ).status,
  ).toBe(409);
  expect(mock.signIn).not.toHaveBeenCalled();
});
