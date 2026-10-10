// Docente: aula virtual, exámenes en línea, conducta, alertas tempranas y libretas de tutoría.
const Usuario = require("../../models/Usuario");
const Aula = require("../../models/Aula");
const Curso = require("../../models/Curso");
const Material = require("../../models/Material");
const Examen = require("../../models/Examen");
const Intento = require("../../models/Intento");
const Incidencia = require("../../models/Incidencia");
const AsistenciaPersonal = require("../../models/AsistenciaPersonal");
const { obtenerConfig } = require("../../models/Configuracion");
const { alertasTempranas, libretaDe } = require("../../lib/academico");
const { libretasPDF } = require("../../lib/pdf");
const { notificar, familiaDe, apoderadosDe } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");
const { hoy, esFechaValida } = require("../../lib/fechas");
const { h, texto, esId } = require("./util");
const { aulasDelDocente } = require("./comun");

const cursoPropio = async (req, res, id) => {
  const c = esId(id) ? await Curso.findOne({ _id: id, docente: req.usuarioId }).populate("aula") : null;
  if (!c) res.status(404).json({ mensaje: "Curso no encontrado" });
  return c;
};
const estudiantesDeAula = (aula) => Usuario.find({ rol: "estudiante", aula, activo: true }).select("_id nombre codigo").sort({ nombre: 1 });

// ---------------- Aula virtual ----------------
const materiales = h(async (req, res) => {
  const c = await cursoPropio(req, res, req.params.id);
  if (!c) return;
  res.json({ curso: c, materiales: await Material.find({ curso: c._id }).sort({ createdAt: -1 }) });
});

