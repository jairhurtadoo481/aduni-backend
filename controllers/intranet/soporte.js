const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Ticket = require("../../models/Ticket");
const Usuario = require("../../models/Usuario");
const Auditoria = require("../../models/Auditoria");
const ErrorSistema = require("../../models/ErrorSistema");
const Comprobante = require("../../models/Comprobante");
const FacturacionConfig = require("../../models/FacturacionConfig");
const Contador = require("../../models/Contador");
const Configuracion = require("../../models/Configuracion");
const { notificar, pushActivo, correoActivo } = require("../../lib/notificar");
const { auditar, alertarSoporte } = require("../../lib/auditar");
const { refrescarMantenimiento } = require("../../middleware/authMiddleware");
const { h, texto, esId } = require("./util");

const CATEGORIAS = Ticket.schema.path("categoria").enumValues;
const PRIORIDADES = Ticket.schema.path("prioridad").enumValues;
const ESTADOS = Ticket.schema.path("estado").enumValues;
const NOMBRE_ESTADO = { abierto: "Abierto", en_proceso: "En proceso", resuelto: "Resuelto", cerrado: "Cerrado" };
const PORTAL = { estudiante: "estudiante", profesor: "profesor", administrativo: "administrativo", apoderado: "familia" };

const adjuntoValido = (a) => (a && /^https:\/\/res\.cloudinary\.com\//.test(a.url || "") ? { url: a.url, nombre: texto(a.nombre, 120) } : undefined);
const enlaceTicket = (rol, id) => (rol === "soporte" ? `/intranet/soporte/tickets?id=${id}` : `/intranet/${PORTAL[rol] || "estudiante"}/ayuda?id=${id}`);
const escapar = (v) => texto(v, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const idsSoporte = async () => (await Usuario.find({ rol: "soporte", activo: true }).select("_id")).map((x) => x._id);

// =============== Mesa de ayuda (cualquier usuario) ===============
const misTickets = h(async (req, res) => {
  res.json(await Ticket.find({ usuario: req.usuarioId }).sort({ updatedAt: -1 }).limit(100).populate("mensajes.de", "nombre rol"));
});

const crearTicket = h(async (req, res) => {
  const asunto = texto(req.body.asunto, 150);
  const mensaje = texto(req.body.mensaje, 3000);
  if (!asunto || !mensaje) return res.status(400).json({ mensaje: "Escribe el asunto y describe el problema" });
  const abiertos = await Ticket.countDocuments({ usuario: req.usuarioId, estado: { $in: ["abierto", "en_proceso"] } });
  if (abiertos >= 10) return res.status(429).json({ mensaje: "Tienes muchas solicitudes abiertas. Espera a que soporte las atienda." });
  const c = await Contador.findOneAndUpdate({ _id: "ticket" }, { $inc: { valor: 1 } }, { upsert: true, returnDocument: "after" });
  const categoria = CATEGORIAS.includes(req.body.categoria) ? req.body.categoria : "otro";
  const t = await Ticket.create({
    codigo: `TCK-${String(c.valor).padStart(5, "0")}`, usuario: req.usuarioId, rol: req.usuarioRol, asunto, categoria,
    prioridad: categoria === "acceso" || categoria === "error" ? "alta" : "media",
    pagina: texto(req.body.pagina, 200),
    mensajes: [{ de: req.usuarioId, texto: mensaje, adjunto: adjuntoValido(req.body.adjunto) }],
  });
  const u = await Usuario.findById(req.usuarioId).select("nombre");
  alertarSoporte({ titulo: `Nueva solicitud ${t.codigo}: ${asunto}`.slice(0, 140), mensaje: `${u?.nombre || ""} (${req.usuarioRol})`, enlace: enlaceTicket("soporte", t._id) });
  res.status(201).json(t);
});

const responderMiTicket = h(async (req, res) => {
  const t = esId(req.params.id) ? await Ticket.findOne({ _id: req.params.id, usuario: req.usuarioId }) : null;
  if (!t) return res.status(404).json({ mensaje: "Solicitud no encontrada" });
  const msj = texto(req.body.texto, 3000);
  if (!msj) return res.status(400).json({ mensaje: "Escribe un mensaje" });
  t.mensajes.push({ de: req.usuarioId, texto: msj, adjunto: adjuntoValido(req.body.adjunto) });
  if (["resuelto", "cerrado"].includes(t.estado)) { t.estado = "abierto"; t.resueltoEn = null; }
  await t.save();
  notificar(t.asignado ? [t.asignado] : await idsSoporte(), { titulo: `Respuesta en ${t.codigo}`, mensaje: msj.slice(0, 120), enlace: enlaceTicket("soporte", t._id) });
  await t.populate("mensajes.de", "nombre rol");
  res.json(t);
});

// =============== Mesa de ayuda (soporte) ===============
const listarTickets = h(async (req, res) => {
  const filtro = {};
  if (ESTADOS.includes(req.query.estado)) filtro.estado = req.query.estado;
  else if (req.query.estado === "pendientes") filtro.estado = { $in: ["abierto", "en_proceso"] };
  if (CATEGORIAS.includes(req.query.categoria)) filtro.categoria = req.query.categoria;
  if (req.query.q) filtro.$or = [{ codigo: new RegExp(escapar(req.query.q), "i") }, { asunto: new RegExp(escapar(req.query.q), "i") }];
  res.json(await Ticket.find(filtro).sort({ updatedAt: -1 }).limit(300)
    .populate("usuario", "nombre codigo rol").populate("asignado", "nombre").populate("mensajes.de", "nombre rol"));
});

const actualizarTicket = h(async (req, res) => {
  const t = esId(req.params.id) ? await Ticket.findById(req.params.id) : null;
  if (!t) return res.status(404).json({ mensaje: "Solicitud no encontrada" });
  const antes = t.estado;
  if (ESTADOS.includes(req.body.estado)) t.estado = req.body.estado;
  if (PRIORIDADES.includes(req.body.prioridad)) t.prioridad = req.body.prioridad;
  if (req.body.asignarme) t.asignado = req.usuarioId;
  if (["resuelto", "cerrado"].includes(t.estado) && !t.resueltoEn) t.resueltoEn = new Date();
  if (["abierto", "en_proceso"].includes(t.estado)) t.resueltoEn = null;
  await t.save();
  if (antes !== t.estado) {
    notificar([t.usuario], { titulo: `Tu solicitud ${t.codigo}: ${NOMBRE_ESTADO[t.estado]}`, mensaje: t.asunto, enlace: enlaceTicket(t.rol, t._id) });
    await auditar(req, `Cambió estado de solicitud de soporte a ${NOMBRE_ESTADO[t.estado]}`, "Ticket", t._id, `${t.codigo}: ${t.asunto}`, "otro");
  }
  res.json(t);
});

const responderTicket = h(async (req, res) => {
  const t = esId(req.params.id) ? await Ticket.findById(req.params.id) : null;
  if (!t) return res.status(404).json({ mensaje: "Solicitud no encontrada" });
  const msj = texto(req.body.texto, 3000);
  if (!msj) return res.status(400).json({ mensaje: "Escribe un mensaje" });
  t.mensajes.push({ de: req.usuarioId, esSoporte: true, texto: msj, adjunto: adjuntoValido(req.body.adjunto) });
  if (!t.asignado) t.asignado = req.usuarioId;
  if (t.estado === "abierto") t.estado = "en_proceso";
  if (req.body.resolver) { t.estado = "resuelto"; t.resueltoEn = new Date(); }
  await t.save();
  notificar([t.usuario], { titulo: `Soporte respondió tu solicitud ${t.codigo}`, mensaje: msj.slice(0, 120), enlace: enlaceTicket(t.rol, t._id) });
  res.json(t);
});

// =============== Estado del sistema ===============
const ESTADO_MONGO = ["desconectada", "conectada", "conectando", "desconectando"];

const listarRespaldos = () => {
  const dir = path.join(__dirname, "..", "..", "backups");
  try {
    return fs.readdirSync(dir).filter((f) => f.endsWith(".zip")).map((f) => {
      const st = fs.statSync(path.join(dir, f));
      return { archivo: f, tamano: st.size, fecha: st.mtime };
    }).sort((a, b) => b.fecha - a.fecha);
  } catch {
    return [];
  }
};

const estadoSistema = h(async (req, res) => {
  const t0 = Date.now();
  let pingMs = null;
  try { await mongoose.connection.db.admin().ping(); pingMs = Date.now() - t0; } catch { /* sin conexión */ }
  const hace24 = new Date(Date.now() - 864e5);
  const hace7 = new Date(Date.now() - 7 * 864e5);
  const [porRol, bloqueadas, suspendidas, adminSin2FA, fallidos24, accesos24, ticketsAbiertos, ticketsUrgentes,
    errores24, ultimosErrores, alertas, factConfig, compError, compPendiente, config] = await Promise.all([
    Usuario.aggregate([{ $group: { _id: "$rol", total: { $sum: 1 }, activos: { $sum: { $cond: [{ $ne: ["$activo", false] }, 1, 0] } } } }]),
    Usuario.find({ bloqueadoHasta: { $gt: new Date() } }).select("nombre codigo rol bloqueadoHasta").limit(50),
    Usuario.countDocuments({ activo: false }),
    Usuario.countDocuments({ rol: { $in: ["administrativo", "soporte"] }, activo: { $ne: false }, totpActivo: { $ne: true } }),
    Auditoria.countDocuments({ accion: /fallido|incorrecto|inexistente/i, createdAt: { $gte: hace24 } }),
    Auditoria.countDocuments({ accion: /^Inició sesión/, createdAt: { $gte: hace24 } }),
    Ticket.countDocuments({ estado: { $in: ["abierto", "en_proceso"] } }),
    Ticket.countDocuments({ estado: { $in: ["abierto", "en_proceso"] }, prioridad: { $in: ["alta", "urgente"] } }),
    ErrorSistema.countDocuments({ createdAt: { $gte: hace24 } }),
    ErrorSistema.find().sort({ createdAt: -1 }).limit(5).select("-detalle"),
    Auditoria.find({ tipo: { $in: ["seguridad", "eliminar"] }, rol: { $ne: "soporte" }, createdAt: { $gte: hace7 } }).sort({ createdAt: -1 }).limit(15),
    FacturacionConfig.findOne().select("activo ambiente emitirAutomatico"),
    Comprobante.countDocuments({ estado: { $in: ["rechazado", "error"] } }),
    Comprobante.countDocuments({ estado: "pendiente" }),
    Configuracion.obtenerConfig(),
  ]);
  const respaldos = listarRespaldos();
  res.json({
    servidor: { uptime: Math.round(process.uptime()), memoriaMB: Math.round(process.memoryUsage().rss / 1048576), node: process.version, hora: new Date() },
    baseDatos: { estado: ESTADO_MONGO[mongoose.connection.readyState] || "desconocido", pingMs, nombre: mongoose.connection.name },
    servicios: {
      push: pushActivo, correo: correoActivo,
      whatsapp: !!(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_ID),
      cloudinary: !!(process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUDINARY_URL),
      sunat: factConfig ? { activo: factConfig.activo, ambiente: factConfig.ambiente, automatico: factConfig.emitirAutomatico } : null,
    },
    comprobantes: { conError: compError, pendientes: compPendiente },
    cuentas: { porRol, bloqueadas, suspendidas, adminSin2FA },
    accesos: { exitosos24h: accesos24, fallidos24h: fallidos24 },
    tickets: { abiertos: ticketsAbiertos, urgentes: ticketsUrgentes },
    errores: { ultimas24h: errores24, recientes: ultimosErrores },
    respaldos: { ultimo: respaldos[0] || null, total: respaldos.length, lista: respaldos.slice(0, 10) },
    mantenimiento: { activo: !!config.mantenimiento?.activo, mensaje: config.mantenimiento?.mensaje || "" },
    alertas,
  });
});

const errores = h(async (req, res) => {
  const filtro = req.query.q ? { $or: [{ ruta: new RegExp(escapar(req.query.q), "i") }, { mensaje: new RegExp(escapar(req.query.q), "i") }] } : {};
  res.json(await ErrorSistema.find(filtro).sort({ createdAt: -1 }).limit(200).populate("usuario", "nombre codigo"));
});

const mantenimiento = h(async (req, res) => {
  const config = await Configuracion.obtenerConfig();
  const activo = !!req.body.activo;
  config.mantenimiento = { activo, mensaje: texto(req.body.mensaje, 300) || config.mantenimiento?.mensaje || "" };
  await config.save();
  refrescarMantenimiento();
  await auditar(req, activo ? "Activó el modo mantenimiento" : "Desactivó el modo mantenimiento", "Sistema", "", config.mantenimiento.mensaje, "seguridad");
  res.json(config.mantenimiento);
});

module.exports = {
  misTickets, crearTicket, responderMiTicket,
  listarTickets, actualizarTicket, responderTicket,
  estadoSistema, errores, mantenimiento,
};
