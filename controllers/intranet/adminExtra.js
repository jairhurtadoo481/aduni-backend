const ExcelJS = require("exceljs");
const JSZip = require("jszip");
const mongoose = require("mongoose");
const Usuario = require("../../models/Usuario");
const Aula = require("../../models/Aula");
const Curso = require("../../models/Curso");
const Asistencia = require("../../models/Asistencia");
const AsistenciaPersonal = require("../../models/AsistenciaPersonal");
const Calificacion = require("../../models/Calificacion");
const Pension = require("../../models/Pension");
const PagoReportado = require("../../models/PagoReportado");
const Recibo = require("../../models/Recibo");
const Incidencia = require("../../models/Incidencia");
const Auditoria = require("../../models/Auditoria");
const Noticia = require("../../models/Noticia");
const Postulacion = require("../../models/Postulacion");
const Configuracion = require("../../models/Configuracion");
const { obtenerConfig, periodoDeFecha } = Configuracion;
const { GRADOS, resumirNiveles } = require("../../lib/curriculo");
const { generarCodigo } = require("../../lib/codigos");
const { libretaDe, alertasTempranas } = require("../../lib/academico");
const { libretasPDF, reciboPDF, carnetsPDF } = require("../../lib/pdf");
const { notificar, familiaDe, enviarCorreo, enviarWhatsApp } = require("../../lib/notificar");
const { auditar } = require("../../lib/auditar");
const { hoy, esFechaValida } = require("../../lib/fechas");
const { h, texto, esId, MESES } = require("./util");
const { emitirRecibo } = require("./admin");
const { claveTemporal } = require("../../lib/codigos");
const { vincularApoderado } = require("../../lib/apoderados");
const { tieneCuentaEnAula } = require("../../lib/cuentas");

// =============== Apoderados ===============
const generarApoderados = h(async (req, res) => {
  const estudiantes = await Usuario.find({ rol: "estudiante", activo: true, "apoderado.dni": { $regex: /^\d{8}$/ } }).select("apoderado nombre");
  const nuevos = [];
  for (const e of estudiantes) {
    const r = await vincularApoderado(e._id, e.apoderado);
    if (r?.password) nuevos.push({ codigo: r.apoderado.codigo, dni: r.apoderado.dni, nombre: r.apoderado.nombre, passwordTemporal: r.password, hijo: e.nombre });
  }
  await auditar(req, "Generó cuentas de apoderados", "Usuario", "", `${nuevos.length} nuevas`);
  res.json({ mensaje: `${nuevos.length} cuentas nuevas de apoderado; ${estudiantes.length - nuevos.length} ya existían o se vincularon`, nuevos });
});

const actualizarHijos = h(async (req, res) => {
  const ap = esId(req.params.id) ? await Usuario.findOne({ _id: req.params.id, rol: "apoderado" }) : null;
  if (!ap) return res.status(404).json({ mensaje: "Apoderado no encontrado" });
  const validos = await Usuario.find({ _id: { $in: (req.body.hijos || []).filter(esId) }, rol: "estudiante" }).select("_id");
  ap.hijos = validos.map((v) => v._id);
  await ap.save();
  await auditar(req, "Actualizó hijos de apoderado", "Usuario", ap._id, `${ap.hijos.length} hijos`);
  res.json({ mensaje: "Vínculos actualizados" });
});

// =============== Carga masiva desde Excel ===============
const COLUMNAS = ["Apellidos", "Nombres", "DNI", "Sexo (M/F)", "Fecha nacimiento (AAAA-MM-DD)", "Nivel (primaria/secundaria)", "Grado", "Sección", "Apoderado (nombre completo)", "Parentesco", "DNI apoderado", "Celular apoderado", "Correo apoderado"];

