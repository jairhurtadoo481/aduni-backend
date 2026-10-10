const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const { authenticator } = require("otplib");
const Usuario = require("../models/Usuario");
const { enviarCorreo, correoActivo } = require("../lib/notificar");
const Configuracion = require("../models/Configuracion");
const { registrarAcceso, alertarSoporte } = require("../lib/auditar");
const { estadoMantenimiento } = require("../middleware/authMiddleware");

const MAX_INTENTOS = 5;
const MINUTOS_BLOQUEO = 15;

// Los alumnos de primaria por debajo del grado configurado no tienen cuenta propia: los atiende su familia.
const tieneCuentaPropia = async (usuario) => {
  if (usuario.rol !== "estudiante") return true;
  const u = await Usuario.findById(usuario._id).select("aula").populate("aula");
  if (!u.aula || u.aula.nivel === "secundaria") return true;
  const config = await Configuracion.obtenerConfig();
  return u.aula.grado >= (config.gradoMinimoCuentaPrimaria ?? 5);
};

authenticator.options = { window: 1 };

const generarToken = (id, rol) => jwt.sign({ id, rol }, process.env.JWT_SECRET, { expiresIn: "7d" });
const hash = (t) => crypto.createHash("sha256").update(t).digest("hex");

const respuestaSesion = (usuario) => ({
  token: generarToken(usuario._id, usuario.rol),
  usuario: {
    id: usuario._id, codigo: usuario.codigo, nombre: usuario.nombre, nombres: usuario.nombres,
    rol: usuario.rol, debeCambiarPassword: usuario.debeCambiarPassword, foto: usuario.foto, areas: usuario.areas || [],
  },
});

const buscarPorIdentificador = (identificador, rol, extra = "") => {
  const id = String(identificador || "").trim();
  const filtro = id.includes("@")
    ? { email: id.toLowerCase() }
    : { $or: [{ codigo: id.toUpperCase() }, { dni: id }] };
  if (rol) filtro.rol = rol;
  return Usuario.findOne(filtro).select(extra);
};

// Se puede ingresar con código institucional, DNI o correo.
// `rol` es opcional: cada portal lo envía para que una cuenta solo entre al suyo.
const login = async (req, res) => {
  try {
    const { password, rol } = req.body;
    const identificador = String(req.body.usuario ?? req.body.email ?? "").trim();
    if (!identificador || typeof password !== "string") {
      return res.status(400).json({ mensaje: "Ingresa tu código y contraseña" });
    }
    const usuario = await buscarPorIdentificador(identificador, rol);

    // Cuenta bloqueada temporalmente por intentos fallidos
    if (usuario?.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
      const min = Math.ceil((usuario.bloqueadoHasta - Date.now()) / 60000);
      registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Intento de acceso con cuenta bloqueada", ip: req.ip });
      return res.status(423).json({ mensaje: `Cuenta bloqueada por varios intentos fallidos. Intenta en ${min} minuto(s) o pide ayuda a soporte.` });
    }

    if (!usuario || !(await usuario.compararPassword(password))) {
      registrarAcceso({
        usuario: usuario?._id, nombre: usuario?.nombre || identificador.slice(0, 60), rol: usuario?.rol || rol || "",
        accion: usuario ? "Intento de acceso fallido (contraseña incorrecta)" : "Intento de acceso con usuario inexistente", ip: req.ip,
      });
      if (usuario) {
        usuario.intentosFallidos = (usuario.intentosFallidos || 0) + 1;
        if (usuario.intentosFallidos >= MAX_INTENTOS) {
          usuario.bloqueadoHasta = new Date(Date.now() + MINUTOS_BLOQUEO * 60000);
          usuario.intentosFallidos = 0;
          registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: `Cuenta bloqueada ${MINUTOS_BLOQUEO} min por ${MAX_INTENTOS} intentos fallidos`, ip: req.ip });
          alertarSoporte({ titulo: `Cuenta bloqueada: ${usuario.nombre}`, mensaje: `${MAX_INTENTOS} intentos fallidos desde ${req.ip}`, tipo: "sistema", enlace: "/intranet/soporte/cuentas" });
        }
        await usuario.save();
        if (usuario.bloqueadoHasta && usuario.bloqueadoHasta > new Date()) {
          return res.status(423).json({ mensaje: `Demasiados intentos fallidos: la cuenta quedó bloqueada ${MINUTOS_BLOQUEO} minutos.` });
        }
      }
      return res.status(401).json({ mensaje: "Código o contraseña incorrectos" });
    }
    // Modo mantenimiento: solo soporte técnico puede entrar
    if (usuario.rol !== "soporte") {
      const m = await estadoMantenimiento();
      if (m.activo) return res.status(503).json({ mensaje: m.mensaje, mantenimiento: true });
    }
    if (usuario.intentosFallidos || usuario.bloqueadoHasta) {
      usuario.intentosFallidos = 0;
      usuario.bloqueadoHasta = null;
    }
    if (usuario.activo === false) {
      registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Intento de acceso con cuenta suspendida", ip: req.ip });
      return res.status(403).json({ mensaje: "Tu cuenta está suspendida. Comunícate con secretaría." });
    }
    if (!(await tieneCuentaPropia(usuario))) {
      return res.status(403).json({ mensaje: "En este grado la intranet la maneja tu familia desde el Portal de familias." });
    }

    if (usuario.totpActivo) {
      await usuario.save();
      const temporal = jwt.sign({ id: usuario._id, paso: "2fa" }, process.env.JWT_SECRET, { expiresIn: "5m" });
      return res.json({ requiere2FA: true, temporal });
    }

    usuario.ultimoAcceso = new Date();
    await usuario.save();
    registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Inició sesión", ip: req.ip });
    res.json(respuestaSesion(usuario));
  } catch (error) {
    console.error(error);
    require("./intranet/util").registrarError(req, error);
    res.status(500).json({ mensaje: "Error del servidor" });
  }
};

