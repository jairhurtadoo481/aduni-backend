const mongoose = require("mongoose");
const tallaSchema = new mongoose.Schema({
  talla: { type: String, required: true },
  stock: { type: Number, required: true, default: 0 },
}, { _id: false });
const productoSchema = new mongoose.Schema({
  codigo: { type: String, default: "", trim: true },
  codigoModelo: { type: String, default: "", trim: true, index: true },
  sucursal: {
    type: String,
    enum: ["sucursal1", "sucursal2"],
    default: "sucursal1",
  },
  nombre: { type: String, required: true, trim: true },
  modeloBase: { type: String, default: "", trim: true },
  marca: { type: String, required: true, trim: true },
  calidad: {
    type: String,
    enum: ["Original", "Replica"],
    default: "Original",
  },
  descripcion: { type: String, default: "" },
  precio: { type: Number, required: true },
  precioPresencial: { type: Number, default: null },
  precioMayorista: { type: Number, default: null },
  precioOferta: { type: Number, default: null },
  ofertaInicio: { type: Date, default: null },
  ofertaFin: { type: Date, default: null },
  categoria: {
    type: String,
    required: true,
    enum: ["hombre", "mujer", "ninios"],
  },
  tipo: {
    type: String,
    required: true,
    enum: ["running", "urbano", "casual", "deportivo", "botines"],
  },
  tallas: [tallaSchema],
  colores: [{ type: String }],
  imagenes: [{ type: String }],
  destacado: { type: Boolean, default: false },
  activo: { type: Boolean, default: true },
}, { timestamps: true });
module.exports = mongoose.model("Producto", productoSchema);
