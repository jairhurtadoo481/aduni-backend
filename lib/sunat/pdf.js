// Representación impresa (PDF) de la boleta / factura / nota de crédito electrónica.
const path = require("path");
const PDFDocument = require("pdfkit");
const QRCode = require("qrcode");
const { montoALetras } = require("./montoALetras");
const { CODIGO } = require("./emitir");

const LOGO = path.join(__dirname, "..", "..", "assets", "logo-aduni.png");
const AZUL = "#12306b";
const TITULO = { boleta: "BOLETA DE VENTA ELECTRÓNICA", factura: "FACTURA ELECTRÓNICA", nota_credito: "NOTA DE CRÉDITO ELECTRÓNICA" };

const comprobantePDF = async (c, config, res) => {
  const doc = new PDFDocument({ size: "A5", margin: 28 });
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `inline; filename="${c.serie}-${c.correlativo}.pdf"`);
  doc.pipe(res);
  const W = doc.page.width;

  doc.image(LOGO, 28, 24, { height: 30 });
  doc.fillColor("#333").font("Helvetica-Bold").fontSize(8).text(config.razonSocial, 28, 60, { width: W - 210 });
  doc.font("Helvetica").fontSize(7).text(config.direccion, 28, doc.y, { width: W - 210 });
  doc.roundedRect(W - 172, 22, 144, 60, 4).lineWidth(1).strokeColor(AZUL).stroke();
  doc.fillColor(AZUL).font("Helvetica-Bold").fontSize(9).text(`RUC ${config.ruc}`, W - 172, 28, { width: 144, align: "center" });
  doc.fontSize(8).text(TITULO[c.tipo], W - 172, 42, { width: 144, align: "center" });
  doc.fontSize(11).text(`${c.serie}-${String(c.correlativo).padStart(8, "0")}`, W - 172, 62, { width: 144, align: "center" });

  doc.y = 96;
  doc.fillColor("#111").fontSize(8.5);
  const fila = (k, v) => doc.font("Helvetica-Bold").text(`${k}: `, 28, doc.y, { continued: true }).font("Helvetica").text(v);
  fila("Fecha de emisión", c.fechaEmision);
  fila(c.cliente.tipoDocumento, c.cliente.documento);
  fila("Señor(es)", c.cliente.nombre);
  if (c.afectado?.serie) fila("Documento que modifica", `${c.afectado.serie}-${c.afectado.correlativo} · Motivo: ${c.motivoDescripcion}`);
  fila("Moneda", "Soles");

  doc.moveDown(0.6);
  const y0 = doc.y;
  doc.rect(28, y0, W - 56, 16).fill(AZUL);
  doc.fillColor("#fff").font("Helvetica-Bold").fontSize(8)
    .text("Cant.", 32, y0 + 4, { width: 30 }).text("Descripción", 64, y0 + 4).text("P. Unit.", W - 150, y0 + 4, { width: 55, align: "right" }).text("Importe", W - 90, y0 + 4, { width: 58, align: "right" });
  doc.y = y0 + 20;
  for (const it of c.items) {
    const y = doc.y;
    doc.fillColor("#111").font("Helvetica").fontSize(8)
      .text(String(it.cantidad), 32, y, { width: 30 })
      .text(`${it.descripcion}${it.afectacion === "20" ? " (exonerado)" : ""}`, 64, y, { width: W - 220 })
      .text(it.precioUnitario.toFixed(2), W - 150, y, { width: 55, align: "right" })
      .text((it.cantidad * it.precioUnitario).toFixed(2), W - 90, y, { width: 58, align: "right" });
    doc.y = Math.max(doc.y, y + 12) + 2;
  }
  doc.moveTo(28, doc.y + 2).lineTo(W - 28, doc.y + 2).strokeColor("#ccc").stroke();
  doc.moveDown(0.6);
  const totales = [["Op. gravadas", c.gravadas], ["Op. exoneradas", c.exoneradas], ["IGV (18%)", c.igv], ["IMPORTE TOTAL", c.total]];
  for (const [k, v] of totales) {
    const y = doc.y;
    doc.font(k === "IMPORTE TOTAL" ? "Helvetica-Bold" : "Helvetica").fontSize(k === "IMPORTE TOTAL" ? 10 : 8)
      .text(k, W - 220, y, { width: 120, align: "right" }).text(`S/ ${Number(v).toFixed(2)}`, W - 96, y, { width: 68, align: "right" });
    doc.y = y + (k === "IMPORTE TOTAL" ? 14 : 11);
  }
  doc.font("Helvetica").fontSize(7.5).text(montoALetras(c.total, "PEN"), 28, doc.y + 4, { width: W - 56 });

  const qrTexto = [config.ruc, CODIGO[c.tipo], c.serie, c.correlativo, c.igv.toFixed(2), c.total.toFixed(2), c.fechaEmision, c.cliente.tipoDocumento === "RUC" ? "6" : "1", c.cliente.documento, ""].join("|");
  const qr = await QRCode.toBuffer(qrTexto, { margin: 0, width: 160 });
  const yq = Math.min(doc.y + 14, doc.page.height - 130);
  doc.image(qr, 28, yq, { width: 72 });
  doc.fontSize(7).fillColor("#555").text(
    `Representación impresa de la ${TITULO[c.tipo].toLowerCase()}. Consulte su validez en www.sunat.gob.pe.\nOperación exonerada de IGV: servicios educativos (Ley del IGV, Apéndice II).${c.ambiente === "beta" ? "\nDOCUMENTO DE PRUEBA (ambiente beta) — SIN VALOR TRIBUTARIO" : ""}\nEstado SUNAT: ${c.estado.toUpperCase()}${c.observaciones ? ` · ${c.observaciones}` : ""}`,
    108, yq + 4, { width: W - 136 });
  if (c.ambiente === "beta" || c.anulado) {
    doc.save().rotate(-25, { origin: [W / 2, 280] }).fillColor("#dc2626").opacity(0.25).font("Helvetica-Bold").fontSize(46).text(c.anulado ? "ANULADO" : "PRUEBA", 50, 250).restore();
  }
  doc.end();
};

module.exports = { comprobantePDF };
