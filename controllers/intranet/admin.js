const crypto = require("crypto");
const Usuario = require("../../models/Usuario");
const Aula = require("../../models/Aula");
const Curso = require("../../models/Curso");
const Horario = require("../../models/Horario");
const Asistencia = require("../../models/Asistencia");
const Justificacion = require("../../models/Justificacion");
const Calificacion = require("../../models/Calificacion");
const Tarea = require("../../models/Tarea");
const Entrega = require("../../models/Entrega");
const Pension = require("../../models/Pension");
const Comunicado = require("../../models/Comunicado");
const Evento = require("../../models/Evento");
const Configuracion = require("../../models/Configuracion");
const { obtenerConfig } = Configuracion;
const { AREAS, GRADOS } = require("../../lib/curriculo");
const { generarCodigo } = require("../../lib/codigos");
const { hoy, horaActual, esFechaValida } = require("../../lib/fechas");
const { h, texto, esId, MESES, resumenAsistencia } = require("./util");
const Recibo = require("../../models/Recibo");
const Contador = require("../../models/Contador");
const AsistenciaPersonal = require("../../models/AsistenciaPersonal");
const { notificar, familiaDe, apoderadosDe } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");
const { esDireccion, esSoporte } = require("../../middleware/authMiddleware");
const { tieneCuentaEnAula } = require("../../lib/cuentas");

// Qué áreas pueden crear/editar cada tipo de cuenta (Dirección puede todo).
const GESTIONA = { estudiante: ["secretaria"], apoderado: ["secretaria"], profesor: ["secretaria", "coordinacion"], administrativo: [] };
// Las cuentas de soporte técnico solo las gestiona el propio soporte.
const puedeGestionar = (req, rol) => (rol === "soporte" ? esSoporte(req) : esDireccion(req) || (GESTIONA[rol] || []).some((x) => req.areas.includes(x)));
const sinPermiso = (res) => res.status(403).json({ mensaje: "Tu área no puede gestionar este tipo de cuenta" });
const limpiarAreas = (areas) => [...new Set((Array.isArray(areas) ? areas : []).filter((x) => Usuario.AREAS.includes(x)))];

// Emite un recibo de caja correlativo.
const emitirRecibo = async ({ estudiante, pensiones, metodo, operacion, fecha, cajero }) => {
  const c = await Contador.findOneAndUpdate({ _id: "recibo-R001" }, { $inc: { valor: 1 } }, { upsert: true, returnDocument: "after" });
  const recibo = await Recibo.create({
    serie: "R001", numero: c.valor, estudiante, pensiones: pensiones.map((p) => p._id),
    conceptos: pensiones.map((p) => ({ concepto: `${p.concepto}${p.descuento ? " (con beca)" : ""}`, monto: p.monto - p.descuento })),
    total: pensiones.reduce((s, p) => s + p.monto - p.descuento, 0), metodo, operacion, fecha, hora: horaActual(), cajero,
  });
  // Boleta electrónica a SUNAT (si está activa); no bloquea ni hace fallar el cobro.
  require("../../lib/sunat/paraRecibo").emitirAutomaticoSiCorresponde(recibo, cajero);
  return recibo;
};

const { claveTemporal } = require("../../lib/codigos");
const { vincularApoderado } = require("../../lib/apoderados");
const hora = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

// ---------------- Dashboard ----------------
const dashboard = h(async (req, res) => {
  const f = hoy();
  const config = await obtenerConfig();
  const mes = Number(f.slice(5, 7));
  const [estudiantes, docentes, aulas, asisHoy, justPend, pens] = await Promise.all([
    Usuario.countDocuments({ rol: "estudiante", activo: true }),
    Usuario.countDocuments({ rol: "profesor", activo: true }),
    Aula.countDocuments({ anio: config.anio }),
    Asistencia.find({ fecha: f }).select("estado").lean(),
    Justificacion.countDocuments({ estado: "pendiente" }),
    Pension.find({ anio: config.anio }).select("estudiante mes monto descuento estado vencimiento").lean(),
  ]);
  const vencidas = pens.filter((p) => p.estado === "pendiente" && p.vencimiento < f);
  const delMes = pens.filter((p) => p.mes === mes);
  res.json({
    hoy: f, hora: horaActual(), anio: config.anio,
    estudiantes, docentes, aulas,
    asistencia: { ...resumenAsistencia(asisHoy), sinRegistro: Math.max(estudiantes - asisHoy.length, 0) },
    justificacionesPendientes: justPend,
    pensiones: {
      recaudadoMes: delMes.filter((p) => p.estado === "pagado").reduce((s, p) => s + p.monto - p.descuento, 0),
      esperadoMes: delMes.reduce((s, p) => s + p.monto - p.descuento, 0),
      vencidas: vencidas.length,
      montoVencido: vencidas.reduce((s, p) => s + p.monto - p.descuento, 0),
      morosos: new Set(vencidas.map((p) => String(p.estudiante))).size,
    },
  });
});

// ---------------- Usuarios ----------------
const listarUsuarios = h(async (req, res) => {
  const filtro = {};
  if (req.query.rol) filtro.rol = req.query.rol;
  if (req.query.aula === "sin") filtro.aula = null;
  else if (esId(req.query.aula)) filtro.aula = req.query.aula;
  if (req.query.q) {
    const q = texto(req.query.q, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtro.$or = [{ nombre: new RegExp(q, "i") }, { codigo: new RegExp(q, "i") }, { dni: new RegExp(q) }];
  }
  res.json(await Usuario.find(filtro).select("-password").populate("aula").sort({ nombre: 1 }).limit(500));
});

const verUsuario = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "No encontrado" });
  const u = await Usuario.findById(req.params.id).select("-password").populate("aula");
  if (!u) return res.status(404).json({ mensaje: "No encontrado" });
  const extra = {};
  if (u.rol === "estudiante") {
    const config = await obtenerConfig();
    const [asis, pens] = await Promise.all([
      Asistencia.find({ estudiante: u._id, fecha: { $gte: `${config.anio}-01-01` } }),
      Pension.find({ estudiante: u._id, anio: config.anio }).sort({ mes: 1 }),
    ]);
    extra.asistencia = resumenAsistencia(asis);
    extra.pensiones = pens;
  }
  if (u.rol === "profesor") extra.cursos = await Curso.find({ docente: u._id }).populate("aula");
  res.json({ usuario: u, ...extra });
});

