/**
 * WebCrypto's OKP JWK import rejects a private key with `d` but no `x` in
 * this project's tested runtime. RFC 8410's PKCS#8 OneAsymmetricKey
 * encoding carries only the seed, and WebCrypto derives the public key
 * itself on import — so PKCS#8 is used here instead of JWK.
 */

import * as asn1js from "asn1js";
import { base64UrlDecode } from "./buffer-utils";
import type { InnerPrivateKey, InnerPublicKey } from "./composite-key";
import { getSubtleCrypto } from "./composite-webcrypto";

const ED25519_SEED_SIZE = 32;
const ED25519_PUBLIC_KEY_SIZE = 32;
const ED25519_SIGNATURE_SIZE = 64;
const ED25519_OID = "1.3.101.112";

const ED25519_ALGORITHM: KeyAlgorithm = { name: "Ed25519" };

/** Wraps a raw 32-byte seed into an RFC 8410 PKCS#8 OneAsymmetricKey. */
function seedToPkcs8(seed: Uint8Array): ArrayBuffer {
  const innerSeed = new asn1js.OctetString({ valueHex: seed.slice().buffer });
  const pkcs8 = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Sequence({ value: [new asn1js.ObjectIdentifier({ value: ED25519_OID })] }),
      new asn1js.OctetString({ valueHex: innerSeed.toBER(false) }),
    ],
  });
  return pkcs8.toBER(false);
}

function newEd25519InnerPrivateKey(keyPair?: CryptoKeyPair): InnerPrivateKey {
  return {
    generateKey: () => newEd25519PrivateKey(),
    unmarshall: (data) => newEd25519PrivateKeyFromBytes(data),
    sign: async (msg) => {
      const subtle = await getSubtleCrypto();
      return new Uint8Array(await subtle.sign(ED25519_ALGORITHM, keyPair!.privateKey, msg));
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      const jwk = await subtle.exportKey("jwk", keyPair!.privateKey);
      return base64UrlDecode(jwk.d!);
    },
    public: async () => newEd25519InnerPublicKey(keyPair!.publicKey),
    size: () => ED25519_SEED_SIZE,
  };
}

export async function newEd25519PrivateKey(): Promise<InnerPrivateKey> {
  const subtle = await getSubtleCrypto();
  const keyPair = (await subtle.generateKey(ED25519_ALGORITHM, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  return newEd25519InnerPrivateKey(keyPair);
}

export async function newEd25519PrivateKeyFromBytes(data: Uint8Array): Promise<InnerPrivateKey> {
  if (data.length !== ED25519_SEED_SIZE) {
    throw new Error(`composite: invalid Ed25519 private key seed length (${data.length}, expected ${ED25519_SEED_SIZE})`);
  }
  const subtle = await getSubtleCrypto();
  const privateKey = await subtle.importKey("pkcs8", seedToPkcs8(data), ED25519_ALGORITHM, true, ["sign"]);
  const derivedJwk = await subtle.exportKey("jwk", privateKey);
  const publicKey = await subtle.importKey(
    "jwk",
    { kty: "OKP", crv: "Ed25519", x: derivedJwk.x },
    ED25519_ALGORITHM,
    true,
    ["verify"],
  );
  return newEd25519InnerPrivateKey({ privateKey, publicKey });
}

function newEd25519InnerPublicKey(publicKey?: CryptoKey): InnerPublicKey {
  return {
    unmarshall: (data) => newEd25519PublicKeyFromBytes(data),
    verify: async (msg, sig) => {
      const subtle = await getSubtleCrypto();
      try {
        return await subtle.verify(ED25519_ALGORITHM, publicKey!, sig, msg);
      } catch {
        return false;
      }
    },
    bytes: async () => {
      const subtle = await getSubtleCrypto();
      return new Uint8Array(await subtle.exportKey("raw", publicKey!));
    },
    size: () => ED25519_PUBLIC_KEY_SIZE,
    signatureSize: () => ED25519_SIGNATURE_SIZE,
  };
}

export async function newEd25519PublicKeyFromBytes(data: Uint8Array): Promise<InnerPublicKey> {
  if (data.length !== ED25519_PUBLIC_KEY_SIZE) {
    throw new Error(`composite: invalid Ed25519 public key length (${data.length}, expected ${ED25519_PUBLIC_KEY_SIZE})`);
  }
  const subtle = await getSubtleCrypto();
  const publicKey = await subtle.importKey("raw", data, ED25519_ALGORITHM, true, ["verify"]);
  return newEd25519InnerPublicKey(publicKey);
}

export function ed25519InnerPrivateKeyPrototype(): InnerPrivateKey {
  return newEd25519InnerPrivateKey();
}
export function ed25519InnerPublicKeyPrototype(): InnerPublicKey {
  return newEd25519InnerPublicKey();
}