const verificar2FA = async (req, res) => {
  try {
    const datos = jwt.verify(String(req.body.temporal || ""), process.env.JWT_SECRET);
    if (datos.paso !== "2fa") throw new Error();
    const usuario = await Usuario.findById(datos.id).select("+totpSecret");
    if (!usuario || !usuario.totpActivo || !authenticator.check(String(req.body.codigo || "").replace(/\s/g, ""), usuario.totpSecret)) {
      if (usuario) registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Código de dos pasos incorrecto", ip: req.ip });
      return res.status(401).json({ mensaje: "Código de verificación incorrecto" });
    }
    usuario.ultimoAcceso = new Date();
    await usuario.save();
    registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Inició sesión (con verificación en dos pasos)", ip: req.ip });
    res.json(respuestaSesion(usuario));
  } catch {
    res.status(401).json({ mensaje: "La verificación expiró, vuelve a iniciar sesión" });
  }
};

const olvideMiPassword = async (req, res) => {
  const generico = { mensaje: "Si los datos son correctos, enviaremos un enlace a tu correo registrado. Si no tienes correo, acércate a secretaría.", correoActivo };
  try {
    const usuario = await buscarPorIdentificador(req.body.usuario, req.body.rol);
    const destino = usuario && (usuario.email || usuario.apoderado?.email);
    if (!usuario || !usuario.activo || !destino || !correoActivo) return res.json(generico);
    const token = crypto.randomBytes(32).toString("hex");
    usuario.resetToken = hash(token);
    usuario.resetExpira = new Date(Date.now() + 30 * 60 * 1000);
    await usuario.save();
    const url = `${process.env.FRONTEND_URL || "http://localhost:3000"}/intranet/restablecer?u=${usuario._id}&t=${token}`;
    await enviarCorreo(destino, "Restablecer tu contraseña - Intranet ADUNI+",
      `<p>Hola ${usuario.nombres}:</p><p>Para crear una nueva contraseña de tu cuenta <b>${usuario.codigo}</b>, ingresa a este enlace (válido por 30 minutos):</p><p><a href="${url}">${url}</a></p><p>Si no lo solicitaste, ignora este correo.</p><p>Colegio ADUNI+</p>`);
    res.json(generico);
  } catch {
    res.json(generico);
  }
};

const restablecer = async (req, res) => {
  try {
    const { u, t, nueva } = req.body;
    if (typeof nueva !== "string" || nueva.length < 8) return res.status(400).json({ mensaje: "La contraseña debe tener al menos 8 caracteres" });
    const usuario = await Usuario.findById(u).select("+resetToken +resetExpira");
    if (!usuario || !usuario.resetToken || usuario.resetToken !== hash(String(t || "")) || usuario.resetExpira < new Date()) {
      return res.status(400).json({ mensaje: "El enlace no es válido o ya expiró" });
    }
    usuario.password = nueva;
    usuario.resetToken = "";
    usuario.resetExpira = null;
    usuario.debeCambiarPassword = false;
    usuario.passwordCambiadaEn = new Date(Date.now() - 1000);
    await usuario.save();
    registrarAcceso({ usuario: usuario._id, nombre: usuario.nombre, rol: usuario.rol, accion: "Restableció su contraseña por correo", ip: req.ip });
    res.json({ mensaje: "Contraseña actualizada. Ya puedes iniciar sesión." });
  } catch {
    res.status(400).json({ mensaje: "El enlace no es válido o ya expiró" });
  }
};

module.exports = { login, verificar2FA, olvideMiPassword, restablecer };
