// Documento generico para boletas cuando el cliente no se identifica.
// Convencion usada por la mayoria de sistemas de emision electronica en Peru.
const DOCUMENTO_CLIENTE_VARIOS = "00000000";
const LIMITE_BOLETA_SIN_IDENTIFICAR = 700;

// SUNAT solo exige identificar al cliente en una boleta cuando el total
// llega a S/ 700; por debajo de eso, o en cualquier factura, no aplica.
const validarClienteParaEmision = ({ tipo, cliente, total }) => {
  const esClienteVarios = cliente.documento === DOCUMENTO_CLIENTE_VARIOS;
  if (!esClienteVarios) return null;

  if (tipo === "factura") {
    return "La factura requiere el RUC del cliente";
  }
  if (total >= LIMITE_BOLETA_SIN_IDENTIFICAR) {
    return `Para boletas de S/ ${LIMITE_BOLETA_SIN_IDENTIFICAR} a mas debes identificar al cliente con su documento`;
  }
  return null;
};

module.exports = { validarClienteParaEmision, DOCUMENTO_CLIENTE_VARIOS, LIMITE_BOLETA_SIN_IDENTIFICAR };
