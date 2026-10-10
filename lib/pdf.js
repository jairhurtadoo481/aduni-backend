// Documentos PDF: libreta de notas, recibo de caja y carnés imprimibles.
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { ESCALA } = require("./curriculo");

const LOGO = path.join(__dirname, "..", "assets", "logo-aduni.png");
const AZUL = "#12306b";
const AZUL2 = "#1b4aa0";
const ORO = "#f5b800";
const COLOR_NIVEL = { AD: "#059669", A: "#2563eb", B: "#d97706", C: "#dc2626" };
const COLEGIO = {
  nombre: "Colegio ADUNI+", razon: "ADUNI MAS S.A.C.", ruc: "20564504751",
  direccion: "Av. Leoncio Prado 572, San Jerónimo, Andahuaylas, Apurímac",
};

const nuevoDoc = (opciones) => new PDFDocument({ size: "A4", margin: 36, info: { Producer: "Intranet ADUNI+" }, ...opciones });

const cabecera = (doc, titulo, subtitulo) => {
  doc.image(LOGO, 36, 30, { height: 38 });
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(14).text(titulo, 200, 34, { width: doc.page.width - 236, align: "right" });
  doc.fillColor("#555").font("Helvetica").fontSize(8.5).text(subtitulo, 200, 52, { width: doc.page.width - 236, align: "right" });
  doc.moveTo(36, 76).lineTo(doc.page.width - 36, 76).lineWidth(2).strokeColor(ORO).stroke();
  doc.y = 86;
};

// ---------------- Libreta ----------------
const dibujarLibreta = (doc, lib, primera) => {
  if (!primera) doc.addPage();
  const e = lib.estudiante;
  cabecera(doc, `INFORME DE PROGRESO ${lib.anio}`, `${COLEGIO.razon} · RUC ${COLEGIO.ruc}\n${COLEGIO.direccion}`);

  const datos = [
    ["Estudiante", e.nombre], ["Código", e.codigo], ["DNI", e.dni || "—"],
    ["Grado y sección", e.aula?.nombre || "—"], ["Tutor(a)", e.aula?.tutor?.nombre || "—"],
  ];
  doc.font("Helvetica").fontSize(9).fillColor("#111");
  const y0 = doc.y;
  datos.forEach(([k, v], i) => {
    const col = i < 3 ? 0 : 1;
    const fila = i < 3 ? i : i - 3;
    const x = 36 + col * 270;
    const y = y0 + fila * 14;
    doc.font("Helvetica-Bold").text(`${k}:`, x, y, { continued: true }).font("Helvetica").text(` ${v}`);
  });
  doc.y = y0 + 50;

  const ancho = doc.page.width - 72;
  const cols = [ancho - 5 * 46, 46, 46, 46, 46, 46];
  const encabezados = ["Área curricular / Competencia", "B1", "B2", "B3", "B4", "Logro"];
  const fila = (valores, { negrita = false, fondo = null, alto = 16, colorTexto = "#111" } = {}) => {
    if (doc.y + alto > doc.page.height - 120) { doc.addPage(); doc.y = 40; }
    const y = doc.y;
    let x = 36;
    if (fondo) doc.rect(36, y, ancho, alto).fill(fondo);
    valores.forEach((v, i) => {
      doc.rect(x, y, cols[i], alto).lineWidth(0.5).strokeColor("#c9d1e3").stroke();
      if (i > 0 && ESCALA[v]) {
        doc.roundedRect(x + 9, y + 3, cols[i] - 18, alto - 6, 3).fill(COLOR_NIVEL[v]);
        doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8).text(v, x, y + (alto - 8) / 2, { width: cols[i], align: "center" });
      } else {
        doc.fillColor(colorTexto).font(negrita ? "Helvetica-Bold" : "Helvetica").fontSize(i === 0 ? 8 : 8.5)
          .text(v ?? "", x + 4, y + 4, { width: cols[i] - 8, align: i === 0 ? "left" : "center" });
      }
      x += cols[i];
    });
    doc.y = y + alto;
  };

  fila(encabezados, { negrita: true, fondo: AZUL, colorTexto: "#fff", alto: 18 });
  for (const c of lib.cursos) {
    fila([c.nombre.toUpperCase(), ...c.resumenPeriodos.map((n) => n || ""), c.final || ""], { negrita: true, fondo: "#e8eefa", alto: 18 });
    for (const comp of c.competencias) {
      const alto = Math.max(16, doc.font("Helvetica").fontSize(8).heightOfString(comp.nombre, { width: cols[0] - 8 }) + 8);
      fila([comp.nombre, ...comp.niveles.map((n) => n || ""), ""], { alto });
    }
    const concl = c.conclusiones.map((t, i) => (t ? `B${i + 1}: ${t}` : "")).filter(Boolean).join("  ");
    if (concl) {
      const alto = doc.font("Helvetica-Oblique").fontSize(7.5).heightOfString(concl, { width: ancho - 8 }) + 8;
      if (doc.y + alto > doc.page.height - 120) { doc.addPage(); doc.y = 40; }
      doc.rect(36, doc.y, ancho, alto).fill("#fff8e1");
      doc.fillColor("#6b4f00").font("Helvetica-Oblique").fontSize(7.5).text(concl, 40, doc.y + 4, { width: ancho - 8 });
      doc.y += 4;
    }
  }

  // Asistencia y leyenda
  doc.moveDown(0.8);
  if (doc.y > doc.page.height - 170) { doc.addPage(); doc.y = 40; }
  const a = lib.asistencia;
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(10).text("Asistencia", 36);
  doc.fillColor("#111").font("Helvetica").fontSize(8.5).text(
    lib.asistenciaPorPeriodo.map((p, i) => `B${i + 1}: ${p.P + p.T + p.J}/${p.total} días (${p.T} tard., ${p.F} faltas)`).join("   ·   ") +
    `\nTotal del año: ${a.porcentaje ?? "—"}% de asistencia · ${a.T} tardanzas · ${a.F} faltas injustificadas · ${a.J} justificadas`, 36);
  doc.moveDown(0.6);
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(10).text("Escala de calificación (MINEDU)", 36);
  doc.fillColor("#111").font("Helvetica").fontSize(8).text(Object.entries(ESCALA).map(([k, v]) => `${k} = ${v.nombre}`).join("    "), 36);

  // Firmas
  const yF = doc.page.height - 90;
  [["Tutor(a)", 90], ["Dirección", doc.page.width / 2 - 70], ["Padre / Madre / Apoderado", doc.page.width - 230]].forEach(([t, x]) => {
    doc.moveTo(x, yF).lineTo(x + 140, yF).lineWidth(0.7).strokeColor("#333").stroke();
    doc.fillColor("#333").font("Helvetica").fontSize(8).text(t, x, yF + 4, { width: 140, align: "center" });
  });
  doc.fillColor("#888").fontSize(7).text(`Generado el ${new Date().toLocaleString("es-PE", { timeZone: "America/Lima" })} · Intranet ADUNI+`, 36, doc.page.height - 50, { width: ancho, align: "center" });
};

