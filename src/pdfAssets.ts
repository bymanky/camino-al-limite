import { brandLogos } from "./BrandLogo";
const base = import.meta.env.BASE_URL;
function base64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 32768)
    binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
  return btoa(binary);
}
async function asset(path: string) {
  const response = await fetch(`${base}${path}`);
  if (!response.ok)
    throw new Error(
      "No pudimos cargar los logos o la tipografía del comprobante. Revisá la conexión y reintentá.",
    );
  return base64(await response.arrayBuffer());
}
let cached:
  | Promise<{
      regular: string;
      bold: string;
      logos: { data: string; name: string; role: string }[];
    }>
  | undefined;
export function receiptAssets() {
  return (cached ??= Promise.all([
    asset("fonts/AtkinsonHyperlegible-Regular.ttf"),
    asset("fonts/AtkinsonHyperlegible-Bold.ttf"),
    ...(["emprende", "manky", "fomento"] as const).map((key) =>
      asset("logos/" + brandLogos[key].file),
    ),
  ])
    .then(([regular, bold, ...images]) => ({
      regular,
      bold,
      logos: images.map((data, i) => ({
        data: "data:image/png;base64," + data,
        name: ["Emprende Camino", "By Manky", "Sociedad de Fomento de Flores"][
          i
        ],
        role: ["En el marco de la feria", "Producido por", "Patrocina"][i],
      })),
    }))
    .catch((error) => {
      cached = undefined;
      throw error;
    }));
}
