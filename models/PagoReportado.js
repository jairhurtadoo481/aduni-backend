const mongoose = require("mongoose");

// Pago informado por la familia (Yape, Plin, transferencia) con foto del voucher; secretaría lo valida.
const pagoReportadoSchema = new mongoose.Schema({
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  reportadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  pensiones: [{ type: mongoose.Schema.Types.ObjectId, ref: "Pension" }],
  monto: { type: Number, required: true, min: 0 },
  metodo: { type: String, required: true },
  operacion: { type: String, default: "" },
  fechaPago: { type: String, required: true },
  comprobanteUrl: { type: String, required: true },
  estado: { type: String, enum: ["pendiente", "aprobado", "rechazado"], default: "pendiente" },
  observacion: { type: String, default: "" },
  revisadoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("PagoReportado", pagoReportadoSchema);
