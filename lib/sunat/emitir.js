// Emisión de comprobantes electrónicos a SUNAT (SEE desde los sistemas del contribuyente).
// Emisor de comprobantes electrónicos SUNAT (UBL 2.1) adaptado a un colegio.
const FacturacionConfig = require("../../models/FacturacionConfig");
const Comprobante = require("../../models/Comprobante");
const { descifrar } = require("./cifrado");
const { leerCertificadoP12 } = require("./certificado");
const { generarXmlComprobante, generarXmlNotaCredito, calcularTotales, TIPO_COMPROBANTE_CODE } = require("./ubl");
const { firmarXml } = require("./firmarXml");
const { crearZipComprobante } = require("./zip");
const { enviarComprobante } = require("./soap");
const { hoy, horaActual } = require("../fechas");

const CODIGO = { ...TIPO_COMPROBANTE_CODE, nota_credito: "07" };

const obtenerConfig = async () => (await FacturacionConfig.findOne()) || FacturacionConfig.create({});

const listoParaEmitir = (c) => !!(c && c.activo && c.certificadoCifrado && c.usuarioSolCifrado && c.claveSolCifrada && c.claveCertificadoCifrada);

const credenciales = (config) => {
  if (!listoParaEmitir(config)) throw new Error("La facturación electrónica no está activa o falta configurar el certificado y el usuario SOL");
  const usuarioSol = descifrar(config.usuarioSolCifrado).toString("utf8");
  const claveSol = descifrar(config.claveSolCifrada).toString("utf8");
  const { clavePrivadaPem, certificadoPem } = leerCertificadoP12(descifrar(config.certificadoCifrado), descifrar(config.claveCertificadoCifrada).toString("utf8"));
  return { usuarioSol, claveSol, clavePrivadaPem, certificadoPem };
};

const siguienteCorrelativo = async (campo) => {
  const c = await FacturacionConfig.findOneAndUpdate({}, { $inc: { [`correlativos.${campo}`]: 1 } }, { returnDocument: "after", upsert: true });
  return c.correlativos[campo];
};

const emisorDe = (c) => ({ ruc: c.ruc, razonSocial: c.razonSocial, nombreComercial: c.nombreComercial, direccion: c.direccion });

const enviar = async (comprobante, config, usuarioSol, claveSol, nombreArchivo, xmlFirmado) => {
  try {
    const r = await enviarComprobante({ ambiente: config.ambiente, ruc: config.ruc, usuarioSol, claveSol, nombreArchivo, zipBuffer: await crearZipComprobante(nombreArchivo, xmlFirmado) });
    if (r.ok) {
      comprobante.estado = r.codigo === "0" ? "aceptado" : "rechazado";
      comprobante.codigoRespuesta = r.codigo;
      comprobante.observaciones = r.descripcion;
      comprobante.cdrZipBase64 = r.zipCdrBase64;
    } else {
      comprobante.estado = "error";
      comprobante.observaciones = r.faultstring || "Error desconocido al enviar a SUNAT";
      comprobante.codigoRespuesta = r.faultcode || "";
    }
  } catch (e) {
    comprobante.estado = "error";
    comprobante.observaciones = e.name === "TimeoutError" ? "SUNAT no respondió a tiempo. Reintenta en unos minutos." : `Error de conexión con SUNAT: ${e.cause?.message || e.message}`;
  }
};

/**
 * Emite boleta o factura. items: [{ descripcion, cantidad, precioUnitario, afectacion: "20"|"10" }]
 * cliente: { tipoDocumento: "DNI"|"RUC", documento, nombre, direccion }
 */
