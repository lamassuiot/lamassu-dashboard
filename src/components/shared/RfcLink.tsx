'use client';

import { ExternalLink } from 'lucide-react';

/**
 * Builds a direct link to an IETF RFC, optionally anchored to a specific
 * section, using the datatracker's stable HTML rendering
 * (https://datatracker.ietf.org/doc/html/rfcNNNN#section-X.Y).
 */
export function rfcUrl(rfc: number, section?: string): string {
  const base = `https://datatracker.ietf.org/doc/html/rfc${rfc}`;
  return section ? `${base}#section-${section}` : base;
}

interface RfcLinkProps {
  /** RFC number, e.g. 9483. */
  rfc: number;
  /** Section number, e.g. "4.1.6". Omit to link the whole document. */
  section?: string;
  /** Visible label — defaults to "RFC <rfc> §<section>". */
  children?: React.ReactNode;
  className?: string;
}

// Renders an inline citation (e.g. "RFC 9483 §4.1.6") as a link straight to
// that section of the spec on the IETF datatracker, so operators reading a
// setting's description can jump to the actual normative text instead of
// having to look it up themselves.
export function RfcLink({ rfc, section, children, className }: RfcLinkProps) {
  const label = children ?? (section ? `RFC ${rfc} §${section}` : `RFC ${rfc}`);
  return (
    <a
      href={rfcUrl(rfc, section)}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? 'inline-flex items-center gap-0.5 font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary'}
    >
      {label}
      <ExternalLink className="h-3 w-3" />
    </a>
  );
}
