const Usuario = require("../models/Usuario");
const { generarCodigo, claveTemporal } = require("./codigos");

const texto = (v, max) => String(v ?? "").trim().slice(0, max);

// Crea (o reutiliza por DNI) la cuenta del apoderado y lo vincula al estudiante.
// Devuelve { apoderado, password } (password solo si la cuenta es nueva) o null si no hay DNI válido.
const vincularApoderado = async (estudianteId, datos) => {
  const dni = String(datos?.dni || "").trim();
  if (!/^\d{8}$/.test(dni)) return null;
  let ap = await Usuario.findOne({ rol: "apoderado", dni });
  let password = null;
  if (!ap) {
    password = claveTemporal();
    const partes = texto(datos.nombre, 120).split(/\s+/).filter(Boolean);
    const corte = Math.ceil(partes.length / 2);
    ap = await Usuario.create({
      rol: "apoderado", dni, password, codigo: await generarCodigo("apoderado"),
      nombres: partes.slice(0, corte).join(" ") || "Apoderado",
      apellidos: partes.slice(corte).join(" ") || "-",
      celular: texto(datos.celular, 20), email: texto(datos.email, 120).toLowerCase() || undefined, hijos: [estudianteId],
    });
  } else {
    await Usuario.updateOne({ _id: ap._id }, { $addToSet: { hijos: estudianteId } });
  }
  return { apoderado: ap, password };
};

module.exports = { vincularApoderado };
