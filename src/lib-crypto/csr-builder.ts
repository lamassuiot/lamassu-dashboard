import * as asn1js from "asn1js";
import * as pkijs from "pkijs";
import { CertificationRequest, AlgorithmIdentifier } from "pkijs";

import {
  SIGNATURE_OID_MAP,
  ECDSA_RAW_SIGNATURE_LENGTHS,
  PSS_ALGO_PARAMS,
  MLDSA_ALGORITHMS,
} from "./constants";
import { ipToBuffer, arrayBufferToBase64, formatAsPem } from "./buffer-utils";
import { getKeyImportParams } from "./key-utils";
import { rawEcdsaSigToDer, derEcdsaSigToRaw } from "./ecdsa-signature";

/** Distinguished name fields for the CSR subject. */
export interface CsrSubject {
  commonName: string;
  organization?: string;
  organizationalUnit?: string;
  locality?: string;
  stateProvince?: string;
  country?: string;
}

/** A single Subject Alternative Name entry. */
export interface CsrSan {
  type: "DNS" | "IP" | "Email" | "URI";
  value: string;
}

/**
 * Parameters required to build and sign a PKCS#10 CSR.
 *
 * The caller provides `signFn` — an async function that takes the
 * base64-encoded TBS (to-be-signed) bytes and returns the base64-encoded
 * signature produced by the KMS key.
 */
export interface BuildSignedCsrParams {
  subject: CsrSubject;
  sans: CsrSan[];
  signAlgorithm: string;
  publicKeyPem: string;
  signFn: (tbsBase64: string) => Promise<string>;
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

/** Builds the ordered list of AttributeTypeAndValue entries for a CSR subject. */
function buildSubjectFields(subject: CsrSubject): pkijs.AttributeTypeAndValue[] {
  const fields: pkijs.AttributeTypeAndValue[] = [
    new pkijs.AttributeTypeAndValue({
      type: "2.5.4.3", // CN
      value: new asn1js.Utf8String({ value: subject.commonName.trim() }),
    }),
  ];
  if (subject.organization?.trim()) {
    fields.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.10", // O
        value: new asn1js.Utf8String({ value: subject.organization.trim() }),
      }),
    );
  }
  if (subject.organizationalUnit?.trim()) {
    fields.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.11", // OU
        value: new asn1js.Utf8String({ value: subject.organizationalUnit.trim() }),
      }),
    );
  }
  if (subject.locality?.trim()) {
    fields.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.7", // L
        value: new asn1js.Utf8String({ value: subject.locality.trim() }),
      }),
    );
  }
  if (subject.stateProvince?.trim()) {
    fields.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.8", // ST
        value: new asn1js.Utf8String({ value: subject.stateProvince.trim() }),
      }),
    );
  }
  if (subject.country?.trim()) {
    fields.push(
      new pkijs.AttributeTypeAndValue({
        type: "2.5.4.6", // C
        value: new asn1js.PrintableString({ value: subject.country.trim() }),
      }),
    );
  }
  return fields;
}

/**
 * Builds a PKCS#9 extensionRequest attribute containing a subjectAltName
 * extension.  Returns `null` if `sans` is empty or all entries are invalid.
 */
function buildSanAttribute(sans: CsrSan[]): pkijs.Attribute | null {
  if (sans.length === 0) return null;

  const generalNames: pkijs.GeneralName[] = sans
    .map((san): pkijs.GeneralName | null => {
      switch (san.type) {
        case "Email":
          return new pkijs.GeneralName({ type: 1, value: san.value.trim() });
        case "DNS":
          return new pkijs.GeneralName({ type: 2, value: san.value.trim() });
        case "URI":
          return new pkijs.GeneralName({ type: 6, value: san.value.trim() });
        case "IP": {
          const ipBuffer = ipToBuffer(san.value.trim());
          return ipBuffer
            ? new pkijs.GeneralName({
                type: 7,
                value: new asn1js.OctetString({ valueHex: ipBuffer }),
              })
            : null;
        }
        default:
          return null;
      }
    })
    .filter((n): n is pkijs.GeneralName => n !== null);

  if (generalNames.length === 0) return null;

  const extensions = new pkijs.Extensions({
    extensions: [
      new pkijs.Extension({
        extnID: "2.5.29.17", // id-ce-subjectAltName
        critical: false,
        extnValue: new pkijs.GeneralNames({ names: generalNames })
          .toSchema()
          .toBER(false),
      }),
    ],
  });

  return new pkijs.Attribute({
    type: "1.2.840.113549.1.9.14", // id-pkcs9-at-extensionRequest
    values: [extensions.toSchema()],
  });
}

