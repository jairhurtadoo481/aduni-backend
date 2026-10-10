// Portal del estudiante y de la familia. El apoderado usa las mismas rutas indicando ?hijo=<id>.
const QRCode = require("qrcode");
const Usuario = require("../../models/Usuario");
const Curso = require("../../models/Curso");
const Horario = require("../../models/Horario");
const Asistencia = require("../../models/Asistencia");
const Justificacion = require("../../models/Justificacion");
const Tarea = require("../../models/Tarea");
const Entrega = require("../../models/Entrega");
const Pension = require("../../models/Pension");
const PagoReportado = require("../../models/PagoReportado");
const Recibo = require("../../models/Recibo");
const Comprobante = require("../../models/Comprobante");
const Comunicado = require("../../models/Comunicado");
const Evento = require("../../models/Evento");
const Incidencia = require("../../models/Incidencia");
const Material = require("../../models/Material");
const Examen = require("../../models/Examen");
const Intento = require("../../models/Intento");
const { obtenerConfig, periodoDeFecha } = require("../../models/Configuracion");
const { libretaDe } = require("../../lib/academico");
const { tieneCuentaEnAula } = require("../../lib/cuentas");
const { libretasPDF, reciboPDF } = require("../../lib/pdf");
const { notificar } = require("../../lib/notificar");
const { hoy, esFechaValida } = require("../../lib/fechas");
const { h, texto, resumenAsistencia, MESES, esId } = require("./util");

// Estudiante sobre el que se consulta: el propio o el hijo elegido por el apoderado.
const objetivo = async (req, res) => {
  if (req.usuarioRol === "estudiante") return req.usuarioId;
  const yo = await Usuario.findById(req.usuarioId).select("hijos");
  const hijos = (yo?.hijos || []).map(String);
  const pedido = String(req.query.hijo || req.body?.hijo || "");
  const id = pedido ? (hijos.includes(pedido) ? pedido : null) : hijos[0];
  if (!id) res.status(404).json({ mensaje: "No tienes estudiantes vinculados a tu cuenta" });
  return id || null;
};

const estudianteCon = (id) => Usuario.findById(id).select("-password").populate({ path: "aula", populate: { path: "tutor", select: "nombre celular email" } });
const estadoPension = (p, f) => (p.estado === "pagado" ? "pagado" : p.vencimiento < f ? "vencido" : "pendiente");
const cursosDeAula = (aula) => (aula ? Curso.find({ aula }).select("_id nombre color docente") : []);

const hijos = h(async (req, res) => {
  const yo = await Usuario.findById(req.usuarioId).select("hijos");
  const lista = await Usuario.find({ _id: { $in: yo.hijos } }).select("nombre nombres codigo aula foto").populate("aula");
  const f = hoy();
  const config = await obtenerConfig();
  res.json(await Promise.all(lista.map(async (e) => {
    const [ingreso, vencidas] = await Promise.all([
      Asistencia.findOne({ estudiante: e._id, fecha: f }),
      Pension.countDocuments({ estudiante: e._id, estado: "pendiente", vencimiento: { $lt: f } }),
    ]);
    return { ...e.toObject(), ingresoHoy: ingreso, cuotasVencidas: vencidas, tieneCuenta: tieneCuentaEnAula(e.aula, config) };
  })));
});

