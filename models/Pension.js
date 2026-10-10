const mongoose = require("mongoose");

// Cuota del cronograma de pagos de un estudiante (matrícula o pensión mensual).
const pensionSchema = new mongoose.Schema({
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  anio: { type: Number, required: true },
  mes: { type: Number, min: 0, max: 12, required: true }, // 0 = matrícula
  concepto: { type: String, required: true },
  monto: { type: Number, required: true, min: 0 },
  descuento: { type: Number, default: 0, min: 0 }, // becas
  vencimiento: { type: String, required: true }, // YYYY-MM-DD
  estado: { type: String, enum: ["pendiente", "pagado"], default: "pendiente" },
  fechaPago: { type: String, default: "" },
  metodo: { type: String, default: "" }, // efectivo, Yape, transferencia...
  operacion: { type: String, default: "" },
  registradoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

pensionSchema.index({ estudiante: 1, anio: 1, mes: 1 }, { unique: true });
pensionSchema.index({ anio: 1, estado: 1, vencimiento: 1 });

module.exports = mongoose.model("Pension", pensionSchema);
