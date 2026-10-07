const jwt = require("jsonwebtoken");

const DURACION_DESBLOQUEO = "20m";
const PROPOSITO = "facturacion";

const generarTokenFacturacion = (usuarioId) => {
  return jwt.sign({ id: String(usuarioId), proposito: PROPOSITO }, process.env.JWT_SECRET, {
    expiresIn: DURACION_DESBLOQUEO,
  });
};

const requiereDesbloqueoFacturacion = (req, res, next) => {
  try {
    const decoded = jwt.verify(req.headers["x-facturacion-token"], process.env.JWT_SECRET);
    if (decoded.proposito !== PROPOSITO || decoded.id !== String(req.usuarioId)) {
      throw new Error("Token de facturacion invalido");
    }
    // Cada uso renueva el desbloqueo: se bloquea tras 20 minutos sin actividad.
    res.set("X-Facturacion-Token", generarTokenFacturacion(req.usuarioId));
    next();
  } catch (error) {
    return res.status(403).json({
      codigo: "FACTURACION_BLOQUEADA",
      mensaje: "Facturacion bloqueada. Ingresa el codigo de acceso.",
    });
  }
};

module.exports = { generarTokenFacturacion, requiereDesbloqueoFacturacion };
