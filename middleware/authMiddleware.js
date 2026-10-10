const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");
const Configuracion = require("../models/Configuracion");

// Estado de mantenimiento en memoria (se refresca cada 30 s para no consultar la BD en cada petición).
let mantenimiento = { activo: false, mensaje: "", leido: 0 };
const estadoMantenimiento = async () => {
  if (Date.now() - mantenimiento.leido > 30000) {
    const c = await Configuracion.obtenerConfig();
    mantenimiento = { activo: !!c.mantenimiento?.activo, mensaje: c.mantenimiento?.mensaje || "", leido: Date.now() };
  }
  return mantenimiento;
};
const refrescarMantenimiento = () => { mantenimiento.leido = 0; };

// Rutas que la cuenta de soporte puede usar ANTES de activar la verificación en dos pasos.
const PERMITIDO_SIN_2FA = ["/yo", "/perfil", "/password", "/2fa/iniciar", "/2fa/activar", "/notificaciones", "/mensajes/sin-leer", "/push/clave", "/config"];

const protegerRuta = async (req, res, next) => {
  if (!(req.headers.authorization && req.headers.authorization.startsWith("Bearer"))) {
    return res.status(401).json({ mensaje: "No autorizado, falta token" });
  }

  try {
    const token = req.headers.authorization.split(" ")[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const usuario = await Usuario.findById(decoded.id).select("rol activo passwordCambiadaEn sesionesCerradasEn areas totpActivo");
    if (!usuario || usuario.activo === false) {
      return res.status(401).json({ mensaje: "Token invalido o expirado" });
    }
    // Si se cambió la contraseña o se cerraron las sesiones, los tokens anteriores dejan de valer.
    const corte = Math.max(usuario.passwordCambiadaEn?.getTime() || 0, usuario.sesionesCerradasEn?.getTime() || 0);
    if (corte && decoded.iat < Math.floor(corte / 1000)) {
      return res.status(401).json({ mensaje: "Sesion cerrada, vuelve a iniciar sesion" });
    }
    if (usuario.rol !== "soporte") {
      const m = await estadoMantenimiento();
      if (m.activo) return res.status(503).json({ mensaje: m.mensaje, mantenimiento: true });
    } else if (!usuario.totpActivo && !PERMITIDO_SIN_2FA.includes(req.path)) {
      return res.status(403).json({ mensaje: "La cuenta de soporte debe activar la verificación en dos pasos (Mi perfil) antes de usar el sistema", requiere2FA: true });
    }

    req.usuarioId = String(usuario._id);
    req.usuarioRol = usuario.rol;
    req.areas = usuario.areas || [];
    next();
  } catch (error) {
    return res.status(401).json({ mensaje: "Token invalido o expirado" });
  }
};

const soloRol = (...roles) => (req, res, next) => {
  if (!roles.includes(req.usuarioRol)) {
    return res.status(403).json({ mensaje: "No tienes permiso para esto" });
  }
  next();
};

// Personal administrativo por área. Dirección y soporte técnico entran a todo.
const soloArea = (...areas) => (req, res, next) => {
  if (req.usuarioRol === "soporte") return next();
  if (req.usuarioRol !== "administrativo") return res.status(403).json({ mensaje: "No tienes permiso para esto" });
  if (req.areas.includes("direccion") || areas.some((a) => req.areas.includes(a))) return next();
  return res.status(403).json({ mensaje: "Tu área no tiene acceso a esta sección" });
};
const esSoporte = (req) => req.usuarioRol === "soporte";
const esDireccion = (req) => esSoporte(req) || (req.usuarioRol === "administrativo" && req.areas.includes("direccion"));

module.exports = protegerRuta;
module.exports.soloArea = soloArea;
module.exports.esDireccion = esDireccion;
module.exports.esSoporte = esSoporte;
module.exports.soloRol = soloRol;
module.exports.soloAdmin = soloRol("administrativo", "soporte");
module.exports.soloSoporte = soloRol("soporte");
module.exports.soloProfesor = soloRol("profesor");
module.exports.soloEstudiante = soloRol("estudiante");
module.exports.estadoMantenimiento = estadoMantenimiento;
module.exports.refrescarMantenimiento = refrescarMantenimiento;