const camposUsuario = (b) => {
  const d = {
    nombres: texto(b.nombres, 80), apellidos: texto(b.apellidos, 80),
    dni: texto(b.dni, 12), celular: texto(b.celular, 20), direccion: texto(b.direccion, 200),
    fechaNacimiento: esFechaValida(b.fechaNacimiento) ? b.fechaNacimiento : "",
    sexo: ["M", "F"].includes(b.sexo) ? b.sexo : "",
    especialidad: texto(b.especialidad, 80), cargo: texto(b.cargo, 80),
  };
  if (b.email !== undefined) d.email = texto(b.email, 120).toLowerCase() || undefined;
  if (b.apoderado) {
    d.apoderado = {
      nombre: texto(b.apoderado.nombre, 120), parentesco: texto(b.apoderado.parentesco, 30),
      dni: texto(b.apoderado.dni, 12), celular: texto(b.apoderado.celular, 20), email: texto(b.apoderado.email, 120),
    };
  }
  return d;
};

const crearUsuario = h(async (req, res) => {
  const { rol } = req.body;
  if (!Usuario.ROLES.includes(rol)) return res.status(400).json({ mensaje: "Rol inválido" });
  if (!puedeGestionar(req, rol)) return sinPermiso(res);
  const datos = camposUsuario(req.body);
  if (rol === "administrativo") {
    datos.areas = limpiarAreas(req.body.areas);
    if (!datos.areas.length) return res.status(400).json({ mensaje: "Asigna al menos un área a la cuenta administrativa" });
  }
  if (!datos.nombres || !datos.apellidos) return res.status(400).json({ mensaje: "Nombres y apellidos son obligatorios" });
  if (datos.dni && !/^\d{8}$/.test(datos.dni)) return res.status(400).json({ mensaje: "El DNI debe tener 8 dígitos" });
  if (datos.dni && (await Usuario.findOne({ dni: datos.dni }))) return res.status(409).json({ mensaje: "Ya existe un usuario con ese DNI" });
  if (rol === "estudiante" && esId(req.body.aula)) datos.aula = req.body.aula;

  const config = await obtenerConfig();
  const password = typeof req.body.password === "string" && req.body.password.length >= 8 ? req.body.password : claveTemporal();
  const u = await Usuario.create({ ...datos, rol, password, codigo: await generarCodigo(rol, config.anio), debeCambiarPassword: true });
  const ap = rol === "estudiante" ? await vincularApoderado(u._id, datos.apoderado) : null;
  await auditar(req, "Creó usuario", "Usuario", u._id, `${u.rol}${u.areas?.length ? ` (${u.areas.join(", ")})` : ""}: ${u.nombre}`);
  // Alumnos pequeños: sin cuenta propia (la maneja la familia), no se entrega contraseña.
  const sinCuenta = rol === "estudiante" && !tieneCuentaEnAula(datos.aula ? await Aula.findById(datos.aula) : null, config);
  // Las contraseñas temporales solo se devuelven una vez, para entregarlas.
  res.status(201).json({
    id: u._id, codigo: u.codigo, nombre: u.nombre, rol: u.rol, passwordTemporal: sinCuenta ? null : password, sinCuenta,
    apoderado: ap?.password ? { codigo: ap.apoderado.codigo, nombre: ap.apoderado.nombre, passwordTemporal: ap.password } : null,
  });
});

const actualizarUsuario = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "No encontrado" });
  const u = await Usuario.findById(req.params.id);
  if (!u) return res.status(404).json({ mensaje: "No encontrado" });
  if (!puedeGestionar(req, u.rol)) return sinPermiso(res);
  const datos = camposUsuario({ ...u.toObject(), ...req.body });
  if (datos.dni && !/^\d{8}$/.test(datos.dni)) return res.status(400).json({ mensaje: "El DNI debe tener 8 dígitos" });
  const areasAntes = (u.areas || []).join(", ");
  Object.assign(u, datos);
  if (u.rol === "administrativo" && req.body.areas !== undefined) {
    const nuevas = limpiarAreas(req.body.areas);
    if (!nuevas.length) return res.status(400).json({ mensaje: "La cuenta debe tener al menos un área" });
    if (String(u._id) === req.usuarioId && !nuevas.includes("direccion")) return res.status(400).json({ mensaje: "No puedes quitarte el área de Dirección a ti mismo" });
    u.areas = nuevas;
  }
  if (u.rol === "estudiante" && req.body.aula !== undefined) u.aula = esId(req.body.aula) ? req.body.aula : null;
  await u.save();
  const areasDespues = (u.areas || []).join(", ");
  const cambioAreas = areasAntes !== areasDespues;
  await auditar(req, cambioAreas ? "Cambió áreas de acceso" : "Editó datos de usuario", "Usuario", u._id,
    cambioAreas ? `${u.nombre}: [${areasAntes}] → [${areasDespues}]` : u.nombre, cambioAreas ? "seguridad" : undefined);
  res.json({ mensaje: "Datos actualizados" });
});

