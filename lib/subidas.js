const multer = require("multer");
const cloudinary = require("../config/cloudinary");
const streamifier = require("streamifier");

const PERMITIDOS = [
  "image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation",
];

// Archivos en memoria (máx. 10 MB) para enviarlos a Cloudinary.
const recibirArchivo = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (PERMITIDOS.includes(file.mimetype) ? cb(null, true) : cb(new Error("Tipo de archivo no permitido (usa imagen, PDF, Word, Excel o PowerPoint)"))),
});

const recibirExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => (/\.xlsx$/i.test(file.originalname) ? cb(null, true) : cb(new Error("Sube un archivo Excel .xlsx"))),
});

const subirACloudinary = (file, carpeta) =>
  new Promise((resolve, reject) => {
    const esImagen = file.mimetype.startsWith("image/");
    const stream = cloudinary.uploader.upload_stream(
      { folder: `aduni/${carpeta}`, resource_type: esImagen ? "image" : "raw", use_filename: true, unique_filename: true },
      (error, r) => (error ? reject(error) : resolve({ url: r.secure_url, nombre: file.originalname, tipo: file.mimetype, tamano: file.size }))
    );
    streamifier.createReadStream(file.buffer).pipe(stream);
  });

// Middleware que convierte errores de multer en respuestas 400.
const manejarSubida = (mw) => (req, res, next) =>
  mw(req, res, (err) => (err ? res.status(400).json({ mensaje: err.code === "LIMIT_FILE_SIZE" ? "El archivo supera el tamaño permitido" : err.message }) : next()));

module.exports = { recibirArchivo, recibirExcel, subirACloudinary, manejarSubida };
