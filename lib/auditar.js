const Auditoria = require("../models/Auditoria");
const Usuario = require("../models/Usuario");
const { notificar } = require("./notificar");

// Clasifica la acción para poder filtrar la bitácora (crear / modificar / eliminar / seguridad / pago...).
const tipoDe = (accion) => {
  if (/contraseña|dos pasos|sesión|sesiones|acceso|bloque|desbloque|mantenimiento/i.test(accion)) return "seguridad";
  if (/pago|recibo|boleta|comprobante|caja|beca|pensi/i.test(accion)) return "pago";
  if (/^(elimin|anul|quit|borr)/i.test(accion)) return "eliminar";
  if (/^(cre|registr|import|gener|matricul|public|agreg|emit|subi)/i.test(accion)) return "crear";
  return "modificar";
};

// Avisa a todas las cuentas de soporte técnico (campana + push).
const alertarSoporte = async ({ titulo, mensaje = "", enlace = "/intranet/soporte/bitacora", tipo = "sistema" }) => {
  try {
    const soportes = await Usuario.find({ rol: "soporte", activo: true }).select("_id");
    await notificar(soportes.map((s) => s._id), { titulo, mensaje, tipo, enlace });
  } catch (e) {
    console.error("alerta soporte:", e.message);
  }
};

// Acciones sensibles que soporte debe conocer al momento.
const ES_ALERTA = /^(Elimin|Restableci|Suspendi|Cambió áreas|Quitó la verificación|Cerró las sesiones|Desbloque|Descargó respaldo|Anul|Modificó configuración de facturación)/i;
const esAlerta = (accion, detalle) => ES_ALERTA.test(accion) || (/^Creó usuario/.test(accion) && /^(administrativo|soporte)/.test(String(detalle)));

// Registra una acción en la bitácora. Nunca interrumpe la operación principal.
const auditar = async (req, accion, entidad = "", entidadId = "", detalle = "", tipo) => {
  try {
    const u = await Usuario.findById(req.usuarioId).select("nombre rol");
    await Auditoria.create({
      usuario: req.usuarioId, nombre: u?.nombre || "", rol: u?.rol || req.usuarioRol || "",
      accion, tipo: tipo || tipoDe(accion), entidad, entidadId: String(entidadId || ""), detalle: String(detalle).slice(0, 500), ip: req.ip || "",
    });
    if (u?.rol !== "soporte" && esAlerta(accion, detalle)) {
      alertarSoporte({ titulo: `${u?.nombre || "Alguien"}: ${accion}`.slice(0, 140), mensaje: String(detalle).slice(0, 200) });
    }
  } catch (e) {
    console.error("auditoría:", e.message);
  }
};

// Inicios de sesión, intentos fallidos y cambios de contraseña (sin request autenticado).
const registrarAcceso = async ({ usuario, nombre, rol, accion, detalle = "", ip = "" }) => {
  try {
    await Auditoria.create({ usuario: usuario || undefined, nombre, rol, accion, tipo: /^(Restableció|Cambió|Cuenta bloqueada)/.test(accion) ? "seguridad" : "acceso", entidad: "Usuario", entidadId: String(usuario || ""), detalle, ip });
  } catch (e) {
    console.error("auditoría:", e.message);
  }
};

module.exports = { auditar, registrarAcceso, alertarSoporte, tipoDe };