const restablecerPassword = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "No encontrado" });
  const u = await Usuario.findById(req.params.id);
  if (!u) return res.status(404).json({ mensaje: "No encontrado" });
  if (!puedeGestionar(req, u.rol)) return sinPermiso(res);
  const password = claveTemporal();
  u.password = password;
  u.debeCambiarPassword = true;
  u.passwordCambiadaEn = new Date();
  await u.save();
  await auditar(req, "Restableció la contraseña de otro usuario", "Usuario", u._id, u.nombre, "seguridad");
  res.json({ codigo: u.codigo, passwordTemporal: password });
});

// Acciones de seguridad sobre una cuenta (Dirección, el área que la gestiona o soporte).
const cuentaGestionable = async (req, res) => {
  const u = esId(req.params.id) ? await Usuario.findById(req.params.id) : null;
  if (!u) { res.status(404).json({ mensaje: "No encontrado" }); return null; }
  if (!puedeGestionar(req, u.rol)) { sinPermiso(res); return null; }
  return u;
};

const desbloquearCuenta = h(async (req, res) => {
  const u = await cuentaGestionable(req, res);
  if (!u) return;
  u.intentosFallidos = 0;
  u.bloqueadoHasta = null;
  await u.save();
  await auditar(req, "Desbloqueó cuenta", "Usuario", u._id, u.nombre, "seguridad");
  res.json({ mensaje: "Cuenta desbloqueada" });
});

const cerrarSesiones = h(async (req, res) => {
  const u = await cuentaGestionable(req, res);
  if (!u) return;
  u.sesionesCerradasEn = new Date();
  await u.save();
  await auditar(req, "Cerró las sesiones abiertas de un usuario", "Usuario", u._id, u.nombre, "seguridad");
  res.json({ mensaje: "Se cerraron todas sus sesiones. Deberá iniciar sesión de nuevo." });
});

// Para quien perdió su celular: se le quita la verificación en dos pasos (solo Dirección o soporte).
const quitar2FA = h(async (req, res) => {
  if (!esDireccion(req)) return res.status(403).json({ mensaje: "Solo Dirección o soporte técnico" });
  const u = await cuentaGestionable(req, res);
  if (!u) return;
  if (u.rol === "soporte") return res.status(400).json({ mensaje: "La cuenta de soporte siempre debe tener verificación en dos pasos" });
  await Usuario.updateOne({ _id: u._id }, { totpActivo: false, totpSecret: "", sesionesCerradasEn: new Date() });
  await auditar(req, "Quitó la verificación en dos pasos de un usuario", "Usuario", u._id, u.nombre, "seguridad");
  res.json({ mensaje: "Verificación en dos pasos desactivada para esa cuenta" });
});

const cambiarEstadoUsuario = h(async (req, res) => {
  if (req.params.id === req.usuarioId) return res.status(400).json({ mensaje: "No puedes suspender tu propia cuenta" });
  const objetivo = esId(req.params.id) ? await Usuario.findById(req.params.id).select("rol") : null;
  if (!objetivo) return res.status(404).json({ mensaje: "No encontrado" });
  if (!puedeGestionar(req, objetivo.rol)) return sinPermiso(res);
  const u = await Usuario.findByIdAndUpdate(req.params.id, { activo: !!req.body.activo }, { returnDocument: "after" }).select("-password");
  if (!u) return res.status(404).json({ mensaje: "No encontrado" });
  await auditar(req, u.activo ? "Reactivó usuario" : "Suspendió usuario", "Usuario", u._id, u.nombre);
  res.json(u);
});

// ---------------- Aulas ----------------
const listarAulas = h(async (req, res) => {
  const config = await obtenerConfig();
  const aulas = await Aula.find({ anio: Number(req.query.anio) || config.anio }).populate("tutor", "nombre").sort({ nivel: 1, grado: 1, seccion: 1 });
  const conteos = await Promise.all(aulas.map((a) => Promise.all([
    Usuario.countDocuments({ rol: "estudiante", aula: a._id, activo: true }),
    Curso.countDocuments({ aula: a._id }),
  ])));
  res.json(aulas.map((a, i) => ({ ...a.toJSON(), estudiantes: conteos[i][0], cursos: conteos[i][1] })));
});

const crearAula = h(async (req, res) => {
  const { nivel, grado, seccion, turno, tutor, capacidad } = req.body;
  const g = Number(grado);
  if (!GRADOS[nivel] || !(g >= 1 && g <= GRADOS[nivel]) || !texto(seccion, 2)) return res.status(400).json({ mensaje: "Nivel, grado y sección válidos son obligatorios" });
  if (tutor && !(await Usuario.findOne({ _id: tutor, rol: "profesor" }))) return res.status(400).json({ mensaje: "Tutor inválido" });
  const config = await obtenerConfig();
  const a = await Aula.create({ nivel, grado: g, seccion: texto(seccion, 2), anio: config.anio, turno: turno === "tarde" ? "tarde" : "mañana", tutor: tutor || null, capacidad: Number(capacidad) || 30 });
  await auditar(req, "Creó aula", "Aula", a._id, a.nombre);
  res.status(201).json(a);
});

const actualizarAula = h(async (req, res) => {
  const { tutor, turno, capacidad } = req.body;
  const cambios = {};
  if (tutor !== undefined) {
    if (tutor && !(await Usuario.findOne({ _id: tutor, rol: "profesor" }))) return res.status(400).json({ mensaje: "Tutor inválido" });
    cambios.tutor = tutor || null;
  }
  if (turno) cambios.turno = turno === "tarde" ? "tarde" : "mañana";
  if (capacidad) cambios.capacidad = Number(capacidad);
  const a = await Aula.findByIdAndUpdate(req.params.id, cambios, { returnDocument: "after" });
  if (!a) return res.status(404).json({ mensaje: "Aula no encontrada" });
  await auditar(req, "Modificó aula", "Aula", a._id, `${a.nombre}${cambios.tutor !== undefined ? " (cambio de tutor)" : ""}`);
  res.json(a);
});

