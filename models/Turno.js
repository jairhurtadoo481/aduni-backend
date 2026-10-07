const mongoose = require("mongoose");

const turnoSchema = new mongoose.Schema({
  trabajador: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  trabajadorNombre: { type: String, required: true },
  fechaApertura: { type: Date, required: true },
  fechaCierre: { type: Date, default: null },
  abierto: { type: Boolean, default: true },
  totalVentas: { type: Number, default: 0 },
  cantidadVentas: { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model("Turno", turnoSchema);