const plantilla = h(async (req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Estudiantes");
  ws.addRow(COLUMNAS);
  ws.addRow(["Quispe Huamán", "Luis Ángel", "71234567", "M", "2013-05-20", "secundaria", 1, "A", "María Huamán Rojas", "Madre", "41234567", "987654321", "maria@gmail.com"]);
  ws.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12306B" } };
  ws.columns.forEach((c, i) => { c.width = [22, 20, 12, 10, 16, 16, 8, 9, 28, 12, 14, 14, 24][i]; });
  for (let r = 2; r <= 500; r++) {
    ws.getCell(`D${r}`).dataValidation = { type: "list", formulae: ['"M,F"'] };
    ws.getCell(`F${r}`).dataValidation = { type: "list", formulae: ['"primaria,secundaria"'] };
  }
  const ayuda = wb.addWorksheet("Instrucciones");
  ["Llena una fila por estudiante desde la fila 2 (borra el ejemplo).", "DNI de 8 dígitos. Si el estudiante ya existe (mismo DNI) se omite.",
    "Si el aula (nivel + grado + sección) no existe, se crea automáticamente.", "Con el DNI del apoderado se crea su cuenta para el portal de familias (o se vincula si ya existe).",
    "Al importar se generan códigos y contraseñas temporales: imprime las fichas de acceso."].forEach((t) => ayuda.addRow([t]));
  ayuda.getColumn(1).width = 110;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="plantilla-estudiantes-aduni.xlsx"');
  await wb.xlsx.write(res);
  res.end();
});

const valor = (c) => {
  const v = c?.value;
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === "object") return String(v.text ?? v.result ?? v.richText?.map((x) => x.text).join("") ?? "").trim();
  return String(v).trim();
};

const importarEstudiantes = h(async (req, res) => {
  if (!req.file) return res.status(400).json({ mensaje: "Sube el archivo Excel" });
  const simular = req.query.simular === "1";
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(req.file.buffer);
  const ws = wb.worksheets[0];
  const config = await obtenerConfig();
  const creados = [];
  const apoderados = [];
  const errores = [];
  const dnisVistos = new Set();
  const filas = [];
  ws.eachRow((row, n) => { if (n > 1) filas.push([n, row]); });
  if (filas.length > 1000) return res.status(400).json({ mensaje: "Máximo 1000 filas por archivo" });

  for (const [n, row] of filas) {
    const c = (i) => valor(row.getCell(i));
    const d = {
      apellidos: c(1), nombres: c(2), dni: c(3).replace(/\D/g, ""), sexo: c(4).toUpperCase(), fechaNacimiento: c(5),
      nivel: c(6).toLowerCase(), grado: Number(c(7)), seccion: c(8).toUpperCase() || "A",
      apoderado: { nombre: c(9), parentesco: c(10), dni: c(11).replace(/\D/g, ""), celular: c(12).replace(/\D/g, ""), email: c(13) },
    };
    if (!d.apellidos && !d.nombres) continue;
    const problema = !d.apellidos || !d.nombres ? "Faltan apellidos o nombres"
      : !/^\d{8}$/.test(d.dni) ? "DNI inválido"
        : dnisVistos.has(d.dni) ? "DNI repetido en el archivo"
          : !GRADOS[d.nivel] || !(d.grado >= 1 && d.grado <= GRADOS[d.nivel]) ? "Nivel o grado inválido" : null;
    if (problema) { errores.push({ fila: n, mensaje: problema }); continue; }
    dnisVistos.add(d.dni);
    if (await Usuario.exists({ rol: "estudiante", dni: d.dni })) { errores.push({ fila: n, mensaje: `Ya existe un estudiante con DNI ${d.dni} (omitido)` }); continue; }
    if (simular) { creados.push({ nombre: `${d.apellidos}, ${d.nombres}`, aula: `${d.grado}.° ${d.seccion} ${d.nivel}` }); continue; }

    let aula = await Aula.findOne({ nivel: d.nivel, grado: d.grado, seccion: d.seccion, anio: config.anio });
    if (!aula) aula = await Aula.create({ nivel: d.nivel, grado: d.grado, seccion: d.seccion, anio: config.anio });
    const password = claveTemporal();
    const e = await Usuario.create({
      rol: "estudiante", nombres: d.nombres, apellidos: d.apellidos, dni: d.dni, sexo: ["M", "F"].includes(d.sexo) ? d.sexo : "",
      fechaNacimiento: esFechaValida(d.fechaNacimiento) ? d.fechaNacimiento : "", aula: aula._id, apoderado: d.apoderado,
      password, codigo: await generarCodigo("estudiante", config.anio),
    });
    const cuenta = tieneCuentaEnAula(aula, config);
    creados.push({ codigo: e.codigo, nombre: e.nombre, aula: aula.nombre, passwordTemporal: cuenta ? password : null, sinCuenta: !cuenta });
    const r = await vincularApoderado(e._id, d.apoderado);
    if (r?.password) apoderados.push({ codigo: r.apoderado.codigo, dni: r.apoderado.dni, nombre: r.apoderado.nombre, passwordTemporal: r.password, hijo: e.nombre });
  }
  if (!simular) await auditar(req, "Importó estudiantes desde Excel", "Usuario", "", `${creados.length} creados, ${errores.length} con observaciones`);
  res.json({ simulacion: simular, creados, apoderados, errores });
});

