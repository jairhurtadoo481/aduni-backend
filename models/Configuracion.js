const mongoose = require("mongoose");
const configuracionSchema = new mongoose.Schema({
  qrYape: { type: String, default: null },
  qrPlin: { type: String, default: null },
  qrBcp: { type: String, default: null },
  minimoMayorista: { type: Number, default: 10 },
}, { timestamps: true });
module.exports = mongoose.model("Configuracion", configuracionSchema);
