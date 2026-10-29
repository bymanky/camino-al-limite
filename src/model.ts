import { z } from "zod";
export const TEAM_SIZE = 4;
export const memberSchema = z.object({
  name: z.string().trim().min(3, "Ingresá nombre y apellido").max(100),
  document: z.string().trim().min(5, "Revisá el documento").max(30),
});
export const registrationSchema = z
  .object({
    team: z.string().trim().min(2, "Ingresá el nombre del equipo").max(80),
    responsible: z.string().trim().min(3).max(100),
    phone: z.string().trim().min(7, "Revisá el teléfono").max(30),
    email: z.string().trim().email("Revisá el correo").max(150),
    method: z.enum(["ecos", "fomento", "transferencia"]),
    members: z
      .array(memberSchema)
      .length(TEAM_SIZE, "El equipo debe tener exactamente 4 integrantes"),
    accepted: z.literal(true),
    idempotency: z.string().uuid(),
    website: z.string().max(0),
  })
  .superRefine((v, c) => {
    if (
      new Set(v.members.map((m) => m.document.replace(/\W/g, "").toLowerCase()))
        .size !== v.members.length
    )
      c.addIssue({
        code: "custom",
        message: "Hay documentos repetidos en el equipo",
        path: ["members"],
      });
  });
export type Member = z.infer<typeof memberSchema> & {
  id?: string;
  present_at?: string | null;
};
export type Draft = {
  team: string;
  responsible: string;
  phone: string;
  email: string;
  method: "ecos" | "fomento" | "transferencia";
  members: Member[];
  accepted: boolean;
  idempotency: string;
  website: string;
};
export type Settings = {
  id: number;
  date: string;
  time: string;
  location: string;
  deadline: string;
  contact: string;
  rules: string;
  privacy: string;
  open: boolean;
  min_members: number;
};
export const initialSettings: Settings = {
  id: 1,
  date: "",
  time: "",
  location: "",
  deadline: "",
  contact: "",
  rules: "",
  privacy: "",
  open: false,
  min_members: TEAM_SIZE,
};
export type Team = {
  id: string;
  code: string;
  team: string;
  responsible: string;
  phone: string;
  email: string;
  method: string;
  amount: number;
  payment: string;
  status: string;
  notes: string;
  created_at: string;
  receipt_path?: string;
  members: Member[];
  qr?: string;
};
export const methods: Record<string, string> = {
  ecos: "Presencial · Ecos Regionales",
  fomento: "Presencial · Sociedad de Fomento Rural de Flores",
  transferencia: "Transferencia BROU",
};
export const money = (n: number) =>
  new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency: "UYU",
    maximumFractionDigits: 0,
  }).format(n);
export function csvCell(v: unknown) {
  let s = String(v ?? "");
  if (/^[\s]*[=+@\-]/.test(s)) s = "'" + s;
  return '"' + s.replaceAll('"', '""') + '"';
}
export function rosterCsv(teams: Team[]) {
  return (
    "\uFEFF" +
    [
      [
        "Equipo",
        "Participante",
        "Documento",
        "Responsable",
        "Teléfono",
        "Correo",
        "Código",
        "Modalidad",
        "Pago",
        "Inscripción",
        "Asistencia",
      ],
      ...teams.flatMap((t) =>
        t.members.map((m) => [
          t.team,
          m.name,
          m.document,
          t.responsible,
          t.phone,
          t.email,
          t.code,
          methods[t.method],
          t.payment,
          t.status,
          m.present_at ? "Presente" : "Pendiente",
        ]),
      ),
    ]
      .map((row) => row.map(csvCell).join(";"))
      .join("\r\n")
  );
}
