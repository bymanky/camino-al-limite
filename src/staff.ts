export const staffRoles = {
  superadministrador: {
    name: "Superadministrador",
    description: "Todo el evento y gestión de usuarios y roles.",
  },
  administrador: {
    name: "Administrador",
    description: "Evento, equipos, participantes, pagos, asistencia y nómina.",
  },
  cobros: {
    name: "Cobros",
    description:
      "Consultar inscripciones y comprobantes de pago; actualizar pagos.",
  },
  acreditacion: {
    name: "Acreditación",
    description:
      "Buscar por QR o código y marcar asistencia. Sin nómina completa ni datos de contacto.",
  },
  consulta: {
    name: "Consulta",
    description: "Consultar y descargar la nómina sin modificar registros.",
  },
} as const;
export type StaffRole = keyof typeof staffRoles;
export type StaffProfile = {
  id: string;
  username: string;
  role: StaffRole;
  permissions: string[];
};
export type StaffUser = {
  id: string;
  username: string;
  local: boolean;
  role: StaffRole;
  active: boolean;
  created_at: string;
};
