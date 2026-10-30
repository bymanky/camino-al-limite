import { jsPDF } from "jspdf";
import QRCode from "qrcode";
import { methods, type Team } from "./model";
import { receiptAssets } from "./pdfAssets";
export function receiptLink(token: string) {
  return `${location.origin}${location.pathname}#/comprobante/${token}`;
}
export async function receiptPdf(t: Team, token: string) {
  const assets = await receiptAssets();
  const doc = new jsPDF({ compress: true });
  doc.addFileToVFS("Atkinson-Regular.ttf", assets.regular);
  doc.addFont("Atkinson-Regular.ttf", "Atkinson", "normal");
  doc.addFileToVFS("Atkinson-Bold.ttf", assets.bold);
  doc.addFont("Atkinson-Bold.ttf", "Atkinson", "bold");
  doc.setProperties({
    title: "Comprobante de inscripción - Camino al Limite",
    subject: t.code,
    creator: "By Manky",
  });
  const font = (size: number, bold = false) => {
    doc.setFont("Atkinson", bold ? "bold" : "normal");
    doc.setFontSize(size);
  };
  const header = () => {
    doc.setFillColor("#163e32");
    doc.rect(0, 0, 210, 35, "F");
    doc.setTextColor("#ffffff");
    font(24, true);
    doc.text("CAMINO AL LIMITE", 18, 20);
    font(10);
    doc.text("TRAIL 5 KM  /  EQUIPOS DE 4 INTEGRANTES", 18, 28);
    doc.setTextColor("#163e32");
  };
  header();
  font(19, true);
  doc.text("Comprobante de inscripción", 18, 49);
  let y = 61;
  const ensure = (height: number) => {
    if (y + height > 236) {
      doc.addPage();
      header();
      y = 48;
    }
  };
  const line = (value: string, size = 11, bold = false) => {
    font(size, bold);
    const lines = doc.splitTextToSize(value, 174);
    const h = lines.length * 5.3 + 2;
    ensure(h);
    doc.text(lines, 18, y);
    y += h;
  };
  line("Equipo: " + t.team, 13, true);
  line("Código: " + t.code, 10);
  line(
    "Inscripción: " + t.status + "  |  Pago: " + t.payment.replaceAll("_", " "),
    10,
  );
  y += 3;
  line("INTEGRANTES (" + t.members.length + ")", 10, true);
  for (const [i, m] of t.members.entries()) line(i + 1 + ". " + m.name, 11);
  y += 2;
  line("Inscripción: $300 UYU por persona", 12, true);
  line("Total del equipo: $" + t.amount + " UYU", 11, true);
  line("Modalidad: " + methods[t.method], 10);
  if (t.payment !== "confirmado")
    line(
      "Este comprobante NO acredita el pago. Pendiente de verificación.",
      10,
      true,
    );
  y += 3;
  ensure(49);
  const qr = await QRCode.toDataURL("CAL:" + (t.qr || token), {
    width: 300,
    margin: 1,
  });
  doc.addImage(qr, "PNG", 18, y, 40, 40, undefined, "FAST");
  font(10, true);
  doc.text("Presentá este QR al ingresar.", 65, y + 10);
  font(9);
  doc.text(
    doc.splitTextToSize(
      "El personal verificará el estado actual. Guardá tu enlace privado para volver a descargar el comprobante.",
      125,
    ),
    65,
    y + 17,
  );
  font(9, true);
  doc.text("Volver a descargar mi comprobante", 65, y + 35);
  doc.link(65, y + 30, 120, 8, { url: receiptLink(token) });
  const issued = new Date().toLocaleString("es-UY");
  for (let page = 1; page <= doc.getNumberOfPages(); page++) {
    doc.setPage(page);
    doc.setDrawColor("#d8dfd5");
    doc.line(18, 244, 192, 244);
    for (const [i, logo] of assets.logos.entries()) {
      const center = 46 + i * 59;
      font(8, true);
      doc.setTextColor("#163e32");
      doc.text(logo.role, center, 250, { align: "center" });
      const props = doc.getImageProperties(logo.data);
      const scale = Math.min(49 / props.width, 23 / props.height);
      const w = props.width * scale,
        h = props.height * scale;
      doc.addImage(
        logo.data,
        "PNG",
        center - w / 2,
        253 + (23 - h) / 2,
        w,
        h,
        undefined,
        "FAST",
      );
      font(7);
      doc.text(doc.splitTextToSize(logo.name, 55), center, 281, {
        align: "center",
      });
    }
    font(7);
    doc.setTextColor("#666666");
    doc.text("Emitido: " + issued + " | Estado al momento de emisión", 18, 292);
    doc.text(page + "/" + doc.getNumberOfPages(), 192, 292, { align: "right" });
  }
  doc.save("Camino-al-Limite-" + t.code + ".pdf");
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
