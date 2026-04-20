'use client';

import { fetchAndProcessCAs, fetchCaStatsSummary, fetchSigningProfileById, fetchSigningProfiles } from '@/lib/ca-data';
import { fetchDeviceStats, fetchDeviceById, fetchDevices } from '@/lib/devices-api';
import { fetchAllRegistrationAuthorities, fetchDmsStats, fetchRaById } from '@/lib/dms-api';
import { fetchCryptoEngines, fetchKmsKey, fetchKmsKeys } from '@/lib/kms-data';

export type ChatToolStatus = 'running' | 'complete' | 'error';

export interface ChatToolInvocation {
  id: string;
  name: string;
  description: string;
  status: ChatToolStatus;
  parameters: Record<string, unknown>;
  result?: unknown;
  error?: string;
}

interface PendingToolInvocation {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  execute: () => Promise<unknown>;
}

export interface ChatToolExecutionResult {
  invocations: ChatToolInvocation[];
  promptContext: string;
}

function safeJson(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function buildPromptContext(invocations: ChatToolInvocation[]) {
  const successfulInvocations = invocations.filter((invocation) => invocation.status === 'complete' && invocation.result !== undefined);

  if (successfulInvocations.length === 0) {
    return '';
  }

  return successfulInvocations
    .map((invocation, index) => [
      `Tool ${index + 1}: ${invocation.name}`,
      `Description: ${invocation.description}`,
      `Arguments: ${JSON.stringify(invocation.parameters)}`,
      `Result: ${JSON.stringify(invocation.result, null, 2)}`,
    ].join('\n'))
    .join('\n\n---\n\n');
}

function hasReadRequest(prompt: string) {
  return /\b(show|list|get|find|lookup|look up|inspect|check|status|stats|how many|count|details|describe|which|give me|tell me)\b/i.test(prompt);
}

function hasMutationIntent(prompt: string) {
  return /\b(create|update|edit|modify|delete|remove|decommission|revoke|rotate|bind|import|sign|issue)\b/i.test(prompt);
}

function extractEntityId(prompt: string, entity: 'device' | 'ra' | 'registration authority' | 'key' | 'profile') {
  const quotedMatch = prompt.match(new RegExp(`${entity}\\s+[\"']([^\"']+)[\"']`, 'i'));
  if (quotedMatch?.[1]) {
    return quotedMatch[1];
  }

  const directMatch = prompt.match(new RegExp(`${entity}\\s+([a-z0-9._:/-]+)`, 'i'));
  return directMatch?.[1];
}

function maybeAddTool(target: PendingToolInvocation[], invocation: PendingToolInvocation, dedupeKey: string, seen: Set<string>) {
  if (seen.has(dedupeKey)) {
    return;
  }

  seen.add(dedupeKey);
  target.push(invocation);
}

function buildPendingInvocations(prompt: string) {
  const normalizedPrompt = prompt.trim();
  const lowerPrompt = normalizedPrompt.toLowerCase();
  const pendingInvocations: PendingToolInvocation[] = [];
  const seen = new Set<string>();

  if (!hasReadRequest(normalizedPrompt) || hasMutationIntent(normalizedPrompt)) {
    return pendingInvocations;
  }

  const wantsAllItems = /\b(all|my|every)\b/.test(lowerPrompt);

  if (/\bdevice stats\b|\bdevices stats\b|\bhow many devices\b|\bdevice count\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_device_stats',
        description: 'Fetch aggregate device statistics from the Device Manager API.',
        parameters: {},
        execute: async () => {
          const stats = await fetchDeviceStats();
          return safeJson(stats);
        },
      },
      'get_device_stats',
      seen,
    );
  }

  if (/\b(list|show|find|get|give me|tell me)\b.*\bdevices\b/.test(lowerPrompt) || (wantsAllItems && /\bdevices\b/.test(lowerPrompt))) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_devices',
        description: 'List the most recent devices from the Device Manager API.',
        parameters: { page_size: 10, sort_by: 'creation_timestamp', sort_mode: 'desc' },
        execute: async () => {
          const response = await fetchDevices(new URLSearchParams({
            page_size: '10',
            sort_by: 'creation_timestamp',
            sort_mode: 'desc',
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
      'list_devices',
      seen,
    );
  }

  const deviceId = extractEntityId(normalizedPrompt, 'device');
  if (deviceId && /\b(device|devices)\b/.test(lowerPrompt) && /\b(status|detail|details|show|get|inspect|lookup|find)\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_device',
        description: 'Fetch details for a specific device by ID.',
        parameters: { deviceId },
        execute: async () => {
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
      `get_device:${deviceId}`,
      seen,
    );
  }

  if (
    /\b(list|show|get|give me|tell me)\b.*\b(registration authorities|ras|ra)\b/.test(lowerPrompt) ||
    (wantsAllItems && /\b(registration authorities|ras|ra)\b/.test(lowerPrompt))
  ) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_registration_authorities',
        description: 'List registration authorities from the DMS API.',
        parameters: { page_size: 25 },
        execute: async () => {
          const ras = await fetchAllRegistrationAuthorities();
          return safeJson({
            total: ras.length,
            registration_authorities: ras.slice(0, 25).map((ra) => ({
              id: ra.id,
              name: ra.name,
              creation_ts: ra.creation_ts,
            })),
          });
        },
      },
      'list_registration_authorities',
      seen,
    );
  }

  if (/\bra stats\b|\bregistration authority stats\b|\bhow many ras\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_registration_authority_stats',
        description: 'Fetch aggregate registration authority statistics.',
        parameters: {},
        execute: async () => {
          const stats = await fetchDmsStats();
          return safeJson(stats);
        },
      },
      'get_registration_authority_stats',
      seen,
    );
  }

  const raId = extractEntityId(normalizedPrompt, 'ra') ?? extractEntityId(normalizedPrompt, 'registration authority');
  if (raId && /\b(ra|registration authority)\b/.test(lowerPrompt) && /\b(detail|details|show|get|inspect|lookup|find)\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_registration_authority',
        description: 'Fetch a registration authority by ID.',
        parameters: { raId },
        execute: async () => {
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
      `get_registration_authority:${raId}`,
      seen,
    );
  }

  if (
    /\b(all my|my all|all)\b.*\b(cas|certificate authorities|certificate authority)\b/.test(lowerPrompt) ||
    /\b(list|show|get|give me|tell me)\b.*\b(certificate authorities|certificate authority|cas|ca)\b/.test(lowerPrompt) ||
    (wantsAllItems && /\b(certificate authorities|certificate authority|cas|ca)\b/.test(lowerPrompt))
  ) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_certificate_authorities',
        description: 'List certificate authorities from the CA API.',
        parameters: { limit: 20 },
        execute: async () => {
          const cas = await fetchAndProcessCAs('page_size=20');
          const flatten = (nodes: typeof cas): typeof cas =>
            nodes.flatMap((node) => [node, ...(node.children ? flatten(node.children) : [])]);

          return safeJson({
            total: flatten(cas).length,
            certificate_authorities: flatten(cas).slice(0, 20).map((ca) => ({
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
      'list_certificate_authorities',
      seen,
    );
  }

  if (/\bca stats\b|\bcertificate authority stats\b|\bca summary\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_certificate_authority_summary',
        description: 'Fetch aggregate certificate authority summary statistics.',
        parameters: {},
        execute: async () => {
          const stats = await fetchCaStatsSummary();
          return safeJson(stats);
        },
      },
      'get_certificate_authority_summary',
      seen,
    );
  }

  if (
    /\b(list|show|get|give me|tell me)\b.*\b(signing profiles|profiles)\b/.test(lowerPrompt) ||
    (wantsAllItems && /\b(signing profiles|profiles)\b/.test(lowerPrompt))
  ) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_signing_profiles',
        description: 'List signing profiles from the CA API.',
        parameters: { page_size: 20 },
        execute: async () => {
          const profiles = await fetchSigningProfiles(new URLSearchParams({ page_size: '20' }));
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
      'list_signing_profiles',
      seen,
    );
  }

  const profileId = extractEntityId(normalizedPrompt, 'profile');
  if (profileId && /\bprofile\b/.test(lowerPrompt) && /\b(detail|details|show|get|inspect|lookup|find)\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_signing_profile',
        description: 'Fetch a signing profile by ID.',
        parameters: { profileId },
        execute: async () => {
          const profile = await fetchSigningProfileById(profileId);
          return safeJson(profile);
        },
      },
      `get_signing_profile:${profileId}`,
      seen,
    );
  }

  if (
    /\b(list|show|get|give me|tell me)\b.*\b(crypto engines|engines)\b/.test(lowerPrompt) ||
    (wantsAllItems && /\b(crypto engines|engines)\b/.test(lowerPrompt))
  ) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_crypto_engines',
        description: 'List crypto engines from the KMS API.',
        parameters: {},
        execute: async () => {
          const engines = await fetchCryptoEngines();
          return safeJson(engines);
        },
      },
      'list_crypto_engines',
      seen,
    );
  }

  if (
    /\b(list|show|get|give me|tell me)\b.*\b(kms keys|keys)\b/.test(lowerPrompt) ||
    (wantsAllItems && /\b(kms keys|keys)\b/.test(lowerPrompt))
  ) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'list_kms_keys',
        description: 'List KMS keys from the KMS API.',
        parameters: { page_size: 20 },
        execute: async () => {
          const keys = await fetchKmsKeys(new URLSearchParams({ page_size: '20' }));
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
      'list_kms_keys',
      seen,
    );
  }

  const keyId = extractEntityId(normalizedPrompt, 'key');
  if (keyId && /\bkey\b/.test(lowerPrompt) && /\b(detail|details|show|get|inspect|lookup|find)\b/.test(lowerPrompt)) {
    maybeAddTool(
      pendingInvocations,
      {
        name: 'get_kms_key',
        description: 'Fetch a KMS key by key ID.',
        parameters: { keyId },
        execute: async () => {
          const key = await fetchKmsKey(keyId);
          return safeJson(key);
        },
      },
      `get_kms_key:${keyId}`,
      seen,
    );
  }

  return pendingInvocations;
}

export async function executeChatTools(prompt: string): Promise<ChatToolExecutionResult> {
  const pendingInvocations = buildPendingInvocations(prompt);

  if (pendingInvocations.length === 0) {
    return {
      invocations: [],
      promptContext: '',
    };
  }

  const invocations = await Promise.all(
    pendingInvocations.map(async (pendingInvocation, index) => {
      try {
        const result = await pendingInvocation.execute();
        return {
          id: `tool-${index + 1}`,
          name: pendingInvocation.name,
          description: pendingInvocation.description,
          status: 'complete' as const,
          parameters: pendingInvocation.parameters,
          result,
        };
      } catch (error) {
        return {
          id: `tool-${index + 1}`,
          name: pendingInvocation.name,
          description: pendingInvocation.description,
          status: 'error' as const,
          parameters: pendingInvocation.parameters,
          error: error instanceof Error ? error.message : 'Tool execution failed.',
        };
      }
    }),
  );

  return {
    invocations,
    promptContext: buildPromptContext(invocations),
  };
}
