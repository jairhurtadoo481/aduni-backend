const mongoose = require("mongoose");

// Recibo interno de caja (no es comprobante electrónico SUNAT).
const reciboSchema = new mongoose.Schema({
  serie: { type: String, default: "R001" },
  numero: { type: Number, required: true },
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  pensiones: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pension" }],
  conceptos: [{ concepto: String, monto: Number }],
  total: { type: Number, required: true },
  metodo: { type: String, default: "Efectivo" },
  operacion: { type: String, default: "" },
  fecha: { type: String, required: true }, // YYYY-MM-DD
  hora: { type: String, default: "" },
  cajero: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  anulado: { type: Boolean, default: false },
  motivoAnulacion: { type: String, default: "" },
}, { timestamps: true });

reciboSchema.index({ serie: 1, numero: 1 }, { unique: true });
reciboSchema.index({ fecha: 1 });

module.exports = mongoose.model("Recibo", reciboSchema);
