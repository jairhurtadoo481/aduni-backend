// Endpoints públicos de la web: noticias y admisión en línea.
const crypto = require("crypto");
const Noticia = require("../models/Noticia");
const Postulacion = require("../models/Postulacion");
const Usuario = require("../models/Usuario");
const Aula = require("../models/Aula");
const { obtenerConfig } = require("../models/Configuracion");
const { GRADOS } = require("../lib/curriculo");
const { subirACloudinary } = require("../lib/subidas");
const { notificar, enviarCorreo } = require("../lib/notificar");
const { esFechaValida } = require("../lib/fechas");
const { h, texto } = require("./intranet/util");

const noticias = h(async (req, res) => {
  res.json(await Noticia.find({ publicada: true }).sort({ fecha: -1, createdAt: -1 }).limit(Number(req.query.limite) || 30).select("-contenido"));
});

const noticia = h(async (req, res) => {
  const n = await Noticia.findOne({ slug: String(req.params.slug), publicada: true });
  if (!n) return res.status(404).json({ mensaje: "Noticia no encontrada" });
  res.json(n);
});

const infoAdmision = h(async (req, res) => {
  const config = await obtenerConfig();
  const aulas = await Aula.find({ anio: config.anio }).select("nivel grado seccion capacidad");
  res.json({ anio: config.anio, montoMatricula: config.montoMatricula, montoPension: config.montoPension, grados: GRADOS, aulas: aulas.length });
});

const subirDocumento = h(async (req, res) => {
  if (!req.file) return res.status(400).json({ mensaje: "No se recibió el archivo" });
  res.json(await subirACloudinary(req.file, "admision"));
});

const postular = h(async (req, res) => {
  const b = req.body || {};
  const p = b.postulante || {};
  const a = b.apoderado || {};
  const nivel = b.nivel;
  const grado = Number(b.grado);
  if (!GRADOS[nivel] || !(grado >= 1 && grado <= GRADOS[nivel])) return res.status(400).json({ mensaje: "Elige nivel y grado" });
  if (!texto(p.nombres, 80) || !texto(p.apellidos, 80) || !/^\d{8}$/.test(p.dni || "")) return res.status(400).json({ mensaje: "Completa nombres, apellidos y DNI (8 dígitos) del postulante" });
  if (!texto(a.nombre, 120) || !/^\d{8}$/.test(a.dni || "") || !/^9\d{8}$/.test(String(a.celular || "").replace(/\D/g, ""))) {
    return res.status(400).json({ mensaje: "Completa nombre, DNI y celular (9 dígitos) del apoderado" });
  }
  if (b.aceptaPrivacidad !== true) return res.status(400).json({ mensaje: "Debes aceptar la política de privacidad" });
  const config = await obtenerConfig();
  if (await Postulacion.exists({ "postulante.dni": p.dni, estado: { $in: ["recibida", "en_evaluacion", "admitida"] } })) {
    return res.status(409).json({ mensaje: "Ya existe una postulación con ese DNI. Consulta su estado con tu código de seguimiento." });
  }
  const documentos = (Array.isArray(b.documentos) ? b.documentos : []).slice(0, 8)
    .filter((d) => /^https:\/\/res\.cloudinary\.com\//.test(d?.url || "")).map((d) => ({ nombre: texto(d.nombre, 120), url: d.url }));
  const codigo = `ADM-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
  const nueva = await Postulacion.create({
    codigoSeguimiento: codigo, anio: Number(b.anio) || config.anio, nivel, grado,
    postulante: {
      nombres: texto(p.nombres, 80), apellidos: texto(p.apellidos, 80), dni: p.dni,
      fechaNacimiento: esFechaValida(p.fechaNacimiento) ? p.fechaNacimiento : "", sexo: ["M", "F"].includes(p.sexo) ? p.sexo : "",
      colegioProcedencia: texto(p.colegioProcedencia, 120),
    },
    apoderado: {
      nombre: texto(a.nombre, 120), parentesco: texto(a.parentesco, 30), dni: a.dni, celular: String(a.celular).replace(/\D/g, ""),
      email: texto(a.email, 120).toLowerCase(), direccion: texto(a.direccion, 200),
    },
    documentos, comentario: texto(b.comentario, 1000),
  });
  const admins = await Usuario.find({ rol: "administrativo", activo: true }).select("_id");
  notificar(admins.map((x) => x._id), { titulo: "Nueva postulación de admisión", mensaje: `${nueva.postulante.apellidos}, ${nueva.postulante.nombres} · ${grado}.° ${nivel}`, tipo: "sistema", enlace: "/intranet/administrativo/admision" });
  enviarCorreo(nueva.apoderado.email, "Recibimos tu postulación - Colegio ADUNI+", `<p>Tu código de seguimiento es <b>${codigo}</b>. Te contactaremos para la evaluación.</p>`);
  res.status(201).json({ codigoSeguimiento: codigo });
});

const seguimiento = h(async (req, res) => {
  const p = await Postulacion.findOne({ codigoSeguimiento: String(req.params.codigo).toUpperCase(), "postulante.dni": String(req.query.dni || "") });
  if (!p) return res.status(404).json({ mensaje: "No encontramos una postulación con esos datos" });
  res.json({ codigo: p.codigoSeguimiento, postulante: `${p.postulante.nombres} ${p.postulante.apellidos}`, nivel: p.nivel, grado: p.grado, estado: p.estado, cita: p.cita, fecha: p.createdAt });
});

module.exports = { noticias, noticia, infoAdmision, subirDocumento, postular, seguimiento };
