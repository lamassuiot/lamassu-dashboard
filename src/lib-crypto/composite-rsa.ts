/**
 * RSA is always the second (traditional, self-delimiting) slot of a
 * composite key, so size() is never relied on to locate a component
 * boundary — only informational, which is why the prototype (no real key)
 * can return an estimate instead of an exact value.
 */

import * as asn1js from "asn1js";
import type { InnerPrivateKey, InnerPublicKey } from "./composite-key";
import { getSubtleCrypto } from "./composite-webcrypto";

const RSA_OID = "1.2.840.113549.1.1.1";

export interface RsaInnerKeyParams {
  bits: number;
  hash: "SHA-256" | "SHA-384" | "SHA-512";
  pss: boolean;
}

function rsaAlgoName(pss: boolean): string {
  return pss ? "RSA-PSS" : "RSASSA-PKCS1-v1_5";
}

function rsaImportAlgorithm(params: RsaInnerKeyParams): RsaHashedImportParams {
  return { name: rsaAlgoName(params.pss), hash: { name: params.hash } };
}

function pssSaltLength(hash: RsaInnerKeyParams["hash"]): number {
  return hash === "SHA-256" ? 32 : hash === "SHA-384" ? 48 : 64;
}

function rsaSignVerifyAlgorithm(params: RsaInnerKeyParams): RsaPssParams | AlgorithmIdentifier {
  return params.pss
    ? { name: "RSA-PSS", saltLength: pssSaltLength(params.hash) }
    : { name: "RSASSA-PKCS1-v1_5" };
}

/** Extracts the inner PKCS#1 RSAPrivateKey DER from a PKCS#8 PrivateKeyInfo. */
function pkcs8ToPkcs1Private(pkcs8Der: ArrayBuffer): ArrayBuffer {
  const asn1Result = asn1js.fromBER(pkcs8Der);
  if (asn1Result.offset === -1) throw new Error("composite: invalid RSA PKCS#8 DER");
  const sequence = asn1Result.result as asn1js.Sequence;
  const octetString = sequence.valueBlock.value[2] as asn1js.OctetString;
  return octetString.valueBlock.valueHexView.slice().buffer;
}

/** Wraps a raw PKCS#1 RSAPrivateKey DER into a PKCS#8 PrivateKeyInfo. */
function pkcs1ToPkcs8Private(pkcs1Der: Uint8Array): ArrayBuffer {
  const pkcs8 = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: RSA_OID }), new asn1js.Null()],
      }),
      new asn1js.OctetString({ valueHex: pkcs1Der.slice().buffer }),
    ],
  });
  return pkcs8.toBER(false);
}

/** Extracts the inner PKCS#1 RSAPublicKey DER from an SPKI SubjectPublicKeyInfo. */
function spkiToPkcs1Public(spkiDer: ArrayBuffer): ArrayBuffer {
  const asn1Result = asn1js.fromBER(spkiDer);
  if (asn1Result.offset === -1) throw new Error("composite: invalid RSA SPKI DER");
  const sequence = asn1Result.result as asn1js.Sequence;
  const bitString = sequence.valueBlock.value[1] as asn1js.BitString;
  return bitString.valueBlock.valueHexView.slice().buffer;
}

/** Wraps a raw PKCS#1 RSAPublicKey DER into an SPKI SubjectPublicKeyInfo. */
function pkcs1ToSpkiPublic(pkcs1Der: Uint8Array): ArrayBuffer {
  const spki = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: RSA_OID }), new asn1js.Null()],
      }),
      new asn1js.BitString({ valueHex: pkcs1Der.slice().buffer }),
    ],
  });
  return spki.toBER(false);
}

/** Approximates the PKCS#1 RSAPrivateKey DER size; never relied on for correctness. */
function estimateRsaPrivateKeyDerSize(bits: number): number {
  const n = bits / 8;
  return n * 4 + Math.floor(n / 2) + 64;
}

/** Approximates the PKCS#1 RSAPublicKey DER size; never relied on for correctness. */
function estimateRsaPublicKeyDerSize(bits: number): number {
  return bits / 8 + 32;
}

