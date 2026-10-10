const mongoose = require("mongoose");

// Admisión / matrícula en línea: la familia registra al postulante y sube documentos.
const postulacionSchema = new mongoose.Schema({
  codigoSeguimiento: { type: String, required: true, unique: true },
  anio: { type: Number, required: true },
  nivel: { type: String, enum: ["primaria", "secundaria"], required: true },
  grado: { type: Number, required: true },
  postulante: {
    nombres: { type: String, required: true }, apellidos: { type: String, required: true },
    dni: { type: String, required: true }, fechaNacimiento: { type: String, default: "" },
    sexo: { type: String, default: "" }, colegioProcedencia: { type: String, default: "" },
  },
  apoderado: {
    nombre: { type: String, required: true }, parentesco: { type: String, default: "" },
    dni: { type: String, required: true }, celular: { type: String, required: true },
    email: { type: String, default: "" }, direccion: { type: String, default: "" },
  },
  documentos: [{ nombre: String, url: String }],
  comentario: { type: String, default: "" },
  estado: { type: String, enum: ["recibida", "en_evaluacion", "admitida", "no_admitida", "matriculada"], default: "recibida" },
  cita: { type: String, default: "" }, // fecha y hora de evaluación/entrevista
  notasInternas: { type: String, default: "" },
  estudianteCreado: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", default: null },
}, { timestamps: true });

module.exports = mongoose.model("Postulacion", postulacionSchema);
