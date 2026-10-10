const mongoose = require("mongoose");

// Noticias de la web pública, editables desde el portal administrativo.
const noticiaSchema = new mongoose.Schema({
  titulo: { type: String, required: true, trim: true, maxlength: 160 },
  slug: { type: String, required: true, unique: true },
  resumen: { type: String, default: "", maxlength: 400 },
  contenido: { type: String, default: "", maxlength: 20000 },
  imagen: { type: String, default: "" },
  fecha: { type: String, required: true },
  publicada: { type: Boolean, default: true },
  autor: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario" },
}, { timestamps: true });

module.exports = mongoose.model("Noticia", noticiaSchema);
