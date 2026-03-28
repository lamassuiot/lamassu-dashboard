
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  ArrowLeft, Loader2, AlertTriangle, ShieldCheck, ShieldAlert, ShieldX,
  Copy, Check, ChevronLeft, ChevronRight, History, RefreshCw,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import {
  fetchEventByIndex, fetchInclusionProof, verifyEvent, tamperCheck,
  canonicalEventJson,
  type AuditEvent, type SingleEventResponse, type InclusionProofResponse,
  type TamperCheckResponse,
  getAuditEventResource,
  getAuditEventSubject,
  getAuditEventTimestamp,
  isLegacyAuditEvent,
} from '@/lib/audit-logs-api';

// ── helpers ───────────────────────────────────────────────────────────────────

function shortHash(hash: string) {
  if (!hash || hash.length <= 16) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-8)}`;
}

function formatLocalTimestamp(timestamp?: string) {
  if (!timestamp) return null;
  return new Date(timestamp).toLocaleString();
}

function CopyableHash({ hash, full = false }: { hash: string; full?: boolean }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(hash);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            onClick={copy}
            className="flex items-center gap-1.5 font-mono text-xs text-muted-foreground hover:text-foreground transition-colors break-all text-left"
          >
            {full ? hash : shortHash(hash)}
            {copied ? <Check className="h-3 w-3 text-green-500 flex-shrink-0" /> : <Copy className="h-3 w-3 opacity-50 flex-shrink-0" />}
          </button>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs max-w-sm break-all">{hash}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-4 py-2">
      <dt className="text-sm text-muted-foreground sm:w-32 flex-shrink-0">{label}</dt>
      <dd className="text-sm flex-1">{children}</dd>
    </div>
  );
}

// ── Tamper Check Dialog ───────────────────────────────────────────────────────

interface TamperDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  original: AuditEvent;
}

function TamperCheckDialog({ open, onOpenChange, original }: TamperDialogProps) {
  const [jsonValue, setJsonValue] = useState(() => JSON.stringify(original, null, 2));
  const [isChecking, setIsChecking] = useState(false);
  const [result, setResult] = useState<TamperCheckResponse | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setJsonValue(JSON.stringify(original, null, 2));
      setJsonError(null);
      setResult(null);
    }
  }, [open, original]);

  const handleCheck = async (e: React.FormEvent) => {
    e.preventDefault();
    let tampered: AuditEvent;

    try {
      tampered = JSON.parse(jsonValue) as AuditEvent;
      setJsonError(null);
    } catch {
      setJsonError('Tampered event JSON must be valid JSON.');
      return;
    }

    setIsChecking(true);
    setResult(null);
    try {
      const res = await tamperCheck(original, tampered);
      setResult(res);
    } catch (err: any) {
      sileo.error({ title: 'Tamper Check Failed', description: err.message });
    } finally {
      setIsChecking(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Tamper Check</DialogTitle>
          <DialogDescription>
            Edit the stored event JSON to simulate tampering and run the server-side integrity checks against the original entry.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleCheck} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tc-json">Tampered event JSON</Label>
            <Textarea
              id="tc-json"
              rows={16}
              className="font-mono text-xs"
              value={jsonValue}
              onChange={(event) => setJsonValue(event.target.value)}
            />
            {jsonError && <p className="text-xs text-destructive">{jsonError}</p>}
          </div>

          {result && (
            <div className={cn(
              'rounded-md border p-3 space-y-3',
              result.tamper_detected ? 'border-destructive/50 bg-destructive/10' : 'border-green-500/50 bg-green-500/10'
            )}>
              <div className="flex items-center gap-2 font-semibold text-sm">
                {result.tamper_detected
                  ? <><ShieldX className="h-4 w-4 text-destructive" /> Tampering detected</>
                  : <><ShieldCheck className="h-4 w-4 text-green-500" /> No tampering detected</>
                }
              </div>
              <div className="space-y-2">
                {result.checks.map(c => (
                  <div key={c.name} className="flex items-start gap-2">
                    {c.passed
                      ? <Check className="h-4 w-4 text-green-500 mt-0.5 flex-shrink-0" />
                      : <ShieldX className="h-4 w-4 text-destructive mt-0.5 flex-shrink-0" />
                    }
                    <div>
                      <p className="text-xs font-mono font-medium">{c.name}</p>
                      <p className="text-xs text-muted-foreground">{c.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
            <Button type="submit" disabled={isChecking}>
              {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Run Check
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ── Merkle Proof Visualizer ───────────────────────────────────────────────────

function MerkleProofCard({ proof }: { proof: InclusionProofResponse }) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">Merkle Inclusion Proof</CardTitle>
          <Badge variant={proof.verified ? 'default' : 'destructive'} className="gap-1">
            {proof.verified
              ? <><ShieldCheck className="h-3 w-3" /> Verified</>
              : <><ShieldAlert className="h-3 w-3" /> Unverified</>
            }
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y divide-border">
          <DetailRow label="Leaf Index">
            <span className="font-mono">{proof.leaf_index}</span>
          </DetailRow>
          <DetailRow label="Tree Size">
            <span className="font-mono">{proof.tree_size}</span>
          </DetailRow>
          <DetailRow label="Root Hash">
            <CopyableHash hash={proof.root_hash} full />
          </DetailRow>
          <DetailRow label="Leaf Hash">
            <CopyableHash hash={proof.leaf_hash} full />
          </DetailRow>
        </dl>

        {proof.merkle_path.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Sibling Hashes ({proof.merkle_path.length} levels)
              </p>
              <div className="space-y-1">
                {proof.merkle_path.map((step) => (
                  <div key={step.level} className="flex items-center gap-3 py-1.5 px-2 rounded hover:bg-muted/40">
                    <span className="text-xs text-muted-foreground w-16 flex-shrink-0">
                      Level {step.level}
                      {step.level === 0 && (
                        <span className="block text-[10px]">leaf sibling</span>
                      )}
                      {step.level === proof.merkle_path.length - 1 && step.level !== 0 && (
                        <span className="block text-[10px]">subtree root</span>
                      )}
                    </span>
                    <CopyableHash hash={step.sibling_hash} />
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function AuditLogDetailsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const indexParam = searchParams.get('index');
  const index = indexParam !== null ? parseInt(indexParam, 10) : null;

  const [eventData, setEventData] = useState<SingleEventResponse | null>(null);
  const [proof, setProof] = useState<InclusionProofResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isTamperOpen, setIsTamperOpen] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ verified: boolean; detail?: string; leaf_index?: number } | null>(null);

  const loadData = useCallback(async () => {
    if (index === null || isNaN(index)) {
      setError('Invalid or missing leaf index.');
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    setVerifyResult(null);
    try {
      const [ev, pr] = await Promise.all([
        fetchEventByIndex(index),
        fetchInclusionProof(index),
      ]);
      setEventData(ev);
      setProof(pr);
    } catch (err: any) {
      setError(err.message || 'Failed to load event details.');
    } finally {
      setIsLoading(false);
    }
  }, [index]);

  useEffect(() => { loadData(); }, [loadData]);

  const handleVerify = async () => {
    if (!eventData) return;
    setIsVerifying(true);
    setVerifyResult(null);
    try {
      const res = await verifyEvent(eventData.event);
      setVerifyResult({ verified: res.verified, detail: res.detail, leaf_index: res.leaf_index });
    } catch (err: any) {
      sileo.error({ title: 'Verify Failed', description: err.message });
    } finally {
      setIsVerifying(false);
    }
  };

  const navigateTo = (i: number) => router.push(`/audit-logs/details?index=${i}`);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="ml-2 text-muted-foreground">Loading event…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/audit-logs')}>
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to Audit Logs
        </Button>
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  if (!eventData) return null;

  const { event } = eventData;
  const eventTimestamp = getAuditEventTimestamp(event);
  const eventSubject = getAuditEventSubject(event);
  const eventResource = getAuditEventResource(event);
  const isLegacyEvent = isLegacyAuditEvent(event);
  const committedJson = JSON.stringify(JSON.parse(canonicalEventJson(event)), null, 2);

  return (
    <div className="w-full space-y-6 pb-8">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/audit-logs')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back
          </Button>
          <div className="flex items-center gap-2">
            <History className="h-6 w-6 text-primary" />
            <h1 className="text-xl font-semibold">
              Event <span className="font-mono text-muted-foreground">#{eventData.index}</span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateTo(eventData.index - 1)}
            disabled={eventData.index <= 0}
            title="Previous event"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigateTo(eventData.index + 1)}
            title="Next event"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button onClick={loadData} variant="secondary" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Event Details */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Event Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-border">
              <DetailRow label="Type">
                <Badge variant="secondary" className="font-mono text-xs">{event.type}</Badge>
              </DetailRow>
              {event.specversion && (
                <DetailRow label="Spec version">
                  <span className="font-mono text-sm">{event.specversion}</span>
                </DetailRow>
              )}
              {eventSubject && (
                <DetailRow label={isLegacyEvent ? 'User ID' : 'Subject'}>
                  <span className="font-mono text-sm break-all">{eventSubject}</span>
                </DetailRow>
              )}
              {eventResource && (
                <DetailRow label={isLegacyEvent ? 'Resource' : 'Resource hint'}>
                  <span className="font-mono text-sm break-all">{eventResource}</span>
                </DetailRow>
              )}
              {event.source && (
                <DetailRow label="Source">
                  <span className="font-mono text-sm break-all">{event.source}</span>
                </DetailRow>
              )}
              {event.id && (
                <DetailRow label="Event ID">
                  <span className="font-mono text-sm break-all">{event.id}</span>
                </DetailRow>
              )}
              <DetailRow label="Timestamp">
                {eventTimestamp
                  ? <div className="space-y-1">
                      <p className="text-sm">{formatLocalTimestamp(eventTimestamp)}</p>
                      <p className="font-mono text-xs text-muted-foreground break-all">{eventTimestamp}</p>
                    </div>
                  : <span className="text-muted-foreground italic text-sm">not set</span>}
              </DetailRow>
              {event.datacontenttype && (
                <DetailRow label="Content type">
                  <span className="font-mono text-sm break-all">{event.datacontenttype}</span>
                </DetailRow>
              )}
              {event.traceid && (
                <DetailRow label="Trace ID">
                  <span className="font-mono text-sm break-all">{event.traceid}</span>
                </DetailRow>
              )}
              {event.spanid && (
                <DetailRow label="Span ID">
                  <span className="font-mono text-sm break-all">{event.spanid}</span>
                </DetailRow>
              )}
              {typeof event.data?.has_error === 'boolean' && (
                <DetailRow label="Execution">
                  <Badge variant={event.data.has_error ? 'destructive' : 'outline'}>
                    {event.data.has_error ? 'error' : 'ok'}
                  </Badge>
                </DetailRow>
              )}
              <DetailRow label="Leaf Index">
                <span className="font-mono text-sm">{eventData.index}</span>
              </DetailRow>
              <DetailRow label="Leaf Hash">
                <CopyableHash hash={eventData.leaf_hash} full />
              </DetailRow>
              <DetailRow label="Tree Size">
                <span className="font-mono text-sm">{eventData.tree_size}</span>
              </DetailRow>
              <DetailRow label="Root Hash">
                <CopyableHash hash={eventData.root_hash} full />
              </DetailRow>
            </dl>

            <Separator className="my-4" />

            {/* Canonical JSON */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Committed event JSON</p>
              <pre className="text-xs font-mono bg-muted/50 rounded-md p-3 overflow-x-auto whitespace-pre-wrap break-all border">
                {committedJson}
              </pre>
            </div>

            <Separator className="my-4" />

            {/* Inline verify result */}
            {verifyResult && (
              <div className={cn(
                'rounded-md border p-3 mb-4 space-y-1',
                verifyResult.verified ? 'border-green-500/50 bg-green-500/10' : 'border-destructive/50 bg-destructive/10'
              )}>
                <div className="flex items-center gap-2 font-medium text-sm">
                  {verifyResult.verified
                    ? <><ShieldCheck className="h-4 w-4 text-green-500" /> Event verified in log</>
                    : <><ShieldAlert className="h-4 w-4 text-destructive" /> Verification failed</>
                  }
                </div>
                {verifyResult.verified && verifyResult.leaf_index !== undefined && (
                  <p className="text-xs text-muted-foreground">Confirmed at leaf index {verifyResult.leaf_index}</p>
                )}
                {!verifyResult.verified && verifyResult.detail && (
                  <p className="text-xs text-destructive/80">{verifyResult.detail}</p>
                )}
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              <Button onClick={handleVerify} variant="outline" size="sm" disabled={isVerifying}>
                {isVerifying
                  ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying…</>
                  : <><ShieldCheck className="mr-2 h-4 w-4" /> Verify Inclusion</>
                }
              </Button>
              <Button onClick={() => setIsTamperOpen(true)} variant="outline" size="sm">
                <ShieldX className="mr-2 h-4 w-4" /> Tamper Check
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Merkle Proof */}
        {proof && <MerkleProofCard proof={proof} />}
      </div>

      {eventData && (
        <TamperCheckDialog
          open={isTamperOpen}
          onOpenChange={setIsTamperOpen}
          original={event}
        />
      )}
    </div>
  );
}
