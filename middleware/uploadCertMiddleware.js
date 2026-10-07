const multer = require("multer");

const storage = multer.memoryStorage();

const uploadCert = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 },
});

module.exports = uploadCert;
