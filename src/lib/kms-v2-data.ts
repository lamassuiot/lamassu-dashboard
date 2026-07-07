// KMS v2 API functions
import { apiFetch } from "./api-client";
import { get_KMS_V2_API_BASE_URL, handleApiError } from "./api-domains";

export const KMS_V2_ALGORITHMS = [
  "RSASSA_PKCS1_V1_5_SHA_256",
  "RSASSA_PKCS1_V1_5_SHA_384",
  "RSASSA_PKCS1_V1_5_SHA_512",
  "RSASSA_PSS_SHA_256",
  "RSASSA_PSS_SHA_384",
  "RSASSA_PSS_SHA_512",
  "RSAES_OAEP_SHA_1",
  "RSAES_OAEP_SHA_256",
  "RSAES_OAEP_SHA_384",
  "RSAES_OAEP_SHA_512",
  "RSAES_PKCS1_V1_5",
  "ECDSA_SHA_256",
  "ECDSA_SHA_384",
  "ECDSA_SHA_512",
  "ED25519",
  "SYMMETRIC_DEFAULT",
  "AES_CBC",
  "HMAC_SHA_256",
  "HMAC_SHA_384",
  "HMAC_SHA_512",
  "ECDH",
  "ML_KEM_768",
  "ML_KEM_1024",
] as const;

export const KMS_V2_KEY_SPECS = [
  "RSA_2048",
  "RSA_3072",
  "RSA_4096",
  "ECC_NIST_P256",
  "ECC_NIST_P384",
  "ECC_NIST_P521",
  "ECC_SECG_P256K1",
  "ED25519",
  "X25519",
  "SYMMETRIC_DEFAULT",
  "AES_128",
  "AES_192",
  "HMAC_256",
  "HMAC_384",
  "HMAC_512",
  "ML_KEM_768",
  "ML_KEM_1024",
] as const;

export const KMS_V2_OPERATIONS = [
  "sign",
  "verify",
  "encrypt",
  "decrypt",
  "wrapKey",
  "unwrapKey",
  "encapsulate",
  "decapsulate",
  "mac",
  "verifyMac",
  "agreeKey",
  "deriveKey",
] as const;

export const KMS_V2_KEY_USAGES = [
  "SIGN_VERIFY",
  "ENCRYPT_DECRYPT",
  "WRAP_UNWRAP",
  "GENERATE_VERIFY_MAC",
  "KEY_AGREEMENT",
  "ENCAPSULATE_DECAPSULATE",
] as const;

export const KMS_V2_KEY_STATES = [
  "enabled",
  "disabled",
  "pendingDeletion",
  "destroyed",
] as const;

export type KmsV2AlgorithmId = (typeof KMS_V2_ALGORITHMS)[number] | string;
export type KmsV2KeySpec = (typeof KMS_V2_KEY_SPECS)[number] | string;
export type KmsV2Operation = (typeof KMS_V2_OPERATIONS)[number];
export type KmsV2KeyUsage = (typeof KMS_V2_KEY_USAGES)[number];
export type KmsV2KeyState = (typeof KMS_V2_KEY_STATES)[number];
export type KmsV2KeyOrigin = "generated" | "imported" | "external";

export interface KmsV2KeyMetadata {
  id: string;
  key_spec: KmsV2KeySpec;
  key_usages?: KmsV2KeyUsage[];
  operations?: KmsV2Operation[];
  state: KmsV2KeyState;
  public_key?: string;
  created_at?: string;
  not_before?: string | null;
  not_after?: string | null;
  origin?: KmsV2KeyOrigin;
  tags?: Record<string, string>;
  policy_id?: string;
}

export interface KmsV2ListKeysResponse {
  keys?: KmsV2KeyMetadata[];
  next_page_token?: string;
}

export interface KmsV2CreateKeyRequest {
  key_spec: KmsV2KeySpec;
  key_usages?: KmsV2KeyUsage[];
  operations?: KmsV2Operation[];
  tags?: Record<string, string>;
  policy_id?: string;
  not_before?: string;
  not_after?: string;
  backend_hint?: string;
  key_material?: string;
}

