const mongoose = require("mongoose");

// Configuración de facturación electrónica SUNAT (documento único). Credenciales y certificado se guardan cifrados.
const facturacionConfigSchema = new mongoose.Schema({
  activo: { type: Boolean, default: false },
  // Emitir boleta automáticamente al registrar o validar un pago
  emitirAutomatico: { type: Boolean, default: true },
  ruc: { type: String, default: "20564504751" },
  razonSocial: { type: String, default: "ADUNI MAS S.A.C." },
  nombreComercial: { type: String, default: "Colegio ADUNI+" },
  direccion: { type: String, default: "AV. LEONCIO PRADO NRO. 572 SAN JERONIMO - ANDAHUAYLAS - APURIMAC" },
  usuarioSolCifrado: { type: String, default: null },
  claveSolCifrada: { type: String, default: null },
  certificadoCifrado: { type: String, default: null },
  claveCertificadoCifrada: { type: String, default: null },
  certificadoInfo: { sujeto: String, emisor: String, validoHasta: Date },
  ambiente: { type: String, enum: ["beta", "produccion"], default: "beta" },
  series: {
    boleta: { type: String, default: "B001" },
    factura: { type: String, default: "F001" },
    notaCreditoBoleta: { type: String, default: "BC01" },
    notaCreditoFactura: { type: String, default: "FC01" },
  },
  correlativos: {
    boleta: { type: Number, default: 0 },
    factura: { type: Number, default: 0 },
    notaCreditoBoleta: { type: Number, default: 0 },
    notaCreditoFactura: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model("FacturacionConfig", facturacionConfigSchema);
