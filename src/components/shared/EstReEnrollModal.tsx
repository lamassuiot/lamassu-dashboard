
'use client';

import React, { useState, useEffect } from 'react';
import { Sheet, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { ResizableSheetContent } from '@/components/shared/ResizableSheetContent';
import { Button } from "@/components/ui/button";
import { Card } from '@/components/ui/card';
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Info, RefreshCw as RefreshCwIcon, Search, AlertTriangle, Loader2, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { ShellCommand } from './CodeSnippet';
import { CommandStep, CommandSteps, InlineCode } from './CommandSteps';
import { csrCommands, decodeCertificateCommands, estRequestCommand, serverChainCommand } from '@/lib/est-commands';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/form-options';
import { Switch } from '@/components/ui/switch';
import { ApiDevice, fetchDevices } from '@/lib/devices-api';
import { DeviceStatusBadge } from '@/components/shared/DeviceStatusBadge';
import { getLucideIconByName } from './DeviceIconSelectorModal';
import { Stepper } from './Stepper';


// RA type definition
interface ApiRaItem {
  id: string;
  name: string;
}

interface EstReEnrollModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  ra: ApiRaItem | null;
    presentation?: 'dialog' | 'inline';
    className?: string;
}


const DeviceIcon: React.FC<{ type: string; iconColor?: string; bgColor?: string; }> = ({ type, iconColor, bgColor }) => {
  const IconComponent = getLucideIconByName(type);

  return (
    <div className={cn("p-1.5 rounded-md inline-flex items-center justify-center")} style={{ backgroundColor: bgColor || '#F0F8FF' }}>
      {IconComponent ? (
        <IconComponent className={cn("h-5 w-5")} style={{ color: iconColor || '#0f67ff' }} />
      ) : (
        <HelpCircle className={cn("h-5 w-5")} style={{ color: iconColor || '#0f67ff' }} />
      )}
    </div>
  );
};


