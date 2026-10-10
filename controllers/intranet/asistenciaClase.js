// Asistencia de estudiantes por clase: el docente pasa lista dentro de su horario;
// el auxiliar/dirección corrige después (queda en la bitácora) y controla qué clases no tienen lista.
const Usuario = require("../../models/Usuario");
const Horario = require("../../models/Horario");
const Curso = require("../../models/Curso");
const Aula = require("../../models/Aula");
const AsistenciaClase = require("../../models/AsistenciaClase");
const Evento = require("../../models/Evento");
const AsistenciaPersonal = require("../../models/AsistenciaPersonal");
const { obtenerConfig } = require("../../models/Configuracion");
const { ventanaDe, recalcularDia, diaSemana } = require("../../lib/asistenciaClase");
const { notificar, apoderadosDe } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");
const { hoy, esFechaValida } = require("../../lib/fechas");
const { h, texto, esId } = require("./util");

const ESTADOS = ["P", "T", "F", "J"];
const fechaDe = (q) => (esFechaValida(q) ? q : hoy());
const estudiantesDeAula = (aula) => Usuario.find({ rol: "estudiante", aula, activo: true }).select("nombre nombres codigo").sort({ nombre: 1 });

const bloquePropio = async (req, res) => {
  const b = esId(req.params.id) ? await Horario.findById(req.params.id).populate({ path: "curso", select: "nombre color docente" }).populate("aula") : null;
  if (!b || String(b.curso?.docente) !== req.usuarioId) {
    res.status(404).json({ mensaje: "Clase no encontrada" });
    return null;
  }
  return b;
};

// ---------- Docente ----------
const misClases = h(async (req, res) => {
  const fecha = fechaDe(req.query.fecha);
  const config = await obtenerConfig();
  const cursos = await Curso.find({ docente: req.usuarioId }).select("_id");
  const bloques = await Horario.find({ curso: { $in: cursos.map((c) => c._id) }, dia: diaSemana(fecha) })
    .sort({ horaInicio: 1 }).populate("curso", "nombre color").populate("aula");
  const tomas = await AsistenciaClase.find({ horario: { $in: bloques.map((b) => b._id) }, fecha });
  const feriado = await Evento.findOne({ fecha, tipo: "feriado" });
  res.json({
    fecha, feriado: feriado?.titulo || null,
    clases: bloques.map((b) => {
      const t = tomas.find((x) => String(x.horario) === String(b._id));
      const c = { P: 0, T: 0, F: 0, J: 0 };
      t?.registros.forEach((r) => { c[r.estado]++; });
      return { _id: b._id, curso: b.curso, aula: b.aula, horaInicio: b.horaInicio, horaFin: b.horaFin, ventana: ventanaDe(b, fecha, config), tomada: !!t, tomadaEn: t?.tomadaEn, conteo: c };
    }),
  });
});

const verLista = h(async (req, res) => {
  const b = await bloquePropio(req, res);
  if (!b) return;
  const fecha = fechaDe(req.query.fecha);
  const config = await obtenerConfig();
  const [estudiantes, toma] = await Promise.all([estudiantesDeAula(b.aula._id), AsistenciaClase.findOne({ horario: b._id, fecha })]);
  const ventana = ventanaDe(b, fecha, config);
  res.json({
    clase: { _id: b._id, curso: b.curso, aula: b.aula, horaInicio: b.horaInicio, horaFin: b.horaFin, dia: b.dia },
    fecha, ventana, editable: ventana.estado === "abierta" && diaSemana(fecha) === b.dia,
    tomadaEn: toma?.tomadaEn || null,
    estudiantes: estudiantes.map((e) => {
      const r = toma?.registros.find((x) => String(x.estudiante) === String(e._id));
      return { id: e._id, nombre: e.nombre, codigo: e.codigo, estado: r?.estado || "", observacion: r?.observacion || "" };
    }),
  });
});

