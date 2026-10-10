// XML UBL 2.1 para SUNAT (boleta, factura y nota de crédito), adaptado a un colegio:
// las pensiones y matrícula son servicios educativos EXONERADOS de IGV (afectación 20, tributo 9997 EXO).
// También admite líneas GRAVADAS (afectación 10, IGV 18%) por si se venden bienes (uniformes, libros).
const { montoALetras } = require("./montoALetras");

const IGV_TASA = 0.18;
const r2 = (n) => Math.round(n * 100) / 100;
const TIPO_DOC_SCHEME = { DNI: "1", RUC: "6" };
const TIPO_COMPROBANTE_CODE = { factura: "01", boleta: "03" };
const cdata = (t) => `<![CDATA[${t}]]>`;

const TRIBUTO = {
  10: { categoria: "S", id: "1000", nombre: "IGV" },
  20: { categoria: "E", id: "9997", nombre: "EXO" },
};

const calcularLinea = (item) => {
  const afectacion = String(item.afectacion || "20") === "10" ? "10" : "20";
  const precioVenta = r2(item.precioUnitario);
  const importe = r2(item.cantidad * precioVenta);
  const valorVenta = afectacion === "10" ? r2(importe / (1 + IGV_TASA)) : importe;
  const igv = r2(importe - valorVenta);
  return { ...item, afectacion, precioVenta, importe, valorVenta, igv, valorUnitario: item.cantidad > 0 ? r2(valorVenta / item.cantidad) : 0 };
};

const calcularTotales = (items) => {
  const lineas = items.map(calcularLinea);
  const suma = (f) => r2(lineas.reduce((s, l) => s + f(l), 0));
  const gravadas = suma((l) => (l.afectacion === "10" ? l.valorVenta : 0));
  const exoneradas = suma((l) => (l.afectacion === "20" ? l.valorVenta : 0));
  const igv = suma((l) => l.igv);
  return { lineas, gravadas, exoneradas, igv, subtotal: r2(gravadas + exoneradas), total: r2(gravadas + exoneradas + igv) };
};

const categoriaLinea = (l) => {
  const t = TRIBUTO[l.afectacion];
  return `<cac:TaxCategory>
               <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">${t.categoria}</cbc:ID>
               <cbc:Percent>18.00</cbc:Percent>
               <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">${l.afectacion}</cbc:TaxExemptionReasonCode>
               <cac:TaxScheme>
                  <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">${t.id}</cbc:ID>
                  <cbc:Name>${t.nombre}</cbc:Name>
                  <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
               </cac:TaxScheme>
            </cac:TaxCategory>`;
};

const linea = (l, i, etiqueta, cantidadTag) => `
   <cac:${etiqueta}>
      <cbc:ID>${i + 1}</cbc:ID>
      <cbc:${cantidadTag} unitCode="ZZ">${l.cantidad}</cbc:${cantidadTag}>
      <cbc:LineExtensionAmount currencyID="PEN">${l.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
         <cac:AlternativeConditionPrice>
            <cbc:PriceAmount currencyID="PEN">${l.precioVenta.toFixed(2)}</cbc:PriceAmount>
            <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
         </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
         <cbc:TaxAmount currencyID="PEN">${l.igv.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="PEN">${l.valorVenta.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="PEN">${l.igv.toFixed(2)}</cbc:TaxAmount>
            ${categoriaLinea(l)}
         </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
         <cbc:Description>${cdata(l.descripcion)}</cbc:Description>
      </cac:Item>
      <cac:Price>
         <cbc:PriceAmount currencyID="PEN">${l.valorUnitario.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
   </cac:${etiqueta}>`;

const totalesImpuesto = ({ gravadas, exoneradas, igv }) => {
  const sub = (base, monto, id, nombre) => `
      <cac:TaxSubtotal>
         <cbc:TaxableAmount currencyID="PEN">${base.toFixed(2)}</cbc:TaxableAmount>
         <cbc:TaxAmount currencyID="PEN">${monto.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxCategory>
            <cac:TaxScheme>
               <cbc:ID>${id}</cbc:ID>
               <cbc:Name>${nombre}</cbc:Name>
               <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
         </cac:TaxCategory>
      </cac:TaxSubtotal>`;
  return `
   <cac:TaxTotal>
      <cbc:TaxAmount currencyID="PEN">${igv.toFixed(2)}</cbc:TaxAmount>${gravadas > 0 ? sub(gravadas, igv, "1000", "IGV") : ""}${exoneradas > 0 || gravadas === 0 ? sub(exoneradas, 0, "9997", "EXO") : ""}
   </cac:TaxTotal>`;
};