const crearMaterial = h(async (req, res) => {
  const c = await cursoPropio(req, res, req.params.id);
  if (!c) return;
  const { tipo, titulo, descripcion, url, nombreArchivo, unidad } = req.body;
  if (!["archivo", "enlace", "video", "anuncio"].includes(tipo) || !texto(titulo)) return res.status(400).json({ mensaje: "Tipo y título son obligatorios" });
  if (tipo !== "anuncio" && !/^https?:\/\//i.test(url || "")) return res.status(400).json({ mensaje: "Agrega un enlace o archivo válido" });
  const m = await Material.create({ curso: c._id, tipo, titulo: texto(titulo), descripcion: texto(descripcion, 3000), url: texto(url, 500), nombreArchivo: texto(nombreArchivo, 150), unidad: texto(unidad, 80) || "General", autor: req.usuarioId });
  await auditar(req, "Publicó material en aula virtual", "Material", m._id, `${c.nombre}: ${m.titulo}`);
  const est = await estudiantesDeAula(c.aula._id);
  notificar(est.map((e) => e._id), { titulo: tipo === "anuncio" ? `Anuncio en ${c.nombre}` : `Nuevo material en ${c.nombre}`, mensaje: m.titulo, tipo: "tarea", enlace: `/intranet/estudiante/aula-virtual?curso=${c._id}` });
  res.status(201).json(m);
});

const eliminarMaterial = h(async (req, res) => {
  const m = esId(req.params.id) ? await Material.findById(req.params.id).populate("curso", "docente") : null;
  if (!m || String(m.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "No encontrado" });
  await m.deleteOne();
  await auditar(req, "Eliminó material del aula virtual", "Material", m._id, m.titulo);
  res.json({ mensaje: "Eliminado" });
});

// ---------------- Exámenes ----------------
const validarPreguntas = (preguntas) => {
  if (!Array.isArray(preguntas) || !preguntas.length) return "Agrega al menos una pregunta";
  for (const [i, p] of preguntas.entries()) {
    const ops = (p.opciones || []).map((o) => texto(o, 500)).filter(Boolean);
    if (!texto(p.enunciado, 2000) || ops.length < 2) return `La pregunta ${i + 1} necesita enunciado y al menos 2 opciones`;
    if (!(Number(p.correcta) >= 0 && Number(p.correcta) < ops.length)) return `Marca la respuesta correcta de la pregunta ${i + 1}`;
  }
  return null;
};

const limpiarExamen = (b) => ({
  titulo: texto(b.titulo), instrucciones: texto(b.instrucciones, 2000),
  inicio: new Date(b.inicio), fin: new Date(b.fin), duracionMin: Math.min(300, Math.max(1, Number(b.duracionMin) || 30)),
  aleatorio: b.aleatorio !== false, mostrarResultados: b.mostrarResultados !== false,
  preguntas: b.preguntas.map((p) => {
    const opciones = p.opciones.map((o) => texto(o, 500)).filter(Boolean);
    return { enunciado: texto(p.enunciado, 2000), opciones, correcta: Number(p.correcta), puntaje: Math.max(0, Number(p.puntaje) || 1) };
  }),
});

const misExamenes = h(async (req, res) => {
  const cursos = await Curso.find({ docente: req.usuarioId }).populate("aula");
  const lista = await Examen.find({ curso: { $in: cursos.map((c) => c._id) } }).sort({ inicio: -1 }).populate({ path: "curso", select: "nombre color aula", populate: { path: "aula" } });
  const conteos = await Promise.all(lista.map((e) => Intento.countDocuments({ examen: e._id, enviadoEn: { $ne: null } })));
  res.json(lista.map((e, i) => ({ ...e.toObject(), enviados: conteos[i], numPreguntas: e.preguntas.length })));
});

const verExamen = h(async (req, res) => {
  const e = esId(req.params.id) ? await Examen.findById(req.params.id).populate("curso") : null;
  if (!e || String(e.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Examen no encontrado" });
  res.json(e);
});

const crearExamen = h(async (req, res) => {
  const c = await cursoPropio(req, res, req.body.curso);
  if (!c) return;
  const error = validarPreguntas(req.body.preguntas);
  if (error) return res.status(400).json({ mensaje: error });
  const datos = limpiarExamen(req.body);
  if (!datos.titulo || Number.isNaN(datos.inicio.getTime()) || Number.isNaN(datos.fin.getTime()) || datos.fin <= datos.inicio) {
    return res.status(400).json({ mensaje: "Título y un rango de fechas válido son obligatorios" });
  }
  const ex = await Examen.create({ ...datos, curso: c._id, autor: req.usuarioId, publicado: false });
  await auditar(req, "Creó examen en línea", "Examen", ex._id, `${c.nombre}: ${ex.titulo}`);
  res.status(201).json(ex);
});

const actualizarExamen = h(async (req, res) => {
  const e = esId(req.params.id) ? await Examen.findById(req.params.id).populate("curso") : null;
  if (!e || String(e.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Examen no encontrado" });
  if (await Intento.exists({ examen: e._id })) return res.status(400).json({ mensaje: "Ya hay estudiantes que iniciaron el examen; no se puede editar" });
  const error = validarPreguntas(req.body.preguntas);
  if (error) return res.status(400).json({ mensaje: error });
  Object.assign(e, limpiarExamen(req.body));
  await e.save();
  res.json(e);
});

const publicarExamen = h(async (req, res) => {
  const e = esId(req.params.id) ? await Examen.findById(req.params.id).populate("curso") : null;
  if (!e || String(e.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Examen no encontrado" });
  e.publicado = !!req.body.publicado;
  await e.save();
  await auditar(req, e.publicado ? "Publicó examen" : "Ocultó examen", "Examen", e._id, e.titulo);
  if (e.publicado) {
    const est = await estudiantesDeAula(e.curso.aula);
    const fecha = e.inicio.toLocaleString("es-PE", { timeZone: "America/Lima", dateStyle: "medium", timeStyle: "short" });
    notificar(est.map((x) => x._id), { titulo: `Examen programado: ${e.titulo}`, mensaje: `${e.curso.nombre} · desde ${fecha}`, tipo: "examen", enlace: "/intranet/estudiante/examenes", clave: `examen-${e._id}` });
  }
  res.json(e);
});

const eliminarExamen = h(async (req, res) => {
  const e = esId(req.params.id) ? await Examen.findById(req.params.id).populate("curso") : null;
  if (!e || String(e.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Examen no encontrado" });
  await Intento.deleteMany({ examen: e._id });
  await e.deleteOne();
  await auditar(req, "Eliminó examen", "Examen", e._id, e.titulo);
  res.json({ mensaje: "Examen eliminado" });
});

const resultadosExamen = h(async (req, res) => {
  const e = esId(req.params.id) ? await Examen.findById(req.params.id).populate("curso") : null;
  if (!e || String(e.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Examen no encontrado" });
  const [est, intentos] = await Promise.all([estudiantesDeAula(e.curso.aula), Intento.find({ examen: e._id })]);
  // Porcentaje de aciertos por pregunta (para detectar temas difíciles)
  const enviados = intentos.filter((i) => i.enviadoEn);
  const porPregunta = e.preguntas.map((p, i) => ({
    enunciado: p.enunciado,
    aciertos: enviados.filter((x) => x.respuestas[i] === p.correcta).length,
    total: enviados.length,
  }));
  res.json({
    examen: { _id: e._id, titulo: e.titulo, curso: e.curso.nombre },
    porPregunta,
    estudiantes: est.map((s) => {
      const it = intentos.find((x) => String(x.estudiante) === String(s._id));
      return { id: s._id, nombre: s.nombre, codigo: s.codigo, estado: it?.enviadoEn ? "enviado" : it ? "en_curso" : "no_inicio", puntaje: it?.puntaje, total: it?.total, nivel: it?.nivel, fueraDeTiempo: it?.fueraDeTiempo, enviadoEn: it?.enviadoEn };
    }),
  });
});

// ---------------- Conducta ----------------
const verIncidencias = h(async (req, res) => {
  const aulas = await aulasDelDocente(req.usuarioId);
  const filtro = { aula: { $in: aulas } };
  if (esId(req.query.aula) && aulas.includes(req.query.aula)) filtro.aula = req.query.aula;
  res.json(await Incidencia.find(filtro).sort({ fecha: -1, createdAt: -1 }).limit(200).populate("estudiante", "nombre codigo").populate("registradoPor", "nombre"));
});

const crearIncidencia = h(async (req, res) => {
  const { estudiante, tipo, categoria, descripcion, fecha } = req.body;
  const e = esId(estudiante) ? await Usuario.findOne({ _id: estudiante, rol: "estudiante" }).select("aula nombre") : null;
  if (!e) return res.status(400).json({ mensaje: "Estudiante inválido" });
  if (req.usuarioRol === "profesor" && !(await aulasDelDocente(req.usuarioId)).includes(String(e.aula))) return res.status(403).json({ mensaje: "No enseñas en el aula de este estudiante" });
  if (!["merito", "demerito", "incidencia"].includes(tipo) || !texto(descripcion, 1000)) return res.status(400).json({ mensaje: "Tipo y descripción son obligatorios" });
  const i = await Incidencia.create({ estudiante: e._id, aula: e.aula, tipo, categoria: texto(categoria, 60), descripcion: texto(descripcion, 1000), fecha: esFechaValida(fecha) ? fecha : hoy(), registradoPor: req.usuarioId });
  const titulo = { merito: "Reconocimiento", demerito: "Observación de conducta", incidencia: "Incidencia registrada" }[tipo];
  notificar(await familiaDe(e._id), { titulo: `${titulo}: ${e.nombre.split(",")[1]?.trim() || e.nombre}`, mensaje: i.descripcion.slice(0, 140), tipo: "conducta", enlace: "/intranet/familia/conducta", whatsapp: tipo !== "merito" });
  await auditar(req, `Registró ${tipo}`, "Incidencia", i._id, `${e.nombre}: ${i.descripcion}`);
  res.status(201).json(i);
});

const eliminarIncidencia = h(async (req, res) => {
  const i = esId(req.params.id) ? await Incidencia.findById(req.params.id) : null;
  if (!i || (req.usuarioRol !== "administrativo" && String(i.registradoPor) !== req.usuarioId)) return res.status(404).json({ mensaje: "No encontrada" });
  await i.deleteOne();
  await auditar(req, "Eliminó incidencia", "Incidencia", i._id, i.descripcion);
  res.json({ mensaje: "Eliminada" });
});

// ---------------- Alertas y tutoría ----------------
const alertas = h(async (req, res) => {
  const aulas = await aulasDelDocente(req.usuarioId);
  res.json(await alertasTempranas({ aula: { $in: aulas } }));
});

const libretasTutoria = h(async (req, res) => {
  const config = await obtenerConfig();
  const aula = await Aula.findOne({ tutor: req.usuarioId, anio: config.anio });
  if (!aula) return res.status(404).json({ mensaje: "No eres tutor de ningún aula" });
  const est = await estudiantesDeAula(aula._id);
  const libretas = await Promise.all(est.map((e) => libretaDe(e._id)));
  libretasPDF(libretas, res, `libretas-${aula.grado}${aula.seccion}.pdf`);
});

const miAsistencia = h(async (req, res) => {
  const config = await obtenerConfig();
  res.json(await AsistenciaPersonal.find({ usuario: req.usuarioId, fecha: { $gte: `${config.anio}-01-01` } }).sort({ fecha: -1 }));
});

module.exports = {
  materiales, crearMaterial, eliminarMaterial,
  misExamenes, verExamen, crearExamen, actualizarExamen, publicarExamen, eliminarExamen, resultadosExamen,
  verIncidencias, crearIncidencia, eliminarIncidencia, alertas, libretasTutoria, miAsistencia, apoderadosDe,
};
