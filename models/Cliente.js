const mongoose = require("mongoose");

const clienteSchema = new mongoose.Schema({
  tipoDocumento: { type: String, enum: ["DNI", "RUC"], required: true },
  documento: { type: String, required: true, unique: true },
  nombre: { type: String, required: true },
  direccion: { type: String, default: "" },
  telefono: { type: String, default: "" },
  correo: { type: String, default: "" },
  contacto: { type: String, default: "" },
  referencia: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Cliente", clienteSchema);
