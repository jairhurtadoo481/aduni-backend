// Servicio de notificaciones: dentro de la intranet (campana), Web Push (PWA),
// y opcionalmente WhatsApp y correo si se configuran las variables de entorno.
const webpush = require("web-push");
const nodemailer = require("nodemailer");
const Notificacion = require("../models/Notificacion");
const PushSuscripcion = require("../models/PushSuscripcion");
const Usuario = require("../models/Usuario");

const pushActivo = !!(process.env.VAPID_PUBLIC && process.env.VAPID_PRIVATE);
if (pushActivo) webpush.setVapidDetails(process.env.VAPID_EMAIL || "mailto:informes@aduni.edu.pe", process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

const correo = process.env.SMTP_HOST
  ? nodemailer.createTransport({
    host: process.env.SMTP_HOST, port: Number(process.env.SMTP_PORT) || 587,
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  })
  : null;

const enviarCorreo = async (para, asunto, html) => {
  if (!correo || !para) return false;
  try {
    await correo.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to: para, subject: asunto, html });
    return true;
  } catch (e) {
    console.error("correo:", e.message);
    return false;
  }
};

// WhatsApp Cloud API (Meta). Requiere WHATSAPP_TOKEN y WHATSAPP_PHONE_ID.
const enviarWhatsApp = async (celular, texto) => {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_ID || !celular) return false;
  const numero = String(celular).replace(/\D/g, "");
  try {
    const r = await fetch(`https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_ID}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaging_product: "whatsapp", to: numero.length === 9 ? `51${numero}` : numero, type: "text", text: { body: texto } }),
    });
    return r.ok;
  } catch (e) {
    console.error("whatsapp:", e.message);
    return false;
  }
};

const enviarPush = async (usuarioIds, payload) => {
  if (!pushActivo) return;
  const subs = await PushSuscripcion.find({ usuario: { $in: usuarioIds } });
  await Promise.all(subs.map((s) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(payload)).catch((e) => {
      if (e.statusCode === 404 || e.statusCode === 410) return s.deleteOne();
    })
  ));
};

/**
 * notificar(usuarios, { titulo, mensaje, tipo, enlace, clave, whatsapp })
 * - usuarios: ids
 * - clave: si se repite, no se vuelve a notificar a ese usuario
 * - whatsapp: true para enviar también por WhatsApp a quien tenga celular (si está configurado)
 * Nunca lanza errores: las notificaciones no deben romper la operación principal.
 */
const notificar = async (usuarios, { titulo, mensaje = "", tipo = "sistema", enlace = "", clave, whatsapp = false }) => {
  try {
    const ids = [...new Set((usuarios || []).filter(Boolean).map(String))];
    if (!ids.length) return;
    const docs = ids.map((u) => ({ usuario: u, titulo, mensaje, tipo, enlace, ...(clave ? { clave: `${clave}-${u}` } : {}) }));
    let creados = ids;
    try {
      const r = await Notificacion.insertMany(docs, { ordered: false });
      creados = r.map((d) => String(d.usuario));
    } catch (e) {
      // Duplicados por "clave": solo se notifica a los nuevos.
      creados = (e.insertedDocs || []).map((d) => String(d.usuario));
    }
    if (!creados.length) return;
    await enviarPush(creados, { titulo, mensaje, enlace });
    if (whatsapp) {
      const us = await Usuario.find({ _id: { $in: creados } }).select("celular");
      await Promise.all(us.map((u) => enviarWhatsApp(u.celular, `${titulo}\n${mensaje}\n— Colegio ADUNI+`)));
    }
  } catch (e) {
    console.error("notificar:", e.message);
  }
};

// Estudiante + sus apoderados (las familias reciben los avisos del alumno).
const familiaDe = async (estudianteIds) => {
  const ids = (Array.isArray(estudianteIds) ? estudianteIds : [estudianteIds]).map(String);
  const apoderados = await Usuario.find({ rol: "apoderado", hijos: { $in: ids }, activo: true }).select("_id");
  return [...ids, ...apoderados.map((a) => String(a._id))];
};

const apoderadosDe = async (estudianteIds) => {
  const ids = (Array.isArray(estudianteIds) ? estudianteIds : [estudianteIds]).map(String);
  return (await Usuario.find({ rol: "apoderado", hijos: { $in: ids }, activo: true }).select("_id")).map((a) => String(a._id));
};

module.exports = { notificar, familiaDe, apoderadosDe, enviarCorreo, enviarWhatsApp, pushActivo, correoActivo: !!correo };