// =============== Pagos reportados (vouchers) ===============
const listarVouchers = h(async (req, res) => {
  const filtro = req.query.estado ? { estado: req.query.estado } : {};
  res.json(await PagoReportado.find(filtro).sort({ createdAt: -1 }).limit(200)
    .populate({ path: "estudiante", select: "nombre codigo aula", populate: { path: "aula" } })
    .populate("reportadoPor", "nombre rol").populate("pensiones", "concepto monto descuento estado"));
});

const resolverVoucher = h(async (req, res) => {
  const v = esId(req.params.id) ? await PagoReportado.findById(req.params.id) : null;
  if (!v || v.estado !== "pendiente") return res.status(404).json({ mensaje: "Pago reportado no encontrado o ya revisado" });
  const { estado, observacion } = req.body;
  if (!["aprobado", "rechazado"].includes(estado)) return res.status(400).json({ mensaje: "Estado inválido" });
  v.estado = estado;
  v.observacion = texto(observacion, 300);
  v.revisadoPor = req.usuarioId;
  await v.save();
  if (estado === "aprobado") {
    const cuotas = await Pension.find({ _id: { $in: v.pensiones }, estado: "pendiente" });
    for (const p of cuotas) Object.assign(p, { estado: "pagado", fechaPago: v.fechaPago, metodo: v.metodo, operacion: v.operacion, registradoPor: req.usuarioId });
    await Promise.all(cuotas.map((p) => p.save()));
    if (cuotas.length) await emitirRecibo({ estudiante: v.estudiante, pensiones: cuotas, metodo: v.metodo, operacion: v.operacion, fecha: v.fechaPago, cajero: req.usuarioId });
  }
  notificar(await familiaDe(v.estudiante), {
    titulo: estado === "aprobado" ? "Tu pago fue validado" : "Tu pago no pudo validarse",
    mensaje: `S/ ${v.monto.toFixed(2)}${v.observacion ? ` · ${v.observacion}` : ""}`, tipo: "pago", enlace: "/intranet/familia/pagos", whatsapp: true,
  });
  await auditar(req, `Pago reportado ${estado}`, "PagoReportado", v._id, `S/ ${v.monto} ${v.metodo} ${v.operacion}`);
  res.json(v);
});

