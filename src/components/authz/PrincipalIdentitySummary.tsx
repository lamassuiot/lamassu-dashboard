import React from 'react';
import { cn } from '@/lib/utils';
import type { ClaimCondition, OIDCAuthConfig, Principal, X509AuthConfig, X509CaTrustConfig } from '@/types/authz';

/** A piece of the rule: prose, a configured value, or a hex identifier. */
type Segment = { text: string; kind?: 'value' | 'hex' };

const ABBREVIATED_HEX_CHARS = 8;

/** The CA trust anchor, abbreviated to its first bytes: "3f:a1:9c:0e…". */
function caSegments(trust?: X509CaTrustConfig): Segment[] {
  if (!trust?.value) return [{ text: 'an unspecified CA' }];
  const hex = trust.value.replaceAll(':', '');
  const short = hex.length > ABBREVIATED_HEX_CHARS
    ? `${hex.slice(0, ABBREVIATED_HEX_CHARS).match(/.{1,2}/g)!.join(':')}…`
    : trust.value;
  return [{ text: trust.identity_type === 'authority_key_id' ? 'CA ' : 'CA fingerprint ' }, { text: short, kind: 'hex' }];
}

const claimSegments = (claim: ClaimCondition): Segment[] => [
  { text: claim.claim, kind: 'value' },
  { text: ` ${claim.operator} ` },
  { text: claim.value, kind: 'value' },
];

function oidcRule(config: OIDCAuthConfig): Segment[] {
  const claims = config.claims ?? [];
  if (claims.length === 0) return [{ text: 'No claim conditions' }];
  const more = claims.length - 1;
  return [
    ...claimSegments(claims[0]),
    ...(more > 0 ? [{ text: ` and ${more} more condition${more === 1 ? '' : 's'}` }] : []),
  ];
}

function x509Rule(config: X509AuthConfig): Segment[] {
  switch (config.match_mode) {
    case 'subject_cn':
      return [{ text: 'CN ' }, { text: config.subject_cn ?? '', kind: 'value' }];
    case 'cn_and_ca':
      return [{ text: 'CN ' }, { text: config.subject_cn ?? '', kind: 'value' }, { text: ' from ' }, ...caSegments(config.ca_trust)];
    case 'serial_and_ca':
      return [{ text: 'Serial ' }, { text: config.serial_number ?? '', kind: 'hex' }, { text: ' from ' }, ...caSegments(config.ca_trust)];
    case 'any_from_ca':
    default:
      return [{ text: 'Any certificate from ' }, ...caSegments(config.ca_trust)];
  }
}

/**
 * How a principal authenticates, as two lines of text: the credential type, then its rule
 * (OIDC claim conditions or X.509 match). Values stand out by colour, not by boxes.
 */
export function PrincipalIdentitySummary({ principal }: Readonly<{ principal: Principal }>) {
  const isOidc = principal.type === 'oidc';
  const segments = isOidc
    ? oidcRule(principal.auth_config as OIDCAuthConfig)
    : x509Rule(principal.auth_config as X509AuthConfig);
  const fullRule = segments.map((segment) => segment.text).join('');

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold">
        {isOidc ? 'OIDC token' : 'X.509 certificate'}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground" title={fullRule}>
        {segments.map((segment, index) => (
          <span
            key={index}
            className={cn(segment.kind && 'text-foreground', segment.kind === 'hex' && 'font-mono')}
          >
            {segment.text}
          </span>
        ))}
      </p>
    </div>
  );
}