// ---------------- Cursos ----------------
const curriculo = h(async (req, res) => res.json(AREAS));

const listarCursos = h(async (req, res) => {
  const filtro = esId(req.query.aula) ? { aula: req.query.aula } : {};
  res.json(await Curso.find(filtro).populate("docente", "nombre").populate("aula").sort({ nombre: 1 }));
});

const crearCurso = h(async (req, res) => {
  const { aula, nombre, docente, competencias, horasSemanales, color } = req.body;
  const a = esId(aula) ? await Aula.findById(aula) : null;
  if (!a || !texto(nombre)) return res.status(400).json({ mensaje: "Aula y nombre del curso son obligatorios" });
  if (docente && !(await Usuario.findOne({ _id: docente, rol: "profesor" }))) return res.status(400).json({ mensaje: "Docente inválido" });
  const comps = Array.isArray(competencias) && competencias.length
    ? competencias.map((c) => texto(c, 250)).filter(Boolean)
    : AREAS[a.nivel][texto(nombre)] || [];
  if (!comps.length) return res.status(400).json({ mensaje: "Indica al menos una competencia" });
  const c = await Curso.create({
    aula: a._id, nombre: texto(nombre), docente: docente || null, competencias: comps,
    horasSemanales: Number(horasSemanales) || 0, color: /^#[0-9a-f]{6}$/i.test(color) ? color : "#1b4aa0",
  });
  await auditar(req, "Creó curso", "Curso", c._id, `${c.nombre} en ${a.nombre}`);
  res.status(201).json(c);
});

