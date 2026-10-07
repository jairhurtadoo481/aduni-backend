const FacturacionConfig = require("../models/FacturacionConfig");
const Cliente = require("../models/Cliente");
const Comprobante = require("../models/Comprobante");
const FactilizaToken = require("../models/FactilizaToken");
const { consultarDocumento, DURACION_CICLO_DIAS } = require("../lib/factiliza");
const bcrypt = require("bcryptjs");
const JSZip = require("jszip");
const { cifrar, descifrar } = require("../config/cifrado");
const { emitirComprobante, emitirNotaCredito, reenviarComprobante } = require("../lib/emitirComprobante");
const { generarTokenFacturacion } = require("../middleware/facturacionMiddleware");
const { leerCertificadoP12 } = require("../lib/certificado");
const { calcularTotales } = require("../lib/calculosComprobante");
const { validarClienteParaEmision } = require("../lib/validacionesFacturacion");

const MAX_INTENTOS_CODIGO = 5;
const MINUTOS_BLOQUEO_CODIGO = 15;

const MOTIVOS_NOTA_CREDITO = {
  "01": "Anulacion de la operacion",
  "02": "Anulacion por error en el RUC",
  "03": "Correccion por error en la descripcion",
  "04": "Descuento global",
  "05": "Descuento por item",
  "06": "Devolucion total",
  "07": "Devolucion por item",
  "10": "Otros conceptos",
};

const obtenerConfigDoc = async () => {
  let config = await FacturacionConfig.findOne();
  if (!config) {
    config = new FacturacionConfig();
    await config.save();
  }
  return config;
};

const desbloquear = async (req, res) => {
  try {
    const { codigo } = req.body;
    if (!codigo) {
      return res.status(400).json({ mensaje: "Falta el codigo de acceso" });
    }

    const config = await obtenerConfigDoc();
    if (!config.claveAccesoHash) {
      return res.status(403).json({ mensaje: "El codigo de acceso a facturacion no esta configurado" });
    }

    const ahora = new Date();
    if (config.bloqueadoHasta && config.bloqueadoHasta > ahora) {
      const minutos = Math.ceil((config.bloqueadoHasta - ahora) / 60000);
      return res.status(429).json({ mensaje: `Demasiados intentos. Intenta de nuevo en ${minutos} minuto(s).` });
    }

    const correcto = await bcrypt.compare(String(codigo), config.claveAccesoHash);
    if (!correcto) {
      config.intentosFallidos += 1;
      if (config.intentosFallidos >= MAX_INTENTOS_CODIGO) {
        config.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO_CODIGO * 60000);
        config.intentosFallidos = 0;
      }
      await config.save();
      return res.status(401).json({ mensaje: "Codigo incorrecto" });
    }

    if (config.intentosFallidos !== 0 || config.bloqueadoHasta) {
      config.intentosFallidos = 0;
      config.bloqueadoHasta = null;
      await config.save();
    }
    res.json({ token: generarTokenFacturacion(req.usuarioId) });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al validar el codigo de acceso", error: error.message });
  }
};

const obtenerInfoCertificado = (config) => {
  if (!config.certificadoCifrado || !config.claveCertificadoCifrada) return null;
  try {
    const buffer = descifrar(config.certificadoCifrado);
    const clave = descifrar(config.claveCertificadoCifrada).toString("utf8");
    const { validoHasta } = leerCertificadoP12(buffer, clave);
    const diasRestantes = Math.ceil((new Date(validoHasta).getTime() - Date.now()) / 86400000);
    return { vigenteHasta: validoHasta, diasRestantes };
  } catch (error) {
    return { error: "No se pudo leer la fecha de vencimiento del certificado" };
  }
};