// ---------------------------------------------------------------------------
// KMS-backed CSR builder
// ---------------------------------------------------------------------------

/**
 * Builds a signed PKCS#10 CSR using the provided public key and a
 * KMS-backed signing function.
 *
 * Returns the CSR as a PEM-encoded string.
 */
export async function buildSignedCsr(
  params: BuildSignedCsrParams,
): Promise<string> {
  const { subject, sans, signAlgorithm, publicKeyPem, signFn } = params;

  // --- Initialise PKCS#10 request ---
  const pkcs10 = new CertificationRequest({
    version: 0,
    subject: new pkijs.RelativeDistinguishedNames({ typesAndValues: buildSubjectFields(subject) }),
  });
  pkcs10.attributes = [];

  // --- Import the public key ---
  const publicKeyDer = Uint8Array.from(
    atob(
      publicKeyPem
        .replace(/-----(BEGIN|END) PUBLIC KEY-----/g, "")
        .replace(/\s+/g, ""),
    ),
    (c) => c.charCodeAt(0),
  ).buffer;

  if (MLDSA_ALGORITHMS.has(signAlgorithm)) {
    // WebCrypto does not support ML-DSA yet. Parse the SPKI DER directly
    // via ASN.1 and embed it into the CSR without going through importKey.
    const asn1Result = asn1js.fromBER(publicKeyDer);
    if (asn1Result.offset === -1) {
      throw new Error("Invalid ML-DSA public key DER.");
    }
    pkcs10.subjectPublicKeyInfo = new pkijs.PublicKeyInfo({
      schema: asn1Result.result,
    });
  } else {
    const keyImportParams = getKeyImportParams(signAlgorithm);
    const pkijsCrypto = pkijs.getCrypto();
    if (!pkijsCrypto) throw new Error("PKI.js crypto engine not available.");

    const publicKey = await pkijsCrypto.importKey(
      "spki",
      publicKeyDer,
      keyImportParams,
      true,
      ["verify"],
    );
    await pkcs10.subjectPublicKeyInfo.importKey(publicKey);
  }

  // --- Add SANs (if any) ---
  const sanAttribute = buildSanAttribute(sans);
  if (sanAttribute) pkcs10.attributes = [sanAttribute];

  // --- Set the signature algorithm ---
  const signatureOid = SIGNATURE_OID_MAP[signAlgorithm];
  if (!signatureOid) {
    throw new Error(`Unsupported signature algorithm for CSR: ${signAlgorithm}`);
  }

  if (signAlgorithm.startsWith("RSASSA_PSS")) {
    const { shaOid, saltLength } = PSS_ALGO_PARAMS[signAlgorithm];
    const hashAlgorithm = new AlgorithmIdentifier({
      algorithmId: shaOid,
      algorithmParams: new asn1js.Null(),
    });
    const maskGenAlgorithm = new AlgorithmIdentifier({
      algorithmId: "1.2.840.113549.1.1.8",
      algorithmParams: hashAlgorithm.toSchema(),
    });
    const pssParams = new pkijs.RSASSAPSSParams({
      hashAlgorithm,
      maskGenAlgorithm,
      saltLength,
    });
    pkcs10.signatureAlgorithm = new AlgorithmIdentifier({
      algorithmId: "1.2.840.113549.1.1.10",
      algorithmParams: pssParams.toSchema(),
    });
  } else {
    pkcs10.signatureAlgorithm = new AlgorithmIdentifier({
      algorithmId: signatureOid,
    });
  }

  // --- Encode TBS and sign ---
  const tbs = (pkcs10 as any).encodeTBS().toBER(false);
  pkcs10.tbs = tbs;

  const signatureBase64 = await signFn(arrayBufferToBase64(tbs));
  const rawSignature = Uint8Array.from(atob(signatureBase64), (c) =>
    c.charCodeAt(0),
  );

  // --- Attach the signature value ---
  if (MLDSA_ALGORITHMS.has(signAlgorithm)) {
    // ML-DSA signatures are opaque byte strings — no DER r||s structure.
    // Client-side verification is not possible without WebCrypto ML-DSA
    // support, so we trust the KMS and skip it.
    pkcs10.signatureValue = new asn1js.BitString({ valueHex: rawSignature.buffer });
    console.log("CSR signed with ML-DSA (", signAlgorithm, ") — client-side verification skipped (WebCrypto not supported).");
  } else if (!signAlgorithm.startsWith("RSA")) {
    const expectedEcdsaLength = ECDSA_RAW_SIGNATURE_LENGTHS[signAlgorithm];
    const conversionResult = rawEcdsaSigToDer(rawSignature, expectedEcdsaLength);
    const finalDerSignature = conversionResult.der;
    pkcs10.signatureValue = new asn1js.BitString({
      valueHex: finalDerSignature,
    });

    // Regression verification across both encodings (logged for diagnostics)
    const verificationResults: Record<string, boolean> = {};
    verificationResults[conversionResult.format] = await pkcs10.verify();

    if (conversionResult.format === "der" && expectedEcdsaLength) {
      const rawRoundTrip = derEcdsaSigToRaw(
        new Uint8Array(finalDerSignature),
        expectedEcdsaLength,
      );
      if (rawRoundTrip) {
        const reconversion = rawEcdsaSigToDer(rawRoundTrip, expectedEcdsaLength);
        pkcs10.signatureValue = new asn1js.BitString({
          valueHex: reconversion.der,
        });
        verificationResults["raw"] = await pkcs10.verify();
        // Restore
        pkcs10.signatureValue = new asn1js.BitString({
          valueHex: finalDerSignature,
        });
      }
    } else if (conversionResult.format === "raw") {
      const derDetection = rawEcdsaSigToDer(
        new Uint8Array(finalDerSignature),
        expectedEcdsaLength,
      );
      pkcs10.signatureValue = new asn1js.BitString({ valueHex: derDetection.der });
      verificationResults["der"] = await pkcs10.verify();
      // Restore
      pkcs10.signatureValue = new asn1js.BitString({
        valueHex: finalDerSignature,
      });
    }

    console.log("CSR Verification Regression Checks:", verificationResults);
  } else {
    // For RSA the raw signature bytes are already the correct encoding
    pkcs10.signatureValue = new asn1js.BitString({ valueHex: rawSignature });

    const ok = await pkcs10.verify();
    console.log("CSR Verification Result (RSA):", ok);
  }

  // --- Serialise to PEM ---
  const finalCsrDer = pkcs10.toSchema().toBER(false);
  return formatAsPem(arrayBufferToBase64(finalCsrDer), "CERTIFICATE REQUEST");
}

