import { useEffect, useState, type FormEvent } from "react";
import { api } from "./api";
import {
  staffRoles,
  type StaffProfile,
  type StaffUser,
  type StaffRole,
} from "./staff";
export default function StaffManagement({
  profile,
}: {
  profile: StaffProfile;
}) {
  const [users, setUsers] = useState<StaffUser[]>([]),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [username, setUsername] = useState(""),
    [email, setEmail] = useState(""),
    [role, setRole] = useState<StaffRole>("consulta"),
    [mode, setMode] = useState("invite");
  async function load() {
    const result = await api<{ users: StaffUser[] }>("admin-users");
    setUsers(result.users);
  }
  useEffect(() => {
    load()
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function create(e: FormEvent) {
    e.preventDefault();
    if (
      !confirm(
        `¿${mode === "invite" ? "Invitar" : "Vincular"} a ${email} con el rol ${staffRoles[role].name}? Tendrá acceso según los permisos de ese rol.`,
      )
    )
      return;
    await run(async () => {
      const result = await api("admin-user-create", {
        username,
        email,
        role,
        mode,
      });
      setNotice(result.message);
      setUsername("");
      setEmail("");
    });
  }
  return (
    <section className="admin-panel staff-management">
      <h2>Usuarios y roles</h2>
      <p>
        Solo el superadministrador puede crear usuarios, asignar roles y
        suspender accesos a este evento.
      </p>
      {error && (
        <div role="alert" className="notice error">
          {error}
        </div>
      )}
      {notice && (
        <div role="status" className="notice">
          {notice}
        </div>
      )}
      <details>
        <summary>Ver permisos de cada rol</summary>
        <dl className="role-guide">
          {Object.entries(staffRoles).map(([key, r]) => (
            <div key={key}>
              <dt>{r.name}</dt>
              <dd>{r.description}</dd>
            </div>
          ))}
        </dl>
      </details>
      <form onSubmit={create}>
        <h3>Agregar usuario</h3>
        <div className="field-grid">
          <label>
            Tipo de alta
            <select
              value={mode}
              disabled={busy}
              onChange={(e) => setMode(e.target.value)}
            >
              <option value="invite">Invitar usuario nuevo por correo</option>
              <option value="existing">
                Vincular cuenta existente por correo
              </option>
            </select>
          </label>
          <label>
            Nombre de usuario
            <input
              required
              pattern="[a-z0-9_.-]{3,40}"
              minLength={3}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="none"
              value={username}
              onChange={(e) => setUsername(e.target.value.toLowerCase())}
              disabled={busy}
            />
            <small>
              Entre 3 y 40 letras minúsculas, números, puntos, guiones o guiones
              bajos.
            </small>
          </label>
          <label>
            Correo electrónico
            <input
              required
              type="email"
              maxLength={150}
              autoComplete="off"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={busy}
            />
          </label>
          <label>
            Rol
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              disabled={busy}
            >
              {Object.entries(staffRoles).map(([key, r]) => (
                <option key={key} value={key}>
                  {r.name}
                </option>
              ))}
            </select>
          </label>
        </div>
        <p>{staffRoles[role].description}</p>
        <p className="muted">
          {mode === "invite"
            ? "La persona recibirá un enlace para elegir su contraseña. El envío depende del servicio de correo de Supabase."
            : "La persona conservará su contraseña actual. Solo se agregará acceso a Camino al Limite."}
        </p>
        <button className="button" disabled={busy}>
          {busy
            ? "Procesando…"
            : mode === "invite"
              ? "Crear y enviar invitación"
              : "Vincular cuenta"}
        </button>
      </form>
      <h3>Equipo de administración</h3>
      {loading ? (
        <p role="status">Cargando usuarios…</p>
      ) : users.length === 0 ? (
        <p>No hay usuarios para mostrar.</p>
      ) : (
        <div className="staff-list">
          {users.map((user) => (
            <StaffRow
              key={user.id}
              user={user}
              own={user.id === profile.id}
              busy={busy}
              save={(role, active) =>
                run(async () => {
                  await api("admin-user-update", { id: user.id, role, active });
                  setNotice(
                    "Acceso actualizado. Los permisos se comprueban en cada operación.",
                  );
                })
              }
            />
          ))}
        </div>
      )}
    </section>
  );
}
function StaffRow({
  user,
  own,
  busy,
  save,
}: {
  user: StaffUser;
  own: boolean;
  busy: boolean;
  save: (role: StaffRole, active: boolean) => Promise<void>;
}) {
  const [role, setRole] = useState(user.role),
    [active, setActive] = useState(user.active);
  useEffect(() => {
    setRole(user.role);
    setActive(user.active);
  }, [user.role, user.active]);
  return (
    <form
      className="staff-row"
      onSubmit={(e) => {
        e.preventDefault();
        if (
          confirm(
            `¿Actualizar el acceso de ${user.username} a ${staffRoles[role].name}, ${active ? "activo" : "suspendido"}?`,
          )
        )
          void save(role, active);
      }}
    >
      <div>
        <strong>
          {user.username}
          {own ? " (tu cuenta)" : ""}
        </strong>
        <small>{user.email}</small>
        <span className={"badge " + (user.active ? "confirmado" : "pendiente")}>
          {user.active ? "Activo" : "Suspendido"}
        </span>
      </div>
      <label>
        Rol de {user.username}
        <select
          value={role}
          disabled={own || busy}
          onChange={(e) => setRole(e.target.value as StaffRole)}
        >
          {Object.entries(staffRoles).map(([key, r]) => (
            <option key={key} value={key}>
              {r.name}
            </option>
          ))}
        </select>
      </label>
      <label className="checkbox">
        <input
          type="checkbox"
          checked={active}
          disabled={own || busy}
          onChange={(e) => setActive(e.target.checked)}
        />{" "}
        Acceso activo
      </label>
      <button
        className="button small outline"
        disabled={own || busy || (role === user.role && active === user.active)}
      >
        Guardar acceso
      </button>
      {own && (
        <small>
          Tu propio acceso no puede suspenderse ni cambiarse desde esta
          pantalla.
        </small>
      )}
    </form>
  );
}
