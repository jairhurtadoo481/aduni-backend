const { montoALetras } = require("./montoALetras");
const { calcularTotales } = require("./calculosComprobante");

const TIPO_DOC_SCHEME = { DNI: "1", RUC: "6" };
const TIPO_COMPROBANTE_CODE = { factura: "01", boleta: "03" };

const cdata = (texto) => `<![CDATA[${texto}]]>`;

const construirLinea = (linea, indice) => {
  return `
   <cac:InvoiceLine>
      <cbc:ID>${indice + 1}</cbc:ID>
      <cbc:InvoicedQuantity unitCode="NIU">${linea.cantidad}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="PEN">${linea.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
         <cac:AlternativeConditionPrice>
            <cbc:PriceAmount currencyID="PEN">${linea.precioVenta.toFixed(2)}</cbc:PriceAmount>
            <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
         </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
         <cbc:TaxAmount currencyID="PEN">${linea.igv.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="PEN">${linea.valorVenta.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="PEN">${linea.igv.toFixed(2)}</cbc:TaxAmount>
            <cac:TaxCategory>
               <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
               <cbc:Percent>18.00</cbc:Percent>
               <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
               <cac:TaxScheme>
                  <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">1000</cbc:ID>
                  <cbc:Name>IGV</cbc:Name>
                  <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
               </cac:TaxScheme>
            </cac:TaxCategory>
         </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
         <cbc:Description>${cdata(linea.descripcion)}</cbc:Description>
      </cac:Item>
      <cac:Price>
         <cbc:PriceAmount currencyID="PEN">${linea.precioUnitarioBase.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
   </cac:InvoiceLine>`;
};

const generarXmlComprobante = (datos) => {
  const {
    tipo,
    serie,
    correlativo,
    fechaEmision,
    horaEmision,
    emisor,
    cliente,
    items,
    moneda = "PEN",
  } = datos;

  const idComprobante = `${serie}-${correlativo}`;
  const tipoCode = TIPO_COMPROBANTE_CODE[tipo];
  const schemeCliente = TIPO_DOC_SCHEME[cliente.tipoDocumento];

  const { lineas: lineasCalculadas, subtotal, igv, total } = calcularTotales(items);

  const lineas = lineasCalculadas.map(construirLinea).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
   <ext:UBLExtensions>
      <ext:UBLExtension>
         <ext:ExtensionContent></ext:ExtensionContent>
      </ext:UBLExtension>
   </ext:UBLExtensions>
   <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
   <cbc:CustomizationID>2.0</cbc:CustomizationID>${tipo === "factura" ? `
   <cbc:ProfileID schemeName="SUNAT:Identificador de Tipo de Operacion" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo17">0101</cbc:ProfileID>` : ""}
   <cbc:ID>${idComprobante}</cbc:ID>
   <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
   <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
   <cbc:InvoiceTypeCode listID="0101" listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo01">${tipoCode}</cbc:InvoiceTypeCode>
   <cbc:Note languageLocaleID="1000">${cdata(montoALetras(total, moneda))}</cbc:Note>
   <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
   <cbc:LineCountNumeric>${items.length}</cbc:LineCountNumeric>
   <cac:Signature>
      <cbc:ID>${emisor.ruc}</cbc:ID>
      <cac:SignatoryParty>
         <cac:PartyIdentification>
            <cbc:ID>${emisor.ruc}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyName>
            <cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name>
         </cac:PartyName>
      </cac:SignatoryParty>
      <cac:DigitalSignatureAttachment>
         <cac:ExternalReference>
            <cbc:URI>#SignatureSP</cbc:URI>
         </cac:ExternalReference>
      </cac:DigitalSignatureAttachment>
   </cac:Signature>
   <cac:AccountingSupplierParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="6" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${emisor.ruc}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyName>
            <cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name>
         </cac:PartyName>
         <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(emisor.razonSocial)}</cbc:RegistrationName>
            <cac:RegistrationAddress>
               <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
               <cac:AddressLine>
                  <cbc:Line>${cdata(emisor.direccion || "")}</cbc:Line>
               </cac:AddressLine>
               <cac:Country>
                  <cbc:IdentificationCode>PE</cbc:IdentificationCode>
               </cac:Country>
            </cac:RegistrationAddress>
         </cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingSupplierParty>
   <cac:AccountingCustomerParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="${schemeCliente}" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${cliente.documento}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(cliente.nombre)}</cbc:RegistrationName>
         </cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingCustomerParty>
   <cac:PaymentTerms>
      <cbc:ID>FormaPago</cbc:ID>
      <cbc:PaymentMeansID>Contado</cbc:PaymentMeansID>
   </cac:PaymentTerms>
   <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
         <cbc:TaxableAmount currencyID="${moneda}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
         <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxCategory>
            <cac:TaxScheme>
               <cbc:ID>1000</cbc:ID>
               <cbc:Name>IGV</cbc:Name>
               <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
         </cac:TaxCategory>
      </cac:TaxSubtotal>
   </cac:TaxTotal>
   <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="${moneda}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cbc:TaxInclusiveAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:PayableAmount>
   </cac:LegalMonetaryTotal>${lineas}
