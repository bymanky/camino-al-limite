import { useEffect, useState, lazy, Suspense, type FormEvent } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  Mountain,
  Medal,
  Sparkles,
  Shirt,
  Users,
  Check,
  ChevronLeft,
  Download,
  Copy,
  MapPin,
  CalendarDays,
  Flag,
  Menu,
  X,
  LockKeyhole,
  Plus,
  Trash2,
} from "lucide-react";
import { api, configured } from "./api";
import {
  initialSettings,
  methods,
  money,
  registrationSchema,
  type Draft,
  type Settings,
  type Team,
} from "./model";
import { receiptPdf, receiptLink } from "./downloads";
const Admin = lazy(() => import("./Admin"));
const newDraft = (): Draft => ({
  team: "",
  responsible: "",
  phone: "",
  email: "",
  method: "ecos",
  members: [{ name: "", document: "" }],
  accepted: false,
  idempotency: crypto.randomUUID(),
  website: "",
});
export default function App() {
  const [route, setRoute] = useState(location.hash);
  const [settings, setSettings] = useState<Settings>(initialSettings);
  const [loadError, setLoadError] = useState("");
  const [menu, setMenu] = useState(false);
  useEffect(() => {
    const fn = () => {
      setRoute(location.hash);
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", fn);
    return () => window.removeEventListener("hashchange", fn);
  }, []);
  useEffect(() => {
    if (configured)
      api<Settings>("settings")
        .then(setSettings)
        .catch((e) => setLoadError(e.message));
  }, []);
  const admin =
    route.startsWith("#/admin") ||
    new URLSearchParams(location.search).has("recovery");
  return (
    <>
      <header className="header">
        <a className="brand" href="#/" aria-label="Camino al Limite, inicio">
          <Mountain size={31} />
          <span>
            CAMINO
            <span className="brand-bottom">
              AL LIMITE<span className="brand-dot">.</span>
            </span>
          </span>
        </a>
        <nav className={menu ? "nav expanded" : "nav"}>
          <a
            href="#/#experiencia"
            onClick={() =>
              setTimeout(
                () =>
                  document
                    .getElementById("experiencia")
                    ?.scrollIntoView({ behavior: "smooth" }),
                20,
              )
            }
          >
            La experiencia
          </a>
          <a
            href="#/#informacion"
            onClick={() =>
              setTimeout(
                () =>
                  document
                    .getElementById("informacion")
                    ?.scrollIntoView({ behavior: "smooth" }),
                20,
              )
            }
          >
            Información
          </a>
          <a className="admin-link" href="#/admin">
            <LockKeyhole size={14} /> Administración
          </a>
        </nav>
        <a className="button small" href="#/inscripcion">
          Sumá tu equipo <ArrowUpRight size={16} />
        </a>
        <button
          className="menu-button icon"
          aria-label="Abrir menú"
          onClick={() => setMenu(!menu)}
        >
          {menu ? <X /> : <Menu />}
        </button>
      </header>
      {admin ? (
        <Suspense fallback={<main className="form-shell">Cargando administración…</main>}><Admin /></Suspense>
      ) : route.startsWith("#/comprobante/") ? (
        <Receipt token={route.split("/")[2]} />
      ) : route === "#/inscripcion" ? (
        <Registration settings={settings} />
      ) : (
        <main>
          <section className="hero">
            <div className="hero-content">
              <div className="eyebrow">
                <span className="live-dot" /> EMPRENDE CAMINO PRESENTA
              </div>
              <h1>
                Un circuito.
                <br />
                Mil historias.
                <br />
                <em>Tu próximo límite.</em>
              </h1>
              <p className="hero-description">
                5 km para salir de la rutina, compartir en equipo
                <br className="desktop" /> y vivir mucho más que una carrera.
              </p>
              <div className="hero-actions">
                <a className="button lime" href="#/inscripcion">
                  Inscribir mi equipo <ArrowUpRight size={19} />
                </a>
                <span>
                  Hasta 4 personas.
                  <br />
                  <strong>Una experiencia para todos.</strong>
                </span>
              </div>
              <div className="hero-footer">
                <span>
                  <Mountain size={18} /> TRAIL · 5 KM
                </span>
                <i />
                <span>
                  <Users size={18} /> EN EQUIPO
                </span>
                <i />
                <span>
                  POR <b>By Manky</b>
                </span>
              </div>
            </div>
            <div
              className="landscape"
              role="img"
              aria-label="Ilustración de un sendero entre cerros verdes al atardecer"
            >
              <div className="sun" />
              <svg viewBox="0 0 760 740" preserveAspectRatio="xMidYMid slice">
                <defs>
                  <linearGradient id="sky" x2="0" y2="1">
                    <stop stopColor="#a6beb1" />
                    <stop offset="1" stopColor="#eadcb0" />
                  </linearGradient>
                  <linearGradient id="hill" x2=".6" y2="1">
                    <stop stopColor="#4c7060" />
                    <stop offset="1" stopColor="#1e4637" />
                  </linearGradient>
                  <linearGradient id="front" x2=".7" y2="1">
                    <stop stopColor="#2f5740" />
                    <stop offset="1" stopColor="#10372c" />
                  </linearGradient>
                </defs>
                <path fill="url(#sky)" d="M0 0h760v740H0z" />
                <circle cx="540" cy="157" r="67" fill="#f4e8b1" />
                <path
                  d="M0 335L110 260l105 50 150-125 120 103 92-63 183 124v391H0z"
                  fill="#7b9580"
                />
                <path
                  d="M0 435l160-132 107 65 112-53 132 97 147-67 102 70v325H0z"
                  fill="url(#hill)"
                />
                <path d="M0 470q181-90 302-13t458-21v304H0z" fill="#64805a" />
                <path
                  d="M0 571q200-200 388-74t372-31v274H0z"
                  fill="url(#front)"
                />
                <path
                  d="M485 381c-120 68 110 71-32 136S196 634 393 740h151c-310-123 2-154 6-226s-164-73-65-133"
                  fill="#d8c594"
                />
                <path
                  d="M0 642q155-68 247-27L145 740H0zM760 523q-95 110-187 105l80 112h107z"
                  fill="#143d2e"
                />
                <g fill="#163c2d">
                  <path d="M96 405l-35 89h70zm-4 35-49 107h99zM660 370l-26 66h52zm0 28-36 82h72zM609 346l-18 54h38z" />
                </g>
                <g transform="translate(422 514) rotate(-9)">
                  <circle cy="-39" r="8" fill="#f6dba6" />
                  <path
                    d="M-4-29l15 25-15 20-8-6 10-16-13-18z"
                    fill="#e8ed8a"
                  />
                  <path
                    d="M3-11l25 18-4 7L2 1m-6 14-10 25-7-3 8-28"
                    fill="#1c302a"
                  />
                  <path
                    d="M-9-23l-15 16-14-8m38-5 13 5 9-9"
                    fill="none"
                    stroke="#efc996"
                    strokeWidth="5"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
              <div className="distance-badge">
                <span>LA DISTANCIA ES SOLO EL COMIENZO</span>
                <strong>
                  5<span>KM</span>
                </strong>
                <span>EL RESTO LO VIVÍS VOS.</span>
              </div>
              <div className="image-caption">
                <span className="live-dot" /> NATURALEZA. EQUIPO. AVENTURA.
              </div>
            </div>
          </section>
          <div className="ticker">
            <span>MUCHO MÁS QUE CORRER</span>
            <Sparkles size={17} />
            <span>MEDALLA PARA TODOS</span>
            <Sparkles size={17} />
            <span>VENÍ CON TU EQUIPO</span>
            <Sparkles size={17} />
            <span>VIVÍ EMPRENDE CAMINO</span>
            <Sparkles size={17} />
          </div>
          <section className="section" id="experiencia">
            <div className="section-heading">
              <div>
                <div className="eyebrow green">EL PLAN ES VIVIRLO</div>
                <h2>
                  Cada kilómetro,
                  <br />
                  <span>algo para recordar.</span>
                </h2>
              </div>
              <p>
                No hace falta ser experto. Traé las ganas,
                <br />
                tu equipo y esa energía que te hace único.
              </p>
            </div>
            <div className="experience-grid">
              {[
                [
                  Medal,
                  "01",
                  "Una meta, una medalla",
                  "Medalla finisher para todos los participantes. Tu esfuerzo se lleva un recuerdo.",
                ],
                [
                  Sparkles,
                  "02",
                  "Sorpresas en el camino",
                  "Sorteos y muchas experiencias en un solo circuito.",
                ],
                [
                  Shirt,
                  "03",
                  "Que se note tu estilo",
                  "Premio a la vestimenta más alocada. ¡Animate a salir de lo común!",
                ],
              ].map(([Icon, n, title, text]) => (
                <article className="experience-card" key={String(n)}>
                  <div className="card-top">
                    {typeof Icon !== "string" && <Icon size={29} />}
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(text)}</p>
                </article>
              ))}
            </div>
          </section>
          <section className="info-section" id="informacion">
            <div>
              <div className="eyebrow green">NOS ENCONTRAMOS EN EL CAMINO</div>
              <h2>
                Tu equipo.
                <br />
                Nuestro punto de partida.
              </h2>
              <div className="event-facts">
                <p>
                  <CalendarDays />
                  <span>
                    FECHA Y HORA
                    <strong>
                      {settings.date
                        ? `${settings.date} ${settings.time}`
                        : "Próximamente"}
                    </strong>
                  </span>
                </p>
                <p>
                  <MapPin />
                  <span>
                    LARGADA
                    <strong>{settings.location || "Próximamente"}</strong>
                  </span>
                </p>
                <p>
                  <Flag />
                  <span>
                    EN EL MARCO DE<strong>Feria Emprende Camino</strong>
                  </span>
                </p>
              </div>
              {settings.contact && <p>Consultas: {settings.contact}</p>}
              {settings.deadline && (
                <p>Inscripciones hasta: {settings.deadline}</p>
              )}
            </div>
            <div className="price-card">
              <span className="pill">UNA INSCRIPCIÓN. TODO EL EQUIPO.</span>
              <div className="price">
                $1200<span>UYU / equipo</span>
              </div>
              <p>De {settings.min_members} a 4 personas · Trail de 5 km</p>
              <hr />
              <p>
                <Check size={18} /> Medalla finisher para cada integrante
              </p>
              <p>
                <Check size={18} /> Sorteos y experiencias
              </p>
              <p>
                <Check size={18} /> Premio a la vestimenta más alocada
              </p>
              <a className="button lime full" href="#/inscripcion">
                Quiero ser parte <ArrowUpRight size={19} />
              </a>
              <small>Pago presencial o transferencia bancaria</small>
            </div>
          </section>
          {loadError && (
            <div className="notice error" role="alert">
              No pudimos consultar el evento: {loadError}
            </div>
          )}
          <section className="payment-section">
            <h3>Elegí cómo abonar</h3>
            <div>
              <p>
                <strong>En persona</strong>Ecos Regionales o Sociedad de Fomento
                Rural de Flores.
              </p>
              <p>
                <strong>Transferencia BROU · Cuenta corriente</strong>001400338
                - 00004 · Ana Prat{" "}
                <button
                  className="text-button"
                  onClick={() =>
                    navigator.clipboard
                      .writeText("00140033800004")
                      .then(() => alert("Número de cuenta copiado"))
                      .catch(() =>
                        alert("Copiá este número: 001400338 - 00004"),
                      )
                  }
                >
                  <Copy size={14} /> Copiar cuenta
                </button>
              </p>
            </div>
          </section>
        </main>
      )}
      <footer>
        <a className="brand" href="#/">
          <Mountain size={26} />
          <span>
            CAMINO<span className="brand-bottom">AL LIMITE.</span>
          </span>
        </a>
        <p>5 km. Muchas experiencias en un solo circuito.</p>
        <span>
          Una experiencia de <strong>By Manky</strong>
          <br />
          En el marco de Emprende Camino
        </span>
      </footer>
    </>
  );
}
function Registration({ settings }: { settings: Settings }) {
  const [d, setD] = useState<Draft>(newDraft);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [done, setDone] = useState<{
    team: Team;
    token: string;
    warning?: string;
  } | null>(null);
  const change = (key: keyof Draft, value: unknown) =>
    setD((p) => ({ ...p, [key]: value }));
  async function submit(e: FormEvent) {
    e.preventDefault();
    setError("");
    if (step < 2) {
      const form = e.currentTarget as HTMLFormElement;
      if (!form.reportValidity()) return;
      if (step === 1 && d.members.length < settings.min_members) {
        setError(`Agregá al menos ${settings.min_members} integrantes.`);
        return;
      }
      setError("");
      setStep(step + 1);
      return;
    }
    const validation = registrationSchema.safeParse(d);
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      let attachment = null;
      if (file) {
        if (file.size > 5 * 1024 * 1024)
          throw new Error("El archivo debe pesar menos de 5 MB");
        attachment = {
          name: file.name,
          type: file.type,
          data: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result).split(",")[1]);
            reader.onerror = reject;
            reader.readAsDataURL(file);
          }),
        };
      }
      const result = await api("register", { ...d, attachment });
      setDone(result);
      window.scrollTo(0, 0);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  if (done)
    return (
      <main className="form-shell">
        <div className="success-mark">
          <Check size={36} />
        </div>
        <div className="eyebrow green">YA SON PARTE DEL CAMINO</div>
        <h1>Tu equipo quedó inscripto.</h1>
        <p>
          {done.team.team} · Código {done.team.code}
        </p>
        {done.warning && (
          <div className="notice error" role="alert">
            {done.warning}
          </div>
        )}
        <div className="notice">
          Tu pago está{" "}
          {done.team.payment === "en_revision"
            ? "en revisión"
            : "pendiente de verificación"}
          . Guardá el comprobante y el enlace privado.
        </div>
        <button
          className="button"
          onClick={() =>
            receiptPdf(done.team, done.token).catch((e) => setError(e.message))
          }
        >
          <Download size={18} /> Descargar comprobante PDF
        </button>
        <p>
          <a href={receiptLink(done.token)}>Abrir mi enlace privado</a>
        </p>
        <small>
          Quien tenga este enlace podrá ver el comprobante. No lo publiques.
        </small>
        {error && <p role="alert">{error}</p>}
      </main>
    );
  return (
    <main className="form-shell">
      <a className="back" href="#/">
        <ChevronLeft size={16} /> Volver al inicio
      </a>
      <div className="eyebrow green">TU PRÓXIMA HISTORIA EMPIEZA ACÁ</div>
      <h1>Sumá tu equipo.</h1>
      <p>Hasta 4 personas. Un circuito. Muchas experiencias.</p>
      <div className="steps">
        {["Tu equipo", "Integrantes", "Confirmación"].map((s, i) => (
          <span
            key={s}
            className={i === step ? "current" : i < step ? "complete" : ""}
          >
            <b>{i < step ? <Check size={14} /> : i + 1}</b>
            {s}
          </span>
        ))}
      </div>
      {!configured && (
        <div className="notice">
          La organización está preparando las inscripciones. Podés recorrer el
          formulario; todavía no se enviarán datos.
        </div>
      )}
      {configured && !settings.open && (
        <div className="notice">
          Las inscripciones están cerradas por el momento.
        </div>
      )}
      <form onSubmit={submit}>
        {step === 0 && (
          <>
            <h2>Contanos quiénes son</h2>
            <label>
              Nombre del equipo
              <input
                required
                minLength={2}
                maxLength={80}
                value={d.team}
                onChange={(e) => change("team", e.target.value)}
                placeholder="Ese nombre que los representa"
              />
            </label>
            <label>
              Nombre y apellido del responsable
              <input
                required
                minLength={3}
                maxLength={100}
                autoComplete="name"
                value={d.responsible}
                onChange={(e) => change("responsible", e.target.value)}
              />
            </label>
            <div className="field-grid">
              <label>
                Teléfono
                <input
                  required
                  minLength={7}
                  maxLength={30}
                  type="tel"
                  autoComplete="tel"
                  value={d.phone}
                  onChange={(e) => change("phone", e.target.value)}
                  placeholder="Tu número de contacto"
                />
              </label>
              <label>
                Correo electrónico
                <input
                  required
                  type="email"
                  maxLength={150}
                  autoComplete="email"
                  value={d.email}
                  onChange={(e) => change("email", e.target.value)}
                />
              </label>
            </div>
            <label className="honey" aria-hidden="true">
              Sitio web
              <input
                tabIndex={-1}
                autoComplete="off"
                value={d.website}
                onChange={(e) => change("website", e.target.value)}
              />
            </label>
            <p className="muted">
              El responsable será el contacto de la organización para este
              equipo.
            </p>
          </>
        )}
        {step === 1 && (
          <>
            <h2>El camino se comparte</h2>
            <p>Agregá de {settings.min_members} a 4 integrantes.</p>
            {d.members.map((m, i) => (
              <fieldset key={i}>
                <legend>Integrante {i + 1}</legend>
                {i === 0 && (
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change(
                        "members",
                        d.members.map((x, j) =>
                          j === 0 ? { ...x, name: d.responsible } : x,
                        ),
                      )
                    }
                  >
                    Usar nombre del responsable
                  </button>
                )}
                <div className="field-grid">
                  <label>
                    Nombre y apellido
                    <input
                      required
                      minLength={3}
                      maxLength={100}
                      value={m.name}
                      onChange={(e) =>
                        change(
                          "members",
                          d.members.map((x, j) =>
                            j === i ? { ...x, name: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                  <label>
                    Documento de identidad
                    <input
                      required
                      minLength={5}
                      maxLength={30}
                      value={m.document}
                      onChange={(e) =>
                        change(
                          "members",
                          d.members.map((x, j) =>
                            j === i ? { ...x, document: e.target.value } : x,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                {d.members.length > settings.min_members && (
                  <button
                    type="button"
                    className="text-button danger"
                    onClick={() =>
                      change(
                        "members",
                        d.members.filter((_, j) => j !== i),
                      )
                    }
                  >
                    <Trash2 size={14} /> Quitar integrante
                  </button>
                )}
              </fieldset>
            ))}
            {d.members.length < 4 && (
              <button
                className="button outline"
                type="button"
                onClick={() =>
                  change("members", [...d.members, { name: "", document: "" }])
                }
              >
                <Plus size={16} /> Agregar integrante
              </button>
            )}
          </>
        )}
        {step === 2 && (
          <>
            <h2>Todo listo para la aventura</h2>
            <div className="summary">
              <h3>{d.team}</h3>
              <p>
                {d.responsible} · {d.phone}
                <br />
                {d.email}
              </p>
              {d.members.map((m, i) => (
                <p key={i}>
                  {i + 1}. {m.name} · {m.document}
                </p>
              ))}
              <hr />
              <strong>Total por equipo: $1200 UYU</strong>
            </div>
            <label>
              ¿Cómo van a abonar?
              <select
                value={d.method}
                onChange={(e) => {
                  change("method", e.target.value);
                  setFile(null);
                }}
              >
                {Object.entries(methods).map(([k, v]) => (
                  <option value={k} key={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            {d.method === "transferencia" ? (
              <div className="notice">
                <strong>BROU · Cuenta corriente</strong>
                <p>
                  001400338 - 00004
                  <br />A nombre de Ana Prat
                </p>
                <label>
                  Adjuntar comprobante (opcional · hasta 5 MB)
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
                <small>El archivo será revisado por la organización.</small>
              </div>
            ) : (
              <p>
                Aboná $1200 por equipo en{" "}
                {d.method === "ecos"
                  ? "Ecos Regionales"
                  : "Sociedad de Fomento Rural de Flores"}
                .
              </p>
            )}
            {settings.rules && (
              <details>
                <summary>Leer el reglamento</summary>
                <p className="prewrap">{settings.rules}</p>
              </details>
            )}
            {settings.privacy && (
              <details>
                <summary>Leer el aviso de privacidad</summary>
                <p className="prewrap">{settings.privacy}</p>
              </details>
            )}
            <label className="checkbox">
              <input
                type="checkbox"
                required
                checked={d.accepted}
                onChange={(e) => change("accepted", e.target.checked)}
              />{" "}
              Leí y acepto el reglamento y el aviso de privacidad.
            </label>
            {(!settings.rules || !settings.privacy) && (
              <p className="notice">
                La organización debe publicar el reglamento y el aviso de
                privacidad antes de habilitar la inscripción.
              </p>
            )}
          </>
        )}
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}
        <div className="form-actions">
          {step > 0 && (
            <button
              type="button"
              className="button outline"
              disabled={busy}
              onClick={() => {
                setStep(step - 1);
                setError("");
              }}
            >
              <ChevronLeft size={16} /> Atrás
            </button>
          )}
          <button
            className="button"
            disabled={
              busy ||
              (step === 2 &&
                (!configured ||
                  !settings.open ||
                  !settings.rules ||
                  !settings.privacy))
            }
            type="submit"
          >
            {busy
              ? "Enviando inscripción…"
              : step === 2
                ? "Confirmar inscripción"
                : "Continuar"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </main>
  );
}
function Receipt({ token }: { token: string }) {
  const [data, setData] = useState<Team | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api<Team>("receipt", { token })
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);
  return (
    <main className="form-shell">
      <div className="eyebrow green">COMPROBANTE PRIVADO</div>
      <h1>{data ? data.team : "Tu inscripción"}</h1>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : data ? (
        <>
          <p>
            Código: {data.code} · {data.members.length} integrantes
          </p>
          <p>
            Inscripción {data.status} · Pago {data.payment.replace("_", " ")}
          </p>
          <button
            className="button"
            onClick={() =>
              receiptPdf(data, token).catch((e) => setError(e.message))
            }
          >
            <Download size={18} /> Descargar PDF
          </button>
        </>
      ) : (
        <p role="status">Consultando inscripción…</p>
      )}
    </main>
  );
}
