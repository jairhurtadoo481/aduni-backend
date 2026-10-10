// Respaldo completo de la base de datos a un .zip en la carpeta backups/ (ignorada por git).
// Uso: node scripts/respaldo.js
// Programarlo a diario en Windows: Programador de tareas → "node C:\...\aduni-backend\scripts\respaldo.js"
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const JSZip = require("jszip");

(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const { EJSON } = mongoose.mongo.BSON;
  const zip = new JSZip();
  const colecciones = await mongoose.connection.db.listCollections().toArray();
  let total = 0;
  for (const c of colecciones) {
    const docs = await mongoose.connection.db.collection(c.name).find({}).toArray();
    total += docs.length;
    zip.file(`${c.name}.json`, EJSON.stringify(docs, { relaxed: false }));
  }
  const dir = path.join(__dirname, "..", "backups");
  fs.mkdirSync(dir, { recursive: true });
  const archivo = path.join(dir, `respaldo-aduni-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.zip`);
  fs.writeFileSync(archivo, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  // Conserva solo los 30 respaldos más recientes
  const viejos = fs.readdirSync(dir).filter((f) => f.startsWith("respaldo-aduni-")).sort().slice(0, -30);
  viejos.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  console.log(`Respaldo listo: ${archivo} (${colecciones.length} colecciones, ${total} documentos)`);
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
