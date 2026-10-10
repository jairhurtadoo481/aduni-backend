const mongoose = require("mongoose");

// Lista de asistencia tomada por el docente en un bloque de su horario (una por bloque y fecha).
const asistenciaClaseSchema = new mongoose.Schema({
  horario: { type: mongoose.Schema.Types.ObjectId, ref: "Horario", required: true },
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", required: true },
  docente: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  fecha: { type: String, required: true }, // YYYY-MM-DD
  horaInicio: { type: String, required: true },
  registros: [{
    _id: false,
    estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
    estado: { type: String, enum: ["P", "T", "F", "J"], required: true },
    observacion: { type: String, default: "" },
  }],
  tomadaPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  tomadaEn: { type: Date },
  corregidaPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
}, { timestamps: true });

asistenciaClaseSchema.index({ horario: 1, fecha: 1 }, { unique: true });
asistenciaClaseSchema.index({ aula: 1, fecha: 1 });

module.exports = mongoose.model("AsistenciaClase", asistenciaClaseSchema);
