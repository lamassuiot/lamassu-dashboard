import { concatBytes } from "./buffer-utils";

/**
 * generateKey/unmarshall don't depend on the receiver's own key material,
 * only on its configuration — they spawn a fresh sibling of the same kind.
 * That's what lets CompositeAlgorithm hold a "prototype" with no real key
 * material, used only to produce a real one on demand.
 */
export interface InnerPrivateKey {
  generateKey(): Promise<InnerPrivateKey>;
  unmarshall(data: Uint8Array): Promise<InnerPrivateKey>;
  public(): Promise<InnerPublicKey>;
  /** msg is already the composite message representative M'. */
  sign(msg: Uint8Array): Promise<Uint8Array>;
  bytes(): Promise<Uint8Array>;
  size(): number;
}

export interface InnerPublicKey {
  unmarshall(data: Uint8Array): Promise<InnerPublicKey>;
  /** msg is already the composite message representative M'. */
  verify(msg: Uint8Array, sig: Uint8Array): Promise<boolean>;
  bytes(): Promise<Uint8Array>;
  size(): number;
  signatureSize(): number;
}

export class CompositePrivateKey {
  constructor(
    private readonly innerSk1: InnerPrivateKey,
    private readonly innerSk2: InnerPrivateKey,
    readonly oid: string,
  ) {}

  async generateKey(): Promise<CompositePrivateKey> {
    const innerSk1 = await this.innerSk1.generateKey();
    const innerSk2 = await this.innerSk2.generateKey();
    return new CompositePrivateKey(innerSk1, innerSk2, this.oid);
  }

  async unmarshall(data: Uint8Array): Promise<CompositePrivateKey> {
    const size = this.innerSk1.size();
    if (data.length <= size) {
      throw new Error("composite: private key data too short");
    }
    const innerSk1 = await this.innerSk1.unmarshall(data.slice(0, size));
    const innerSk2 = await this.innerSk2.unmarshall(data.slice(size));
    return new CompositePrivateKey(innerSk1, innerSk2, this.oid);
  }

  async marshall(): Promise<Uint8Array> {
    const bytes1 = await this.innerSk1.bytes();
    const bytes2 = await this.innerSk2.bytes();
    return concatBytes(bytes1, bytes2);
  }

  /** Signs an already-built composite message representative M'. */
  async signPrime(mPrime: Uint8Array): Promise<Uint8Array> {
    const sig1 = await this.innerSk1.sign(mPrime);
    const sig2 = await this.innerSk2.sign(mPrime);
    return concatBytes(sig1, sig2);
  }

  async public(): Promise<CompositePublicKey> {
    const pk1 = await this.innerSk1.public();
    const pk2 = await this.innerSk2.public();
    return new CompositePublicKey(pk1, pk2, this.oid);
  }
}

export class CompositePublicKey {
  constructor(
    private readonly innerPk1: InnerPublicKey,
    private readonly innerPk2: InnerPublicKey,
    readonly oid: string,
  ) {}

  async unmarshall(data: Uint8Array): Promise<CompositePublicKey> {
    const size = this.innerPk1.size();
    if (data.length <= size) {
      throw new Error("composite: public key data too short");
    }
    const innerPk1 = await this.innerPk1.unmarshall(data.slice(0, size));
    const innerPk2 = await this.innerPk2.unmarshall(data.slice(size));
    return new CompositePublicKey(innerPk1, innerPk2, this.oid);
  }

  async marshall(): Promise<Uint8Array> {
    const bytes1 = await this.innerPk1.bytes();
    const bytes2 = await this.innerPk2.bytes();
    return concatBytes(bytes1, bytes2);
  }

  /** Checks that sig is a valid composite signature over an already-built M'. */
  async verifyPrime(mPrime: Uint8Array, sig: Uint8Array): Promise<boolean> {
    const s1Size = this.innerPk1.signatureSize();
    if (sig.length <= s1Size) return false;
    const valid1 = await this.innerPk1.verify(mPrime, sig.slice(0, s1Size));
    const valid2 = await this.innerPk2.verify(mPrime, sig.slice(s1Size));
    return valid1 && valid2;
  }

  async equal(other: CompositePublicKey): Promise<boolean> {
    if (this.oid !== other.oid) return false;
    const [a, b] = [await this.marshall(), await other.marshall()];
    return a.length === b.length && a.every((byte, i) => byte === b[i]);
  }
}