const libretasPDF = (libretas, res, nombreArchivo) => {
  const doc = nuevoDoc();
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${nombreArchivo}"`);
  doc.pipe(res);
  libretas.forEach((l, i) => dibujarLibreta(doc, l, i === 0));
  doc.end();
};

// ---------------- Recibo ----------------
const reciboPDF = (recibo, estudiante, res) => {
  const doc = new PDFDocument({ size: "A5", margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="recibo-${recibo.serie}-${recibo.numero}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width;
  doc.image(LOGO, 30, 26, { height: 30 });
  doc.roundedRect(W - 160, 24, 130, 44, 4).lineWidth(1).strokeColor(AZUL).stroke();
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(9).text("RECIBO DE CAJA", W - 160, 30, { width: 130, align: "center" });
  doc.fontSize(11).text(`${recibo.serie}-${String(recibo.numero).padStart(6, "0")}`, W - 160, 46, { width: 130, align: "center" });
  doc.fillColor("#555").font("Helvetica").fontSize(7.5).text(`${COLEGIO.razon} · RUC ${COLEGIO.ruc}\n${COLEGIO.direccion}`, 30, 74, { width: W - 60 });
  doc.moveDown(1);
  doc.fillColor("#111").fontSize(9);
  [["Fecha", `${recibo.fecha} ${recibo.hora || ""}`], ["Estudiante", estudiante.nombre], ["Código", estudiante.codigo], ["Aula", estudiante.aula?.nombre || "—"], ["Medio de pago", `${recibo.metodo}${recibo.operacion ? ` · Op. ${recibo.operacion}` : ""}`]]
    .forEach(([k, v]) => doc.font("Helvetica-Bold").text(`${k}: `, { continued: true }).font("Helvetica").text(v));
  doc.moveDown(0.8);
  const y = doc.y;
  doc.rect(30, y, W - 60, 18).fill(AZUL);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(9).text("Concepto", 36, y + 5).text("Importe", W - 130, y + 5, { width: 94, align: "right" });
  doc.y = y + 22;
  recibo.conceptos.forEach((c) => {
    const yy = doc.y;
    doc.fillColor("#111").font("Helvetica").fontSize(9).text(c.concepto, 36, yy).text(`S/ ${c.monto.toFixed(2)}`, W - 130, yy, { width: 94, align: "right" });
    doc.y = yy + 16;
  });
  doc.moveTo(30, doc.y).lineTo(W - 30, doc.y).strokeColor("#ccc").stroke();
  doc.font("Helvetica-Bold").fontSize(11).text(`TOTAL  S/ ${recibo.total.toFixed(2)}`, 30, doc.y + 6, { width: W - 66, align: "right" });
  if (recibo.anulado) {
    doc.save().rotate(-25, { origin: [W / 2, 300] }).fillColor("#dc2626").opacity(0.35).font("Helvetica-Bold").fontSize(60).text("ANULADO", 60, 270).restore();
  }
  doc.fillColor("#888").font("Helvetica").fontSize(7).text("Recibo interno de caja. No reemplaza al comprobante electrónico SUNAT.", 30, doc.page.height - 50, { width: W - 60, align: "center" });
  doc.end();
};

// ---------------- Carnés (tamaño tarjeta CR80) ----------------
const fotoCloudinary = async (url) => {
  if (!url) return null;
  try {
    const t = url.replace("/upload/", "/upload/f_jpg,w_220,h_260,c_fill,g_face/");
    const r = await fetch(t);
    return r.ok ? Buffer.from(await r.arrayBuffer()) : null;
  } catch {
    return null;
  }
};

const carnetsPDF = async (estudiantes, anio, res) => {
  const doc = nuevoDoc({ margin: 30 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="carnes.pdf"');
  doc.pipe(res);
  const W = 242.6;
  const H = 153;
  const gapX = 20;
  const gapY = 12;
  const x0 = (doc.page.width - (2 * W + gapX)) / 2;
  for (let i = 0; i < estudiantes.length; i++) {
    const pos = i % 10;
    if (i > 0 && pos === 0) doc.addPage();
    const x = x0 + (pos % 2) * (W + gapX);
    const y = 30 + Math.floor(pos / 2) * (H + gapY);
    const e = estudiantes[i];
    doc.roundedRect(x, y, W, H, 8).lineWidth(0.6).strokeColor("#999").stroke();
    doc.save().roundedRect(x, y, W, 34, 8).clip().rect(x, y, W, 34).fill(AZUL).restore();
    doc.rect(x, y + 30, W, 4).fill(ORO);
    doc.roundedRect(x + 6, y + 5, 74, 22, 3).fill("#fff");
    doc.image(LOGO, x + 8, y + 7, { height: 18 });
    doc.fillColor("#fff").font("Helvetica-Bold").fontSize(7).text(`CARNÉ ESTUDIANTIL ${anio}`, x + 88, y + 13, { width: W - 96, align: "right" });
    const foto = await fotoCloudinary(e.foto);
    if (foto) doc.image(foto, x + 10, y + 42, { width: 58, height: 70 });
    else {
      doc.rect(x + 10, y + 42, 58, 70).fill("#e8eefa");
      const ini = `${(e.nombres || "?")[0]}${(e.apellidos || "")[0] || ""}`.toUpperCase();
      doc.fillColor(AZUL2).font("Helvetica-Bold").fontSize(20).text(ini, x + 10, y + 66, { width: 58, align: "center" });
    }
    doc.fillColor("#111").font("Helvetica-Bold").fontSize(8.5).text(e.nombres, x + 76, y + 44, { width: 92 });
    doc.font("Helvetica").fontSize(7.5).text(e.apellidos, x + 76, doc.y, { width: 92 });
    doc.fillColor("#555").fontSize(6.5).text("CÓDIGO", x + 76, y + 82).fillColor(AZUL).font("Helvetica-Bold").fontSize(9).text(e.codigo, x + 76, y + 89);
    doc.fillColor("#555").font("Helvetica").fontSize(6.5).text(`DNI ${e.dni || "—"}`, x + 76, y + 101).text(e.aula?.nombre || "", x + 76, y + 109, { width: 92 });
    const qr = await QRCode.toBuffer(`ADUNI:${e.codigo}`, { margin: 0, width: 200 });
    doc.image(qr, x + W - 74, y + 44, { width: 64 });
    doc.fillColor("#888").fontSize(5.5).text("Personal e intransferible", x + W - 78, y + 112, { width: 72, align: "center" });
    doc.rect(x, y + H - 12, W, 4).fill(ORO);
  }
  doc.end();
};

module.exports = { libretasPDF, reciboPDF, carnetsPDF, COLEGIO };
