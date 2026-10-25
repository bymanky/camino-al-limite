import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { money, methods, type Team } from "./model";
export function receiptLink(token: string) {
  return `${location.origin}${location.pathname}#/comprobante/${token}`;
}
export async function receiptPdf(t: Team, token: string) {
  const doc = new jsPDF();
  doc.setFillColor("#163e32");
  doc.rect(0, 0, 210, 53, "F");
  doc.setTextColor("#ffffff");
  doc.setFontSize(26);
  doc.text("CAMINO AL LIMITE", 18, 25);
  doc.setFontSize(11);
  doc.text("TRAIL 5 KM  /  EMPRENDE CAMINO  /  BY MANKY", 18, 39);
  doc.setTextColor("#163e32");
  doc.setFontSize(19);
  doc.text("Comprobante de inscripción", 18, 69);
  doc.setFontSize(11);
  let y = 80;
  const line = (s: string) => {
    const lines = doc.splitTextToSize(s, 174);
    doc.text(lines, 18, y);
    y += lines.length * 5 + 2;
  };
  line(`Equipo: ${t.team}`);
  line(`Código: ${t.code}`);
  line(`Estado de inscripción: ${t.status}`);
  line(`Integrantes: ${t.members.length}`);
  t.members.forEach((m, i) => line(`${i + 1}. ${m.name}`));
  line(`Total por equipo: ${money(t.amount)} · Pago: ${t.payment}`);
  line(`Modalidad: ${methods[t.method]}`);
  if (t.payment !== "confirmado")
    line("Este comprobante NO acredita el pago. Pendiente de verificación.");
  if (y > 215) {
    doc.addPage();
    y = 25;
    doc.setTextColor("#163e32");
    doc.setFontSize(12);
    doc.text("Camino al Limite · " + t.code, 18, 15);
  }
  const qr = await QRCode.toDataURL(`CAL:${t.qr || token}`, {
    width: 300,
    margin: 1,
  });
  doc.addImage(qr, "PNG", 18, y, 43, 43);
  doc.setFontSize(9);
  doc.text(
    [
      "Presentá este QR al ingresar.",
      "El personal verificará el estado actual.",
      "Guardá tu enlace privado para descargarlo de nuevo.",
    ],
    69,
    y + 12,
  );
  doc.text("Volver a descargar mi comprobante", 18, y + 53);
  doc.link(18, y + 48, 150, 8, { url: receiptLink(token) });
  doc.setFontSize(8);
  doc.text(
    `Emitido: ${new Date().toLocaleString("es-UY")} · Estado al momento de emisión`,
    18,
    282,
  );
  doc.save(`Camino-al-Limite-${t.code}.pdf`);
}
export function rosterPdf(teams: Team[]) {
  const d = new jsPDF({ orientation: "landscape" });
  let y = 24;
  const header = () => {
    d.setFontSize(16);
    d.text("Camino al Limite · Nómina de participantes", 12, 15);
    d.setFontSize(8);
    d.text("Equipo / Código", 12, 24);
    d.text("Participante / Documento", 95, 24);
    d.text("Pago", 205, 24);
    d.text("Asistencia", 250, 24);
    y = 33;
  };
  header();
  for (const t of teams)
    for (const m of t.members) {
      const a = d.splitTextToSize(`${t.team} / ${t.code}`, 76);
      const b = d.splitTextToSize(`${m.name} / ${m.document}`, 100);
      const h = Math.max(a.length, b.length) * 4 + 5;
      if (y + h > 195) {
        d.addPage();
        header();
      }
      d.text(a, 12, y);
      d.text(b, 95, y);
      d.text(t.payment, 205, y);
      d.text(m.present_at ? "Presente" : "Pendiente", 250, y);
      y += h;
    }
  d.save("Camino-al-Limite-nomina.pdf");
}
