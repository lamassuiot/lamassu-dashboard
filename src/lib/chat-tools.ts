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
  updateCaStatus,
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
  fetchAllRegistrationAuthorities,
  fetchDmsStats,
  fetchRaById,
} from '@/lib/dms-api';
import { deleteKmsKey, fetchCryptoEngines, fetchKmsKey, fetchKmsKeys } from '@/lib/kms-data';

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

function flattenCertificateAuthorities(
  nodes: Awaited<ReturnType<typeof fetchAndProcessCAs>>,
): Awaited<ReturnType<typeof fetchAndProcessCAs>> {
  return nodes.flatMap((node) => [node, ...(node.children ? flattenCertificateAuthorities(node.children) : [])]);
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
            enum: ['creation_timestamp', 'id', 'status'],
            description: 'Primary sort field.',
          },
          sort_mode: {
            type: 'string',
            enum: ['asc', 'desc'],
            description: 'Sort direction.',
          },
        }),
      },
    },
    execute: async (args) => {
      const pageSize = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'page_size', 10))));
      const sortBy = getEnumArg(args, 'sort_by', ['creation_timestamp', 'id', 'status'] as const, 'creation_timestamp');
      const sortMode = getEnumArg(args, 'sort_mode', ['asc', 'desc'] as const, 'desc');
      const response = await fetchDevices(new URLSearchParams({
        page_size: String(pageSize),
        sort_by: sortBy,
        sort_mode: sortMode,
      }));

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
          limit: { type: 'integer', minimum: 1, maximum: 100, description: 'Maximum number of registration authorities to return.' },
        }),
      },
    },
    execute: async (args) => {
      const limit = Math.max(1, Math.min(100, Math.round(getNumberArg(args, 'limit', 25))));
      const ras = await fetchAllRegistrationAuthorities();
      return safeJson({
        total: ras.length,
        registration_authorities: ras.slice(0, limit).map((ra) => ({
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
        name: 'revoke_certificate_authority',
        description: 'Revoke a certificate authority in the live CA API. Use only when the user explicitly asks for that destructive action.',
        parameters: objectSchema({
          caId: { type: 'string', description: 'Certificate authority identifier.' },
          reason: { type: 'string', description: 'Optional revocation reason to record.' },
        }, ['caId']),
      },
    },
    destructive: true,
    buildConfirmationTitle: (args) => `Revoke certificate authority ${getStringArg(args, 'caId', 'this CA')}?`,
    execute: async (args) => {
      const caId = getStringArg(args, 'caId');
      const reason = getOptionalStringArg(args, 'reason') ?? 'Unspecified';
      await updateCaStatus(caId, 'REVOKED', reason);
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
