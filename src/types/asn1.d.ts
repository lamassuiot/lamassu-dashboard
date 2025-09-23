// Type declarations for @lapo/asn1js
declare module '@lapo/asn1js' {
  export class Stream {
    constructor(enc: string | Uint8Array | number[], pos?: number);
    get(pos?: number): number;
    hexDump(start: number, end: number, type?: string): string;
    b64Dump(start: number, end: number, type?: string): string;
    pos: number;
    enc: string | Uint8Array | number[];
    length: number;
  }

  export class ASN1 {
    constructor(stream: Stream, header: number, length: number, tag: any, tagLen: number, sub: ASN1[] | null);
    static decode(stream: Stream, offset?: number, type?: any): ASN1;
    toPrettyString(indent?: string): string;
    toHexString(type?: string): string;
    toB64String(type?: string): string;
    content(maxLength?: number): string;
    typeName(): string;
    stream: Stream;
    header: number;
    length: number;
    tag: any;
    tagLen: number;
    sub: ASN1[] | null;
  }
}

declare module '@lapo/asn1js/hex.js' {
  export class Hex {
    static decode(hexString: string): Uint8Array;
    static encode(bytes: Uint8Array): string;
  }
}

declare module '@lapo/asn1js/base64.js' {
  export class Base64 {
    static decode(base64String: string): Uint8Array;
    static encode(bytes: Uint8Array): string;
  }
}