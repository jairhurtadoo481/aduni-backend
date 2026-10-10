const express = require("express");
const router = express.Router();
const protegerRuta = require("../middleware/authMiddleware");
const { soloAdmin, soloProfesor, soloEstudiante, soloRol, soloArea, soloSoporte } = require("../middleware/authMiddleware");
const { recibirArchivo, recibirExcel, manejarSubida } = require("../lib/subidas");
const comun = require("../controllers/intranet/comun");
const serv = require("../controllers/intranet/servicios");
const est = require("../controllers/intranet/estudiante");
const doc = require("../controllers/intranet/docente");
const docx = require("../controllers/intranet/docenteExtra");
const asis = require("../controllers/intranet/asistenciaClase");
const adm = require("../controllers/intranet/admin");
const admx = require("../controllers/intranet/adminExtra");
const fac = require("../controllers/intranet/facturacion");
const sop = require("../controllers/intranet/soporte");

const familia = soloRol("estudiante", "apoderado");
const subir = manejarSubida(recibirArchivo.single("archivo"));

router.use(protegerRuta);

// ---------- Comunes a todos los portales ----------
router.get("/yo", comun.yo);
router.put("/perfil", comun.actualizarPerfil);
router.put("/password", comun.cambiarPassword);
router.get("/comunicados", comun.listarComunicados);
router.get("/eventos", comun.listarEventos);
router.get("/config", comun.verConfig);
router.get("/notificaciones", serv.misNotificaciones);
router.put("/notificaciones/leer", serv.marcarLeidas);
router.get("/push/clave", serv.clavePush);
router.post("/push/suscribir", serv.suscribirPush);
router.post("/archivos", subir, serv.subirArchivo);
router.post("/foto", subir, serv.subirFoto);
router.post("/2fa/iniciar", serv.iniciar2FA);
router.post("/2fa/activar", serv.activar2FA);
router.post("/2fa/desactivar", serv.desactivar2FA);
router.get("/mensajes/contactos", serv.contactos);
router.get("/mensajes/sin-leer", serv.mensajesSinLeer);
router.get("/mensajes", serv.conversaciones);
router.get("/mensajes/:id", serv.hilo);
router.post("/mensajes", serv.enviarMensaje);
// Mesa de ayuda: cualquier usuario reporta un problema a soporte técnico
router.get("/ayuda/tickets", sop.misTickets);
router.post("/ayuda/tickets", sop.crearTicket);
router.post("/ayuda/tickets/:id/responder", sop.responderMiTicket);

// ---------- Soporte técnico ----------
router.get("/soporte/estado", soloSoporte, sop.estadoSistema);
router.get("/soporte/tickets", soloSoporte, sop.listarTickets);
router.put("/soporte/tickets/:id", soloSoporte, sop.actualizarTicket);
router.post("/soporte/tickets/:id/responder", soloSoporte, sop.responderTicket);
router.get("/soporte/errores", soloSoporte, sop.errores);
router.put("/soporte/mantenimiento", soloSoporte, sop.mantenimiento);

// ---------- Estudiante y familia (el apoderado agrega ?hijo=) ----------
router.get("/familia/hijos", soloRol("apoderado"), est.hijos);
router.get("/estudiante/resumen", familia, est.resumen);
router.get("/estudiante/horario", familia, est.horario);
router.get("/estudiante/calificaciones", familia, est.calificaciones);
router.get("/estudiante/libreta.pdf", familia, est.libretaPdf);
router.get("/estudiante/asistencia", familia, est.asistencia);
router.get("/estudiante/justificaciones", familia, est.misJustificaciones);
router.post("/estudiante/justificaciones", familia, est.crearJustificacion);
router.get("/estudiante/tareas", familia, est.tareas);
router.put("/estudiante/tareas/:id/entrega", familia, est.entregarTarea);
router.get("/estudiante/pagos", familia, est.pagos);
router.post("/estudiante/pagos/reportar", familia, est.reportarPago);
router.get("/estudiante/recibos/:id/pdf", familia, est.reciboPdf);
router.get("/estudiante/comprobantes/:id/pdf", familia, est.comprobantePdf);
router.get("/estudiante/carnet", familia, est.carnet);
router.get("/estudiante/incidencias", familia, est.incidencias);
router.get("/estudiante/aula-virtual", familia, est.aulaVirtual);
router.get("/estudiante/aula-virtual/:id", familia, est.materialesCurso);
router.get("/estudiante/examenes", familia, est.examenes);
router.post("/estudiante/examenes/:id/iniciar", soloEstudiante, est.iniciarExamen);
router.put("/estudiante/examenes/:id/respuestas", soloEstudiante, est.guardarRespuestas);
router.post("/estudiante/examenes/:id/enviar", soloEstudiante, est.enviarExamen);