</Invoice>`;
};

const construirLineaCredito = (linea, indice) => {
  return `
   <cac:CreditNoteLine>
      <cbc:ID>${indice + 1}</cbc:ID>
      <cbc:CreditedQuantity unitCode="NIU">${linea.cantidad}</cbc:CreditedQuantity>
      <cbc:LineExtensionAmount currencyID="PEN">${linea.valorVenta.toFixed(2)}</cbc:LineExtensionAmount>
      <cac:PricingReference>
         <cac:AlternativeConditionPrice>
            <cbc:PriceAmount currencyID="PEN">${linea.precioVenta.toFixed(2)}</cbc:PriceAmount>
            <cbc:PriceTypeCode>01</cbc:PriceTypeCode>
         </cac:AlternativeConditionPrice>
      </cac:PricingReference>
      <cac:TaxTotal>
         <cbc:TaxAmount currencyID="PEN">${linea.igv.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxSubtotal>
            <cbc:TaxableAmount currencyID="PEN">${linea.valorVenta.toFixed(2)}</cbc:TaxableAmount>
            <cbc:TaxAmount currencyID="PEN">${linea.igv.toFixed(2)}</cbc:TaxAmount>
            <cac:TaxCategory>
               <cbc:ID schemeID="UN/ECE 5305" schemeName="Tax Category Identifier" schemeAgencyName="United Nations Economic Commission for Europe">S</cbc:ID>
               <cbc:Percent>18.00</cbc:Percent>
               <cbc:TaxExemptionReasonCode listAgencyName="PE:SUNAT" listURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo07">10</cbc:TaxExemptionReasonCode>
               <cac:TaxScheme>
                  <cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">1000</cbc:ID>
                  <cbc:Name>IGV</cbc:Name>
                  <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
               </cac:TaxScheme>
            </cac:TaxCategory>
         </cac:TaxSubtotal>
      </cac:TaxTotal>
      <cac:Item>
         <cbc:Description>${cdata(linea.descripcion)}</cbc:Description>
      </cac:Item>
      <cac:Price>
         <cbc:PriceAmount currencyID="PEN">${linea.precioUnitarioBase.toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
   </cac:CreditNoteLine>`;
};

const generarXmlNotaCredito = (datos) => {
  const {
    serie,
    correlativo,
    fechaEmision,
    horaEmision,
    emisor,
    cliente,
    items,
    moneda = "PEN",
    comprobanteAfectado,
    motivoCodigo,
    motivoDescripcion,
  } = datos;

  const idComprobante = `${serie}-${correlativo}`;
  const idAfectado = `${comprobanteAfectado.serie}-${comprobanteAfectado.correlativo}`;
  const tipoCodeAfectado = TIPO_COMPROBANTE_CODE[comprobanteAfectado.tipo];
  const schemeCliente = TIPO_DOC_SCHEME[cliente.tipoDocumento];

  const { lineas: lineasCalculadas, subtotal, igv, total } = calcularTotales(items);

  const lineas = lineasCalculadas.map(construirLineaCredito).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<CreditNote xmlns="urn:oasis:names:specification:ubl:schema:xsd:CreditNote-2" xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2" xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2" xmlns:ds="http://www.w3.org/2000/09/xmldsig#" xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
   <ext:UBLExtensions>
      <ext:UBLExtension>
         <ext:ExtensionContent></ext:ExtensionContent>
      </ext:UBLExtension>
   </ext:UBLExtensions>
   <cbc:UBLVersionID>2.1</cbc:UBLVersionID>
   <cbc:CustomizationID>2.0</cbc:CustomizationID>
   <cbc:ID>${idComprobante}</cbc:ID>
   <cbc:IssueDate>${fechaEmision}</cbc:IssueDate>
   <cbc:IssueTime>${horaEmision}</cbc:IssueTime>
   <cbc:Note languageLocaleID="1000">${cdata(montoALetras(total, moneda))}</cbc:Note>
   <cbc:DocumentCurrencyCode>${moneda}</cbc:DocumentCurrencyCode>
   <cac:DiscrepancyResponse>
      <cbc:ReferenceID>${idAfectado}</cbc:ReferenceID>
      <cbc:ResponseCode>${motivoCodigo}</cbc:ResponseCode>
      <cbc:Description>${cdata(motivoDescripcion)}</cbc:Description>
   </cac:DiscrepancyResponse>
   <cac:BillingReference>
      <cac:InvoiceDocumentReference>
         <cbc:ID>${idAfectado}</cbc:ID>
         <cbc:DocumentTypeCode>${tipoCodeAfectado}</cbc:DocumentTypeCode>
      </cac:InvoiceDocumentReference>
   </cac:BillingReference>
   <cac:Signature>
      <cbc:ID>${emisor.ruc}</cbc:ID>
      <cac:SignatoryParty>
         <cac:PartyIdentification>
            <cbc:ID>${emisor.ruc}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyName>
            <cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name>
         </cac:PartyName>
      </cac:SignatoryParty>
      <cac:DigitalSignatureAttachment>
         <cac:ExternalReference>
            <cbc:URI>#SignatureSP</cbc:URI>
         </cac:ExternalReference>
      </cac:DigitalSignatureAttachment>
   </cac:Signature>
   <cac:AccountingSupplierParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="6" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${emisor.ruc}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyName>
            <cbc:Name>${cdata(emisor.nombreComercial || emisor.razonSocial)}</cbc:Name>
         </cac:PartyName>
         <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(emisor.razonSocial)}</cbc:RegistrationName>
            <cac:RegistrationAddress>
               <cbc:AddressTypeCode>0000</cbc:AddressTypeCode>
               <cac:AddressLine>
                  <cbc:Line>${cdata(emisor.direccion || "")}</cbc:Line>
               </cac:AddressLine>
               <cac:Country>
                  <cbc:IdentificationCode>PE</cbc:IdentificationCode>
               </cac:Country>
            </cac:RegistrationAddress>
         </cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingSupplierParty>
   <cac:AccountingCustomerParty>
      <cac:Party>
         <cac:PartyIdentification>
            <cbc:ID schemeID="${schemeCliente}" schemeAgencyName="PE:SUNAT" schemeURI="urn:pe:gob:sunat:cpe:see:gem:catalogos:catalogo06">${cliente.documento}</cbc:ID>
         </cac:PartyIdentification>
         <cac:PartyLegalEntity>
            <cbc:RegistrationName>${cdata(cliente.nombre)}</cbc:RegistrationName>
         </cac:PartyLegalEntity>
      </cac:Party>
   </cac:AccountingCustomerParty>
   <cac:TaxTotal>
      <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
      <cac:TaxSubtotal>
         <cbc:TaxableAmount currencyID="${moneda}">${subtotal.toFixed(2)}</cbc:TaxableAmount>
         <cbc:TaxAmount currencyID="${moneda}">${igv.toFixed(2)}</cbc:TaxAmount>
         <cac:TaxCategory>
            <cac:TaxScheme>
               <cbc:ID>1000</cbc:ID>
               <cbc:Name>IGV</cbc:Name>
               <cbc:TaxTypeCode>VAT</cbc:TaxTypeCode>
            </cac:TaxScheme>
         </cac:TaxCategory>
      </cac:TaxSubtotal>
   </cac:TaxTotal>
   <cac:LegalMonetaryTotal>
      <cbc:LineExtensionAmount currencyID="${moneda}">${subtotal.toFixed(2)}</cbc:LineExtensionAmount>
      <cbc:TaxInclusiveAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:TaxInclusiveAmount>
      <cbc:PayableAmount currencyID="${moneda}">${total.toFixed(2)}</cbc:PayableAmount>
   </cac:LegalMonetaryTotal>${lineas}
</CreditNote>`;
};

module.exports = { generarXmlComprobante, generarXmlNotaCredito };
