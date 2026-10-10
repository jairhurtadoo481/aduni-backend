// Facturación electrónica SUNAT: configuración (Dirección) y emisión/consulta (Tesorería).
const multer = require("multer");
const FacturacionConfig = require("../../models/FacturacionConfig");
const Comprobante = require("../../models/Comprobante");
const Recibo = require("../../models/Recibo");
const { cifrar } = require("../../lib/sunat/cifrado");
const { leerCertificadoP12 } = require("../../lib/sunat/certificado");
const { emitirNotaCredito, reenviar, obtenerConfig, listoParaEmitir } = require("../../lib/sunat/emitir");
const { emitirParaRecibo } = require("../../lib/sunat/paraRecibo");
const { comprobantePDF } = require("../../lib/sunat/pdf");
const { auditar } = require("../../lib/auditar");
const { esFechaValida } = require("../../lib/fechas");
const { h, texto, esId } = require("./util");

const recibirCertificado = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 },
  fileFilter: (req, f, cb) => (/\.(pfx|p12)$/i.test(f.originalname) ? cb(null, true) : cb(new Error("Sube el certificado en formato .pfx o .p12"))),
}).single("certificado");

const publica = (c) => ({
  activo: c.activo, emitirAutomatico: c.emitirAutomatico, ruc: c.ruc, razonSocial: c.razonSocial, nombreComercial: c.nombreComercial,
  direccion: c.direccion, ambiente: c.ambiente, series: c.series, correlativos: c.correlativos, certificadoInfo: c.certificadoInfo,
  tieneCertificado: !!c.certificadoCifrado, tieneSol: !!(c.usuarioSolCifrado && c.claveSolCifrada), listo: listoParaEmitir({ ...c.toObject(), activo: true }),
});

const verConfig = h(async (req, res) => res.json(publica(await obtenerConfig())));

const guardarConfig = (req, res) => recibirCertificado(req, res, async (errSubida) => {
  try {
    if (errSubida) return res.status(400).json({ mensaje: errSubida.message });
    const c = await obtenerConfig();
    const b = req.body || {};
    ["razonSocial", "nombreComercial", "direccion"].forEach((k) => { if (b[k] !== undefined) c[k] = texto(b[k], 250); });
    if (b.ruc !== undefined) {
      if (!/^20\d{9}$|^10\d{9}$/.test(b.ruc)) return res.status(400).json({ mensaje: "RUC inválido" });
      c.ruc = b.ruc;
    }
    if (["beta", "produccion"].includes(b.ambiente)) c.ambiente = b.ambiente;
    if (b.emitirAutomatico !== undefined) c.emitirAutomatico = b.emitirAutomatico === true || b.emitirAutomatico === "true";
    for (const k of ["boleta", "factura", "notaCreditoBoleta", "notaCreditoFactura"]) {
      const v = b[`serie_${k}`];
      if (v !== undefined) {
        if (!/^[BF][A-Z0-9]{3}$/.test(v)) return res.status(400).json({ mensaje: `Serie inválida para ${k} (4 caracteres, empieza con B o F)` });
        c.series[k] = v;
      }
    }
    if (b.usuarioSol) c.usuarioSolCifrado = cifrar(String(b.usuarioSol).trim().toUpperCase());
    if (b.claveSol) c.claveSolCifrada = cifrar(String(b.claveSol));
    if (req.file) {
      if (!b.claveCertificado) return res.status(400).json({ mensaje: "Ingresa la contraseña del certificado" });
      let info;
      try {
        info = leerCertificadoP12(req.file.buffer, String(b.claveCertificado));
      } catch {
        return res.status(400).json({ mensaje: "No se pudo abrir el certificado: revisa el archivo y su contraseña" });
      }
      c.certificadoCifrado = cifrar(req.file.buffer);
      c.claveCertificadoCifrada = cifrar(String(b.claveCertificado));
      c.certificadoInfo = { sujeto: info.sujeto, emisor: info.emisor, validoHasta: info.validoHasta };
    }
    if (b.activo !== undefined) {
      const activar = b.activo === true || b.activo === "true";
      if (activar && !listoParaEmitir({ ...c.toObject(), activo: true })) return res.status(400).json({ mensaje: "Para activar falta el certificado digital y/o el usuario SOL" });
      c.activo = activar;
    }
    await c.save();
    await auditar(req, "Modificó configuración de facturación SUNAT", "FacturacionConfig", c._id,
      `ambiente ${c.ambiente}, ${c.activo ? "activa" : "inactiva"}${req.file ? ", nuevo certificado" : ""}${b.usuarioSol ? ", usuario SOL actualizado" : ""}`, "seguridad");
    res.json(publica(c));
  } catch (e) {
    res.status(500).json({ mensaje: e.message.includes("FACTURACION_ENCRYPT_KEY") ? e.message : "Error al guardar la configuración" });
  }
});

