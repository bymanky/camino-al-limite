import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
const env = (k: string) => Deno.env.get(k) || "";
const root = createClient(
  env("SUPABASE_URL"),
  env("SUPABASE_SERVICE_ROLE_KEY"),
  { auth: { persistSession: false, autoRefreshToken: false } },
);
const origins = env("ALLOWED_ORIGINS")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
const secret = env("TRAIL_TOKEN_SECRET");
const member = z.object({
  name: z.string().trim().min(3).max(100),
  document: z.string().trim().min(5).max(30),
});
const registration = z
  .object({
    team: z.string().trim().min(2).max(80),
    responsible: z.string().trim().min(3).max(100),
    phone: z.string().trim().min(7).max(30),
    email: z.string().trim().email().max(150),
    method: z.enum(["ecos", "fomento", "transferencia"]),
    members: z.array(member).length(4),
    accepted: z.literal(true),
    idempotency: z.string().uuid(),
    website: z.string().max(0),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.members.map((m) => m.document.replace(/\W/g, "").toLowerCase()))
        .size !== v.members.length
    )
      c.addIssue({ code: "custom", message: "Documentos repetidos" });
  });
const settingsSchema = z.object({
  date: z.string().max(20),
  time: z.string().max(10),
  location: z.string().max(300),
  deadline: z
    .string()
    .refine((v) => !v || /^\d{4}-\d\d-\d\dT\d\d:\d\d$/.test(v)),
  contact: z.string().max(200),
  rules: z.string().max(40000),
  privacy: z.string().max(40000),
  open: z.boolean(),
  min_members: z.literal(4),
});
const patchSchema = z
  .object({
    team: z.string().trim().min(2).max(80).optional(),
    responsible: z.string().trim().min(3).max(100).optional(),
    phone: z.string().trim().min(7).max(30).optional(),
    email: z.string().trim().email().max(150).optional(),
    notes: z.string().max(4000).optional(),
    payment: z.enum(["pendiente", "en_revision", "confirmado"]).optional(),
    status: z.literal("cancelada").optional(),
    members: z
      .array(member.extend({ id: z.string().uuid() }))
      .min(0)
      .max(4)
      .optional(),
  })
  .strict();
