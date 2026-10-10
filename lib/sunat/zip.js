const JSZip = require("jszip");

const crearZipComprobante = async (nombreArchivo, xmlFirmado) => {
  const zip = new JSZip();
  zip.file(`${nombreArchivo}.xml`, xmlFirmado);
  const buffer = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return buffer;
};

module.exports = { crearZipComprobante };
