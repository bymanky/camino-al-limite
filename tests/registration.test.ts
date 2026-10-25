import { describe, it, expect } from "vitest";
import { registrationSchema, rosterCsv, type Team } from "../src/model";
const draft = {
  team: "Las Cabras",
  responsible: "Ana Pérez",
  phone: "099123456",
  email: "ana@example.com",
  method: "ecos",
  members: [{ name: "Ana Pérez", document: "12345678" }],
  accepted: true,
  idempotency: "90e3c52a-7ce3-4be1-894c-1c4e423777e2",
  website: "",
};
describe("Inscripción", () => {
  it("acepta de uno a cuatro integrantes", () => {
    for (let n = 1; n <= 4; n++)
      expect(
        registrationSchema.safeParse({
          ...draft,
          members: Array.from({ length: n }, (_, i) => ({
            name: `Persona ${i}`,
            document: `1234567${i}`,
          })),
        }).success,
      ).toBe(true);
  });
  it("rechaza equipos vacíos y de cinco personas", () => {
    expect(
      registrationSchema.safeParse({ ...draft, members: [] }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({
        ...draft,
        members: Array.from({ length: 5 }, (_, i) => ({
          name: `Persona ${i}`,
          document: `1234567${i}`,
        })),
      }).success,
    ).toBe(false);
  });
  it("rechaza documentos duplicados aunque cambie la puntuación", () => {
    expect(
      registrationSchema.safeParse({
        ...draft,
        members: [
          draft.members[0],
          { name: "Otra persona", document: "1.234.567-8" },
        ],
      }).success,
    ).toBe(false);
  });
  it("exige consentimiento y correo válido", () => {
    expect(
      registrationSchema.safeParse({ ...draft, accepted: false }).success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...draft, email: "sin-arroba" }).success,
    ).toBe(false);
  });
  it("rechaza la trampa antispam", () =>
    expect(
      registrationSchema.safeParse({ ...draft, website: "bot.example" })
        .success,
    ).toBe(false));
});
describe("Nómina", () => {
  it("exporta una fila por persona, conserva ceros y neutraliza fórmulas", () => {
    const t = {
      ...draft,
      id: "x",
      code: "CAL-123",
      amount: 1200,
      payment: "pendiente",
      status: "activa",
      notes: "",
      created_at: "",
      phone: "00123",
      team: '=HYPERLINK("x")',
      members: [
        { name: "Ana Pérez", document: "0012345" },
        { name: "Luis Pérez", document: "0012346" },
      ],
    } as Team;
    const csv = rosterCsv([t]);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv.split("\r\n")).toHaveLength(3);
    expect(csv).toContain('"0012345"');
    expect(csv).toContain("' =".replace(" ", "") + "HYPERLINK");
    expect(csv).toContain('"00123"');
  });
});
