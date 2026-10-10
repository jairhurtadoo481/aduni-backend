// Llena la base con datos de DEMOSTRACIÓN: aulas, docentes, estudiantes con código,
// cursos con competencias del CNEB, horarios, calificaciones, asistencia, tareas y pensiones.
//
// Uso:  node scripts/sembrar-demo.js --reiniciar
//       (opcional) SEED_PASSWORD=... para usar una contraseña conocida en pruebas locales
//   --reiniciar  borra TODOS los datos de la intranet antes de sembrar (no toca reclamos).
//
// Las contraseñas se generan al azar y se guardan en .seed-credenciales.txt (ignorado por git).
require("dotenv").config();
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const Usuario = require("../models/Usuario");
const Aula = require("../models/Aula");
const Curso = require("../models/Curso");
const Horario = require("../models/Horario");
const Asistencia = require("../models/Asistencia");
const Justificacion = require("../models/Justificacion");
const Calificacion = require("../models/Calificacion");
const Tarea = require("../models/Tarea");
const Entrega = require("../models/Entrega");
const Pension = require("../models/Pension");
const Comunicado = require("../models/Comunicado");
const Evento = require("../models/Evento");
const Contador = require("../models/Contador");
const Configuracion = require("../models/Configuracion");
const Incidencia = require("../models/Incidencia");
const Material = require("../models/Material");
const Examen = require("../models/Examen");
const Intento = require("../models/Intento");
const Recibo = require("../models/Recibo");
const Noticia = require("../models/Noticia");
const Postulacion = require("../models/Postulacion");
const PagoReportado = require("../models/PagoReportado");
const Notificacion = require("../models/Notificacion");
const Mensaje = require("../models/Mensaje");
const Auditoria = require("../models/Auditoria");
const AsistenciaPersonal = require("../models/AsistenciaPersonal");
const PushSuscripcion = require("../models/PushSuscripcion");
const AsistenciaClase = require("../models/AsistenciaClase");
const Comprobante = require("../models/Comprobante");
const FacturacionConfig = require("../models/FacturacionConfig");
const Ticket = require("../models/Ticket");
const ErrorSistema = require("../models/ErrorSistema");
const { AREAS } = require("../lib/curriculo");
const { generarCodigo } = require("../lib/codigos");
const { hoy, diasHabiles } = require("../lib/fechas");

// SEED_PASSWORD (opcional, solo para pruebas locales): misma contraseña para todas las cuentas demo.
const clave = () => process.env.SEED_PASSWORD || crypto.randomBytes(6).toString("base64url");
const azar = (arr) => arr[Math.floor(Math.random() * arr.length)];
const dni = () => String(10000000 + Math.floor(Math.random() * 79999999));
const pesos = (opciones) => { // [[valor, peso], ...]
  const total = opciones.reduce((s, o) => s + o[1], 0);
  let r = Math.random() * total;
  for (const [v, p] of opciones) { if ((r -= p) <= 0) return v; }
  return opciones[0][0];
};