const resumen = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await estudianteCon(id);
  const config = await obtenerConfig();
  const f = hoy();
  const diaSemana = new Date(`${f}T12:00:00Z`).getUTCDay();
  const idsCursos = (await cursosDeAula(u.aula?._id)).map((c) => c._id);

  const [asis, tareas, entregas, pensiones, comunicados, eventos, horarioHoy, examenes, incidencias] = await Promise.all([
    Asistencia.find({ estudiante: u._id, fecha: { $gte: `${config.anio}-01-01` } }),
    Tarea.find({ curso: { $in: idsCursos }, fechaEntrega: { $gte: f } }).sort({ fechaEntrega: 1 }).populate("curso", "nombre color"),
    Entrega.find({ estudiante: u._id }).select("tarea"),
    Pension.find({ estudiante: u._id, anio: config.anio }),
    Comunicado.find({ destinatarios: { $in: ["todos", "estudiante"] }, aula: { $in: [null, u.aula?._id] } }).sort({ createdAt: -1 }).limit(3),
    Evento.find({ fecha: { $gte: f } }).sort({ fecha: 1 }).limit(5),
    u.aula ? Horario.find({ aula: u.aula._id, dia: diaSemana }).sort({ horaInicio: 1 }).populate("curso", "nombre color") : [],
    Examen.find({ curso: { $in: idsCursos }, publicado: true, fin: { $gte: new Date() } }).select("titulo inicio fin curso").populate("curso", "nombre color").sort({ inicio: 1 }).limit(3),
    Incidencia.find({ estudiante: u._id }).sort({ fecha: -1 }).limit(3),
  ]);

  const entregadas = new Set(entregas.map((e) => String(e.tarea)));
  const pendientes = tareas.filter((t) => !entregadas.has(String(t._id)));
  const deuda = pensiones.filter((p) => estadoPension(p, f) === "vencido");

  res.json({
    usuario: u,
    tieneCuenta: tieneCuentaEnAula(u.aula, config),
    periodoActual: periodoDeFecha(config, f),
    asistencia: resumenAsistencia(asis),
    asistenciaHoy: asis.find((a) => a.fecha === f) || null,
    tareasPendientes: pendientes.slice(0, 5),
    totalTareasPendientes: pendientes.length,
    deuda: { cuotas: deuda.length, monto: deuda.reduce((s, p) => s + p.monto - p.descuento, 0) },
    comunicados, eventos, horarioHoy, examenes, incidencias,
  });
});

const horario = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await Usuario.findById(id).select("aula");
  res.json(u.aula ? await Horario.find({ aula: u.aula }).sort({ dia: 1, horaInicio: 1 }).populate({ path: "curso", select: "nombre color docente", populate: { path: "docente", select: "nombre" } }) : []);
});

const calificaciones = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const lib = await libretaDe(id);
  res.json(lib.cursos);
});

const libretaPdf = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const lib = await libretaDe(id);
  libretasPDF([lib], res, `libreta-${lib.estudiante.codigo}.pdf`);
});

const asistencia = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const config = await obtenerConfig();
  const registros = await Asistencia.find({ estudiante: id, fecha: { $gte: `${config.anio}-01-01` } }).sort({ fecha: -1 });
  res.json({ resumen: resumenAsistencia(registros), registros });
});

const misJustificaciones = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  res.json(await Justificacion.find({ estudiante: id }).sort({ createdAt: -1 }));
});

const crearJustificacion = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const { fecha, motivo, evidenciaUrl } = req.body;
  if (!esFechaValida(fecha) || !texto(motivo, 1000)) return res.status(400).json({ mensaje: "Indica la fecha y el motivo" });
  if (fecha > hoy()) return res.status(400).json({ mensaje: "No puedes justificar una fecha futura" });
  const existe = await Justificacion.findOne({ estudiante: id, fecha, estado: { $ne: "rechazada" } });
  if (existe) return res.status(409).json({ mensaje: "Ya se envió una justificación para esa fecha" });
  const j = await Justificacion.create({ estudiante: id, fecha, motivo: texto(motivo, 1000), evidenciaUrl: texto(evidenciaUrl, 500) });
  const admins = await Usuario.find({ rol: "administrativo", activo: true }).select("_id");
  const est = await Usuario.findById(id).select("nombre");
  notificar(admins.map((a) => a._id), { titulo: "Nueva justificación", mensaje: `${est.nombre} · ${fecha}`, tipo: "asistencia", enlace: "/intranet/administrativo/justificaciones" });
  res.status(201).json(j);
});

const tareas = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await Usuario.findById(id).select("aula");
  if (!u.aula) return res.json([]);
  const cursos = await Curso.find({ aula: u.aula }).select("_id");
  const lista = await Tarea.find({ curso: { $in: cursos.map((c) => c._id) } }).sort({ fechaEntrega: -1 }).populate({ path: "curso", select: "nombre color docente", populate: { path: "docente", select: "nombre" } });
  const entregas = await Entrega.find({ estudiante: id, tarea: { $in: lista.map((t) => t._id) } });
  const f = hoy();
  res.json(lista.map((t) => {
    const e = entregas.find((x) => String(x.tarea) === String(t._id)) || null;
    return { ...t.toObject(), entrega: e, estado: e ? (e.nivel ? "calificada" : "entregada") : t.fechaEntrega < f ? "vencida" : "pendiente" };
  }));
});

