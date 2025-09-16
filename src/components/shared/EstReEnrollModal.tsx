
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ArrowLeft, Info, RefreshCw as RefreshCwIcon, Search, AlertTriangle, Loader2, HelpCircle, ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { useToast } from '@/hooks/use-toast';
import { Alert, AlertDescription as AlertDescUI, AlertTitle } from '../ui/alert';
import { CodeBlock } from './CodeBlock';
import { get_EST_API_BASE_URL } from '@/lib/api-domains';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { KEY_TYPE_OPTIONS, RSA_KEY_SIZE_OPTIONS, ECDSA_CURVE_OPTIONS } from '@/lib/key-spec-constants';
import { Switch } from '@/components/ui/switch';
import { useAuth } from '@/contexts/AuthContext';
import { ApiDevice, fetchDevices } from '@/lib/devices-api';
import { Badge } from '@/components/ui/badge';
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
}

// Local component copied from app/devices/page.tsx
const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  let badgeClass = "";
  const upperStatus = status.toUpperCase();
  switch (upperStatus) {
    case 'ACTIVE':
      badgeClass = "bg-green-100 text-green-700 dark:bg-green-700/30 dark:text-green-300 border-green-300 dark:border-green-700";
      break;
    case 'NO_IDENTITY':
      badgeClass = "bg-sky-100 text-sky-700 dark:bg-sky-700/30 dark:text-sky-300 border-sky-300 dark:border-sky-700";
      break;
    case 'INACTIVE':
      badgeClass = "bg-yellow-100 text-yellow-700 dark:bg-yellow-700/30 dark:text-yellow-300 border-yellow-300 dark:border-yellow-700";
      break;
    case 'PENDING_ACTIVATION':
      badgeClass = "bg-orange-100 text-orange-700 dark:bg-orange-700/30 dark:text-orange-300 border-orange-300 dark:border-orange-700";
      break;
    case 'DECOMMISSIONED':
      badgeClass = "bg-gray-100 text-gray-600 dark:bg-gray-800/30 dark:text-gray-400 border-gray-400 dark:border-gray-600";
      break;
    default:
      badgeClass = "bg-muted text-muted-foreground border-border";
  }
  return <Badge variant="outline" className={cn("text-xs capitalize", badgeClass)}>{status.replace('_', ' ').toLowerCase()}</Badge>;
};

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