export interface KmsV2UpdateKeyRequest {
  tags?: Record<string, string>;
  policy_id?: string;
  not_after?: string;
}

export interface KmsV2SetKeyStateRequest {
  state: KmsV2KeyState;
  deletion_scheduled_at?: string;
}

export interface KmsV2StateTransitionResponse {
  id?: string;
  state: KmsV2KeyState;
  previous_state?: KmsV2KeyState;
  transitioned_at?: string;
}

export interface KmsV2BackupKeyResponse {
  key_id?: string;
  backup_blob?: string;
}

export interface KmsV2RestoreKeyRequest {
  backup_blob: string;
}

export interface KmsV2UpsertAliasRequest {
  key_id: string;
}

export interface KmsV2AliasResponse {
  name?: string;
  key_id?: string;
}

export interface KmsV2ListKeysParams {
  page_token?: string | null;
  limit?: number | string;
  filter?: string;
}

const jsonHeaders = { "Content-Type": "application/json" };

export function getKmsV2AllowedOperationsForAlgorithm(algorithm: KmsV2AlgorithmId): KmsV2Operation[] {
  if (algorithm.startsWith("RSASSA_") || algorithm.startsWith("ECDSA_") || algorithm === "ED25519") {
    return ["sign", "verify"];
  }

  if (algorithm.startsWith("RSAES_OAEP_")) {
    return ["encrypt", "decrypt", "wrapKey", "unwrapKey"];
  }

  if (algorithm === "RSAES_PKCS1_V1_5") {
    return ["decrypt", "unwrapKey"];
  }

  if (algorithm === "ECDH") {
    return ["agreeKey", "deriveKey"];
  }

  if (algorithm === "SYMMETRIC_DEFAULT") {
    return ["encrypt", "decrypt"];
  }

  if (algorithm === "AES_CBC") {
    return ["decrypt"];
  }

  if (algorithm.startsWith("HMAC_")) {
    return ["mac", "verifyMac"];
  }

  if (algorithm.startsWith("ML_KEM_")) {
    return ["encapsulate", "decapsulate"];
  }

  return [...KMS_V2_OPERATIONS];
}

export function getKmsV2AllowedKeyUsages(keySpec: KmsV2KeySpec): KmsV2KeyUsage[] {
  if (keySpec.startsWith("RSA_")) {
    return ["SIGN_VERIFY", "ENCRYPT_DECRYPT", "WRAP_UNWRAP"];
  }

  if (keySpec.startsWith("ECC_NIST_") || keySpec === "ECC_SECG_P256K1") {
    return ["SIGN_VERIFY", "KEY_AGREEMENT"];
  }

  if (keySpec === "ED25519") {
    return ["SIGN_VERIFY"];
  }

  if (keySpec === "X25519") {
    return ["KEY_AGREEMENT"];
  }

  if (keySpec === "SYMMETRIC_DEFAULT" || keySpec.startsWith("AES_")) {
    return ["ENCRYPT_DECRYPT"];
  }

  if (keySpec.startsWith("HMAC_")) {
    return ["GENERATE_VERIFY_MAC"];
  }

  if (keySpec.startsWith("ML_KEM_")) {
    return ["ENCAPSULATE_DECAPSULATE", "WRAP_UNWRAP"];
  }

  return [...KMS_V2_KEY_USAGES];
}

export function getKmsV2DefaultKeyUsages(keySpec: KmsV2KeySpec): KmsV2KeyUsage[] {
  return getKmsV2AllowedKeyUsages(keySpec);
}

