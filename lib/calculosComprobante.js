const IGV_TASA = 0.18;

const redondear = (n) => Math.round(n * 100) / 100;

const calcularLinea = (item) => {
  const precioVenta = redondear(item.precioUnitario);
  const importeVenta = redondear(item.cantidad * precioVenta);
  const valorVenta = redondear(importeVenta / (1 + IGV_TASA));
  const igv = redondear(importeVenta - valorVenta);
  const precioUnitarioBase = item.cantidad > 0 ? redondear(valorVenta / item.cantidad) : 0;
  return { ...item, precioVenta, importeVenta, valorVenta, igv, precioUnitarioBase };
};

const calcularTotales = (items) => {
  const lineas = items.map(calcularLinea);
  const subtotal = redondear(lineas.reduce((acc, l) => acc + l.valorVenta, 0));
  const igv = redondear(lineas.reduce((acc, l) => acc + l.igv, 0));
  const total = redondear(lineas.reduce((acc, l) => acc + l.importeVenta, 0));
  return { lineas, subtotal, igv, total };
};

module.exports = { calcularLinea, calcularTotales, redondear };
