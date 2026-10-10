// Tareas automáticas que corren dentro del servidor (cada hora).
// Las notificaciones usan una "clave" única, así que repetirlas no duplica avisos.
const Pension = require("../models/Pension");
const Usuario = require("../models/Usuario");
const { notificar, familiaDe } = require("./notificar");
const { hoy, horaActual } = require("./fechas");

const sumarDias = (f, n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);

const recordatoriosPensiones = async () => {
  const f = hoy();
  // 3 días antes del vencimiento
  const porVencer = await Pension.find({ estado: "pendiente", vencimiento: { $gte: f, $lte: sumarDias(f, 3) } }).select("estudiante concepto monto descuento vencimiento");
  for (const p of porVencer) {
    notificar(await familiaDe(p.estudiante), {
      titulo: `Recordatorio: ${p.concepto} vence el ${p.vencimiento.slice(8, 10)}/${p.vencimiento.slice(5, 7)}`,
      mensaje: `Monto: S/ ${(p.monto - p.descuento).toFixed(2)}. Puedes reportar tu pago con Yape desde la intranet.`,
      tipo: "pago", enlace: "/intranet/familia/pagos", clave: `porvencer-${p._id}`,
    });
  }
  // Primer aviso de cuota vencida (al día siguiente del vencimiento)
  const vencidas = await Pension.find({ estado: "pendiente", vencimiento: { $gte: sumarDias(f, -3), $lt: f } }).select("estudiante concepto monto descuento vencimiento");
  for (const p of vencidas) {
    const est = await Usuario.findById(p.estudiante).select("nombres");
    notificar(await familiaDe(p.estudiante), {
      titulo: `Cuota vencida: ${p.concepto}`,
      mensaje: `${est?.nombres || ""} · S/ ${(p.monto - p.descuento).toFixed(2)}. Si ya pagaste, reporta tu voucher en la intranet.`,
      tipo: "pago", enlace: "/intranet/familia/pagos", clave: `vencida-${p._id}`, whatsapp: true,
    });
  }
};

const ciclo = async () => {
  // Solo en horario razonable (8:00 a 20:00 hora de Perú)
  const h = horaActual();
  if (h < "08:00" || h > "20:00") return;
  try {
    await recordatoriosPensiones();
  } catch (e) {
    console.error("tareas programadas:", e.message);
  }
};

const iniciarTareasProgramadas = () => {
  setTimeout(ciclo, 30 * 1000);
  setInterval(ciclo, 60 * 60 * 1000);
};

module.exports = { iniciarTareasProgramadas };
