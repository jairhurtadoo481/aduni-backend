const FactilizaToken = require("../models/FactilizaToken");
const { cifrar, descifrar } = require("../config/cifrado");

const DURACION_CICLO_DIAS = 30;

// Si todavia no hay ninguna cuenta guardada, migra el token unico que estaba
// en .env, para no perder lo que ya estaba funcionando.
const asegurarTokenSemilla = async () => {
  const hay = await FactilizaToken.countDocuments();
  if (hay > 0 || !process.env.FACTILIZA_TOKEN) return;
  await FactilizaToken.create({
    tokenCifrado: cifrar(process.env.FACTILIZA_TOKEN),
    etiqueta: "Cuenta original (.env)",
  });
};

const reiniciarSiCorresponde = async (tokenDoc) => {
  const finCiclo = new Date(tokenDoc.cicloInicio.getTime() + DURACION_CICLO_DIAS * 86400000);
  if (new Date() >= finCiclo) {
    tokenDoc.usados = 0;
    tokenDoc.cicloInicio = new Date();
    await tokenDoc.save();
  }
};

// Consulta a Factiliza usando la primera cuenta activa que tenga cupo.
// Si una cuenta responde como agotada (401/403/429), la marca agotada y
// prueba con la siguiente, sin que quien llama note nada.
const consultarDocumento = async (tipo, numero) => {
  await asegurarTokenSemilla();

  const tokens = await FactilizaToken.find({ activo: true }).sort({ createdAt: 1 });
  for (const t of tokens) await reiniciarSiCorresponde(t);

  const candidatos = tokens.filter((t) => t.usados < t.limite);
  if (candidatos.length === 0) {
    throw new Error(
      tokens.length === 0
        ? "No hay ninguna cuenta de Factiliza configurada. Agrega un token en Configuracion."
        : "Se agotaron todas las cuentas de Factiliza configuradas por ahora."
    );
  }

  let ultimoError = null;
  for (const candidato of candidatos) {
    const token = descifrar(candidato.tokenCifrado).toString("utf8");
    let respuesta, data;
    try {
      respuesta = await fetch(`https://api.factiliza.com/v1/${tipo}/info/${numero}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(15000),
      });
      data = await respuesta.json().catch(() => ({}));
    } catch (error) {
      // fallo de red o timeout: no es culpa de esta cuenta, no probamos otras
      throw error;
    }

    const pareceAgotada = respuesta.status === 401 || respuesta.status === 403 || respuesta.status === 429;
    if (pareceAgotada) {
      candidato.usados = candidato.limite;
      await candidato.save();
      ultimoError = data.message || data.mensaje || `HTTP ${respuesta.status}`;
      continue;
    }

    candidato.usados += 1;
    await candidato.save();
    return { respuesta, data };
  }

  throw new Error(`Se agotaron todas las cuentas de Factiliza disponibles. ${ultimoError || ""}`.trim());
};

module.exports = { consultarDocumento, DURACION_CICLO_DIAS };
