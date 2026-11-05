import { useEffect, useRef, useState, lazy, Suspense, type FormEvent } from "react";
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
  Share2,
} from "lucide-react";
import { api, configured } from "./api";
import {
  initialSettings,
  TEAM_SIZE,
  methods,
  money,
  registrationSchema,
  type Draft,
  type Settings,
  type Team,
} from "./model";
import { receiptPdf, receiptLink } from "./downloads";
import { BrandLogo } from "./BrandLogo";
import { downloadRegistrationFile, readRegistrationFile } from "./registrationFiles";
const Admin = lazy(() => import("./Admin"));
const newDraft = (): Draft => ({
  team: "",
  responsible: "",
  phone: "",
  email: "",
  method: "ecos",
  members: Array.from({ length: TEAM_SIZE }, () => ({
    name: "",
    document: "",
  })),
  accepted: false,
  idempotency: crypto.randomUUID(),
  website: "",
});
const eventDateFormat = new Intl.DateTimeFormat("es-UY", {
  weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC",
});
function eventDateLabel(value: string) {
  const day = value.slice(0, 10);
  const date = new Date(day + "T00:00:00Z");
  return Number.isNaN(date.getTime()) ? "Próximamente" : eventDateFormat.format(date);
}

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
  const recoveringReceipt = route === "#/recuperar-comprobante";
  const showFloatingRegistration = !admin && !recoveringReceipt && route !== "#/inscripcion" && !route.startsWith("#/comprobante/");
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
          <a href="#/recuperar-comprobante">Recuperar comprobante</a>
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
        <Suspense
          fallback={
            <main className="form-shell">Cargando administración…</main>
          }
        >
          <Admin />
        </Suspense>
      ) : recoveringReceipt ? (
        <ReceiptRecovery contact={settings.contact} />
      ) : route.startsWith("#/comprobante/") ? (
        <Receipt token={route.split("/")[2]} />
      ) : route === "#/inscripcion" ? (
        <Registration settings={settings} />
      ) : (
        <main>
          <section className="hero hero-cover">
            <div className="hero-content">
              <div className="eyebrow">
                <span className="live-dot" /> EMPRENDE CAMINO PRESENTA
              </div>
              <h1>
                Armá tu equipo.
                <br />
                <em>Animate a la aventura.</em>
              </h1>
              <p className="hero-description">
                5 km con obstáculos y polvos de colores para desafiarse
                <br className="desktop" /> y divertirse en equipos de cuatro personas.
              </p>
              <div className="hero-actions">
                <a className="button lime" href="#/inscripcion">
                  Inscribir mi equipo <ArrowUpRight size={19} />
                </a>
                <span>
                  Equipos de 4 personas. Cupos limitados.
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
                  PRODUCE{" "}
                  <span className="production-logos"><BrandLogo brand="manky" className="hero-producer-logo" /><BrandLogo brand="miyiton" className="hero-producer-logo" /></span>
                </span>
              </div>
            </div>
            <figure className="hero-cover-artwork">
              <img src="./portada-camino-al-limite.jpeg" alt="Camino al Limite: armá tu equipo y animate a la aventura. Cuatro participantes recorren un sendero al atardecer. Colaboran Cintepa y Óptica Florida." width="1440" height="1080" fetchPriority="high" decoding="async" />
            </figure>
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
          <section
            className="event-brands"
            aria-label="Feria, producción y patrocinio"
          >
            <div className="event-brand">
              <span>En el marco de la feria</span>
              <BrandLogo brand="emprende" />
            </div>
            <div className="event-brand">
              <span>Producido por</span>
              <div className="production-logos"><BrandLogo brand="manky" /><BrandLogo brand="miyiton" /></div>
            </div>
            <div className="event-brand">
              <span>Patrocina</span>
              <BrandLogo brand="fomento" />
            </div>
          </section>
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
                  "Obstáculos y colores",
                  "Un trail con obstáculos y polvos de colores para desafiarse y divertirse. Sorteos y muchas experiencias en un solo circuito.",
                ],
                [
                  Shirt,
                  "03",
                  "Que se note tu estilo",
                  "Premios para la vestimenta más divertida del equipo. ¡Animate a salir de lo común!",
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
          <section className="section race-tips" aria-labelledby="race-tips-title">
            <div className="eyebrow green">GUÍA DEL EQUIPO</div>
            <h2 id="race-tips-title">Antes y después del trail</h2>
            <p>Tocá cada consejo para preparar la salida y disfrutar la llegada.</p>
            <div className="race-tips-grid">
              {[
                {
                  title: "Antes de largar",
                  icon: Mountain,
                  tips: [
                    ["Dejá pronto tu equipo", "Prepará el calzado que ya usás, ropa cómoda que pueda mancharse y una botella de agua. Llevá tu cédula física."],
                    ["Acordá el punto de encuentro", "Confirmá el lugar y la hora de largada con los cuatro integrantes. Lleguen con margen para acreditarse y guardar sus cosas."],
                    ["Arranquen juntos", "Acuerden un ritmo que todos puedan seguir y escuchen las indicaciones de la organización antes de entrar al circuito."],
                  ],
                },
                {
                  title: "Después de cruzar la meta",
                  icon: Medal,
                  tips: [
                    ["Bajá el ritmo", "Caminá un rato, tomá agua y buscá un lugar tranquilo para descansar con tu equipo."],
                    ["Llevá una muda", "Una camiseta y medias de repuesto te ayudan a seguir disfrutando la feria después del barro y los colores."],
                    ["Celebren la llegada", "Reúnan al equipo, disfruten su medalla finisher y saquen la foto del recuerdo. Consulten en el lugar por los sorteos y premios."],
                  ],
                },
              ].map(({ title, icon: Icon, tips }) => (
                <article className="race-tips-card" key={title}>
                  <h3><Icon size={24} aria-hidden="true" />{title}</h3>
                  {tips.map(([label, detail]) => (
                    <details key={label}>
                      <summary>{label}<span aria-hidden="true">+</span></summary>
                      <p>{detail}</p>
                    </details>
                  ))}
                </article>
              ))}
            </div>
          </section>
          <section className="section event-prizes" aria-labelledby="premios-title">
            <div className="eyebrow green">ARMÁ TU EQUIPO Y ANIMATE A LA AVENTURA</div>
            <h2 id="premios-title">Más motivos para vivirlo juntos.</h2>
            <p>Además de los premios a la vestimenta más divertida del equipo:</p>
            <div className="prize-grid">
              <article><span>Premio Cintepa</span><strong>$6.500</strong><p>Para un equipo.</p></article>
              <article><span>Premio Óptica Florida</span><strong>$4.500</strong><p>Para otro equipo.</p></article>
            </div>
            <p className="registration-announcement"><strong>Inscripciones desde el 4 de noviembre</strong> por esta web, en oficinas de Sociedad de Fomento de Flores o en Ecos Regionales.</p>
            <p>Nos encontramos el <strong>12 de diciembre</strong>, en el marco de <strong>Emprende Camino</strong>.</p>
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
                        ? `${eventDateLabel(settings.date)}${settings.time ? " · " + settings.time.slice(0, 5) + " h" : ""}`
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
              <a className="text-button" href="#/recuperar-comprobante">
                <Download size={16} aria-hidden="true" /> Recuperar comprobante de inscripción
              </a>
              {settings.deadline && (
                <div className="registration-deadline">
                  <CalendarDays size={24} aria-hidden="true" />
                  <div>
                    <span>Inscripciones hasta</span>
                    <time dateTime={settings.deadline + "-03:00"}>
                      <strong>{eventDateLabel(settings.deadline)}</strong>
                      <small>{settings.deadline.slice(11, 16)} h · hora de Uruguay</small>
                    </time>
                  </div>
                </div>
              )}
            </div>
            <div className="price-card">
              <span className="pill">UNA INSCRIPCIÓN. TODO EL EQUIPO.</span>
              <div className="price">
                $350<span>UYU / persona</span>
              </div>
              <p>4 integrantes por equipo · Total: $1400 UYU</p>
              <p>
                <strong>Cupos limitados</strong> · Trail de 5 km
              </p>
              <hr />
              <p>
                <Check size={18} /> Medalla finisher para cada integrante
              </p>
              <p>
                <Check size={18} /> Sorteos y experiencias
              </p>
              <p>
                <Check size={18} /> Premio a la vestimenta más divertida del equipo
              </p>
              <div className="registration-entry">
                <a className="button lime full registration-cta" href="#/inscripcion" aria-describedby="registration-steps">
                  Quiero ser parte <ArrowRight size={19} aria-hidden="true" />
                </a>
                <small id="registration-steps">Inscribí a tu equipo en 3 pasos</small>
                <small>Pago presencial o transferencia bancaria</small>
              </div>
            </div>
          </section>
          <section className="section collaborators" aria-labelledby="colaboradores-title">
            <div className="eyebrow green">NOS ACOMPAÑAN</div>
            <h2 id="colaboradores-title">Colaboran</h2>
            <p>Cintepa · Tu Cooperativa y Óptica Florida.</p>
            <div className="collaborators-artwork">
              <img src="./placa-camino-al-limite.jpeg" alt="Logos originales de los colaboradores Cintepa, Tu Cooperativa, y Óptica Florida" width="1280" height="1600" loading="lazy" />
            </div>
            <a className="poster-link" href="./placa-camino-al-limite.jpeg" target="_blank" rel="noopener noreferrer">Ver la placa oficial completa <ArrowUpRight size={16} /></a>
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
                de Flores.
                <BrandLogo brand="fomento" className="payment-logo" />
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
      <footer className={showFloatingRegistration ? "with-floating-registration" : undefined}>
        <a className="brand" href="#/">
          <Mountain size={26} />
          <span>
            CAMINO<span className="brand-bottom">AL LIMITE.</span>
          </span>
        </a>
        <p>5 km. Muchas experiencias en un solo circuito.</p>
        <div className="footer-brands">
          <div>
            <span>Producido por</span>
            <div className="production-logos"><BrandLogo brand="manky" /><BrandLogo brand="miyiton" /></div>
          </div>
          <div>
            <span>En el marco de</span>
            <BrandLogo brand="emprende" />
          </div>
        </div>
        <div className="site-credit">
          <span>Un sitio de MIYITON</span>
          <img src={`${import.meta.env.BASE_URL}logos/miyiton-transparent.png`} alt="MIYITON" width="46" height="40" loading="lazy" decoding="async" />
        </div>
      </footer>
      {!admin && !route.startsWith("#/comprobante/") && (
        <a
          className={showFloatingRegistration ? "whatsapp-float above-registration" : "whatsapp-float"}
          href={`https://wa.me/?text=${encodeURIComponent("🏃 Camino al Limite · Trail 5K\nArmá tu equipo de 4 y animate a los obstáculos, los polvos de colores y los premios. ¡Cupos limitados!\n\nhttps://caminoallimite.com/")}`}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Compartir Camino al Limite por WhatsApp"
        >
          <Share2 size={19} aria-hidden="true" /> Compartir por WhatsApp
        </a>
      )}
      {showFloatingRegistration && (
        <aside className="floating-registration" aria-label="Inscribí tu equipo">
          <div><strong>¡Sumá tu equipo!</strong><span>4 integrantes · $350 por persona</span></div>
          <a className="button lime registration-cta" href="#/inscripcion">Quiero ser parte <ArrowUpRight size={19} aria-hidden="true" /></a>
        </aside>
      )}
    </>
  );
}
function Registration({ settings }: { settings: Settings }) {
  const [d, setD] = useState<Draft>(newDraft);
  const [step, setStep] = useState(0);
  const registrationHeading = useRef<HTMLHeadingElement>(null);
  const registrationSteps = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (step === 0) registrationHeading.current?.focus();
    else registrationSteps.current?.focus();
  }, [step]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [health, setHealth] = useState(() => Array.from({ length: TEAM_SIZE }, () => ({
    file: null as File | null,
    expires_on: "",
  })));
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [acceptWaiver, setAcceptWaiver] = useState(false);
  const hasRules = Boolean(settings.rules.trim() || settings.rules_pdf_id);
  const requiresHealth = settings.requirements_enabled === true;
  function changeHealth(index: number, patch: Partial<(typeof health)[number]>) {
    setHealth((previous) => previous.map((value, i) => i === index ? { ...value, ...patch } : value));
  }
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
      if (step === 1 && d.members.length !== TEAM_SIZE) {
        setError("El equipo debe tener exactamente 4 integrantes.");
        return;
      }
      if (step === 1 && requiresHealth && health.some((item) => !item.file || !item.expires_on || item.expires_on < settings.date)) {
        setError("Cargá un documento de salud vigente el día de la carrera y su vencimiento para cada integrante.");
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
      const attachment = file ? await readRegistrationFile(file, 5242880) : null;
      const healthFiles = requiresHealth ? await Promise.all(health.map(async (item) => {
        if (!item.file) throw new Error("Falta el documento de salud de un integrante.");
        return { expires_on: item.expires_on, file: await readRegistrationFile(item.file, 1048576) };
      })) : undefined;
      const result = await api("register", {
        ...d, attachment, health: healthFiles,
        ...(requiresHealth ? { accept_terms: acceptTerms, accept_waiver: acceptWaiver } : {}),
        ...(requiresHealth || settings.rules_pdf_id ? { requirements_revision: settings.requirements_revision } : {}),
      });
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
            <br />
            <button
              className="text-button"
              onClick={() => {
                setDone(null);
                setStep(2);
              }}
            >
              Reintentar adjuntar sin duplicar la inscripción
            </button>
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
      <h1 ref={registrationHeading} tabIndex={-1}>Sumá tu equipo.</h1>
      <p>4 integrantes por equipo · $350 UYU por persona. Cupos limitados.</p>
      <p className="notice">El día de la carrera, cada integrante deberá presentar su cédula de identidad física.</p>
      <div className="steps" ref={registrationSteps} tabIndex={-1} aria-label={`Paso ${step + 1} de 3`}>
        {["Tu equipo", "Integrantes", "Confirmación"].map((s, i) => (
          <span
            key={s}
            aria-current={i === step ? "step" : undefined}
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
            <p>
              Completá los datos de las 4 personas del equipo. Todos los
              integrantes son obligatorios.
            </p>
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
                {requiresHealth && (
                  <div className="field-grid">
                    <label>
                      Carné de salud o certificado de aptitud física
                      <input type="file" accept="application/pdf,image/jpeg,image/png"
                        required={!health[i].file}
                        onChange={(e) => changeHealth(i, { file: e.target.files?.[0] ?? null })}
                      />
                      <small>{health[i].file?.name || "PDF, JPG o PNG · hasta 1 MB"}</small>
                    </label>
                    <label>
                      Fecha de vencimiento
                      <input type="date" required min={settings.date || undefined}
                        value={health[i].expires_on}
                        onChange={(e) => changeHealth(i, { expires_on: e.target.value })}
                      />
                    </label>
                  </div>
                )}
              </fieldset>
            ))}
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
              <strong>
                $350 UYU por persona · 4 integrantes · Total por equipo: $1400
                UYU
              </strong>
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
                Aboná $350 por persona ($1400 por equipo) en{" "}
                {d.method === "ecos"
                  ? "Ecos Regionales"
                  : "Sociedad de Fomento de Flores"}
                .
              </p>
            )}
            {settings.rules && (
              <details>
                <summary>Leer el reglamento</summary>
                <p className="prewrap">{settings.rules}</p>
              </details>
            )}
            {settings.rules_pdf_id && (
              <button type="button" className="button outline" onClick={async () => {
                try {
                  const { data } = await api("rules-pdf", { id: settings.rules_pdf_id });
                  downloadRegistrationFile(data, "application/pdf", "reglamento-camino-al-limite.pdf");
                } catch (e) { setError((e as Error).message); }
              }}>Descargar reglamento en PDF</button>
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
            {requiresHealth && (
              <>
                <details><summary>Leer los términos y condiciones</summary><p className="prewrap">{settings.terms}</p></details>
                <label className="checkbox"><input type="checkbox" required checked={acceptTerms}
                  onChange={(e) => setAcceptTerms(e.target.checked)} /> Leí y acepto los términos y condiciones.</label>
                {settings.waiver && (
                  <details><summary>Leer el deslinde de responsabilidad</summary><p className="prewrap">{settings.waiver}</p></details>
                )}
                {settings.waiver_file_id && (
                  <button type="button" className="button outline" onClick={async () => {
                    try {
                      const { data, mime } = await api("waiver-file", { id: settings.waiver_file_id });
                      const extension = mime === "application/pdf" ? "pdf" : mime === "image/jpeg" ? "jpg" : "png";
                      downloadRegistrationFile(data, mime, "deslinde-camino-al-limite." + extension);
                    } catch (e) { setError((e as Error).message); }
                  }}>Descargar deslinde de responsabilidad</button>
                )}
                <label className="checkbox"><input type="checkbox" required checked={acceptWaiver}
                  onChange={(e) => setAcceptWaiver(e.target.checked)} /> Leí y acepto el deslinde de responsabilidad.</label>
              </>
            )}
            {(!hasRules || !settings.privacy) && (
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
                  !hasRules ||
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
function ReceiptRecovery({ contact }: { contact: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const contactDigits = contact.replace(/\D/g, "");
  const whatsappNumber = /^0\d{8}$/.test(contactDigits)
    ? "598" + contactDigits.slice(1)
    : /^598\d{8}$/.test(contactDigits) ? contactDigits : "";
  async function recover(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const fields = new FormData(event.currentTarget);
    setError("");
    setBusy(true);
    try {
      const { token } = await api<{ token: string }>("receipt-recovery", {
        code: String(fields.get("code") ?? "").trim(),
        email: String(fields.get("email") ?? "").trim(),
      });
      location.replace(receiptLink(token));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="form-shell">
      <div className="eyebrow green">INSCRIPCIÓN DEL EQUIPO</div>
      <h1>Recuperar comprobante</h1>
      <p>Ingresá el código de inscripción y el correo que usó la persona responsable del equipo.</p>
      <form className="admin-panel" onSubmit={recover}>
        <label>
          Código de inscripción
          <input name="code" required placeholder="CAL-…" autoCapitalize="characters"
            autoComplete="off" spellCheck={false} maxLength={19} pattern="[Cc][Aa][Ll]-[0-9a-fA-F]{16}"
            title="Ingresá CAL- seguido de los 16 caracteres del código." />
        </label>
        <label>
          Correo del responsable
          <input name="email" type="email" required autoComplete="email" maxLength={150} />
        </label>
        {error && <p className="notice error" role="alert">{error}</p>}
        <button className="button" type="submit" disabled={busy}>
          {busy ? "Buscando…" : "Buscar mi comprobante"}
        </button>
      </form>
      <p><strong>¿También perdiste el código?</strong> Contactá a la organización con el nombre del equipo{contact ? " al " + contact : ""}.</p>
      {whatsappNumber && (
        <a
          className="button outline"
          href={`https://wa.me/${whatsappNumber}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          Contactar por WhatsApp <ArrowUpRight size={16} aria-hidden="true" />
        </a>
      )}
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
