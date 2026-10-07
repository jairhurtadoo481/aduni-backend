const cloudinary = require("./cloudinary");
const streamifier = require("streamifier");

const subirImagen = (buffer, carpeta = "zapatillas-marcelo/productos") => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: carpeta },
      (error, resultado) => {
        if (error) return reject(error);
        resolve(resultado);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

const subirArchivo = (buffer, carpeta, nombrePublico) => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: carpeta, public_id: nombrePublico, resource_type: "raw", overwrite: true },
      (error, resultado) => {
        if (error) return reject(error);
        resolve(resultado);
      }
    );
    streamifier.createReadStream(buffer).pipe(uploadStream);
  });
};

module.exports = subirImagen;
module.exports.subirArchivo = subirArchivo;
