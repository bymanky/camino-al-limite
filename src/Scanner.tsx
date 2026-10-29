import { useEffect, useId, useRef, useState } from "react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { Camera } from "lucide-react";

export function cameraError(error: unknown) {
  const text =
    error instanceof Error ? `${error.name} ${error.message}` : String(error);
  if (/NotAllowed|Permission|denied/i.test(text))
    return "La cámara no tiene permiso. En iPhone, abrí los ajustes del sitio de Safari o los permisos de Chrome en Ajustes y permití la cámara. Luego volvé a tocar Abrir cámara.";
  if (/NotFound|DevicesNotFound/i.test(text))
    return "No encontramos una cámara disponible. Podés leer una foto del QR o ingresar el código manualmente.";
  if (/NotReadable|TrackStart|in use/i.test(text))
    return "La cámara está ocupada. Cerrá otras apps o pestañas que la estén usando y reintentá.";
  return "No pudimos iniciar la cámara. Reintentá, elegí otra cámara o leé una foto del QR. También podés ingresar el código manualmente.";
}
export const qrBox = (width: number, height: number) => {
  const side = Math.max(1, Math.floor(Math.min(width, height) * 0.7));
  return { width: side, height: side };
};

export default function Scanner({
  onRead,
}: {
  onRead: (value: string) => void;
}) {
  const id = `qr-${useId().replace(/:/g, "")}`;
  const scanner = useRef<Html5Qrcode | null>(null);
  const mounted = useRef(false);
  const pending = useRef(false);
  const read = useRef(false);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [cameras, setCameras] = useState<{ id: string; label: string }[]>([]);
  const [camera, setCamera] = useState("");
  async function stop() {
    const instance = scanner.current;
    if (instance?.isScanning) await instance.stop();
    instance?.clear();
    if (mounted.current) setActive(false);
  }
  useEffect(() => {
    mounted.current = true;
    const hide = () => {
      if (document.hidden) void stop().catch(() => {});
    };
    document.addEventListener("visibilitychange", hide);
    return () => {
      mounted.current = false;
      document.removeEventListener("visibilitychange", hide);
      void stop().catch(() => {});
    };
  }, []);
  function instance() {
    return (scanner.current ??= new Html5Qrcode(id, {
      formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
      useBarCodeDetectorIfSupported: false,
      verbose: false,
    }));
  }
  async function start() {
    if (pending.current) return;
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setError(
        "La cámara requiere abrir esta página con HTTPS en Safari o Chrome. Podés usar una foto del QR o el código manual.",
      );
      return;
    }
    pending.current = true;
    setBusy(true);
    setError("");
    read.current = false;
    try {
      const reader = instance();
      let ready = false;
      let early: string | null = null;
      const finish = async (value: string) => {
        await stop();
        if (mounted.current) onRead(value);
      };
      await reader.start(
        camera || { facingMode: "environment" },
        { fps: 8, qrbox: qrBox },
        (value) => {
          if (read.current || !mounted.current) return;
          read.current = true;
          if (!ready) {
            early = value;
            return;
          }
          void finish(value).catch((e) => {
            if (mounted.current) setError(cameraError(e));
          });
        },
        () => {},
      );
      if (!mounted.current || document.hidden) {
        await stop();
        return;
      }
      setActive(true);
      ready = true;
      if (early) {
        await finish(early);
        return;
      }
      // Enumerar sin abrir otro stream: en iOS una segunda captura puede apagar la primera.
      navigator.mediaDevices
        .enumerateDevices()
        .then((list) => {
          if (mounted.current)
            setCameras(
              list
                .filter((d) => d.kind === "videoinput")
                .map((d) => ({ id: d.deviceId, label: d.label })),
            );
        })
        .catch(() => {});
    } catch (e) {
      await stop().catch(() => {});
      if (mounted.current) setError(cameraError(e));
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  async function photo(file?: File) {
    if (!file || pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try {
      await stop();
      const value = await instance().scanFile(file, false);
      if (mounted.current) onRead(value);
    } catch {
      if (mounted.current)
        setError(
          "No encontramos un QR legible en la foto. Usá una imagen nítida, con el QR completo, o ingresá el código manualmente.",
        );
    } finally {
      pending.current = false;
      if (mounted.current) setBusy(false);
    }
  }
  return (
    <div className="scanner-panel">
      <div
        id={id}
        className="qr-reader"
        aria-label="Vista de cámara para leer QR"
      />
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button
        type="button"
        className="button"
        disabled={busy}
        onClick={() =>
          active
            ? void stop().catch((e) => setError(cameraError(e)))
            : void start()
        }
      >
        <Camera size={18} />
        {busy
          ? "Preparando cámara…"
          : active
            ? "Cerrar cámara"
            : "Abrir cámara"}
      </button>
      {cameras.length > 1 && (
        <label>
          Cámara
          <select
            value={camera}
            disabled={busy || active}
            onChange={(e) => setCamera(e.target.value)}
          >
            <option value="">Trasera automática</option>
            {cameras.map((c, i) => (
              <option value={c.id} key={c.id}>
                {c.label || `Cámara ${i + 1}`}
              </option>
            ))}
          </select>
          <small>Cerrá la cámara para cambiarla.</small>
        </label>
      )}
      <label className="qr-photo">
        Leer QR desde una foto
        <input
          type="file"
          accept="image/*"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void photo(file);
          }}
        />
      </label>
      <p className="muted">
        Apuntá al QR completo, con buena luz. La foto se lee en este
        dispositivo; no se sube al servidor.
      </p>
    </div>
  );
}
