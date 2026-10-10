const mongoose = require("mongoose");

// Evaluación en línea con preguntas de opción múltiple y corrección automática.
const examenSchema = new mongoose.Schema({
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  titulo: { type: String, required: true, trim: true, maxlength: 150 },
  instrucciones: { type: String, default: "", maxlength: 2000 },
  inicio: { type: Date, required: true },
  fin: { type: Date, required: true },
  duracionMin: { type: Number, default: 30, min: 1, max: 300 },
  preguntas: [{
    enunciado: { type: String, required: true, maxlength: 2000 },
    opciones: [{ type: String, maxlength: 500 }],
    correcta: { type: Number, required: true },
    puntaje: { type: Number, default: 1, min: 0 },
  }],
  aleatorio: { type: Boolean, default: true }, // mezclar orden de preguntas
  mostrarResultados: { type: Boolean, default: true },
  publicado: { type: Boolean, default: false },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("Examen", examenSchema);
