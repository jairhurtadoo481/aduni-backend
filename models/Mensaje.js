const mongoose = require("mongoose");

// Mensajería interna (familia/estudiante ↔ docentes ↔ administración).
const mensajeSchema = new mongoose.Schema({
  de: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  para: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  texto: { type: String, required: true, trim: true, maxlength: 2000 },
  adjunto: { url: String, nombre: String },
  leido: { type: Boolean, default: false },
}, { timestamps: true });

mensajeSchema.index({ de: 1, para: 1, createdAt: -1 });
mensajeSchema.index({ para: 1, leido: 1 });

module.exports = mongoose.model("Mensaje", mensajeSchema);
