const FacturacionConfig = require("../models/FacturacionConfig");
const Comprobante = require("../models/Comprobante");
const Cliente = require("../models/Cliente");
const { descifrar } = require("../config/cifrado");
const { leerCertificadoP12 } = require("./certificado");
const { generarXmlComprobante, generarXmlNotaCredito } = require("./ubl");
const { firmarXml } = require("./firmarXml");
const { crearZipComprobante } = require("./zip");
const { enviarComprobante } = require("./soapSunat");
const { generarPdfComprobante } = require("./pdfComprobante");
const { montoALetras } = require("./montoALetras");
const { calcularTotales } = require("./calculosComprobante");
const { subirArchivo } = require("../config/cloudinaryUpload");

const TIPO_COMPROBANTE_CODE = { factura: "01", boleta: "03", nota_credito: "07" };

const obtenerConfigConCredenciales = async () => {
  const config = await FacturacionConfig.findOne();
  if (!config || !config.certificadoCifrado || !config.usuarioSolCifrado) {
    throw new Error("La configuracion de facturacion no esta completa (falta certificado o credenciales SOL)");
  }

  const usuarioSol = descifrar(config.usuarioSolCifrado).toString("utf8");
  const claveSol = descifrar(config.claveSolCifrada).toString("utf8");
  const bufferCert = descifrar(config.certificadoCifrado);
  const claveCert = descifrar(config.claveCertificadoCifrada).toString("utf8");
  const { clavePrivadaPem, certificadoPem } = leerCertificadoP12(bufferCert, claveCert);

  return { config, usuarioSol, claveSol, clavePrivadaPem, certificadoPem };
};

const obtenerSiguienteCorrelativo = async (campo) => {
  const config = await FacturacionConfig.findOneAndUpdate(
    {},
    { $inc: { [`correlativos.${campo}`]: 1 } },
    { returnDocument: "after", upsert: true }
  );
  return config.correlativos[campo];
};

const guardarClienteSiNoExiste = async (cliente) => {
  const camposActualizados = { nombre: cliente.nombre, direccion: cliente.direccion || "" };
  if (cliente.telefono) camposActualizados.telefono = cliente.telefono;
  if (cliente.correo) camposActualizados.correo = cliente.correo;
  if (cliente.contacto) camposActualizados.contacto = cliente.contacto;
  if (cliente.referencia) camposActualizados.referencia = cliente.referencia;

  await Cliente.findOneAndUpdate(
    { documento: cliente.documento },
    {
      $setOnInsert: { tipoDocumento: cliente.tipoDocumento },
      $set: camposActualizados,
    },
    { upsert: true }
  );
};

const enviarYGuardarResultado = async ({ comprobante, config, usuarioSol, claveSol, nombreArchivo, zipBuffer, xmlFirmado }) => {
  try {
    const resultado = await enviarComprobante({
      ambiente: config.ambiente,
      ruc: config.ruc,
      usuarioSol,
      claveSol,
      nombreArchivo,
      zipBuffer,
    });

    if (resultado.ok) {
      comprobante.estado = resultado.codigo === "0" ? "aceptado" : "rechazado";
      comprobante.codigoHash = resultado.codigo;
      comprobante.observaciones = resultado.descripcion;

      const cdrSubido = await subirArchivo(Buffer.from(resultado.zipCdrBase64, "base64"), "zapatillas-marcelo/facturacion/cdr", `R-${nombreArchivo}`);
      comprobante.cdrUrl = cdrSubido.secure_url;
    } else {
      comprobante.estado = "error";
      comprobante.observaciones = resultado.faultstring || "Error desconocido al enviar a SUNAT";
    }
  } catch (error) {
    comprobante.estado = "error";
    const detalle = error.name === "TimeoutError"
      ? "SUNAT no respondio a tiempo (25s). Su servicio Beta puede estar caido, intenta de nuevo en unos minutos."
      : error.cause?.message || error.message;
    comprobante.observaciones = `Error de conexion con SUNAT: ${detalle}`;
  }

  const xmlSubido = await subirArchivo(Buffer.from(xmlFirmado, "utf8"), "zapatillas-marcelo/facturacion/xml", nombreArchivo);
  comprobante.xmlUrl = xmlSubido.secure_url;
};

