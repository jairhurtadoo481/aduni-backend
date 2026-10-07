const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin } = require("../middleware/authMiddleware");
const {
  abrirTurno,
  cerrarTurno,
  turnoActual,
  obtenerTurnos,
} = require("../controllers/turnoController");

router.post("/abrir", protegerRuta, abrirTurno);
router.post("/cerrar", protegerRuta, cerrarTurno);
router.get("/actual", protegerRuta, turnoActual);
router.get("/", protegerRuta, soloAdmin, obtenerTurnos);

module.exports = router;