const guardarLista = h(async (req, res) => {
  const b = await bloquePropio(req, res);
  if (!b) return;
  const fecha = hoy();
  const config = await obtenerConfig();
  const ventana = ventanaDe(b, fecha, config);
  if (diaSemana(fecha) !== b.dia || ventana.estado !== "abierta") {
    return res.status(403).json({ mensaje: `La lista solo se puede pasar durante la clase (hoy de ${ventana.abre} a ${ventana.cierra}). Para corregir, pide al auxiliar.` });
  }
  const estudiantes = await estudiantesDeAula(b.aula._id);
  const validos = new Set(estudiantes.map((e) => String(e._id)));
  // Una justificación ya aprobada (J) se respeta aunque el docente marque otra cosa; el docente no puede poner J.
  const previa = await AsistenciaClase.findOne({ horario: b._id, fecha });
  const justificados = new Set((previa?.registros || []).filter((r) => r.estado === "J").map((r) => String(r.estudiante)));
  const registros = (Array.isArray(req.body.registros) ? req.body.registros : [])
    .filter((r) => validos.has(String(r.estudiante)) && (["P", "T", "F"].includes(r.estado) || (r.estado === "J" && justificados.has(String(r.estudiante)))))
    .map((r) => ({ estudiante: r.estudiante, estado: r.estado, observacion: texto(r.observacion, 200) }));
  const finales = registros.map((r) => (justificados.has(String(r.estudiante)) ? { ...r, estado: "J" } : r));
  if (finales.length < estudiantes.length) return res.status(400).json({ mensaje: "Marca a todos los estudiantes antes de guardar" });

  await AsistenciaClase.findOneAndUpdate(
    { horario: b._id, fecha },
    { $set: { curso: b.curso._id, aula: b.aula._id, docente: req.usuarioId, horaInicio: b.horaInicio, registros: finales, tomadaPor: req.usuarioId, tomadaEn: new Date() } },
    { upsert: true }
  );
  await recalcularDia(b.aula._id, fecha);

  // Si es el primer bloque del día del aula, avisa a las familias de quienes faltaron.
  const primero = await Horario.findOne({ aula: b.aula._id, dia: b.dia }).sort({ horaInicio: 1 }).select("_id");
  if (String(primero?._id) === String(b._id)) {
    for (const r of finales.filter((x) => x.estado === "F")) {
      const e = estudiantes.find((x) => String(x._id) === String(r.estudiante));
      notificar(await apoderadosDe(r.estudiante), {
        titulo: `${e?.nombres || "Su hijo(a)"} no está en la primera hora de clases`,
        mensaje: `${fecha} · ${b.curso.nombre} ${b.horaInicio}. Si fue por un motivo justificado, envía la justificación desde la intranet.`,
        tipo: "asistencia", enlace: "/intranet/familia/asistencia", clave: `falta1-${r.estudiante}-${fecha}`, whatsapp: true,
      });
    }
  }
  await auditar(req, "Registró asistencia de clase", "AsistenciaClase", b._id, `${b.curso.nombre} ${b.aula.nombre} ${fecha} ${b.horaInicio}`);
  const c = { P: 0, T: 0, F: 0, J: 0 };
  finales.forEach((r) => { c[r.estado]++; });
  res.json({ mensaje: "Asistencia guardada", conteo: c });
});

// ---------- Auxiliar / Dirección ----------
const gradillaAula = h(async (req, res) => {
  if (!esId(req.query.aula)) return res.status(400).json({ mensaje: "Indica el aula" });
  const fecha = fechaDe(req.query.fecha);
  const config = await obtenerConfig();
  const bloques = await Horario.find({ aula: req.query.aula, dia: diaSemana(fecha) }).sort({ horaInicio: 1 })
    .populate({ path: "curso", select: "nombre color docente", populate: { path: "docente", select: "nombre" } });
  const [estudiantes, tomas] = await Promise.all([
    estudiantesDeAula(req.query.aula),
    AsistenciaClase.find({ horario: { $in: bloques.map((b) => b._id) }, fecha }).populate("tomadaPor", "nombre").populate("corregidaPor", "nombre"),
  ]);
  const Asistencia = require("../../models/Asistencia");
  const diarios = await Asistencia.find({ aula: req.query.aula, fecha });
  res.json({
    fecha,
    bloques: bloques.map((b) => {
      const t = tomas.find((x) => String(x.horario) === String(b._id));
      return {
        _id: b._id, curso: b.curso, horaInicio: b.horaInicio, horaFin: b.horaFin, ventana: ventanaDe(b, fecha, config),
        tomada: !!t, tomadaEn: t?.tomadaEn, tomadaPor: t?.tomadaPor?.nombre, corregidaPor: t?.corregidaPor?.nombre,
      };
    }),
    estudiantes: estudiantes.map((e) => ({
      id: e._id, nombre: e.nombre, codigo: e.codigo,
      diario: diarios.find((d) => String(d.estudiante) === String(e._id))?.estado || "",
      estados: Object.fromEntries(tomas.map((t) => [String(t.horario), t.registros.find((r) => String(r.estudiante) === String(e._id))?.estado || ""])),
    })),
  });
});

