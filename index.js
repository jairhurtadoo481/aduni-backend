const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const conectarDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const productoRoutes = require("./routes/productoRoutes");
const reservaRoutes = require("./routes/reservaRoutes");
const ventaRoutes = require("./routes/ventaRoutes");
const configuracionRoutes = require("./routes/configuracionRoutes");
const usuarioRoutes = require("./routes/usuarioRoutes");
const turnoRoutes = require("./routes/turnoRoutes");
const facturacionRoutes = require("./routes/facturacionRoutes");
const reclamoRoutes = require("./routes/reclamoRoutes");

conectarDB();

const app = express();
app.set("trust proxy", 1);

app.use(cors({ exposedHeaders: ["X-Facturacion-Token"] }));
app.use(express.json());

app.get("/", (req, res) => {
  res.send("API Zapatillas Marcelo funcionando");
});

app.use("/api/auth", authRoutes);
app.use("/api/productos", productoRoutes);
app.use("/api/reservas", reservaRoutes);
app.use("/api/ventas", ventaRoutes);
app.use("/api/configuracion", configuracionRoutes);
app.use("/api/usuarios", usuarioRoutes);
app.use("/api/turnos", turnoRoutes);
app.use("/api/facturacion", facturacionRoutes);
app.use("/api/reclamos", reclamoRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});
