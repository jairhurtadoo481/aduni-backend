const mongoose = require("mongoose");

const reclamoSchema = new mongoose.Schema({
  anio: { type: Number, required: true },
  numero: { type: Number, required: true },
  codigo: { type: String, required: true },
  tipo: { type: String, enum: ["reclamo", "queja"], required: true },
  consumidor: {
    nombre: { type: String, required: true, trim: true },
    tipoDocumento: { type: String, enum: ["DNI", "CE", "PASAPORTE", "RUC"], required: true },
    documento: { type: String, required: true, trim: true },
    domicilio: { type: String, required: true, trim: true },
    telefono: { type: String, required: true, trim: true },
    correo: { type: String, required: true, trim: true, lowercase: true },
  },
  esMenor: { type: Boolean, default: false },
  apoderado: {
    nombre: { type: String, default: "" },
    documento: { type: String, default: "" },
  },
  bien: {
    tipo: { type: String, enum: ["producto", "servicio"], required: true },
    descripcion: { type: String, required: true, trim: true },
    monto: { type: Number, default: 0 },
    numeroPedido: { type: String, default: "" },
  },
  detalle: { type: String, required: true, trim: true },
  pedidoConsumidor: { type: String, required: true, trim: true },
  estado: { type: String, enum: ["pendiente", "respondido"], default: "pendiente" },
  respuesta: {
    texto: { type: String, default: "" },
    fecha: { type: Date, default: null },
  },
}, { timestamps: true });

reclamoSchema.index({ anio: 1, numero: 1 }, { unique: true });

module.exports = mongoose.model("Reclamo", reclamoSchema);