class SafeError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
async function hash(text: string) {
  return Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function token(kind: string, id: string) {
  if (secret.length < 32)
    throw new Error("Falta configurar TRAIL_TOKEN_SECRET");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign(
        "HMAC",
        key,
        new TextEncoder().encode(`${kind}:${id}`),
      ),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
async function rpc(name: string, args: Record<string, unknown> = {}) {
  const { data, error } = await root.rpc(name, args);
  if (error) {
    const safe = [
      "Acceso denegado",
      "No podés cambiar tu propio rol ni suspender tu acceso",
      "Usuario inexistente",
      "Las inscripciones están cerradas",
      "El plazo de inscripción finalizó",
      "Cantidad de integrantes inválida",
      "La solicitud ya fue utilizada",
      "Inscripción inexistente o cancelada",
      "Integrantes inválidos",
      "Publicá el reglamento y el aviso de privacidad antes de abrir",
    ];
    if (safe.includes(error.message)) throw new SafeError(error.message);
    console.error("RPC failed", name, error.code);
    throw new Error("Database failure");
  }
  return data;
}
async function adminEmail(username: string) {
  const id = await rpc("trail_admin_identity", { p_username: username });
  if (!id) return null;
  const { data, error } = await root.auth.admin.getUserById(id);
  if (error) throw error;
  return data.user.email;
}
async function getTeam(id: string) {
  const t = await rpc("trail_team", { p_id: id });
  if (!t) throw new SafeError("No se encontró la inscripción", 404);
  return t;
}
async function limited(req: Request, scope: string, max: number) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("cf-connecting-ip") ||
    "unknown";
  if (
    !(await rpc("trail_rate", {
      p_key: await hash(`${scope}:${ip}`),
      p_limit: max,
    }))
  )
    throw new SafeError(
      "Demasiados intentos. Esperá 15 minutos antes de reintentar.",
      429,
    );
}
type Actor = {
  id: string;
  username: string;
  role: string;
  permissions: string[];
};
async function admin(req: Request): Promise<Actor> {
  const header = req.headers.get("authorization") || "";
  if (!header.startsWith("Bearer "))
    throw new SafeError("Ingresá para continuar", 401);
  const { data, error } = await root.auth.getUser(header.slice(7));
  if (error || !data.user)
    throw new SafeError("No tenés permiso para administrar este evento", 403);
  const profile = await rpc("trail_staff_profile", { p_id: data.user.id });
  if (!profile)
    throw new SafeError("No tenés permiso para administrar este evento", 403);
  return profile;
}
function requirePermission(actor: Actor, permission: string) {
  if (!actor.permissions.includes(permission))
    throw new SafeError("Tu rol no permite realizar esta operación", 403);
}
function teamForActor(t: any, actor: Actor) {
  if (actor.permissions.includes("read")) return t;
  return {
    id: t.id,
    code: t.code,
    team: t.team,
    payment: t.payment,
    status: t.status,
    amount: t.amount,
    members: t.members.map((m: any) => ({
      id: m.id,
      name: m.name,
      document: m.document,
      present_at: m.present_at,
    })),
  };
}
const staffRole = z.enum([
  "superadministrador",
  "administrador",
  "cobros",
  "acreditacion",
  "consulta",
]);
async function findAuthUser(email: string) {
  for (let page = 1; ; page++) {
    const { data, error } = await root.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error)
      throw new SafeError(
        "No pudimos consultar las cuentas. Reintentá en unos momentos.",
        503,
      );
    const found = data.users.find((u) => u.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 200) return null;
  }
}
function fileBytes(a: unknown) {
  if (!a) return null;
  const f = z
    .object({
      name: z.string().max(200),
      type: z.enum(["application/pdf", "image/jpeg", "image/png"]),
      data: z.string().max(6990508),
    })
    .parse(a);
  let bytes: Uint8Array;
  try {
    bytes = Uint8Array.from(atob(f.data), (c) => c.charCodeAt(0));
  } catch {
    throw new SafeError("El archivo no es válido");
  }
  if (bytes.length === 0 || bytes.length > 5242880)
    throw new SafeError("El archivo debe pesar entre 1 byte y 5 MB");
  const signatures: Record<string, number[]> = {
    "application/pdf": [37, 80, 68, 70, 45],
    "image/jpeg": [255, 216, 255],
    "image/png": [137, 80, 78, 71, 13, 10, 26, 10],
  };
  if (!signatures[f.type].every((v, i) => bytes[i] === v))
    throw new SafeError("El contenido del archivo no coincide con su formato");
  return {
    bytes,
    type: f.type,
    extension:
      f.type === "application/pdf"
        ? "pdf"
        : f.type === "image/jpeg"
          ? "jpg"
          : "png",
  };
}
async function publicTeam(t: any, qr: string) {
  return {
    id: t.id,
    code: t.code,
    team: t.team,
    amount: t.amount,
    method: t.method,
    payment: t.payment,
    status: t.status,
    members: t.members.map((m: any) => ({ name: m.name })),
    qr,
  };
}
Deno.serve(async (req) => {
  const origin = req.headers.get("origin") || "";
  const cors = {
    "Access-Control-Allow-Origin": origins.includes(origin)
      ? origin
      : origins[0] || "null",
    "Access-Control-Allow-Headers":
      "authorization,apikey,content-type,x-client-info",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
    Vary: "Origin",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  };
  const reply = (data: unknown, status = 200) =>
    new Response(JSON.stringify(data), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS")
    return new Response(null, { status: 204, headers: cors });
  if (req.method !== "POST")
    return reply({ error: "Método no permitido" }, 405);
  if (origin && !origins.includes(origin))
    return reply({ error: "Origen no autorizado" }, 403);
  try {
    if (Number(req.headers.get("content-length") || 0) > 7200000)
      throw new SafeError("Archivo demasiado grande", 413);
    const raw = await req.text();
    if (raw.length > 7200000)
      throw new SafeError("Archivo demasiado grande", 413);
    const b = JSON.parse(raw);
    if (b.action === "settings") {
      const { data, error } = await root
        .from("trail_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return reply(data);
    }
    if (b.action === "login") {
      await limited(req, "login", 10);
      const username = z
        .string()
        .trim()
        .toLowerCase()
        .regex(/^[a-z0-9_.-]{3,40}$/)
        .parse(b.username);
      const password = z.string().min(1).max(200).parse(b.password);
      const email = await adminEmail(username);
      const auth = createClient(env("SUPABASE_URL"), env("SUPABASE_ANON_KEY"), {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await auth.auth.signInWithPassword({
        email: email || "invalid@invalid.example",
        password,
      });
      if (error || !data.session || !email)
        throw new SafeError("Usuario o contraseña incorrectos", 401);
      return reply({
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      });
    }
    if (b.action === "recovery") {
      await limited(req, "recovery", 4);
      const username = z
        .string()
        .trim()
        .toLowerCase()
        .max(40)
        .parse(b.username);
      const redirect = z.string().url().parse(b.redirect);
      if (!origins.includes(new URL(redirect).origin))
        throw new SafeError("Enlace de recuperación inválido");
      const email = await adminEmail(username);
      if (email) {
        const auth = createClient(
          env("SUPABASE_URL"),
          env("SUPABASE_ANON_KEY"),
          { auth: { persistSession: false } },
        );
        const { error } = await auth.auth.resetPasswordForEmail(email, {
          redirectTo: redirect,
        });
        if (error) console.error("Recovery delivery failed");
      }
      return reply({ ok: true });
    }
    if (b.action === "register") {
      await limited(req, "register", 8);
      const p = registration.parse(b);
      const attachment = fileBytes(b.attachment);
      const receipt = await token("receipt", p.idempotency);
      const qr = await token("qr", p.idempotency);
      const id = await rpc("trail_register", {
        p,
        p_receipt_hash: await hash(receipt),
        p_qr_hash: await hash(qr),
        p_request_hash: await hash(JSON.stringify(p)),
      });
      let warning = "";
      if (attachment) {
        const path = `${id}/transferencia.${attachment.extension}`;
        const { error } = await root.storage
          .from("trail-receipts")
          .upload(path, attachment.bytes, {
            contentType: attachment.type,
            upsert: true,
          });
        if (error)
          warning =
            "La inscripción se guardó, pero no se pudo adjuntar el comprobante. Reintentá el envío con los mismos datos o contactá a la organización.";
        else await rpc("trail_attach", { p_id: id, p_path: path });
      }
      return reply({
        team: await publicTeam(await getTeam(id), qr),
        token: receipt,
        warning,
      });
    }
    if (b.action === "receipt") {
      await limited(req, "receipt", 60);
      const receipt = z
        .string()
        .regex(/^[a-f0-9]{64}$/)
        .parse(b.token);
      const id = await rpc("trail_receipt_id", { p_hash: await hash(receipt) });
      if (!id)
        throw new SafeError("El enlace del comprobante no es válido", 404);
      const { data, error } = await root.rpc("trail_receipt_seed", {
        p_id: id,
      });
      if (error) throw error;
      return reply(
        await publicTeam(await getTeam(id), await token("qr", data)),
      );
    }
    const actor = await admin(req);
    if (b.action === "admin-me") return reply({ profile: actor });
    const permission: Record<string, string> = {
      "admin-list": "read",
      "admin-lookup": "lookup",
      "admin-settings": "manage",
      "admin-attend": "attendance",
      "admin-file": "payments",
      "admin-receipt": "read",
      "admin-remove": "manage",
      "admin-users": "users",
      "admin-user-create": "users",
      "admin-user-update": "users",
    };
    if (b.action === "admin-update") {
      const keys = Object.keys(b.patch || {});
      requirePermission(
        actor,
        keys.length === 1 && keys[0] === "payment" ? "payments" : "manage",
      );
    } else if (permission[b.action])
      requirePermission(actor, permission[b.action]);
    else throw new SafeError("Acción inválida");
    if (b.action === "admin-users")
      return reply({
        users: await rpc("trail_staff_list", { p_admin: actor.id }),
      });
    if (b.action === "admin-user-update") {
      const parsed = z
        .object({ id: z.string().uuid(), role: staffRole, active: z.boolean() })
        .safeParse(b);
      if (!parsed.success)
        throw new SafeError("Revisá el usuario y el rol seleccionado.");
      await rpc("trail_staff_update", {
        p_admin: actor.id,
        p_id: parsed.data.id,
        p_role: parsed.data.role,
        p_active: parsed.data.active,
      });
      return reply({ ok: true });
    }
    if (b.action === "admin-user-create") {
      await limited(req, "staff-create", 10);
      const parsed = z
        .object({
          username: z
            .string()
            .trim()
            .toLowerCase()
            .regex(/^[a-z0-9_.-]{3,40}$/),
          email: z.string().trim().toLowerCase().email().max(150),
          role: staffRole,
          mode: z.enum(["link", "invite", "existing"]),
        })
        .safeParse(b);
      if (!parsed.success)
        throw new SafeError("Revisá el nombre de usuario, el correo y el rol.");
      const input = parsed.data;
      const staff = await rpc("trail_staff_list", { p_admin: actor.id });
      if (
        staff.some(
          (u: any) => u.username === input.username || u.email === input.email,
        )
      )
        throw new SafeError(
          "El usuario o correo ya pertenece al equipo de administración. Modificalo desde la lista.",
        );
      let user = await findAuthUser(input.email);
      if (input.mode === "existing" && !user)
        throw new SafeError(
          "No existe una cuenta con ese correo. Elegí invitar un usuario nuevo.",
        );
      if (input.mode !== "existing" && user)
        throw new SafeError(
          "Ese correo ya tiene una cuenta. Elegí vincular una cuenta existente.",
        );
      let invitation: string | undefined;
      if (input.mode === "link") {
        const { data, error } = await root.auth.admin.generateLink({
          type: "invite",
          email: input.email,
          options: {
            redirectTo:
              "https://bymanky.github.io/camino-al-limite/?recovery=1#/admin",
          },
        });
        if (error || !data.user || !data.properties?.action_link)
          throw new SafeError(
            "No se pudo generar el enlace de invitación. Revisá el correo y reintentá.",
            503,
          );
        user = data.user;
        invitation = data.properties.action_link;
      }
      if (input.mode === "invite") {
        const { data, error } = await root.auth.admin.inviteUserByEmail(
          input.email,
          {
            redirectTo:
              "https://bymanky.github.io/camino-al-limite/?recovery=1#/admin",
          },
        );
        if (error || !data.user)
          throw new SafeError(
            "No se pudo enviar la invitación. Revisá el correo y el límite de envíos de Supabase. Si la cuenta ya se creó, usá vincular cuenta existente.",
            503,
          );
        user = data.user;
      }
      try {
        await rpc("trail_staff_add", {
          p_admin: actor.id,
          p_id: user!.id,
          p_username: input.username,
          p_email: input.email,
          p_role: input.role,
        });
      } catch {
        throw new SafeError(
          "No se pudo confirmar el acceso. Revisá la lista antes de reintentar. Si no aparece, vinculá la cuenta existente.",
          409,
        );
      }
      return reply({
        ok: true,
        invitation,
        message:
          input.mode === "link"
            ? "Usuario creado. Copiá su enlace privado de invitación antes de salir de esta pantalla."
            : input.mode === "invite"
              ? "Usuario creado. Recibirá una invitación para definir su contraseña."
              : "Cuenta vinculada. Ingresará con su contraseña actual.",
      });
    }

    if (b.action === "admin-list") {
      const teams: any[] = [];
      for (let from = 0; ; from += 500) {
        const { data, error } = await root
          .from("trail_teams")
          .select(
            "id,code,team,responsible,phone,email,method,amount,payment,status,notes,created_at,receipt_path,deleted_at,members:trail_members(id,name,document,position,present_at,deleted_at)",
          )
          .order("created_at", { ascending: false })
          .order("id")
          .range(from, from + 499);
        if (error) throw error;
        teams.push(
          ...data.map((t) => ({
            ...t,
            removed_members: t.members
              .filter((m: any) => m.deleted_at)
              .sort((a: any, b: any) => a.position - b.position),
            members: t.members
              .filter((m: any) => !m.deleted_at)
              .sort((a: any, b: any) => a.position - b.position),
          })),
        );
        if (data.length < 500) break;
      }
      const { data, error } = await root
        .from("trail_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) throw error;
      return reply({
        teams: teams
          .filter((t) => actor.permissions.includes("manage") || !t.deleted_at)
          .map((t) => ({
            ...t,
            removed_members: actor.permissions.includes("manage")
              ? t.removed_members
              : [],
          })),
        settings: data,
      });
    }
    if (b.action === "admin-lookup") {
      const code = z.string().trim().min(4).max(200).parse(b.code);
      const qr = code.startsWith("CAL:") ? code.slice(4) : "";
      const id = await rpc("trail_lookup", {
        p_code: code,
        p_hash: await hash(qr),
      });
      if (!id) throw new SafeError("El código no existe", 404);
      return reply(teamForActor(await getTeam(id), actor));
    }
    if (b.action === "admin-settings")
      return reply(
        await rpc("trail_settings_update", {
          p_admin: actor.id,
          p: settingsSchema.parse(b.settings),
        }),
      );
    const id = z.string().uuid().parse(b.id);
    if (b.action === "admin-remove")
      return reply(
        await rpc("trail_admin_remove", {
          p_admin: actor.id,
          p_id: id,
          p_member: z.string().uuid().nullable().parse(b.member),
          p_restore: z.boolean().parse(b.restore),
        }),
      );
    if (b.action === "admin-update")
      return reply(
        await rpc("trail_admin_update", {
          p_admin: actor.id,
          p_id: id,
          p_patch: patchSchema.parse(b.patch),
        }),
      );
    if (b.action === "admin-attend")
      return reply(
        teamForActor(
          await rpc("trail_attend", {
            p_admin: actor.id,
            p_id: id,
            p_ids: z.array(z.string().uuid()).min(1).max(4).parse(b.ids),
          }),
          actor,
        ),
      );
    if (b.action === "admin-file") {
      const t = await getTeam(id);
      if (!t.receipt_path)
        throw new SafeError("No hay comprobante adjunto", 404);
      const { data, error } = await root.storage
        .from("trail-receipts")
        .createSignedUrl(t.receipt_path, 60);
      if (error) throw error;
      return reply({ url: data.signedUrl });
    }
    if (b.action === "admin-receipt") {
      const seed = await rpc("trail_receipt_seed", { p_id: id });
      if (!seed) throw new SafeError("Inscripción inexistente", 404);
      return reply({
        team: { ...(await getTeam(id)), qr: await token("qr", seed) },
        token: await token("receipt", seed),
      });
    }
    return reply({ error: "Acción inválida" }, 400);
  } catch (e) {
    if (e instanceof SafeError) return reply({ error: e.message }, e.status);
    if (e instanceof z.ZodError || e instanceof SyntaxError)
      return reply(
        {
          error:
            "Revisá los datos ingresados. El equipo debe tener exactamente 4 integrantes y documentos sin repetir.",
        },
        400,
      );
    console.error("Trail API error", e instanceof Error ? e.name : "unknown");
    return reply(
      {
        error: "No pudimos completar la operación. Reintentá en unos momentos.",
      },
      500,
    );
  }
});