const listar = h(async (req, res) => {
  const filtro = {};
  if (["boleta", "factura", "nota_credito"].includes(req.query.tipo)) filtro.tipo = req.query.tipo;
  if (["aceptado", "rechazado", "error", "pendiente"].includes(req.query.estado)) filtro.estado = req.query.estado;
  if (esFechaValida(req.query.desde) || esFechaValida(req.query.hasta)) {
    filtro.fechaEmision = {};
    if (esFechaValida(req.query.desde)) filtro.fechaEmision.$gte = req.query.desde;
    if (esFechaValida(req.query.hasta)) filtro.fechaEmision.$lte = req.query.hasta;
  }
  const lista = await Comprobante.find(filtro).sort({ createdAt: -1 }).limit(500).populate("estudiante", "nombre codigo").populate("emitidoPor", "nombre");
  const ok = lista.filter((c) => c.estado === "aceptado" && !c.anulado);
  res.json({
    lista,
    resumen: {
      emitidos: lista.length, aceptados: ok.length, conError: lista.filter((c) => ["error", "rechazado"].includes(c.estado)).length,
      totalBoletas: ok.filter((c) => c.tipo === "boleta").reduce((s, c) => s + c.total, 0),
      totalFacturas: ok.filter((c) => c.tipo === "factura").reduce((s, c) => s + c.total, 0),
    },
  });
});

const emitirDesdeRecibo = h(async (req, res) => {
  const r = esId(req.body.recibo) ? await Recibo.findById(req.body.recibo) : null;
  if (!r || r.anulado) return res.status(404).json({ mensaje: "Recibo no encontrado o anulado" });
  try {
    const c = await emitirParaRecibo(r, { tipo: req.body.tipo === "factura" ? "factura" : "boleta", cliente: req.body.cliente, emitidoPor: req.usuarioId });
    await auditar(req, `Emitió ${c.tipo} electrónica`, "Comprobante", c._id, `${c.serie}-${c.correlativo} · S/ ${c.total.toFixed(2)} · ${c.estado}`, "pago");
    res.status(201).json(c);
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
});

const anular = h(async (req, res) => {
  try {
    const nota = await emitirNotaCredito({ comprobanteId: req.params.id, motivoDescripcion: texto(req.body.motivo, 200).toUpperCase() || "ANULACION DE LA OPERACION", emitidoPor: req.usuarioId });
    await auditar(req, "Anuló comprobante con nota de crédito", "Comprobante", req.params.id, `${nota.serie}-${nota.correlativo} · ${nota.estado}`, "pago");
    res.status(201).json(nota);
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
});

const reintentar = h(async (req, res) => {
  try {
    const c = await reenviar(req.params.id);
    await auditar(req, "Reenvió comprobante a SUNAT", "Comprobante", c._id, `${c.serie}-${c.correlativo} · ${c.estado}`, "pago");
    res.json(c);
  } catch (e) {
    res.status(400).json({ mensaje: e.message });
  }
});

const pdf = h(async (req, res) => {
  const c = esId(req.params.id) ? await Comprobante.findById(req.params.id) : null;
  if (!c) return res.status(404).json({ mensaje: "Comprobante no encontrado" });
  await comprobantePDF(c, await obtenerConfig(), res);
});

const descargarXml = h(async (req, res) => {
  const c = esId(req.params.id) ? await Comprobante.findById(req.params.id).select("+xmlFirmado +cdrZipBase64") : null;
  if (!c) return res.status(404).json({ mensaje: "Comprobante no encontrado" });
  const config = await obtenerConfig();
  const base = `${config.ruc}-${{ boleta: "03", factura: "01", nota_credito: "07" }[c.tipo]}-${c.serie}-${c.correlativo}`;
  if (req.params.archivo === "cdr") {
    if (!c.cdrZipBase64) return res.status(404).json({ mensaje: "Este comprobante no tiene CDR" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="R-${base}.zip"`);
    return res.send(Buffer.from(c.cdrZipBase64, "base64"));
  }
  res.setHeader("Content-Type", "application/xml");
  res.setHeader("Content-Disposition", `attachment; filename="${base}.xml"`);
  res.send(c.xmlFirmado || "");
});

module.exports = { verConfig, guardarConfig, listar, emitirDesdeRecibo, anular, reintentar, pdf, descargarXml };
