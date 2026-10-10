const mongoose = require("mongoose");

// Comprobante electrónico enviado a SUNAT (boleta, factura o nota de crédito).
const comprobanteSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["boleta", "factura", "nota_credito"], required: true },
  serie: { type: String, required: true },
  correlativo: { type: Number, required: true },
  fechaEmision: { type: String, required: true },
  cliente: {
    tipoDocumento: { type: String, enum: ["DNI", "RUC"], required: true },
    documento: { type: String, required: true },
    nombre: { type: String, required: true },
    direccion: { type: String, default: "" },
  },
  items: [{
    _id: false,
    descripcion: { type: String, required: true },
    cantidad: { type: Number, required: true },
    precioUnitario: { type: Number, required: true },
    afectacion: { type: String, enum: ["10", "20"], default: "20" }, // 10 gravado, 20 exonerado
  }],
  gravadas: { type: Number, default: 0 },
  exoneradas: { type: Number, default: 0 },
  igv: { type: Number, default: 0 },
  total: { type: Number, required: true },
  ambiente: { type: String, enum: ["beta", "produccion"], required: true },
  estado: { type: String, enum: ["pendiente", "aceptado", "rechazado", "error"], default: "pendiente" },
  codigoRespuesta: { type: String, default: "" },
  observaciones: { type: String, default: "" },
  xmlFirmado: { type: String, select: false },
  cdrZipBase64: { type: String, select: false },
  // Vínculos con el colegio
  recibo: { type: mongoose.Schema.Types.ObjectId, ref: "Recibo", default: null },
  estudiante: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  emitidoPor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
  afectado: { tipo: String, serie: String, correlativo: Number, comprobante: { type: mongoose.Schema.Types.ObjectId, ref: "Comprobante" } },
  motivoCodigo: { type: String, default: "" },
  motivoDescripcion: { type: String, default: "" },
  anulado: { type: Boolean, default: false },
}, { timestamps: true });

comprobanteSchema.index({ serie: 1, correlativo: 1, ambiente: 1 }, { unique: true });
comprobanteSchema.index({ recibo: 1 });

module.exports = mongoose.model("Comprobante", comprobanteSchema);
