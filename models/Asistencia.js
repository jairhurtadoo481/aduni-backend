const mongoose = require("mongoose");

// Asistencia diaria al colegio (ingreso). P = puntual, T = tardanza, F = falta, J = falta justificada.
const asistenciaSchema = new mongoose.Schema({
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", required: true },
  fecha: { type: String, required: true }, // YYYY-MM-DD (hora de Perú)
  estado: { type: String, enum: ["P", "T", "F", "J"], required: true },
  horaIngreso: { type: String, default: "" },
  metodo: { type: String, enum: ["qr", "codigo", "manual", "automatico", "clase"], default: "manual" },
  observacion: { type: String, default: "" },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

asistenciaSchema.index({ estudiante: 1, fecha: 1 }, { unique: true });
asistenciaSchema.index({ aula: 1, fecha: 1 });
asistenciaSchema.index({ fecha: 1, estado: 1 });

module.exports = mongoose.model("Asistencia", asistenciaSchema);
