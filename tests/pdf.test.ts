import { it, expect, vi, afterAll } from "vitest";
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
const captured = vi.hoisted(() => ({ documents: [] as any[] }));
vi.mock("jspdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf")>();
  return {
    ...original,
    jsPDF: function (options: any) {
      const doc = new original.jsPDF(options);
      const text = doc.text.bind(doc);
      const texts: string[] = [];
      Object.defineProperty(doc, "qaTexts", { value: texts });
      doc.text = ((...args: any[]) => {
        texts.push(...(Array.isArray(args[0]) ? args[0] : [args[0]]));
        return (text as any)(...args);
      }) as typeof doc.text;
      Object.defineProperty(doc, "save", {
        value: function () {
          captured.documents.push(doc);
          return doc;
        },
      });
      return doc;
    },
  };
});
import { receiptPdf, rosterPdf } from "../src/pdf";
import type { Team } from "../src/model";
const team: Team = {
  id: "test",
  code: "CAL-PRUEBA",
  team: "Equipo de prueba",
  responsible: "Ana Prueba",
  email: "test@example.com",
  phone: "099123456",
  method: "transferencia",
  amount: 1200,
  payment: "pendiente",
  status: "activa",
  notes: "",
  created_at: "",
  qr: "a".repeat(64),
  members: Array.from({ length: 4 }, (_, i) => ({
    name: `Integrante ${i + 1} de prueba`,
    document: `0000000${i}`,
  })),
};
vi.stubGlobal("location", {
  origin: "https://example.com",
  pathname: "/camino-al-limite/",
});
vi.stubGlobal("fetch", async (path: string) => {
  const bytes = readFileSync(
    new URL("../public/" + path.replace(/^\.?\//, ""), import.meta.url),
  );
  return new Response(new Uint8Array(bytes));
});
it(
  "genera un PDF con QR y cuatro integrantes en una página",
  { timeout: 30000 },
  async () => {
    await receiptPdf(team, "b".repeat(64));
    const doc = captured.documents.at(-1);
    expect(doc.getNumberOfPages()).toBe(1);
    const pdf = doc.output();
    const text = doc.qaTexts.join("\n");
    expect(text).toContain("CAL-PRUEBA");
    expect(text).toContain("Integrante 4 de prueba");
    expect(text).toContain("NO acredita el pago");
    expect(text).toContain("$300 UYU por persona");
    expect(text).toContain("Total del equipo: $1200 UYU");
    expect(text).toContain("Patrocina");
    expect(text).toContain("Producido por");
    expect(text).toContain("En el marco de la feria");
    expect(Object.keys(doc.internal.collections.addImage_images)).toHaveLength(
      4,
    );
    expect(pdf).toContain("Atkinson");
    expect(pdf).toContain("/Subtype /Image");
    expect(pdf).toContain(
      "https://example.com/camino-al-limite/#/comprobante/",
    );
    if (process.env.PDF_QA_DIR) {
      mkdirSync(process.env.PDF_QA_DIR, { recursive: true });
      writeFileSync(
        join(process.env.PDF_QA_DIR, "comprobante-prueba.pdf"),
        new Uint8Array(doc.output("arraybuffer")),
      );
    }
  },
);
it(
  "ajusta nombres largos y conserva los logos y el QR en el comprobante",
  { timeout: 30000 },
  async () => {
    await receiptPdf(
      {
        ...team,
        team: "Equipo con nombre extenso ".repeat(3),
        method: "fomento",
        members: team.members.map((m) => ({
          ...m,
          name: "María José Núñez Pérez ".repeat(20),
        })),
      },
      "b".repeat(64),
    );
    const doc = captured.documents.at(-1);
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    expect(doc.qaTexts.filter((t: string) => t === "Patrocina")).toHaveLength(
      doc.getNumberOfPages(),
    );
    expect(doc.qaTexts.join(" ")).not.toContain("Rural");
    if (process.env.PDF_QA_DIR)
      writeFileSync(
        join(process.env.PDF_QA_DIR, "comprobante-largo-prueba.pdf"),
        new Uint8Array(doc.output("arraybuffer")),
      );
  },
);
it("la nómina agrega páginas y conserva todos los participantes", () => {
  rosterPdf(
    Array.from({ length: 30 }, (_, i) => ({ ...team, code: `CAL-${i}` })),
  );
  const doc = captured.documents.at(-1);
  expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  expect(doc.output()).toContain("CAL-29");
});
afterAll(() => vi.unstubAllGlobals());
