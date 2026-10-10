// Fechas en hora de Perú (America/Lima), independientemente de la zona del servidor.
const ZONA = "America/Lima";

const hoy = (d = new Date()) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: ZONA, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

const horaActual = (d = new Date()) =>
  new Intl.DateTimeFormat("en-GB", { timeZone: ZONA, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);

const esFechaValida = (f) => typeof f === "string" && /^\d{4}-\d{2}-\d{2}$/.test(f) && !Number.isNaN(Date.parse(f));

// Días hábiles (lun-vie) entre dos fechas YYYY-MM-DD, inclusive.
const diasHabiles = (desde, hasta) => {
  const res = [];
  const d = new Date(`${desde}T12:00:00Z`);
  const fin = new Date(`${hasta}T12:00:00Z`);
  while (d <= fin) {
    const dia = d.getUTCDay();
    if (dia >= 1 && dia <= 5) res.push(d.toISOString().slice(0, 10));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return res;
};

module.exports = { hoy, horaActual, esFechaValida, diasHabiles };
