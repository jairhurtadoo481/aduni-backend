const Usuario = require("../../models/Usuario");
const Aula = require("../../models/Aula");
const Curso = require("../../models/Curso");
const Horario = require("../../models/Horario");
const Asistencia = require("../../models/Asistencia");
const Calificacion = require("../../models/Calificacion");
const Tarea = require("../../models/Tarea");
const Entrega = require("../../models/Entrega");
const { obtenerConfig, periodoDeFecha } = require("../../models/Configuracion");
const { hoy, horaActual, esFechaValida } = require("../../lib/fechas");
const { h, texto, esId, NIVELES } = require("./util");
const { aulasDelDocente } = require("./comun");
const { notificar, familiaDe } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");

const estudiantesDeAula = (aulaId) =>
  Usuario.find({ rol: "estudiante", aula: aulaId, activo: true }).select("nombre codigo dni").sort({ nombre: 1 });

const cursoPropio = async (req, res, id) => {
  if (!esId(id)) { res.status(404).json({ mensaje: "Curso no encontrado" }); return null; }
  const c = await Curso.findOne({ _id: id, docente: req.usuarioId }).populate("aula");
  if (!c) res.status(404).json({ mensaje: "Curso no encontrado" });
  return c;
};

const resumen = h(async (req, res) => {
  const f = hoy();
  const dia = new Date(`${f}T12:00:00Z`).getUTCDay();
  const config = await obtenerConfig();
  const cursos = await Curso.find({ docente: req.usuarioId }).populate("aula");
  const idsCursos = cursos.map((c) => c._id);
  const [horarioHoy, tareas, tutoria] = await Promise.all([
    Horario.find({ curso: { $in: idsCursos }, dia }).sort({ horaInicio: 1 }).populate("curso", "nombre color").populate("aula"),
    Tarea.find({ curso: { $in: idsCursos } }).select("_id"),
    Aula.findOne({ tutor: req.usuarioId, anio: config.anio }),
  ]);
  const porRevisar = await Entrega.countDocuments({ tarea: { $in: tareas.map((t) => t._id) }, nivel: "" });
  const conteos = await Promise.all(cursos.map((c) => Usuario.countDocuments({ rol: "estudiante", aula: c.aula._id, activo: true })));
  let asistenciaTutoria = null;
  if (tutoria) {
    const [total, marcados] = await Promise.all([
      Usuario.countDocuments({ rol: "estudiante", aula: tutoria._id, activo: true }),
      Asistencia.find({ aula: tutoria._id, fecha: f }),
    ]);
    asistenciaTutoria = { total, presentes: marcados.filter((a) => a.estado === "P" || a.estado === "T").length, tardanzas: marcados.filter((a) => a.estado === "T").length, faltas: marcados.filter((a) => a.estado === "F").length };
  }
  res.json({
    periodoActual: periodoDeFecha(config, f),
    cursos: cursos.map((c, i) => ({ id: c._id, nombre: c.nombre, color: c.color, aula: c.aula, estudiantes: conteos[i] })),
    horarioHoy, porRevisar, tutoria, asistenciaTutoria, hora: horaActual(),
  });
});

const misCursos = h(async (req, res) => {
  const cursos = await Curso.find({ docente: req.usuarioId }).populate("aula").sort({ nombre: 1 });
  const conteos = await Promise.all(cursos.map((c) => Usuario.countDocuments({ rol: "estudiante", aula: c.aula._id, activo: true })));
  res.json(cursos.map((c, i) => ({ id: c._id, nombre: c.nombre, color: c.color, aula: c.aula, competencias: c.competencias, estudiantes: conteos[i] })));
});

const horario = h(async (req, res) => {
  const cursos = await Curso.find({ docente: req.usuarioId }).select("_id");
  res.json(await Horario.find({ curso: { $in: cursos.map((c) => c._id) } }).sort({ dia: 1, horaInicio: 1 }).populate("curso", "nombre color").populate("aula"));
});

const misAulas = h(async (req, res) => {
  const ids = await aulasDelDocente(req.usuarioId);
  const aulas = await Aula.find({ _id: { $in: ids } }).sort({ nivel: 1, grado: 1, seccion: 1 });
  res.json(aulas.map((a) => ({ ...a.toJSON(), esTutor: String(a.tutor) === req.usuarioId })));
});

// ---- Asistencia diaria (docentes del aula) ----
const verAsistencia = h(async (req, res) => {
  const { aula } = req.query;
  const fecha = esFechaValida(req.query.fecha) ? req.query.fecha : hoy();
  if (!(await aulasDelDocente(req.usuarioId)).includes(String(aula))) return res.status(403).json({ mensaje: "No enseñas en esta aula" });
  const [estudiantes, registros] = await Promise.all([estudiantesDeAula(aula), Asistencia.find({ aula, fecha })]);
  res.json({
    fecha,
    estudiantes: estudiantes.map((e) => {
      const r = registros.find((x) => String(x.estudiante) === String(e._id));
      return { id: e._id, nombre: e.nombre, codigo: e.codigo, estado: r?.estado || "", hora: r?.horaIngreso || "", metodo: r?.metodo || "", observacion: r?.observacion || "" };
    }),
  });
});

