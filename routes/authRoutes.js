const express = require("express");
const router = express.Router();
const { login, verificar2FA, olvideMiPassword, restablecer } = require("../controllers/authController");
const limitarSolicitudes = require("../middleware/limitarSolicitudes");

// Máximo 15 intentos de login cada 15 minutos por IP.
const limiteLogin = limitarSolicitudes({ max: 15, ventanaMs: 15 * 60 * 1000 });
const limiteCorreo = limitarSolicitudes({ max: 5, ventanaMs: 60 * 60 * 1000 });

router.post("/login", limiteLogin, login);
router.post("/2fa", limiteLogin, verificar2FA);
router.post("/olvide", limiteCorreo, olvideMiPassword);
router.post("/restablecer", limiteLogin, restablecer);

module.exports = router;
