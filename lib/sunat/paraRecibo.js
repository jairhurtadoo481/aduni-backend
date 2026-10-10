// Emite la boleta electrónica correspondiente a un recibo de caja (pago de pensión/matrícula).
const Usuario = require("../../models/Usuario");
const Comprobante = require("../../models/Comprobante");
const { emitir, obtenerConfig, listoParaEmitir } = require("./emitir");

// Cliente de la boleta: el apoderado que paga (DNI). Si no hay DNI válido, "clientes varios" (solo < S/ 700).
const clienteDeRecibo = async (recibo, override) => {
  if (override?.documento) {
    const ruc = /^(10|20)\d{9}$/.test(override.documento);
    return { tipoDocumento: ruc ? "RUC" : "DNI", documento: override.documento, nombre: String(override.nombre || "").trim().toUpperCase().slice(0, 150) || "CLIENTE", direccion: override.direccion || "" };
  }
  const est = await Usuario.findById(recibo.estudiante).select("nombre apoderado");
  const dni = est?.apoderado?.dni;
  if (/^\d{8}$/.test(dni || "") && est.apoderado.nombre) return { tipoDocumento: "DNI", documento: dni, nombre: est.apoderado.nombre.toUpperCase() };
  return { tipoDocumento: "DNI", documento: "00000000", nombre: "CLIENTES VARIOS" };
};

const emitirParaRecibo = async (recibo, { tipo = "boleta", cliente: override, emitidoPor } = {}) => {
  const previo = await Comprobante.findOne({ recibo: recibo._id, tipo: { $in: ["boleta", "factura"] }, anulado: false, estado: { $in: ["aceptado", "pendiente"] } });
  if (previo) throw new Error(`Este recibo ya tiene el comprobante ${previo.serie}-${previo.correlativo}`);
  const est = await Usuario.findById(recibo.estudiante).select("nombre codigo");
  const cliente = await clienteDeRecibo(recibo, override);
  const items = recibo.conceptos.map((c) => ({
    descripcion: `${c.concepto} - ${est?.nombre || ""} (${est?.codigo || ""})`.slice(0, 250), cantidad: 1, precioUnitario: c.monto, afectacion: "20",
  }));
  return emitir({ tipo, cliente, items, recibo: recibo._id, estudiante: recibo.estudiante, emitidoPor });
};

// Llamado al registrar un pago: si la facturación está activa y en modo automático, emite sin bloquear el cobro.
const emitirAutomaticoSiCorresponde = async (recibo, emitidoPor) => {
  try {
    const config = await obtenerConfig();
    if (!listoParaEmitir(config) || !config.emitirAutomatico) return null;
    return await emitirParaRecibo(recibo, { emitidoPor });
  } catch (e) {
    console.error("emisión automática SUNAT:", e.message);
    return null;
  }
};

module.exports = { emitirParaRecibo, emitirAutomaticoSiCorresponde };
