import type { ml_dsa44 } from "@noble/post-quantum/ml-dsa.js";
import { randomBytes } from "@noble/post-quantum/utils.js";
import type { InnerPrivateKey, InnerPublicKey } from "./composite-key";

/** Any of ml_dsa44 / ml_dsa65 / ml_dsa87 — they share the same shape. */
export type MlDsaAlgo = typeof ml_dsa44;

/** FIPS 204 ML-DSA keygen seeds are always 32 bytes, for every parameter set. */
const MLDSA_SEED_SIZE = 32;

interface MlDsaKeyMaterial {
  seed: Uint8Array;
  secretKey: Uint8Array;
  publicKey: Uint8Array;
}

function newMlDsaInnerPrivateKey(
  params: MlDsaAlgo,
  label: string,
  key?: MlDsaKeyMaterial,
): InnerPrivateKey {
  const context = new TextEncoder().encode(label);
  return {
    generateKey: () => newMLDSAPrivateKey(params, label),
    unmarshall: (data) => newMLDSAPrivateKeyFromBytes(params, label, data),
    sign: async (msg) => params.sign(msg, key!.secretKey, { context }),
    bytes: async () => key!.seed,
    public: async () => newMlDsaInnerPublicKey(params, label, key?.publicKey),
    size: () => MLDSA_SEED_SIZE,
  };
}

export async function newMLDSAPrivateKey(
  params: MlDsaAlgo,
  label: string,
): Promise<InnerPrivateKey> {
  const seed = randomBytes(MLDSA_SEED_SIZE);
  const { secretKey, publicKey } = params.keygen(seed);
  return newMlDsaInnerPrivateKey(params, label, { seed, secretKey, publicKey });
}

export async function newMLDSAPrivateKeyFromBytes(
  params: MlDsaAlgo,
  label: string,
  data: Uint8Array,
): Promise<InnerPrivateKey> {
  if (data.length !== MLDSA_SEED_SIZE) {
    throw new Error(`composite: invalid ML-DSA seed length (${data.length}, expected ${MLDSA_SEED_SIZE})`);
  }
  const { secretKey, publicKey } = params.keygen(data);
  return newMlDsaInnerPrivateKey(params, label, { seed: data, secretKey, publicKey });
}

function newMlDsaInnerPublicKey(
  params: MlDsaAlgo,
  label: string,
  publicKey?: Uint8Array,
): InnerPublicKey {
  const context = new TextEncoder().encode(label);
  return {
    unmarshall: (data) => newMLDSAPublicKeyFromBytes(params, label, data),
    verify: async (msg, sig) => params.verify(sig, msg, publicKey!, { context }),
    bytes: async () => publicKey!,
    size: () => params.lengths.publicKey!,
    signatureSize: () => params.lengths.signature!,
  };
}

export async function newMLDSAPublicKeyFromBytes(
  params: MlDsaAlgo,
  label: string,
  data: Uint8Array,
): Promise<InnerPublicKey> {
  if (data.length !== params.lengths.publicKey) {
    throw new Error(
      `composite: invalid ML-DSA public key length (${data.length}, expected ${params.lengths.publicKey})`,
    );
  }
  return newMlDsaInnerPublicKey(params, label, data);
}

export function mlDsaInnerPrivateKeyPrototype(params: MlDsaAlgo, label: string): InnerPrivateKey {
  return newMlDsaInnerPrivateKey(params, label);
}
export function mlDsaInnerPublicKeyPrototype(params: MlDsaAlgo, label: string): InnerPublicKey {
  return newMlDsaInnerPublicKey(params, label);
}
