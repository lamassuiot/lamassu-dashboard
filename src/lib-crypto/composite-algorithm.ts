import * as asn1js from "asn1js";
import { ml_dsa44, ml_dsa65, ml_dsa87 } from "@noble/post-quantum/ml-dsa.js";
import * as pkijs from "pkijs";
import { encodePkcs8, encodeSpki, u8buf } from "./pqc-keygen";
import { arrayBufferToBase64, formatAsPem, pemToArrayBuffer } from "./buffer-utils";
import { SIGNATURE_OID_MAP } from "./constants";
import { CompositePrivateKey, CompositePublicKey } from "./composite-key";
import {
  mlDsaInnerPrivateKeyPrototype,
  mlDsaInnerPublicKeyPrototype,
  type MlDsaAlgo,
} from "./composite-mldsa";
import {
  rsaInnerPrivateKeyPrototype,
  rsaInnerPublicKeyPrototype,
  type RsaInnerKeyParams,
} from "./composite-rsa";
import {
  ecdsaInnerPrivateKeyPrototype,
  ecdsaInnerPublicKeyPrototype,
  type EcdsaInnerKeyParams,
} from "./composite-ecdsa";
import { ed25519InnerPrivateKeyPrototype, ed25519InnerPublicKeyPrototype } from "./composite-ed25519";

type PhHash = "SHA-256" | "SHA-512";

const COMPOSITE_DOMAIN_PREFIX = new TextEncoder().encode("CompositeAlgorithmSignatures2025");

/**
 * M' has two shapes per the composite-sigs draft, chosen once here rather
 * than branched on every call:
 *
 *   M' = Prefix || Label || len(ctx) || ctx || PH(msg)                 (ML-DSA)
 *   M' = Prefix || len(Label) || Label || len(ctx) || ctx || PH(msg)   (otherwise)
 */
function newBuildMPrime(
  isMLDSA: boolean,
  hash: PhHash,
  label: string,
): (msg: Uint8Array, ctx: Uint8Array) => Promise<Uint8Array> {
  const labelBytes = new TextEncoder().encode(label);
  const ph = async (msg: Uint8Array): Promise<Uint8Array> =>
    new Uint8Array(await crypto.subtle.digest(hash, msg));

  if (isMLDSA) {
    return async (msg, ctx) => {
      if (ctx.length > 255) throw new Error("composite: context string too long (max 255 bytes)");
      const phMsg = await ph(msg);
      const mPrime = new Uint8Array(
        COMPOSITE_DOMAIN_PREFIX.length + labelBytes.length + 1 + ctx.length + phMsg.length,
      );
      let offset = 0;
      mPrime.set(COMPOSITE_DOMAIN_PREFIX, offset); offset += COMPOSITE_DOMAIN_PREFIX.length;
      mPrime.set(labelBytes, offset); offset += labelBytes.length;
      mPrime[offset] = ctx.length; offset += 1;
      mPrime.set(ctx, offset); offset += ctx.length;
      mPrime.set(phMsg, offset);
      return mPrime;
    };
  }
  return async (msg, ctx) => {
    if (ctx.length > 255) throw new Error("composite: context string too long (max 255 bytes)");
    if (labelBytes.length > 255) throw new Error("composite: label too long (max 255 bytes)");
    const phMsg = await ph(msg);
    const mPrime = new Uint8Array(
      COMPOSITE_DOMAIN_PREFIX.length + 1 + labelBytes.length + 1 + ctx.length + phMsg.length,
    );
    let offset = 0;
    mPrime.set(COMPOSITE_DOMAIN_PREFIX, offset); offset += COMPOSITE_DOMAIN_PREFIX.length;
    mPrime[offset] = labelBytes.length; offset += 1;
    mPrime.set(labelBytes, offset); offset += labelBytes.length;
    mPrime[offset] = ctx.length; offset += 1;
    mPrime.set(ctx, offset); offset += ctx.length;
    mPrime.set(phMsg, offset);
    return mPrime;
  };
}

export class CompositeAlgorithm {
  private readonly buildMPrime: (msg: Uint8Array, ctx: Uint8Array) => Promise<Uint8Array>;
  private readonly privateKeyPrototype: CompositePrivateKey;
  private readonly publicKeyPrototype: CompositePublicKey;

  constructor(
    readonly name: string,
    readonly label: string,
    readonly oid: string,
    isMLDSA: boolean,
    phHash: PhHash,
    privProto1: import("./composite-key").InnerPrivateKey,
    privProto2: import("./composite-key").InnerPrivateKey,
    pubProto1: import("./composite-key").InnerPublicKey,
    pubProto2: import("./composite-key").InnerPublicKey,
  ) {
    this.buildMPrime = newBuildMPrime(isMLDSA, phHash, label);
    this.privateKeyPrototype = new CompositePrivateKey(privProto1, privProto2, oid);
    this.publicKeyPrototype = new CompositePublicKey(pubProto1, pubProto2, oid);
  }

