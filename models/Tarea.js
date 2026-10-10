const mongoose = require("mongoose");

const tareaSchema = new mongoose.Schema({
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  titulo: { type: String, required: true, trim: true, maxlength: 150 },
  descripcion: { type: String, default: "", maxlength: 3000 },
  enlace: { type: String, default: "" },
  fechaEntrega: { type: String, required: true }, // YYYY-MM-DD
  periodo: { type: Number, min: 1, max: 4 },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("Tarea", tareaSchema);