const obtenerConfiguracion = async (req, res) => {
  try {
    const config = await obtenerConfigDoc();
    res.json({
      ruc: config.ruc,
      razonSocial: config.razonSocial,
      nombreComercial: config.nombreComercial,
      direccion: config.direccion,
      ambiente: config.ambiente,
      series: config.series,
      correlativos: config.correlativos,
      tieneCertificado: Boolean(config.certificadoCifrado),
      tieneCredencialesSol: Boolean(config.usuarioSolCifrado && config.claveSolCifrada),
      certificado: obtenerInfoCertificado(config),
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener configuracion de facturacion", error: error.message });
  }
};

const guardarDatosEmpresa = async (req, res) => {
  try {
    const {
      ruc, razonSocial, nombreComercial, direccion, ambiente,
      serieBoleta, serieFactura, serieNotaCreditoBoleta, serieNotaCreditoFactura,
    } = req.body;
    const config = await obtenerConfigDoc();
    if (ruc !== undefined) config.ruc = ruc;
    if (razonSocial !== undefined) config.razonSocial = razonSocial;
    if (nombreComercial !== undefined) config.nombreComercial = nombreComercial;
    if (direccion !== undefined) config.direccion = direccion;
    if (ambiente !== undefined) config.ambiente = ambiente;
    if (serieBoleta !== undefined && serieBoleta !== config.series.boleta) {
      config.series.boleta = serieBoleta;
      config.correlativos.boleta = 0;
    }
    if (serieFactura !== undefined && serieFactura !== config.series.factura) {
      config.series.factura = serieFactura;
      config.correlativos.factura = 0;
    }
    if (serieNotaCreditoBoleta !== undefined && serieNotaCreditoBoleta !== config.series.notaCreditoBoleta) {
      config.series.notaCreditoBoleta = serieNotaCreditoBoleta;
      config.correlativos.notaCreditoBoleta = 0;
    }
    if (serieNotaCreditoFactura !== undefined && serieNotaCreditoFactura !== config.series.notaCreditoFactura) {
      config.series.notaCreditoFactura = serieNotaCreditoFactura;
      config.correlativos.notaCreditoFactura = 0;
    }
    await config.save();
    res.json({ mensaje: "Datos de la empresa guardados" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al guardar datos de la empresa", error: error.message });
  }
};

const guardarCredencialesSol = async (req, res) => {
  try {
    const { usuarioSol, claveSol } = req.body;
    if (!usuarioSol || !claveSol) {
      return res.status(400).json({ mensaje: "Falta usuario o clave SOL" });
    }
    const config = await obtenerConfigDoc();
    config.usuarioSolCifrado = cifrar(usuarioSol);
    config.claveSolCifrada = cifrar(claveSol);
    await config.save();
    res.json({ mensaje: "Credenciales SOL guardadas" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al guardar credenciales SOL", error: error.message });
  }
};

const subirCertificado = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: "No se envio ningun archivo" });
    }
    const { claveCertificado } = req.body;
    if (!claveCertificado) {
      return res.status(400).json({ mensaje: "Falta la clave del certificado" });
    }
    const config = await obtenerConfigDoc();
    config.certificadoCifrado = cifrar(req.file.buffer);
    config.claveCertificadoCifrada = cifrar(claveCertificado);
    await config.save();
    res.json({ mensaje: "Certificado guardado" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al guardar el certificado", error: error.message });
  }
};

const buscarDocumento = async (req, res) => {
  try {
    const { tipo, numero } = req.params;
    if (tipo !== "dni" && tipo !== "ruc") {
      return res.status(400).json({ mensaje: "Tipo de documento invalido" });
    }
    if (tipo === "dni" && !/^\d{8}$/.test(numero)) {
      return res.status(400).json({ mensaje: "El DNI debe tener 8 digitos" });
    }
    if (tipo === "ruc" && !/^\d{11}$/.test(numero)) {
      return res.status(400).json({ mensaje: "El RUC debe tener 11 digitos" });
    }

    const clienteExistente = await Cliente.findOne({ documento: numero });
    if (clienteExistente) {
      return res.json({
        documento: clienteExistente.documento,
        nombre: clienteExistente.nombre,
        direccion: clienteExistente.direccion,
        telefono: clienteExistente.telefono || "",
        correo: clienteExistente.correo || "",
        contacto: clienteExistente.contacto || "",
        referencia: clienteExistente.referencia || "",
        esClienteConocido: true,
      });
    }

    let respuesta, data;
    try {
      ({ respuesta, data } = await consultarDocumento(tipo, numero));
    } catch (error) {
      return res.status(502).json({ mensaje: error.message });
    }

    if (!respuesta.ok || !data.success) {
      return res.status(404).json({ mensaje: "No se encontro el documento" });
    }

    const resultado = tipo === "dni"
      ? { documento: data.data.numero, nombre: data.data.nombre_completo, direccion: data.data.direccion_completa || "" }
      : { documento: data.data.numero, nombre: data.data.nombre_o_razon_social, direccion: data.data.direccion_completa || "" };

    await Cliente.findOneAndUpdate(
      { documento: resultado.documento },
      { $setOnInsert: { tipoDocumento: tipo.toUpperCase() }, $set: { nombre: resultado.nombre, direccion: resultado.direccion } },
      { upsert: true }
    );

    res.json({ ...resultado, esClienteConocido: false });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al consultar el documento", error: error.message });
  }
};

const infoToken = (t) => ({
  _id: t._id,
  etiqueta: t.etiqueta,
  usados: t.usados,
  limite: t.limite,
  activo: t.activo,
  cicloInicio: t.cicloInicio,
  proximoReinicio: new Date(t.cicloInicio.getTime() + DURACION_CICLO_DIAS * 86400000),
});

const listarFactilizaTokens = async (req, res) => {
  try {
    const tokens = await FactilizaToken.find().sort({ createdAt: 1 });
    res.json(tokens.map(infoToken));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al listar las cuentas de Factiliza", error: error.message });
  }
};

const agregarFactilizaToken = async (req, res) => {
  try {
    const { token, etiqueta, usadosIniciales, limite } = req.body;
    if (!token || !token.trim()) {
      return res.status(400).json({ mensaje: "Falta el token de la cuenta" });
    }
    const nuevo = await FactilizaToken.create({
      tokenCifrado: cifrar(token.trim()),
      etiqueta: (etiqueta || "").trim(),
      usados: Math.max(0, Number(usadosIniciales) || 0),
      limite: Number(limite) > 0 ? Number(limite) : 98,
    });
    res.json(infoToken(nuevo));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al agregar la cuenta de Factiliza", error: error.message });
  }
};

const actualizarFactilizaToken = async (req, res) => {
  try {
    const cambios = {};
    if (req.body.activo !== undefined) cambios.activo = Boolean(req.body.activo);
    if (req.body.etiqueta !== undefined) cambios.etiqueta = String(req.body.etiqueta).trim();
    if (req.body.reiniciarContador) {
      cambios.usados = 0;
      cambios.cicloInicio = new Date();
    }
    const actualizado = await FactilizaToken.findByIdAndUpdate(req.params.id, cambios, { returnDocument: "after" });
    if (!actualizado) {
      return res.status(404).json({ mensaje: "Cuenta no encontrada" });
    }
    res.json(infoToken(actualizado));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar la cuenta de Factiliza", error: error.message });
  }
};

const eliminarFactilizaToken = async (req, res) => {
  try {
    const eliminado = await FactilizaToken.findByIdAndDelete(req.params.id);
    if (!eliminado) {
      return res.status(404).json({ mensaje: "Cuenta no encontrada" });
    }
    res.json({ mensaje: "Cuenta eliminada" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar la cuenta de Factiliza", error: error.message });
  }
};

const guardarCliente = async (req, res) => {
  try {
    const { documento } = req.params;
    const { tipoDocumento, nombre, direccion, telefono, correo, contacto, referencia } = req.body;
    if (!tipoDocumento || !nombre) {
      return res.status(400).json({ mensaje: "Faltan datos del cliente" });
    }
    const cliente = await Cliente.findOneAndUpdate(
      { documento },
      {
        tipoDocumento,
        nombre,
        direccion: direccion || "",
        telefono: telefono || "",
        correo: correo || "",
        contacto: contacto || "",
        referencia: referencia || "",
      },
      { upsert: true, returnDocument: "after" }
    );
    res.json(cliente);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al guardar el cliente", error: error.message });
  }
};

const emitir = async (req, res) => {
  try {
    const { tipo, cliente, items } = req.body;
    if (tipo !== "factura" && tipo !== "boleta") {
      return res.status(400).json({ mensaje: "Tipo de comprobante invalido" });
    }
    if (!cliente || !cliente.tipoDocumento || !cliente.documento || !cliente.nombre) {
      return res.status(400).json({ mensaje: "Faltan datos del cliente" });
    }
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ mensaje: "El comprobante debe tener al menos un item" });
    }

    const { total } = calcularTotales(items);
    const errorCliente = validarClienteParaEmision({ tipo, cliente, total });
    if (errorCliente) {
      return res.status(400).json({ mensaje: errorCliente });
    }

    const comprobante = await emitirComprobante({ tipo, cliente, items });
    res.json(comprobante);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al emitir el comprobante", error: error.message });
  }
};

const reenviar = async (req, res) => {
  try {
    const comprobante = await reenviarComprobante(req.params.id);
    res.json(comprobante);
  } catch (error) {
    res.status(400).json({ mensaje: error.message });
  }
};

const emitirNota = async (req, res) => {
  try {
    const { comprobanteId, motivoCodigo } = req.body;
    if (!comprobanteId) {
      return res.status(400).json({ mensaje: "Falta el comprobante a anular" });
    }
    if (!motivoCodigo || !MOTIVOS_NOTA_CREDITO[motivoCodigo]) {
      return res.status(400).json({ mensaje: "Motivo de la nota de credito invalido" });
    }

    const notaCredito = await emitirNotaCredito({
      comprobanteAfectadoId: comprobanteId,
      motivoCodigo,
      motivoDescripcion: MOTIVOS_NOTA_CREDITO[motivoCodigo],
    });
    res.json(notaCredito);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al emitir la nota de credito", error: error.message });
  }
};

const listarComprobantes = async (req, res) => {
  try {
    const comprobantes = await Comprobante.find().sort({ createdAt: -1 }).limit(200).lean();

    const documentos = [...new Set(comprobantes.map((c) => c.cliente.documento))];
    const clientes = await Cliente.find({ documento: { $in: documentos } }).select("documento telefono").lean();
    const telefonoPorDocumento = new Map(clientes.map((c) => [c.documento, c.telefono || ""]));

    res.json(comprobantes.map((c) => ({ ...c, clienteTelefono: telefonoPorDocumento.get(c.cliente.documento) || "" })));
  } catch (error) {
    res.status(500).json({ mensaje: "Error al listar comprobantes", error: error.message });
  }
};

const rangoDelMes = (query) => {
  const anio = Number(query.anio);
  const mes = Number(query.mes);
  if (!anio || !mes || mes < 1 || mes > 12) return null;
  return { anio, mes, desde: new Date(anio, mes - 1, 1), hasta: new Date(anio, mes, 1) };
};

const escaparCsv = (valor) => {
  const texto = String(valor ?? "");
  return /[",\n;]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
};

const ENCABEZADO_REPORTE = ["Fecha", "Tipo", "Serie", "Correlativo", "Cliente", "Documento", "Moneda", "Base Imponible", "IGV", "Total", "Estado", "Ambiente"];

const obtenerFilasReporte = async (rango) => {
  const comprobantes = await Comprobante.find({ createdAt: { $gte: rango.desde, $lt: rango.hasta } })
    .sort({ createdAt: 1 })
    .lean();

  const filas = comprobantes.map((c) => [
    new Date(c.createdAt).toLocaleString("es-PE"),
    c.tipo,
    c.serie,
    c.correlativo,
    c.cliente.nombre,
    c.cliente.documento,
    c.moneda,
    c.subtotal.toFixed(2),
    c.igv.toFixed(2),
    c.total.toFixed(2),
    c.anulado ? "ANULADO" : c.estado.toUpperCase(),
    c.ambiente,
  ]);

  return { encabezado: ENCABEZADO_REPORTE, filas };
};

const generarReporteCsv = async (req, res) => {
  try {
    const rango = rangoDelMes(req.query);
    if (!rango) {
      return res.status(400).json({ mensaje: "Indica un anio y un mes validos" });
    }
    const { encabezado, filas } = await obtenerFilasReporte(rango);
    const csv = [encabezado, ...filas].map((fila) => fila.map(escaparCsv).join(",")).join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="reporte-${rango.anio}-${String(rango.mes).padStart(2, "0")}.csv"`);
    res.send("﻿" + csv);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al generar el reporte", error: error.message });
  }
};

const enviarReporteGoogleSheets = async (req, res) => {
  try {
    const rango = rangoDelMes(req.query);
    if (!rango) {
      return res.status(400).json({ mensaje: "Indica un anio y un mes validos" });
    }

    const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL;
    const secreto = process.env.GOOGLE_SHEETS_WEBHOOK_SECRET;
    if (!webhookUrl || !secreto) {
      return res.status(400).json({
        mensaje: "No se ha configurado la conexion con Google Sheets (falta la URL o la clave en el servidor)",
      });
    }

    const { encabezado, filas } = await obtenerFilasReporte(rango);

    const respuesta = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clave: secreto, anio: rango.anio, mes: rango.mes, encabezado, filas }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await respuesta.json().catch(() => ({}));

    if (!respuesta.ok || data.ok !== true) {
      return res.status(502).json({ mensaje: data.mensaje || "Google Sheets no acepto los datos enviados" });
    }
    res.json({ mensaje: `Se enviaron ${filas.length} comprobantes a Google Sheets`, filas: filas.length });
  } catch (error) {
    const detalle = error.name === "TimeoutError" ? "Google Sheets no respondio a tiempo" : error.message;
    res.status(500).json({ mensaje: "Error al enviar el reporte a Google Sheets", error: detalle });
  }
};

const generarReporteZip = async (req, res) => {
  try {
    const rango = rangoDelMes(req.query);
    if (!rango) {
      return res.status(400).json({ mensaje: "Indica un anio y un mes validos" });
    }
    const comprobantes = await Comprobante.find({ createdAt: { $gte: rango.desde, $lt: rango.hasta } })
      .sort({ createdAt: 1 })
      .lean();
    if (comprobantes.length === 0) {
      return res.status(404).json({ mensaje: "No hay comprobantes en ese mes" });
    }

    const zip = new JSZip();
    for (const c of comprobantes) {
      const nombreBase = `${c.tipo}_${c.serie}-${c.correlativo}`;
      if (c.xmlUrl) {
        try {
          const buffer = await (await fetch(c.xmlUrl)).arrayBuffer();
          zip.file(`xml/${nombreBase}.xml`, Buffer.from(buffer));
        } catch (error) {
          // si un archivo no se pudo descargar, seguimos con los demas
        }
      }
      if (c.cdrUrl) {
        try {
          const buffer = await (await fetch(c.cdrUrl)).arrayBuffer();
          zip.file(`cdr/R-${nombreBase}.zip`, Buffer.from(buffer));
        } catch (error) {
          // idem
        }
      }
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="comprobantes-${rango.anio}-${String(rango.mes).padStart(2, "0")}.zip"`);
    res.send(buffer);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al generar el archivo zip", error: error.message });
  }
};

module.exports = {
  desbloquear,
  obtenerConfiguracion,
  guardarDatosEmpresa,
  guardarCredencialesSol,
  subirCertificado,
  buscarDocumento,
  guardarCliente,
  emitir,
  emitirNota,
  reenviar,
  listarComprobantes,
  generarReporteCsv,
  generarReporteZip,
  enviarReporteGoogleSheets,
  listarFactilizaTokens,
  agregarFactilizaToken,
  actualizarFactilizaToken,
  eliminarFactilizaToken,
};