  async generateCompositeKey(): Promise<{ publicKey: CompositePublicKey; privateKey: CompositePrivateKey }> {
    const privateKey = await this.privateKeyPrototype.generateKey();
    const publicKey = await privateKey.public();
    return { publicKey, privateKey };
  }

  /** ctx is the optional context string (max 255 bytes; defaults to empty). */
  async compositeSign(sk: CompositePrivateKey, msg: Uint8Array, ctx: Uint8Array = new Uint8Array()): Promise<Uint8Array> {
    const mPrime = await this.buildMPrime(msg, ctx);
    return sk.signPrime(mPrime);
  }

  /** ctx must match the context string used during signing. */
  async compositeVerify(pk: CompositePublicKey, msg: Uint8Array, ctx: Uint8Array, sig: Uint8Array): Promise<boolean> {
    const mPrime = await this.buildMPrime(msg, ctx);
    return pk.verifyPrime(mPrime, sig);
  }

  async parseCompositePublicKeyRaw(data: Uint8Array): Promise<CompositePublicKey> {
    return this.publicKeyPrototype.unmarshall(data);
  }

  async parseCompositePrivateKeyRaw(data: Uint8Array): Promise<CompositePrivateKey> {
    return this.privateKeyPrototype.unmarshall(data);
  }
}

function newCompositeAlgorithm(
  name: string,
  label: string,
  oid: string,
  isMLDSA: boolean,
  phHash: PhHash,
  mlDsaParams: MlDsaAlgo,
  secondPrivProto: import("./composite-key").InnerPrivateKey,
  secondPubProto: import("./composite-key").InnerPublicKey,
): CompositeAlgorithm {
  return new CompositeAlgorithm(
    name,
    label,
    oid,
    isMLDSA,
    phHash,
    mlDsaInnerPrivateKeyPrototype(mlDsaParams, label),
    secondPrivProto,
    mlDsaInnerPublicKeyPrototype(mlDsaParams, label),
    secondPubProto,
  );
}

function rsaProto(params: RsaInnerKeyParams) {
  return { priv: rsaInnerPrivateKeyPrototype(params), pub: rsaInnerPublicKeyPrototype(params) };
}
function ecdsaProto(params: EcdsaInnerKeyParams) {
  return { priv: ecdsaInnerPrivateKeyPrototype(params), pub: ecdsaInnerPublicKeyPrototype(params) };
}
function ed25519Proto() {
  return { priv: ed25519InnerPrivateKeyPrototype(), pub: ed25519InnerPublicKeyPrototype() };
}

const rsa1 = rsaProto({ bits: 2048, hash: "SHA-256", pss: true });
const rsa2 = rsaProto({ bits: 2048, hash: "SHA-256", pss: false });
const rsa3 = rsaProto({ bits: 3072, hash: "SHA-256", pss: true });
const rsa4 = rsaProto({ bits: 3072, hash: "SHA-256", pss: false });
const rsa5 = rsaProto({ bits: 4096, hash: "SHA-384", pss: true });
const rsa6 = rsaProto({ bits: 4096, hash: "SHA-384", pss: false });
const rsa7 = rsaProto({ bits: 3072, hash: "SHA-256", pss: true });
const rsa8 = rsaProto({ bits: 4096, hash: "SHA-384", pss: true });

const ecdsa9 = ecdsaProto({ curve: "P-256", hash: "SHA-256" });
const ecdsa10 = ecdsaProto({ curve: "P-256", hash: "SHA-512" });
const ecdsa11 = ecdsaProto({ curve: "P-384", hash: "SHA-512" });
const ecdsa12 = ecdsaProto({ curve: "P-384", hash: "SHA-512" });
const ecdsa13 = ecdsaProto({ curve: "P-521", hash: "SHA-512" });

const ed14 = ed25519Proto();
const ed15 = ed25519Proto();

