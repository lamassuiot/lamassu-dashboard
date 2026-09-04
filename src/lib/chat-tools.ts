import type {
  ChatCompletionMessageToolCall,
  ChatCompletionTool,
  ChatCompletionToolMessageParam,
  FunctionParameters,
} from '@mlc-ai/web-llm';
import {
  deleteCa,
  deleteSigningProfile,
  fetchAndProcessCAs,
  fetchCaStatsSummary,
  fetchSigningProfileById,
  fetchSigningProfiles,
  revokeCa,
} from '@/lib/ca-data';
import {
  decommissionDevice,
  deleteDevice,
  fetchDeviceStats,
  fetchDeviceById,
  fetchDevices,
} from '@/lib/devices-api';
import {
  deleteRa,
  fetchDmsStats,
  fetchRegistrationAuthorities,
  fetchRaById,
} from '@/lib/dms-api';
import { deleteKmsKey, fetchCryptoEngines, fetchKmsKey, fetchKmsKeys } from '@/lib/kms-data';
import { appendCertificateQueryFilters } from '@/lib/certificate-filter-query';
import { fetchIssuedCertificates, updateCertificateStatus } from '@/lib/issued-certificate-data';
import { revocationReasons } from '@/lib/revocation-reasons';
import { checkOcspStatus } from '@/lib/va-api';
import type { CertificateData } from '@/types/certificate';

export type ChatToolStatus = 'pending' | 'running' | 'complete' | 'error' | 'denied';
export type ChatToolState = 'approval-requested' | 'approval-responded' | 'output-available' | 'output-denied';

export interface ChatToolApproval {
  id: string;
  approved?: boolean;
  reason?: string;
}

export interface ChatToolInvocation {
  id: string;
  name: string;
  description: string;
  status: ChatToolStatus;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
  destructive?: boolean;
  state?: ChatToolState;
  approval?: ChatToolApproval;
  confirmationTitle?: string;
}

interface ChatToolRegistryEntry {
  definition: ChatCompletionTool;
  destructive?: boolean;
  buildConfirmationTitle?: (args: Record<string, unknown>) => string;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

function safeJson<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): FunctionParameters {
  return {
    type: 'object',
    additionalProperties: false,
    properties,
    required,
  };
}

