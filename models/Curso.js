const mongoose = require("mongoose");

// Un área curricular dictada en un aula por un docente. Los estudiantes del curso son los del aula.
const cursoSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", required: true },
  docente: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  competencias: [{ type: String, trim: true }],
  horasSemanales: { type: Number, default: 0 },
  color: { type: String, default: "#1b4aa0" },
}, { timestamps: true });

cursoSchema.index({ aula: 1, nombre: 1 }, { unique: true });

module.exports = mongoose.model("Curso", cursoSchema);