const emitir = async ({ tipo = "boleta", cliente, items, recibo = null, estudiante = null, emitidoPor = null }) => {
  if (!["boleta", "factura"].includes(tipo)) throw new Error("Tipo de comprobante inválido");
  if (tipo === "factura" && (cliente.tipoDocumento !== "RUC" || !/^(10|20)\d{9}$/.test(cliente.documento))) throw new Error("La factura requiere un RUC válido");
  if (tipo === "boleta" && cliente.tipoDocumento === "DNI" && !/^\d{8}$/.test(cliente.documento)) throw new Error("DNI inválido");
  const t = calcularTotales(items);
  if (cliente.documento === "00000000" && t.total >= 700) throw new Error("Para boletas de S/ 700 a más se debe identificar al cliente con su DNI");

  const config = await obtenerConfig();
  const { usuarioSol, claveSol, clavePrivadaPem, certificadoPem } = credenciales(config);
  const serie = config.series[tipo];
  const correlativo = await siguienteCorrelativo(tipo);
  const fechaEmision = hoy();
  const nombreArchivo = `${config.ruc}-${CODIGO[tipo]}-${serie}-${correlativo}`;
  const xml = generarXmlComprobante({ tipo, serie, correlativo, fechaEmision, horaEmision: `${horaActual()}:00`, emisor: emisorDe(config), cliente, items });
  const xmlFirmado = firmarXml(xml, clavePrivadaPem, certificadoPem);

  const comprobante = new Comprobante({
    tipo, serie, correlativo, fechaEmision, cliente, items,
    gravadas: t.gravadas, exoneradas: t.exoneradas, igv: t.igv, total: t.total,
    ambiente: config.ambiente, recibo, estudiante, emitidoPor, xmlFirmado,
  });
  await enviar(comprobante, config, usuarioSol, claveSol, nombreArchivo, xmlFirmado);
  await comprobante.save();
  return comprobante;
};

// Anula (total) una boleta o factura aceptada mediante nota de crédito.
const emitirNotaCredito = async ({ comprobanteId, motivoCodigo = "01", motivoDescripcion = "ANULACION DE LA OPERACION", emitidoPor = null }) => {
  const original = await Comprobante.findById(comprobanteId);
  if (!original || !["boleta", "factura"].includes(original.tipo)) throw new Error("Comprobante no encontrado");
  if (original.estado !== "aceptado") throw new Error("Solo se puede anular un comprobante aceptado por SUNAT");
  if (original.anulado) throw new Error("Este comprobante ya fue anulado");
  const config = await obtenerConfig();
  const { usuarioSol, claveSol, clavePrivadaPem, certificadoPem } = credenciales(config);
  const campo = original.tipo === "factura" ? "notaCreditoFactura" : "notaCreditoBoleta";
  const serie = config.series[campo];
  const correlativo = await siguienteCorrelativo(campo);
  const fechaEmision = hoy();
  const nombreArchivo = `${config.ruc}-07-${serie}-${correlativo}`;
  const items = original.items.map((i) => i.toObject());
  const afectado = { tipo: original.tipo, serie: original.serie, correlativo: original.correlativo };
  const xml = generarXmlNotaCredito({ serie, correlativo, fechaEmision, horaEmision: `${horaActual()}:00`, emisor: emisorDe(config), cliente: original.cliente, items, afectado, motivoCodigo, motivoDescripcion });
  const xmlFirmado = firmarXml(xml, clavePrivadaPem, certificadoPem);
  const t = calcularTotales(items);
  const nota = new Comprobante({
    tipo: "nota_credito", serie, correlativo, fechaEmision, cliente: original.cliente, items,
    gravadas: t.gravadas, exoneradas: t.exoneradas, igv: t.igv, total: t.total, ambiente: config.ambiente,
    recibo: original.recibo, estudiante: original.estudiante, emitidoPor, xmlFirmado,
    afectado: { ...afectado, comprobante: original._id }, motivoCodigo, motivoDescripcion,
  });
  await enviar(nota, config, usuarioSol, claveSol, nombreArchivo, xmlFirmado);
  await nota.save();
  if (nota.estado === "aceptado") {
    original.anulado = true;
    await original.save();
  }
  return nota;
};

// Reenvía el mismo XML firmado (por ejemplo tras un corte de conexión con SUNAT).
const reenviar = async (comprobanteId) => {
  const c = await Comprobante.findById(comprobanteId).select("+xmlFirmado");
  if (!c) throw new Error("Comprobante no encontrado");
  if (c.estado !== "error") throw new Error("Solo se reenvían comprobantes con error de envío");
  const config = await obtenerConfig();
  const { usuarioSol, claveSol } = credenciales(config);
  await enviar(c, config, usuarioSol, claveSol, `${config.ruc}-${CODIGO[c.tipo]}-${c.serie}-${c.correlativo}`, c.xmlFirmado);
  await c.save();
  if (c.tipo === "nota_credito" && c.estado === "aceptado" && c.afectado?.comprobante) await Comprobante.updateOne({ _id: c.afectado.comprobante }, { anulado: true });
  return c;
};

module.exports = { emitir, emitirNotaCredito, reenviar, obtenerConfig, listoParaEmitir, CODIGO };
