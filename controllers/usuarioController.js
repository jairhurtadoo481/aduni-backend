const Usuario = require("../models/Usuario");

const crearTrabajador = async (req, res) => {
  try {
    const { nombre, email, password } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: "Nombre, email y password son obligatorios" });
    }

    const existe = await Usuario.findOne({ email: email.toLowerCase() });
    if (existe) {
      return res.status(400).json({ mensaje: "Ya existe una cuenta con ese email" });
    }

    const trabajador = new Usuario({ nombre, email, password, rol: "trabajador" });
    await trabajador.save();

    res.status(201).json({
      id: trabajador._id,
      nombre: trabajador.nombre,
      email: trabajador.email,
      rol: trabajador.rol,
      activo: trabajador.activo,
    });
  } catch (error) {
    res.status(400).json({ mensaje: "Error al crear trabajador", error: error.message });
  }
};

const obtenerTrabajadores = async (req, res) => {
  try {
    const trabajadores = await Usuario.find({ rol: "trabajador" }).select("-password");
    res.json(trabajadores);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener trabajadores", error: error.message });
  }
};

const actualizarTrabajador = async (req, res) => {
  try {
    const { nombre, email, password, activo } = req.body;
    const trabajador = await Usuario.findOne({ _id: req.params.id, rol: "trabajador" });

    if (!trabajador) {
      return res.status(404).json({ mensaje: "Trabajador no encontrado" });
    }

    if (nombre) trabajador.nombre = nombre;
    if (email) trabajador.email = email;
    if (password) trabajador.password = password;
    if (typeof activo === "boolean") trabajador.activo = activo;

    await trabajador.save();

    res.json({
      id: trabajador._id,
      nombre: trabajador.nombre,
      email: trabajador.email,
      rol: trabajador.rol,
      activo: trabajador.activo,
    });
  } catch (error) {
    res.status(400).json({ mensaje: "Error al actualizar trabajador", error: error.message });
  }
};

const eliminarTrabajador = async (req, res) => {
  try {
    const trabajador = await Usuario.findOneAndDelete({ _id: req.params.id, rol: "trabajador" });
    if (!trabajador) {
      return res.status(404).json({ mensaje: "Trabajador no encontrado" });
    }
    res.json({ mensaje: "Trabajador eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar trabajador", error: error.message });
  }
};

const crearMayorista = async (req, res) => {
  try {
    const { nombre, email, password, celular } = req.body;

    if (!nombre || !email || !password) {
      return res.status(400).json({ mensaje: "Nombre, email y password son obligatorios" });
    }

    const existe = await Usuario.findOne({ email: email.toLowerCase() });
    if (existe) {
      return res.status(400).json({ mensaje: "Ya existe una cuenta con ese email" });
    }

    const mayorista = new Usuario({ nombre, email, password, celular: celular || "", rol: "mayorista" });
    await mayorista.save();

    res.status(201).json({
      id: mayorista._id,
      nombre: mayorista.nombre,
      email: mayorista.email,
      celular: mayorista.celular,
      rol: mayorista.rol,
      activo: mayorista.activo,
    });
  } catch (error) {
    res.status(400).json({ mensaje: "Error al crear mayorista", error: error.message });
  }
};

const obtenerMayoristas = async (req, res) => {
  try {
    const mayoristas = await Usuario.find({ rol: "mayorista" }).select("-password");
    res.json(mayoristas);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener mayoristas", error: error.message });
  }
};

const actualizarMayorista = async (req, res) => {
  try {
    const { nombre, email, password, celular, activo } = req.body;
    const mayorista = await Usuario.findOne({ _id: req.params.id, rol: "mayorista" });

    if (!mayorista) {
      return res.status(404).json({ mensaje: "Mayorista no encontrado" });
    }

    if (nombre) mayorista.nombre = nombre;
    if (email) mayorista.email = email;
    if (password) mayorista.password = password;
    if (celular !== undefined) mayorista.celular = celular;
    if (typeof activo === "boolean") mayorista.activo = activo;

    await mayorista.save();

    res.json({
      id: mayorista._id,
      nombre: mayorista.nombre,
      email: mayorista.email,
      celular: mayorista.celular,
      rol: mayorista.rol,
      activo: mayorista.activo,
    });
  } catch (error) {
    res.status(400).json({ mensaje: "Error al actualizar mayorista", error: error.message });
  }
};

const eliminarMayorista = async (req, res) => {
  try {
    const mayorista = await Usuario.findOneAndDelete({ _id: req.params.id, rol: "mayorista" });
    if (!mayorista) {
      return res.status(404).json({ mensaje: "Mayorista no encontrado" });
    }
    res.json({ mensaje: "Mayorista eliminado correctamente" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar mayorista", error: error.message });
  }
};

module.exports = {
  crearTrabajador,
  obtenerTrabajadores,
  actualizarTrabajador,
  eliminarTrabajador,
  crearMayorista,
  obtenerMayoristas,
  actualizarMayorista,
  eliminarMayorista,
};