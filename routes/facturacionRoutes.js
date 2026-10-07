const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin } = require("../middleware/authMiddleware");
const { requiereDesbloqueoFacturacion } = require("../middleware/facturacionMiddleware");
const uploadCert = require("../middleware/uploadCertMiddleware");
const {
  desbloquear,
  obtenerConfiguracion,
  guardarDatosEmpresa,
  guardarCredencialesSol,
  subirCertificado,
  buscarDocumento,
  guardarCliente,
  emitir,
  emitirNota,
  reenviar,
  listarComprobantes,
  generarReporteCsv,
  generarReporteZip,
  enviarReporteGoogleSheets,
  listarFactilizaTokens,
  agregarFactilizaToken,
  actualizarFactilizaToken,
  eliminarFactilizaToken,
} = require("../controllers/facturacionController");

const guardia = [protegerRuta, soloAdmin, requiereDesbloqueoFacturacion];

router.post("/desbloquear", protegerRuta, soloAdmin, desbloquear);

router.get("/configuracion", ...guardia, obtenerConfiguracion);
router.put("/configuracion/empresa", ...guardia, guardarDatosEmpresa);
router.put("/configuracion/credenciales-sol", ...guardia, guardarCredencialesSol);
router.post("/configuracion/certificado", ...guardia, uploadCert.single("certificado"), subirCertificado);
router.get("/documento/:tipo/:numero", ...guardia, buscarDocumento);
router.put("/clientes/:documento", ...guardia, guardarCliente);
router.post("/emitir", ...guardia, emitir);
router.post("/notas-credito", ...guardia, emitirNota);
router.post("/comprobantes/:id/reenviar", ...guardia, reenviar);
router.get("/comprobantes", ...guardia, listarComprobantes);
router.get("/reporte/csv", ...guardia, generarReporteCsv);
router.get("/reporte/zip", ...guardia, generarReporteZip);
router.post("/reporte/google-sheets", ...guardia, enviarReporteGoogleSheets);

router.get("/factiliza-tokens", ...guardia, listarFactilizaTokens);
router.post("/factiliza-tokens", ...guardia, agregarFactilizaToken);
router.put("/factiliza-tokens/:id", ...guardia, actualizarFactilizaToken);
router.delete("/factiliza-tokens/:id", ...guardia, eliminarFactilizaToken);

module.exports = router;