export const COMPOSITE_ALGORITHMS_BY_ID: Record<string, CompositeAlgorithm> = {
  COMPOSITE_MLDSA_RSA_1: newCompositeAlgorithm(
    "MLDSA44-RSA2048-PSS-SHA256", "COMPSIG-MLDSA44-RSA2048-PSS-SHA256",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_1, true, "SHA-256", ml_dsa44, rsa1.priv, rsa1.pub,
  ),
  COMPOSITE_MLDSA_RSA_2: newCompositeAlgorithm(
    "MLDSA44-RSA2048-PKCS15-SHA256", "COMPSIG-MLDSA44-RSA2048-PKCS15-SHA256",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_2, true, "SHA-256", ml_dsa44, rsa2.priv, rsa2.pub,
  ),
  COMPOSITE_MLDSA_RSA_3: newCompositeAlgorithm(
    "MLDSA65-RSA3072-PSS-SHA512", "COMPSIG-MLDSA65-RSA3072-PSS-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_3, true, "SHA-512", ml_dsa65, rsa3.priv, rsa3.pub,
  ),
  COMPOSITE_MLDSA_RSA_4: newCompositeAlgorithm(
    "MLDSA65-RSA3072-PKCS15-SHA512", "COMPSIG-MLDSA65-RSA3072-PKCS15-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_4, true, "SHA-512", ml_dsa65, rsa4.priv, rsa4.pub,
  ),
  COMPOSITE_MLDSA_RSA_5: newCompositeAlgorithm(
    "MLDSA65-RSA4096-PSS-SHA512", "COMPSIG-MLDSA65-RSA4096-PSS-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_5, true, "SHA-512", ml_dsa65, rsa5.priv, rsa5.pub,
  ),
  COMPOSITE_MLDSA_RSA_6: newCompositeAlgorithm(
    "MLDSA65-RSA4096-PKCS15-SHA512", "COMPSIG-MLDSA65-RSA4096-PKCS15-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_6, true, "SHA-512", ml_dsa65, rsa6.priv, rsa6.pub,
  ),
  COMPOSITE_MLDSA_RSA_7: newCompositeAlgorithm(
    "MLDSA87-RSA3072-PSS-SHA512", "COMPSIG-MLDSA87-RSA3072-PSS-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_7, true, "SHA-512", ml_dsa87, rsa7.priv, rsa7.pub,
  ),
  COMPOSITE_MLDSA_RSA_8: newCompositeAlgorithm(
    "MLDSA87-RSA4096-PSS-SHA512", "COMPSIG-MLDSA87-RSA4096-PSS-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_RSA_8, true, "SHA-512", ml_dsa87, rsa8.priv, rsa8.pub,
  ),

  // Brainpool-curve entries have no browser-native curve implementation
  // and are intentionally omitted.
  COMPOSITE_MLDSA_ECDSA_9: newCompositeAlgorithm(
    "MLDSA44-ECDSA-P256-SHA256", "COMPSIG-MLDSA44-ECDSA-P256-SHA256",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_9, true, "SHA-256", ml_dsa44, ecdsa9.priv, ecdsa9.pub,
  ),
  COMPOSITE_MLDSA_ECDSA_10: newCompositeAlgorithm(
    "MLDSA65-ECDSA-P256-SHA512", "COMPSIG-MLDSA65-ECDSA-P256-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_10, true, "SHA-512", ml_dsa65, ecdsa10.priv, ecdsa10.pub,
  ),
  COMPOSITE_MLDSA_ECDSA_11: newCompositeAlgorithm(
    "MLDSA65-ECDSA-P384-SHA512", "COMPSIG-MLDSA65-ECDSA-P384-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_11, true, "SHA-512", ml_dsa65, ecdsa11.priv, ecdsa11.pub,
  ),
  COMPOSITE_MLDSA_ECDSA_12: newCompositeAlgorithm(
    "MLDSA87-ECDSA-P384-SHA512", "COMPSIG-MLDSA87-ECDSA-P384-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_12, true, "SHA-512", ml_dsa87, ecdsa12.priv, ecdsa12.pub,
  ),
  COMPOSITE_MLDSA_ECDSA_13: newCompositeAlgorithm(
    "MLDSA87-ECDSA-P521-SHA512", "COMPSIG-MLDSA87-ECDSA-P521-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ECDSA_13, true, "SHA-512", ml_dsa87, ecdsa13.priv, ecdsa13.pub,
  ),

  // The draft defines no ML-DSA-87+Ed25519 combination (ML-DSA-87 pairs
  // with Ed448 instead, which isn't implemented here).
  COMPOSITE_MLDSA_ED25519_14: newCompositeAlgorithm(
    "MLDSA44-Ed25519-SHA512", "COMPSIG-MLDSA44-Ed25519-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ED25519_14, true, "SHA-512", ml_dsa44, ed14.priv, ed14.pub,
  ),
  COMPOSITE_MLDSA_ED25519_15: newCompositeAlgorithm(
    "MLDSA65-Ed25519-SHA512", "COMPSIG-MLDSA65-Ed25519-SHA512",
    SIGNATURE_OID_MAP.COMPOSITE_MLDSA_ED25519_15, true, "SHA-512", ml_dsa65, ed15.priv, ed15.pub,
  ),
};

export const COMPOSITE_ALGORITHMS: CompositeAlgorithm[] = Object.values(COMPOSITE_ALGORITHMS_BY_ID);

const compositeAlgorithmsByOid = new Map<string, CompositeAlgorithm>(
  COMPOSITE_ALGORITHMS.map((algorithm) => [algorithm.oid, algorithm]),
);

