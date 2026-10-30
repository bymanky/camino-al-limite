import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  Download,
  LogOut,
  ScanLine,
  Search,
  Settings as SettingsIcon,
  Users,
  RefreshCw,
  X,
  Check,
  Pencil,
  Trash2,
  RotateCcw,
} from "lucide-react";
import { api, supabase, configured } from "./api";
import {
  initialSettings,
  methods,
  money,
  rosterCsv,
  type Settings,
  type Team,
} from "./model";
import { receiptPdf, rosterPdf } from "./downloads";
import Scanner from "./Scanner";
import StaffManagement from "./StaffManagement";
import { staffRoles, type StaffProfile } from "./staff";
export default function Admin() {
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const can = (permission: string) =>
    Boolean(profile?.permissions.includes(permission));
  const [logged, setLogged] = useState(false);
  const [checking, setChecking] = useState(true);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [teams, setTeams] = useState<Team[]>([]);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [tab, setTab] = useState("teams");
  const [query, setQuery] = useState("");
  const [pay, setPay] = useState("");
  const [method, setMethod] = useState("");
  const [attendance, setAttendance] = useState("");
  const [selected, setSelected] = useState<Team | null>(null);
  const [trash, setTrash] = useState(false);
  const [editing, setEditing] = useState(false);
  const editorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (editing)
      editorRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [editing]);
  const [code, setCode] = useState("");
  async function load() {
    const { profile: current } = await api<{ profile: StaffProfile }>(
      "admin-me",
    );
    setProfile(current);
    if (current.permissions.includes("read")) {
      const result = await api("admin-list");
      setTeams(result.teams);
      setSettings(result.settings);
    } else setTeams([]);
    setTab((previous) => {
      if (previous === "users" && !current.permissions.includes("users"))
        return current.permissions.includes("read") ? "teams" : "scanner";
      if (previous === "settings" && !current.permissions.includes("manage"))
        return current.permissions.includes("read") ? "teams" : "scanner";
      return previous === "teams" && !current.permissions.includes("read")
        ? "scanner"
        : previous;
    });
    setLogged(true);
  }
  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (data.session)
        try {
          await load();
        } catch (e) {
          setError((e as Error).message);
        }
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        setLogged(false);
        setProfile(null);
        setTeams([]);
        setSelected(null);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function login(e: FormEvent) {
    e.preventDefault();
    await run(async () => {
      const result = await api("login", { username, password });
      const { error: authError } = await supabase!.auth.setSession(result);
      if (authError) throw authError;
      setPassword("");
      await load();
    });
  }
  async function update(patch: Record<string, unknown>) {
    await run(async () => {
      const t = await api<Team>("admin-update", { id: selected!.id, patch });
      setSelected(t);
      await load();
      setNotice("Cambios guardados.");
    });
  }
  async function remove(memberId?: string, restore = false) {
    if (!selected) return;
    const label = memberId ? "este participante" : "el equipo completo";
    if (
      !restore &&
      !confirm(
        "¿Mover " +
          label +
          " a la papelera? Podrás restaurarlo desde administración.",
      )
    )
      return;
    await run(async () => {
      const result = await api<Team>("admin-remove", {
        id: selected.id,
        member: memberId ?? null,
        restore,
      });
      setSelected(memberId || restore ? result : null);
      setEditing(false);
      await load();
      setNotice(
        restore ? "Registro restaurado." : "Registro movido a la papelera.",
      );
    });
  }
  async function lookup(value: string) {
    await run(async () => {
      if (!navigator.onLine)
        throw new Error("Sin conexión. No se pudo verificar la inscripción.");
      const result = await api<Team>("admin-lookup", { code: value.trim() });
      setSelected(result);
      setEditing(false);
      setTab("teams");
    });
  }
  async function attend(ids: string[]) {
    if (
      selected?.payment !== "confirmado" &&
      !confirm(
        "El pago está pendiente. ¿Confirmás el ingreso de estos participantes?",
      )
    )
      return;
    await run(async () => {
      const result = await api<Team>("admin-attend", { id: selected!.id, ids });
      setSelected(result);
      await load();
      setNotice(
        "Asistencia verificada. Las personas ya registradas conservan su hora original.",
      );
    });
  }
  const alerts = (
    <>
      {error && (
        <div className="notice error" role="alert">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
    </>
  );
  if (checking)
    return (
      <main className="form-shell">
        <p role="status">Verificando acceso…</p>
      </main>
    );
  if (!logged)
    return (
      <main className="form-shell login">
        <div className="eyebrow green">ESPACIO DE ORGANIZACIÓN</div>
        <h1>Administración.</h1>
        <p>Ingresá con tu usuario y contraseña.</p>
        {!configured && (
          <div className="notice">
            El acceso estará disponible cuando se conecte Supabase.
          </div>
        )}
        <form onSubmit={login}>
          <label>
            Nombre de usuario
            <input
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </label>
          <label>
            Contraseña
            <input
              required
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {alerts}
          <button className="button full" disabled={busy || !configured}>
            {" "}
            {busy ? "Ingresando…" : "Ingresar"}
          </button>
          <button
            type="button"
            className="text-button"
            disabled={busy || !username || !configured}
            onClick={() =>
              run(async () => {
                await api("recovery", {
                  username,
                  redirect: `${location.origin}${location.pathname}?recovery=1#/admin`,
                });
                setNotice(
                  "Si el usuario existe, recibirá instrucciones en su correo de administrador.",
                );
              })
            }
          >
            Olvidé mi contraseña
          </button>
        </form>
      </main>
    );
  if (new URLSearchParams(location.search).has("recovery"))
    return (
      <main className="form-shell">
        <h1>Nueva contraseña</h1>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              const { error } = await supabase!.auth.updateUser({ password });
              if (error) throw error;
              setPassword("");
              location.href = location.origin + location.pathname + "#/admin";
            });
          }}
        >
          <label>
            Nueva contraseña (mínimo 12 caracteres)
            <input
              minLength={12}
              required
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          {alerts}
          <button className="button" disabled={busy}>
            Guardar contraseña
          </button>
        </form>
      </main>
    );
  const active = teams.filter((t) => t.status === "activa" && !t.deleted_at);
  const filtered = teams.filter(
    (t) =>
      Boolean(t.deleted_at) === trash &&
      (!pay || t.payment === pay) &&
      (!method || t.method === method) &&
      (!attendance ||
        t.members.some((m) =>
          attendance === "presente" ? Boolean(m.present_at) : !m.present_at,
        )) &&
      [
        t.team,
        t.code,
        t.responsible,
        ...t.members.flatMap((m) => [m.name, m.document]),
      ]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  return (
    <main className="admin-shell">
      <div className="admin-title">
        <div>
          <div className="eyebrow green">CAMINO AL LIMITE · ORGANIZACIÓN</div>
          <h1>Todo el equipo, a la vista.</h1>
          {profile && (
            <p className="staff-identity">
              {profile.username} · {staffRoles[profile.role].name}
            </p>
          )}
        </div>
        <button
          className="button outline"
          onClick={() =>
            run(async () => {
              await supabase!.auth.signOut();
              setLogged(false);
            })
          }
        >
          <LogOut size={17} /> Salir
        </button>
      </div>
      {can("read") && (
        <div className="stats">
          {[
            ["Equipos", active.length],
            ["Participantes", active.reduce((n, t) => n + t.members.length, 0)],
            [
              "Pagos confirmados",
              active.filter((t) => t.payment === "confirmado").length,
            ],
            [
              "Pagos por verificar",
              active.filter((t) => t.payment !== "confirmado").length,
            ],
            [
              "Presentes",
              active.reduce(
                (n, t) => n + t.members.filter((m) => m.present_at).length,
                0,
              ),
            ],
            [
              "Importe confirmado",
              money(
                active
                  .filter((t) => t.payment === "confirmado")
                  .reduce((n, t) => n + t.amount, 0),
              ),
            ],
          ].map(([title, value]) => (
            <div key={title}>
              <small>{title}</small>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      )}
      <div className="tabs">
        {can("read") && (
          <button
            className={tab === "teams" ? "active" : ""}
            onClick={() => setTab("teams")}
          >
            <Users size={17} /> Inscripciones
          </button>
        )}
        {can("lookup") && (
          <button
            className={tab === "scanner" ? "active" : ""}
            onClick={() => {
              setSelected(null);
              setTab("scanner");
            }}
          >
            <ScanLine size={17} /> Escanear
          </button>
        )}
        {can("manage") && (
          <button
            className={tab === "settings" ? "active" : ""}
            onClick={() => setTab("settings")}
          >
            <SettingsIcon size={17} /> Evento
          </button>
        )}
        {can("users") && (
          <button
            className={tab === "users" ? "active" : ""}
            onClick={() => {
              setSelected(null);
              setTab("users");
            }}
          >
            <Users size={17} /> Usuarios y roles
          </button>
        )}
      </div>
      {alerts}
      {tab === "users" && profile && can("users") ? (
        <StaffManagement profile={profile} />
      ) : tab === "settings" ? (
        <form
          className="admin-panel"
          onSubmit={(e) => {
            e.preventDefault();
            run(async () => {
              await api("admin-settings", { settings });
              setNotice("Configuración guardada.");
            });
          }}
        >
          <h2>Datos del evento</h2>
          <div className="field-grid">
            {(
              [
                ["date", "Fecha", "date"],
                ["time", "Hora", "time"],
                ["location", "Lugar de largada", "text"],
                ["deadline", "Cierre de inscripciones", "datetime-local"],
                ["contact", "Contacto", "text"],
              ] as const
            ).map(([k, label, type]) => (
              <label key={k}>
                {label}
                <input
                  type={type}
                  value={settings[k]}
                  onChange={(e) =>
                    setSettings({ ...settings, [k]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Integrantes por equipo
              <input value="4 personas (obligatorio)" readOnly />
            </label>
          </div>
          <label>
            Reglamento
            <textarea
              required
              rows={6}
              value={settings.rules}
              onChange={(e) =>
                setSettings({ ...settings, rules: e.target.value })
              }
            />
          </label>
          <label>
            Aviso de privacidad
            <textarea
              required
              rows={6}
              value={settings.privacy}
              onChange={(e) =>
                setSettings({ ...settings, privacy: e.target.value })
              }
            />
          </label>
          <label className="checkbox">
            <input
              type="checkbox"
              checked={settings.open}
              onChange={(e) =>
                setSettings({ ...settings, open: e.target.checked })
              }
            />{" "}
            Inscripciones abiertas
          </label>
          <button className="button" disabled={busy}>
            Guardar configuración
          </button>
        </form>
      ) : tab === "scanner" ? (
        <div className="admin-panel">
          <h2>Escanear inscripción</h2>
          <p>
            Leé el QR del comprobante. Podrás verificar el pago y marcar cada
            integrante.
          </p>
          <Scanner onRead={lookup} />
          <form
            className="inline-form"
            onSubmit={(e) => {
              e.preventDefault();
              lookup(code);
            }}
          >
            <label>
              Código manual
              <input
                required
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="CAL-…"
              />
            </label>
            <button className="button" disabled={busy}>
              Verificar
            </button>
          </form>
        </div>
      ) : (
        <>
          <div className="form-actions">
            <button
              className={!trash ? "button small" : "button small outline"}
              onClick={() => setTrash(false)}
            >
              Inscripciones
            </button>
            {can("manage") && (
              <button
                className={trash ? "button small" : "button small outline"}
                onClick={() => setTrash(true)}
              >
                <Trash2 size={16} /> Papelera (
                {teams.filter((t) => t.deleted_at).length})
              </button>
            )}
          </div>
          <div className="filters">
            <label className="search">
              <Search size={17} />
              <input
                aria-label="Buscar inscripciones"
                placeholder="Equipo, nombre, documento o código…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              aria-label="Filtrar pago"
              value={pay}
              onChange={(e) => setPay(e.target.value)}
            >
              <option value="">Todos los pagos</option>
              <option value="pendiente">Pendientes</option>
              <option value="en_revision">En revisión</option>
              <option value="confirmado">Confirmados</option>
            </select>
            <select
              aria-label="Modalidad"
              value={method}
              onChange={(e) => setMethod(e.target.value)}
            >
              <option value="">Todas las modalidades</option>
              {Object.entries(methods).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              aria-label="Asistencia"
              value={attendance}
              onChange={(e) => setAttendance(e.target.value)}
            >
              <option value="">Toda la asistencia</option>
              <option value="presente">Con presentes</option>
              <option value="pendiente">Con pendientes</option>
            </select>
          </div>
          <div className="toolbar">
            <span>
              {filtered.length} equipos ·{" "}
              {filtered.reduce((n, t) => n + t.members.length, 0)} participantes
            </span>
            <div>
              <button
                className="text-button"
                onClick={() => run(load)}
                disabled={busy}
              >
                <RefreshCw size={15} /> Actualizar
              </button>
              <button
                className="text-button"
                onClick={() => {
                  const url = URL.createObjectURL(
                    new Blob([rosterCsv(filtered)], {
                      type: "text/csv;charset=utf-8;",
                    }),
                  );
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = "camino-al-limite-nomina.csv";
                  a.click();
                  setTimeout(() => URL.revokeObjectURL(url), 1000);
                }}
              >
                <Download size={15} /> CSV / Excel
              </button>
              <button
                className="text-button"
                onClick={() => rosterPdf(filtered)}
              >
                <Download size={15} /> PDF
              </button>
            </div>
          </div>
          <div className="team-list">
            {filtered.length === 0 ? (
              <div className="empty">
                <Users size={35} />
                <h3>
                  {trash
                    ? "La papelera está vacía"
                    : "No hay inscripciones para mostrar"}
                </h3>
                <p>Las nuevas inscripciones aparecerán aquí.</p>
              </div>
            ) : (
              filtered.map((t) => (
                <button
                  className="team-row"
                  key={t.id}
                  onClick={() => {
                    setSelected(t);
                    setEditing(false);
                  }}
                >
                  <span>
                    <strong>{t.team}</strong>
                    <small>
                      {t.code} · {t.responsible}
                    </small>
                  </span>
                  <span>{t.members.length} integrantes</span>
                  <span className={"badge " + t.payment}>
                    {t.payment.replace("_", " ")}
                  </span>
                  <span>
                    {t.status === "cancelada"
                      ? "Cancelada"
                      : `${t.members.filter((m) => m.present_at).length} presentes`}
                  </span>
                </button>
              ))
            )}
          </div>
        </>
      )}
      {selected && (
        <div className="modal-backdrop">
          <section
            role="dialog"
            aria-modal="true"
            aria-label="Detalle de inscripción"
            className="modal"
          >
            <button
              className="icon close"
              aria-label="Cerrar detalle"
              onClick={() => setSelected(null)}
            >
              <X />
            </button>
            <div className="eyebrow green">{selected.code}</div>
            <h2>{selected.team}</h2>
            {can("read") && (
              <p>
                {selected.responsible} · {selected.phone}
                <br />
                {selected.email}
              </p>
            )}
            <div className="notice">
              Inscripción: {selected.status} · Pago:{" "}
              {selected.payment.replace("_", " ")}
              <br />
              {methods[selected.method]} · {money(selected.amount)}
            </div>
            {can("payments") && selected.receipt_path && (
              <button
                className="text-button"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const { url } = await api("admin-file", {
                      id: selected.id,
                    });
                    window.open(url, "_blank", "noopener,noreferrer");
                  })
                }
              >
                Ver comprobante de transferencia
              </button>
            )}
            {selected.deleted_at ? (
              <div className="notice">
                Este equipo está en la papelera. No aparece en la nómina ni
                permite marcar asistencia.
                <button
                  className="button small"
                  disabled={busy}
                  onClick={() => remove(undefined, true)}
                >
                  <RotateCcw size={16} /> Restaurar equipo
                </button>
              </div>
            ) : (
              <button
                className="button outline"
                disabled={busy || !can("manage")}
                onClick={() => setEditing(!editing)}
              >
                <Pencil size={16} />{" "}
                {editing ? "Cerrar edición" : "Editar equipo y participantes"}
              </button>
            )}
            {!selected.deleted_at && selected.members.length !== 4 && (
              <p className="notice">
                Equipo incompleto: quedan {selected.members.length} integrantes.
                Las nuevas inscripciones siguen siendo de cuatro personas.
              </p>
            )}
            <h3>Integrantes</h3>
            {selected.members.map((m) => (
              <div className="member-row" key={m.id}>
                <span>
                  <strong>{m.name}</strong>
                  <small>
                    {m.document}
                    {m.present_at &&
                      ` · Presente: ${new Date(m.present_at).toLocaleString("es-UY")}`}
                  </small>
                </span>
                <button
                  className="button small outline"
                  disabled={
                    busy ||
                    Boolean(selected.deleted_at) ||
                    !can("attendance") ||
                    Boolean(m.present_at) ||
                    selected.status !== "activa"
                  }
                  onClick={() => attend([m.id!])}
                >
                  {m.present_at ? (
                    <>
                      <Check size={15} /> Presente
                    </>
                  ) : (
                    "Marcar presente"
                  )}
                </button>
                {can("manage") && !selected.deleted_at && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => remove(m.id)}
                    aria-label={"Eliminar a " + m.name}
                  >
                    <Trash2 size={16} /> Eliminar
                  </button>
                )}
              </div>
            ))}
            {can("manage") && Boolean(selected.removed_members?.length) && (
              <details>
                <summary>
                  Participantes en papelera ({selected.removed_members!.length})
                </summary>
                {selected.removed_members!.map((m) => (
                  <div className="member-row" key={m.id}>
                    <span>
                      {m.name} · {m.document}
                    </span>
                    <button
                      className="button small outline"
                      disabled={busy || Boolean(selected.deleted_at)}
                      onClick={() => remove(m.id, true)}
                    >
                      Restaurar participante
                    </button>
                  </div>
                ))}
              </details>
            )}
            <button
              className="button outline"
              disabled={
                busy ||
                Boolean(selected.deleted_at) ||
                !can("attendance") ||
                selected.members.length === 0 ||
                selected.status !== "activa" ||
                selected.members.every((m) => m.present_at)
              }
              onClick={() => {
                if (confirm("¿Marcar a todos los integrantes como presentes?"))
                  attend(selected.members.map((m) => m.id!));
              }}
            >
              Marcar a todos presentes
            </button>
            <hr />
            <label>
              Estado del pago
              <select
                disabled={
                  busy || !can("payments") || Boolean(selected.deleted_at)
                }
                value={selected.payment}
                onChange={(e) => update({ payment: e.target.value })}
              >
                <option value="pendiente">Pendiente</option>
                <option value="en_revision">En revisión</option>
                <option value="confirmado">Confirmado</option>
              </select>
            </label>
            <label>
              Observación interna
              <textarea
                disabled={
                  busy || !can("manage") || Boolean(selected.deleted_at)
                }
                value={selected.notes || ""}
                onChange={(e) =>
                  setSelected({ ...selected, notes: e.target.value })
                }
              />
            </label>
            <button
              className="button small"
              disabled={busy || !can("manage") || Boolean(selected.deleted_at)}
              onClick={() => update({ notes: selected.notes })}
            >
              Guardar observación
            </button>
            {can("manage") && !selected.deleted_at && editing && (
              <section className="team-editor" ref={editorRef}>
                <h3>Editar equipo y participantes</h3>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    update({
                      team: selected.team,
                      responsible: selected.responsible,
                      phone: selected.phone,
                      email: selected.email,
                      members: selected.members.map((m) => ({
                        id: m.id,
                        name: m.name,
                        document: m.document,
                      })),
                    });
                  }}
                >
                  {(["team", "responsible", "phone", "email"] as const).map(
                    (k) => (
                      <label key={k}>
                        {
                          {
                            team: "Equipo",
                            responsible: "Responsable",
                            phone: "Teléfono",
                            email: "Correo",
                          }[k]
                        }
                        <input
                          required
                          value={selected[k]}
                          onChange={(e) =>
                            setSelected({ ...selected, [k]: e.target.value })
                          }
                        />
                      </label>
                    ),
                  )}
                  {selected.members.map((m, i) => (
                    <fieldset key={m.id}>
                      <legend>Integrante {i + 1}</legend>
                      <label>
                        Nombre
                        <input
                          required
                          minLength={3}
                          value={m.name}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              members: selected.members.map((x, j) =>
                                i === j ? { ...x, name: e.target.value } : x,
                              ),
                            })
                          }
                        />
                      </label>
                      <label>
                        Documento
                        <input
                          required
                          minLength={5}
                          value={m.document}
                          onChange={(e) =>
                            setSelected({
                              ...selected,
                              members: selected.members.map((x, j) =>
                                i === j
                                  ? { ...x, document: e.target.value }
                                  : x,
                              ),
                            })
                          }
                        />
                      </label>
                    </fieldset>
                  ))}
                  <button className="button" disabled={busy}>
                    Guardar correcciones
                  </button>
                </form>
              </section>
            )}
            <div className="form-actions">
              {can("read") && (
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      const result = await api("admin-receipt", {
                        id: selected.id,
                      });
                      await receiptPdf(result.team, result.token);
                    })
                  }
                >
                  <Download size={15} /> Descargar PDF
                </button>
              )}
              <button
                className="text-button danger"
                disabled={
                  busy ||
                  !can("manage") ||
                  Boolean(selected.deleted_at) ||
                  selected.status === "cancelada"
                }
                onClick={() => {
                  if (
                    confirm(
                      "¿Cancelar esta inscripción? La nómina conservará su registro.",
                    )
                  )
                    update({ status: "cancelada" });
                }}
              >
                Cancelar inscripción
              </button>
              {can("manage") && !selected.deleted_at && (
                <button
                  className="text-button danger"
                  disabled={busy}
                  onClick={() => remove()}
                >
                  <Trash2 size={16} /> Eliminar equipo
                </button>
              )}
            </div>
            {alerts}
          </section>
        </div>
      )}
    </main>
  );
}
