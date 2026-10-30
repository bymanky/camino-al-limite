import { useState, type FormEvent } from "react";
import { supabase } from "./api";
export default function OwnPassword() {
  const [password, setPassword] = useState(""),
    [confirmation, setConfirmation] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setError("");
    setNotice("");
    if (password !== confirmation) {
      setError("Las contraseñas no coinciden.");
      return;
    }
    if (new TextEncoder().encode(password).length > 72) {
      setError("La contraseña es demasiado larga. Acortala y reintentá.");
      return;
    }
    setBusy(true);
    try {
      const result = await supabase!.auth.updateUser({ password });
      if (result.error) throw result.error;
      setNotice(
        "Tu contraseña se actualizó. Usala la próxima vez que ingreses.",
      );
    } catch {
      setError(
        "No pudimos cambiar la contraseña. Volvé a iniciar sesión y reintentá.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }
  return (
    <section className="admin-panel">
      <h2>Mi contraseña</h2>
      <p>Actualizá únicamente la contraseña de tu propia cuenta.</p>
      <form onSubmit={save}>
        <div className="field-grid">
          <label>
            Nueva contraseña
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
            <small>Mínimo 12 caracteres.</small>
          </label>
          <label>
            Repetir nueva contraseña
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
        <button className="button" disabled={busy}>
          {busy ? "Guardando…" : "Cambiar mi contraseña"}
        </button>
      </form>
    </section>
  );
}
