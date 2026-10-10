const mongoose = require("mongoose");

// Suscripción Web Push de un navegador/celular (PWA).
const pushSchema = new mongoose.Schema({
  usuario: { type: mongoose.Schema.Types.ObjectId, ref: "Usuario", required: true },
  endpoint: { type: String, required: true, unique: true },
  keys: { p256dh: String, auth: String },
}, { timestamps: true });

module.exports = mongoose.model("PushSuscripcion", pushSchema);
