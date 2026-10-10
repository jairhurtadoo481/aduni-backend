const mongoose = require("mongoose");

// Mesa de ayuda: problema o consulta reportada por cualquier usuario y atendida por soporte técnico.
const ticketSchema = new mongoose.Schema({
  codigo: { type: String, required: true, unique: true }, // TCK-00001
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  rol: { type: String, default: "" },
  asunto: { type: String, required: true, trim: true, maxlength: 150 },
  categoria: { type: String, enum: ["acceso", "notas", "asistencia", "pagos", "tareas", "error", "sugerencia", "otro"], default: "otro" },
  prioridad: { type: String, enum: ["baja", "media", "alta", "urgente"], default: "media" },
  estado: { type: String, enum: ["abierto", "en_proceso", "resuelto", "cerrado"], default: "abierto" },
  pagina: { type: String, default: "" }, // dónde estaba el usuario al reportar
  mensajes: [{
    de: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
    esSoporte: { type: Boolean, default: false },
    texto: { type: String, required: true, maxlength: 3000 },
    adjunto: { url: String, nombre: String },
    fecha: { type: Date, default: Date.now },
  }],
  asignado: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  resueltoEn: { type: Date, default: null },
}, { timestamps: true });

ticketSchema.index({ estado: 1, updatedAt: -1 });
ticketSchema.index({ usuario: 1, updatedAt: -1 });

module.exports = mongoose.model("Ticket", ticketSchema);
