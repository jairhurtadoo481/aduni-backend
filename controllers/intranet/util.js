const mongoose = require("mongoose");

// Guarda el error para que soporte técnico lo vea en su panel (nunca interrumpe la respuesta).
const registrarError = (req, error) => {
  const ErrorSistema = require("../../models/ErrorSistema");
  ErrorSistema.create({
    ruta: String(req?.originalUrl || "").split("?")[0].slice(0, 200), metodo: req?.method || "",
    mensaje: String(error?.message || error).slice(0, 300), detalle: String(error?.stack || "").slice(0, 1500),
    usuario: req?.usuarioId || null, rol: req?.usuarioRol || "",
  }).catch(() => {});
};

const err = (res, error) => {
  if (error?.code === 11000) return res.status(409).json({ mensaje: "Ya existe un registro con esos datos" });
  if (error?.name === "ValidationError" || error?.name === "CastError") {
    return res.status(400).json({ mensaje: "Datos inválidos", error: error.message });
  }
  console.error(error);
  registrarError(res.req, error);
  return res.status(500).json({ mensaje: "Error del servidor" });
};

const texto = (v, max = 150) => String(v ?? "").trim().slice(0, max);
const esId = (v) => mongoose.isValidObjectId(v);
const NIVELES = ["AD", "A", "B", "C"];
const MESES = ["Matrícula", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

// Envuelve un controlador async para no repetir try/catch.
const h = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    err(res, e);
  }
};

const resumenAsistencia = (registros) => {
  const c = { P: 0, T: 0, F: 0, J: 0 };
  registros.forEach((r) => { c[r.estado] = (c[r.estado] || 0) + 1; });
  const total = c.P + c.T + c.F + c.J;
  return { ...c, total, porcentaje: total ? Math.round(((c.P + c.T + c.J) / total) * 1000) / 10 : null };
};

module.exports = { err, registrarError, texto, esId, NIVELES, MESES, h, resumenAsistencia };