function toRecord(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseArguments(toolCall: ChatCompletionMessageToolCall) {
  try {
    return toRecord(JSON.parse(toolCall.function.arguments || '{}'));
  } catch (_) {
    return {};
  }
}

function getStringArg(args: Record<string, unknown>, key: string, fallback?: string) {
  const value = args[key];
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing required string argument "${key}".`);
}

function getOptionalStringArg(args: Record<string, unknown>, key: string) {
  const value = args[key];
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function getNumberArg(args: Record<string, unknown>, key: string, fallback: number) {
  const value = args[key];
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  return fallback;
}

function getEnumArg<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
  fallback: T,
) {
  const value = args[key];
  return typeof value === 'string' && allowed.includes(value as T) ? (value as T) : fallback;
}

function getOptionalEnumArg<T extends string>(
  args: Record<string, unknown>,
  key: string,
  allowed: readonly T[],
) {
  const value = getOptionalStringArg(args, key);
  if (value === undefined) {
    return undefined;
  }
  if (!allowed.includes(value as T)) {
    throw new Error(`Invalid value for "${key}". Allowed values: ${allowed.join(', ')}.`);
  }
  return value as T;
}

function flattenCertificateAuthorities(
  nodes: Awaited<ReturnType<typeof fetchAndProcessCAs>>,
): Awaited<ReturnType<typeof fetchAndProcessCAs>> {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenCertificateAuthorities(node.children) : [])]);
}

const REVOCATION_REASON_VALUES = revocationReasons.map((reason) => reason.value);
const DEVICE_STATUS_VALUES = [
  'ACTIVE',
  'NO_IDENTITY',
  'RENEWAL_PENDING',
  'EXPIRING_SOON',
  'EXPIRED',
  'REVOKED',
  'DECOMMISSIONED',
] as const;
const CERTIFICATE_STATUS_VALUES = ['ACTIVE', 'EXPIRED', 'REVOKED'] as const;

function serializeCertificate(certificate: CertificateData) {
  return {
    id: certificate.id,
    serial_number: certificate.serialNumber,
    subject: certificate.subject,
    issuer: certificate.issuer,
    issuer_ca_id: certificate.issuerCaId ?? null,
    status: certificate.apiStatus,
    valid_from: certificate.validFrom,
    valid_to: certificate.validTo,
    revocation_reason: certificate.revocationReason ?? null,
    revocation_timestamp: certificate.revocationTimestamp ?? null,
    public_key_algorithm: certificate.publicKeyAlgorithm,
    signature_algorithm: certificate.signatureAlgorithm ?? null,
    fingerprint_sha256: certificate.fingerprintSha256 ?? null,
    sans: certificate.sans ?? [],
    key_usage: certificate.keyUsage ?? [],
    extended_key_usage: certificate.extendedKeyUsage ?? [],
    ocsp_urls: certificate.ocspUrls ?? [],
    crl_distribution_points: certificate.crlDistributionPoints ?? [],
    ca_issuers_urls: certificate.caIssuersUrls ?? [],
    is_ca: certificate.rawApiData?.is_ca ?? false,
    certificate_type: certificate.rawApiData?.type ?? null,
    engine_id: certificate.rawApiData?.engine_id ?? null,
    metadata: certificate.rawApiData?.metadata ?? {},
  };
}

async function fetchCertificateLikeUi(serialNumber: string) {
  const apiSerialNumber = serialNumber.replace(/:/g, '');
  const { certificates } = await fetchIssuedCertificates({
    apiQueryString: `filter=serial_number[equal_ignorecase]${apiSerialNumber}&page_size=1`,
  });
  const certificate = certificates[0];

  if (!certificate) {
    throw new Error(`Certificate with serial number "${serialNumber}" was not found.`);
  }

  return certificate;
}

function createToolMessage(toolCallId: string, payload: unknown): ChatCompletionToolMessageParam {
  return {
    role: 'tool',
    tool_call_id: toolCallId,
    content: JSON.stringify(payload, null, 2),
  };
}

function buildInvocation(
  toolCall: ChatCompletionMessageToolCall,
  entry: ChatToolRegistryEntry | undefined,
  parameters: Record<string, unknown>,
  status: ChatToolStatus,
  extras: Partial<ChatToolInvocation> = {},
): ChatToolInvocation {
  return {
    id: toolCall.id,
    name: toolCall.function.name,
    description: entry?.definition.function.description ?? 'Unknown tool.',
    status,
    parameters,
    destructive: entry?.destructive,
    confirmationTitle: entry?.buildConfirmationTitle?.(parameters),
    ...extras,
  };
}

const toolRegistryEntries: ChatToolRegistryEntry[] = [
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_device_stats',
        description: 'Fetch aggregate device statistics from the live Device Manager API.',
      },
    },
    execute: async () => safeJson(await fetchDeviceStats()),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_devices',
        description: 'List live devices from the Device Manager API when the user asks for current devices.',
        parameters: objectSchema({
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of devices to return.' },
          sort_by: {
            type: 'string',
            enum: ['creation_timestamp', 'id', 'status', 'dms_owner'],
            description: 'API sort field used by the device table.',
          },
          sort_mode: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction.',
          },
          bookmark: { type: 'string', description: 'Optional pagination bookmark returned by a previous call.' },
          search_term: { type: 'string', description: 'Optional case-insensitive device ID search.' },
          dms_owner: { type: 'string', description: 'Optional Registration Authority (DMS owner) ID filter.' },
          tag: { type: 'string', description: 'Optional case-insensitive tag filter.' },
          status: {
            type: 'string',
            enum: DEVICE_STATUS_VALUES,
            description: 'Optional device status filter.',
          },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 10))));
      const sortBy = getEnumArg(args, 'sort_by', ['creation_timestamp', 'id', 'status', 'dms_owner'] as const, 'creation_timestamp');
      const sortMode = getEnumArg(args, 'sort_mode', ['asc', 'desc'] as const, 'desc');
      const params = new URLSearchParams({
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_mode: sortMode,
      });
      const bookmark = getOptionalStringArg(args, 'bookmark');
      const searchTerm = getOptionalStringArg(args, 'search_term');
      const dmsOwner = getOptionalStringArg(args, 'dms_owner');
      const tag = getOptionalStringArg(args, 'tag');
      const status = getOptionalEnumArg(args, 'status', DEVICE_STATUS_VALUES);
      if (bookmark) params.append('bookmark', bookmark);
      if (searchTerm) params.append('filter', `id[contains_ignorecase]${searchTerm}`);
      if (dmsOwner) params.append('filter', `dms_owner[equal]${dmsOwner}`);
      if (tag) params.append('filter', `tags[contains_ignorecase]${tag}`);
      if (status) params.append('filter', `status[equal]${status}`);

      const response = await fetchDevices(params);

      return safeJson({
        next: response.next,
        devices: response.list.map((device) => ({
          id: device.id,
          status: device.status,
          dms_owner: device.dms_owner,
          creation_timestamp: device.creation_timestamp,
          identity_status: device.identity?.status ?? null,
          expiration_date: device.identity?.expiration_date ?? null,
          tags: device.tags ?? [],
        })),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_device',
        description: 'Fetch live details for a specific device by ID.',
        parameters: objectSchema({
          deviceId: { type: 'string', description: 'Device identifier.' },
        }, ['deviceId']),
      },
    },
    execute: async (args) => {
      const deviceId = getStringArg(args, 'deviceId');
      const device = await fetchDeviceById(deviceId);
      return safeJson({
        id: device.id,
        status: device.status,
        dms_owner: device.dms_owner,
        creation_timestamp: device.creation_timestamp,
        icon: device.icon,
        icon_color: device.icon_color,
        identity: device.identity,
        tags: device.tags,
        metadata: device.metadata,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_registration_authorities',
        description: 'List live registration authorities from the DMS API.',
        parameters: objectSchema({
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of registration authorities to return.' },
          sort_by: {
            type: 'string',
            enum: ['name', 'creation_date'],
            description: 'API sort field used by the Registration Authorities table.',
          },
          sort_mode: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
          search_term: { type: 'string', description: 'Optional case-insensitive RA name search.' },
          bookmark: { type: 'string', description: 'Optional pagination bookmark returned by a previous call.' },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 10))));
      const sortBy = getEnumArg(args, 'sort_by', ['name', 'creation_date'] as const, 'name');
      const sortMode = getEnumArg(args, 'sort_mode', ['asc', 'desc'] as const, 'asc');
      const params = new URLSearchParams({
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_mode: sortMode,
      });
      const searchTerm = getOptionalStringArg(args, 'search_term');
      const bookmark = getOptionalStringArg(args, 'bookmark');
      if (searchTerm) params.append('filter', `name[contains_ignorecase]${searchTerm}`);
      if (bookmark) params.append('bookmark', bookmark);

      const response = await fetchRegistrationAuthorities(params);
      return safeJson({
        next: response.next,
        registration_authorities: (response.list ?? []).map((ra) => ({
          id: ra.id,
          name: ra.name,
          creation_ts: ra.creation_ts,
        })),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_registration_authority',
        description: 'Fetch a live registration authority by ID.',
        parameters: objectSchema({
          raId: { type: 'string', description: 'Registration authority identifier.' },
        }, ['raId']),
      },
    },
    execute: async (args) => {
      const raId = getStringArg(args, 'raId');
      const ra = await fetchRaById(raId);
      return safeJson({
        id: ra.id,
        name: ra.name,
        creation_ts: ra.creation_ts,
        metadata: ra.metadata,
        settings: ra.settings,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_registration_authority_stats',
        description: 'Fetch aggregate live registration-authority statistics from the DMS API.',
      },
    },
    execute: async () => safeJson(await fetchDmsStats()),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_certificate_authorities',
        description: 'List live certificate authorities from the CA API.',
        parameters: objectSchema({
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of certificate authorities to return.' },
        }),
      },
    },
    execute: async (args) => {
      const limit = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'limit', 20))));
      const cas = await fetchAndProcessCAs(`page_size=${limit}`);
      const flatCas = flattenCertificateAuthorities(cas);
      return safeJson({
        total: flatCas.length,
        certificate_authorities: flatCas.slice(0, limit).map((ca) => ({
          id: ca.id,
          name: ca.name,
          issuer: ca.issuer,
          status: ca.status,
          expires: ca.expires,
          level: ca.level,
          caType: ca.caType,
        })),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_certificate_authority_summary',
        description: 'Fetch aggregate live certificate-authority summary statistics.',
      },
    },
    execute: async () => safeJson(await fetchCaStatsSummary()),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_certificates',
        description: 'List issued X.509 certificates using the same CA API query contract as the Certificates screen.',
        parameters: objectSchema({
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of certificates to return.' },
          sort_by: {
            type: 'string',
            enum: ['subject.common_name', 'serial_number', 'valid_to', 'status', 'valid_from', 'revocation_timestamp'],
            description: 'API sort field used by the Certificates table.',
          },
          sort_mode: { type: 'string', enum: ['asc', 'desc'], description: 'Sort direction.' },
          search_term: { type: 'string', description: 'Optional common-name or serial-number search.' },
          search_field: {
            type: 'string',
            enum: ['commonName', 'serialNumber'],
            description: 'Certificate field searched by search_term.',
          },
          status: {
            type: 'string',
            enum: CERTIFICATE_STATUS_VALUES,
            description: 'Optional certificate status filter.',
          },
          ca_id: { type: 'string', description: 'Optional issuer CA ID. Uses the CA-scoped certificate endpoint.' },
          is_ca: { type: 'string', enum: ['true', 'false'], description: 'Optionally include only CA or end-entity certificates.' },
          bookmark: { type: 'string', description: 'Optional pagination bookmark returned by a previous call.' },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 10))));
      const sortBy = getEnumArg(
        args,
        'sort_by',
        ['subject.common_name', 'serial_number', 'valid_to', 'status', 'valid_from', 'revocation_timestamp'] as const,
        'valid_from',
      );
      const sortMode = getEnumArg(args, 'sort_mode', ['asc', 'desc'] as const, 'desc');
      const searchTerm = getOptionalStringArg(args, 'search_term') ?? '';
      const searchField = getEnumArg(args, 'search_field', ['commonName', 'serialNumber'] as const, 'commonName');
      const status = getOptionalEnumArg(args, 'status', CERTIFICATE_STATUS_VALUES);
      const isCa = getOptionalEnumArg(args, 'is_ca', ['true', 'false'] as const);
      const params = new URLSearchParams({
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_mode: sortMode,
      });
      const bookmark = getOptionalStringArg(args, 'bookmark');
      if (bookmark) params.append('bookmark', bookmark);
      appendCertificateQueryFilters(params, {
        searchTerm,
        searchField,
        statusFilters: status ? [status] : [],
        isCaFilter: isCa ?? 'ALL',
      });

      const result = await fetchIssuedCertificates({
        forCaId: getOptionalStringArg(args, 'ca_id'),
        apiQueryString: params.toString(),
      });
      return safeJson({
        next: result.nextToken,
        certificates: result.certificates.map(serializeCertificate),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_certificate',
        description: 'Fetch live certificate details by serial number using the same filtered CA API request as the details screen.',
        parameters: objectSchema({
          serial_number: { type: 'string', description: 'Certificate serial number, with or without colon separators.' },
        }, ['serial_number']),
      },
    },
    execute: async (args) => {
      const certificate = await fetchCertificateLikeUi(getStringArg(args, 'serial_number'));
      return safeJson(serializeCertificate(certificate));
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_expiring_certificates',
        description: 'List active certificates expiring within a number of days using the Certificates screen valid_to filter.',
        parameters: objectSchema({
          days: { type: 'integer', minimum: 1, maximum: 3650, description: 'Expiration window in days. Defaults to 30.' },
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of certificates to return.' },
          ca_id: { type: 'string', description: 'Optional issuer CA ID. Uses the CA-scoped certificate endpoint.' },
        }),
      },
    },
    execute: async (args) => {
      const days = Math.max(1, Math.min(3650, Math.round(getNumberArg(args, 'days', 30))));
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 25))));
      const expiresBefore = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
      const params = new URLSearchParams({
        page_size: String(pageSize),
        sort_by: 'valid_to',
        sort_mode: 'asc',
      });
      appendCertificateQueryFilters(params, {
        searchTerm: '',
        searchField: 'commonName',
        statusFilters: ['ACTIVE'],
        validToFilter: { operator: 'bf', date: expiresBefore, includeTime: true },
      });

      const result = await fetchIssuedCertificates({
        forCaId: getOptionalStringArg(args, 'ca_id'),
        apiQueryString: params.toString(),
      });
      return safeJson({
        within_days: days,
        expires_before: expiresBefore.toISOString(),
        next: result.nextToken,
        certificates: result.certificates.map(serializeCertificate),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'check_certificate_status',
        description: 'Perform a live OCSP status check using the certificate, issuer CA and AIA URL shown by the Certificates UI.',
        parameters: objectSchema({
          serial_number: { type: 'string', description: 'Certificate serial number, with or without colon separators.' },
          ocsp_url: { type: 'string', description: 'Optional OCSP URL override. Defaults to the first AIA OCSP URL in the certificate.' },
        }, ['serial_number']),
      },
    },
    execute: async (args) => {
      const serialNumber = getStringArg(args, 'serial_number');
      const [certificate, cas] = await Promise.all([
        fetchCertificateLikeUi(serialNumber),
        fetchAndProcessCAs(),
      ]);
      const issuer = flattenCertificateAuthorities(cas).find((ca) => ca.id === certificate.issuerCaId);
      const discoveredOcspUrl = getOptionalStringArg(args, 'ocsp_url') ?? certificate.ocspUrls?.[0];

      if (!certificate.pemData) {
        throw new Error(`Certificate "${serialNumber}" does not include PEM data.`);
      }
      if (!issuer?.pemData) {
        throw new Error(`Issuer CA "${certificate.issuerCaId ?? 'unknown'}" was not found or has no PEM data.`);
      }
      if (!discoveredOcspUrl) {
        throw new Error(`Certificate "${serialNumber}" does not include an OCSP URL.`);
      }

      const ocspUrl = discoveredOcspUrl.startsWith('http://')
        ? discoveredOcspUrl.replace('http://', 'https://')
        : discoveredOcspUrl;
      const result = await checkOcspStatus(certificate.pemData, issuer.pemData, ocspUrl);
      return safeJson({
        serial_number: certificate.serialNumber,
        stored_status: certificate.apiStatus,
        issuer_ca_id: issuer.id,
        ocsp_url: ocspUrl,
        status: result.status,
        status_text: result.statusText,
        produced_at: result.producedAt ?? null,
        this_update: result.thisUpdate ?? null,
        next_update: result.nextUpdate ?? null,
        revocation_reason: result.revocationReason ?? null,
        revocation_time: result.revocationTime ?? null,
        responder_id: result.responderId ?? null,
        error_details: result.errorDetails ?? null,
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_signing_profiles',
        description: 'List live signing profiles from the CA API.',
        parameters: objectSchema({
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of profiles to return.' },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 20))));
      const profiles = await fetchSigningProfiles(new URLSearchParams({ page_size: String(pageSize) }));
      return safeJson({
        next: profiles.next,
        profiles: profiles.list.map((profile) => ({
          id: profile.id,
          name: profile.name,
          validity: profile.validity,
          description: profile.description,
        })),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_signing_profile',
        description: 'Fetch a live signing profile by ID.',
        parameters: objectSchema({
          profileId: { type: 'string', description: 'Signing profile identifier.' },
        }, ['profileId']),
      },
    },
    execute: async (args) => safeJson(await fetchSigningProfileById(getStringArg(args, 'profileId'))),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_crypto_engines',
        description: 'List live crypto engines from the KMS API.',
      },
    },
    execute: async () => safeJson(await fetchCryptoEngines()),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'list_kms_keys',
        description: 'List live KMS keys from the KMS API.',
        parameters: objectSchema({
          page_size: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of KMS keys to return.' },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 20))));
      const keys = await fetchKmsKeys(new URLSearchParams({ page_size: String(pageSize) }));
      return safeJson({
        next: keys.next,
        keys: keys.list.map((key) => ({
          key_id: key.key_id,
          name: key.name,
          engine_id: key.engine_id,
          algorithm: key.algorithm,
          size: key.size,
          has_private_key: key.has_private_key,
          aliases: key.aliases,
        })),
      });
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'get_kms_key',
        description: 'Fetch a live KMS key by key ID.',
        parameters: objectSchema({
          keyId: { type: 'string', description: 'KMS key identifier.' },
        }, ['keyId']),
      },
    },
    execute: async (args) => safeJson(await fetchKmsKey(getStringArg(args, 'keyId'))),
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'decommission_device',
        description: 'Decommission a device in the live Device Manager API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          deviceId: { type: 'string', description: 'Device identifier.' },
        }, ['deviceId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Decommission device ${getStringArg(args, 'deviceId', 'this device')}?`,
    execute: async (args) => {
      const deviceId = getStringArg(args, 'deviceId');
      await decommissionDevice(deviceId);
      return { ok: true, message: `Device ${deviceId} was decommissioned.` };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_device',
        description: 'Delete a device from the live Device Manager API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          deviceId: { type: 'string', description: 'Device identifier.' },
        }, ['deviceId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Delete device ${getStringArg(args, 'deviceId', 'this device')}?`,
    execute: async (args) => {
      const deviceId = getStringArg(args, 'deviceId');
      await deleteDevice(deviceId);
      return { ok: true, message: `Device ${deviceId} was deleted.` };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_registration_authority',
        description: 'Delete a registration authority from the live DMS API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          raId: { type: 'string', description: 'Registration authority identifier.' },
        }, ['raId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Delete registration authority ${getStringArg(args, 'raId', 'this RA')}?`,
    execute: async (args) => {
      const raId = getStringArg(args, 'raId');
      await deleteRa(raId);
      return { ok: true, message: `Registration authority ${raId} was deleted.` };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_certificate_authority',
        description: 'Delete a certificate authority from the live CA API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          caId: { type: 'string', description: 'Certificate authority identifier.' },
        }, ['caId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Delete certificate authority ${getStringArg(args, 'caId', 'this CA')}?`,
    execute: async (args) => {
      const caId = getStringArg(args, 'caId');
      await deleteCa(caId);
      return { ok: true, message: `Certificate authority ${caId} was deleted.` };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'revoke_certificate',
        description: 'Revoke an issued certificate in the live CA API. Uses the same status payload as the Certificates UI and requires user confirmation.',
        parameters: objectSchema({
          serial_number: { type: 'string', description: 'Certificate serial number, with or without colon separators.' },
          reason: {
            type: 'string',
            enum: REVOCATION_REASON_VALUES,
            description: 'Revocation reason accepted by the UI. Defaults to Unspecified.',
          },
        }, ['serial_number']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Revoke certificate ${getStringArg(args, 'serial_number', 'this certificate')}?`,
    execute: async (args) => {
      const serialNumber = getStringArg(args, 'serial_number');
      const reason = getOptionalEnumArg(args, 'reason', REVOCATION_REASON_VALUES) ?? 'Unspecified';
      await updateCertificateStatus({ serialNumber, status: 'REVOKED', reason });
      return { ok: true, message: `Certificate ${serialNumber} was revoked.`, reason };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'revoke_certificate_authority',
        description: 'Revoke a certificate authority in the live CA API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          caId: { type: 'string', description: 'Certificate authority identifier.' },
          reason: {
            type: 'string',
            enum: REVOCATION_REASON_VALUES,
            description: 'Revocation reason accepted by the UI. Defaults to Unspecified.',
          },
        }, ['caId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Revoke certificate authority ${getStringArg(args, 'caId', 'this CA')}?`,
    execute: async (args) => {
      const caId = getStringArg(args, 'caId');
      const reason = getOptionalEnumArg(args, 'reason', REVOCATION_REASON_VALUES) ?? 'Unspecified';
      await revokeCa(caId, reason);
      return { ok: true, message: `Certificate authority ${caId} was revoked.`, reason };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_kms_key',
        description: 'Delete a KMS key from the live KMS API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          keyId: { type: 'string', description: 'KMS key identifier.' },
        }, ['keyId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Delete KMS key ${getStringArg(args, 'keyId', 'this key')}?`,
    execute: async (args) => {
      const keyId = getStringArg(args, 'keyId');
      await deleteKmsKey(keyId);
      return { ok: true, message: `KMS key ${keyId} was deleted.` };
    },
  },
  {
    definition: {
      type: 'function',
      function: {
        name: 'delete_signing_profile',
        description: 'Delete a signing profile from the live CA API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          profileId: { type: 'string', description: 'Signing profile identifier.' },
        }, ['profileId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Delete signing profile ${getStringArg(args, 'profileId', 'this profile')}?`,
    execute: async (args) => {
      const profileId = getStringArg(args, 'profileId');
      await deleteSigningProfile(profileId);
      return { ok: true, message: `Signing profile ${profileId} was deleted.` };
    },
  },
];

const toolRegistry = new Map(toolRegistryEntries.map((entry) => [entry.definition.function.name, entry]));

export const CHAT_TOOL_COUNT = toolRegistryEntries.length;

export function getChatToolPlanningCatalog() {
  return toolRegistryEntries
    .map((entry) => {
      const parameters = entry.definition.function.parameters as {
        properties?: Record<string, { description?: string; type?: string; enum?: string[] }>;
        required?: string[];
      } | undefined;

      const parameterLines = Object.entries(parameters?.properties ?? {}).map(([name, config]) => {
        const requirement = parameters?.required?.includes(name) ? 'required' : 'optional';
        const enumHint = Array.isArray(config.enum) && config.enum.length > 0
          ? ` allowed values: ${config.enum.join(', ')}.`
          : '';
        return `- ${name} (${config.type ?? 'value'}, ${requirement}): ${config.description ?? 'No description.'}${enumHint}`;
      });

      return [
        `${entry.definition.function.name}${entry.destructive ? ' [destructive]' : ''}`,
        entry.definition.function.description ?? 'No description.',
        parameterLines.length > 0 ? 'Parameters:' : 'Parameters: none',
        ...(parameterLines.length > 0 ? parameterLines : []),
      ].join('\n');
    })
    .join('\n\n');
}

export function createSyntheticToolCall(name: string, args: Record<string, unknown>, id: string): ChatCompletionMessageToolCall {
  return {
    id,
    type: 'function',
    function: {
      name,
      arguments: JSON.stringify(args),
    },
  };
}

export function isDestructiveTool(toolName: string) {
  return Boolean(toolRegistry.get(toolName)?.destructive);
}

export function createToolResultMessage(toolCallId: string, payload: unknown) {
  return createToolMessage(toolCallId, payload);
}

export function createPendingToolInvocation(toolCall: ChatCompletionMessageToolCall): ChatToolInvocation {
  const entry = toolRegistry.get(toolCall.function.name);
  const parameters = parseArguments(toolCall);

  if (!entry) {
    return buildInvocation(toolCall, undefined, parameters, 'error', {
      error: `Unknown tool "${toolCall.function.name}".`,
    });
  }

  return buildInvocation(toolCall, entry, parameters, 'pending', {
    destructive: true,
    state: 'approval-requested',
    approval: { id: toolCall.id },
  });
}

export async function executeChatToolCall(toolCall: ChatCompletionMessageToolCall): Promise<{
  invocation: ChatToolInvocation;
  toolMessage: ChatCompletionToolMessageParam;
}> {
  const entry = toolRegistry.get(toolCall.function.name);
  const parameters = parseArguments(toolCall);

  if (!entry) {
    const error = `Unknown tool "${toolCall.function.name}".`;
    return {
      invocation: buildInvocation(toolCall, undefined, parameters, 'error', { error }),
      toolMessage: createToolMessage(toolCall.id, { ok: false, error }),
    };
  }

  try {
    const result = await entry.execute(parameters);
    return {
      invocation: buildInvocation(toolCall, entry, parameters, 'complete', {
        result,
        destructive: entry.destructive,
        state: entry.destructive ? 'output-available' : undefined,
        approval: entry.destructive ? { id: toolCall.id, approved: true } : undefined,
      }),
      toolMessage: createToolMessage(toolCall.id, {
        ok: true,
        name: toolCall.function.name,
        arguments: parameters,
        result,
      }),
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Tool execution failed.';
    return {
      invocation: buildInvocation(toolCall, entry, parameters, 'error', {
        destructive: entry.destructive,
        state: entry.destructive ? 'output-available' : undefined,
        approval: entry.destructive ? { id: toolCall.id, approved: true } : undefined,
        error: message,
      }),
      toolMessage: createToolMessage(toolCall.id, {
        ok: false,
        name: toolCall.function.name,
        arguments: parameters,
        error: message,
      }),
    };
  }
}
