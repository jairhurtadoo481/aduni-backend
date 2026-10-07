// Limitador simple en memoria por IP, para formularios publicos (evita spam).
// Requiere app.set("trust proxy", 1) detras de Render para ver la IP real.
const limitarSolicitudes = ({ max, ventanaMs }) => {
  const registros = new Map();

  return (req, res, next) => {
    const ahora = Date.now();
    const clave = req.ip;

    for (const [ip, marcas] of registros) {
      const vigentes = marcas.filter((t) => ahora - t < ventanaMs);
      if (vigentes.length === 0) registros.delete(ip);
      else registros.set(ip, vigentes);
    }

    const marcas = registros.get(clave) || [];
    if (marcas.length >= max) {
      return res.status(429).json({ mensaje: "Has enviado demasiadas solicitudes. Intenta de nuevo en un rato." });
    }
    marcas.push(ahora);
    registros.set(clave, marcas);
    next();
  };
};

module.exports = limitarSolicitudes;
