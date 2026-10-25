import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const configured = Boolean(url && key);
export const supabase = configured ? createClient(url, key) : null;
export async function api<T = any>(
  action: string,
  payload: Record<string, unknown> = {},
): Promise<T> {
  if (!supabase)
    throw new Error(
      "Las inscripciones todavía no están habilitadas. Falta conectar la organización con Supabase.",
    );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const response = await fetch(`${url}/functions/v1/trail-api`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  const result = await response
    .json()
    .catch(() => ({
      error: "No se pudo interpretar la respuesta. Intentá nuevamente.",
    }));
  if (!response.ok)
    throw new Error(result.error || "No se pudo completar la operación");
  return result;
}
