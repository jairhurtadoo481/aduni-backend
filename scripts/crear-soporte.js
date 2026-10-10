// Crea una cuenta de soporte técnico (la del proveedor del sistema).
// Uso: node scripts/crear-soporte.js "Nombres" "Apellidos" [correo]
// La contraseña temporal se muestra SOLO en esta terminal; al entrar se pide cambiarla
// y activar la verificación en dos pasos.
require("dotenv").config();
const mongoose = require("mongoose");
const Usuario = require("../models/Usuario");
const { generarCodigo, claveTemporal } = require("../lib/codigos");

(async () => {
  const [nombres, apellidos, email] = process.argv.slice(2);
  if (!nombres || !apellidos) {
    console.log('Uso: node scripts/crear-soporte.js "Nombres" "Apellidos" [correo]');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const password = claveTemporal();
  const u = await Usuario.create({
    rol: "soporte", nombres, apellidos, cargo: "Soporte técnico", email: email ? email.toLowerCase() : undefined,
    password, codigo: await generarCodigo("soporte"), debeCambiarPassword: true,
  });
  console.log(`Cuenta creada: ${u.codigo} (${u.nombre})`);
  console.log(`Contraseña temporal: ${password}`);
  console.log("Entra por /intranet/soporte, cambia la contraseña y activa la verificación en dos pasos.");
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
