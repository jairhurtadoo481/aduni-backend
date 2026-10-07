const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin } = require("../middleware/authMiddleware");
const {
  registrarVenta,
  obtenerVentas,
  buscarProductoPorCodigo,
  actividadReciente,
  eliminarVenta,
} = require("../controllers/ventaController");

router.get("/", protegerRuta, obtenerVentas);
router.get("/actividad", protegerRuta, actividadReciente);
router.get("/buscar/:codigo", protegerRuta, buscarProductoPorCodigo);
router.post("/", protegerRuta, registrarVenta);
router.delete("/:id", protegerRuta, soloAdmin, eliminarVenta);

module.exports = router;