const emitirComprobante = async ({ tipo, cliente, items }) => {
  const { config, usuarioSol, claveSol, clavePrivadaPem, certificadoPem } = await obtenerConfigConCredenciales();

  const serie = config.series[tipo];
  const correlativo = await obtenerSiguienteCorrelativo(tipo);
  const tipoCode = TIPO_COMPROBANTE_CODE[tipo];
  const nombreArchivo = `${config.ruc}-${tipoCode}-${serie}-${correlativo}`;

  const ahora = new Date();
  const fechaEmision = ahora.toISOString().slice(0, 10);
  const horaEmision = ahora.toTimeString().slice(0, 8);

  const emisor = {
    ruc: config.ruc,
    razonSocial: config.razonSocial,
    nombreComercial: config.nombreComercial,
    direccion: config.direccion,
  };

  const xml = generarXmlComprobante({ tipo, serie, correlativo, fechaEmision, horaEmision, emisor, cliente, items });
  const xmlFirmado = firmarXml(xml, clavePrivadaPem, certificadoPem);
  const zipBuffer = await crearZipComprobante(nombreArchivo, xmlFirmado);

  const { subtotal, igv, total } = calcularTotales(items);

  const comprobante = new Comprobante({
    tipo,
    serie,
    correlativo,
    cliente,
    items,
    subtotal,
    igv,
    total,
    ambiente: config.ambiente,
    estado: "pendiente",
  });

  await enviarYGuardarResultado({ comprobante, config, usuarioSol, claveSol, nombreArchivo, zipBuffer, xmlFirmado });

  const pdfBuffer = await generarPdfComprobante(
    { ...comprobante.toObject(), fechaEmision, montoEnLetras: montoALetras(total, "PEN") },
    emisor
  );
  const pdfSubido = await subirArchivo(pdfBuffer, "zapatillas-marcelo/facturacion/pdf", nombreArchivo);
  comprobante.pdfUrl = pdfSubido.secure_url;

  await comprobante.save();
  await guardarClienteSiNoExiste(cliente);

  return comprobante;
};