const entregarTarea = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "Tarea no encontrada" });
  const idEst = await objetivo(req, res);
  if (!idEst) return;
  const u = await Usuario.findById(idEst).select("aula").populate("aula");
  // La familia solo entrega por el alumno cuando este no tiene cuenta propia (primeros grados).
  if (req.usuarioRol === "apoderado" && tieneCuentaEnAula(u.aula, await obtenerConfig())) {
    return res.status(403).json({ mensaje: "Tu hijo(a) tiene su propia cuenta: la tarea la entrega él/ella desde el portal del estudiante" });
  }
  const tarea = await Tarea.findById(req.params.id).populate("curso", "aula");
  if (!tarea || String(tarea.curso.aula) !== String(u.aula?._id)) return res.status(404).json({ mensaje: "Tarea no encontrada" });
  const respuesta = texto(req.body.respuesta, 5000);
  const enlace = texto(req.body.enlace, 500);
  const archivos = (Array.isArray(req.body.archivos) ? req.body.archivos : []).slice(0, 5)
    .filter((a) => /^https:\/\/res\.cloudinary\.com\//.test(a?.url || "")).map((a) => ({ url: a.url, nombre: texto(a.nombre, 150) }));
  if (!respuesta && !enlace && !archivos.length) return res.status(400).json({ mensaje: "Escribe tu respuesta, pega un enlace o adjunta un archivo" });
  if (enlace && !/^https?:\/\//i.test(enlace)) return res.status(400).json({ mensaje: "El enlace debe empezar con http:// o https://" });
  const previa = await Entrega.findOne({ tarea: tarea._id, estudiante: idEst });
  if (previa?.nivel) return res.status(400).json({ mensaje: "La tarea ya fue calificada" });
  const e = await Entrega.findOneAndUpdate({ tarea: tarea._id, estudiante: idEst }, { respuesta, enlace, archivos }, { upsert: true, returnDocument: "after" });
  res.json(e);
});

const pagos = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const [lista, reportes, recibos, comprobantes] = await Promise.all([
    Pension.find({ estudiante: id }).sort({ anio: -1, mes: 1 }),
    PagoReportado.find({ estudiante: id }).sort({ createdAt: -1 }).limit(20),
    Recibo.find({ estudiante: id, anulado: false }).sort({ numero: -1 }).limit(30),
    Comprobante.find({ estudiante: id, estado: "aceptado" }).select("tipo serie correlativo fechaEmision total anulado recibo ambiente").sort({ createdAt: -1 }).limit(40),
  ]);
  const f = hoy();
  const cuotas = lista.map((p) => ({ ...p.toObject(), mesNombre: MESES[p.mes], total: p.monto - p.descuento, estadoActual: estadoPension(p, f) }));
  const suma = (est) => cuotas.filter((c) => c.estadoActual === est).reduce((s, c) => s + c.total, 0);
  res.json({ cuotas, totales: { pagado: suma("pagado"), pendiente: suma("pendiente"), vencido: suma("vencido") }, reportes, recibos, comprobantes });
});

const reportarPago = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const { pensiones, metodo, operacion, fechaPago, comprobanteUrl } = req.body;
  if (!Array.isArray(pensiones) || !pensiones.length || !esFechaValida(fechaPago) || !/^https:\/\/res\.cloudinary\.com\//.test(comprobanteUrl || "")) {
    return res.status(400).json({ mensaje: "Elige las cuotas, la fecha y sube la foto del voucher" });
  }
  const cuotas = await Pension.find({ _id: { $in: pensiones.filter(esId) }, estudiante: id, estado: "pendiente" });
  if (!cuotas.length) return res.status(400).json({ mensaje: "Las cuotas elegidas no están pendientes" });
  if (await PagoReportado.exists({ pensiones: { $in: cuotas.map((c) => c._id) }, estado: "pendiente" })) {
    return res.status(409).json({ mensaje: "Ya hay un pago en revisión para alguna de esas cuotas" });
  }
  const r = await PagoReportado.create({
    estudiante: id, reportadoPor: req.usuarioId, pensiones: cuotas.map((c) => c._id),
    monto: cuotas.reduce((s, c) => s + c.monto - c.descuento, 0), metodo: texto(metodo, 30) || "Yape",
    operacion: texto(operacion, 40), fechaPago, comprobanteUrl,
  });
  const admins = await Usuario.find({ rol: "administrativo", activo: true }).select("_id");
  notificar(admins.map((a) => a._id), { titulo: "Pago reportado por una familia", mensaje: `${cuotas.map((c) => c.concepto).join(", ")} · S/ ${r.monto.toFixed(2)}`, tipo: "pago", enlace: "/intranet/administrativo/pensiones?tab=vouchers" });
  res.status(201).json(r);
});

