const Turno = require("../models/Turno");
const Venta = require("../models/Venta");
const Usuario = require("../models/Usuario");

const abrirTurno = async (req, res) => {
  try {
    const existente = await Turno.findOne({ trabajador: req.usuarioId, abierto: true });
    if (existente) {
      return res.status(400).json({ mensaje: "Ya tienes un turno abierto", turno: existente });
    }

    const usuario = await Usuario.findById(req.usuarioId);

    const turno = new Turno({
      trabajador: req.usuarioId,
      trabajadorNombre: usuario ? usuario.nombre : "",
      fechaApertura: new Date(),
    });

    await turno.save();
    res.status(201).json(turno);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al abrir turno", error: error.message });
  }
};

const cerrarTurno = async (req, res) => {
  try {
    const turno = await Turno.findOne({ trabajador: req.usuarioId, abierto: true });
    if (!turno) {
      return res.status(404).json({ mensaje: "No tienes ningun turno abierto" });
    }

    const ventas = await Venta.find({ turnoId: turno._id });
    const totalVentas = ventas.reduce(
      (acc, v) => acc + (v.precioUnitario * v.cantidad - (v.descuento || 0)),
      0
    );

    turno.fechaCierre = new Date();
    turno.abierto = false;
    turno.totalVentas = totalVentas;
    turno.cantidadVentas = ventas.length;

    await turno.save();
    res.json(turno);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al cerrar turno", error: error.message });
  }
};

const turnoActual = async (req, res) => {
  try {
    const turno = await Turno.findOne({ trabajador: req.usuarioId, abierto: true });
    res.json(turno);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener turno actual", error: error.message });
  }
};

const obtenerTurnos = async (req, res) => {
  try {
    const filtro = {};
    if (req.query.trabajadorId) filtro.trabajador = req.query.trabajadorId;

    const turnos = await Turno.find(filtro).sort({ fechaApertura: -1 });
    res.json(turnos);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener turnos", error: error.message });
  }
};

module.exports = {
  abrirTurno,
  cerrarTurno,
  turnoActual,
  obtenerTurnos,
};