const emitirNotaCredito = async ({ comprobanteAfectadoId, motivoCodigo, motivoDescripcion }) => {
  const comprobanteAfectado = await Comprobante.findById(comprobanteAfectadoId);
  if (!comprobanteAfectado) {
    throw new Error("No se encontro el comprobante a anular");
  }
  if (comprobanteAfectado.estado !== "aceptado") {
    throw new Error("Solo se puede anular un comprobante que haya sido aceptado por SUNAT");
  }
  if (comprobanteAfectado.anulado) {
    throw new Error("Este comprobante ya fue anulado con una Nota de Credito");
  }

  const { config, usuarioSol, claveSol, clavePrivadaPem, certificadoPem } = await obtenerConfigConCredenciales();

  const campoSerie = comprobanteAfectado.tipo === "factura" ? "notaCreditoFactura" : "notaCreditoBoleta";
  const serie = config.series[campoSerie];
  const correlativo = await obtenerSiguienteCorrelativo(campoSerie);
  const tipoCode = TIPO_COMPROBANTE_CODE.nota_credito;
  const nombreArchivo = `${config.ruc}-${tipoCode}-${serie}-${correlativo}`;

  const ahora = new Date();
  const fechaEmision = ahora.toISOString().slice(0, 10);
  const horaEmision = ahora.toTimeString().slice(0, 8);

  const emisor = {
    ruc: config.ruc,
    razonSocial: config.razonSocial,
    nombreComercial: config.nombreComercial,
    direccion: config.direccion,
  };

  const cliente = comprobanteAfectado.cliente;
  const items = comprobanteAfectado.items;
  const comprobanteAfectadoRef = {
    tipo: comprobanteAfectado.tipo,
    serie: comprobanteAfectado.serie,
    correlativo: comprobanteAfectado.correlativo,
  };

  const xml = generarXmlNotaCredito({
    serie,
    correlativo,
    fechaEmision,
    horaEmision,
    emisor,
    cliente,
    items,
    comprobanteAfectado: comprobanteAfectadoRef,
    motivoCodigo,
    motivoDescripcion,
  });
  const xmlFirmado = firmarXml(xml, clavePrivadaPem, certificadoPem);
  const zipBuffer = await crearZipComprobante(nombreArchivo, xmlFirmado);

  const { subtotal, igv, total } = calcularTotales(items);

  const notaCredito = new Comprobante({
    tipo: "nota_credito",
    serie,
    correlativo,
    cliente,
    items,
    subtotal,
    igv,
    total,
    ambiente: config.ambiente,
    estado: "pendiente",
    comprobanteAfectado: comprobanteAfectadoRef,
    motivoCodigo,
    motivoDescripcion,
  });

  await enviarYGuardarResultado({ comprobante: notaCredito, config, usuarioSol, claveSol, nombreArchivo, zipBuffer, xmlFirmado });

  const pdfBuffer = await generarPdfComprobante(
    { ...notaCredito.toObject(), fechaEmision, montoEnLetras: montoALetras(total, "PEN") },
    emisor
  );
  const pdfSubido = await subirArchivo(pdfBuffer, "zapatillas-marcelo/facturacion/pdf", nombreArchivo);
  notaCredito.pdfUrl = pdfSubido.secure_url;

  await notaCredito.save();

  if (notaCredito.estado === "aceptado") {
    comprobanteAfectado.anulado = true;
    await comprobanteAfectado.save();
  }

  return notaCredito;
};

// Reenvia a SUNAT el mismo XML firmado que ya se genero (sin volver a firmar).
// Si SUNAT ya lo habia recibido pese al error (por ejemplo, un timeout de red),
// devuelve el mismo CDR y no genera un comprobante duplicado.
const reenviarComprobante = async (comprobanteId) => {
  const comprobante = await Comprobante.findById(comprobanteId);
  if (!comprobante) {
    throw new Error("No se encontro el comprobante");
  }
  if (comprobante.estado !== "error") {
    throw new Error("Solo se pueden reenviar comprobantes en estado ERROR");
  }
  if (!comprobante.xmlUrl) {
    throw new Error("No se encontro el XML firmado de este comprobante para reenviarlo");
  }

  const { config, usuarioSol, claveSol } = await obtenerConfigConCredenciales();
  const tipoCode = TIPO_COMPROBANTE_CODE[comprobante.tipo];
  const nombreArchivo = `${config.ruc}-${tipoCode}-${comprobante.serie}-${comprobante.correlativo}`;

  const respuestaXml = await fetch(comprobante.xmlUrl);
  if (!respuestaXml.ok) {
    throw new Error("No se pudo descargar el XML guardado para reenviarlo");
  }
  const xmlFirmado = await respuestaXml.text();
  const zipBuffer = await crearZipComprobante(nombreArchivo, xmlFirmado);

  await enviarYGuardarResultado({ comprobante, config, usuarioSol, claveSol, nombreArchivo, zipBuffer, xmlFirmado });
  await comprobante.save();

  if (comprobante.tipo === "nota_credito" && comprobante.estado === "aceptado" && comprobante.comprobanteAfectado?.serie) {
    await Comprobante.updateOne(
      {
        tipo: comprobante.comprobanteAfectado.tipo,
        serie: comprobante.comprobanteAfectado.serie,
        correlativo: comprobante.comprobanteAfectado.correlativo,
        ambiente: comprobante.ambiente,
      },
      { anulado: true }
    );
  }

  return comprobante;
};

module.exports = { emitirComprobante, emitirNotaCredito, reenviarComprobante };
