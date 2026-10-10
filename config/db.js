const mongoose = require("mongoose");

// Conecta a MongoDB y, si la red falla, reintenta cada 10 s en lugar de apagar el servidor.
const conectarDB = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 30000 });
    console.log("MongoDB conectado correctamente");
  } catch (error) {
    console.error(`Error al conectar MongoDB (${error.message}). Reintentando en 10 s...`);
    setTimeout(conectarDB, 10000);
  }
};

mongoose.connection.on("disconnected", () => console.warn("MongoDB desconectado; el driver reintentará automáticamente"));

module.exports = conectarDB;
