const mongoose = require("mongoose");

// Bitácora: quién cambió qué y cuándo (notas, pagos, asistencia, usuarios...).
const auditoriaSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  nombre: { type: String, default: "" },
  rol: { type: String, default: "" },
  accion: { type: String, required: true },
  tipo: { type: String, enum: ["crear", "modificar", "eliminar", "acceso", "seguridad", "pago", "otro"], default: "otro" },
  entidad: { type: String, default: "" },
  entidadId: { type: String, default: "" },
  detalle: { type: String, default: "" },
  ip: { type: String, default: "" },
}, { timestamps: true });

auditoriaSchema.index({ createdAt: -1 });
auditoriaSchema.index({ usuario: 1, createdAt: -1 });
auditoriaSchema.index({ tipo: 1, createdAt: -1 });

module.exports = mongoose.model("Auditoria", auditoriaSchema);
