const mongoose = require("mongoose");

// Grado + sección de un año académico (ej. 3.° B de secundaria 2026).
const aulaSchema = new mongoose.Schema({
  nivel: { type: String, enum: ["primaria", "secundaria"], required: true },
  grado: { type: Number, min: 1, max: 6, required: true },
  seccion: { type: String, required: true, uppercase: true, trim: true },
  anio: { type: Number, required: true },
  turno: { type: String, enum: ["mañana", "tarde"], default: "mañana" },
  tutor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
  capacidad: { type: Number, default: 30 },
}, { timestamps: true });

aulaSchema.index({ nivel: 1, grado: 1, seccion: 1, anio: 1 }, { unique: true });

aulaSchema.virtual("nombre").get(function () {
  return `${this.grado}.° ${this.seccion} - ${this.nivel === "primaria" ? "Primaria" : "Secundaria"}`;
});
aulaSchema.set("toJSON", { virtuals: true });
aulaSchema.set("toObject", { virtuals: true });

module.exports = mongoose.model("Aula", aulaSchema);