const actualizarCurso = h(async (req, res) => {
  const { docente, competencias, horasSemanales, color } = req.body;
  const cambios = {};
  if (docente !== undefined) {
    if (docente && !(await Usuario.findOne({ _id: docente, rol: "profesor" }))) return res.status(400).json({ mensaje: "Docente inválido" });
    cambios.docente = docente || null;
  }
  if (Array.isArray(competencias)) cambios.competencias = competencias.map((c) => texto(c, 250)).filter(Boolean);
  if (horasSemanales !== undefined) cambios.horasSemanales = Number(horasSemanales) || 0;
  if (/^#[0-9a-f]{6}$/i.test(color || "")) cambios.color = color;
  const c = await Curso.findByIdAndUpdate(req.params.id, cambios, { returnDocument: "after" });
  if (!c) return res.status(404).json({ mensaje: "Curso no encontrado" });
  await auditar(req, cambios.docente !== undefined ? "Cambió docente de curso" : "Modificó curso", "Curso", c._id, c.nombre);
  res.json(c);
});

const eliminarCurso = h(async (req, res) => {
  if (!esId(req.params.id)) return res.status(404).json({ mensaje: "Curso no encontrado" });
  if (await Calificacion.exists({ curso: req.params.id })) return res.status(400).json({ mensaje: "El curso ya tiene calificaciones registradas; no se puede eliminar" });
  const tareas = await Tarea.find({ curso: req.params.id }).select("_id");
  await Promise.all([
    Horario.deleteMany({ curso: req.params.id }),
    Entrega.deleteMany({ tarea: { $in: tareas.map((t) => t._id) } }),
    Tarea.deleteMany({ curso: req.params.id }),
  ]);
  const borrado = await Curso.findByIdAndDelete(req.params.id).populate("aula");
  await auditar(req, "Eliminó curso", "Curso", req.params.id, `${borrado?.nombre} de ${borrado?.aula?.nombre}`);
  res.json({ mensaje: "Curso eliminado" });
});

// ---------------- Horarios ----------------
const listarHorario = h(async (req, res) => {
  if (!esId(req.query.aula)) return res.status(400).json({ mensaje: "Indica el aula" });
  res.json(await Horario.find({ aula: req.query.aula }).sort({ dia: 1, horaInicio: 1 }).populate({ path: "curso", select: "nombre color docente", populate: { path: "docente", select: "nombre" } }));
});

const crearBloque = h(async (req, res) => {
  const { curso, dia, horaInicio, horaFin } = req.body;
  const c = esId(curso) ? await Curso.findById(curso) : null;
  const d = Number(dia);
  if (!c || !(d >= 1 && d <= 5) || !hora(horaInicio) || !hora(horaFin) || horaInicio >= horaFin) {
    return res.status(400).json({ mensaje: "Curso, día y horas válidas son obligatorios" });
  }
  const choca = (q) => Horario.findOne({ ...q, dia: d, horaInicio: { $lt: horaFin }, horaFin: { $gt: horaInicio } }).populate("curso", "nombre").populate("aula");
  const enAula = await choca({ aula: c.aula });
  if (enAula) return res.status(409).json({ mensaje: `Se cruza con ${enAula.curso.nombre} (${enAula.horaInicio}-${enAula.horaFin})` });
  if (c.docente) {
    const cursosDoc = await Curso.find({ docente: c.docente }).select("_id");
    const enDocente = await choca({ curso: { $in: cursosDoc.map((x) => x._id) } });
    if (enDocente) return res.status(409).json({ mensaje: `El docente ya dicta ${enDocente.curso.nombre} en ${enDocente.aula.nombre} a esa hora` });
  }
  const b = await Horario.create({ aula: c.aula, curso: c._id, dia: d, horaInicio, horaFin });
  await auditar(req, "Agregó bloque de horario", "Horario", b._id, `${c.nombre} · día ${d} · ${horaInicio}-${horaFin}`);
  res.status(201).json(b);
});

const eliminarBloque = h(async (req, res) => {
  const b = await Horario.findByIdAndDelete(req.params.id).populate("curso", "nombre");
  await auditar(req, "Eliminó bloque de horario", "Horario", req.params.id, b ? `${b.curso?.nombre} · día ${b.dia} · ${b.horaInicio}-${b.horaFin}` : "");
  res.json({ mensaje: "Bloque eliminado" });
});

// ---------------- Asistencia ----------------
// Registro de ingreso por QR del carné o por código (lector de barras/teclado).
const marcarIngreso = h(async (req, res) => {
  const bruto = texto(req.body.codigo, 60).toUpperCase();
  const codigo = bruto.startsWith("ADUNI:") ? bruto.slice(6) : bruto;
  const metodo = req.body.metodo === "qr" ? "qr" : "codigo";
  const u = await Usuario.findOne({ codigo, rol: { $in: ["estudiante", "profesor", "administrativo"] } }).populate("aula");
  if (!u) return res.status(404).json({ mensaje: `No existe un usuario con código ${codigo || "(vacío)"}` });
  if (u.rol === "estudiante") {
    return res.status(400).json({ mensaje: `${u.nombre}: la asistencia de estudiantes la registra el docente en cada clase` });
  }

  // Docentes y personal: ingreso y, si ya ingresaron, salida.
  if (u.rol !== "estudiante") {
    if (!u.activo) return res.status(403).json({ mensaje: `${u.nombre}: cuenta suspendida` });
    const f = hoy();
    const ahora = horaActual();
    const config = await obtenerConfig();
    const previo = await AsistenciaPersonal.findOne({ usuario: u._id, fecha: f });
    const base = { id: u._id, nombre: u.nombre, nombres: u.nombres, codigo: u.codigo, aula: u.rol === "profesor" ? "Docente" : u.cargo || "Personal", personal: true };
    if (previo) {
      if (!previo.horaSalida && ahora > previo.horaIngreso) {
        previo.horaSalida = ahora;
        await previo.save();
        return res.json({ ...base, estado: previo.estado, hora: ahora, salida: true });
      }
      return res.json({ ...base, estado: previo.estado, hora: previo.horaIngreso, repetido: true });
    }
    const estado = ahora <= (config.horaIngresoPersonal || "07:30") ? "P" : "T";
    await AsistenciaPersonal.create({ usuario: u._id, fecha: f, horaIngreso: ahora, estado, metodo });
    await auditar(req, "Registró ingreso del personal", "AsistenciaPersonal", u._id, `${u.nombre} ${ahora} ${estado === "P" ? "puntual" : "tardanza"}`, "otro");
    return res.json({ ...base, estado, hora: ahora, repetido: false });
  }
  if (!u.activo) return res.status(403).json({ mensaje: `${u.nombre}: cuenta suspendida` });
  if (!u.aula) return res.status(400).json({ mensaje: `${u.nombre} no tiene aula asignada` });

  const f = hoy();
  const ahora = horaActual();
  const config = await obtenerConfig();
  const base = { id: u._id, nombre: u.nombre, nombres: u.nombres, codigo: u.codigo, aula: u.aula.nombre };
  const previo = await Asistencia.findOne({ estudiante: u._id, fecha: f });
  if (previo && previo.estado !== "F") {
    return res.json({ ...base, estado: previo.estado, hora: previo.horaIngreso, repetido: true });
  }
  const estado = ahora <= config.horaIngreso ? "P" : "T";
  await Asistencia.findOneAndUpdate(
    { estudiante: u._id, fecha: f },
    { aula: u.aula._id, estado, horaIngreso: ahora, metodo, registradoPor: req.usuarioId },
    { upsert: true }
  );
  // Aviso inmediato a la familia (campana, push y WhatsApp si está configurado).
  notificar(await apoderadosDe(u._id), {
    titulo: `${u.nombres} ingresó al colegio`,
    mensaje: `${ahora} · ${estado === "P" ? "Puntual" : "Tardanza"}`,
    tipo: "asistencia", enlace: "/intranet/familia/asistencia", clave: `ingreso-${u._id}-${f}`, whatsapp: true,
  });
  res.json({ ...base, estado, hora: ahora, repetido: false });
});

const asistenciaDelDia = h(async (req, res) => {
  const fecha = esFechaValida(req.query.fecha) ? req.query.fecha : hoy();
  const config = await obtenerConfig();
  const aulas = await Aula.find({ anio: config.anio }).sort({ nivel: 1, grado: 1, seccion: 1 });
  const registros = await Asistencia.find({ fecha });
  const res2 = await Promise.all(aulas.map(async (a) => {
    const total = await Usuario.countDocuments({ rol: "estudiante", aula: a._id, activo: true });
    const r = resumenAsistencia(registros.filter((x) => String(x.aula) === String(a._id)));
    return { aula: a, ...r, registrados: r.total, total, sinRegistro: Math.max(total - r.total, 0) };
  }));
  res.json({ fecha, aulas: res2 });
});

const detalleAsistenciaAula = h(async (req, res) => {
  const fecha = esFechaValida(req.query.fecha) ? req.query.fecha : hoy();
  if (!esId(req.query.aula)) return res.status(400).json({ mensaje: "Indica el aula" });
  const [estudiantes, registros] = await Promise.all([
    Usuario.find({ rol: "estudiante", aula: req.query.aula, activo: true }).select("nombre codigo apoderado").sort({ nombre: 1 }),
    Asistencia.find({ aula: req.query.aula, fecha }),
  ]);
  res.json(estudiantes.map((e) => {
    const r = registros.find((x) => String(x.estudiante) === String(e._id));
    return { id: e._id, nombre: e.nombre, codigo: e.codigo, apoderado: e.apoderado, estado: r?.estado || "", hora: r?.horaIngreso || "", metodo: r?.metodo || "", observacion: r?.observacion || "" };
  }));
});

const corregirAsistencia = h(async (req, res) => {
  const { estudiante, fecha, estado, observacion } = req.body;
  if (!esId(estudiante) || !esFechaValida(fecha) || !["P", "T", "F", "J", ""].includes(estado)) return res.status(400).json({ mensaje: "Datos inválidos" });
  if (!estado) {
    await Asistencia.deleteOne({ estudiante, fecha });
    return res.json({ mensaje: "Registro eliminado" });
  }
  const u = await Usuario.findById(estudiante).select("aula");
  await Asistencia.findOneAndUpdate(
    { estudiante, fecha },
    { $set: { aula: u.aula, estado, observacion: texto(observacion, 200), registradoPor: req.usuarioId }, $setOnInsert: { metodo: "manual" } },
    { upsert: true }
  );
  await auditar(req, "Corrigió asistencia", "Usuario", estudiante, `${fecha} → ${estado}`);
  res.json({ mensaje: "Asistencia actualizada" });
});

// Al cierre del día: quien no registró ingreso queda con falta.
const cerrarDia = h(async (req, res) => {
  const fecha = esFechaValida(req.body.fecha) ? req.body.fecha : hoy();
  if (fecha > hoy()) return res.status(400).json({ mensaje: "No puedes cerrar un día futuro" });
  const dia = new Date(`${fecha}T12:00:00Z`).getUTCDay();
  if (dia === 0 || dia === 6) return res.status(400).json({ mensaje: "Es fin de semana" });
  if (await Evento.exists({ fecha, tipo: "feriado" })) return res.status(400).json({ mensaje: "Ese día es feriado" });
  const estudiantes = await Usuario.find({ rol: "estudiante", activo: true, aula: { $ne: null } }).select("_id aula");
  const conRegistro = new Set((await Asistencia.find({ fecha }).select("estudiante")).map((a) => String(a.estudiante)));
  const faltan = estudiantes.filter((e) => !conRegistro.has(String(e._id)));
  if (faltan.length) {
    await Asistencia.insertMany(faltan.map((e) => ({ estudiante: e._id, aula: e.aula, fecha, estado: "F", metodo: "automatico", registradoPor: req.usuarioId })), { ordered: false });
    // Aviso a cada familia de que su hijo no registró ingreso.
    for (const e of faltan) {
      const est = await Usuario.findById(e._id).select("nombres");
      notificar(await apoderadosDe(e._id), {
        titulo: `${est.nombres} no registró ingreso hoy`, mensaje: `${fecha} · Si fue por un motivo justificado, envía la justificación desde la intranet.`,
        tipo: "asistencia", enlace: "/intranet/familia/asistencia", clave: `falta-${e._id}-${fecha}`, whatsapp: true,
      });
    }
  }
  await auditar(req, "Cerró el día de asistencia", "Asistencia", "", `${fecha}: ${faltan.length} faltas`);
  res.json({ mensaje: `Día cerrado: ${faltan.length} faltas registradas`, faltas: faltan.length });
});

const reporteAsistencia = h(async (req, res) => {
  if (!esId(req.query.aula)) return res.status(400).json({ mensaje: "Indica el aula" });
  const config = await obtenerConfig();
  const desde = esFechaValida(req.query.desde) ? req.query.desde : `${config.anio}-01-01`;
  const hasta = esFechaValida(req.query.hasta) ? req.query.hasta : hoy();
  const [estudiantes, registros] = await Promise.all([
    Usuario.find({ rol: "estudiante", aula: req.query.aula, activo: true }).select("nombre codigo").sort({ nombre: 1 }),
    Asistencia.find({ aula: req.query.aula, fecha: { $gte: desde, $lte: hasta } }),
  ]);
  res.json({
    desde, hasta,
    estudiantes: estudiantes.map((e) => ({ id: e._id, nombre: e.nombre, codigo: e.codigo, ...resumenAsistencia(registros.filter((r) => String(r.estudiante) === String(e._id))) })),
  });
});

// ---------------- Justificaciones ----------------
const listarJustificaciones = h(async (req, res) => {
  const filtro = req.query.estado ? { estado: req.query.estado } : {};
  res.json(await Justificacion.find(filtro).sort({ createdAt: -1 }).limit(200).populate({ path: "estudiante", select: "nombre codigo aula", populate: { path: "aula" } }));
});

const resolverJustificacion = h(async (req, res) => {
  const { estado, respuesta } = req.body;
  if (!["aprobada", "rechazada"].includes(estado)) return res.status(400).json({ mensaje: "Estado inválido" });
  const j = await Justificacion.findById(req.params.id);
  if (!j) return res.status(404).json({ mensaje: "No encontrada" });
  j.estado = estado;
  j.respuesta = texto(respuesta, 500);
  j.revisadoPor = req.usuarioId;
  await j.save();
  if (estado === "aprobada") {
    const u = await Usuario.findById(j.estudiante).select("aula");
    const AsistenciaClase = require("../../models/AsistenciaClase");
    const tomas = await AsistenciaClase.find({ fecha: j.fecha, "registros.estudiante": j.estudiante });
    for (const t of tomas) {
      t.registros.forEach((r) => {
        if (String(r.estudiante) !== String(j.estudiante)) return;
        if (r.estado === "F") r.estado = "J";
        else if (r.estado === "T") r.estado = "P";
      });
      await t.save();
    }
    const previo = await Asistencia.findOne({ estudiante: j.estudiante, fecha: j.fecha });
    // Una tardanza justificada pasa a puntual; una falta (o sin registro) pasa a justificada.
    const nuevo = previo?.estado === "T" ? "P" : "J";
    await Asistencia.findOneAndUpdate(
      { estudiante: j.estudiante, fecha: j.fecha },
      { $set: { aula: u.aula, estado: nuevo, observacion: "Justificada" }, $setOnInsert: { metodo: "manual" } },
      { upsert: true }
    );
  }
  notificar(await familiaDe(j.estudiante), {
    titulo: `Justificación ${estado}`, mensaje: `${j.fecha}${j.respuesta ? ` · ${j.respuesta}` : ""}`,
    tipo: "asistencia", enlace: "/intranet/estudiante/asistencia",
  });
  await auditar(req, `Justificación ${estado}`, "Justificacion", j._id, j.fecha);
  res.json(j);
});

// ---------------- Pensiones ----------------
const ultimoDia = (anio, mes) => new Date(Date.UTC(anio, mes, 0)).getUTCDate();

const generarPensiones = h(async (req, res) => {
  const config = await obtenerConfig();
  const anio = config.anio;
  const filtro = { rol: "estudiante", activo: true };
  if (esId(req.body.aula)) filtro.aula = req.body.aula;
  if (esId(req.body.estudiante)) filtro._id = req.body.estudiante;
  const estudiantes = await Usuario.find(filtro).select("_id");
  const ops = [];
  for (const e of estudiantes) {
    ops.push({ updateOne: { filter: { estudiante: e._id, anio, mes: 0 }, update: { $setOnInsert: { concepto: `Matrícula ${anio}`, monto: config.montoMatricula, vencimiento: `${anio}-03-01` } }, upsert: true } });
    for (let m = 3; m <= 12; m++) {
      const d = Math.min(config.diaVencimiento, ultimoDia(anio, m));
      ops.push({ updateOne: { filter: { estudiante: e._id, anio, mes: m }, update: { $setOnInsert: { concepto: `Pensión ${MESES[m]}`, monto: config.montoPension, vencimiento: `${anio}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` } }, upsert: true } });
    }
  }
  const r = ops.length ? await Pension.bulkWrite(ops) : { upsertedCount: 0 };
  await auditar(req, "Generó cronograma de pensiones", "Pension", "", `${r.upsertedCount} cuotas nuevas`);
  res.json({ mensaje: `Cronograma generado: ${r.upsertedCount} cuotas nuevas para ${estudiantes.length} estudiantes` });
});

const listarPensiones = h(async (req, res) => {
  const config = await obtenerConfig();
  const f = hoy();
  const filtro = { anio: Number(req.query.anio) || config.anio };
  if (req.query.mes !== undefined && req.query.mes !== "") filtro.mes = Number(req.query.mes);
  if (esId(req.query.aula)) {
    const ids = await Usuario.find({ rol: "estudiante", aula: req.query.aula }).distinct("_id");
    filtro.estudiante = { $in: ids };
  }
  if (esId(req.query.estudiante)) filtro.estudiante = req.query.estudiante;
  if (req.query.estado === "pagado") filtro.estado = "pagado";
  if (req.query.estado === "pendiente") { filtro.estado = "pendiente"; filtro.vencimiento = { $gte: f }; }
  if (req.query.estado === "vencido") { filtro.estado = "pendiente"; filtro.vencimiento = { $lt: f }; }
  const lista = await Pension.find(filtro).sort({ mes: 1 }).limit(1000).populate({ path: "estudiante", select: "nombre codigo aula apoderado", populate: { path: "aula" } });
  res.json(lista.map((p) => ({ ...p.toObject(), total: p.monto - p.descuento, estadoActual: p.estado === "pagado" ? "pagado" : p.vencimiento < f ? "vencido" : "pendiente" })));
});

const pagarPension = h(async (req, res) => {
  const p = await Pension.findById(req.params.id);
  if (!p) return res.status(404).json({ mensaje: "Cuota no encontrada" });
  if (p.estado === "pagado") return res.status(400).json({ mensaje: "Esta cuota ya está pagada" });
  p.estado = "pagado";
  p.fechaPago = esFechaValida(req.body.fechaPago) ? req.body.fechaPago : hoy();
  p.metodo = texto(req.body.metodo, 30) || "efectivo";
  p.operacion = texto(req.body.operacion, 40);
  p.registradoPor = req.usuarioId;
  await p.save();
  const recibo = await emitirRecibo({ estudiante: p.estudiante, pensiones: [p], metodo: p.metodo, operacion: p.operacion, fecha: p.fechaPago, cajero: req.usuarioId });
  await auditar(req, "Registró pago", "Pension", p._id, `${p.concepto} · S/ ${(p.monto - p.descuento).toFixed(2)} · ${p.metodo} · recibo ${recibo.numero}`);
  notificar(await familiaDe(p.estudiante), { titulo: "Pago registrado", mensaje: `${p.concepto} · S/ ${(p.monto - p.descuento).toFixed(2)}`, tipo: "pago", enlace: "/intranet/familia/pagos" });
  res.json({ ...p.toObject(), recibo: recibo._id });
});

const anularPago = h(async (req, res) => {
  const p = await Pension.findByIdAndUpdate(req.params.id, { estado: "pendiente", fechaPago: "", metodo: "", operacion: "" }, { returnDocument: "after" });
  if (!p) return res.status(404).json({ mensaje: "Cuota no encontrada" });
  await Recibo.updateMany({ pensiones: p._id, anulado: false }, { anulado: true, motivoAnulacion: texto(req.body?.motivo, 200) || "Pago anulado" });
  await auditar(req, "Anuló pago", "Pension", p._id, p.concepto);
  res.json(p);
});

const actualizarPension = h(async (req, res) => {
  const cambios = {};
  if (req.body.descuento !== undefined) cambios.descuento = Math.max(0, Number(req.body.descuento) || 0);
  if (req.body.monto !== undefined) cambios.monto = Math.max(0, Number(req.body.monto) || 0);
  const p = await Pension.findByIdAndUpdate(req.params.id, cambios, { returnDocument: "after", runValidators: true });
  if (!p) return res.status(404).json({ mensaje: "Cuota no encontrada" });
  await auditar(req, "Modificó beca o monto de pensión", "Pension", p._id, `${p.concepto}: monto ${p.monto}, descuento ${p.descuento}`);
  res.json(p);
});

// ---------------- Comunicados y agenda ----------------
const crearComunicado = h(async (req, res) => {
  const { titulo, contenido, destinatarios, aula, importante } = req.body;
  if (!texto(titulo) || !texto(contenido, 3000)) return res.status(400).json({ mensaje: "Título y contenido son obligatorios" });
  const c = await Comunicado.create({
    titulo: texto(titulo), contenido: texto(contenido, 3000),
    destinatarios: ["todos", "estudiante", "profesor"].includes(destinatarios) ? destinatarios : "todos",
    aula: esId(aula) ? aula : null, importante: !!importante, autor: req.usuarioId,
  });
  // Destinatarios: estudiantes (y sus familias) y/o docentes, opcionalmente de un aula.
  const filtroEst = { rol: "estudiante", activo: true, ...(c.aula ? { aula: c.aula } : {}) };
  let ids = [];
  if (c.destinatarios !== "profesor") {
    const est = await Usuario.find(filtroEst).select("_id");
    ids = await familiaDe(est.map((e) => e._id));
  }
  if (c.destinatarios !== "estudiante") {
    const docentes = c.aula
      ? [...(await Curso.find({ aula: c.aula }).distinct("docente")), (await Aula.findById(c.aula))?.tutor].filter(Boolean)
      : (await Usuario.find({ rol: "profesor", activo: true }).select("_id")).map((d) => d._id);
    ids.push(...docentes);
  }
  notificar(ids, { titulo: c.importante ? `Importante: ${c.titulo}` : c.titulo, mensaje: c.contenido.slice(0, 140), tipo: "comunicado", enlace: "/intranet/estudiante/comunicados", whatsapp: c.importante });
  await auditar(req, "Publicó comunicado", "Comunicado", c._id, c.titulo);
  res.status(201).json(c);
});

const eliminarComunicado = h(async (req, res) => {
  const c = await Comunicado.findByIdAndDelete(req.params.id);
  await auditar(req, "Eliminó comunicado", "Comunicado", req.params.id, c?.titulo || "");
  res.json({ mensaje: "Comunicado eliminado" });
});

const crearEvento = h(async (req, res) => {
  const { titulo, fecha, tipo, descripcion } = req.body;
  if (!texto(titulo) || !esFechaValida(fecha)) return res.status(400).json({ mensaje: "Título y fecha son obligatorios" });
  const ev = await Evento.create({ titulo: texto(titulo), fecha, tipo, descripcion: texto(descripcion, 500) });
  await auditar(req, "Agregó evento a la agenda", "Evento", ev._id, `${ev.fecha} · ${ev.titulo}`);
  res.status(201).json(ev);
});

const eliminarEvento = h(async (req, res) => {
  const ev = await Evento.findByIdAndDelete(req.params.id);
  await auditar(req, "Eliminó evento de la agenda", "Evento", req.params.id, ev ? `${ev.fecha} · ${ev.titulo}` : "");
  res.json({ mensaje: "Evento eliminado" });
});

// ---------------- Configuración ----------------
const verConfiguracion = h(async (req, res) => res.json(await obtenerConfig()));

const guardarConfiguracion = h(async (req, res) => {
  const c = await obtenerConfig();
  const b = req.body;
  if (b.horaIngreso && hora(b.horaIngreso)) c.horaIngreso = b.horaIngreso;
  if (b.horaLimiteFalta && hora(b.horaLimiteFalta)) c.horaLimiteFalta = b.horaLimiteFalta;
  if (b.horaIngresoPersonal && hora(b.horaIngresoPersonal)) c.horaIngresoPersonal = b.horaIngresoPersonal;
  ["margenAsistenciaAntes", "margenAsistenciaDespues"].forEach((k) => { if (b[k] !== undefined && Number(b[k]) >= 0 && Number(b[k]) <= 180) c[k] = Number(b[k]); });
  if (b.gradoMinimoCuentaPrimaria !== undefined && Number(b.gradoMinimoCuentaPrimaria) >= 1 && Number(b.gradoMinimoCuentaPrimaria) <= 7) c.gradoMinimoCuentaPrimaria = Number(b.gradoMinimoCuentaPrimaria);
  ["montoMatricula", "montoPension", "diaVencimiento"].forEach((k) => { if (b[k] !== undefined && Number(b[k]) >= 0) c[k] = Number(b[k]); });
  if (Array.isArray(b.periodos) && b.periodos.every((p) => esFechaValida(p.inicio) && esFechaValida(p.fin))) {
    c.periodos = b.periodos.map((p, i) => ({ numero: i + 1, nombre: texto(p.nombre, 40) || `Periodo ${i + 1}`, inicio: p.inicio, fin: p.fin }));
  }
  await c.save();
  await auditar(req, "Modificó la configuración del año académico", "Configuracion", "general");
  res.json(c);
});

module.exports = {
  desbloquearCuenta, cerrarSesiones, quitar2FA,
  emitirRecibo, claveTemporal, camposUsuario,
  dashboard,
  listarUsuarios, verUsuario, crearUsuario, actualizarUsuario, restablecerPassword, cambiarEstadoUsuario,
  listarAulas, crearAula, actualizarAula,
  curriculo, listarCursos, crearCurso, actualizarCurso, eliminarCurso,
  listarHorario, crearBloque, eliminarBloque,
  marcarIngreso, asistenciaDelDia, detalleAsistenciaAula, corregirAsistencia, cerrarDia, reporteAsistencia,
  listarJustificaciones, resolverJustificacion,
  generarPensiones, listarPensiones, pagarPension, anularPago, actualizarPension,
  crearComunicado, eliminarComunicado, crearEvento, eliminarEvento,
  verConfiguracion, guardarConfiguracion,
};
