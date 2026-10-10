const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

// "soporte": proveedor del sistema (mantenimiento y mesa de ayuda), externo al colegio.
const ROLES = ["estudiante", "profesor", "administrativo", "apoderado", "soporte"];
// Áreas del personal administrativo. "direccion" tiene acceso total.
const AREAS = ["direccion", "secretaria", "tesoreria", "coordinacion", "auxiliar"];

const usuarioSchema = new mongoose.Schema({
  codigo: { type: String, unique: true, sparse: true, uppercase: true, trim: true },
  nombres: { type: String, required: true, trim: true },
  apellidos: { type: String, required: true, trim: true },
  // "Apellidos, Nombres": se calcula al guardar y se usa para ordenar y mostrar.
  nombre: { type: String, trim: true },
  email: { type: String, unique: true, sparse: true, lowercase: true, trim: true },
  dni: { type: String, trim: true, default: "" },
  celular: { type: String, default: "" },
  fechaNacimiento: { type: String, default: "" },
  sexo: { type: String, enum: ["M", "F", ""], default: "" },
  direccion: { type: String, default: "" },
  password: { type: String, required: true },
  rol: { type: String, enum: ROLES, default: "estudiante" },

  // Estudiante
  aula: { type: mongoose.Schema.Types.ObjectId, ref: "Aula", default: null },
  apoderado: {
    nombre: { type: String, default: "" },
    parentesco: { type: String, default: "" },
    dni: { type: String, default: "" },
    celular: { type: String, default: "" },
    email: { type: String, default: "" },
  },

  // Docente / administrativo
  especialidad: { type: String, default: "" },
  cargo: { type: String, default: "" },
  areas: [{ type: String, enum: AREAS }],

  // Apoderado: estudiantes a su cargo
  hijos: [{ type: mongoose.Schema.Types.ObjectId, ref: "Usuario" }],

  foto: { type: String, default: "" },

  // Recuperación de contraseña por correo (se guarda el hash del token)
  resetToken: { type: String, default: "", select: false },
  resetExpira: { type: Date, default: null, select: false },

  // Verificación en dos pasos (TOTP, app autenticadora)
  totpSecret: { type: String, default: "", select: false },
  totpActivo: { type: Boolean, default: false },

  activo: { type: Boolean, default: true },
  debeCambiarPassword: { type: Boolean, default: true },
  passwordCambiadaEn: { type: Date, default: null },
  ultimoAcceso: { type: Date, default: null },
  // Protección contra adivinar contraseñas: tras varios fallos la cuenta se bloquea unos minutos.
  intentosFallidos: { type: Number, default: 0 },
  bloqueadoHasta: { type: Date, default: null },
  // Al "cerrar todas las sesiones" se invalidan los tokens emitidos antes de esta fecha.
  sesionesCerradasEn: { type: Date, default: null },
}, { timestamps: true });

usuarioSchema.index({ rol: 1, aula: 1 });

usuarioSchema.pre("save", async function () {
  this.nombre = `${this.apellidos}, ${this.nombres}`;
  if (!this.email) this.email = undefined;
  if (!this.isModified("password")) return;
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

usuarioSchema.methods.compararPassword = async function (passwordIngresada) {
  return bcrypt.compare(passwordIngresada, this.password);
};

module.exports = mongoose.model("Usuario", usuarioSchema);
module.exports.ROLES = ROLES;
module.exports.AREAS = AREAS;