const guardarAsistencia = h(async (req, res) => {
  const { aula, fecha, registros } = req.body;
  if (!esFechaValida(fecha) || fecha > hoy() || !Array.isArray(registros)) return res.status(400).json({ mensaje: "Datos inválidos" });
  if (!(await aulasDelDocente(req.usuarioId)).includes(String(aula))) return res.status(403).json({ mensaje: "No enseñas en esta aula" });
  const ids = new Set((await estudiantesDeAula(aula)).map((e) => String(e._id)));
  const ops = registros
    .filter((r) => ids.has(String(r.estudiante)) && ["P", "T", "F", "J"].includes(r.estado))
    .map((r) => ({
      updateOne: {
        filter: { estudiante: r.estudiante, fecha },
        update: {
          $set: { aula, estado: r.estado, observacion: texto(r.observacion, 200), registradoPor: req.usuarioId },
          $setOnInsert: { metodo: "manual", horaIngreso: r.estado === "P" || r.estado === "T" ? horaActual() : "" },
        },
        upsert: true,
      },
    }));
  if (ops.length) await Asistencia.bulkWrite(ops);
  await auditar(req, "Registró asistencia de aula", "Aula", aula, `${fecha}: ${ops.length} estudiantes`);
  res.json({ mensaje: "Asistencia guardada", guardados: ops.length });
});

// ---- Registro auxiliar de evaluación ----
const verRegistro = h(async (req, res) => {
  const curso = await cursoPropio(req, res, req.params.id);
  if (!curso) return;
  const periodo = Number(req.query.periodo) || 1;
  const [estudiantes, califs] = await Promise.all([
    estudiantesDeAula(curso.aula._id),
    Calificacion.find({ curso: curso._id, periodo }),
  ]);
  res.json({
    curso: { id: curso._id, nombre: curso.nombre, aula: curso.aula, competencias: curso.competencias, color: curso.color },
    periodo,
    estudiantes: estudiantes.map((e) => {
      const propias = califs.filter((c) => String(c.estudiante) === String(e._id));
      return {
        id: e._id, nombre: e.nombre, codigo: e.codigo,
        niveles: curso.competencias.map((_, i) => propias.find((c) => c.competencia === i)?.nivel || ""),
        conclusion: propias.find((c) => c.conclusion)?.conclusion || "",
      };
    }),
  });
});

const guardarRegistro = h(async (req, res) => {
  const curso = await cursoPropio(req, res, req.params.id);
  if (!curso) return;
  const periodo = Number(req.body.periodo);
  const { calificaciones } = req.body; // [{ estudiante, niveles: ["A","",...], conclusion }]
  if (![1, 2, 3, 4].includes(periodo) || !Array.isArray(calificaciones)) return res.status(400).json({ mensaje: "Datos inválidos" });
  const ids = new Set((await estudiantesDeAula(curso.aula._id)).map((e) => String(e._id)));
  const ops = [];
  for (const c of calificaciones) {
    if (!ids.has(String(c.estudiante)) || !Array.isArray(c.niveles)) continue;
    c.niveles.forEach((nivel, i) => {
      if (i >= curso.competencias.length) return;
      const filtro = { curso: curso._id, estudiante: c.estudiante, periodo, competencia: i };
      if (!nivel) ops.push({ deleteOne: { filter: filtro } });
      else if (NIVELES.includes(nivel)) {
        ops.push({
          updateOne: {
            filter: filtro,
            update: { $set: { nivel, registradaPor: req.usuarioId, conclusion: i === 0 ? texto(c.conclusion, 600) : "" } },
            upsert: true,
          },
        });
      }
    });
  }
  if (ops.length) await Calificacion.bulkWrite(ops);
  await auditar(req, "Registró calificaciones", "Curso", curso._id, `${curso.nombre} ${curso.aula.nombre} · B${periodo} · ${ops.length} cambios`);
  // Aviso a estudiantes y familias (una vez al día por curso y bimestre).
  const estudiantes = calificaciones.map((c) => c.estudiante).filter((id) => ids.has(String(id)));
  notificar(await familiaDe(estudiantes), {
    titulo: `Notas actualizadas: ${curso.nombre}`, mensaje: `Bimestre ${periodo}`, tipo: "nota",
    enlace: "/intranet/estudiante/notas", clave: `notas-${curso._id}-${periodo}-${hoy()}`,
  });
  res.json({ mensaje: "Calificaciones guardadas" });
});

