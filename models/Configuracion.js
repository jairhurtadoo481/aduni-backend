const mongoose = require("mongoose");

// Configuración única del año académico (documento con _id "general").
const configuracionSchema = new mongoose.Schema({
  _id: { type: String, default: "general" },
  anio: { type: Number, default: () => new Date().getFullYear() },
  periodos: [{
    numero: Number,
    nombre: String,
    inicio: String,
    fin: String,
  }],
  horaIngreso: { type: String, default: "07:45" }, // (estudiantes) referencia de inicio de clases
  horaLimiteFalta: { type: String, default: "09:00" },
  // Personal (docentes y administrativos): marcan con QR; pasada esta hora es tardanza.
  horaIngresoPersonal: { type: String, default: "07:30" },
  // Asistencia por clase: el docente puede pasar lista desde X min antes del inicio
  // hasta Y min después del fin de su bloque; luego se bloquea.
  margenAsistenciaAntes: { type: Number, default: 10 },
  margenAsistenciaDespues: { type: Number, default: 30 },
  // En primaria, desde qué grado el alumno tiene cuenta propia (los menores, solo su familia). 7 = solo secundaria.
  gradoMinimoCuentaPrimaria: { type: Number, default: 5 },
  // Modo mantenimiento: solo soporte puede entrar (para actualizaciones del sistema).
  mantenimiento: {
    activo: { type: Boolean, default: false },
    mensaje: { type: String, default: "Estamos realizando mejoras en la intranet. Vuelve a intentarlo en unos minutos." },
  },
  montoMatricula: { type: Number, default: 300 },
  montoPension: { type: Number, default: 280 },
  diaVencimiento: { type: Number, default: 30 },
}, { timestamps: true });

module.exports = mongoose.model("Configuracion", configuracionSchema);

module.exports.obtenerConfig = async () => {
  const Config = module.exports;
  let c = await Config.findById("general");
  if (!c) {
    const anio = new Date().getFullYear();
    c = await Config.create({
      _id: "general",
      anio,
      periodos: [
        { numero: 1, nombre: "I Bimestre", inicio: `${anio}-03-09`, fin: `${anio}-05-08` },
        { numero: 2, nombre: "II Bimestre", inicio: `${anio}-05-18`, fin: `${anio}-07-17` },
        { numero: 3, nombre: "III Bimestre", inicio: `${anio}-08-03`, fin: `${anio}-10-02` },
        { numero: 4, nombre: "IV Bimestre", inicio: `${anio}-10-12`, fin: `${anio}-12-18` },
      ],
    });
  }
  return c;
};

// Periodo que corresponde a una fecha (o el último iniciado).
module.exports.periodoDeFecha = (config, fecha) => {
  const ps = [...config.periodos].sort((a, b) => a.numero - b.numero);
  let actual = ps[0]?.numero || 1;
  for (const p of ps) if (fecha >= p.inicio) actual = p.numero;
  return actual;
};
