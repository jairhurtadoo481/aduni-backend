const mongoose = require("mongoose");

const entregaSchema = new mongoose.Schema({
  tarea: { type: mongoose.Schema.Types.ObjectId, ref: "Tarea", required: true },
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  respuesta: { type: String, default: "", maxlength: 5000 },
  enlace: { type: String, default: "" },
  archivos: [{ url: String, nombre: String }],
  nivel: { type: String, enum: ["AD", "A", "B", "C", ""], default: "" },
  comentario: { type: String, default: "" },
}, { timestamps: true });

entregaSchema.index({ tarea: 1, estudiante: 1 }, { unique: true });

module.exports = mongoose.model("Entrega", entregaSchema);
