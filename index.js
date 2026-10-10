const dotenv = require("dotenv");
dotenv.config();

const express = require("express");
const cors = require("cors");
const conectarDB = require("./config/db");
const authRoutes = require("./routes/authRoutes");
const intranetRoutes = require("./routes/intranetRoutes");
const publicoRoutes = require("./routes/publicoRoutes");
const reclamoRoutes = require("./routes/reclamoRoutes");
const { iniciarTareasProgramadas } = require("./lib/programadas");

conectarDB();

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/", (req, res) => {
  res.send("API Colegio ADUNI+ funcionando");
});

app.use("/api/auth", authRoutes);
app.use("/api/intranet", intranetRoutes);
app.use("/api/publico", publicoRoutes);
app.use("/api/reclamos", reclamoRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
  iniciarTareasProgramadas();
});
