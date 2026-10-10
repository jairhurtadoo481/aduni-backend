const QRCode = require("qrcode");
const { authenticator } = require("otplib");
const Usuario = require("../../models/Usuario");
const Aula = require("../../models/Aula");
const Curso = require("../../models/Curso");
const Mensaje = require("../../models/Mensaje");
const Notificacion = require("../../models/Notificacion");
const PushSuscripcion = require("../../models/PushSuscripcion");
const { subirACloudinary } = require("../../lib/subidas");
const { notificar, pushActivo } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");
const { h, texto, esId } = require("./util");
const { aulasDelDocente } = require("./comun");

// ---------- Notificaciones ----------
const misNotificaciones = h(async (req, res) => {
  const [lista, sinLeer] = await Promise.all([
    Notificacion.find({ usuario: req.usuarioId }).sort({ createdAt: -1 }).limit(40),
    Notificacion.countDocuments({ usuario: req.usuarioId, leida: false }),
  ]);
  res.json({ lista, sinLeer });
});

const marcarLeidas = h(async (req, res) => {
  const filtro = { usuario: req.usuarioId, leida: false };
  if (esId(req.body.id)) filtro._id = req.body.id;
  await Notificacion.updateMany(filtro, { leida: true });
  res.json({ ok: true });
});

const clavePush = h(async (req, res) => res.json({ clave: pushActivo ? process.env.VAPID_PUBLIC : null }));

const suscribirPush = h(async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!endpoint || !keys?.p256dh || !keys?.auth) return res.status(400).json({ mensaje: "Suscripción inválida" });
  await PushSuscripcion.findOneAndUpdate({ endpoint }, { usuario: req.usuarioId, endpoint, keys }, { upsert: true });
  res.json({ ok: true });
});

// ---------- Archivos ----------
const subirArchivo = h(async (req, res) => {
  if (!req.file) return res.status(400).json({ mensaje: "No se recibió ningún archivo" });
  const carpeta = ["tareas", "materiales", "vouchers", "justificaciones", "fotos", "noticias", "mensajes", "soporte"].includes(req.query.carpeta) ? req.query.carpeta : "otros";
  res.json(await subirACloudinary(req.file, carpeta));
});

const subirFoto = h(async (req, res) => {
  if (!req.file || !req.file.mimetype.startsWith("image/")) return res.status(400).json({ mensaje: "Sube una imagen" });
  // Un administrativo puede subir la foto de otro usuario (carné); los demás solo la propia.
  const destino = req.usuarioRol === "administrativo" && esId(req.query.usuario) ? req.query.usuario : req.usuarioId;
  const r = await subirACloudinary(req.file, "fotos");
  await Usuario.findByIdAndUpdate(destino, { foto: r.url });
  res.json({ foto: r.url });
});

// ---------- Verificación en dos pasos ----------
const iniciar2FA = h(async (req, res) => {
  const u = await Usuario.findById(req.usuarioId).select("+totpSecret");
  const secreto = authenticator.generateSecret();
  u.totpSecret = secreto;
  u.totpActivo = false;
  await u.save();
  const uri = authenticator.keyuri(u.codigo, "Intranet ADUNI+", secreto);
  res.json({ qr: await QRCode.toDataURL(uri), secreto });
});

const activar2FA = h(async (req, res) => {
  const u = await Usuario.findById(req.usuarioId).select("+totpSecret");
  if (!u.totpSecret || !authenticator.check(String(req.body.codigo || "").replace(/\s/g, ""), u.totpSecret)) {
    return res.status(400).json({ mensaje: "Código incorrecto. Revisa la hora de tu celular e inténtalo de nuevo." });
  }
  u.totpActivo = true;
  await u.save();
  await auditar(req, "Activó verificación en dos pasos", "Usuario", u._id);
  res.json({ mensaje: "Verificación en dos pasos activada" });
});

const desactivar2FA = h(async (req, res) => {
  const u = await Usuario.findById(req.usuarioId).select("+totpSecret");
  if (u.rol === "soporte") return res.status(400).json({ mensaje: "La cuenta de soporte técnico debe mantener la verificación en dos pasos" });
  if (!(await u.compararPassword(String(req.body.password || "")))) return res.status(400).json({ mensaje: "Contraseña incorrecta" });
  u.totpActivo = false;
  u.totpSecret = "";
  await u.save();
  await auditar(req, "Desactivó verificación en dos pasos", "Usuario", u._id);
  res.json({ mensaje: "Verificación en dos pasos desactivada" });
});

