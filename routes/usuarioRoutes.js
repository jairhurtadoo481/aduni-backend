const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin } = require("../middleware/authMiddleware");
const {
  crearTrabajador,
  obtenerTrabajadores,
  actualizarTrabajador,
  eliminarTrabajador,
  crearMayorista,
  obtenerMayoristas,
  actualizarMayorista,
  eliminarMayorista,
} = require("../controllers/usuarioController");

router.get("/", protegerRuta, soloAdmin, obtenerTrabajadores);
router.post("/", protegerRuta, soloAdmin, crearTrabajador);
router.put("/:id", protegerRuta, soloAdmin, actualizarTrabajador);
router.delete("/:id", protegerRuta, soloAdmin, eliminarTrabajador);

router.get("/mayoristas", protegerRuta, soloAdmin, obtenerMayoristas);
router.post("/mayoristas", protegerRuta, soloAdmin, crearMayorista);
router.put("/mayoristas/:id", protegerRuta, soloAdmin, actualizarMayorista);
router.delete("/mayoristas/:id", protegerRuta, soloAdmin, eliminarMayorista);

module.exports = router;