// =============== Caja y recibos ===============
const caja = h(async (req, res) => {
  const fecha = esFechaValida(req.query.fecha) ? req.query.fecha : hoy();
  const recibos = await Recibo.find({ fecha }).sort({ numero: 1 }).populate({ path: "estudiante", select: "nombre codigo aula", populate: { path: "aula" } }).populate("cajero", "nombre");
  const validos = recibos.filter((r) => !r.anulado);
  const porMetodo = {};
  validos.forEach((r) => { porMetodo[r.metodo] = (porMetodo[r.metodo] || 0) + r.total; });
  // Comprobante electrónico SUNAT de cada recibo (si se emitió)
  const comps = await require("../../models/Comprobante").find({ recibo: { $in: recibos.map((r) => r._id) }, tipo: { $in: ["boleta", "factura"] } })
    .select("recibo tipo serie correlativo estado anulado observaciones").sort({ createdAt: -1 });
  const lista = recibos.map((r) => ({ ...r.toObject(), comprobante: comps.find((c) => String(c.recibo) === String(r._id)) || null }));
  const sunat = await require("../../lib/sunat/emitir").obtenerConfig();
  res.json({ fecha, recibos: lista, total: validos.reduce((s, r) => s + r.total, 0), porMetodo, anulados: recibos.length - validos.length, sunatActivo: !!sunat.activo });
});

const reciboPdfAdmin = h(async (req, res) => {
  const r = esId(req.params.id) ? await Recibo.findById(req.params.id) : null;
  if (!r) return res.status(404).json({ mensaje: "Recibo no encontrado" });
  reciboPDF(r, await Usuario.findById(r.estudiante).populate("aula"), res);
});

const anularRecibo = h(async (req, res) => {
  const r = esId(req.params.id) ? await Recibo.findById(req.params.id) : null;
  if (!r || r.anulado) return res.status(404).json({ mensaje: "Recibo no encontrado o ya anulado" });
  r.anulado = true;
  r.motivoAnulacion = texto(req.body.motivo, 200) || "Anulado";
  await r.save();
  await Pension.updateMany({ _id: { $in: r.pensiones } }, { estado: "pendiente", fechaPago: "", metodo: "", operacion: "" });
  await auditar(req, "Anuló recibo", "Recibo", r._id, `${r.serie}-${r.numero} · ${r.motivoAnulacion}`);
  res.json(r);
});

// =============== Documentos PDF ===============
const libretasAula = h(async (req, res) => {
  const aula = esId(req.params.id) ? await Aula.findById(req.params.id) : null;
  if (!aula) return res.status(404).json({ mensaje: "Aula no encontrada" });
  const est = await Usuario.find({ rol: "estudiante", aula: aula._id, activo: true }).sort({ nombre: 1 }).select("_id");
  libretasPDF(await Promise.all(est.map((e) => libretaDe(e._id))), res, `libretas-${aula.grado}${aula.seccion}-${aula.nivel}.pdf`);
});

const libretaEstudiante = h(async (req, res) => {
  const lib = esId(req.params.id) ? await libretaDe(req.params.id) : null;
  if (!lib) return res.status(404).json({ mensaje: "Estudiante no encontrado" });
  libretasPDF([lib], res, `libreta-${lib.estudiante.codigo}.pdf`);
});

const carnes = h(async (req, res) => {
  const PERSONAL = { profesor: ["profesor"], administrativo: ["administrativo"], todos: ["profesor", "administrativo"] };
  const filtro = { rol: "estudiante", activo: true };
  if (PERSONAL[req.query.personal]) filtro.rol = { $in: PERSONAL[req.query.personal] };
  if (esId(req.query.aula)) filtro.aula = req.query.aula;
  if (esId(req.query.estudiante)) filtro._id = req.query.estudiante;
  if (esId(req.query.usuario)) {
    filtro._id = req.query.usuario;
    filtro.rol = { $in: ["estudiante", "profesor", "administrativo"] };
  }
  const config = await obtenerConfig();
  const est = await Usuario.find(filtro).sort({ rol: 1, nombre: 1 }).select("rol nombres apellidos codigo dni foto aula especialidad cargo").populate("aula").limit(400);
  if (!est.length) return res.status(404).json({ mensaje: "No hay carnés para imprimir con ese filtro" });
  await carnetsPDF(est, config.anio, res);
});