const corregirCelda = h(async (req, res) => {
  const b = esId(req.params.id) ? await Horario.findById(req.params.id).populate("curso", "nombre docente").populate("aula") : null;
  if (!b) return res.status(404).json({ mensaje: "Clase no encontrada" });
  const { estudiante, estado } = req.body;
  const fecha = esFechaValida(req.body.fecha) ? req.body.fecha : null;
  if (!fecha || fecha > hoy() || diaSemana(fecha) !== b.dia) return res.status(400).json({ mensaje: "Fecha inválida para esta clase" });
  if (!esId(estudiante) || !(ESTADOS.includes(estado) || estado === "")) return res.status(400).json({ mensaje: "Datos inválidos" });
  const est = await Usuario.findOne({ _id: estudiante, rol: "estudiante", aula: b.aula._id }).select("nombre");
  if (!est) return res.status(400).json({ mensaje: "El estudiante no es de esta aula" });
  let toma = await AsistenciaClase.findOne({ horario: b._id, fecha });
  if (!toma) toma = new AsistenciaClase({ horario: b._id, curso: b.curso._id, aula: b.aula._id, docente: b.curso.docente, fecha, horaInicio: b.horaInicio, registros: [] });
  const antes = toma.registros.find((r) => String(r.estudiante) === String(estudiante))?.estado || "—";
  toma.registros = toma.registros.filter((r) => String(r.estudiante) !== String(estudiante));
  if (estado) toma.registros.push({ estudiante, estado, observacion: texto(req.body.motivo, 200) });
  toma.corregidaPor = req.usuarioId;
  await toma.save();
  await recalcularDia(b.aula._id, fecha, [estudiante]);
  await auditar(req, "Corrigió asistencia de clase", "AsistenciaClase", toma._id,
    `${est.nombre} · ${b.curso.nombre} ${fecha} ${b.horaInicio}: ${antes} → ${estado || "sin registro"}${req.body.motivo ? ` (${texto(req.body.motivo, 100)})` : ""}`);
  res.json({ mensaje: "Corregido" });
});

// Clases cuyo plazo ya venció y el docente no pasó lista.
const controlDocentes = h(async (req, res) => {
  const fecha = fechaDe(req.query.fecha);
  const config = await obtenerConfig();
  const bloques = await Horario.find({ dia: diaSemana(fecha) }).sort({ horaInicio: 1 })
    .populate({ path: "curso", select: "nombre docente", populate: { path: "docente", select: "nombre celular" } }).populate("aula");
  const tomadas = new Set((await AsistenciaClase.find({ fecha, horario: { $in: bloques.map((b) => b._id) } }).select("horario")).map((t) => String(t.horario)));
  const lista = bloques.map((b) => ({
    _id: b._id, aula: b.aula?.nombre, curso: b.curso?.nombre, docente: b.curso?.docente?.nombre || "Sin docente", celular: b.curso?.docente?.celular,
    horaInicio: b.horaInicio, horaFin: b.horaFin, ventana: ventanaDe(b, fecha, config), tomada: tomadas.has(String(b._id)),
  }));
  res.json({
    fecha,
    total: lista.length, tomadas: lista.filter((x) => x.tomada).length,
    sinTomar: lista.filter((x) => !x.tomada && x.ventana.estado === "cerrada"),
    enCurso: lista.filter((x) => x.ventana.estado === "abierta"),
  });
});

// Personal sin registro de ingreso en el día → falta.
const cerrarDiaPersonal = h(async (req, res) => {
  const fecha = esFechaValida(req.body.fecha) ? req.body.fecha : hoy();
  if (fecha > hoy()) return res.status(400).json({ mensaje: "No puedes cerrar un día futuro" });
  const d = diaSemana(fecha);
  if (d === 0 || d === 6) return res.status(400).json({ mensaje: "Es fin de semana" });
  if (await Evento.exists({ fecha, tipo: "feriado" })) return res.status(400).json({ mensaje: "Ese día es feriado" });
  const personal = await Usuario.find({ rol: { $in: ["profesor", "administrativo"] }, activo: true }).select("_id");
  const con = new Set((await AsistenciaPersonal.find({ fecha }).select("usuario")).map((a) => String(a.usuario)));
  const faltan = personal.filter((p) => !con.has(String(p._id)));
  if (faltan.length) await AsistenciaPersonal.insertMany(faltan.map((p) => ({ usuario: p._id, fecha, estado: "F", metodo: "automatico" })), { ordered: false });
  await auditar(req, "Registró faltas del personal", "AsistenciaPersonal", "", `${fecha}: ${faltan.length} faltas`);
  res.json({ mensaje: `${faltan.length} faltas registradas del personal`, faltas: faltan.length });
});

const corregirPersonal = h(async (req, res) => {
  const { usuario, fecha, estado, observacion } = req.body;
  if (!esId(usuario) || !esFechaValida(fecha) || !(ESTADOS.includes(estado) || estado === "")) return res.status(400).json({ mensaje: "Datos inválidos" });
  const u = await Usuario.findOne({ _id: usuario, rol: { $in: ["profesor", "administrativo"] } }).select("nombre");
  if (!u) return res.status(404).json({ mensaje: "No encontrado" });
  const antes = (await AsistenciaPersonal.findOne({ usuario, fecha }))?.estado || "—";
  if (!estado) await AsistenciaPersonal.deleteOne({ usuario, fecha });
  else await AsistenciaPersonal.findOneAndUpdate({ usuario, fecha }, { $set: { estado, observacion: texto(observacion, 200) }, $setOnInsert: { metodo: "manual" } }, { upsert: true });
  await auditar(req, "Corrigió asistencia del personal", "AsistenciaPersonal", usuario, `${u.nombre} ${fecha}: ${antes} → ${estado || "sin registro"}`);
  res.json({ mensaje: "Corregido" });
});

module.exports = { misClases, verLista, guardarLista, gradillaAula, corregirCelda, controlDocentes, cerrarDiaPersonal, corregirPersonal, Aula };