export function compositeAlgorithmByOid(oid: string): CompositeAlgorithm | undefined {
  return compositeAlgorithmsByOid.get(oid);
}

export function compositeAlgorithmByAlgorithmId(algorithmId: string): CompositeAlgorithm | undefined {
  return COMPOSITE_ALGORITHMS_BY_ID[algorithmId];
}

export interface CompositeKeyGenResult {
  publicKeyPem: string;
  privateKeyPem: string;
  signAlgorithm: string;
  signFn: (tbsBase64: string) => Promise<string>;
}

export async function generateCompositeKeyPair(algorithmId: string): Promise<CompositeKeyGenResult> {
  const algorithm = compositeAlgorithmByAlgorithmId(algorithmId);
  if (!algorithm) throw new Error(`Unknown composite algorithm: ${algorithmId}`);

  const { publicKey, privateKey } = await algorithm.generateCompositeKey();
  const publicKeyBytes = await publicKey.marshall();
  const privateKeyBytes = await privateKey.marshall();

  return {
    publicKeyPem: formatAsPem(
      arrayBufferToBase64(encodeSpki(algorithm.oid, publicKeyBytes)),
      "PUBLIC KEY",
    ),
    privateKeyPem: formatAsPem(
      arrayBufferToBase64(encodePkcs8(algorithm.oid, privateKeyBytes)),
      "PRIVATE KEY",
    ),
    signAlgorithm: algorithmId,
    signFn: async (tbsBase64: string) => {
      const tbs = Uint8Array.from(atob(tbsBase64), (c) => c.codePointAt(0) ?? 0);
      const signature = await algorithm.compositeSign(privateKey, tbs);
      return arrayBufferToBase64(u8buf(signature));
    },
  };
}

export async function importCompositePublicKeyFromPem(
  pem: string,
): Promise<{ algorithm: CompositeAlgorithm; publicKey: CompositePublicKey }> {
  const der = pemToArrayBuffer(pem, "PUBLIC KEY");
  const asn1Result = asn1js.fromBER(der);
  if (asn1Result.offset === -1) throw new Error("composite: invalid public key DER");
  const publicKeyInfo = new pkijs.PublicKeyInfo({ schema: asn1Result.result });
  const oid = publicKeyInfo.algorithm.algorithmId;
  const algorithm = compositeAlgorithmByOid(oid);
  if (!algorithm) throw new Error(`composite: unknown algorithm OID ${oid}`);

  const rawKey = new Uint8Array(publicKeyInfo.subjectPublicKey.valueBlock.valueHexView);
  const publicKey = await algorithm.parseCompositePublicKeyRaw(rawKey);
  return { algorithm, publicKey };
}

export async function importCompositePrivateKeyFromPem(
  pem: string,
): Promise<{ algorithm: CompositeAlgorithm; privateKey: CompositePrivateKey }> {
  const der = pemToArrayBuffer(pem, "PRIVATE KEY");
  const asn1Result = asn1js.fromBER(der);
  if (asn1Result.offset === -1) throw new Error("composite: invalid private key DER");
  const privateKeyInfo = new pkijs.PrivateKeyInfo({ schema: asn1Result.result });
  const oid = privateKeyInfo.privateKeyAlgorithm.algorithmId;
  const algorithm = compositeAlgorithmByOid(oid);
  if (!algorithm) throw new Error(`composite: unknown algorithm OID ${oid}`);

  // encodePkcs8 wraps the raw key in an inner OCTET STRING before embedding
  // it in PrivateKeyInfo's own `privateKey` OCTET STRING; unwrap both layers.
  const innerAsn1 = asn1js.fromBER(privateKeyInfo.privateKey.valueBlock.valueHexView);
  if (innerAsn1.offset === -1) throw new Error("composite: invalid private key DER");
  const rawKey = new Uint8Array((innerAsn1.result as asn1js.OctetString).valueBlock.valueHexView);
  const privateKey = await algorithm.parseCompositePrivateKeyRaw(rawKey);
  return { algorithm, privateKey };
}

export async function signWithCompositePrivateKeyPem(
  privateKeyPem: string,
  message: Uint8Array,
  ctx: Uint8Array = new Uint8Array(),
): Promise<Uint8Array> {
  const { algorithm, privateKey } = await importCompositePrivateKeyFromPem(privateKeyPem);
  return algorithm.compositeSign(privateKey, message, ctx);
}

export async function verifyCompositeSignatureWithPublicKeyPem(
  publicKeyPem: string,
  message: Uint8Array,
  signature: Uint8Array,
  ctx: Uint8Array = new Uint8Array(),
): Promise<boolean> {
  const { algorithm, publicKey } = await importCompositePublicKeyFromPem(publicKeyPem);
  return algorithm.compositeVerify(publicKey, message, ctx, signature);
}