async function derivePublicKey(
  params: RsaInnerKeyParams,
  privateKey: CryptoKey,
): Promise<CryptoKey> {
  const subtle = await getSubtleCrypto();
  const jwk = await subtle.exportKey("jwk", privateKey);
  return subtle.importKey("jwk", { kty: "RSA", n: jwk.n, e: jwk.e }, rsaImportAlgorithm(params), true, [
    "verify",
  ]);
}

function newRsaInnerPrivateKey(
  params: RsaInnerKeyParams,
  keyPair?: CryptoKeyPair,
  derSize?: number,
): InnerPrivateKey {
  const size = derSize ?? estimateRsaPrivateKeyDerSize(params.bits);
  return {
    generateKey: () => newRSAPrivateKey(params),
    unmarshall: (data) => newRSAPrivateKeyFromBytes(params, data),
    sign: async (msg) => {
      const subtle = await getSubtleCrypto();
      const signature = await subtle.sign(rsaSignVerifyAlgorithm(params), keyPair!.privateKey, msg);
      return new Uint8Array(signature);
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      const pkcs8 = await subtle.exportKey("pkcs8", keyPair!.privateKey);
      return new Uint8Array(pkcs8ToPkcs1Private(pkcs8));
    },
    public: async () => newRsaInnerPublicKey(params, keyPair!.publicKey),
    size: () => size,
  };
}

export async function newRSAPrivateKey(params: RsaInnerKeyParams): Promise<InnerPrivateKey> {
  const subtle = await getSubtleCrypto();
  const keyPair = (await subtle.generateKey(
    { ...rsaImportAlgorithm(params), modulusLength: params.bits, publicExponent: new Uint8Array([1, 0, 1]) },
    true,
    ["sign", "verify"],
  )) as CryptoKeyPair;
  const pkcs8 = await subtle.exportKey("pkcs8", keyPair.privateKey);
  const derSize = pkcs8ToPkcs1Private(pkcs8).byteLength;
  return newRsaInnerPrivateKey(params, keyPair, derSize);
}

export async function newRSAPrivateKeyFromBytes(
  params: RsaInnerKeyParams,
  data: Uint8Array,
): Promise<InnerPrivateKey> {
  const subtle = await getSubtleCrypto();
  const privateKey = await subtle.importKey(
    "pkcs8",
    pkcs1ToPkcs8Private(data),
    rsaImportAlgorithm(params),
    true,
    ["sign"],
  );
  const publicKey = await derivePublicKey(params, privateKey);
  return newRsaInnerPrivateKey(params, { privateKey, publicKey }, data.byteLength);
}

function newRsaInnerPublicKey(
  params: RsaInnerKeyParams,
  publicKey?: CryptoKey,
  derSize?: number,
): InnerPublicKey {
  const size = derSize ?? estimateRsaPublicKeyDerSize(params.bits);
  const signatureSize = params.bits / 8;
  return {
    unmarshall: (data) => newRSAPublicKeyFromBytes(params, data),
    verify: async (msg, sig) => {
      const subtle = await getSubtleCrypto();
      try {
        return await subtle.verify(rsaSignVerifyAlgorithm(params), publicKey!, sig, msg);
      } catch {
        return false;
      }
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      const spki = await subtle.exportKey("spki", publicKey!);
      return new Uint8Array(spkiToPkcs1Public(spki));
    },
    size: () => size,
    signatureSize: () => signatureSize,
  };
}

export async function newRSAPublicKeyFromBytes(
  params: RsaInnerKeyParams,
  data: Uint8Array,
): Promise<InnerPublicKey> {
  const subtle = await getSubtleCrypto();
  const publicKey = await subtle.importKey(
    "spki",
    pkcs1ToSpkiPublic(data),
    rsaImportAlgorithm(params),
    true,
    ["verify"],
  );
  return newRsaInnerPublicKey(params, publicKey, data.byteLength);
}

export function rsaInnerPrivateKeyPrototype(params: RsaInnerKeyParams): InnerPrivateKey {
  return newRsaInnerPrivateKey(params);
}
export function rsaInnerPublicKeyPrototype(params: RsaInnerKeyParams): InnerPublicKey {
  return newRsaInnerPublicKey(params);
}
