const Usuario = require("../../models/Usuario");
const Curso = require("../../models/Curso");
const Aula = require("../../models/Aula");
const Comunicado = require("../../models/Comunicado");
const Evento = require("../../models/Evento");
const { obtenerConfig, periodoDeFecha } = require("../../models/Configuracion");
const { hoy } = require("../../lib/fechas");
const { h, texto } = require("./util");
const { auditar } = require("../../lib/auditar");

// Aulas relacionadas con un docente (dicta algún curso o es tutor).
const aulasDelDocente = async (docenteId) => {
  const [cursos, tutorias] = await Promise.all([
    Curso.find({ docente: docenteId }).distinct("aula"),
    Aula.find({ tutor: docenteId }).distinct("_id"),
  ]);
  const ids = new Set([...cursos, ...tutorias].map(String));
  return [...ids];
};

const yo = h(async (req, res) => {
  const u = await Usuario.findById(req.usuarioId).select("-password").populate({ path: "aula", populate: { path: "tutor", select: "nombre" } }).populate({ path: "hijos", select: "nombre nombres codigo aula foto", populate: { path: "aula" } });
  res.json(u);
});

const actualizarPerfil = h(async (req, res) => {
  const { celular, direccion, email } = req.body;
  const cambios = {};
  if (celular !== undefined) cambios.celular = texto(celular, 20);
  if (direccion !== undefined) cambios.direccion = texto(direccion, 200);
  if (email !== undefined) {
    const e = texto(email, 120).toLowerCase();
    if (e && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return res.status(400).json({ mensaje: "Correo inválido" });
    cambios.email = e || undefined;
  }
  const u = await Usuario.findByIdAndUpdate(req.usuarioId, cambios, { returnDocument: "after" }).select("-password");
  res.json(u);
});

const cambiarPassword = h(async (req, res) => {
  const { actual, nueva } = req.body;
  if (typeof nueva !== "string" || nueva.length < 8) {
    return res.status(400).json({ mensaje: "La nueva contraseña debe tener al menos 8 caracteres" });
  }
  const u = await Usuario.findById(req.usuarioId);
  if (!(await u.compararPassword(String(actual ?? "")))) {
    return res.status(400).json({ mensaje: "La contraseña actual no es correcta" });
  }
  u.password = nueva;
  u.debeCambiarPassword = false;
  // Se resta 1 s para que el token nuevo (emitido justo después) siga siendo válido.
  u.passwordCambiadaEn = new Date(Date.now() - 1000);
  await u.save();
  await auditar(req, "Cambió su contraseña", "Usuario", u._id, "", "seguridad");
  res.json({ mensaje: "Contraseña actualizada. Vuelve a iniciar sesión." });
});

const filtroComunicados = async (req) => {
  if (req.usuarioRol === "administrativo") return {};
  if (req.usuarioRol === "estudiante") {
    const u = await Usuario.findById(req.usuarioId).select("aula");
    return { destinatarios: { $in: ["todos", "estudiante"] }, aula: { $in: [null, u.aula] } };
  }
  if (req.usuarioRol === "apoderado") {
    const yo = await Usuario.findById(req.usuarioId).select("hijos");
    const aulas = await Usuario.find({ _id: { $in: yo.hijos } }).distinct("aula");
    return { destinatarios: { $in: ["todos", "estudiante"] }, aula: { $in: [null, ...aulas] } };
  }
  const aulas = await aulasDelDocente(req.usuarioId);
  return { $or: [{ destinatarios: { $in: ["todos", "profesor"] }, aula: null }, { aula: { $in: aulas } }] };
};

const listarComunicados = h(async (req, res) => {
  const lista = await Comunicado.find(await filtroComunicados(req))
    .sort({ importante: -1, createdAt: -1 })
    .limit(Number(req.query.limite) || 50)
    .populate("autor", "nombre cargo")
    .populate("aula");
  res.json(lista);
});

const listarEventos = h(async (req, res) => {
  const desde = req.query.desde || `${new Date().getFullYear()}-01-01`;
  res.json(await Evento.find({ fecha: { $gte: desde } }).sort({ fecha: 1 }).limit(Number(req.query.limite) || 100));
});

const verConfig = h(async (req, res) => {
  const c = await obtenerConfig();
  res.json({ anio: c.anio, periodos: c.periodos, periodoActual: periodoDeFecha(c, hoy()), horaIngreso: c.horaIngreso, hoy: hoy() });
});

module.exports = { yo, actualizarPerfil, cambiarPassword, listarComunicados, listarEventos, verConfig, aulasDelDocente };
