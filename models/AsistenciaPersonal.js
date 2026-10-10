const mongoose = require("mongoose");

// Asistencia de docentes y personal (marcan con su carné QR igual que los estudiantes).
const asistenciaPersonalSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  fecha: { type: String, required: true },
  horaIngreso: { type: String, default: "" },
  horaSalida: { type: String, default: "" },
  estado: { type: String, enum: ["P", "T", "F", "J"], required: true },
  metodo: { type: String, default: "qr" },
  observacion: { type: String, default: "" },
}, { timestamps: true });

asistenciaPersonalSchema.index({ usuario: 1, fecha: 1 }, { unique: true });

module.exports = mongoose.model("AsistenciaPersonal", asistenciaPersonalSchema);
