const mongoose = require("mongoose");

// Registro de conducta: méritos, deméritos e incidencias.
const incidenciaSchema = new mongoose.Schema({
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula" },
  tipo: { type: String, enum: ["merito", "demerito", "incidencia"], required: true },
  categoria: { type: String, default: "" }, // ej. Puntualidad, Uniforme, Participación
  descripcion: { type: String, required: true, maxlength: 1000 },
  fecha: { type: String, required: true },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

incidenciaSchema.index({ estudiante: 1, fecha: -1 });

module.exports = mongoose.model("Incidencia", incidenciaSchema);
