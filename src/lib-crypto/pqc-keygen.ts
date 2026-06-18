import * as asn1js from "asn1js";
import { SIGNATURE_OID_MAP } from "./constants";
import { arrayBufferToBase64, formatAsPem } from "./buffer-utils";

export interface PqcKeyGenResult {
  publicKeyPem: string;
  privateKeyPem: string;
  signAlgorithm: string;
  signFn: (tbsBase64: string) => Promise<string>;
}

const MLDSA_SIGN_ALGORITHMS: Record<string, string> = {
  "ML-DSA-44": "MLDSA_44",
  "ML-DSA-65": "MLDSA_65",
  "ML-DSA-87": "MLDSA_87",
};

function u8buf(arr: Uint8Array): ArrayBuffer {
  if (arr.byteOffset === 0 && arr.byteLength === arr.buffer.byteLength) {
    return arr.buffer as ArrayBuffer;
  }
  return arr.slice().buffer;
}

function encodeSpki(
  algorithmOid: string,
  rawPublicKey: Uint8Array,
): ArrayBuffer {
  const spki = new asn1js.Sequence({
    value: [
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: algorithmOid })],
      }),
      new asn1js.BitString({ valueHex: u8buf(rawPublicKey) }),
    ],
  });
  return spki.toBER(false);
}

function encodePkcs8(
  algorithmOid: string,
  rawSecretKey: Uint8Array,
): ArrayBuffer {
  const innerKey = new asn1js.OctetString({ valueHex: u8buf(rawSecretKey) });
  const pkcs8 = new asn1js.Sequence({
    value: [
      new asn1js.Integer({ value: 0 }),
      new asn1js.Sequence({
        value: [new asn1js.ObjectIdentifier({ value: algorithmOid })],
      }),
      new asn1js.OctetString({ valueHex: innerKey.toBER(false) }),
    ],
  });
  return pkcs8.toBER(false);
}

export async function generateMlDsaKeyPair(
  securityLevel: string,
): Promise<PqcKeyGenResult> {
  const signAlgorithm = MLDSA_SIGN_ALGORITHMS[securityLevel];
  if (!signAlgorithm)
    throw new Error(`Unknown ML-DSA security level: ${securityLevel}`);

  const { ml_dsa44, ml_dsa65, ml_dsa87 } = await import(
    "@noble/post-quantum/ml-dsa.js"
  );
  const algoMap: Record<string, typeof ml_dsa44> = {
    "ML-DSA-44": ml_dsa44,
    "ML-DSA-65": ml_dsa65,
    "ML-DSA-87": ml_dsa87,
  };
  const algo = algoMap[securityLevel];
  const { secretKey, publicKey } = algo.keygen();
  const oid = SIGNATURE_OID_MAP[signAlgorithm];

  return {
    publicKeyPem: formatAsPem(
      arrayBufferToBase64(encodeSpki(oid, publicKey)),
      "PUBLIC KEY",
    ),
    privateKeyPem: formatAsPem(
      arrayBufferToBase64(encodePkcs8(oid, secretKey)),
      "PRIVATE KEY",
    ),
    signAlgorithm,
    signFn: async (tbsBase64: string) => {
      const tbs = Uint8Array.from(atob(tbsBase64), (c) =>
        c.codePointAt(0) ?? 0,
      );
      const sig = algo.sign(tbs, secretKey);
      return arrayBufferToBase64(u8buf(sig));
    },
  };
}

export async function generateSlhDsaKeyPair(
  paramSetId: string,
): Promise<PqcKeyGenResult> {
  const signAlgorithm = `SLHDSA_${paramSetId}`;
  if (!SIGNATURE_OID_MAP[signAlgorithm])
    throw new Error(`Unknown SLH-DSA parameter set: ${paramSetId}`);

  const mod = await import("@noble/post-quantum/slh-dsa.js");
  const algoMap: Record<string, typeof mod.slh_dsa_sha2_128s> = {
    "1": mod.slh_dsa_sha2_128s,
    "2": mod.slh_dsa_sha2_128f,
    "3": mod.slh_dsa_sha2_192s,
    "4": mod.slh_dsa_sha2_192f,
    "5": mod.slh_dsa_sha2_256s,
    "6": mod.slh_dsa_sha2_256f,
    "7": mod.slh_dsa_shake_128s,
    "8": mod.slh_dsa_shake_128f,
    "9": mod.slh_dsa_shake_192s,
    "10": mod.slh_dsa_shake_192f,
    "11": mod.slh_dsa_shake_256s,
    "12": mod.slh_dsa_shake_256f,
  };
  const algo = algoMap[paramSetId];
  if (!algo)
    throw new Error(
      `SLH-DSA parameter set ${paramSetId} not available in noble-post-quantum`,
    );

  const { secretKey, publicKey } = algo.keygen();
  const oid = SIGNATURE_OID_MAP[signAlgorithm];

  return {
    publicKeyPem: formatAsPem(
      arrayBufferToBase64(encodeSpki(oid, publicKey)),
      "PUBLIC KEY",
    ),
    privateKeyPem: formatAsPem(
      arrayBufferToBase64(encodePkcs8(oid, secretKey)),
      "PRIVATE KEY",
    ),
    signAlgorithm,
    signFn: async (tbsBase64: string) => {
      const tbs = Uint8Array.from(atob(tbsBase64), (c) =>
        c.codePointAt(0) ?? 0,
      );
      const sig = algo.sign(tbs, secretKey);
      return arrayBufferToBase64(u8buf(sig));
    },
  };
}
