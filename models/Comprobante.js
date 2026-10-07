const mongoose = require("mongoose");

const itemSchema = new mongoose.Schema({
  descripcion: { type: String, required: true },
  cantidad: { type: Number, required: true },
  precioUnitario: { type: Number, required: true },
  productoId: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", default: null },
}, { _id: false });

const comprobanteSchema = new mongoose.Schema({
  tipo: { type: String, enum: ["factura", "boleta", "nota_credito"], required: true },
  serie: { type: String, required: true },
  correlativo: { type: Number, required: true },
  cliente: {
    tipoDocumento: { type: String, enum: ["DNI", "RUC"], required: true },
    documento: { type: String, required: true },
    nombre: { type: String, required: true },
    direccion: { type: String, default: "" },
  },
  items: { type: [itemSchema], required: true },
  moneda: { type: String, default: "PEN" },
  subtotal: { type: Number, required: true },
  igv: { type: Number, required: true },
  total: { type: Number, required: true },
  ambiente: { type: String, enum: ["beta", "produccion"], required: true },
  estado: {
    type: String,
    enum: ["pendiente", "aceptado", "rechazado", "error"],
    default: "pendiente",
  },
  codigoHash: { type: String, default: null },
  observaciones: { type: String, default: null },
  xmlUrl: { type: String, default: null },
  cdrUrl: { type: String, default: null },
  pdfUrl: { type: String, default: null },
  comprobanteAfectado: {
    tipo: { type: String, enum: ["factura", "boleta"], default: null },
    serie: { type: String, default: null },
    correlativo: { type: Number, default: null },
  },
  motivoCodigo: { type: String, default: null },
  motivoDescripcion: { type: String, default: null },
  anulado: { type: Boolean, default: false },
}, { timestamps: true });

comprobanteSchema.index({ serie: 1, correlativo: 1, ambiente: 1 }, { unique: true });

module.exports = mongoose.model("Comprobante", comprobanteSchema);
