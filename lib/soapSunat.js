const JSZip = require("jszip");
const { DOMParser } = require("@xmldom/xmldom");
const xpath = require("xpath");

const ENDPOINTS = {
  beta: "https://e-beta.sunat.gob.pe:443/ol-ti-itcpfegem-beta/billService",
  produccion: "https://e-factura.sunat.gob.pe:443/ol-ti-itcpfegem/billService",
  homologacion: "https://ww1.sunat.gob.pe/ol-ti-itcpgem-sqa/billService",
};

const construirSobreSendBill = ({ ruc, usuarioSol, claveSol, nombreArchivo, zipBase64 }) => `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:ser="http://service.sunat.gob.pe">
  <soapenv:Header>
    <wsse:Security xmlns:wsse="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd">
      <wsse:UsernameToken>
        <wsse:Username>${ruc}${usuarioSol}</wsse:Username>
        <wsse:Password Type="http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText">${claveSol}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    <ser:sendBill>
      <fileName>${nombreArchivo}.zip</fileName>
      <contentFile>${zipBase64}</contentFile>
    </ser:sendBill>
  </soapenv:Body>
</soapenv:Envelope>`;

const leerCdrDesdeZipBase64 = async (base64) => {
  const zip = await JSZip.loadAsync(Buffer.from(base64, "base64"));
  const nombreEntrada = Object.keys(zip.files).find((n) => n.toLowerCase().endsWith(".xml"));
  const xmlCdr = await zip.files[nombreEntrada].async("string");

  const doc = new DOMParser().parseFromString(xmlCdr, "text/xml");
  const select = xpath.useNamespaces({
    cbc: "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    cac: "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
  });

  const codigo = select("string(//cac:DocumentResponse/cac:Response/cbc:ResponseCode)", doc);
  const descripcion = select("string(//cac:DocumentResponse/cac:Response/cbc:Description)", doc);

  return { codigo: String(codigo), descripcion: String(descripcion), xmlCdr, zipCdrBase64: base64 };
};

const enviarComprobante = async ({ ambiente, ruc, usuarioSol, claveSol, nombreArchivo, zipBuffer }) => {
  const sobre = construirSobreSendBill({
    ruc,
    usuarioSol,
    claveSol,
    nombreArchivo,
    zipBase64: zipBuffer.toString("base64"),
  });

  const respuesta = await fetch(ENDPOINTS[ambiente], {
    method: "POST",
    headers: {
      "Content-Type": "text/xml;charset=UTF-8",
      SOAPAction: "urn:sendBill",
    },
    body: sobre,
    signal: AbortSignal.timeout(25000),
  });

  const textoRespuesta = await respuesta.text();
  const doc = new DOMParser().parseFromString(textoRespuesta, "text/xml");
  const select = xpath.useNamespaces({
    soapenv: "http://schemas.xmlsoap.org/soap/envelope/",
    env: "http://schemas.xmlsoap.org/soap/envelope/",
  });

  const fault = select("//*[local-name()='Fault']", doc)[0];
  if (fault) {
    const faultcode = select("string(.//*[local-name()='faultcode'])", fault);
    const faultstring = select("string(.//*[local-name()='faultstring'])", fault);
    return { ok: false, faultcode, faultstring, httpStatus: respuesta.status, respuestaCruda: textoRespuesta };
  }

  const applicationResponse = select("string(//*[local-name()='applicationResponse'])", doc);
  if (!applicationResponse) {
    return { ok: false, faultcode: null, faultstring: "Respuesta sin applicationResponse ni Fault", httpStatus: respuesta.status, respuestaCruda: textoRespuesta };
  }

  const cdr = await leerCdrDesdeZipBase64(applicationResponse);
  return { ok: true, httpStatus: respuesta.status, ...cdr };
};

module.exports = { enviarComprobante, ENDPOINTS };
