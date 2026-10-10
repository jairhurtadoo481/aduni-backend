const Usuario = require("../models/Usuario");
const Curso = require("../models/Curso");
const Calificacion = require("../models/Calificacion");
const Asistencia = require("../models/Asistencia");
const Pension = require("../models/Pension");
const Configuracion = require("../models/Configuracion");
const { resumirNiveles } = require("./curriculo");
const { hoy } = require("./fechas");

const resumenAsis = (regs) => {
  const c = { P: 0, T: 0, F: 0, J: 0 };
  regs.forEach((r) => { c[r.estado]++; });
  const total = c.P + c.T + c.F + c.J;
  return { ...c, total, porcentaje: total ? Math.round(((c.P + c.T + c.J) / total) * 1000) / 10 : null };
};

// Datos completos de la libreta de un estudiante.
const libretaDe = async (estudianteId) => {
  const config = await Configuracion.obtenerConfig();
  const e = await Usuario.findById(estudianteId).select("nombre nombres apellidos codigo dni aula").populate({ path: "aula", populate: { path: "tutor", select: "nombre" } });
  if (!e) return null;
  const cursos = e.aula ? await Curso.find({ aula: e.aula._id }).sort({ nombre: 1 }).populate("docente", "nombre") : [];
  const [califs, asis] = await Promise.all([
    Calificacion.find({ estudiante: e._id, curso: { $in: cursos.map((c) => c._id) } }),
    Asistencia.find({ estudiante: e._id, fecha: { $gte: `${config.anio}-01-01` } }),
  ]);
  const filas = cursos.map((c) => {
    const propias = califs.filter((x) => String(x.curso) === String(c._id));
    const competencias = c.competencias.map((nombre, i) => ({
      nombre, niveles: [1, 2, 3, 4].map((p) => propias.find((x) => x.competencia === i && x.periodo === p)?.nivel || null),
    }));
    const resumenPeriodos = [1, 2, 3, 4].map((p) => resumirNiveles(competencias.map((x) => x.niveles[p - 1])));
    return {
      id: c._id, nombre: c.nombre, color: c.color, docente: c.docente?.nombre || "Por asignar",
      competencias, resumenPeriodos, final: resumirNiveles(resumenPeriodos),
      conclusiones: [1, 2, 3, 4].map((p) => propias.filter((x) => x.periodo === p && x.conclusion).map((x) => x.conclusion).join(" ")),
    };
  });
  const asistenciaPorPeriodo = config.periodos.map((p) => resumenAsis(asis.filter((a) => a.fecha >= p.inicio && a.fecha <= p.fin)));
  return { estudiante: e, anio: config.anio, periodos: config.periodos, cursos: filas, asistencia: resumenAsis(asis), asistenciaPorPeriodo };
};

// Alertas tempranas: estudiantes en riesgo por asistencia, notas o deuda.
const alertasTempranas = async (filtroEstudiantes = {}) => {
  const config = await Configuracion.obtenerConfig();
  const f = hoy();
  const hace30 = new Date(Date.parse(`${f}T12:00:00Z`) - 30 * 864e5).toISOString().slice(0, 10);
  const periodo = Configuracion.periodoDeFecha(config, f);
  const estudiantes = await Usuario.find({ rol: "estudiante", activo: true, aula: { $ne: null }, ...filtroEstudiantes }).select("nombre codigo aula apoderado").populate("aula");
  const ids = estudiantes.map((e) => e._id);
  const [asis, califs, pens] = await Promise.all([
    Asistencia.find({ estudiante: { $in: ids }, fecha: { $gte: hace30 } }).select("estudiante estado"),
    Calificacion.find({ estudiante: { $in: ids }, periodo: { $in: [periodo, periodo - 1] }, nivel: "C" }).select("estudiante curso periodo").populate("curso", "nombre"),
    Pension.find({ estudiante: { $in: ids }, anio: config.anio, estado: "pendiente", vencimiento: { $lt: f } }).select("estudiante monto descuento"),
  ]);
  const lista = estudiantes.map((e) => {
    const id = String(e._id);
    const a = resumenAsis(asis.filter((x) => String(x.estudiante) === id));
    const enC = califs.filter((x) => String(x.estudiante) === id);
    const cursosC = [...new Set(enC.map((x) => x.curso?.nombre).filter(Boolean))];
    const deuda = pens.filter((x) => String(x.estudiante) === id);
    const motivos = [];
    let puntos = 0;
    if (a.F >= 3) { motivos.push(`${a.F} faltas en 30 días`); puntos += a.F >= 5 ? 3 : 2; }
    if (a.T >= 5) { motivos.push(`${a.T} tardanzas en 30 días`); puntos += 1; }
    if (cursosC.length) { motivos.push(`En inicio (C) en ${cursosC.join(", ")}`); puntos += Math.min(cursosC.length, 3) * 2; }
    if (deuda.length >= 2) { motivos.push(`${deuda.length} pensiones vencidas`); puntos += 1; }
    return {
      id, nombre: e.nombre, codigo: e.codigo, aula: e.aula?.nombre, apoderado: e.apoderado,
      asistencia30: a, cursosEnInicio: cursosC, cuotasVencidas: deuda.length, motivos,
      riesgo: puntos >= 5 ? "alto" : puntos >= 2 ? "medio" : "bajo", puntos,
    };
  });
  return lista.filter((x) => x.puntos > 0).sort((a, b) => b.puntos - a.puntos);
};

module.exports = { libretaDe, alertasTempranas, resumenAsis };
