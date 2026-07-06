

'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from "@/components/ui/button";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Binary, AlertTriangle, Loader2, CheckCircle, XCircle, Info, ShieldCheck } from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Badge } from '@/components/ui/badge';
import { initPkijsEngine } from '@/lib-crypto';
import { parseCertificatePemDetails, type ParsedPemDetails, fetchAndProcessCAs, type CA } from '@/lib/ca-data';
import { Tabs, TabsContent, TabsList, TabsTrigger, pageTabsListClass, pageTabsTriggerClass } from '@/components/ui/tabs';
import { sileo } from '@/lib/toast';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn, formatCertificateUsageLabel } from '@/lib/utils';
import { Label } from '@/components/ui/label';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { MultiSelectDropdown } from '@/components/shared/MultiSelectDropdown';
import { format as formatDate, parseISO, isValid } from 'date-fns';
import { OcspCheckModal } from '@/components/shared/OcspCheckModal';
import { IdentifierDisplay } from '@/components/shared/IdentifierDisplay';
import { BreadcrumbPage } from '@/components/shared/BreadcrumbPage';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { Code2, Layers } from 'lucide-react';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { CertificatePemTextarea } from '@/components/shared/CertificatePemTextarea';


// --- Zlint Types and Interfaces ---
interface ZlintResult {
  lint_name: string;
  status: 'pass' | 'error' | 'warn' | 'info' | 'fatal' | 'NA' | 'NE';
  details?: string;
}

type StatusFilter = 'all' | ZlintResult['status'];

interface ZlintProfile {
    name: string;
    source: string;
    citation: string;
    description: string;
    effectiveDate: string;
}

declare global {
  interface Window {
    Go: any;
    zlintCertificate: (pem: string, options: { format: 'pem', includeSources: string }) => { results: Record<string, { result: string, details?: string }>, success: boolean };
    zlintGetLints: () => { lints: Record<string, ZlintProfile>, success: boolean, error?: string, count?: number };
  }
}

// --- Singleton state for WASM loading ---
let wasmInitialized = false;

const statusSortOrder: Record<ZlintResult['status'], number> = {
    fatal: 0,
    error: 1,
    warn: 2,
    info: 3,
    pass: 4,
    NE: 5,
    NA: 6,
};


// --- Helper Functions ---
const RFC_TITLE_MAP: Record<string, string> = {
  "RFC3279": "Algorithms and Identifiers for the Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile",
  "RFC3647": "Internet X.509 Public Key Infrastructure Certificate Policy and Certification Practices Framework",
  "RFC4043": "Internet X.509 Public Key Infrastructure Permanent Identifier",
  "RFC5246": "The Transport Layer Security (TLS) Protocol Version 1.2",
  "RFC5280": "Internet X.509 Public Key Infrastructure Certificate and Certificate Revocation List (CRL) Profile",
  "RFC5480": "Elliptic Curve Cryptography Subject Public Key Information",
  "RFC5912": "New ASN.1 Modules for the Public Key Infrastructure Using X.509 (PKIX)",
  "RFC6960": "X.509 Internet Public Key Infrastructure Online Certificate Status Protocol - OCSP",
};

const renderUrlList = (urls: string[] | undefined, listTitle: string) => {
    if (!urls || urls.length === 0) return null;
    return (
      <>
        <h5 className="font-medium text-sm mt-1">{listTitle}</h5>
        <ul className="list-disc list-inside space-y-1 pl-4">
            {urls.map((url, i) => (
            <li key={i}>
                <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline break-all">{url}</a>
            </li>
            ))}
        </ul>
      </>
    );
};

const ResultStatusBadge: React.FC<{ status: ZlintResult['status'] }> = ({ status }) => {
  let Icon: React.ElementType = AlertTriangle;
  let text = 'Info';
  let className = 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-blue-400/50';

  switch (status) {
    case 'pass':
      Icon = CheckCircle;
      text = 'Pass';
      className = 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 border-green-400/50';
      break;
    case 'error':
      Icon = XCircle;
      text = 'Error';
      className = 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300 border-red-400/50';
      break;
    case 'fatal':
      Icon = XCircle;
      text = 'Fatal';
      className = 'bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200 border-red-500/50';
      break;
    case 'warn':
      Icon = AlertTriangle;
      text = 'Warn';
      className = 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300 border-yellow-400/50';
      break;
  }

  return (
    <Badge variant="secondary" className={cn('capitalize', className)}>
      <Icon className="h-4 w-4 mr-1.5" />
      <span>{text}</span>
    </Badge>
  );
};

