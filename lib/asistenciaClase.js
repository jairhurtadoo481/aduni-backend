// Reglas de la asistencia por clase: ventana de tiempo y cálculo de la asistencia diaria.
const Horario = require("../models/Horario");
const Usuario = require("../models/Usuario");
const Asistencia = require("../models/Asistencia");
const AsistenciaClase = require("../models/AsistenciaClase");
const { hoy, horaActual } = require("./fechas");

const aMin = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));
const aHora = (m) => `${String(Math.floor(((m % 1440) + 1440) % 1440 / 60)).padStart(2, "0")}:${String(((m % 60) + 60) % 60).padStart(2, "0")}`;
const diaSemana = (fecha) => new Date(`${fecha}T12:00:00Z`).getUTCDay();

// ¿Puede el docente pasar lista en este bloque y fecha ahora mismo?
const ventanaDe = (bloque, fecha, config) => {
  const abre = aHora(aMin(bloque.horaInicio) - (config.margenAsistenciaAntes ?? 10));
  const cierra = aHora(aMin(bloque.horaFin) + (config.margenAsistenciaDespues ?? 30));
  const f = hoy();
  let estado;
  if (fecha < f) estado = "cerrada";
  else if (fecha > f) estado = "antes";
  else {
    const ahora = horaActual();
    estado = ahora < abre ? "antes" : ahora > cierra ? "cerrada" : "abierta";
  }
  return { abre, cierra, estado };
};

// Recalcula la asistencia diaria (la que ven familias, libreta y reportes) a partir de las listas de clase.
// Regla: vale el estado del primer bloque registrado; si faltó a la primera hora pero llegó después, es tardanza.
// Las faltas ya justificadas (J) no se tocan.
const recalcularDia = async (aulaId, fecha, estudianteIds) => {
  const bloques = await Horario.find({ aula: aulaId, dia: diaSemana(fecha) }).sort({ horaInicio: 1 }).select("_id");
  const tomas = await AsistenciaClase.find({ horario: { $in: bloques.map((b) => b._id) }, fecha });
  const porBloque = new Map(tomas.map((t) => [String(t.horario), new Map(t.registros.map((r) => [String(r.estudiante), r.estado]))]));
  const ids = estudianteIds?.length
    ? estudianteIds.map(String)
    : (await Usuario.find({ rol: "estudiante", aula: aulaId, activo: true }).select("_id")).map((e) => String(e._id));
  const previos = new Map((await Asistencia.find({ estudiante: { $in: ids }, fecha })).map((a) => [String(a.estudiante), a]));
  const ops = [];
  for (const id of ids) {
    const prev = previos.get(id);
    if (prev?.estado === "J" && prev.metodo !== "clase") continue;
    const seq = bloques.map((b) => porBloque.get(String(b._id))?.get(id)).filter(Boolean);
    if (!seq.length) {
      if (prev?.metodo === "clase") ops.push({ deleteOne: { filter: { _id: prev._id } } });
      continue;
    }
    const primero = seq[0];
    const estado = primero === "F" ? (seq.slice(1).some((s) => s === "P" || s === "T") ? "T" : "F") : primero;
    ops.push({
      updateOne: {
        filter: { estudiante: id, fecha },
        update: { $set: { aula: aulaId, estado, metodo: "clase" } },
        upsert: true,
      },
    });
  }
  if (ops.length) await Asistencia.bulkWrite(ops);
};

module.exports = { ventanaDe, recalcularDia, diaSemana, aMin };
