const mongoose = require("mongoose");

const notificacionSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  titulo: { type: String, required: true },
  mensaje: { type: String, default: "" },
  tipo: { type: String, enum: ["asistencia", "nota", "tarea", "pago", "comunicado", "mensaje", "conducta", "sistema", "examen"], default: "sistema" },
  enlace: { type: String, default: "" },
  leida: { type: Boolean, default: false },
  // Evita duplicados (ej. "vence-<pensionId>-<usuarioId>")
  clave: { type: String, unique: true, sparse: true },
}, { timestamps: true });

notificacionSchema.index({ usuario: 1, createdAt: -1 });

module.exports = mongoose.model("Notificacion", notificacionSchema);