// ---- Tareas ----
const misTareas = h(async (req, res) => {
  const cursos = await Curso.find({ docente: req.usuarioId }).populate("aula");
  const tareas = await Tarea.find({ curso: { $in: cursos.map((c) => c._id) } }).sort({ fechaEntrega: -1 }).populate({ path: "curso", select: "nombre color aula", populate: { path: "aula" } });
  const conteos = await Promise.all(tareas.map(async (t) => {
    const [entregas, revisadas, total] = await Promise.all([
      Entrega.countDocuments({ tarea: t._id }),
      Entrega.countDocuments({ tarea: t._id, nivel: { $ne: "" } }),
      Usuario.countDocuments({ rol: "estudiante", aula: t.curso.aula._id, activo: true }),
    ]);
    return { entregas, revisadas, total };
  }));
  res.json(tareas.map((t, i) => ({ ...t.toObject(), ...conteos[i] })));
});

const crearTarea = h(async (req, res) => {
  const curso = await cursoPropio(req, res, req.body.curso);
  if (!curso) return;
  const { titulo, descripcion, enlace, fechaEntrega } = req.body;
  if (!texto(titulo) || !esFechaValida(fechaEntrega)) return res.status(400).json({ mensaje: "Título y fecha de entrega son obligatorios" });
  if (enlace && !/^https?:\/\//i.test(enlace)) return res.status(400).json({ mensaje: "El enlace debe empezar con http:// o https://" });
  const config = await obtenerConfig();
  const t = await Tarea.create({
    curso: curso._id, titulo: texto(titulo), descripcion: texto(descripcion, 3000), enlace: texto(enlace, 500),
    fechaEntrega, periodo: periodoDeFecha(config, fechaEntrega), autor: req.usuarioId,
  });
  const est = await estudiantesDeAula(curso.aula._id);
  notificar(est.map((e) => e._id), { titulo: `Nueva tarea de ${curso.nombre}`, mensaje: `${t.titulo} · entrega ${fechaEntrega}`, tipo: "tarea", enlace: "/intranet/estudiante/tareas" });
  await auditar(req, "Creó tarea", "Tarea", t._id, `${curso.nombre} ${curso.aula.nombre}: ${t.titulo}`);
  res.status(201).json(t);
});

const tareaPropia = async (req, res) => {
  if (!esId(req.params.id)) { res.status(404).json({ mensaje: "Tarea no encontrada" }); return null; }
  const t = await Tarea.findById(req.params.id).populate("curso");
  if (!t || String(t.curso.docente) !== req.usuarioId) { res.status(404).json({ mensaje: "Tarea no encontrada" }); return null; }
  return t;
};

const eliminarTarea = h(async (req, res) => {
  const t = await tareaPropia(req, res);
  if (!t) return;
  await Entrega.deleteMany({ tarea: t._id });
  await t.deleteOne();
  await auditar(req, "Eliminó tarea", "Tarea", t._id, `${t.curso.nombre}: ${t.titulo}`);
  res.json({ mensaje: "Tarea eliminada" });
});

const entregasDeTarea = h(async (req, res) => {
  const t = await tareaPropia(req, res);
  if (!t) return;
  const [estudiantes, entregas] = await Promise.all([estudiantesDeAula(t.curso.aula), Entrega.find({ tarea: t._id })]);
  res.json({
    tarea: t,
    estudiantes: estudiantes.map((e) => ({ id: e._id, nombre: e.nombre, codigo: e.codigo, entrega: entregas.find((x) => String(x.estudiante) === String(e._id)) || null })),
  });
});

const calificarEntrega = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "Entrega no encontrada" });
  const e = await Entrega.findById(req.params.id).populate({ path: "tarea", populate: { path: "curso", select: "docente" } });
  if (!e || String(e.tarea.curso.docente) !== req.usuarioId) return res.status(404).json({ mensaje: "Entrega no encontrada" });
  const { nivel, comentario } = req.body;
  if (nivel && !NIVELES.includes(nivel)) return res.status(400).json({ mensaje: "Nivel inválido" });
  const antes = e.nivel || "—";
  e.nivel = nivel || "";
  e.comentario = texto(comentario, 500);
  await e.save();
  if (antes !== (e.nivel || "—")) await auditar(req, "Calificó entrega de tarea", "Entrega", e._id, `${e.tarea.titulo}: ${antes} → ${e.nivel || "—"}`);
  res.json(e);
});

module.exports = {
  resumen, misCursos, horario, misAulas, verAsistencia, guardarAsistencia,
  verRegistro, guardarRegistro, misTareas, crearTarea, eliminarTarea, entregasDeTarea, calificarEntrega,
};
