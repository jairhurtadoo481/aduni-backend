const Reclamo = require("../models/Reclamo");
const Contador = require("../models/Contador");

const TIPOS_DOCUMENTO = ["DNI", "CE", "PASAPORTE", "RUC"];

const VALIDADORES_DOCUMENTO = {
  DNI: /^\d{8}$/,
  RUC: /^\d{11}$/,
  CE: /^[A-Za-z0-9]{9,12}$/,
  PASAPORTE: /^[A-Za-z0-9]{6,12}$/,
};

const limpiar = (valor, maximo) => String(valor ?? "").trim().slice(0, maximo);

const obtenerSiguienteNumero = async (anio) => {
  const contador = await Contador.findOneAndUpdate(
    { _id: `reclamo-${anio}` },
    { $inc: { valor: 1 } },
    { upsert: true, returnDocument: "after" }
  );
  return contador.valor;
};

const crearReclamo = async (req, res) => {
  try {
    const { tipo, consumidor = {}, esMenor, apoderado = {}, bien = {}, detalle, pedidoConsumidor, aceptaPrivacidad } = req.body;

    if (aceptaPrivacidad !== true) {
      return res.status(400).json({ mensaje: "Debes aceptar la Politica de Privacidad para enviar el reclamo" });
    }
    if (!["reclamo", "queja"].includes(tipo)) {
      return res.status(400).json({ mensaje: "Indica si es un reclamo o una queja" });
    }

    const datosConsumidor = {
      nombre: limpiar(consumidor.nombre, 120),
      tipoDocumento: limpiar(consumidor.tipoDocumento, 10).toUpperCase(),
      documento: limpiar(consumidor.documento, 20),
      domicilio: limpiar(consumidor.domicilio, 200),
      telefono: limpiar(consumidor.telefono, 20).replace(/[\s-]/g, ""),
      correo: limpiar(consumidor.correo, 120).toLowerCase(),
    };

    if (!datosConsumidor.nombre || !datosConsumidor.domicilio) {
      return res.status(400).json({ mensaje: "Completa tu nombre y tu domicilio" });
    }
    if (!TIPOS_DOCUMENTO.includes(datosConsumidor.tipoDocumento)) {
      return res.status(400).json({ mensaje: "Tipo de documento invalido" });
    }
    if (!VALIDADORES_DOCUMENTO[datosConsumidor.tipoDocumento].test(datosConsumidor.documento)) {
      return res.status(400).json({ mensaje: `El numero de ${datosConsumidor.tipoDocumento} no tiene un formato valido` });
    }
    if (!/^\+?\d{6,15}$/.test(datosConsumidor.telefono)) {
      return res.status(400).json({ mensaje: "El telefono no es valido" });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(datosConsumidor.correo)) {
      return res.status(400).json({ mensaje: "El correo electronico no es valido" });
    }

    const datosApoderado = { nombre: "", documento: "" };
    if (esMenor === true) {
      datosApoderado.nombre = limpiar(apoderado.nombre, 120);
      datosApoderado.documento = limpiar(apoderado.documento, 20);
      if (!datosApoderado.nombre || !datosApoderado.documento) {
        return res.status(400).json({ mensaje: "Para menores de edad indica el nombre y documento del padre, madre o tutor" });
      }
    }

    if (!["producto", "servicio"].includes(bien.tipo)) {
      return res.status(400).json({ mensaje: "Indica si el reclamo es sobre un producto o un servicio" });
    }
    const descripcionBien = limpiar(bien.descripcion, 300);
    const detalleReclamo = limpiar(detalle, 3000);
    const pedido = limpiar(pedidoConsumidor, 2000);
    if (!descripcionBien || !detalleReclamo || !pedido) {
      return res.status(400).json({ mensaje: "Completa la descripcion, el detalle y lo que solicitas" });
    }

    const monto = Number(bien.monto) || 0;
    if (monto < 0 || monto > 1000000) {
      return res.status(400).json({ mensaje: "El monto reclamado no es valido" });
    }

    const anio = new Date().getFullYear();
    const numero = await obtenerSiguienteNumero(anio);
    const codigo = `${String(numero).padStart(4, "0")}-${anio}`;

    const reclamo = await Reclamo.create({
      anio,
      numero,
      codigo,
      tipo,
      consumidor: datosConsumidor,
      esMenor: esMenor === true,
      apoderado: datosApoderado,
      bien: {
        tipo: bien.tipo,
        descripcion: descripcionBien,
        monto,
        numeroPedido: limpiar(bien.numeroPedido, 30),
      },
      detalle: detalleReclamo,
      pedidoConsumidor: pedido,
    });

    res.status(201).json(reclamo);
  } catch (error) {
    res.status(500).json({ mensaje: "No se pudo registrar el reclamo. Intenta de nuevo.", error: error.message });
  }
};

const listarReclamos = async (req, res) => {
  try {
    const filtro = {};
    if (req.query.estado === "pendiente" || req.query.estado === "respondido") {
      filtro.estado = req.query.estado;
    }
    const reclamos = await Reclamo.find(filtro).sort({ createdAt: -1 }).limit(300);
    res.json(reclamos);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al listar reclamos", error: error.message });
  }
};

const responderReclamo = async (req, res) => {
  try {
    const texto = limpiar(req.body.texto, 3000);
    if (!texto) {
      return res.status(400).json({ mensaje: "Escribe la respuesta dada al cliente" });
    }
    const reclamo = await Reclamo.findByIdAndUpdate(
      req.params.id,
      { estado: "respondido", "respuesta.texto": texto, "respuesta.fecha": new Date() },
      { returnDocument: "after" }
    );
    if (!reclamo) {
      return res.status(404).json({ mensaje: "Reclamo no encontrado" });
    }
    res.json(reclamo);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al guardar la respuesta", error: error.message });
  }
};

module.exports = { crearReclamo, listarReclamos, responderReclamo };