const partes = (emisor, cliente) => `
   <cac:Signature>
      <cbc:ID>${emisor.ruc}</cbc:ID>
      <cac:SignatoryParty>
         <cac:PartyIdentification><cbc:ID>${emisor.ruc}</cbc:ID></cac:PartyIdentification>
         <cac:PartyName><cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name></cac:PartyName>
      </cac:SignatoryParty>
      <cac:DigitalSignatureAttachment>
         <cac:ExternalReference><cbc:URI>#SignatureSP</cbc:URI></cac:ExternalReference>
      </cac:DigitalSignatureAttachment>
   </cac:Signature>
   <cac:AccountingSupplierParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="6" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${emisor.ruc}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyName><cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name></cac:PartyName>
         <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(emisor.razonSocial)}</cbc:RegistrationName>
            <cac:RegistrationAddress>
               <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
               <cac:AddressLine><cbc:Line>${cdata(emisor.direccion || "")}</cbc:Line></cac:AddressLine>
               <cac:Country><cbc:IdentificationCode>PE</cbc:IdentificationCode></cac:Country>
            </cac:RegistrationAddress>
         </cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingSupplierParty>
   <cac:AccountingCustomerParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="${TIPO_DOC_SCHEME[cliente.tipoDocumento]}" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${cliente.documento}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyLegalEntity><cbc:RegistrationName>${cdata(cliente.nombre)}</cbc:RegistrationName></cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingCustomerParty>`;

const NS = 'xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2"';
const EXT = `
   <ext:UBLExtensions>
      <ext:UBLExtension>
         <ext:ExtensionContent></ext:ExtensionContent>
      </ext:UBLExtension>
   </ext:UBLExtensions>
   <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
   <cbc:CustomizationID>2.0</cbc:CustomizationID>`;

const generarXmlComprobante = ({ tipo, serie, correlativo, fechaEmision, horaEmision, emisor, cliente, items }) => {
  const t = calcularTotales(items);
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" ${NS}>${EXT}${tipo === "factura" ? `
   <cbc:ProfileID schemeName="SUNAT:Identificador de Tipo de Operacion" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo17">0101</cbc:ProfileID>` : ""}
   <cbc:ID>${serie}-${correlativo}</cbc:ID>
   <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
   <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
   <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${TIPO_COMPROBANTE_CODE[tipo]}</cbc:InvoiceTypeCode>
   <cbc:Note languageLocaleID="1000">${cdata(montoALetras(t.total, "PEN"))}</cbc:Note>
   <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
   <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>${partes(emisor, cliente)}
   <cac:PaymentTerms>
      <cbc:ID>FormaPago</cbc:ID>
      <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
   </cac:PaymentTerms>${totalesImpuesto(t)}
   <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="PEN">${t.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cbc:TaxInclusiveAmount currencyID="PEN">${t.total.toFixed(2)}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="PEN">${t.total.toFixed(2)}</cbc:PayableAmount>
   </cac:LegalMonetaryTotal>${t.lineas.map((l, i) => linea(l, i, "InvoiceLine", "InvoicedQuantity")).join("")}
</Invoice>`;
};

const generarXmlNotaCredito = ({ serie, correlativo, fechaEmision, horaEmision, emisor, cliente, items, afectado, motivoCodigo, motivoDescripcion }) => {
  const t = calcularTotales(items);
  const idAfectado = `${afectado.serie}-${afectado.correlativo}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" ${NS}>${EXT}
   <cbc:ID>${serie}-${correlativo}</cbc:ID>
   <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
   <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
   <cbc:Note languageLocaleID="1000">${cdata(montoALetras(t.total, "PEN"))}</cbc:Note>
   <cbc:DocumentCurrencyCode>PEN</cbc:DocumentCurrencyCode>
   <cac:DiscrepancyResponse>
      <cbc:ReferenceID>${idAfectado}</cbc:ReferenceID>
      <cbc:ResponseCode>${motivoCodigo}</cbc:ResponseCode>
      <cbc:Description>${cdata(motivoDescripcion)}</cbc:Description>
   </cac:DiscrepancyResponse>
   <cac:BillingReference>
      <cac:InvoiceDocumentReference>
         <cbc:ID>${idAfectado}</cbc:ID>
         <cbc:DocumentTypeCode>${TIPO_COMPROBANTE_CODE[afectado.tipo]}</cbc:DocumentTypeCode>
      </cac:InvoiceDocumentReference>
   </cac:BillingReference>${partes(emisor, cliente)}${totalesImpuesto(t)}
   <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="PEN">${t.subtotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cbc:TaxInclusiveAmount currencyID="PEN">${t.total.toFixed(2)}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="PEN">${t.total.toFixed(2)}</cbc:PayableAmount>
   </cac:LegalMonetaryTotal>${t.lineas.map((l, i) => linea(l, i, "CreditNoteLine", "CreditedQuantity")).join("")}
</CreditNote>`;
};

module.exports = { generarXmlComprobante, generarXmlNotaCredito, calcularTotales, TIPO_COMPROBANTE_CODE };
