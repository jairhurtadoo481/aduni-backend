const mongoose = require("mongoose");

// Aula virtual: materiales, enlaces, videos y anuncios de un curso.
const materialSchema = new mongoose.Schema({
  curso: { type: mongoose.Schema.Types.ObjectId, ref: "Curso", required: true },
  unidad: { type: String, default: "General", trim: true, maxlength: 80 },
  tipo: { type: String, enum: ["archivo", "enlace", "video", "anuncio"], required: true },
  titulo: { type: String, required: true, trim: true, maxlength: 150 },
  descripcion: { type: String, default: "", maxlength: 3000 },
  url: { type: String, default: "" },
  nombreArchivo: { type: String, default: "" },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

materialSchema.index({ curso: 1, createdAt: -1 });

module.exports = mongoose.model("Material", materialSchema);
