const mongoose = require("mongoose");

// Solicitud de justificación de una inasistencia o tardanza, enviada por el estudiante o su apoderado.
const justificacionSchema = new mongoose.Schema({
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  fecha: { type: String, required: true },
  motivo: { type: String, required: true, trim: true, maxlength: 1000 },
  evidenciaUrl: { type: String, default: "" },
  estado: { type: String, enum: ["pendiente", "aprobada", "rechazada"], default: "pendiente" },
  respuesta: { type: String, default: "" },
  revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("Justificacion", justificacionSchema);
