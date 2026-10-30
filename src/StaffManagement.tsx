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
    [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [role, setRole] = useState<StaffRole>("consulta");
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
    setError("");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("La contraseña es demasiado larga. Acortala y reintentá.");
      return;
    }
    if (
      !confirm(
        "¿Crear el usuario " +
          username +
          " con el rol " +
          staffRoles[role].name +
          "?",
      )
    )
      return;
    try {
      await run(async () => {
        const result = await api("admin-user-create", {
          username,
          password,
          role,
        });
        setNotice(result.message);
        setUsername("");
      });
    } finally {
      setPassword("");
      setConfirmation("");
    }
  }
  return (
    <section className="admin-panel staff-management">
      <h2>Usuarios y roles</h2>
      <p>
        Creá usuarios locales de Camino al Limite con nombre, contraseña y rol.
        Solo el superadministrador puede gestionar estos accesos.
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
        <h3>Crear usuario local</h3>
        <div className="field-grid">
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
          <label>
            Contraseña inicial
            <input
              required
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
            />
            <small>
              Mínimo 12 caracteres. La contraseña no se mostrará en la lista de
              usuarios.
            </small>
          </label>
          <label>
            Repetir contraseña inicial
            <input
              required
              type="password"
              minLength={12}
              maxLength={72}
              autoComplete="new-password"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              disabled={busy}
            />
          </label>
        </div>
        <p>{staffRoles[role].description}</p>
        <p className="muted">
          La persona ingresará directamente con su usuario y contraseña. Después
          podrá cambiarla desde Mi contraseña.
        </p>
        <button className="button" disabled={busy}>
          {busy ? "Creando…" : "Crear usuario local"}
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
        <small>{user.local ? "Usuario local" : "Cuenta existente"}</small>
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
