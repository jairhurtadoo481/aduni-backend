const mongoose = require("mongoose");

// Nivel de logro de una competencia en un periodo (bimestre), escala literal AD/A/B/C.
const calificacionSchema = new mongoose.Schema({
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  periodo: { type: Number, min: 1, max: 4, required: true },
  competencia: { type: Number, min: 0, required: true }, // índice en curso.competencias
  nivel: { type: String, enum: ["AD", "A", "B", "C"], required: true },
  conclusion: { type: String, default: "", maxlength: 600 },
  registradaPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

calificacionSchema.index({ curso: 1, estudiante: 1, periodo: 1, competencia: 1 }, { unique: true });

module.exports = mongoose.model("Calificacion", calificacionSchema);
