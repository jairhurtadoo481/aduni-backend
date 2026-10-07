const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const upload = require("../middleware/uploadMiddleware");
const {
  crearProducto,
  obtenerProductos,
  obtenerProductoPorId,
  obtenerVariantes,
  actualizarProducto,
  eliminarProducto,
  subirImagenesProducto,
  eliminarImagenProducto,
  venderTalla,
  buscarPorCodigoModelo,
  sumarStockTalla,
} = require("../controllers/productoController");

router.get("/", obtenerProductos);
router.get("/codigo-modelo/:codigoModelo", protegerRuta, buscarPorCodigoModelo);
router.get("/:id", obtenerProductoPorId);
router.get("/:id/variantes", obtenerVariantes);
router.post("/", protegerRuta, crearProducto);
router.put("/:id", protegerRuta, actualizarProducto);
router.delete("/:id", protegerRuta, eliminarProducto);
router.post("/:id/imagenes", protegerRuta, upload.array("imagenes", 5), subirImagenesProducto);
router.delete("/:id/imagenes", protegerRuta, eliminarImagenProducto);
router.post("/:id/vender", protegerRuta, venderTalla);
router.post("/:id/sumar-stock", protegerRuta, sumarStockTalla);

module.exports = router;