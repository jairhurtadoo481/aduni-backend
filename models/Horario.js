const mongoose = require("mongoose");

const horarioSchema = new mongoose.Schema({
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", required: true },
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  dia: { type: Number, min: 1, max: 5, required: true }, // 1 = lunes
  horaInicio: { type: String, required: true }, // "08:00"
  horaFin: { type: String, required: true },
}, { timestamps: true });

horarioSchema.index({ aula: 1, dia: 1, horaInicio: 1 }, { unique: true });

module.exports = mongoose.model("Horario", horarioSchema);