const NOMBRES_M = ["Luis Ángel", "Diego", "Kevin", "José Carlos", "Jhon", "Fabricio", "Sebastián", "Rodrigo", "Thiago", "Mateo", "Gael", "Alonso"];
const NOMBRES_F = ["Valeria", "Camila", "Luciana", "Ximena", "Andrea", "María Fernanda", "Nayeli", "Yuliana", "Sofía", "Fiorella", "Milagros", "Danna"];
const APELLIDOS = ["Quispe", "Huamán", "Mamani", "Ccahuana", "Pillaca", "Vargas", "Gutiérrez", "Cárdenas", "Palomino", "Rojas", "Huachaca", "Contreras", "Salazar", "Oscco", "Pariona", "Altamirano"];

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  if (process.argv.includes("--reiniciar")) {
    await Promise.all([Usuario, Aula, Curso, Horario, Asistencia, Justificacion, Calificacion, Tarea, Entrega, Pension, Comunicado, Evento, Configuracion,
      Incidencia, Material, Examen, Intento, Recibo, Noticia, Postulacion, PagoReportado, Notificacion, Mensaje, Auditoria, AsistenciaPersonal, PushSuscripcion, AsistenciaClase, Comprobante, FacturacionConfig, Ticket, ErrorSistema].map((M) => M.deleteMany({})));
    await Contador.deleteMany({ _id: /^(codigo-|recibo-|ticket$)/ });
    await Promise.all([Usuario, Asistencia, Calificacion, Pension, Aula, Curso, Horario, Entrega].map((M) => M.syncIndexes()));
    console.log("Datos de la intranet borrados.");
  }
  if (await Usuario.exists({})) {
    console.log("Ya hay usuarios. Usa --reiniciar para volver a sembrar.");
    return mongoose.disconnect();
  }

  const config = await Configuracion.obtenerConfig();
  const anio = config.anio;
  const f = hoy();
  const credenciales = [];
  const crear = async (datos, guardar = true) => {
    const password = clave();
    const u = await Usuario.create({ ...datos, password, codigo: await generarCodigo(datos.rol, anio), debeCambiarPassword: false });
    if (guardar) credenciales.push(`${u.codigo.padEnd(10)} ${password}  [${u.rol}] ${u.nombre}`);
    return u;
  };

  // --- Personal ---
  const admin = await crear({ rol: "administrativo", nombres: "Rosa", apellidos: "Demo Dirección", email: "direccion@aduni.demo", cargo: "Directora", areas: ["direccion"], dni: dni() });
  for (const [nombres, apellidos, cargo, area] of [
    ["Lucía", "Demo Secretaría", "Secretaria académica", "secretaria"],
    ["Jorge", "Demo Tesorería", "Tesorero", "tesoreria"],
    ["Elena", "Demo Coordinación", "Coordinadora académica", "coordinacion"],
    ["Víctor", "Demo Auxiliar", "Auxiliar de educación", "auxiliar"],
  ]) {
    await crear({ rol: "administrativo", nombres, apellidos, cargo, areas: [area], dni: dni(), email: `${area}@aduni.demo` });
  }
  // Soporte técnico (proveedor del sistema): debe activar la verificación en dos pasos al entrar.
  await crear({ rol: "soporte", nombres: "Soporte", apellidos: "Técnico ADUNI+", cargo: "Soporte técnico", email: "soporte@aduni.demo" });
  const docentes = [];
  for (const [nombres, apellidos, esp] of [
    ["Carlos Alberto", "Huamaní Rojas", "Matemática"],
    ["Mónica", "Palomino Vargas", "Comunicación"],
    ["Edwin", "Cárdenas Quispe", "Ciencia y Tecnología"],
    ["Patricia", "Salazar Oscco", "Inglés"],
  ]) {
    docentes.push(await crear({ rol: "profesor", nombres, apellidos, especialidad: esp, dni: dni(), email: `${nombres.split(" ")[0].toLowerCase()}@aduni.demo`, celular: `9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` }));
  }
  const [dMat, dCom, dCie, dIng] = docentes;

  // --- Aulas ---
  const aulas = [
    await Aula.create({ nivel: "secundaria", grado: 1, seccion: "A", anio, tutor: dMat._id }),
    await Aula.create({ nivel: "secundaria", grado: 2, seccion: "A", anio, tutor: dCom._id }),
    await Aula.create({ nivel: "primaria", grado: 5, seccion: "A", anio, tutor: dCie._id }),
    await Aula.create({ nivel: "primaria", grado: 2, seccion: "A", anio, tutor: dIng._id }),
  ];

  // --- Estudiantes ---
  const estudiantesPorAula = new Map();
  let guardados = 0;
  for (const aula of aulas) {
    const lista = [];
    for (let i = 0; i < 8; i++) {
      const sexo = i % 2 ? "F" : "M";
      const ap1 = azar(APELLIDOS);
      const ap2 = azar(APELLIDOS);
      const u = await crear({
        rol: "estudiante", sexo, aula: aula._id, dni: dni(),
        nombres: azar(sexo === "M" ? NOMBRES_M : NOMBRES_F), apellidos: `${ap1} ${ap2}`,
        fechaNacimiento: `${anio - (aula.nivel === "primaria" ? 5 + aula.grado : 11 + aula.grado)}-0${1 + (i % 9)}-1${i}`,
        direccion: "San Jerónimo, Andahuaylas",
        apoderado: { nombre: `${azar(NOMBRES_F)} ${ap1}`, parentesco: "Madre", dni: dni(), celular: `9${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
      }, aula.nivel === "primaria" && aula.grado < 5 ? false : guardados++ < 3);
      lista.push(u);
    }
    estudiantesPorAula.set(String(aula._id), lista);
  }

  // --- Cursos ---
  const colores = { "Matemática": "#1b4aa0", "Comunicación": "#c2410c", "Ciencia y Tecnología": "#15803d", "Inglés": "#7c3aed", "Ciencias Sociales": "#b45309", "Personal Social": "#b45309", "Educación Física": "#0e7490" };
  const plan = {
    secundaria: [["Matemática", dMat], ["Comunicación", dCom], ["Ciencia y Tecnología", dCie], ["Inglés", dIng], ["Ciencias Sociales", dCom], ["Educación Física", dIng]],
    primaria: [["Matemática", dCie], ["Comunicación", dCom], ["Personal Social", dCie], ["Ciencia y Tecnología", dCie], ["Inglés", dIng]],
  };
  const cursos = [];
  for (const aula of aulas) {
    for (const [nombre, docente] of plan[aula.nivel]) {
      cursos.push(await Curso.create({ aula: aula._id, nombre, docente: docente._id, competencias: AREAS[aula.nivel][nombre], color: colores[nombre], horasSemanales: 4 }));
    }
  }

  // --- Horarios (greedy sin cruces de aula ni de docente) ---
  const bloques = [["08:00", "09:30"], ["09:30", "11:00"], ["11:20", "12:50"], ["12:50", "14:00"]];
  const ocupado = new Set();
  for (const aula of aulas) {
    const delAula = cursos.filter((c) => String(c.aula) === String(aula._id));
    let k = 0;
    for (let dia = 1; dia <= 5; dia++) {
      for (const [ini, fin] of bloques) {
        for (let intento = 0; intento < delAula.length; intento++) {
          const c = delAula[(k + intento) % delAula.length];
          const kd = `d${c.docente}-${dia}-${ini}`;
          if (ocupado.has(kd)) continue;
          ocupado.add(kd);
          await Horario.create({ aula: aula._id, curso: c._id, dia, horaInicio: ini, horaFin: fin });
          k = (k + intento + 1) % delAula.length;
          break;
        }
      }
    }
  }

  // --- Asistencia: desde el inicio del año escolar hasta ayer ---
  const inicio = config.periodos[0].inicio;
  const ayer = new Date(Date.parse(`${f}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);
  const dias = inicio <= ayer ? diasHabiles(inicio, ayer) : [];
  const regs = [];
  for (const aula of aulas) {
    for (const e of estudiantesPorAula.get(String(aula._id))) {
      const responsable = Math.random() < 0.25 ? 0.8 : 0.93; // algunos faltan más
      for (const d of dias) {
        const estado = pesos([["P", responsable * 100], ["T", 5], ["F", 3], ["J", 1.5]]);
        const min = estado === "P" ? 20 + Math.floor(Math.random() * 25) : 46 + Math.floor(Math.random() * 30);
        regs.push({
          estudiante: e._id, aula: aula._id, fecha: d, estado,
          horaIngreso: "", metodo: estado === "J" ? "manual" : "clase", registradoPor: admin._id, _min: min,
        });
      }
    }
  }
  regs.forEach((r) => { delete r._min; });
  if (regs.length) await Asistencia.insertMany(regs, { ordered: false });

  // Listas por clase de los últimos 5 días hábiles (coherentes con la asistencia diaria)
  const horarios = await Horario.find({});
  const listas = [];
  for (const d of dias.slice(-5)) {
    const dia = new Date(`${d}T12:00:00Z`).getUTCDay();
    for (const aula of aulas) {
      const bloquesDia = horarios.filter((b) => String(b.aula) === String(aula._id) && b.dia === dia).sort((x, y) => x.horaInicio.localeCompare(y.horaInicio));
      bloquesDia.forEach((b, i) => {
        const curso = cursos.find((c) => String(c._id) === String(b.curso));
        listas.push({
          horario: b._id, curso: b.curso, aula: aula._id, docente: curso.docente, fecha: d, horaInicio: b.horaInicio,
          tomadaPor: curso.docente, tomadaEn: new Date(`${d}T${b.horaInicio}:00-05:00`),
          registros: estudiantesPorAula.get(String(aula._id)).map((e) => {
            const diario = regs.find((r) => String(r.estudiante) === String(e._id) && r.fecha === d)?.estado || "P";
            return { estudiante: e._id, estado: i === 0 ? diario : diario === "T" ? "P" : diario };
          }),
        });
      });
    }
  }
  if (listas.length) await AsistenciaClase.insertMany(listas, { ordered: false });

  // --- Calificaciones: periodos ya transcurridos ---
  const periodoActual = Configuracion.periodoDeFecha(config, f);
  const califs = [];
  for (const c of cursos) {
    for (const e of estudiantesPorAula.get(String(c.aula))) {
      const talento = Math.random();
      for (let p = 1; p <= periodoActual; p++) {
        if (p === periodoActual && Math.random() < 0.5) continue; // periodo en curso: parcial
        c.competencias.forEach((_, i) => {
          const nivel = talento > 0.8 ? pesos([["AD", 6], ["A", 4]]) : talento > 0.3 ? pesos([["A", 7], ["AD", 1], ["B", 2]]) : pesos([["B", 6], ["A", 2], ["C", 2]]);
          califs.push({ curso: c._id, estudiante: e._id, periodo: p, competencia: i, nivel, registradaPor: c.docente,
            conclusion: i === 0 && nivel === "C" ? "Requiere acompañamiento para consolidar los aprendizajes de esta competencia." : "" });
        });
      }
    }
  }
  await Calificacion.insertMany(califs, { ordered: false });

  // --- Tareas y entregas ---
  const masDias = (n) => new Date(Date.parse(`${f}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
  for (const c of cursos) {
    const t1 = await Tarea.create({ curso: c._id, titulo: `Práctica dirigida de ${c.nombre}`, descripcion: "Resuelve los ejercicios del material compartido en clase y sube tu desarrollo.", fechaEntrega: masDias(-5), periodo: periodoActual, autor: c.docente });
    await Tarea.create({ curso: c._id, titulo: `Proyecto bimestral: ${c.nombre}`, descripcion: "Elabora un organizador visual sobre el tema trabajado. Puedes compartir un enlace de Google Drive o Canva.", fechaEntrega: masDias(6), periodo: periodoActual, autor: c.docente });
    for (const e of estudiantesPorAula.get(String(c.aula))) {
      if (Math.random() < 0.75) {
        await Entrega.create({ tarea: t1._id, estudiante: e._id, respuesta: "Adjunto mi desarrollo de la práctica.", enlace: "https://drive.google.com/", nivel: Math.random() < 0.6 ? azar(["AD", "A", "A", "B"]) : "" });
      }
    }
  }

  // --- Pensiones: cronograma marzo-diciembre; la mayoría al día ---
  const mesActual = Number(f.slice(5, 7));
  const pens = [];
  for (const lista of estudiantesPorAula.values()) {
    for (const e of lista) {
      const moroso = Math.random() < 0.2;
      const becado = Math.random() < 0.15;
      for (const mes of [0, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]) {
        const venc = mes === 0 ? `${anio}-03-01` : `${anio}-${String(mes).padStart(2, "0")}-${mes === 2 ? 28 : 30}`;
        const pagado = mes === 0 || mes < mesActual - (moroso ? 2 : 0);
        pens.push({
          estudiante: e._id, anio, mes, concepto: mes === 0 ? `Matrícula ${anio}` : `Pensión ${["", "", "", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"][mes]}`,
          monto: mes === 0 ? config.montoMatricula : config.montoPension, descuento: becado && mes > 0 ? 70 : 0, vencimiento: venc,
          estado: pagado ? "pagado" : "pendiente", fechaPago: pagado ? venc : "", metodo: pagado ? azar(["Yape", "Efectivo", "Transferencia BCP"]) : "", registradoPor: admin._id,
        });
      }
    }
  }
  await Pension.insertMany(pens);

  // --- Justificaciones pendientes ---
  const unEst = estudiantesPorAula.get(String(aulas[0]._id))[1];
  await Justificacion.create({ estudiante: unEst._id, fecha: dias[dias.length - 1] || f, motivo: "Mi hijo tuvo cita médica en el Hospital Hugo Pesce. Adjunto constancia.", evidenciaUrl: "" });

  // --- Comunicados y agenda ---
  await Comunicado.create({ titulo: "Bienvenidos a la nueva intranet ADUNI+", contenido: "Desde hoy pueden consultar notas por competencias, asistencia, horario, tareas y estado de cuenta desde la intranet.", destinatarios: "todos", importante: true, autor: admin._id });
  await Comunicado.create({ titulo: "Reunión de padres de familia - IV Bimestre", contenido: "Se convoca a los padres de familia a la reunión informativa en el auditorio del colegio.", destinatarios: "estudiante", autor: admin._id });
  await Comunicado.create({ titulo: "Entrega de registros auxiliares", contenido: "Recordamos a los docentes registrar las calificaciones del bimestre en la intranet antes del cierre.", destinatarios: "profesor", autor: admin._id });
  await Evento.insertMany([
    { titulo: "Combate de Angamos (feriado)", fecha: `${anio}-10-08`, tipo: "feriado" },
    { titulo: "Simulacro de examen de admisión", fecha: masDias(9), tipo: "examen" },
    { titulo: "Reunión de padres de familia", fecha: masDias(14), tipo: "reunion" },
    { titulo: "Día de Todos los Santos (feriado)", fecha: `${anio}-11-01`, tipo: "feriado" },
    { titulo: "Feria de Ciencias ADUNI+", fecha: `${anio}-11-20`, tipo: "actividad" },
    { titulo: "Inmaculada Concepción (feriado)", fecha: `${anio}-12-08`, tipo: "feriado" },
    { titulo: "Clausura del año escolar", fecha: `${anio}-12-18`, tipo: "academico" },
  ]);

  // --- Cuentas de apoderados (portal de familias) ---
  let apGuardados = 0;
  const aulaChica = String(aulas.find((x) => x.nivel === "primaria" && x.grado < 5)?._id);
  for (const [idAula, lista] of estudiantesPorAula.entries()) {
    if (idAula === aulaChica) apGuardados = 0; // guarda también una familia de un alumno sin cuenta propia
    for (const e of lista) {
      const password = clave();
      const partes = e.apoderado.nombre.split(" ");
      const ap = await Usuario.create({
        rol: "apoderado", dni: e.apoderado.dni, celular: e.apoderado.celular, nombres: partes[0], apellidos: partes.slice(1).join(" ") || "-",
        hijos: [e._id], password, codigo: await generarCodigo("apoderado"), debeCambiarPassword: false,
      });
      if (apGuardados++ < (idAula === aulaChica ? 1 : 2)) credenciales.push(`${ap.codigo.padEnd(10)} ${password}  [apoderado] ${ap.nombre} (DNI ${ap.dni}) → ${e.nombre}${idAula === aulaChica ? " (2.° primaria, sin cuenta propia)" : ""}`);
    }
  }

  // --- Recibos de los pagos ya registrados ---
  const pagadas = await Pension.find({ estado: "pagado" }).sort({ fechaPago: 1 });
  await Recibo.insertMany(pagadas.map((p, i) => ({
    serie: "R001", numero: i + 1, estudiante: p.estudiante, pensiones: [p._id], conceptos: [{ concepto: p.concepto, monto: p.monto - p.descuento }],
    total: p.monto - p.descuento, metodo: p.metodo, fecha: p.fechaPago, hora: "09:15", cajero: admin._id,
  })));
  await Contador.updateOne({ _id: "recibo-R001" }, { valor: pagadas.length }, { upsert: true });

  // --- Conducta ---
  const est1 = [...estudiantesPorAula.values()][0];
  await Incidencia.insertMany([
    { estudiante: est1[0]._id, aula: aulas[0]._id, tipo: "merito", categoria: "Participación", descripcion: "Destacada participación en la feria de ciencias.", fecha: masDias(-10), registradoPor: dCie._id },
    { estudiante: est1[2]._id, aula: aulas[0]._id, tipo: "demerito", categoria: "Uniforme", descripcion: "Asistió sin uniforme completo.", fecha: masDias(-3), registradoPor: dMat._id },
    { estudiante: est1[4]._id, aula: aulas[0]._id, tipo: "incidencia", categoria: "Convivencia", descripcion: "Discusión con un compañero durante el recreo; se conversó con ambos.", fecha: masDias(-1), registradoPor: dMat._id },
  ]);

  // --- Aula virtual ---
  for (const c of cursos.slice(0, 6)) {
    await Material.insertMany([
      { curso: c._id, unidad: "Unidad 4", tipo: "anuncio", titulo: "Bienvenidos al IV bimestre", descripcion: "Revisen los materiales de la unidad antes de cada clase.", autor: c.docente },
      { curso: c._id, unidad: "Unidad 4", tipo: "video", titulo: `Video de repaso: ${c.nombre}`, url: "https://www.youtube.com/results?search_query=" + encodeURIComponent(c.nombre + " secundaria repaso"), autor: c.docente },
      { curso: c._id, unidad: "Unidad 4", tipo: "enlace", titulo: "Recursos de Aprendo en Casa (MINEDU)", url: "https://aprendoencasa.pe", autor: c.docente },
    ]);
  }

  // --- Examen en línea (disponible hoy) ---
  const cMat = cursos.find((c) => c.nombre === "Matemática" && String(c.aula) === String(aulas[0]._id));
  const ahora = Date.now();
  await Examen.create({
    curso: cMat._id, titulo: "Práctica calificada: fracciones y porcentajes", instrucciones: "Lee con atención. Tienes 20 minutos.",
    inicio: new Date(ahora - 3600e3), fin: new Date(ahora + 7 * 864e5), duracionMin: 20, publicado: true, autor: dMat._id,
    preguntas: [
      { enunciado: "¿Cuánto es el 25% de 80?", opciones: ["15", "20", "25", "40"], correcta: 1, puntaje: 2 },
      { enunciado: "Simplifica 12/18", opciones: ["2/3", "3/4", "6/9", "4/6"], correcta: 0, puntaje: 2 },
      { enunciado: "Si un producto cuesta S/ 50 y tiene 10% de descuento, ¿cuánto se paga?", opciones: ["S/ 40", "S/ 45", "S/ 48", "S/ 55"], correcta: 1, puntaje: 3 },
      { enunciado: "¿Qué fracción es equivalente a 0,75?", opciones: ["1/4", "2/3", "3/4", "7/5"], correcta: 2, puntaje: 3 },
    ],
  });

  // --- Asistencia del personal (últimos días) ---
  for (const d of docentes) {
    for (const f2 of dias.slice(-5)) {
      await AsistenciaPersonal.create({ usuario: d._id, fecha: f2, horaIngreso: `07:${String(20 + Math.floor(Math.random() * 30)).padStart(2, "0")}`, horaSalida: "14:10", estado: "P" });
    }
  }

  // --- Noticias de la web ---
  await Noticia.insertMany([
    { titulo: "Matrículas abiertas 2027", slug: "matriculas-abiertas-2027", resumen: "Inicia el proceso de admisión 2027 para primaria y secundaria. Postula en línea.", contenido: "Ya puedes registrar la postulación de tu hijo desde nuestra web, subir sus documentos y hacer seguimiento con tu código.", fecha: masDias(-6), publicada: true, autor: admin._id },
    { titulo: "Feria de Ciencias ADUNI+", slug: "feria-de-ciencias", resumen: "Nuestros estudiantes presentaron proyectos de investigación e innovación.", contenido: "Los estudiantes de primaria y secundaria expusieron más de 20 proyectos.", fecha: masDias(-17), publicada: true, autor: admin._id },
    { titulo: "Olimpiadas deportivas interescolares", slug: "olimpiadas-deportivas", resumen: "Las delegaciones de ADUNI+ participaron con excelentes resultados.", contenido: "Felicitamos a todos los participantes.", fecha: masDias(-32), publicada: true, autor: admin._id },
  ]);

  // --- Admisión y pago reportado de ejemplo ---
  await Postulacion.create({
    codigoSeguimiento: "ADM-DEMO01", anio: anio + 1, nivel: "secundaria", grado: 1,
    postulante: { nombres: "Adriana", apellidos: "Ccoicca Rojas", dni: "78451236", fechaNacimiento: `${anio - 11}-04-12`, sexo: "F", colegioProcedencia: "I.E. N.° 54004" },
    apoderado: { nombre: "Ruth Rojas Medina", parentesco: "Madre", dni: "43652147", celular: "987123456", email: "" },
    comentario: "Deseamos una cita para conocer el colegio.",
  });
  const moroso = await Pension.findOne({ estado: "pendiente", vencimiento: { $lt: f } });
  if (moroso) {
    await PagoReportado.create({
      estudiante: moroso.estudiante, reportadoPor: (await Usuario.findOne({ rol: "apoderado", hijos: moroso.estudiante }))._id, pensiones: [moroso._id],
      monto: moroso.monto - moroso.descuento, metodo: "Yape", operacion: "00123456", fechaPago: f, comprobanteUrl: "https://res.cloudinary.com/demo/image/upload/sample.jpg",
    });
  }

  fs.writeFileSync(path.join(__dirname, "..", ".seed-credenciales.txt"),
    "Ingreso: código + contraseña (también funciona correo o DNI)\n\n" + credenciales.join("\n") + "\n");
  console.log(`Listo: ${aulas.length} aulas, ${docentes.length} docentes, ${estudiantesPorAula.size * 8} estudiantes, ${cursos.length} cursos, ${regs.length} asistencias, ${califs.length} calificaciones.`);
  console.log("Credenciales de demo guardadas en .seed-credenciales.txt");
  await mongoose.disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
