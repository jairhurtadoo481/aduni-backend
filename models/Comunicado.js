const mongoose = require("mongoose");

const comunicadoSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 150 },
  contenido: { type: String, required: true, trim: true, maxlength: 3000 },
  // A quién va dirigido; si se indica aula, solo a esa aula (estudiantes) y sus docentes.
  destinatarios: { type: String, enum: ["todos", "estudiante", "profesor"], default: "todos" },
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", default: null },
  importante: { type: Boolean, default: false },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("Comunicado", comunicadoSchema);
