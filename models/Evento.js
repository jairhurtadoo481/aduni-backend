const mongoose = require("mongoose");

// Agenda / calendario escolar.
const eventoSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 150 },
  fecha: { type: String, required: true },
  tipo: { type: String, enum: ["academico", "feriado", "actividad", "reunion", "examen"], default: "actividad" },
  descripcion: { type: String, default: "" },
}, { timestamps: true });

module.exports = mongoose.model("Evento", eventoSchema);