// Notas por aula en Excel (una hoja por curso), para cargar en SIAGIE u otros reportes.
const notasExcel = h(async (req, res) => {
  const aula = esId(req.params.id) ? await Aula.findById(req.params.id) : null;
  if (!aula) return res.status(404).json({ mensaje: "Aula no encontrada" });
  const periodo = Number(req.query.periodo) || 1;
  const [cursos, est] = await Promise.all([
    Curso.find({ aula: aula._id }).sort({ nombre: 1 }),
    Usuario.find({ rol: "estudiante", aula: aula._id, activo: true }).sort({ nombre: 1 }).select("nombre codigo dni"),
  ]);
  const califs = await Calificacion.find({ curso: { $in: cursos.map((c) => c._id) }, periodo });
  const wb = new ExcelJS.Workbook();
  for (const c of cursos) {
    const ws = wb.addWorksheet(c.nombre.slice(0, 31).replace(/[\\/?*[\]:]/g, ""));
    ws.addRow([`${aula.nombre} · ${c.nombre} · Periodo ${periodo}`]);
    ws.addRow(["N.°", "DNI", "Código", "Apellidos y nombres", ...c.competencias.map((_, i) => `C${i + 1}`), "Logro del área", "Conclusión descriptiva"]);
    est.forEach((e, n) => {
      const propias = califs.filter((x) => String(x.curso) === String(c._id) && String(x.estudiante) === String(e._id));
      const niveles = c.competencias.map((_, i) => propias.find((x) => x.competencia === i)?.nivel || "");
      ws.addRow([n + 1, e.dni, e.codigo, e.nombre, ...niveles, resumirNiveles(niveles) || "", propias.find((x) => x.conclusion)?.conclusion || ""]);
    });
    ws.addRow([]);
    c.competencias.forEach((comp, i) => ws.addRow([`C${i + 1}`, comp]));
    ws.getRow(2).font = { bold: true };
    ws.getColumn(4).width = 36;
    ws.getColumn(c.competencias.length + 6).width = 50;
  }
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="notas-${aula.grado}${aula.seccion}-${aula.nivel}-P${periodo}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
});

