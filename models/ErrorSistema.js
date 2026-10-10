const mongoose = require("mongoose");

// Errores inesperados del servidor, para que soporte los revise (se conservan 60 días).
const errorSistemaSchema = new mongoose.Schema({
  ruta: { type: String, default: "" },
  metodo: { type: String, default: "" },
  mensaje: { type: String, default: "" },
  detalle: { type: String, default: "" },
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  rol: { type: String, default: "" },
}, { timestamps: true });

errorSistemaSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 24 * 3600 });

module.exports = mongoose.model("ErrorSistema", errorSistemaSchema);
