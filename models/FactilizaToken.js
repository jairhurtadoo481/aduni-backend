const mongoose = require("mongoose");

const factilizaTokenSchema = new mongoose.Schema({
  tokenCifrado: { type: String, required: true },
  etiqueta: { type: String, default: "" },
  usados: { type: Number, default: 0 },
  limite: { type: Number, default: 98 }, // deja 2 de margen bajo el limite real de 100 del plan Free
  activo: { type: Boolean, default: true },
  cicloInicio: { type: Date, default: Date.now }, // usados se reinicia 30 dias despues de esta fecha
}, { timestamps: true });

module.exports = mongoose.model("FactilizaToken", factilizaTokenSchema);
