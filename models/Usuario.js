const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const usuarioSchema = new mongoose.Schema({
  nombre: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  celular: { type: String, default: "" },
  password: { type: String, required: true },
  rol: {
    type: String,
    enum: ["admin", "trabajador", "mayorista"],
    default: "admin",
  },
  activo: { type: Boolean, default: true },
  passwordCambiadaEn: { type: Date, default: null },
}, { timestamps: true });

usuarioSchema.pre("save", async function () {
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

usuarioSchema.methods.compararPassword = async function (passwordIngresada) {
  return bcrypt.compare(passwordIngresada, this.password);
};

module.exports = mongoose.model("Usuario", usuarioSchema);