const reciboPdf = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const r = esId(req.params.id) ? await Recibo.findOne({ _id: req.params.id, estudiante: id }) : null;
  if (!r) return res.status(404).json({ mensaje: "Recibo no encontrado" });
  reciboPDF(r, await Usuario.findById(id).populate("aula"), res);
});

const comprobantePdf = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const c = esId(req.params.id) ? await Comprobante.findOne({ _id: req.params.id, estudiante: id }) : null;
  if (!c) return res.status(404).json({ mensaje: "Comprobante no encontrado" });
  await require("../../lib/sunat/pdf").comprobantePDF(c, await require("../../lib/sunat/emitir").obtenerConfig(), res);
});

const carnet = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await estudianteCon(id);
  const config = await obtenerConfig();
  const qr = await QRCode.toDataURL(`ADUNI:${u.codigo}`, { margin: 1, width: 320, errorCorrectionLevel: "M" });
  res.json({ codigo: u.codigo, nombres: u.nombres, apellidos: u.apellidos, dni: u.dni, foto: u.foto, aula: u.aula ? u.aula.nombre : "Sin aula", anio: config.anio, qr });
});

const incidencias = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  res.json(await Incidencia.find({ estudiante: id }).sort({ fecha: -1 }).populate("registradoPor", "nombre"));
});

// ---- Aula virtual ----
const aulaVirtual = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await Usuario.findById(id).select("aula");
  const cursos = u.aula ? await Curso.find({ aula: u.aula }).populate("docente", "nombre").sort({ nombre: 1 }) : [];
  const conteo = await Material.aggregate([{ $match: { curso: { $in: cursos.map((c) => c._id) } } }, { $group: { _id: "$curso", n: { $sum: 1 }, ultimo: { $max: "$createdAt" } } }]);
  res.json(cursos.map((c) => {
    const x = conteo.find((k) => String(k._id) === String(c._id));
    return { id: c._id, nombre: c.nombre, color: c.color, docente: c.docente?.nombre, materiales: x?.n || 0, ultimo: x?.ultimo || null };
  }));
});

const materialesCurso = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await Usuario.findById(id).select("aula");
  const curso = esId(req.params.id) ? await Curso.findOne({ _id: req.params.id, aula: u.aula }).populate("docente", "nombre") : null;
  if (!curso) return res.status(404).json({ mensaje: "Curso no encontrado" });
  res.json({ curso, materiales: await Material.find({ curso: curso._id }).sort({ createdAt: -1 }) });
});

// ---- Exámenes en línea ----
const examenes = h(async (req, res) => {
  const id = await objetivo(req, res);
  if (!id) return;
  const u = await Usuario.findById(id).select("aula");
  const cursos = u.aula ? await Curso.find({ aula: u.aula }).select("_id") : [];
  const lista = await Examen.find({ curso: { $in: cursos.map((c) => c._id) }, publicado: true }).select("-preguntas.correcta").populate("curso", "nombre color").sort({ inicio: -1 });
  const intentos = await Intento.find({ estudiante: id, examen: { $in: lista.map((e) => e._id) } });
  const ahora = new Date();
  res.json(lista.map((e) => {
    const it = intentos.find((x) => String(x.examen) === String(e._id));
    let estado = ahora < e.inicio ? "proximo" : ahora > e.fin ? "cerrado" : "disponible";
    if (it?.enviadoEn) estado = "enviado";
    else if (it && ahora < it.limite) estado = "en_curso";
    return {
      _id: e._id, titulo: e.titulo, curso: e.curso, inicio: e.inicio, fin: e.fin, duracionMin: e.duracionMin,
      preguntas: e.preguntas.length, estado,
      resultado: it?.enviadoEn && e.mostrarResultados ? { puntaje: it.puntaje, total: it.total, nivel: it.nivel } : null,
    };
  }));
});

