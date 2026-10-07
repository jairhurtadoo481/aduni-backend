const Reserva = require("../models/Reserva");
const Usuario = require("../models/Usuario");
const Producto = require("../models/Producto");
const Configuracion = require("../models/Configuracion");
const subirImagen = require("../config/cloudinaryUpload");

const nombreSucursal = {
  sucursal1: "Sucursal 1",
  sucursal2: "Sucursal 2",
};

const obtenerSiguienteNumero = async () => {
  const ultima = await Reserva.findOne({ numero: { $exists: true, $type: "number" } }).sort({ numero: -1 });
  return ultima ? ultima.numero + 1 : 1001;
};

const crearReserva = async (req, res) => {
  try {
    const { items, cliente, metodoPago, aceptoTerminos, versionTerminos } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ mensaje: "La reserva debe tener al menos un producto" });
    }

    if (!cliente || !cliente.nombre || !cliente.celular || !cliente.ciudad) {
      return res.status(400).json({ mensaje: "Faltan datos obligatorios del cliente" });
    }

    if (cliente.entregaDomicilio && !cliente.direccion) {
      return res.status(400).json({ mensaje: "Falta la direccion para la entrega a domicilio" });
    }

    if (!metodoPago || !["yape", "plin", "bcp"].includes(metodoPago)) {
      return res.status(400).json({ mensaje: "Debes indicar un metodo de pago valido (yape, plin o bcp)" });
    }

    let total = 0;
    let requierePagoCompleto = false;
    const itemsProcesados = [];

    for (const item of items) {
      const producto = await Producto.findById(item.producto);
      if (!producto) {
        return res.status(404).json({ mensaje: `Producto no encontrado: ${item.producto}` });
      }

      const ahora = new Date();
      const ofertaActiva =
        producto.precioOferta !== null &&
        producto.precioOferta !== undefined &&
        producto.ofertaInicio &&
        producto.ofertaFin &&
        ahora >= new Date(producto.ofertaInicio) &&
        ahora <= new Date(producto.ofertaFin);

      const precioUnitario = ofertaActiva ? producto.precioOferta : producto.precio;

      if (ofertaActiva) requierePagoCompleto = true;

      total += precioUnitario * item.cantidad;

      itemsProcesados.push({
        producto: producto._id,
        nombre: producto.nombre,
        codigo: producto.codigo || "",
        imagen: producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes[0] : null,
        sucursal: producto.sucursal || "sucursal1",
        talla: item.talla,
        cantidad: item.cantidad,
        precioUnitario,
        tieneOferta: ofertaActiva,
      });
    }

    const numero = await obtenerSiguienteNumero();

    const reserva = new Reserva({
      numero,
      tipo: "web",
      items: itemsProcesados,
      cliente,
      metodoPago,
      total,
      requierePagoCompleto,
      aceptoTerminosEn: aceptoTerminos === true ? new Date() : null,
      versionTerminos: aceptoTerminos === true ? String(versionTerminos || "").slice(0, 40) : "",
    });

    await reserva.save();
    res.status(201).json(reserva);
  } catch (error) {
    res.status(400).json({ mensaje: "Error al crear reserva", error: error.message });
  }
};

const crearReservaMayorista = async (req, res) => {
  try {
    const usuarioMayorista = await Usuario.findById(req.usuarioId);
    if (!usuarioMayorista) {
      return res.status(404).json({ mensaje: "Usuario no encontrado" });
    }

    const { items, notas } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ mensaje: "La reserva debe tener al menos un producto" });
    }

    const config = await Configuracion.findOne();
    const minimoRequerido = config ? config.minimoMayorista : 10;

    const cantidadTotal = items.reduce((acc, item) => acc + Number(item.cantidad || 0), 0);
    if (cantidadTotal < minimoRequerido) {
      return res.status(400).json({
        mensaje: `La cantidad minima para reserva mayorista es de ${minimoRequerido} pares. Tienes ${cantidadTotal}.`,
      });
    }

    let total = 0;
    const itemsProcesados = [];

    for (const item of items) {
      const producto = await Producto.findById(item.producto);
      if (!producto) {
        return res.status(404).json({ mensaje: `Producto no encontrado: ${item.producto}` });
      }

      if (producto.precioMayorista === null || producto.precioMayorista === undefined) {
        return res.status(400).json({
          mensaje: `El producto "${producto.nombre}" no tiene precio mayorista configurado`,
        });
      }

      const precioUnitario = producto.precioMayorista;
      total += precioUnitario * item.cantidad;

      itemsProcesados.push({
        producto: producto._id,
        nombre: producto.nombre,
        codigo: producto.codigo || "",
        imagen: producto.imagenes && producto.imagenes.length > 0 ? producto.imagenes[0] : null,
        sucursal: producto.sucursal || "sucursal1",
        talla: item.talla,
        cantidad: item.cantidad,
        precioUnitario,
        tieneOferta: false,
      });
    }

    const numero = await obtenerSiguienteNumero();

    const reserva = new Reserva({
      numero,
      tipo: "mayorista",
      items: itemsProcesados,
      cliente: {
        nombre: usuarioMayorista.nombre,
        celular: usuarioMayorista.celular || "N/A",
        ciudad: "andahuaylas",
        entregaDomicilio: false,
        direccion: "",
      },
      metodoPago: null,
      total,
      requierePagoCompleto: false,
      notasMayorista: notas || "",
    });

    await reserva.save();
    res.status(201).json(reserva);
  } catch (error) {
    res.status(400).json({ mensaje: "Error al crear reserva mayorista", error: error.message });
  }
};

