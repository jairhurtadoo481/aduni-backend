const forge = require("node-forge");

const leerCertificadoP12 = (bufferP12, clave) => {
  const p12Asn1 = forge.asn1.fromDer(forge.util.createBuffer(bufferP12.toString("binary")));
  const p12 = forge.pkcs12.pkcs12FromAsn1(p12Asn1, false, clave);

  const bagsClave = p12.getBags({ bagType: forge.pki.oids.pkcs8ShroudedKeyBag });
  const bagClave = bagsClave[forge.pki.oids.pkcs8ShroudedKeyBag][0];
  if (!bagClave) {
    throw new Error("No se encontro la clave privada en el certificado");
  }

  const bagsCert = p12.getBags({ bagType: forge.pki.oids.certBag });
  const certificados = bagsCert[forge.pki.oids.certBag];
  if (!certificados || certificados.length === 0) {
    throw new Error("No se encontro ningun certificado en el archivo");
  }

  const certificadoPrincipal = certificados.find((bag) => bag.cert.privateKey === undefined && bag.cert) || certificados[0];

  const clavePrivadaPem = forge.pki.privateKeyToPem(bagClave.key);
  const certificadoPem = forge.pki.certificateToPem(certificadoPrincipal.cert);

  return {
    clavePrivadaPem,
    certificadoPem,
    emisor: certificadoPrincipal.cert.issuer.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    sujeto: certificadoPrincipal.cert.subject.attributes.map((a) => `${a.shortName}=${a.value}`).join(", "),
    validoDesde: certificadoPrincipal.cert.validity.notBefore,
    validoHasta: certificadoPrincipal.cert.validity.notAfter,
  };
};

module.exports = { leerCertificadoP12 };
