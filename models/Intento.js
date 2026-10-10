const mongoose = require("mongoose");

const intentoSchema = new mongoose.Schema({
  examen: { type: mongoose.Schema.Types.ObjectId, ref: "Examen", required: true },
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  orden: [Number], // orden en que se mostraron las preguntas
  iniciadoEn: { type: Date, default: Date.now },
  limite: { type: Date, required: true },
  enviadoEn: { type: Date, default: null },
  respuestas: [{ type: Number, default: -1 }], // índice de opción por pregunta (orden original); -1 = sin responder
  puntaje: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
  nivel: { type: String, default: "" },
  fueraDeTiempo: { type: Boolean, default: false },
}, { timestamps: true });

intentoSchema.index({ examen: 1, estudiante: 1 }, { unique: true });

module.exports = mongoose.model("Intento", intentoSchema);
