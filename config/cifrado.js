const crypto = require("crypto");

const obtenerClave = () => {
  const clave = process.env.FACTURACION_ENCRYPT_KEY;
  if (!clave) {
    throw new Error("Falta FACTURACION_ENCRYPT_KEY en el .env");
  }
  return Buffer.from(clave, "base64");
};

const cifrar = (textoPlano) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", obtenerClave(), iv);
  const cifrado = Buffer.concat([cipher.update(textoPlano), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, cifrado]).toString("base64");
};

const descifrar = (textoCifrado) => {
  const datos = Buffer.from(textoCifrado, "base64");
  const iv = datos.subarray(0, 12);
  const authTag = datos.subarray(12, 28);
  const cifrado = datos.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", obtenerClave(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(cifrado), decipher.final()]);
};

module.exports = { cifrar, descifrar };