const subirComprobante = async (req, res) => {
  try {
    const reserva = await Reserva.findById(req.params.id);
    if (!reserva) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }

    if (!req.file) {
      return res.status(400).json({ mensaje: "No se envio ninguna imagen de comprobante" });
    }

    const resultado = await subirImagen(req.file.buffer, "zapatillas-marcelo/comprobantes");
    reserva.comprobante = resultado.secure_url;
    await reserva.save();

    res.json(reserva);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al subir comprobante", error: error.message });
  }
};

const obtenerReservas = async (req, res) => {
  try {
    const filtro = {};

    if (req.query.tipo) {
      filtro.tipo = req.query.tipo;
    }

    if (req.query.historial === "true") {
      filtro.estado = "entregado";
    } else {
      filtro.estado = { $ne: "entregado" };
    }

    const reservas = await Reserva.find(filtro).sort({ createdAt: -1 });
    res.json(reservas);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al obtener reservas", error: error.message });
  }
};

const actualizarEstadoReserva = async (req, res) => {
  try {
    const { estado } = req.body;
    const estadosValidos = ["pendiente", "atendido", "listo_recoger", "entregado", "suspendido"];

    if (!estadosValidos.includes(estado)) {
      return res.status(400).json({ mensaje: "Estado invalido" });
    }

    const reserva = await Reserva.findByIdAndUpdate(
      req.params.id,
      { estado },
      { new: true }
    );

    if (!reserva) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }

    res.json(reserva);
  } catch (error) {
    res.status(500).json({ mensaje: "Error al actualizar reserva", error: error.message });
  }
};

const mensajeEstado = {
  pendiente: "Tu pago esta siendo verificado.",
  atendido: "Estamos coordinando tu compra, en breve te llamaremos.",
  listo_recoger: "Tu pago fue confirmado. Ya puedes pasar a recoger tu pedido.",
  entregado: "Este pedido ya fue entregado. Gracias por tu compra!",
  suspendido: "Hubo un problema con este pedido, contactanos por WhatsApp.",
};

const seguimientoReserva = async (req, res) => {
  try {
    const { numero, celular } = req.query;

    if (!numero || !celular) {
      return res.status(400).json({ mensaje: "Debes indicar numero de pedido y celular" });
    }

    const reserva = await Reserva.findOne({
      numero: Number(numero),
      "cliente.celular": celular.trim(),
    });

    if (!reserva) {
      return res.status(404).json({ mensaje: "No se encontro ningun pedido con esos datos" });
    }

    const sucursales = [...new Set(reserva.items.map((i) => nombreSucursal[i.sucursal] || "Sucursal 1"))];

    res.json({
      numero: reserva.numero,
      estado: reserva.estado,
      mensaje: mensajeEstado[reserva.estado] || "",
      sucursales,
      total: reserva.total,
      items: reserva.items,
      createdAt: reserva.createdAt,
    });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al buscar el pedido", error: error.message });
  }
};

const eliminarReserva = async (req, res) => {
  try {
    const reserva = await Reserva.findByIdAndDelete(req.params.id);
    if (!reserva) {
      return res.status(404).json({ mensaje: "Reserva no encontrada" });
    }
    res.json({ mensaje: "Compra eliminada correctamente" });
  } catch (error) {
    res.status(500).json({ mensaje: "Error al eliminar la compra", error: error.message });
  }
};

module.exports = {
  crearReserva,
  crearReservaMayorista,
  subirComprobante,
  obtenerReservas,
  actualizarEstadoReserva,
  seguimientoReserva,
  eliminarReserva,
};