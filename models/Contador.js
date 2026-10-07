const mongoose = require("mongoose");

const contadorSchema = new mongoose.Schema({
  _id: { type: String },
  valor: { type: Number, default: 0 },
});

module.exports = mongoose.model("Contador", contadorSchema);
