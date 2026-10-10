const UNIDADES = ["", "UNO", "DOS", "TRES", "CUATRO", "CINCO", "SEIS", "SIETE", "OCHO", "NUEVE"];
const DECENAS_10_19 = ["DIEZ", "ONCE", "DOCE", "TRECE", "CATORCE", "QUINCE", "DIECISEIS", "DIECISIETE", "DIECIOCHO", "DIECINUEVE"];
const DECENAS = ["", "", "VEINTE", "TREINTA", "CUARENTA", "CINCUENTA", "SESENTA", "SETENTA", "OCHENTA", "NOVENTA"];
const CENTENAS = ["", "CIENTO", "DOSCIENTOS", "TRESCIENTOS", "CUATROCIENTOS", "QUINIENTOS", "SEISCIENTOS", "SETECIENTOS", "OCHOCIENTOS", "NOVECIENTOS"];

const convertirDecenas = (n) => {
  if (n < 10) return UNIDADES[n];
  if (n < 20) return DECENAS_10_19[n - 10];
  const decena = Math.floor(n / 10);
  const unidad = n % 10;
  if (decena === 2) return unidad === 0 ? "VEINTE" : `VEINTI${UNIDADES[unidad]}`;
  return unidad === 0 ? DECENAS[decena] : `${DECENAS[decena]} Y ${UNIDADES[unidad]}`;
};

const convertirCentenas = (n) => {
  if (n === 100) return "CIEN";
  const centena = Math.floor(n / 100);
  const resto = n % 100;
  const partes = [];
  if (centena > 0) partes.push(CENTENAS[centena]);
  if (resto > 0) partes.push(convertirDecenas(resto));
  return partes.join(" ");
};

const apocopar = (texto) => texto.replace(/UNO$/, "UN");

const convertirGrupo = (n, singular, plural) => {
  if (n === 0) return "";
  if (n === 1) return singular;
  return `${apocopar(convertirCentenas(n))} ${plural}`;
};

const convertirEntero = (n) => {
  if (n === 0) return "CERO";
  const millones = Math.floor(n / 1000000);
  const miles = Math.floor((n % 1000000) / 1000);
  const resto = n % 1000;

  const partes = [];
  if (millones > 0) partes.push(convertirGrupo(millones, "UN MILLON", "MILLONES"));
  if (miles > 0) partes.push(miles === 1 ? "MIL" : `${apocopar(convertirCentenas(miles))} MIL`);
  if (resto > 0) partes.push(convertirCentenas(resto));

  return partes.filter(Boolean).join(" ");
};

const montoALetras = (monto, moneda = "PEN") => {
  const nombreMoneda = moneda === "USD" ? "DOLARES AMERICANOS" : "SOLES";
  const entero = Math.floor(monto);
  const centimos = Math.round((monto - entero) * 100);
  const centimosTexto = String(centimos).padStart(2, "0");
  return `SON ${convertirEntero(entero)} CON ${centimosTexto}/100 ${nombreMoneda}`;
};

module.exports = { montoALetras };