// =============== Reportes y alertas ===============
const reportes = h(async (req, res) => {
  const config = await obtenerConfig();
  const anio = config.anio;
  const f = hoy();
  const periodo = Number(req.query.periodo) || periodoDeFecha(config, f);

  const asisMes = await Asistencia.aggregate([
    { $match: { fecha: { $gte: `${anio}-01-01`, $lte: `${anio}-12-31` } } },
    { $group: { _id: { $substr: ["$fecha", 5, 2] }, total: { $sum: 1 }, presentes: { $sum: { $cond: [{ $in: ["$estado", ["P", "T", "J"]] }, 1, 0] } }, tardanzas: { $sum: { $cond: [{ $eq: ["$estado", "T"] }, 1, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const pensMes = await Pension.aggregate([
    { $match: { anio } },
    { $group: { _id: "$mes", esperado: { $sum: { $subtract: ["$monto", "$descuento"] } }, cobrado: { $sum: { $cond: [{ $eq: ["$estado", "pagado"] }, { $subtract: ["$monto", "$descuento"] }, 0] } } } },
    { $sort: { _id: 1 } },
  ]);
  const aulas = await Aula.find({ anio }).sort({ nivel: 1, grado: 1, seccion: 1 });
  const rendimiento = await Promise.all(aulas.map(async (a) => {
    const cursos = await Curso.find({ aula: a._id }).select("_id");
    const r = await Calificacion.aggregate([{ $match: { curso: { $in: cursos.map((c) => c._id) }, periodo } }, { $group: { _id: "$nivel", n: { $sum: 1 } } }]);
    const d = { AD: 0, A: 0, B: 0, C: 0 };
    r.forEach((x) => { d[x._id] = x.n; });
    return { aula: a.nombre, ...d };
  }));
  const conducta = await Incidencia.aggregate([{ $match: { fecha: { $gte: `${anio}-01-01` } } }, { $group: { _id: "$tipo", n: { $sum: 1 } } }]);
  res.json({
    periodo,
    asistenciaMensual: asisMes.map((m) => ({ mes: MESES[Number(m._id)], porcentaje: Math.round((m.presentes / m.total) * 1000) / 10, tardanzas: m.tardanzas })),
    pensionesMensual: pensMes.map((m) => ({ mes: MESES[m._id], esperado: m.esperado, cobrado: m.cobrado })),
    rendimiento,
    conducta: Object.fromEntries(conducta.map((c) => [c._id, c.n])),
  });
});

const alertas = h(async (req, res) => {
  const filtro = esId(req.query.aula) ? { aula: req.query.aula } : {};
  res.json(await alertasTempranas(filtro));
});

const auditoria = h(async (req, res) => {
  const filtro = {};
  if (req.query.q) {
    const q = texto(req.query.q, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtro.$or = [{ nombre: new RegExp(q, "i") }, { accion: new RegExp(q, "i") }, { detalle: new RegExp(q, "i") }];
  }
  if (["crear", "modificar", "eliminar", "acceso", "seguridad", "pago", "otro"].includes(req.query.tipo)) filtro.tipo = req.query.tipo;
  if (["estudiante", "profesor", "administrativo", "apoderado", "soporte"].includes(req.query.rol)) filtro.rol = req.query.rol;
  if (esId(req.query.usuario)) filtro.usuario = req.query.usuario;
  const rango = {};
  if (esFechaValida(req.query.desde)) rango.$gte = new Date(`${req.query.desde}T00:00:00-05:00`);
  if (esFechaValida(req.query.hasta)) rango.$lte = new Date(`${req.query.hasta}T23:59:59-05:00`);
  if (Object.keys(rango).length) filtro.createdAt = rango;
  res.json(await Auditoria.find(filtro).sort({ createdAt: -1 }).limit(Math.min(Number(req.query.limite) || 300, 1000)));
});

// Seguridad de cuentas: último acceso, cambio de contraseña, 2FA e intentos fallidos (sin ver contraseñas).
const seguridad = h(async (req, res) => {
  const filtro = {};
  if (["estudiante", "profesor", "administrativo", "apoderado", "soporte"].includes(req.query.rol)) filtro.rol = req.query.rol;
  if (req.query.estado === "bloqueadas") filtro.bloqueadoHasta = { $gt: new Date() };
  if (req.query.estado === "suspendidas") filtro.activo = false;
  if (req.query.estado === "sin2fa") { filtro.totpActivo = { $ne: true }; filtro.rol = filtro.rol || { $in: ["administrativo", "soporte"] }; }
  if (req.query.q) {
    const q = texto(req.query.q, 50).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filtro.$or = [{ nombre: new RegExp(q, "i") }, { codigo: new RegExp(q, "i") }, { dni: new RegExp(q) }];
  }
  const usuarios = await Usuario.find(filtro).select("nombre codigo rol areas activo ultimoAcceso passwordCambiadaEn debeCambiarPassword totpActivo intentosFallidos bloqueadoHasta sesionesCerradasEn").sort({ ultimoAcceso: -1 }).limit(500);
  const hace7 = new Date(Date.now() - 7 * 864e5);
  const fallidos = await Auditoria.aggregate([
    { $match: { tipo: { $in: ["acceso", "seguridad"] }, accion: /fallido|incorrecto/i, createdAt: { $gte: hace7 }, usuario: { $ne: null } } },
    { $group: { _id: "$usuario", n: { $sum: 1 }, ultimo: { $max: "$createdAt" } } },
  ]);
  const mapa = new Map(fallidos.map((f) => [String(f._id), f]));
  res.json(usuarios.map((u) => ({ ...u.toObject(), fallidos7d: mapa.get(String(u._id))?.n || 0, ultimoFallido: mapa.get(String(u._id))?.ultimo || null })));
});

const incidencias = h(async (req, res) => {
  const filtro = esId(req.query.aula) ? { aula: req.query.aula } : {};
  res.json(await Incidencia.find(filtro).sort({ fecha: -1, createdAt: -1 }).limit(300).populate({ path: "estudiante", select: "nombre codigo aula", populate: { path: "aula" } }).populate("registradoPor", "nombre"));
});

const asistenciaPersonal = h(async (req, res) => {
  const fecha = esFechaValida(req.query.fecha) ? req.query.fecha : hoy();
  const [personal, regs] = await Promise.all([
    Usuario.find({ rol: { $in: ["profesor", "administrativo"] }, activo: true }).select("nombre codigo rol especialidad cargo").sort({ rol: 1, nombre: 1 }),
    AsistenciaPersonal.find({ fecha }),
  ]);
  res.json({ fecha, personal: personal.map((p) => ({ ...p.toObject(), registro: regs.find((r) => String(r.usuario) === String(p._id)) || null })) });
});

// =============== Respaldo ===============
const respaldo = h(async (req, res) => {
  const { EJSON } = mongoose.mongo.BSON;
  const zip = new JSZip();
  const colecciones = await mongoose.connection.db.listCollections().toArray();
  for (const c of colecciones) {
    const docs = await mongoose.connection.db.collection(c.name).find({}).toArray();
    zip.file(`${c.name}.json`, EJSON.stringify(docs, { relaxed: false }));
  }
  zip.file("LEEME.txt", `Respaldo de la intranet ADUNI+ generado el ${new Date().toISOString()}.\nRestaurar con: node scripts/restaurar.js <archivo.zip>\nContiene datos personales: guárdalo en un lugar seguro.`);
  await auditar(req, "Descargó respaldo de la base de datos", "Sistema");
  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  res.setHeader("Content-Type", "application/zip");
  res.setHeader("Content-Disposition", `attachment; filename="respaldo-aduni-${hoy()}.zip"`);
  res.send(buffer);
});

// =============== Noticias ===============
const slugify = (t) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 70);

const listarNoticias = h(async (req, res) => res.json(await Noticia.find().sort({ fecha: -1, createdAt: -1 })));

const guardarNoticia = h(async (req, res) => {
  const { titulo, resumen, contenido, imagen, fecha, publicada } = req.body;
  if (!texto(titulo, 160)) return res.status(400).json({ mensaje: "El título es obligatorio" });
  const datos = {
    titulo: texto(titulo, 160), resumen: texto(resumen, 400), contenido: texto(contenido, 20000),
    imagen: /^https:\/\/res\.cloudinary\.com\//.test(imagen || "") ? imagen : "",
    fecha: esFechaValida(fecha) ? fecha : hoy(), publicada: publicada !== false,
  };
  let n;
  if (esId(req.params.id)) {
    n = await Noticia.findByIdAndUpdate(req.params.id, datos, { returnDocument: "after" });
    if (!n) return res.status(404).json({ mensaje: "Noticia no encontrada" });
  } else {
    n = await Noticia.create({ ...datos, slug: `${slugify(datos.titulo)}-${Date.now().toString(36)}`, autor: req.usuarioId });
  }
  await auditar(req, "Guardó noticia", "Noticia", n._id, n.titulo);
  res.json(n);
});

const eliminarNoticia = h(async (req, res) => {
  await Noticia.findByIdAndDelete(req.params.id);
  res.json({ mensaje: "Noticia eliminada" });
});

// =============== Admisión ===============
const listarPostulaciones = h(async (req, res) => {
  const filtro = req.query.estado ? { estado: req.query.estado } : {};
  res.json(await Postulacion.find(filtro).sort({ createdAt: -1 }).limit(300));
});

const ESTADO_TXT = { recibida: "recibida", en_evaluacion: "en evaluación", admitida: "ADMITIDA", no_admitida: "no admitida", matriculada: "matriculada" };

const actualizarPostulacion = h(async (req, res) => {
  const p = esId(req.params.id) ? await Postulacion.findById(req.params.id) : null;
  if (!p) return res.status(404).json({ mensaje: "Postulación no encontrada" });
  const { estado, cita, notasInternas } = req.body;
  const cambioEstado = estado && estado !== p.estado && ESTADO_TXT[estado];
  if (cambioEstado) p.estado = estado;
  if (cita !== undefined) p.cita = texto(cita, 40);
  if (notasInternas !== undefined) p.notasInternas = texto(notasInternas, 2000);
  await p.save();
  if (cambioEstado || cita) {
    const msg = `Colegio ADUNI+: la postulación de ${p.postulante.nombres} (código ${p.codigoSeguimiento}) está ${ESTADO_TXT[p.estado]}.${p.cita ? ` Cita: ${p.cita}.` : ""}`;
    enviarWhatsApp(p.apoderado.celular, msg);
    enviarCorreo(p.apoderado.email, "Estado de tu postulación - Colegio ADUNI+", `<p>${msg}</p>`);
  }
  await auditar(req, "Actualizó postulación", "Postulacion", p._id, `${p.codigoSeguimiento} → ${p.estado}`);
  res.json(p);
});

const matricularPostulante = h(async (req, res) => {
  const p = esId(req.params.id) ? await Postulacion.findById(req.params.id) : null;
  if (!p || p.estado === "matriculada") return res.status(404).json({ mensaje: "Postulación no encontrada o ya matriculada" });
  const aula = esId(req.body.aula) ? await Aula.findById(req.body.aula) : null;
  if (!aula) return res.status(400).json({ mensaje: "Elige el aula" });
  if (await Usuario.exists({ rol: "estudiante", dni: p.postulante.dni })) return res.status(409).json({ mensaje: "Ya existe un estudiante con ese DNI" });
  const config = await obtenerConfig();
  const password = claveTemporal();
  const e = await Usuario.create({
    rol: "estudiante", nombres: p.postulante.nombres, apellidos: p.postulante.apellidos, dni: p.postulante.dni,
    sexo: p.postulante.sexo, fechaNacimiento: p.postulante.fechaNacimiento, aula: aula._id, password,
    codigo: await generarCodigo("estudiante", config.anio),
    apoderado: { nombre: p.apoderado.nombre, parentesco: p.apoderado.parentesco, dni: p.apoderado.dni, celular: p.apoderado.celular, email: p.apoderado.email },
  });
  const ap = await vincularApoderado(e._id, p.apoderado);
  p.estado = "matriculada";
  p.estudianteCreado = e._id;
  await p.save();
  await auditar(req, "Matriculó postulante", "Usuario", e._id, `${e.nombre} en ${aula.nombre}`);
  const cuenta = tieneCuentaEnAula(aula, config);
  res.json({
    estudiante: { codigo: e.codigo, nombre: e.nombre, passwordTemporal: cuenta ? password : null, sinCuenta: !cuenta },
    apoderado: ap?.password ? { codigo: ap.apoderado.codigo, dni: ap.apoderado.dni, passwordTemporal: ap.password } : ap ? { codigo: ap.apoderado.codigo, yaExistia: true } : null,
  });
});

module.exports = {
  seguridad,
  vincularApoderado, generarApoderados, actualizarHijos, plantilla, importarEstudiantes,
  listarVouchers, resolverVoucher, caja, reciboPdfAdmin, anularRecibo,
  libretasAula, libretaEstudiante, carnes, notasExcel, reportes, alertas, auditoria, incidencias, asistenciaPersonal,
  respaldo, listarNoticias, guardarNoticia, eliminarNoticia, listarPostulaciones, actualizarPostulacion, matricularPostulante,
};
