const jwt = require("jsonwebtoken");
const Usuario = require("../models/Usuario");

const generarToken = (id, rol) => {
  return jwt.sign({ id, rol }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const usuario = await Usuario.findOne({ email });

    if (!usuario) {
      return res.status(401).json({ mensaje: "Credenciales invalidas" });
    }

    const passwordCorrecta = await usuario.compararPassword(password);
    if (!passwordCorrecta) {
      return res.status(401).json({ mensaje: "Credenciales invalidas" });
    }

    if (usuario.rol === "trabajador" && usuario.activo === false) {
      return res.status(403).json({ mensaje: "Tu cuenta esta suspendida temporalmente. Contacta al administrador." });
    }

    const token = generarToken(usuario._id, usuario.rol);
    res.json({
      token,
      usuario: { id: usuario._id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error del servidor", error: error.message });
  }
};

module.exports = { login };