export function getKmsV2KeyUsagesFromOperations(operations?: KmsV2Operation[]): KmsV2KeyUsage[] {
  const set = new Set(operations ?? []);
  const usages: KmsV2KeyUsage[] = [];

  if (set.has("sign") || set.has("verify")) usages.push("SIGN_VERIFY");
  if (set.has("encrypt") || set.has("decrypt")) usages.push("ENCRYPT_DECRYPT");
  if (set.has("wrapKey") || set.has("unwrapKey")) usages.push("WRAP_UNWRAP");
  if (set.has("mac") || set.has("verifyMac")) usages.push("GENERATE_VERIFY_MAC");
  if (set.has("agreeKey") || set.has("deriveKey")) usages.push("KEY_AGREEMENT");
  if (set.has("encapsulate") || set.has("decapsulate")) usages.push("ENCAPSULATE_DECAPSULATE");

  return usages;
}

export async function listKmsV2Keys(params: KmsV2ListKeysParams = {}): Promise<KmsV2ListKeysResponse> {
  const url = new URL(`${get_KMS_V2_API_BASE_URL()}/keys`);
  if (params.page_token) url.searchParams.set("page_token", params.page_token);
  if (params.limit) url.searchParams.set("limit", String(params.limit));
  if (params.filter?.trim()) url.searchParams.set("filter", params.filter.trim());

  const response = await apiFetch(url.toString());
  return handleApiError<KmsV2ListKeysResponse>(response, "Failed to fetch KMS v2 keys");
}

export async function getKmsV2Key(keyId: string): Promise<KmsV2KeyMetadata> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`);
  return handleApiError<KmsV2KeyMetadata>(response, "Failed to fetch KMS v2 key");
}

export async function createOrImportKmsV2Key(payload: KmsV2CreateKeyRequest): Promise<KmsV2KeyMetadata> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleApiError<KmsV2KeyMetadata>(response, "Failed to create or import KMS v2 key");
}

export async function updateKmsV2Key(keyId: string, payload: KmsV2UpdateKeyRequest): Promise<KmsV2KeyMetadata> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`, {
    method: "PATCH",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleApiError<KmsV2KeyMetadata>(response, "Failed to update KMS v2 key");
}

export async function deleteKmsV2Key(keyId: string, pendingDays?: number): Promise<{ id?: string; state?: KmsV2KeyState } | null> {
  const url = new URL(`${get_KMS_V2_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}`);
  if (pendingDays !== undefined) url.searchParams.set("pending_days", String(pendingDays));

  const response = await apiFetch(url.toString(), { method: "DELETE" });
  return handleApiError<{ id?: string; state?: KmsV2KeyState } | null>(response, "Failed to schedule KMS v2 key deletion");
}

export async function setKmsV2KeyState(keyId: string, payload: KmsV2SetKeyStateRequest): Promise<KmsV2StateTransitionResponse> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/state`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleApiError<KmsV2StateTransitionResponse>(response, "Failed to update KMS v2 key state");
}

export async function backupKmsV2Key(keyId: string): Promise<KmsV2BackupKeyResponse> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys/${encodeURIComponent(keyId)}/backup`, {
    method: "PUT",
  });
  return handleApiError<KmsV2BackupKeyResponse>(response, "Failed to backup KMS v2 key");
}

export async function restoreKmsV2Key(payload: KmsV2RestoreKeyRequest): Promise<KmsV2KeyMetadata> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/keys/restore`, {
    method: "POST",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleApiError<KmsV2KeyMetadata>(response, "Failed to restore KMS v2 key");
}

export async function resolveKmsV2Alias(name: string): Promise<KmsV2KeyMetadata> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/aliases/${encodeURIComponent(name)}`);
  return handleApiError<KmsV2KeyMetadata>(response, "Failed to resolve KMS v2 alias");
}

export async function upsertKmsV2Alias(name: string, payload: KmsV2UpsertAliasRequest): Promise<KmsV2AliasResponse> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/aliases/${encodeURIComponent(name)}`, {
    method: "PUT",
    headers: jsonHeaders,
    body: JSON.stringify(payload),
  });
  return handleApiError<KmsV2AliasResponse>(response, "Failed to upsert KMS v2 alias");
}

export async function deleteKmsV2Alias(name: string): Promise<void> {
  const response = await apiFetch(`${get_KMS_V2_API_BASE_URL()}/aliases/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
  await handleApiError(response, "Failed to delete KMS v2 alias");
}