// ---------- Docente ----------
router.get("/docente/resumen", soloProfesor, doc.resumen);
router.get("/docente/cursos", soloProfesor, doc.misCursos);
router.get("/docente/horario", soloProfesor, doc.horario);
router.get("/docente/aulas", soloProfesor, doc.misAulas);
router.get("/docente/asistencia", soloProfesor, doc.verAsistencia); // lista de estudiantes de un aula
router.get("/docente/clases", soloProfesor, asis.misClases);
router.get("/docente/clases/:id/asistencia", soloProfesor, asis.verLista);
router.put("/docente/clases/:id/asistencia", soloProfesor, asis.guardarLista);
router.get("/docente/mi-asistencia", soloProfesor, docx.miAsistencia);
router.get("/docente/cursos/:id/registro", soloProfesor, doc.verRegistro);
router.put("/docente/cursos/:id/registro", soloProfesor, doc.guardarRegistro);
router.get("/docente/cursos/:id/materiales", soloProfesor, docx.materiales);
router.post("/docente/cursos/:id/materiales", soloProfesor, docx.crearMaterial);
router.delete("/docente/materiales/:id", soloProfesor, docx.eliminarMaterial);
router.get("/docente/tareas", soloProfesor, doc.misTareas);
router.post("/docente/tareas", soloProfesor, doc.crearTarea);
router.delete("/docente/tareas/:id", soloProfesor, doc.eliminarTarea);
router.get("/docente/tareas/:id/entregas", soloProfesor, doc.entregasDeTarea);
router.put("/docente/entregas/:id", soloProfesor, doc.calificarEntrega);
router.get("/docente/examenes", soloProfesor, docx.misExamenes);
router.post("/docente/examenes", soloProfesor, docx.crearExamen);
router.get("/docente/examenes/:id", soloProfesor, docx.verExamen);
router.put("/docente/examenes/:id", soloProfesor, docx.actualizarExamen);
router.put("/docente/examenes/:id/publicar", soloProfesor, docx.publicarExamen);
router.delete("/docente/examenes/:id", soloProfesor, docx.eliminarExamen);
router.get("/docente/examenes/:id/resultados", soloProfesor, docx.resultadosExamen);
router.get("/docente/incidencias", soloProfesor, docx.verIncidencias);
router.post("/docente/incidencias", soloRol("profesor", "administrativo"), docx.crearIncidencia);
router.delete("/docente/incidencias/:id", soloRol("profesor", "administrativo"), docx.eliminarIncidencia);
router.get("/docente/alertas", soloProfesor, docx.alertas);
router.get("/docente/tutoria/libretas.pdf", soloProfesor, docx.libretasTutoria);

// ---------- Administrativo (por áreas; Dirección entra a todo) ----------
const DIR = soloArea(); // solo Dirección
const SEC = soloArea("secretaria");
const TES = soloArea("tesoreria");
const COO = soloArea("coordinacion");
const AUX = soloArea("auxiliar");
const ACAD = soloArea("secretaria", "coordinacion");
const TODOS = soloArea("secretaria", "tesoreria", "coordinacion", "auxiliar");

router.use("/admin", soloAdmin);
router.get("/admin/dashboard", TODOS, adm.dashboard);

// Usuarios: el controlador valida además qué tipo de cuenta puede gestionar cada área
router.get("/admin/usuarios", TODOS, adm.listarUsuarios);
router.post("/admin/usuarios", TODOS, adm.crearUsuario);
router.get("/admin/usuarios/:id", TODOS, adm.verUsuario);
router.put("/admin/usuarios/:id", TODOS, adm.actualizarUsuario);
router.post("/admin/usuarios/:id/restablecer", TODOS, adm.restablecerPassword);
router.put("/admin/usuarios/:id/estado", TODOS, adm.cambiarEstadoUsuario);
router.post("/admin/usuarios/:id/desbloquear", TODOS, adm.desbloquearCuenta);
router.post("/admin/usuarios/:id/cerrar-sesiones", TODOS, adm.cerrarSesiones);
router.post("/admin/usuarios/:id/quitar-2fa", TODOS, adm.quitar2FA);
router.get("/admin/usuarios/:id/libreta.pdf", ACAD, admx.libretaEstudiante);
router.put("/admin/apoderados/:id/hijos", SEC, admx.actualizarHijos);
router.post("/admin/apoderados/generar", SEC, admx.generarApoderados);
router.get("/admin/importar/plantilla", SEC, admx.plantilla);
router.post("/admin/importar/estudiantes", SEC, manejarSubida(recibirExcel.single("archivo")), admx.importarEstudiantes);

// Organización académica
router.get("/admin/aulas", TODOS, adm.listarAulas);
router.post("/admin/aulas", ACAD, adm.crearAula);
router.put("/admin/aulas/:id", ACAD, adm.actualizarAula);
router.get("/admin/aulas/:id/libretas.pdf", ACAD, admx.libretasAula);
router.get("/admin/aulas/:id/notas.xlsx", ACAD, admx.notasExcel);
router.get("/admin/carnes.pdf", SEC, admx.carnes);
router.get("/admin/curriculo", ACAD, adm.curriculo);
router.get("/admin/cursos", TODOS, adm.listarCursos);
router.post("/admin/cursos", ACAD, adm.crearCurso);
router.put("/admin/cursos/:id", ACAD, adm.actualizarCurso);
router.delete("/admin/cursos/:id", ACAD, adm.eliminarCurso);
router.get("/admin/horarios", TODOS, adm.listarHorario);
router.post("/admin/horarios", ACAD, adm.crearBloque);
router.delete("/admin/horarios/:id", ACAD, adm.eliminarBloque);