const examenParaEstudiante = (examen, intento) => {
  const preguntas = intento.orden.map((i) => ({ indice: i, enunciado: examen.preguntas[i].enunciado, opciones: examen.preguntas[i].opciones, puntaje: examen.preguntas[i].puntaje }));
  return { _id: examen._id, titulo: examen.titulo, instrucciones: examen.instrucciones, limite: intento.limite, preguntas, respuestas: intento.respuestas };
};

const iniciarExamen = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "Examen no encontrado" });
  const u = await Usuario.findById(req.usuarioId).select("aula");
  const e = await Examen.findOne({ _id: req.params.id, publicado: true }).populate("curso", "aula");
  if (!e || String(e.curso.aula) !== String(u.aula)) return res.status(404).json({ mensaje: "Examen no encontrado" });
  const ahora = new Date();
  let it = await Intento.findOne({ examen: e._id, estudiante: req.usuarioId });
  if (it?.enviadoEn) return res.status(400).json({ mensaje: "Ya enviaste este examen" });
  if (!it) {
    if (ahora < e.inicio) return res.status(400).json({ mensaje: "El examen aún no empieza" });
    if (ahora > e.fin) return res.status(400).json({ mensaje: "El examen ya cerró" });
    const orden = e.preguntas.map((_, i) => i);
    if (e.aleatorio) orden.sort(() => Math.random() - 0.5);
    const limite = new Date(Math.min(e.fin.getTime(), ahora.getTime() + e.duracionMin * 60000));
    it = await Intento.create({ examen: e._id, estudiante: req.usuarioId, orden, limite, respuestas: e.preguntas.map(() => -1) });
  }
  res.json(examenParaEstudiante(e, it));
});

const nivelPorPorcentaje = (p) => (p >= 0.9 ? "AD" : p >= 0.7 ? "A" : p >= 0.5 ? "B" : "C");

const enviarExamen = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "Examen no encontrado" });
  const it = await Intento.findOne({ examen: req.params.id, estudiante: req.usuarioId });
  if (!it) return res.status(400).json({ mensaje: "Primero inicia el examen" });
  if (it.enviadoEn) return res.status(400).json({ mensaje: "Ya enviaste este examen" });
  const e = await Examen.findById(req.params.id);
  const resp = Array.isArray(req.body.respuestas) ? req.body.respuestas : [];
  const respuestas = e.preguntas.map((_, i) => (Number.isInteger(resp[i]) ? resp[i] : -1));
  const total = e.preguntas.reduce((s, p) => s + p.puntaje, 0);
  const puntaje = e.preguntas.reduce((s, p, i) => s + (respuestas[i] === p.correcta ? p.puntaje : 0), 0);
  it.respuestas = respuestas;
  it.puntaje = puntaje;
  it.total = total;
  it.nivel = nivelPorPorcentaje(total ? puntaje / total : 0);
  it.enviadoEn = new Date();
  it.fueraDeTiempo = it.enviadoEn.getTime() > it.limite.getTime() + 60000; // 1 min de tolerancia
  await it.save();
  res.json(e.mostrarResultados ? { puntaje, total, nivel: it.nivel, fueraDeTiempo: it.fueraDeTiempo } : { mensaje: "Examen enviado" });
});

// Guardado parcial (por si se corta el internet)
const guardarRespuestas = h(async (req, res) => {
  const it = esId(req.params.id) ? await Intento.findOne({ examen: req.params.id, estudiante: req.usuarioId, enviadoEn: null }) : null;
  if (!it) return res.status(404).json({ mensaje: "Intento no encontrado" });
  if (Array.isArray(req.body.respuestas)) it.respuestas = it.respuestas.map((v, i) => (Number.isInteger(req.body.respuestas[i]) ? req.body.respuestas[i] : v));
  await it.save();
  res.json({ ok: true });
});

module.exports = {
  hijos, resumen, horario, calificaciones, libretaPdf, asistencia, misJustificaciones, crearJustificacion,
  tareas, entregarTarea, pagos, reportarPago, reciboPdf, comprobantePdf, carnet, incidencias,
  aulaVirtual, materialesCurso, examenes, iniciarExamen, enviarExamen, guardarRespuestas,
};