const SourceLink: React.FC<{ text: string }> = ({ text }) => {
  if (!text) return <>N/A</>;
  
  const rfcMatch = text.match(/(RFC\s?\d+)/i);
  if (rfcMatch) {
    const rfcNumber = rfcMatch[1].replace(/\s/g, '').toUpperCase();
    let url = `https://datatracker.ietf.org/doc/html/${rfcNumber.toLowerCase()}`;
    const sectionMatch = text.match(/[:/]\s*([\w\.]+)/);
    if (sectionMatch && sectionMatch[1] && !text.toUpperCase().includes('BRS:')) {
      url += `#section-${sectionMatch[1]}`;
    }
    const displayText = RFC_TITLE_MAP[rfcNumber] || text;
    return <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{displayText}</a>;
  }

  if (text.toUpperCase() === "MOZILLA ROOT STORE POLICY") {
    return <a href="https://www.mozilla.org/en-US/about/governance/policies/security-group/certs/policy/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{text}</a>;
  }
  
  if (text.toUpperCase().includes('CABF_BR')) {
    return <a href="https://cabforum.org/working-groups/server/baseline-requirements/documents/" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{text}</a>;
  }

  try {
    new URL(text);
    return <a href={text} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{text}</a>;
    } catch {
    // Not a valid URL
  }

  return <>{text}</>;
};