// Asistencia y disciplina
router.post("/admin/asistencia/marcar", soloArea("auxiliar", "secretaria"), adm.marcarIngreso);
router.get("/admin/asistencia/dia", soloArea("auxiliar", "coordinacion", "secretaria"), adm.asistenciaDelDia);
router.get("/admin/asistencia/aula", soloArea("auxiliar", "coordinacion", "secretaria"), adm.detalleAsistenciaAula);
router.get("/admin/asistencia/clases", soloArea("auxiliar", "coordinacion"), asis.gradillaAula);
router.put("/admin/asistencia/clases/:id", AUX, asis.corregirCelda);
router.get("/admin/asistencia/control", soloArea("auxiliar", "coordinacion"), asis.controlDocentes);
router.get("/admin/asistencia/personal", soloArea("auxiliar", "coordinacion"), admx.asistenciaPersonal);
router.post("/admin/asistencia/personal/cerrar", AUX, asis.cerrarDiaPersonal);
router.put("/admin/asistencia/personal", AUX, asis.corregirPersonal);
router.put("/admin/asistencia", AUX, adm.corregirAsistencia);
router.get("/admin/asistencia/reporte", soloArea("auxiliar", "coordinacion"), adm.reporteAsistencia);
router.get("/admin/justificaciones", soloArea("auxiliar", "coordinacion"), adm.listarJustificaciones);
router.put("/admin/justificaciones/:id", AUX, adm.resolverJustificacion);
router.get("/admin/incidencias", soloArea("auxiliar", "coordinacion"), admx.incidencias);
router.get("/admin/alertas", soloArea("coordinacion", "auxiliar"), admx.alertas);
router.get("/admin/reportes", soloArea("coordinacion", "tesoreria"), admx.reportes);

// Tesorería
router.post("/admin/pensiones/generar", TES, adm.generarPensiones);
router.get("/admin/pensiones", TES, adm.listarPensiones);
router.put("/admin/pensiones/:id/pagar", TES, adm.pagarPension);
router.put("/admin/pensiones/:id/anular", TES, adm.anularPago);
router.put("/admin/pensiones/:id", TES, adm.actualizarPension);
router.get("/admin/pagos-reportados", TES, admx.listarVouchers);
router.put("/admin/pagos-reportados/:id", TES, admx.resolverVoucher);
router.get("/admin/caja", TES, admx.caja);
router.get("/admin/recibos/:id/pdf", TES, admx.reciboPdfAdmin);
router.put("/admin/recibos/:id/anular", TES, admx.anularRecibo);
router.get("/admin/facturacion/config", TES, fac.verConfig);
router.put("/admin/facturacion/config", DIR, fac.guardarConfig);
router.get("/admin/facturacion/comprobantes", TES, fac.listar);
router.post("/admin/facturacion/emitir", TES, fac.emitirDesdeRecibo);
router.post("/admin/facturacion/comprobantes/:id/anular", TES, fac.anular);
router.post("/admin/facturacion/comprobantes/:id/reenviar", TES, fac.reintentar);
router.get("/admin/facturacion/comprobantes/:id/pdf", TES, fac.pdf);
router.get("/admin/facturacion/comprobantes/:id/xml", TES, (req, res) => { req.params.archivo = "xml"; fac.descargarXml(req, res); });
router.get("/admin/facturacion/comprobantes/:id/cdr", TES, (req, res) => { req.params.archivo = "cdr"; fac.descargarXml(req, res); });

// Comunicación, admisión y web
router.post("/admin/comunicados", ACAD, adm.crearComunicado);
router.delete("/admin/comunicados/:id", ACAD, adm.eliminarComunicado);
router.post("/admin/eventos", ACAD, adm.crearEvento);
router.delete("/admin/eventos/:id", ACAD, adm.eliminarEvento);
router.get("/admin/noticias", SEC, admx.listarNoticias);
router.post("/admin/noticias", SEC, admx.guardarNoticia);
router.put("/admin/noticias/:id", SEC, admx.guardarNoticia);
router.delete("/admin/noticias/:id", SEC, admx.eliminarNoticia);
router.get("/admin/postulaciones", SEC, admx.listarPostulaciones);
router.put("/admin/postulaciones/:id", SEC, admx.actualizarPostulacion);
router.post("/admin/postulaciones/:id/matricular", SEC, admx.matricularPostulante);

// Solo Dirección
router.get("/admin/auditoria", DIR, admx.auditoria);
router.get("/admin/seguridad", DIR, admx.seguridad);
router.get("/admin/respaldo", DIR, admx.respaldo);
router.get("/admin/configuracion", TODOS, adm.verConfiguracion);
router.put("/admin/configuracion", DIR, adm.guardarConfiguracion);

module.exports = router;
