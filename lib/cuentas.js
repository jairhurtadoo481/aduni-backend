// En primaria, los alumnos por debajo del grado configurado no tienen cuenta propia:
// su intranet la maneja la familia desde el portal de familias.
const tieneCuentaEnAula = (aula, config) => {
  if (!aula || aula.nivel === "secundaria") return true;
  return aula.grado >= (config?.gradoMinimoCuentaPrimaria ?? 5);
};

module.exports = { tieneCuentaEnAula };
