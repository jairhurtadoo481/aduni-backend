const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin } = require("../middleware/authMiddleware");
const limitarSolicitudes = require("../middleware/limitarSolicitudes");
const { crearReclamo, listarReclamos, responderReclamo } = require("../controllers/reclamoController");

const limiteEnvios = limitarSolicitudes({ max: 5, ventanaMs: 60 * 60 * 1000 });

router.post("/", limiteEnvios, crearReclamo);
router.get("/", protegerRuta, soloAdmin, listarReclamos);
router.put("/:id/respuesta", protegerRuta, soloAdmin, responderReclamo);

module.exports = router;