// ---------------------------------------------------------------------------
// Self-signed CSR (browser key generation workflows)
// ---------------------------------------------------------------------------

/** Parameters for building a self-signed PKCS#10 CSR from a locally-generated key pair. */

export interface BuildSelfSignedCsrParams {
  subject: CsrSubject;
  sans?: CsrSan[];
  keyPair: CryptoKeyPair;
  /**
   * Hash algorithm name passed to WebCrypto during signing.
   * Defaults to "SHA-256".
   */
  hashAlgorithm?: string;
}

/**
 * Builds a PKCS#10 CSR signed with a locally-generated key pair via
 * WebCrypto.  Suitable for browser-side certificate issuance workflows where
 * the private key never leaves the client.
 *
 * Returns the CSR as a PEM-encoded string.
 */
export async function buildSelfSignedCsr(
  params: BuildSelfSignedCsrParams,
): Promise<string> {
  const { subject, sans = [], keyPair, hashAlgorithm = "SHA-256" } = params;

  const pkcs10 = new CertificationRequest({
    version: 0,
    subject: new pkijs.RelativeDistinguishedNames({ typesAndValues: buildSubjectFields(subject) }),
  });
  pkcs10.attributes = [];

  // --- Import public key ---
  await pkcs10.subjectPublicKeyInfo.importKey(keyPair.publicKey);

  // --- Add SANs if provided ---
  const sanAttribute = buildSanAttribute(sans);
  if (sanAttribute) pkcs10.attributes = [sanAttribute];

  // --- Sign with the local private key ---
  await pkcs10.sign(keyPair.privateKey, hashAlgorithm);

  // --- Serialise to PEM ---
  const csrDer = pkcs10.toSchema().toBER(false);
  return formatAsPem(arrayBufferToBase64(csrDer), "CERTIFICATE REQUEST");
}
