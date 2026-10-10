const { SignedXml } = require("xml-crypto");

const firmarXml = (xml, clavePrivadaPem, certificadoPem) => {
  const sig = new SignedXml({
    privateKey: clavePrivadaPem,
    publicCert: certificadoPem,
    signatureAlgorithm: "http://www.w3.org/2000/09/xmldsig#rsa-sha1",
    canonicalizationAlgorithm: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    getKeyInfoContent: SignedXml.getKeyInfoContent,
  });

  sig.addReference({
    xpath: "/*",
    transforms: ["http://www.w3.org/2000/09/xmldsig#enveloped-signature"],
    digestAlgorithm: "http://www.w3.org/2000/09/xmldsig#sha1",
    isEmptyUri: true,
  });

  sig.computeSignature(xml, {
    prefix: "ds",
    attrs: { Id: "SignatureSP" },
    location: {
      reference: "//*[local-name(.)='ExtensionContent']",
      action: "append",
    },
  });

  return sig.getSignedXml();
};

module.exports = { firmarXml };
