const mongoose = require("mongoose");

const itemReservaSchema = new mongoose.Schema({
  producto: { type: mongoose.Schema.Types.ObjectId, ref: "Producto", required: true },
  nombre: { type: String, required: true },
  codigo: { type: String, default: "" },
  imagen: { type: String, default: null },
  sucursal: { type: String, default: "sucursal1" },
  talla: { type: String, required: true },
  cantidad: { type: Number, required: true, default: 1 },
  precioUnitario: { type: Number, required: true },
  tieneOferta: { type: Boolean, default: false },
}, { _id: false });

const reservaSchema = new mongoose.Schema({
  tipo: {
    type: String,
    enum: ["web", "mayorista"],
    default: "web",
  },
  numero: { type: Number, required: true, unique: true },
  items: [itemReservaSchema],
  cliente: {
    nombre: { type: String, required: true, trim: true },
    celular: { type: String, required: true, trim: true },
    ciudad: {
      type: String,
      required: true,
      enum: ["andahuaylas", "fuera"],
    },
    entregaDomicilio: { type: Boolean, default: false },
    direccion: { type: String, default: "" },
  },
  metodoPago: {
    type: String,
    enum: ["yape", "plin", "bcp", null],
    default: null,
  },
  aceptoTerminosEn: { type: Date, default: null },
  versionTerminos: { type: String, default: "" },
  comprobante: { type: String, default: null },
  estado: {
    type: String,
    enum: ["pendiente", "atendido", "listo_recoger", "entregado", "suspendido"],
    default: "pendiente",
  },
  requierePagoCompleto: { type: Boolean, default: false },
  total: { type: Number, required: true },
  notasMayorista: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Reserva", reservaSchema);