export const EstReEnrollModal: React.FC<EstReEnrollModalProps> = ({ isOpen, onOpenChange, ra }) => {
    const { toast } = useToast();
    const { user } = useAuth();
    
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
        if (!deviceId.trim() || !ra?.id || !user?.access_token) {
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

            const result = await fetchDevices(user.access_token, params);
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

    const keygenCommandForRekey = keygenType === 'RSA' 
        ? `-newkey rsa:${keygenSpec} -keyout ${finalDeviceId}.new.key`
        : `-newkey ec -pkeyopt ec_paramgen_curve:${keygenSpec} -keyout ${finalDeviceId}.new.key`;
    
    const opensslCombinedCommand = rekey
        ? `echo "Generating new key and CSR for re-enrollment..."\nopenssl req -new ${keygenCommandForRekey} -nodes -out ${finalDeviceId}.new.csr -subj "/CN=${finalDeviceId}"\n\n# Strip header/footer from CSR for cURL\ncat ${finalDeviceId}.new.csr | sed '/-----BEGIN CERTIFICATE REQUEST-----/d' | sed '/-----END CERTIFICATE REQUEST-----/d' > ${finalDeviceId}.new.stripped.csr`
        : `echo "Generating CSR using existing key..."\nopenssl req -new -key ${finalDeviceId}.existing.key -out ${finalDeviceId}.new.csr -subj "/CN=${finalDeviceId}"\n\n# Strip header/footer from CSR for cURL\ncat ${finalDeviceId}.new.csr | sed '/-----BEGIN CERTIFICATE REQUEST-----/d' | sed '/-----END CERTIFICATE REQUEST-----/d' > ${finalDeviceId}.new.stripped.csr`;


    const serverCertCommand = `echo "Fetching server root CA for validation..."\nLAMASSU_SERVER=lab.lamassu.io\nopenssl s_client -showcerts -servername $LAMASSU_SERVER -connect $LAMASSU_SERVER:443 2>/dev/null </dev/null | sed -ne '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > root-ca.pem`;
    
    const curlValidationFlag = validateServerCert ? '--cacert root-ca.pem' : '-k';
    const finalReEnrollCommand = [
      `echo "Performing re-enrollment..."\ncurl -v --cert ${finalDeviceId}.existing.crt --key ${finalDeviceId}.existing.key ${curlValidationFlag} -H "Content-Type: application/pkcs10" --data-binary @${finalDeviceId}.new.stripped.csr -o ${finalDeviceId}.new.p7 "${get_EST_API_BASE_URL()}/${ra?.id}/simplereenroll"`,
      `echo "Extracting new certificate..."\nopenssl base64 -d -in ${finalDeviceId}.new.p7 | openssl pkcs7 -inform DER -outform PEM -print_certs -out ${finalDeviceId}.new.crt`,
      `echo "Verifying new certificate..."\nopenssl x509 -text -noout -in ${finalDeviceId}.new.crt`
    ].join('\n\n');

    return (
        <Dialog open={isOpen} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl md:max-w-2xl lg:max-w-3xl max-h-[90vh] flex flex-col">
                <DialogHeader>
                    <DialogTitle className="flex items-center"><RefreshCwIcon className="mr-2 h-6 w-6 text-primary"/>EST Re-Enroll</DialogTitle>
                    <DialogDescription>
                        Generate re-enrollment commands for RA: {ra?.name} ({ra?.id})
                    </DialogDescription>
                </DialogHeader>

                <div className="flex-grow my-2 -mr-6 overflow-y-auto pr-6">
                    <div className="py-4">
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
                                    <div className="flex items-center text-muted-foreground text-sm pt-2"><Loader2 className="mr-2 h-4 w-4 animate-spin"/>Searching for device...</div>
                                )}
                                {searchError && (
                                    <Alert variant="destructive" className="mt-2">
                                        <AlertTriangle className="h-4 w-4"/>
                                        <AlertTitle>Search Failed</AlertTitle>
                                        <AlertDescUI>{searchError}</AlertDescUI>
                                    </Alert>
                                )}
                                {foundDevice && (
                                    <div className="mt-4 p-4 border rounded-md bg-muted/30">
                                        <h4 className="font-semibold mb-2">Device Found</h4>
                                        <div className="flex items-center gap-4">
                                            <DeviceIcon type={foundDevice.icon} iconColor={foundDevice.icon_color.split('-')[0]} bgColor={foundDevice.icon_color.split('-')[1]} />
                                            <div>
                                                <p className="font-mono">{foundDevice.id}</p>
                                                <StatusBadge status={foundDevice.status as any} />
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
                                        This process assumes you have the device's current, valid certificate and private key (e.g., `{finalDeviceId}.existing.crt` and `{finalDeviceId}.existing.key`).
                                        {!rekey && ' The existing private key will be used to generate the new CSR.'}
                                    </AlertDescUI>
                                </Alert>
                                <div className="flex items-center space-x-2 my-2">
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
                                
                                <div>
                                    <Label>1. Generate CSR</Label>
                                    <p className="text-xs text-muted-foreground mb-1">
                                        Run this on your device to generate a new CSR.
                                    </p>
                                    <CodeBlock content={opensslCombinedCommand} textareaClassName="h-32" />
                                </div>

                                 <div>
                                    <Label>2. Run Re-enrollment Command</Label>
                                    <div className="flex items-center space-x-2 my-2">
                                        <Switch
                                            id="validate-server-cert-reenroll"
                                            checked={validateServerCert}
                                            onCheckedChange={setValidateServerCert}
                                        />
                                        <Label htmlFor="validate-server-cert-reenroll">Validate Server Certificate (Recommended)</Label>
                                    </div>
                                    {validateServerCert && (
                                        <div className="mb-2">
                                            <p className="text-xs text-muted-foreground mb-1">
                                                First, obtain the server's root CA certificate.
                                            </p>
                                            <CodeBlock content={serverCertCommand} textareaClassName="h-28" />
                                        </div>
                                    )}
                                    <CodeBlock content={finalReEnrollCommand} textareaClassName="h-40" />
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                <DialogFooter>
                    <div className="w-full flex justify-between">
                        <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
                        <div className="flex space-x-2">
                            {step === 1 && (
                                <Button onClick={() => setStep(2)} disabled={!foundDevice}>
                                    Next <ArrowRight className="ml-2 h-4 w-4"/>
                                </Button>
                            )}
                            {step === 2 && (
                                <>
                                    <Button variant="outline" onClick={handleBack}>
                                        <ArrowLeft className="mr-2 h-4 w-4"/>Back
                                    </Button>
                                    <Button onClick={() => onOpenChange(false)}>Finish</Button>
                                </>
                            )}
                        </div>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};
