// Restaura un respaldo .zip generado por la intranet o por scripts/respaldo.js.
// Uso: node scripts/restaurar.js backups/respaldo-aduni-XXXX.zip --confirmar
// ATENCIÓN: reemplaza TODOS los datos actuales de cada colección incluida en el respaldo.
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env"), quiet: true });
const fs = require("fs");
const mongoose = require("mongoose");
const JSZip = require("jszip");

(async () => {
  const archivo = process.argv[2];
  if (!archivo || !fs.existsSync(archivo)) throw new Error("Indica la ruta del .zip de respaldo");
  if (!process.argv.includes("--confirmar")) {
    console.log("Esto REEMPLAZARÁ los datos actuales. Vuelve a ejecutar agregando --confirmar");
    return;
  }
  await mongoose.connect(process.env.MONGO_URI);
  const { EJSON } = mongoose.mongo.BSON;
  const zip = await JSZip.loadAsync(fs.readFileSync(archivo));
  for (const nombre of Object.keys(zip.files).filter((n) => n.endsWith(".json"))) {
    const coleccion = nombre.replace(/\.json$/, "");
    const docs = EJSON.parse(await zip.file(nombre).async("string"), { relaxed: false });
    const col = mongoose.connection.db.collection(coleccion);
    await col.deleteMany({});
    if (docs.length) await col.insertMany(docs);
    console.log(`${coleccion}: ${docs.length} documentos`);
  }
  console.log("Restauración terminada");
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
