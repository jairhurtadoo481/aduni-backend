const Contador = require("../models/Contador");

// Código institucional, al estilo de las universidades:
//   estudiante     -> 2026 + 4 dígitos   (ej. 20260001)
//   profesor       -> D + 2026 + 3 dígitos (ej. D2026001)
//   administrativo -> ADM + 3 dígitos     (ej. ADM001)
const generarCodigo = async (rol, anio = new Date().getFullYear()) => {
  const clave = rol === "administrativo" ? "codigo-adm" : rol === "apoderado" ? "codigo-apoderado" : rol === "soporte" ? "codigo-soporte" : `codigo-${rol}-${anio}`;
  const c = await Contador.findOneAndUpdate({ _id: clave }, { $inc: { valor: 1 } }, { upsert: true, returnDocument: "after" });
  const n = c.valor;
  if (rol === "estudiante") return `${anio}${String(n).padStart(4, "0")}`;
  if (rol === "profesor") return `D${anio}${String(n).padStart(3, "0")}`;
  if (rol === "apoderado") return `AP${String(n).padStart(5, "0")}`;
  if (rol === "soporte") return `SOP${String(n).padStart(3, "0")}`;
  return `ADM${String(n).padStart(3, "0")}`;
};

// Contraseña temporal legible (sin caracteres confusos) para entregar impresa.
const claveTemporal = () => {
  const crypto = require("crypto");
  const letras = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from(crypto.randomBytes(9), (b) => letras[b % letras.length]).join("");
};

module.exports = { generarCodigo, claveTemporal };
