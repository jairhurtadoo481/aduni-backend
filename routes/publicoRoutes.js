const express = require("express");
const router = express.Router();
const c = require("../controllers/publicoController");
const limitarSolicitudes = require("../middleware/limitarSolicitudes");
const { recibirArchivo, manejarSubida } = require("../lib/subidas");

const limiteEnvios = limitarSolicitudes({ max: 5, ventanaMs: 60 * 60 * 1000 });
const limiteArchivos = limitarSolicitudes({ max: 20, ventanaMs: 60 * 60 * 1000 });
const limiteConsultas = limitarSolicitudes({ max: 30, ventanaMs: 15 * 60 * 1000 });

router.get("/noticias", c.noticias);
router.get("/noticias/:slug", c.noticia);
router.get("/admision", c.infoAdmision);
router.post("/admision/archivos", limiteArchivos, manejarSubida(recibirArchivo.single("archivo")), c.subirDocumento);
router.post("/admision", limiteEnvios, c.postular);
router.get("/admision/:codigo", limiteConsultas, c.seguimiento);

module.exports = router;
