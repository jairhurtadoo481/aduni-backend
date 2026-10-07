const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

const protegerRuta = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer")) {
    try {
      token = req.headers.authorization.split(" ")[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (decoded.rol === "admin") {
        // Si se cambio la contraseña del admin, las sesiones anteriores dejan de valer.
        const admin = await Usuario.findById(decoded.id).select("passwordCambiadaEn");
        if (!admin) {
          return res.status(401).json({ mensaje: "Token invalido o expirado" });
        }
        if (admin.passwordCambiadaEn && decoded.iat < Math.floor(admin.passwordCambiadaEn.getTime() / 1000)) {
          return res.status(401).json({ mensaje: "Sesion cerrada, vuelve a iniciar sesion" });
        }
      }

      req.usuarioId = decoded.id;
      req.usuarioRol = decoded.rol;
      next();
    } catch (error) {
      return res.status(401).json({ mensaje: "Token invalido o expirado" });
    }
  } else {
    return res.status(401).json({ mensaje: "No autorizado, falta token" });
  }
};

const soloAdmin = (req, res, next) => {
  if (req.usuarioRol !== "admin") {
    return res.status(403).json({ mensaje: "Solo el administrador puede hacer esto" });
  }
  next();
};

const soloMayorista = (req, res, next) => {
  if (req.usuarioRol !== "mayorista") {
    return res.status(403).json({ mensaje: "Solo cuentas mayoristas pueden hacer esto" });
  }
  next();
};

module.exports = protegerRuta;
module.exports.soloAdmin = soloAdmin;
module.exports.soloMayorista = soloMayorista;