export const EstReEnrollModal: React.FC<EstReEnrollModalProps> = ({
    isOpen,
    onOpenChange,
    ra,
    presentation = 'dialog',
    className,
}) => {
    
    const [step, setStep] = useState(1);
    
    // Step 1: Search state
    const [deviceId, setDeviceId] = useState('');
    const [isSearching, setIsSearching] = useState(false);
    const [searchError, setSearchError] = useState<string | null>(null);
    const [foundDevice, setFoundDevice] = useState<ApiDevice | null>(null);

    // Step 2: Config state
    const [rekey, setRekey] = useState(true);
    const [keygenType, setKeygenType] = useState('RSA');
    const [keygenSpec, setKeygenSpec] = useState('2048');
    const [validateServerCert, setValidateServerCert] = useState(false);

    useEffect(() => {
        if(isOpen) {
            setStep(1);
            setDeviceId('');
            setRekey(true);
            setKeygenType('RSA');
            setKeygenSpec('2048');
            setValidateServerCert(false);
            setFoundDevice(null);
            setIsSearching(false);
            setSearchError(null);
        }
    }, [isOpen]);
    
    const handleKeygenTypeChange = (type: string) => {
        setKeygenType(type);
        setKeygenSpec(type === 'RSA' ? '2048' : 'P-256');
    };

    const currentKeySpecOptions = keygenType === 'RSA' ? RSA_KEY_SIZE_OPTIONS : ECDSA_CURVE_OPTIONS;

    const handleSearch = async () => {
        if (!deviceId.trim() || !ra?.id ) {
            setSearchError("Please enter a Device ID.");
            return;
        }
        setIsSearching(true);
        setSearchError(null);
        setFoundDevice(null);
        try {
            const params = new URLSearchParams();
            params.append('page_size', '1');
            params.append('filter', `id[equal]${deviceId.trim()}`);
            params.append('filter', `dms_owner[equal]${ra.id}`); // Important: scope to the RA

            const result = await fetchDevices(params);
            if (result.list && result.list.length > 0) {
                setFoundDevice(result.list[0]);
            } else {
                setSearchError(`No device found with ID "${deviceId.trim()}" for this RA.`);
            }
        } catch (e: any) {
            setSearchError(e.message || "An error occurred during search.");
        } finally {
            setIsSearching(false);
        }
    };
    
    const handleBack = () => {
        setStep(1);
        setFoundDevice(null);
        setSearchError(null);
    };

    const finalDeviceId = foundDevice?.id || 'device-id';

    const estBaseUrl = get_EST_API_BASE_URL();
    const strippedCsrFile = `${finalDeviceId}.new.stripped.csr`;

    const reenrollCsrCommand = csrCommands({
        commonName: finalDeviceId,
        key: rekey
            ? { generate: { type: keygenType, spec: keygenSpec }, keyOut: `${finalDeviceId}.new.key` }
            : { existing: `${finalDeviceId}.existing.key` },
        csrFile: `${finalDeviceId}.new.csr`,
        strippedFile: strippedCsrFile,
    });

    const serverCertCommand = serverChainCommand(estBaseUrl, 'root-ca.pem', typeof window !== 'undefined' ? window.location.origin : undefined);

    const reenrollRequestCommand = estRequestCommand({
        url: `${estBaseUrl}/${ra?.id}/simplereenroll`,
        cert: `${finalDeviceId}.existing.crt`,
        key: `${finalDeviceId}.existing.key`,
        caFile: validateServerCert ? 'root-ca.pem' : undefined,
        body: strippedCsrFile,
        output: `${finalDeviceId}.new.p7`,
    });
    const reenrollDecodeCommand = decodeCertificateCommands(`${finalDeviceId}.new.p7`, `${finalDeviceId}.new.crt`);

    const panelContent = (
        <>
            <div className="border-b p-6 pb-4">
                <h2 className="flex items-center text-lg font-semibold"><RefreshCwIcon className="mr-2 h-6 w-6 text-primary"/>EST Re-Enroll</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                    Generate re-enrollment commands for RA: {ra?.name} ({ra?.id})
                </p>
            </div>

            <div className="flex-grow overflow-y-auto p-6 pt-4">
                <div className="py-2">
                    <Stepper currentStep={step} steps={["Search Device", "Commands"]} />
                    
                    {step === 1 && (
                        <div className="space-y-4">
                            <Label htmlFor="deviceId-search">Device ID</Label>
                            <div className="flex items-center gap-2">
                                <Input id="deviceId-search" value={deviceId} onChange={e => setDeviceId(e.target.value)} placeholder="Enter Device ID to search..."/>
                                <Button onClick={handleSearch} disabled={isSearching || !deviceId.trim()}>
                                    {isSearching ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <Search className="mr-2 h-4 w-4"/>}
                                    Search
                                </Button>
                            </div>
                            {isSearching && (
                                <div className="flex items-center pt-2 text-sm text-muted-foreground"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Searching for device...</div>
                            )}
                            {searchError && (
                                <Alert variant="destructive" className="mt-2">
                                    <AlertTriangle className="h-4 w-4"/>
                                    <AlertTitle>Search Failed</AlertTitle>
                                    <AlertDescUI>{searchError}</AlertDescUI>
                                </Alert>
                            )}
                            {foundDevice && (
                                <div className="mt-4 rounded-md border bg-muted/30 p-4">
                                    <h4 className="mb-2 font-semibold">Device Found</h4>
                                    <div className="flex items-center gap-4">
                                        <DeviceIcon type={foundDevice.icon} iconColor={foundDevice.icon_color.split('-')[0]} bgColor={foundDevice.icon_color.split('-')[1]} />
                                        <div>
                                            <p className="font-mono">{foundDevice.id}</p>
                                            <DeviceStatusBadge status={foundDevice.status} />
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {step === 2 && foundDevice && (
                        <div className="space-y-4">
                            <Alert>
                                <Info className="h-4 w-4"/>
                                <AlertTitle>Prerequisites</AlertTitle>
                                <AlertDescUI>
                                    Run from a directory containing the device&apos;s current certificate and key, <InlineCode>{finalDeviceId}.existing.crt</InlineCode> and <InlineCode>{finalDeviceId}.existing.key</InlineCode>.
                                    {!rekey && ' The existing private key will be used to generate the new CSR.'}
                                    {' '}The existing certificate is always accepted if it was issued by the RA&apos;s Enrollment CA; certificates from other CAs are accepted only if they are configured as re-enrollment validation CAs.
                                </AlertDescUI>
                            </Alert>
                            <div className="my-2 flex items-center space-x-2">
                                <Switch
                                    id="rekey-switch"
                                    checked={rekey}
                                    onCheckedChange={setRekey}
                                />
                                <Label htmlFor="rekey-switch">Generate New Key (Rekey)</Label>
                            </div>

                            {rekey && (
                                <div>
                                    <Label>New Key Parameters</Label>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label htmlFor="keygen-type">Key Type</Label>
                                            <Select value={keygenType} onValueChange={handleKeygenTypeChange}>
                                                <SelectTrigger id="keygen-type"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {KEY_TYPE_OPTIONS.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label htmlFor="keygen-spec">{keygenType === 'RSA' ? 'Key Size' : 'Curve'}</Label>
                                                <Select value={keygenSpec} onValueChange={setKeygenSpec}>
                                                <SelectTrigger id="keygen-spec"><SelectValue /></SelectTrigger>
                                                <SelectContent>
                                                    {currentKeySpecOptions.map(opt => (
                                                        <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            <div className="flex items-center space-x-2">
                                <Switch
                                    id="validate-server-cert-reenroll"
                                    checked={validateServerCert}
                                    onCheckedChange={setValidateServerCert}
                                />
                                <Label htmlFor="validate-server-cert-reenroll">Validate server certificate (recommended)</Label>
                            </div>
                            {!validateServerCert && (
                                <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                                    <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                                    TLS verification is disabled; curl runs with <InlineCode>--insecure</InlineCode>.
                                </p>
                            )}

                            <CommandSteps className="pt-2">
                                <CommandStep
                                    title="Generate the CSR"
                                    description={rekey
                                        ? <>Creates a new key <InlineCode>{finalDeviceId}.new.key</InlineCode> on the device.</>
                                        : <>Reuses the current key <InlineCode>{finalDeviceId}.existing.key</InlineCode>.</>}
                                >
                                    <ShellCommand title="Generate CSR" command={reenrollCsrCommand} />
                                </CommandStep>
                                {validateServerCert && (
                                    <CommandStep
                                        title="Trust the EST server"
                                        description={<>Store the TLS chain presented by the server as <InlineCode>root-ca.pem</InlineCode>.</>}
                                    >
                                        <ShellCommand title="Fetch server chain" command={serverCertCommand} />
                                    </CommandStep>
                                )}
                                <CommandStep
                                    title="Request the new certificate"
                                    description="Authenticate with the current device certificate."
                                >
                                    <ShellCommand title="simplereenroll" command={reenrollRequestCommand} />
                                </CommandStep>
                                <CommandStep title="Decode and inspect" description="The RA answers with a base64 PKCS#7 bundle.">
                                    <ShellCommand title="Extract certificate" command={reenrollDecodeCommand} />
                                </CommandStep>
                            </CommandSteps>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex w-full items-center justify-between border-t p-6 pt-4">
                <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                <div className="flex space-x-2">
                    {step === 1 && (
                        <Button onClick={() => setStep(2)} disabled={!foundDevice}>
                            Next <ArrowRight className="ml-2 h-4 w-4"/>
                        </Button>
                    )}
                    {step === 2 && (
                        <>
                            <Button variant="secondary" onClick={handleBack}>
                                <ArrowLeft className="mr-2 h-4 w-4"/>Back
                            </Button>
                            <Button onClick={() => onOpenChange(false)}>Finish</Button>
                        </>
                    )}
                </div>
            </div>
        </>
    );

    if (presentation === 'inline') {
        if (!isOpen) return null;

        return (
            <Card className={cn('flex h-full min-h-[650px] flex-col overflow-hidden', className)}>
                {panelContent}
            </Card>
        );
    }

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <ResizableSheetContent storageKey="est-re-enroll" side="right" className={cn('w-full p-0 data-[side=right]:sm:w-[50vw] data-[side=right]:sm:max-w-[50vw] flex flex-col', className)}>
                <SheetHeader className="sr-only">
                    <SheetTitle>EST Re-Enroll</SheetTitle>
                    <SheetDescription>
                        Generate re-enrollment commands for RA: {ra?.name} ({ra?.id})
                    </SheetDescription>
                </SheetHeader>
                {panelContent}
            </ResizableSheetContent>
        </Sheet>
    );
};
