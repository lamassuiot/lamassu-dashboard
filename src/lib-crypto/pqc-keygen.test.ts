import { describe, it, expect } from 'vitest'
import * as asn1js from "asn1js";
import { generateMlDsaKeyPair, generateSlhDsaKeyPair, PqcKeyGenResult } from '@/lib-crypto'
import { ml_dsa44, ml_dsa65, ml_dsa87 } from '@noble/post-quantum/ml-dsa.js';
import { 
  slh_dsa_sha2_128s,
  slh_dsa_sha2_128f,
  slh_dsa_sha2_192s,
  slh_dsa_sha2_192f,
  slh_dsa_sha2_256s,
  slh_dsa_sha2_256f,
  slh_dsa_shake_128s,
  slh_dsa_shake_128f,
  slh_dsa_shake_192s,
  slh_dsa_shake_192f,
  slh_dsa_shake_256s,
  slh_dsa_shake_256f
} from '@noble/post-quantum/slh-dsa.js';

//---------------------------------------------------------------------------------------
//
// Test cases      
//
//---------------------------------------------------------------------------------------

describe('generateMlDsaKeyPair', () => {
  it('should generate a valid ML-DSA-44 key pair', async () => {
    const pqcKeyGenResult = await generateMlDsaKeyPair('ML-DSA-44');
    await validatePqcKeyGenResult(pqcKeyGenResult, ml_dsa44);
  });
  it('should generate a valid ML-DSA-65 key pair', async () => {
    const pqcKeyGenResult = await generateMlDsaKeyPair('ML-DSA-65');
    await validatePqcKeyGenResult(pqcKeyGenResult, ml_dsa65);
  });
  it('should generate a valid ML-DSA-87 key pair', async () => {
    const pqcKeyGenResult = await generateMlDsaKeyPair('ML-DSA-87');
    await validatePqcKeyGenResult(pqcKeyGenResult, ml_dsa87);
  });
});

describe('generateSlhDsaKeyPair', () => {
  it('should generate a valid SLHDSA_SHA2_128s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('1');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_128s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHA2_128f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('2');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_128f);
  }, 1000000);
  it('should generate a valid SLHDSA_SHA2_192s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('3');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_192s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHA2_192f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('4');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_192f);
  }, 1000000);
  it('should generate a valid SLHDSA_SHA2_256s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('5');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_256s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHA2_256f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('6');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_sha2_256f);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_128s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('7');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_128s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_128f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('8');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_128f);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_192s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('9');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_192s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_192f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('10');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_192f);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_256s key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('11');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_256s);
  }, 1000000);
  it('should generate a valid SLHDSA_SHAKE_256f key pair', async () => {
    const pqcKeyGenResult = await generateSlhDsaKeyPair('12');
    await validatePqcKeyGenResult(pqcKeyGenResult, slh_dsa_shake_256f);
  }, 1000000);
});

//---------------------------------------------------------------------------------------
//
// Test scenarios
//
//---------------------------------------------------------------------------------------
async function validatePqcKeyGenResult(
  pqcKeyGenResult: PqcKeyGenResult,
  algo: typeof ml_dsa44
) {
  // Sign a message
  const msg = makeFilled(64, 0x01);
  const signFnOutput = await pqcKeyGenResult.signFn(Buffer.from(msg).toString('base64'));
    
  // Get the private key and sign the message
  const privateKeyBer = parsePEM(pqcKeyGenResult.privateKeyPem, 'PRIVATE KEY');
  const pkcs8 = asn1js.fromBER(privateKeyBer).result as asn1js.Sequence;
  const privateKeyBitString = pkcs8.valueBlock.value[2] as asn1js.OctetString;
  const privateKey = new Uint8Array((privateKeyBitString.valueBlock.value[0] as asn1js.OctetString).valueBlock.valueHexView);
  const sig = algo.sign(msg, privateKey);

  // Get the public key
  const publicKeyBer = parsePEM(pqcKeyGenResult.publicKeyPem, 'PUBLIC KEY');
  const spki = asn1js.fromBER(publicKeyBer).result as asn1js.Sequence;
  const publicKeyBitString = spki.valueBlock.value[1] as asn1js.BitString;
  const publicKey = new Uint8Array(publicKeyBitString.valueBlock.valueHexView);

  // Expect both signed messages to be valid
  expect(algo.verify(sig, msg, publicKey)).toBeTruthy();
  expect(algo.verify(base64ToBytes(signFnOutput), msg, publicKey)).toBeTruthy();
}

//---------------------------------------------------------------------------------------
//
// Internal helpers
//
//---------------------------------------------------------------------------------------

const makeFilled = (length: number, value: number) => new Uint8Array(length).fill(value)

const base64ToBytes = (value: string) => new Uint8Array(Buffer.from(value, 'base64'));

function parsePEM(
  encodedKey: string,
  type: string
): Uint8Array {
  const header = `-----BEGIN ${type}-----\n`;
  const footer = `\n-----END ${type}-----`;

  let base64key = encodedKey.replace(header, '');
  base64key = base64key.replace(footer, '');

  return base64ToBytes(base64key);
}
