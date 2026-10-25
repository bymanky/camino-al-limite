import { it, expect, vi, afterAll } from "vitest";
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
const captured = vi.hoisted(() => ({ documents: [] as any[] }));
vi.mock("jspdf", async (importOriginal) => {
  const original = await importOriginal<typeof import("jspdf")>();
  return {
    ...original,
    jsPDF: function (options: any) {
      const doc = new original.jsPDF(options);
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
it("genera un PDF con QR y cuatro integrantes en una página", async () => {
  await receiptPdf(team, "b".repeat(64));
  const doc = captured.documents.at(-1);
  expect(doc.getNumberOfPages()).toBe(1);
  const pdf = doc.output();
  expect(pdf).toContain("CAL-PRUEBA");
  expect(pdf).toContain("Integrante 4 de prueba");
  expect(pdf).toContain("NO acredita el pago");
  expect(pdf).toContain("/Subtype /Image");
  expect(pdf).toContain("https://example.com/camino-al-limite/#/comprobante/");
  if (process.env.PDF_QA_DIR) {
    mkdirSync(process.env.PDF_QA_DIR, { recursive: true });
    writeFileSync(
      join(process.env.PDF_QA_DIR, "comprobante-prueba.pdf"),
      new Uint8Array(doc.output("arraybuffer")),
    );
  }
});
it("la nómina agrega páginas y conserva todos los participantes", () => {
  rosterPdf(
    Array.from({ length: 30 }, (_, i) => ({ ...team, code: `CAL-${i}` })),
  );
  const doc = captured.documents.at(-1);
  expect(doc.getNumberOfPages()).toBeGreaterThan(1);
  expect(doc.output()).toContain("CAL-29");
});
afterAll(() => vi.unstubAllGlobals());
