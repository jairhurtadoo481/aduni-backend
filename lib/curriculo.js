// Áreas curriculares y competencias del Currículo Nacional de Educación Básica (CNEB - MINEDU).
// Se usan como plantilla al crear un curso; el colegio puede editarlas.

const COMUNICACION = [
  "Se comunica oralmente en su lengua materna",
  "Lee diversos tipos de textos escritos en su lengua materna",
  "Escribe diversos tipos de textos en su lengua materna",
];

const MATEMATICA = [
  "Resuelve problemas de cantidad",
  "Resuelve problemas de regularidad, equivalencia y cambio",
  "Resuelve problemas de forma, movimiento y localización",
  "Resuelve problemas de gestión de datos e incertidumbre",
];

const CIENCIA = [
  "Indaga mediante métodos científicos para construir sus conocimientos",
  "Explica el mundo físico basándose en conocimientos sobre los seres vivos, materia y energía, biodiversidad, Tierra y universo",
  "Diseña y construye soluciones tecnológicas para resolver problemas de su entorno",
];

const INGLES = [
  "Se comunica oralmente en inglés como lengua extranjera",
  "Lee diversos tipos de textos escritos en inglés como lengua extranjera",
  "Escribe diversos tipos de textos en inglés como lengua extranjera",
];

const ARTE = [
  "Aprecia de manera crítica manifestaciones artístico-culturales",
  "Crea proyectos desde los lenguajes artísticos",
];

const EDUCACION_FISICA = [
  "Se desenvuelve de manera autónoma a través de su motricidad",
  "Asume una vida saludable",
  "Interactúa a través de sus habilidades sociomotrices",
];

const RELIGION = [
  "Construye su identidad como persona humana, amada por Dios, digna, libre y trascendente",
  "Asume la experiencia del encuentro personal y comunitario con Dios en su proyecto de vida",
];

const AREAS = {
  primaria: {
    "Comunicación": COMUNICACION,
    "Matemática": MATEMATICA,
    "Personal Social": [
      "Construye su identidad",
      "Convive y participa democráticamente en la búsqueda del bien común",
      "Construye interpretaciones históricas",
      "Gestiona responsablemente el espacio y el ambiente",
      "Gestiona responsablemente los recursos económicos",
    ],
    "Ciencia y Tecnología": CIENCIA,
    "Inglés": INGLES,
    "Arte y Cultura": ARTE,
    "Educación Física": EDUCACION_FISICA,
    "Educación Religiosa": RELIGION,
  },
  secundaria: {
    "Comunicación": COMUNICACION,
    "Matemática": MATEMATICA,
    "Ciencia y Tecnología": CIENCIA,
    "Ciencias Sociales": [
      "Construye interpretaciones históricas",
      "Gestiona responsablemente el espacio y el ambiente",
      "Gestiona responsablemente los recursos económicos",
    ],
    "Desarrollo Personal, Ciudadanía y Cívica": [
      "Construye su identidad",
      "Convive y participa democráticamente en la búsqueda del bien común",
    ],
    "Inglés": INGLES,
    "Arte y Cultura": ARTE,
    "Educación Física": EDUCACION_FISICA,
    "Educación Religiosa": RELIGION,
    "Educación para el Trabajo": ["Gestiona proyectos de emprendimiento económico o social"],
  },
};

// Escala literal oficial (RVM 094-2020-MINEDU y modificatorias)
const ESCALA = {
  AD: { valor: 4, nombre: "Logro destacado" },
  A: { valor: 3, nombre: "Logro esperado" },
  B: { valor: 2, nombre: "En proceso" },
  C: { valor: 1, nombre: "En inicio" },
};

// Nivel que resume varias calificaciones (promedio redondeado de su equivalente).
const resumirNiveles = (niveles) => {
  const validos = niveles.filter((n) => ESCALA[n]);
  if (!validos.length) return null;
  const prom = validos.reduce((s, n) => s + ESCALA[n].valor, 0) / validos.length;
  const r = Math.round(prom);
  return Object.keys(ESCALA).find((k) => ESCALA[k].valor === r);
};

const GRADOS = { primaria: 6, secundaria: 5 };

module.exports = { AREAS, ESCALA, resumirNiveles, GRADOS };