// ---------- Mensajería ----------
// Con quién puede escribir cada rol.
const contactosPermitidos = async (req) => {
  const yo = await Usuario.findById(req.usuarioId).select("rol aula hijos");
  const admins = () => Usuario.find({ rol: "administrativo", activo: true }).select("_id");
  const docentesDeAulas = async (aulas) => {
    const [cursos, tutores] = await Promise.all([Curso.find({ aula: { $in: aulas } }).distinct("docente"), Aula.find({ _id: { $in: aulas } }).distinct("tutor")]);
    return [...cursos, ...tutores].filter(Boolean);
  };
  let ids = [];
  if (yo.rol === "estudiante") ids = [...(await docentesDeAulas([yo.aula])), ...(await admins()).map((a) => a._id)];
  if (yo.rol === "apoderado") {
    const hijos = await Usuario.find({ _id: { $in: yo.hijos } }).select("aula");
    ids = [...(await docentesDeAulas(hijos.map((x) => x.aula).filter(Boolean))), ...(await admins()).map((a) => a._id)];
  }
  if (yo.rol === "profesor") {
    const aulas = await aulasDelDocente(req.usuarioId);
    const est = await Usuario.find({ rol: "estudiante", aula: { $in: aulas }, activo: true }).select("_id");
    const apod = await Usuario.find({ rol: "apoderado", hijos: { $in: est.map((e) => e._id) }, activo: true }).select("_id");
    const otros = await Usuario.find({ rol: { $in: ["profesor", "administrativo"] }, activo: true }).select("_id");
    ids = [...est, ...apod, ...otros].map((x) => x._id);
  }
  if (yo.rol === "administrativo") return null; // sin restricción
  return new Set(ids.map(String).filter((x) => x !== req.usuarioId));
};

const contactos = h(async (req, res) => {
  const permitidos = await contactosPermitidos(req);
  const filtro = { activo: true, _id: { $ne: req.usuarioId } };
  if (permitidos) filtro._id = { $in: [...permitidos] };
  if (req.query.q) {
    const q = texto(req.query.q, 40).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtro.$or = [{ nombre: new RegExp(q, "i") }, { codigo: new RegExp(q, "i") }];
  } else if (!permitidos) {
    filtro.rol = { $in: ["profesor", "administrativo"] };
  }
  const lista = await Usuario.find(filtro).select("nombre rol codigo especialidad cargo aula hijos").populate("aula").populate("hijos", "nombre").sort({ rol: 1, nombre: 1 }).limit(100);
  res.json(lista);
});

const conversaciones = h(async (req, res) => {
  const yo = req.usuarioId;
  const msgs = await Mensaje.find({ $or: [{ de: yo }, { para: yo }] }).sort({ createdAt: -1 }).limit(500);
  const porContacto = new Map();
  for (const m of msgs) {
    const otro = String(m.de) === yo ? String(m.para) : String(m.de);
    if (!porContacto.has(otro)) porContacto.set(otro, { ultimo: m, sinLeer: 0 });
    if (String(m.para) === yo && !m.leido) porContacto.get(otro).sinLeer++;
  }
  const usuarios = await Usuario.find({ _id: { $in: [...porContacto.keys()] } }).select("nombre rol codigo cargo especialidad");
  res.json(usuarios.map((u) => ({ usuario: u, ...porContacto.get(String(u._id)) })).sort((a, b) => b.ultimo.createdAt - a.ultimo.createdAt));
});

const hilo = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "No encontrado" });
  const yo = req.usuarioId;
  const otro = req.params.id;
  const [usuario, mensajes] = await Promise.all([
    Usuario.findById(otro).select("nombre rol codigo cargo especialidad"),
    Mensaje.find({ $or: [{ de: yo, para: otro }, { de: otro, para: yo }] }).sort({ createdAt: 1 }).limit(300),
  ]);
  await Mensaje.updateMany({ de: otro, para: yo, leido: false }, { leido: true });
  res.json({ usuario, mensajes });
});

const enviarMensaje = h(async (req, res) => {
  const { para, adjunto } = req.body;
  const t = texto(req.body.texto, 2000);
  if (!esId(para) || (!t && !adjunto?.url)) return res.status(400).json({ mensaje: "Escribe un mensaje" });
  const permitidos = await contactosPermitidos(req);
  if (permitidos && !permitidos.has(String(para))) return res.status(403).json({ mensaje: "No puedes escribir a este usuario" });
  const m = await Mensaje.create({ de: req.usuarioId, para, texto: t || "(archivo adjunto)", adjunto: adjunto?.url ? { url: texto(adjunto.url, 500), nombre: texto(adjunto.nombre, 150) } : undefined });
  const yo = await Usuario.findById(req.usuarioId).select("nombre rol");
  const destino = await Usuario.findById(para).select("rol");
  const portal = { estudiante: "estudiante", apoderado: "familia", profesor: "profesor", administrativo: "administrativo" }[destino?.rol];
  notificar([para], { titulo: `Mensaje de ${yo.nombre}`, mensaje: t.slice(0, 120), tipo: "mensaje", enlace: `/intranet/${portal}/mensajes?con=${req.usuarioId}` });
  res.status(201).json(m);
});

const mensajesSinLeer = h(async (req, res) => res.json({ sinLeer: await Mensaje.countDocuments({ para: req.usuarioId, leido: false }) }));

module.exports = {
  misNotificaciones, marcarLeidas, clavePush, suscribirPush, subirArchivo, subirFoto,
  iniciar2FA, activar2FA, desactivar2FA, contactos, conversaciones, hilo, enviarMensaje, mensajesSinLeer,
};
