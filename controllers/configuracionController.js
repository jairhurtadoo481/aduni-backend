const Configuracion = require("../models/Configuracion");
const subirImagen = require("../config/cloudinaryUpload");
const obtenerConfig = async () => {
  let config = await Configuracion.findOne();
  if (!config) {
    config = new Configuracion();
    await config.save();
  }
  return config;
};
const obtenerConfiguracion = async (req, res) => {
  try {
    const config = await obtenerConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener configuracion", error: error.message });
  }
};
const subirQrYape = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: "No se envio ninguna imagen" });
    }
    const resultado = await subirImagen(req.file.buffer, "zapatillas-marcelo/config");
    const config = await obtenerConfig();
    config.qrYape = resultado.secure_url;
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al subir QR de Yape", error: error.message });
  }
};
const subirQrPlin = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: "No se envio ninguna imagen" });
    }
    const resultado = await subirImagen(req.file.buffer, "zapatillas-marcelo/config");
    const config = await obtenerConfig();
    config.qrPlin = resultado.secure_url;
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al subir QR de Plin", error: error.message });
  }
};
const subirQrBcp = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ mensaje: "No se envio ninguna imagen" });
    }
    const resultado = await subirImagen(req.file.buffer, "zapatillas-marcelo/config");
    const config = await obtenerConfig();
    config.qrBcp = resultado.secure_url;
    await config.save();
    res.json(config);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al subir QR de BCP", error: error.message });
  }
};
module.exports = {
  obtenerConfiguracion,
  subirQrYape,
  subirQrPlin,
  subirQrBcp,
};