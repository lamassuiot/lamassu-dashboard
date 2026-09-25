/**
 * WebCrypto's EC private-key JWK import requires the public coordinates
 * (x, y), which it has no standalone primitive to derive from just the
 * scalar. @noble/curves' getPublicKey (scalar multiplication) is used
 * narrowly for that one derivation step, during unmarshall of a private
 * key; every other ECDSA operation uses WebCrypto directly.
 */

import { p256, p384, p521 } from "@noble/curves/nist";
import { base64UrlDecode, base64UrlEncode, padLeft } from "./buffer-utils";
import type { InnerPrivateKey, InnerPublicKey } from "./composite-key";
import { derEcdsaSigToRaw, rawEcdsaSigToDer } from "./ecdsa-signature";
import { getSubtleCrypto } from "./composite-webcrypto";

export type EcdsaCurveName = "P-256" | "P-384" | "P-521";

interface CurveInfo {
  /** Raw private scalar length: ceil(bitSize / 8). */
  scalarSize: number;
  /** Uncompressed SEC 1 point length: 1 + 2*scalarSize. */
  pointSize: number;
  getPublicKey: (privateKey: Uint8Array, isCompressed: boolean) => Uint8Array;
}

const CURVES: Record<EcdsaCurveName, CurveInfo> = {
  "P-256": { scalarSize: 32, pointSize: 65, getPublicKey: p256.getPublicKey },
  "P-384": { scalarSize: 48, pointSize: 97, getPublicKey: p384.getPublicKey },
  "P-521": { scalarSize: 66, pointSize: 133, getPublicKey: p521.getPublicKey },
};

export interface EcdsaInnerKeyParams {
  curve: EcdsaCurveName;
  hash: "SHA-256" | "SHA-384" | "SHA-512";
}

function ecdsaAlgorithm(params: EcdsaInnerKeyParams): EcKeyImportParams {
  return { name: "ECDSA", namedCurve: params.curve };
}

function newEcdsaInnerPrivateKey(
  params: EcdsaInnerKeyParams,
  keyPair?: CryptoKeyPair,
): InnerPrivateKey {
  const { scalarSize } = CURVES[params.curve];
  return {
    generateKey: () => newECDSAPrivateKey(params),
    unmarshall: (data) => newECDSAPrivateKeyFromBytes(params, data),
    sign: async (msg) => {
      const subtle = await getSubtleCrypto();
      const raw = new Uint8Array(
        await subtle.sign({ name: "ECDSA", hash: params.hash }, keyPair!.privateKey, msg),
      );
      return new Uint8Array(rawEcdsaSigToDer(raw, raw.length).der);
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      const jwk = await subtle.exportKey("jwk", keyPair!.privateKey);
      return padLeft(base64UrlDecode(jwk.d!), scalarSize);
    },
    public: async () => newEcdsaInnerPublicKey(params, keyPair!.publicKey),
    size: () => scalarSize,
  };
}

export async function newECDSAPrivateKey(params: EcdsaInnerKeyParams): Promise<InnerPrivateKey> {
  const subtle = await getSubtleCrypto();
  const keyPair = (await subtle.generateKey(ecdsaAlgorithm(params), true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return newEcdsaInnerPrivateKey(params, keyPair);
}

export async function newECDSAPrivateKeyFromBytes(
  params: EcdsaInnerKeyParams,
  data: Uint8Array,
): Promise<InnerPrivateKey> {
  const { scalarSize, getPublicKey } = CURVES[params.curve];
  if (data.length !== scalarSize) {
    throw new Error(
      `composite: invalid ECDSA scalar length for ${params.curve} (${data.length}, expected ${scalarSize})`,
    );
  }
  const point = getPublicKey(data, false); // uncompressed 0x04 || X || Y
  const x = point.slice(1, 1 + scalarSize);
  const y = point.slice(1 + scalarSize);

  const subtle = await getSubtleCrypto();
  const jwk: JsonWebKey = {
    kty: "EC",
    crv: params.curve,
    d: base64UrlEncode(data),
    x: base64UrlEncode(x),
    y: base64UrlEncode(y),
  };
  const privateKey = await subtle.importKey("jwk", jwk, ecdsaAlgorithm(params), true, ["sign"]);
  const publicKey = await subtle.importKey(
    "jwk",
    { kty: "EC", crv: params.curve, x: jwk.x, y: jwk.y },
    ecdsaAlgorithm(params),
    true,
    ["verify"],
  );
  return newEcdsaInnerPrivateKey(params, { privateKey, publicKey });
}

function newEcdsaInnerPublicKey(
  params: EcdsaInnerKeyParams,
  publicKey?: CryptoKey,
): InnerPublicKey {
  const { pointSize, scalarSize } = CURVES[params.curve];
  return {
    unmarshall: (data) => newECDSAPublicKeyFromBytes(params, data),
    verify: async (msg, sig) => {
      const raw = derEcdsaSigToRaw(sig, 2 * scalarSize);
      if (!raw) return false;
      const subtle = await getSubtleCrypto();
      try {
        return await subtle.verify({ name: "ECDSA", hash: params.hash }, publicKey!, raw, msg);
      } catch {
        return false;
      }
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      return new Uint8Array(await subtle.exportKey("raw", publicKey!));
    },
    size: () => pointSize,
    // ECDSA's ASN.1 (r, s) signature is variable length; this is an upper
    // bound, advisory only — never relied on to locate a component boundary.
    signatureSize: () => 8 + 2 * (scalarSize + 3),
  };
}

export async function newECDSAPublicKeyFromBytes(
  params: EcdsaInnerKeyParams,
  data: Uint8Array,
): Promise<InnerPublicKey> {
  const subtle = await getSubtleCrypto();
  const publicKey = await subtle.importKey("raw", data, ecdsaAlgorithm(params), true, ["verify"]);
  return newEcdsaInnerPublicKey(params, publicKey);
}

export function ecdsaInnerPrivateKeyPrototype(params: EcdsaInnerKeyParams): InnerPrivateKey {
  return newEcdsaInnerPrivateKey(params);
}
export function ecdsaInnerPublicKeyPrototype(params: EcdsaInnerKeyParams): InnerPublicKey {
  return newEcdsaInnerPublicKey(params);
}