export default function CertificateViewerPage() {

  // --- Common State ---
  const [pem, setPem] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("input");

  // --- Viewer State ---
  const [parsedDetails, setParsedDetails] = useState<ParsedPemDetails | null>(null);
  
  // --- Linter State ---
  const [lintResults, setLintResults] = useState<ZlintResult[]>([]);
  const [isWasmReady, setIsWasmReady] = useState(wasmInitialized);
  const [isLinting, setIsLinting] = useState(false);
  
  // --- OCSP Check State ---
  const [isOcspModalOpen, setIsOcspModalOpen] = useState(false);
  const [issuerForOcsp, setIssuerForOcsp] = useState<CA | null>(null);
  const [isFetchingIssuer, setIsFetchingIssuer] = useState(false);

  // Linter Pagination & Filtering
  const [linterCurrentPage, setLinterCurrentPage] = useState(1);
  const [linterItemsPerPage, setLinterItemsPerPage] = useState(10);
    const [linterStatusFilter, setLinterStatusFilter] = useState<StatusFilter>('all');
  
  // State to hold all lint definitions
  const [lintProfileMap, setLintProfileMap] = useState<Map<string, ZlintProfile>>(new Map());
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [selectedSources, setSelectedSources] = useState<string[]>([]);


  // --- Effects ---
  useEffect(() => {
    initPkijsEngine();
  }, []);

  // Effect to load and initialize WASM environment reliably
  useEffect(() => {
    const initializeWasm = async () => {
        if (wasmInitialized) {
            setIsWasmReady(true);
            return;
        }

        const script = document.createElement('script');
        script.src = '/wasm_exec.js';
        script.async = true;
        script.onload = async () => {
            if (!window.Go) {
                console.error("wasm_exec.js did not load the Go object on the window.");
                setError("Failed to load WASM execution environment.");
                return;
            }
            try {
                const go = new window.Go();
                const result = await WebAssembly.instantiateStreaming(fetch('/zlint.wasm'), go.importObject);
                go.run(result.instance);
                wasmInitialized = true;
                setIsWasmReady(true);
            } catch (err: any) {
                console.error("WASM instantiation failed:", err);
                setError(`Failed to load and instantiate zlint.wasm: ${err.message}`);
                wasmInitialized = false; // Allow retry on next mount
            }
        };
        script.onerror = () => {
            setError("Failed to load the WASM execution script (wasm_exec.js).");
            wasmInitialized = false;
        };

        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    };

    initializeWasm();
  }, []); // Empty dependency array ensures this runs once per component mount
  
   useEffect(() => {
    if (isWasmReady && lintProfileMap.size === 0) {
      try {
        const result = window.zlintGetLints();
        if (result && result.success && result.lints) {
          const profileMap = new Map<string, ZlintProfile>();
          const sources = new Set<string>();
          for (const lintName in result.lints) {
            const lintProfile = result.lints[lintName];
            profileMap.set(lintName, lintProfile);
            if (lintProfile.source) {
              sources.add(lintProfile.source);
            }
          }
          setLintProfileMap(profileMap);
          const sortedSources = Array.from(sources).sort((a, b) => a.localeCompare(b));
          setAvailableSources(sortedSources);
          // Default to selecting all RFC sources
          const rfcSources = sortedSources.filter(s => s.startsWith('RFC'));
          setSelectedSources(rfcSources); 
        } else {
          console.error("Failed to fetch lint profiles:", result?.error);
        }
      } catch (e) {
        console.error("Error calling zlintGetLints:", e);
      }
    }
  }, [isWasmReady, lintProfileMap.size]);
  
    useEffect(() => {
        const trimmedPem = pem.trim();

        if (!trimmedPem) {
            setIsLoading(false);
            setParsedDetails(null);
            setError(null);
            setLintResults([]);
            setIssuerForOcsp(null);
            return;
        }

        let isCancelled = false;
        setIsLoading(true);
        setError(null);
        setLintResults([]);
        setIssuerForOcsp(null);

        const timeoutId = window.setTimeout(async () => {
            try {
                const details = await parseCertificatePemDetails(trimmedPem);
                if (isCancelled) return;

                if (details.signatureAlgorithm === 'N/A') {
                    throw new Error('Could not parse the provided text as a valid PEM certificate.');
                }

                setParsedDetails(details);
                setError(null);
            } catch (e: any) {
                if (isCancelled) return;
                setError(e.message || 'An unknown error occurred during parsing.');
                setParsedDetails(null);
            } finally {
                if (!isCancelled) {
                    setIsLoading(false);
                }
            }
        }, 400);

        return () => {
            isCancelled = true;
            window.clearTimeout(timeoutId);
        };
    }, [pem]);

  const handleOpenOcspModal = async () => {
    if (!parsedDetails ) {
        sileo.error({ title: "Cannot perform OCSP Check", description: "Certificate details are missing or you are not logged in." });
        return;
    }

    setIsFetchingIssuer(true);
    try {
        let foundIssuer: CA | null = null;
        
        // 1. Try to find issuer locally via AKI
        if (parsedDetails.authorityKeyId) {
            const issuerCAs = await fetchAndProcessCAs(`filter=subject_key_id[equal]${parsedDetails.authorityKeyId}`);
            foundIssuer = issuerCAs?.[0] || null;
        }

        // 2. If not found, try to fetch from caIssuers URL
        if (!foundIssuer && parsedDetails.caIssuersUrls && parsedDetails.caIssuersUrls.length > 0) {
            let issuerUrl = parsedDetails.caIssuersUrls[0];
            if (issuerUrl.startsWith('http://')) {
                issuerUrl = issuerUrl.replace('http://', 'https://');
            }
            try {
                const response = await fetch(issuerUrl);
                if (!response.ok) throw new Error(`HTTP error ${response.status}`);
                const issuerPem = await response.text();
                const parsedIssuerDetails = await parseCertificatePemDetails(issuerPem);
                // Create a temporary CA object for the modal
                foundIssuer = {
                    id: parsedIssuerDetails.serialNumber || 'external-issuer',
                    name: parsedIssuerDetails.subject || 'External Issuer',
                    pemData: issuerPem,
                    // Add other required CA fields with default/dummy values
                    issuer: parsedIssuerDetails.issuer || 'Unknown',
                    expires: parsedIssuerDetails.validTo,
                    serialNumber: parsedIssuerDetails.serialNumber || '',
                    status: 'active', // Assume active
                    keyAlgorithm: parsedIssuerDetails.publicKeyAlgorithm || '',
                };
            } catch (e: any) {
                console.error("Failed to fetch or parse issuer from AIA:", e);
                sileo.warning({ title: "AIA Fetch Failed", description: `Could not retrieve the issuer certificate from ${issuerUrl}.` });
            }
        }
        
        if (!foundIssuer) {
            sileo.error({ title: "Issuer Not Found", description: "Could not find or fetch the issuer CA. OCSP check is not possible." });
            setIssuerForOcsp(null);
        } else {
            setIssuerForOcsp(foundIssuer);
            setIsOcspModalOpen(true);
        }

    } catch (e: any) {
        sileo.error({ title: "Error Finding Issuer", description: e.message });
    } finally {
        setIsFetchingIssuer(false);
    }
  };


  const handleLint = () => {
    if (!isWasmReady) {
      sileo.error({ title: "WASM Not Ready", description: "The linter is still loading. Please wait a moment." });
      return;
    }
    
    setIsLinting(true);
    setError(null);
    setLintResults([]);
    setLinterCurrentPage(1);
    setLinterStatusFilter('all');

    setTimeout(() => {
        try {
            const options = {
                format: 'pem' as 'pem',
                includeSources: selectedSources.join(','),
            };
            const rawResult = window.zlintCertificate(pem, options);
            if (!rawResult?.results) throw new Error("The linting function did not return a valid result object.");

            const transformedResults: ZlintResult[] = Object.entries(rawResult.results).map(([lintName, lintData]) => ({
                lint_name: lintName,
                status: lintData.result as ZlintResult['status'],
                details: lintData.details,
            }));
            
            const filteredAndSortedResults = transformedResults
                .filter(result => result.status !== 'NA' && result.status !== 'NE')
                .sort((a, b) => statusSortOrder[a.status] - statusSortOrder[b.status]);

            setLintResults(filteredAndSortedResults);
        } catch (e: any) {
            setError(`An error occurred during linting: ${e.message}`);
            setLintResults([]);
        } finally {
            setIsLinting(false);
        }
    }, 100);
  };
  
    const filteredLintResults = useMemo(() => {
        if (linterStatusFilter === 'all') {
            return lintResults;
        }
        return lintResults.filter((result) => result.status === linterStatusFilter);
    }, [lintResults, linterStatusFilter]);

    const lintStatusCounts = useMemo(() => {
        return {
            all: lintResults.length,
            fatal: lintResults.filter((result) => result.status === 'fatal').length,
            error: lintResults.filter((result) => result.status === 'error').length,
            warn: lintResults.filter((result) => result.status === 'warn').length,
            info: lintResults.filter((result) => result.status === 'info').length,
            pass: lintResults.filter((result) => result.status === 'pass').length,
        };
    }, [lintResults]);

    const paginatedLintResults = useMemo(() => {
    const startIndex = (linterCurrentPage - 1) * linterItemsPerPage;
        return filteredLintResults.slice(startIndex, startIndex + linterItemsPerPage);
    }, [filteredLintResults, linterCurrentPage, linterItemsPerPage]);

    const totalLinterPages = Math.ceil(filteredLintResults.length / linterItemsPerPage);

  const handlePageChange = (newPage: number) => {
    if (newPage > 0 && newPage <= totalLinterPages) {
        setLinterCurrentPage(newPage);
    }
  }

  const availableSourceOptions = useMemo(() => {
    return availableSources.map(source => ({ value: source, label: source }));
  }, [availableSources]);
  
  return (
        <BreadcrumbPage items={[{label:'Home',href:'/'}, {label:'Tools'}, {label:'Certificate Viewer'}]} className="space-y-5 pb-8">
            <div className="space-y-6 w-full pb-8">
                <div className="flex items-start gap-3">
                    <div className="shrink-0 rounded-md bg-primary/10 p-1.5">
                        <Binary className="h-8 w-8 text-primary" />
                    </div>
                    <div>
                        <h1 className="text-2xl font-headline font-semibold">Certificate Analysis Tool</h1>
                        <p className="text-sm text-muted-foreground mt-1">
                            Parse X.509 PEM certificates, inspect extensions, run lint checks, and validate OCSP status.
                        </p>
                    </div>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                        <div className="border-b overflow-x-auto overflow-y-hidden">
                            <TabsList className={cn(pageTabsListClass, 'min-w-max')}>
                                    <TabsTrigger value="input" className={pageTabsTriggerClass}>
                                        <Code2 className="h-4 w-4" />
                                        PEM Input
                                    </TabsTrigger>
                                    <TabsTrigger value="details" className={pageTabsTriggerClass} disabled={!parsedDetails}>
                                        <Info className="h-4 w-4" />
                                        Parsed Details
                                    </TabsTrigger>
                                    <TabsTrigger value="linter" className={pageTabsTriggerClass} disabled={!parsedDetails}>
                                        <Layers className="h-4 w-4" />
                                        Certificate Linter
                                    </TabsTrigger>
                            </TabsList>
                        </div>

                        <div className="mt-6 pb-6">
                        <TabsContent value="input" className="mt-0">
                                <div className="py-6 space-y-4">
                                    <div className="flex flex-col overflow-hidden rounded-xl border">
                                        <div className="flex items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                                                    <Code2 className="h-3.5 w-3.5 text-primary" />
                                                </div>
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold leading-none">Certificate PEM</p>
                                                    <p className="text-xs text-muted-foreground mt-0.5">Paste a PEM-encoded X.509 certificate to analyze.</p>
                                                </div>
                                            </div>

                                            {isLoading ? (
                                                <div className="inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-muted-foreground">
                                                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                    Parsing...
                                                </div>
                                            ) : null}
                                        </div>

                                        <CertificatePemTextarea
                                            value={pem}
                                            onValueChange={setPem}
                                            placeholder="-----BEGIN CERTIFICATE-----..."
                                            className="h-[30rem] rounded-none border-0 bg-muted/10 font-mono text-xs leading-relaxed focus-visible:ring-0 focus-visible:ring-offset-0"
                                        />
                                    </div>

                                    <p className="text-xs text-muted-foreground">Supports PEM-encoded X.509 certificates.</p>

                                    {error && (
                                        <Alert variant="destructive">
                                            <AlertTriangle className="h-4 w-4" />
                                            <AlertTitle>Parsing Error</AlertTitle>
                                            <AlertDescription>{error}</AlertDescription>
                                        </Alert>
                                    )}
                                </div>
            </TabsContent>

            <TabsContent value="details" className="mt-0">
                 {parsedDetails && (
                                        <div>
                                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
                                                <div>
                                                    <p className="font-semibold">General Information</p>
                                                    <p className="text-sm text-muted-foreground mt-1">Identity, issuer, lifecycle window, and CA constraints.</p>
                                                </div>
                                                <div className="lg:col-span-2 space-y-4">
                                                    <div className="flex justify-end">
                                                        <Button
                                                            variant="secondary"
                                                            onClick={handleOpenOcspModal}
                                                            disabled={isFetchingIssuer || !parsedDetails.ocspUrls || parsedDetails.ocspUrls.length === 0}
                                                            title={
                                                                !parsedDetails.ocspUrls || parsedDetails.ocspUrls.length === 0
                                                                    ? 'Certificate does not contain an OCSP URL.'
                                                                    : 'Check OCSP Status'
                                                            }
                                                        >
                                                            {isFetchingIssuer ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                                                            OCSP Check
                                                        </Button>
                                                    </div>

                                                    <DetailInfoRows>
                                                        <DetailInfoRow label="Subject" value={<span className="font-mono text-xs">{parsedDetails.subject}</span>} className="first:pt-0" />
                                                        <DetailInfoRow label="Issuer" value={<span className="font-mono text-xs">{parsedDetails.issuer}</span>} />
                                                        <DetailInfoRow label="Serial Number" value={<IdentifierDisplay value={parsedDetails.serialNumber} />} />
                                                        <DetailInfoRow label="Valid From" value={isValid(parseISO(parsedDetails.validFrom)) ? formatDate(parseISO(parsedDetails.validFrom), 'PPpp') : 'Invalid Date'} />
                                                        <DetailInfoRow label="Valid To" value={isValid(parseISO(parsedDetails.validTo)) ? formatDate(parseISO(parsedDetails.validTo), 'PPpp') : 'Invalid Date'} />
                                                        <DetailInfoRow label="Is CA" value={<Badge variant={parsedDetails.isCa ? 'default' : 'secondary'}>{parsedDetails.isCa ? 'Yes' : 'No'}</Badge>} className="last:pb-0" />
                                                    </DetailInfoRows>

                                                    {parsedDetails.pathLenConstraint !== undefined && (
                                                        <DetailInfoRows>
                                                            <DetailInfoRow
                                                                label="Path Length Constraint"
                                                                value={<Badge variant="secondary">{parsedDetails.pathLenConstraint ?? 'None'}</Badge>}
                                                                className="first:pt-0 last:pb-0"
                                                            />
                                                        </DetailInfoRows>
                                                    )}
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
                                                <div>
                                                    <p className="font-semibold">Key & Signature</p>
                                                    <p className="text-sm text-muted-foreground mt-1">Algorithm and fingerprint material for this certificate.</p>
                                                </div>
                                                <div className="lg:col-span-2">
                                                    <DetailInfoRows>
                                                        <DetailInfoRow label="Public Key Algorithm" value={parsedDetails.publicKeyAlgorithm || 'N/A'} className="first:pt-0" />
                                                        <DetailInfoRow label="Signature Algorithm" value={parsedDetails.signatureAlgorithm || 'N/A'} />
                                                        <DetailInfoRow label="SHA-256 Fingerprint" value={parsedDetails.fingerprintSha256 || 'N/A'} valueClassName="font-mono text-xs" />
                                                        <DetailInfoRow label="Subject Key ID (SKI)" value={parsedDetails.subjectKeyId || 'N/A'} valueClassName="font-mono text-xs" />
                                                        <DetailInfoRow label="Authority Key ID (AKI)" value={parsedDetails.authorityKeyId || 'N/A'} valueClassName="font-mono text-xs" className="last:pb-0" />
                                                    </DetailInfoRows>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
                                                <div>
                                                    <p className="font-semibold">Certificate Extensions</p>
                                                    <p className="text-sm text-muted-foreground mt-1">Alternative names and certificate usage declarations.</p>
                                                </div>
                                                <div className="lg:col-span-2">
                                                    <DetailInfoRows>
                                                        <DetailInfoRow
                                                            label="Subject Alternative Names"
                                                            value={
                                                                parsedDetails.sans && parsedDetails.sans.length > 0 ? (
                                                                    <div className="flex flex-wrap gap-1">
                                                                        {parsedDetails.sans.map((san, index) => <Badge key={index} variant="secondary">{san}</Badge>)}
                                                                    </div>
                                                                ) : 'Not Specified'
                                                            }
                                                            className="first:pt-0"
                                                        />
                                                        <DetailInfoRow
                                                            label="Key Usages"
                                                            value={
                                                                (parsedDetails.keyUsage && parsedDetails.keyUsage.length > 0) || (parsedDetails.extendedKeyUsage && parsedDetails.extendedKeyUsage.length > 0) ? (
                                                                    <div className="space-y-2">
                                                                        {parsedDetails.keyUsage && parsedDetails.keyUsage.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {parsedDetails.keyUsage.map(usage => <Badge key={usage} variant="secondary">{formatCertificateUsageLabel(usage)}</Badge>)}
                                                                            </div>
                                                                        )}
                                                                        {parsedDetails.extendedKeyUsage && parsedDetails.extendedKeyUsage.length > 0 && (
                                                                            <div className="flex flex-wrap gap-1">
                                                                                {parsedDetails.extendedKeyUsage.map(usage => <Badge key={usage} variant="secondary">{formatCertificateUsageLabel(usage)}</Badge>)}
                                                                            </div>
                                                                        )}
                                                                    </div>
                                                                ) : 'Not Specified'
                                                            }
                                                            className="last:pb-0"
                                                        />
                                                    </DetailInfoRows>
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
                                                <div>
                                                    <p className="font-semibold">Distribution Points</p>
                                                    <p className="text-sm text-muted-foreground mt-1">CRL, OCSP, and issuer endpoints embedded in the certificate.</p>
                                                </div>
                                                <div className="space-y-3 lg:col-span-2">
                                                    {renderUrlList(parsedDetails.crlDistributionPoints, 'CRL Distribution Points (CDP)')}
                                                    {parsedDetails.crlDistributionPoints && (parsedDetails.ocspUrls || parsedDetails.caIssuersUrls) && <Separator />}
                                                    {renderUrlList(parsedDetails.ocspUrls, 'OCSP Responders (from AIA)')}
                                                    {parsedDetails.ocspUrls && parsedDetails.caIssuersUrls && <Separator />}
                                                    {renderUrlList(parsedDetails.caIssuersUrls, 'CA Issuers (from AIA)')}
                                                    {(!parsedDetails.crlDistributionPoints || parsedDetails.crlDistributionPoints.length === 0) && (!parsedDetails.ocspUrls || parsedDetails.ocspUrls.length === 0) && (!parsedDetails.caIssuersUrls || parsedDetails.caIssuersUrls.length === 0) && (
                                                        <p className="text-sm text-muted-foreground">No distribution points specified in certificate.</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                )}
            </TabsContent>
            
            <TabsContent value="linter" className="mt-0">
                                <div>
                                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-3 py-6">
                                        <div>
                                            <p className="font-semibold">Linter Configuration</p>
                                            <p className="text-sm text-muted-foreground mt-1">Select rule sources and run checks against the current parsed certificate.</p>
                                        </div>
                                        <div className="lg:col-span-2 space-y-4">
                                            <div className="flex flex-col md:flex-row gap-4 items-end">
                                                <div className="flex-grow w-full space-y-1.5">
                                                    <Label htmlFor="source-filter">Lint Sources</Label>
                                                    <MultiSelectDropdown
                                                        id="source-filter"
                                                        options={availableSourceOptions}
                                                        allOptionValues={availableSources}
                                                        selectedValues={selectedSources}
                                                        onChange={setSelectedSources}
                                                        buttonText="Select sources..."
                                                    />
                                                </div>
                                                <Button onClick={handleLint} disabled={isLinting || !isWasmReady} className="w-full md:w-auto">
                                                    {isLinting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : !isWasmReady ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                                    {!isWasmReady ? 'Loading Linter...' : 'Run Linter'}
                                                </Button>
                                            </div>
                                        </div>
                                    </div>

                                    <Separator />

                                    <div className="py-6">
                                            {!isLinting && lintResults.length === 0 && (
                                                <div className="rounded-lg border border-dashed bg-muted/20 p-4 text-sm text-muted-foreground">
                                                    Run the linter to evaluate this certificate against selected rule sources.
                                                </div>
                                            )}

                                            {isLinting && (
                                                <div className="flex items-center text-muted-foreground text-sm"><Loader2 className="mr-2 h-4 w-4 animate-spin"/> Linting...</div>
                                            )}

                                            {lintResults.length > 0 && (
                                                <div>
                                                    <div className="mb-4 flex justify-start">
                                                        <div className="w-[180px] space-y-1.5">
                                                            <Label htmlFor="status-filter" className="text-sm text-muted-foreground">Status</Label>
                                                            <Select
                                                                value={linterStatusFilter}
                                                                onValueChange={(value) => {
                                                                    setLinterStatusFilter(value as StatusFilter);
                                                                    setLinterCurrentPage(1);
                                                                }}
                                                            >
                                                                <SelectTrigger id="status-filter" className="h-9">
                                                                    <SelectValue />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="all">All ({lintStatusCounts.all})</SelectItem>
                                                                    <SelectItem value="fatal">Fatal ({lintStatusCounts.fatal})</SelectItem>
                                                                    <SelectItem value="error">Error ({lintStatusCounts.error})</SelectItem>
                                                                    <SelectItem value="warn">Warn ({lintStatusCounts.warn})</SelectItem>
                                                                    <SelectItem value="info">Info ({lintStatusCounts.info})</SelectItem>
                                                                    <SelectItem value="pass">Pass ({lintStatusCounts.pass})</SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                    </div>

                                                    <ScrollArea className="w-full whitespace-nowrap">
                                                        <Table>
                                                            <TableHeader className="[&_tr]:border-0">
                                                                <TableRow className="border-0">
                                                                    <TableHead className="w-[100px]">Status</TableHead>
                                                                    <TableHead>Lint Name</TableHead>
                                                                    <TableHead>Description & Details</TableHead>
                                                                </TableRow>
                                                            </TableHeader>
                                                            <TableBody>
                                                                {paginatedLintResults.map((result, index) => {
                                                                    const profile = lintProfileMap.get(result.lint_name);
                                                                    return (
                                                                        <TableRow key={index} className="border-0">
                                                                            <TableCell><ResultStatusBadge status={result.status} /></TableCell>
                                                                            <TableCell className="font-mono text-xs">{result.lint_name}</TableCell>
                                                                            <TableCell className="text-sm">
                                                                                {profile && <p className="font-medium">{profile.description}</p>}
                                                                                <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                                                                    {profile?.source && <div><strong>Source:</strong> <SourceLink text={profile.source} /></div>}
                                                                                    {profile?.citation && <div><strong>Citation:</strong> <SourceLink text={profile.citation} /></div>}
                                                                                    {result.details && <p><strong>Details:</strong> {result.details}</p>}
                                                                                </div>
                                                                            </TableCell>
                                                                        </TableRow>
                                                                    )
                                                                })}
                                                            </TableBody>
                                                        </Table>
                                                        <ScrollBar orientation="horizontal" />
                                                    </ScrollArea>

                                                    {totalLinterPages > 1 && (
                                                        <div className="flex justify-between items-center mt-4">
                                                            <div className="flex items-center space-x-2">
                                                                <Label htmlFor="itemsPerPage" className="text-sm text-muted-foreground">Items per page:</Label>
                                                                <Select value={String(linterItemsPerPage)} onValueChange={(value) => { setLinterItemsPerPage(Number(value)); setLinterCurrentPage(1); }}>
                                                                    <SelectTrigger id="itemsPerPage" className="w-[70px] h-9">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="10">10</SelectItem>
                                                                        <SelectItem value="25">25</SelectItem>
                                                                        <SelectItem value="50">50</SelectItem>
                                                                        <SelectItem value="100">100</SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                            <div className="flex items-center space-x-2">
                                                                <span className="text-sm text-muted-foreground">
                                                                    Page {linterCurrentPage} of {totalLinterPages}
                                                                </span>
                                                                <Button onClick={() => handlePageChange(linterCurrentPage - 1)} disabled={linterCurrentPage === 1} variant="secondary">
                                                                    <ChevronLeft className="mr-1 h-4 w-4" /> Previous
                                                                </Button>
                                                                <Button onClick={() => handlePageChange(linterCurrentPage + 1)} disabled={linterCurrentPage >= totalLinterPages} variant="secondary">
                                                                    Next <ChevronRight className="ml-1 h-4 w-4" />
                                                                </Button>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                    </div>
                                </div>
            </TabsContent>
            </div>
        </Tabs>
      </div>

       {parsedDetails && (
          <OcspCheckModal
              isOpen={isOcspModalOpen}
              onClose={() => setIsOcspModalOpen(false)}
              // The OcspCheckModal expects a CertificateData object, which has a different shape from ParsedPemDetails.
              // We need to create a temporary object that conforms to what the modal needs.
              certificate={{
                  id: parsedDetails.serialNumber || 'temp-id',
                  serialNumber: parsedDetails.serialNumber || 'temp-id',
                  pemData: pem,
                  ocspUrls: parsedDetails.ocspUrls,
                  // Add other required fields with default/dummy values if necessary, as the modal might need them.
                  // This is a bit of a hack, a better solution would be to refactor OcspCheckModal to accept a simpler object.
                  fileName: 'parsed_cert.pem',
                  subject: parsedDetails.subject || '',
                  issuer: parsedDetails.issuer || '',
                  validFrom: parsedDetails.validFrom,
                  validTo: parsedDetails.validTo,
              }}
              issuerCertificate={issuerForOcsp}
          />
       )}
    </BreadcrumbPage>
  );
}
