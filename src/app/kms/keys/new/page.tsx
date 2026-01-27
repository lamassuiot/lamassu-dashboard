

'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardDescription, CardFooter, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, KeyRound, UploadCloud, FileText, ChevronRight, PlusCircle, FileKey, Loader2, Tag, Activity, RefreshCw, Sliders, AlertTriangle, ChartLine } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { CryptoEngineSelector } from '@/components/shared/CryptoEngineSelector';
import { SectionHeader } from '@/components/shared/FormComponents';
import { createKmsKey, importKmsKey } from '@/lib/kms-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import { TagInput } from '@/components/shared/TagInput';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { queryQrngHmin, queryQrngRavg, queryQrngQfactor, queryQrngVcomp, queryQrngTemp, queryQrngHminHistory, queryQrngRavgHistory, queryQrngQfactorHistory, queryQrngVcompHistory, queryQrngTempHistory } from '@/lib/prometheus-utils';

// Monaco Editor dynamic import to avoid SSR issues
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => <div className="h-48 w-full flex items-center justify-center bg-muted/30 rounded-md border"><Loader2 className="h-8 w-8 animate-spin"/></div>
});

const creationModes = [
  {
    id: 'newKeyPair',
    title: 'Create New Key Pair',
    description: 'Generate a new cryptographic key pair (public and private key) securely managed by LamassuIoT.',
    icon: <KeyRound className="h-8 w-8 text-primary" />,
  },
  {
    id: 'importKeyPair',
    title: 'Import Existing Key Pair',
    description: "Import an existing key pair (both public and private key components) from an external source.",
    icon: <UploadCloud className="h-8 w-8 text-primary" />,
  },
  {
    id: 'importPublicKey',
    title: 'Import Public Key Only',
    description: 'Import an existing public key for verification or trust purposes. The private key will not be managed.',
    icon: <FileText className="h-8 w-8 text-primary" />,
    badge: 'Coming Soon',
  },
];

export default function CreateKmsKeyPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user } = useAuth();
  const [selectedMode, setSelectedMode] = useState<string | null>(null);

  // Cookie utilities
  const getCookie = (name: string): string | null => {
    if (typeof document === 'undefined') return null;
    const value = `; ${document.cookie}`;
    const parts = value.split(`; ${name}=`);
    if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
    return null;
  };

  const setCookie = (name: string, value: string, days: number = 365) => {
    if (typeof document === 'undefined') return;
    const expires = new Date();
    expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
    document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/`;
  };

  // Load thresholds from cookies or use defaults
  const getInitialThreshold = (cookieName: string, defaultValue: number): number => {
    const saved = getCookie(cookieName);
    if (saved) {
      const parsed = parseFloat(saved);
      if (!isNaN(parsed) && parsed >= 0 && parsed <= 1) {
        return parsed;
      }
    }
    return defaultValue;
  };

  // New Key Pair mode fields
  const [keyName, setKeyName] = useState('');
  const [cryptoEngineId, setCryptoEngineId] = useState<string | undefined>(undefined);
  const [keyType, setKeyType] = useState('RSA');
  const [rsaKeySize, setRsaKeySize] = useState('2048');
  const [ecdsaCurve, setEcdsaCurve] = useState('P-256');

  // Import Key Pair mode fields
  const [importKeyName, setImportKeyName] = useState('');
  const [privateKeyPem, setPrivateKeyPem] = useState('');

  // Import Public Key mode fields
  const [publicKeyPem, setPublicKeyPem] = useState('');

  // Common fields for tags and metadata
  const [tags, setTags] = useState<string[]>([]);
  const [metadata, setMetadata] = useState('{}');
  const [metadataError, setMetadataError] = useState<string | null>(null);
  
  // Monitoring metrics
  const [qrngHminValue, setQrngHminValue] = useState<number | null>(null);
  const [qrngRavgValue, setQrngRavgValue] = useState<number | null>(null);
  const [qrngQfactorValue, setQrngQfactorValue] = useState<number | null>(null);
  const [qrngVcompValue, setQrngVcompValue] = useState<number | null>(null);
  const [qrngTempValue, setQrngTempValue] = useState<number | null>(null);
  const [isLoadingMetric, setIsLoadingMetric] = useState(false);
  
  // Metric thresholds (loaded from cookies)
  const [qrngHminThreshold, setQrngHminThreshold] = useState<number>(() => getInitialThreshold('qrng_hmin_threshold', 0.5));
  const [qrngRavgThreshold, setQrngRavgThreshold] = useState<number>(() => getInitialThreshold('qrng_ravg_threshold', 0.5));
  const [qrngQfactorThreshold, setQrngQfactorThreshold] = useState<number>(() => getInitialThreshold('qrng_qfactor_threshold', 0.5));
  const [qrngVcompThreshold, setQrngVcompThreshold] = useState<number>(() => getInitialThreshold('qrng_vcomp_threshold', 0.5));
  const [qrngTempThreshold, setQrngTempThreshold] = useState<number>(() => getInitialThreshold('qrng_temp_threshold', 0.5));
  const [adjustingMetric, setAdjustingMetric] = useState<'hmin' | 'ravg' | 'qfactor' | 'vcomp' | 'temp' | null>(null);
  const [tempThreshold, setTempThreshold] = useState<string>('');
  
  // Historical data for graphs
  const [showHminGraph, setShowHminGraph] = useState(false);
  const [showRavgGraph, setShowRavgGraph] = useState(false);
  const [showQfactorGraph, setShowQfactorGraph] = useState(false);
  const [showVcompGraph, setShowVcompGraph] = useState(false);
  const [showTempGraph, setShowTempGraph] = useState(false);
  const [hminHistory, setHminHistory] = useState<Array<{timestamp: number, value: number}>>([]);
  const [ravgHistory, setRavgHistory] = useState<Array<{timestamp: number, value: number}>>([]);
  const [qfactorHistory, setQfactorHistory] = useState<Array<{timestamp: number, value: number}>>([]);
  const [vcompHistory, setVcompHistory] = useState<Array<{timestamp: number, value: number}>>([]);
  const [tempHistory, setTempHistory] = useState<Array<{timestamp: number, value: number}>>([]);
  const [historyTimeRange, setHistoryTimeRange] = useState<15 | 30 | 60>(15);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Crypto engines state
  const [cryptoEngines, setCryptoEngines] = useState<ApiCryptoEngine[]>([]);
  const [isLoadingEngines, setIsLoadingEngines] = useState(true);

  // Load crypto engines and qrng_hmin metric on component mount
  useEffect(() => {
    const loadCryptoEngines = async () => {
      if (!user?.access_token) {
        setIsLoadingEngines(false);
        return;
      }

      try {
        const engines = await fetchCryptoEngines(user.access_token);
        setCryptoEngines(engines);
        
        // Set default engine if available
        if (!cryptoEngineId && engines.length > 0) {
          const defaultEngine = engines.find(e => e.default);
          if (defaultEngine) {
            setCryptoEngineId(defaultEngine.id);
          }
        }
      } catch (error) {
        console.error('Failed to load crypto engines:', error);
      } finally {
        setIsLoadingEngines(false);
      }
    };

    if (user?.access_token) {
      loadCryptoEngines();
    }
  }, [user?.access_token, cryptoEngineId]);

  // Function to load QRNG metrics - can be called on mount or manually
  const loadQrngMetrics = async (showLoading = true) => {
    if (showLoading) {
      setIsLoadingMetric(true);
    }
    try {
      const [hminValue, ravgValue, qfactorValue, vcompValue, tempValue] = await Promise.all([
        queryQrngHmin(),
        queryQrngRavg(),
        queryQrngQfactor(),
        queryQrngVcomp(),
        queryQrngTemp()
      ]);
      setQrngHminValue(hminValue);
      setQrngRavgValue(ravgValue);
      setQrngQfactorValue(qfactorValue);
      setQrngVcompValue(vcompValue);
      setQrngTempValue(tempValue);
    } catch (error) {
      console.error('Failed to load qrng metrics:', error);
    } finally {
      if (showLoading) {
        setIsLoadingMetric(false);
      }
    }
  };

  // Function to load historical data for a specific metric
  const loadHistoricalData = async (metric: 'hmin' | 'ravg' | 'qfactor' | 'vcomp' | 'temp', showLoading = true) => {
    if (showLoading) {
      setIsLoadingHistory(true);
    }
    try {
      if (metric === 'hmin') {
        const data = await queryQrngHminHistory(historyTimeRange);
        setHminHistory(data);
        setShowHminGraph(true);
      } else if (metric === 'ravg') {
        const data = await queryQrngRavgHistory(historyTimeRange);
        setRavgHistory(data);
        setShowRavgGraph(true);
      } else if (metric === 'qfactor') {
        const data = await queryQrngQfactorHistory(historyTimeRange);
        setQfactorHistory(data);
        setShowQfactorGraph(true);
      } else if (metric === 'vcomp') {
        const data = await queryQrngVcompHistory(historyTimeRange);
        setVcompHistory(data);
        setShowVcompGraph(true);
      } else {
        const data = await queryQrngTempHistory(historyTimeRange);
        setTempHistory(data);
        setShowTempGraph(true);
      }
    } catch (error) {
      console.error(`Failed to load ${metric} history:`, error);
    } finally {
      if (showLoading) {
        setIsLoadingHistory(false);
      }
    }
  };

  // Load and auto-refresh qrng metrics every 10 seconds
  useEffect(() => {
    loadQrngMetrics();
    
    const intervalId = setInterval(() => {
      loadQrngMetrics(false); // Don't show loading during auto-refresh
      // Also refresh historical data if graphs are visible
      if (showHminGraph) {
        loadHistoricalData('hmin', false); // Don't show loading during auto-refresh
      }
      if (showRavgGraph) {
        loadHistoricalData('ravg', false); // Don't show loading during auto-refresh
      }
      if (showQfactorGraph) {
        loadHistoricalData('qfactor', false); // Don't show loading during auto-refresh
      }
      if (showVcompGraph) {
        loadHistoricalData('vcomp', false); // Don't show loading during auto-refresh
      }
      if (showTempGraph) {
        loadHistoricalData('temp', false); // Don't show loading during auto-refresh
      }
    }, 10000);
    
    return () => clearInterval(intervalId);
  }, [showHminGraph, showRavgGraph, showQfactorGraph, showVcompGraph, showTempGraph, historyTimeRange]);

  // Get supported key types from selected crypto engine
  const selectedEngine = cryptoEngines.find(engine => engine.id === cryptoEngineId);
  const supportedKeyTypes = selectedEngine?.supported_key_types || [];

  // Get available key type options based on selected engine
  const availableKeyTypeOptions = supportedKeyTypes.map(keyType => ({
    value: keyType.type,
    label: keyType.type
  }));

  // Reset key type if current selection is not supported by selected engine
  useEffect(() => {
    if (selectedEngine && keyType) {
      const isKeyTypeSupported = supportedKeyTypes.some(kt => kt.type === keyType);
      if (!isKeyTypeSupported && supportedKeyTypes.length > 0) {
        setKeyType(supportedKeyTypes[0].type);
      }
    }
  }, [selectedEngine, keyType, supportedKeyTypes]);

  const handleKeyTypeChange = (value: string) => {
    setKeyType(value);
    // Reset size/curve to first available option for the new key type
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === value);
    if (keyTypeDetail && keyTypeDetail.sizes.length > 0) {
      const firstSize = keyTypeDetail.sizes[0];
      if (value === 'RSA') {
        setRsaKeySize(firstSize.toString());
      } else if (value === 'ECDSA') {
        setEcdsaCurve(firstSize.toString());
      }
    }
  };

  // Get current key spec options based on selected key type and engine
  const currentKeySpecOptions = (() => {
    const keyTypeDetail = supportedKeyTypes.find(kt => kt.type === keyType);
    if (!keyTypeDetail) return [];
    
    return keyTypeDetail.sizes.map(size => ({
      value: size.toString(),
      label: size.toString()
    }));
  })();

  const keySpecLabel = (() => {
    if (keyType === 'RSA') return 'RSA Key Size';
    if (keyType === 'ECDSA') return 'ECDSA Curve';
    return 'Key Specification';
  })();

  const currentKeySpecValue = (() => {
    if (keyType === 'RSA') return rsaKeySize;
    if (keyType === 'ECDSA') return ecdsaCurve;
    return '';
  })();

  const handleKeySpecChange = (value: string) => {
    if (keyType === 'RSA') setRsaKeySize(value);
    else if (keyType === 'ECDSA') setEcdsaCurve(value);
  };

  const handleMetadataChange = (value: string | undefined) => {
    const newValue = value || '{}';
    setMetadata(newValue);
    
    // Validate JSON
    try {
      JSON.parse(newValue);
      setMetadataError(null);
    } catch (error) {
      setMetadataError('Invalid JSON format');
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!user?.access_token) {
        toast({ title: "Authentication Error", description: "You must be logged in to create a key.", variant: "destructive" });
        return;
    }

    setIsSubmitting(true);

    if (selectedMode === 'newKeyPair') {
        if (!cryptoEngineId) {
            toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }
        if (!keyName.trim()) {
            toast({ title: "Validation Error", description: "Key Name / Alias is required.", variant: "destructive" });
            setIsSubmitting(false);
            return;
        }

        // Validate metadata JSON
        let parsedMetadata: Record<string, any> | undefined;
        if (metadata.trim() && metadata.trim() !== '{}') {
            try {
                parsedMetadata = JSON.parse(metadata);
            } catch (error) {
                toast({ title: "Validation Error", description: "Metadata must be valid JSON.", variant: "destructive" });
                setIsSubmitting(false);
                return;
            }
        }

        try {
            // Get the current size/spec value based on key type
            let sizeValue: number;
            if (keyType === 'RSA') {
                sizeValue = parseInt(rsaKeySize, 10);
            } else if (keyType === 'ECDSA') {
                // For ECDSA, we might have curve names like 'P-256' or just numbers
                if (ecdsaCurve.includes('P-')) {
                    sizeValue = parseInt(ecdsaCurve.replace('P-', ''), 10);
                } else {
                    // If it's already a number, parse it
                    sizeValue = parseInt(ecdsaCurve, 10);
                }
            } else {
                // For other key types, try to parse as number
                sizeValue = parseInt(currentKeySpecValue, 10);
                if (isNaN(sizeValue)) {
                    sizeValue = 0; // fallback
                }
            }

            let finalMetadata = parsedMetadata || {};

            const payload = {
                engine_id: cryptoEngineId,
                name: keyName.trim(),
                algorithm: keyType,
                size: sizeValue,
                ...(tags.length > 0 && { tags }),
                ...(Object.keys(finalMetadata).length > 0 && { metadata: finalMetadata }),
            };
            
            await createKmsKey(payload, user.access_token);

            toast({
                title: "Key Pair Created",
                description: `Key pair with name "${keyName.trim()}" has been successfully created.`,
            });
            router.push('/kms/keys');

        } catch (error: any) {
            toast({ title: "Creation Failed", description: error.message, variant: "destructive" });
        } finally {
            setIsSubmitting(false);
        }

    } else if (selectedMode === 'importKeyPair') {
      if (!cryptoEngineId) {
        toast({ title: "Validation Error", description: "Please select a Crypto Engine.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!importKeyName.trim()) {
        toast({ title: "Validation Error", description: "Key Name / Alias is required.", variant: "destructive" });
        setIsSubmitting(false);
        return;
      }
      if (!privateKeyPem.trim()) {
        toast({ title: "Validation Error", description: "Private Key (PEM) is required for import.", variant: "destructive"});
        setIsSubmitting(false);
        return;
      }

      // Validate metadata JSON
      let parsedMetadata: Record<string, any> | undefined;
      if (metadata.trim() && metadata.trim() !== '{}') {
          try {
              parsedMetadata = JSON.parse(metadata);
          } catch (error) {
              toast({ title: "Validation Error", description: "Metadata must be valid JSON.", variant: "destructive" });
              setIsSubmitting(false);
              return;
          }
      }

      try {
        // Convert PEM to base64
        const privateKeyBase64 = btoa(privateKeyPem.trim());
        
        const payload = {
          private_key: privateKeyBase64,
          engine_id: cryptoEngineId,
          name: importKeyName.trim(),
          ...(tags.length > 0 && { tags }),
          ...(parsedMetadata && Object.keys(parsedMetadata).length > 0 && { metadata: parsedMetadata }),
        };
        
        await importKmsKey(payload, user.access_token);

        toast({
          title: "Key Pair Imported",
          description: `Key pair with name "${importKeyName.trim()}" has been successfully imported.`,
        });
        router.push('/kms/keys');

      } catch (error: any) {
        toast({ title: "Import Failed", description: error.message, variant: "destructive" });
      } finally {
        setIsSubmitting(false);
      }

    } else if (selectedMode === 'importPublicKey') {
      if (!publicKeyPem.trim()) {
        toast({ title: "Validation Error", description: "Public Key (PEM) is required for import.", variant: "destructive"});
        setIsSubmitting(false);
        return;
      }
      console.log(`Mock Creating KMS Key (Mode: ${selectedMode})`);
      toast({
        title: "KMS Key Import Mocked",
        description: `Public key import submitted. Check console.`,
      });
      router.push('/kms/keys');
      setIsSubmitting(false);
    }
  };

  const selectedModeDetails = creationModes.find(m => m.id === selectedMode);

  if (!selectedMode) {
    return (
      <div className="w-full space-y-8 mb-8">
        <Button variant="outline" onClick={() => router.push('/kms/keys')} className="mb-0">
          <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
        <div className="text-center">
          <h1 className="text-3xl font-headline font-semibold">Choose Key Creation Method</h1>
          <p className="text-muted-foreground mt-2">Select how you want to create or import your cryptographic key.</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-5xl mx-auto">
          {creationModes.map(mode => (
            <Card 
              key={mode.id} 
              className={`transition-shadow flex flex-col group ${
                mode.badge ? 'opacity-60 cursor-not-allowed' : 'hover:shadow-lg cursor-pointer'
              }`}
              onClick={() => !mode.badge && setSelectedMode(mode.id)}
            >
              <CardHeader className="flex-grow">
                <div className="flex items-start space-x-4">
                  <div className="mt-1">{mode.icon}</div>
                  <div className="flex-grow">
                    <div className="flex items-center justify-between">
                      <CardTitle className={`text-xl transition-colors ${
                        mode.badge ? 'text-muted-foreground' : 'group-hover:text-primary'
                      }`}>
                        {mode.title}
                      </CardTitle>
                      {mode.badge && (
                        <Badge variant="secondary" className="ml-2 text-xs">
                          {mode.badge}
                        </Badge>
                      )}
                    </div>
                    <CardDescription className="mt-1 text-sm">{mode.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardFooter>
                  <Button 
                    variant="default" 
                    className="w-full" 
                    disabled={!!mode.badge}
                  >
                      {mode.badge ? mode.badge : 'Select & Continue'} 
                      {!mode.badge && <ChevronRight className="ml-2 h-4 w-4" />}
                  </Button>
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 mb-8">
      <div className="flex justify-between items-center">
        <Button variant="outline" onClick={() => router.push('/kms/keys')}>
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to KMS Keys
        </Button>
        <Button variant="ghost" onClick={() => setSelectedMode(null)} className="text-primary hover:text-primary/80">
            <ArrowLeft className="mr-2 h-4 w-4" /> Change Creation Method
        </Button>
      </div>
      
      <div className="w-full">
        <div className="p-6">
          <div className="flex items-center space-x-3">
            {selectedModeDetails?.icon ? React.cloneElement(selectedModeDetails.icon, {className: "h-8 w-8 text-primary"}) : <KeyRound className="h-8 w-8 text-primary" />}
            <h1 className="text-2xl font-headline font-semibold">
              {selectedModeDetails ? selectedModeDetails.title : "Configure Cryptographic Key"}
            </h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1.5">
            {selectedModeDetails
              ? `Fill in the details for: ${selectedModeDetails.title}.`
              : "Fill in the details below for the new key."}
          </p>
        </div>
        <div className="p-6 pt-0">
          <form onSubmit={handleSubmit} className="space-y-8">
            
            {selectedMode === 'newKeyPair' && (
              <Card>
                <SectionHeader icon={KeyRound} title="Key Generation Parameters" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="keyName">Key Name / Alias</Label>
                    <Input
                      id="keyName"
                      value={keyName}
                      onChange={(e) => setKeyName(e.target.value)}
                      placeholder="e.g., my-secure-rsa-key"
                      required
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="cryptoEngine">Crypto Engine</Label>
                    <CryptoEngineSelector
                      value={cryptoEngineId}
                      onValueChange={(engineId) => {
                        setCryptoEngineId(engineId);
                        // Reset key type when engine changes
                        const newEngine = cryptoEngines.find(e => e.id === engineId);
                        if (newEngine && newEngine.supported_key_types.length > 0) {
                          const firstSupportedType = newEngine.supported_key_types[0];
                          setKeyType(firstSupportedType.type);
                          // Set default size for the first supported type
                          if (firstSupportedType.sizes.length > 0) {
                            const firstSize = firstSupportedType.sizes[0];
                            if (firstSupportedType.type === 'RSA') {
                              setRsaKeySize(firstSize.toString());
                            } else if (firstSupportedType.type === 'ECDSA') {
                              setEcdsaCurve(firstSize.toString());
                            }
                          }
                        }
                      }}
                      disabled={isSubmitting}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <Label htmlFor="keyType">Key Type</Label>
                      <Select value={keyType} onValueChange={handleKeyTypeChange} disabled={isSubmitting || isLoadingEngines || !selectedEngine}>
                        <SelectTrigger id="keyType" className="mt-1"><SelectValue placeholder="Select key type" /></SelectTrigger>
                        <SelectContent>
                          {availableKeyTypeOptions.map(kt => <SelectItem key={kt.value} value={kt.value}>{kt.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!selectedEngine && !isLoadingEngines && (
                        <p className="text-sm text-muted-foreground mt-1">Please select a crypto engine first</p>
                      )}
                    </div>
                    <div>
                      <Label htmlFor="keySpec">{keySpecLabel}</Label>
                      <Select value={currentKeySpecValue} onValueChange={handleKeySpecChange} disabled={isSubmitting || isLoadingEngines || !keyType}>
                        <SelectTrigger id="keySpec" className="mt-1"><SelectValue placeholder="Select key specification" /></SelectTrigger>
                        <SelectContent>
                          {currentKeySpecOptions.map(ks => <SelectItem key={ks.value} value={ks.value}>{ks.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {!keyType && (
                        <p className="text-sm text-muted-foreground mt-1">Please select a key type first</p>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Monitoring Metrics */}
            {(selectedMode === 'newKeyPair' || selectedMode === 'importKeyPair') && (
              <Card>
                <SectionHeader icon={Activity} title="Monitoring Metrics" />
                <CardContent className="space-y-6">
                  <div className="flex items-center justify-between -mt-2 mb-4">
                    <p className="text-sm text-muted-foreground">
                      Real-time metrics (auto-refreshes every 10 seconds)
                    </p>
                    <div className="flex items-center gap-2">
                      <Select 
                        value={historyTimeRange.toString()} 
                        onValueChange={(value) => setHistoryTimeRange(parseInt(value) as 15 | 30 | 60)}
                      >
                        <SelectTrigger className="h-8 w-24">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="15">15 min</SelectItem>
                          <SelectItem value="30">30 min</SelectItem>
                          <SelectItem value="60">1 hour</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={loadQrngMetrics}
                        disabled={isLoadingMetric}
                        className="h-8 gap-2"
                      >
                        <RefreshCw className={`h-3 w-3 ${isLoadingMetric ? 'animate-spin' : ''}`} />
                        Refresh
                      </Button>
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>QRNG Minimum Entropy (qrng_hmin)</Label>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setAdjustingMetric('hmin');
                          setTempThreshold(qrngHminThreshold.toString());
                        }}
                        className="h-7 w-7 p-0"
                      >
                        <Sliders className="h-3 w-3" />
                      </Button>
                    </div>
                    <div className="mt-2">
                      {isLoadingMetric ? (
                        <Badge variant="outline" className="text-sm">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Loading metric...
                        </Badge>
                      ) : qrngHminValue !== null ? (
                        <Badge 
                          variant={qrngHminValue >= qrngHminThreshold ? "default" : "outline"}
                          className={`text-sm font-mono ${
                            qrngHminValue >= qrngHminThreshold 
                              ? 'bg-primary text-primary-foreground' 
                              : 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950'
                          }`}
                        >
                          {qrngHminValue.toFixed(6)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-sm">
                          Metric not available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Quantum Random Number Generator minimum entropy value (threshold: {qrngHminThreshold})
                    </p>
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>QRNG Running Average (qrng_ravg)</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (showRavgGraph) {
                              setShowRavgGraph(false);
                            } else {
                              loadHistoricalData('ravg');
                            }
                          }}
                          className="h-7 w-7 p-0"
                          disabled={isLoadingHistory}
                        >
                          <ChartLine className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustingMetric('ravg');
                            setTempThreshold(qrngRavgThreshold.toString());
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Sliders className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      {isLoadingMetric ? (
                        <Badge variant="outline" className="text-sm">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Loading metric...
                        </Badge>
                      ) : qrngRavgValue !== null ? (
                        <Badge 
                          variant={qrngRavgValue >= qrngRavgThreshold ? "default" : "outline"}
                          className={`text-sm font-mono ${
                            qrngRavgValue >= qrngRavgThreshold 
                              ? 'bg-primary text-primary-foreground' 
                              : 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950'
                          }`}
                        >
                          {qrngRavgValue.toFixed(6)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-sm">
                          Metric not available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      Running average of QRNG entropy values (threshold: {qrngRavgThreshold})
                    </p>
                    
                    {/* History Graph */}
                    {showRavgGraph && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Last {historyTimeRange === 60 ? '1 Hour' : `${historyTimeRange} Minutes`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowRavgGraph(false)}
                            className="h-6 text-xs"
                          >
                            Hide
                          </Button>
                        </div>
                        {isLoadingHistory ? (
                          <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : ravgHistory.length > 0 ? (() => {
                          const values = ravgHistory.map(d => d.value);
                          const minValue = Math.min(...values);
                          const maxValue = Math.max(...values);
                          const padding = (maxValue - minValue) * 0.1 || 0.1;
                          const yMin = Math.max(0, minValue - padding);
                          const yMax = Math.min(1, maxValue + padding);
                          
                          return (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={ravgHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                  dataKey="timestamp" 
                                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                                  tick={{fontSize: 11}}
                                />
                                <YAxis 
                                  tick={{fontSize: 11}} 
                                  domain={[yMin, yMax]}
                                  tickFormatter={(value) => value.toFixed(3)}
                                />
                                <Tooltip 
                                  labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                  formatter={(value: number) => value.toFixed(6)}
                                />
                                <ReferenceLine 
                                  y={qrngRavgThreshold} 
                                  stroke="#f97316" 
                                  strokeWidth={3}
                                  strokeDasharray="5 5"
                                  label={{ 
                                    value: `Threshold: ${qrngRavgThreshold}`, 
                                    position: 'right', 
                                    fontSize: 11,
                                    fill: '#f97316',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="hsl(var(--primary))" 
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                            No historical data available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>QRNG Quality Factor (qrng_qfactor)</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (showQfactorGraph) {
                              setShowQfactorGraph(false);
                            } else {
                              loadHistoricalData('qfactor');
                            }
                          }}
                          className="h-7 w-7 p-0"
                          disabled={isLoadingHistory}
                        >
                          <ChartLine className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustingMetric('qfactor');
                            setTempThreshold(qrngQfactorThreshold.toString());
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Sliders className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      {isLoadingMetric ? (
                        <Badge variant="outline" className="text-sm">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Loading metric...
                        </Badge>
                      ) : qrngQfactorValue !== null ? (
                        <Badge 
                          variant={qrngQfactorValue >= qrngQfactorThreshold ? "default" : "outline"}
                          className={`text-sm font-mono ${
                            qrngQfactorValue >= qrngQfactorThreshold 
                              ? 'bg-primary text-primary-foreground' 
                              : 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950'
                          }`}
                        >
                          {qrngQfactorValue.toFixed(6)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-sm">
                          Metric not available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      QRNG quality factor measurement (threshold: {qrngQfactorThreshold})
                    </p>
                    
                    {/* History Graph */}
                    {showQfactorGraph && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Last {historyTimeRange === 60 ? '1 Hour' : `${historyTimeRange} Minutes`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowQfactorGraph(false)}
                            className="h-6 text-xs"
                          >
                            Hide
                          </Button>
                        </div>
                        {isLoadingHistory ? (
                          <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : qfactorHistory.length > 0 ? (() => {
                          const values = qfactorHistory.map(d => d.value);
                          const minValue = Math.min(...values);
                          const maxValue = Math.max(...values);
                          const padding = (maxValue - minValue) * 0.1 || 0.1;
                          const yMin = Math.max(0, minValue - padding);
                          const yMax = Math.min(1, maxValue + padding);
                          
                          return (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={qfactorHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                  dataKey="timestamp" 
                                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                                  tick={{fontSize: 11}}
                                />
                                <YAxis 
                                  tick={{fontSize: 11}} 
                                  domain={[yMin, yMax]}
                                  tickFormatter={(value) => value.toFixed(3)}
                                />
                                <Tooltip 
                                  labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                  formatter={(value: number) => value.toFixed(6)}
                                />
                                <ReferenceLine 
                                  y={qrngQfactorThreshold} 
                                  stroke="#f97316" 
                                  strokeWidth={3}
                                  strokeDasharray="5 5"
                                  label={{ 
                                    value: `Threshold: ${qrngQfactorThreshold}`, 
                                    position: 'right', 
                                    fontSize: 11,
                                    fill: '#f97316',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="hsl(var(--primary))" 
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                            No historical data available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>QRNG Voltage Comparison (qrng_vcomp)</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (showVcompGraph) {
                              setShowVcompGraph(false);
                            } else {
                              loadHistoricalData('vcomp');
                            }
                          }}
                          className="h-7 w-7 p-0"
                          disabled={isLoadingHistory}
                        >
                          <ChartLine className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustingMetric('vcomp');
                            setTempThreshold(qrngVcompThreshold.toString());
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Sliders className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      {isLoadingMetric ? (
                        <Badge variant="outline" className="text-sm">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Loading metric...
                        </Badge>
                      ) : qrngVcompValue !== null ? (
                        <Badge 
                          variant={qrngVcompValue >= qrngVcompThreshold ? "default" : "outline"}
                          className={`text-sm font-mono ${
                            qrngVcompValue >= qrngVcompThreshold 
                              ? 'bg-primary text-primary-foreground' 
                              : 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950'
                          }`}
                        >
                          {qrngVcompValue.toFixed(6)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-sm">
                          Metric not available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      QRNG voltage comparison value (threshold: {qrngVcompThreshold})
                    </p>
                    
                    {/* History Graph */}
                    {showVcompGraph && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Last {historyTimeRange === 60 ? '1 Hour' : `${historyTimeRange} Minutes`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowVcompGraph(false)}
                            className="h-6 text-xs"
                          >
                            Hide
                          </Button>
                        </div>
                        {isLoadingHistory ? (
                          <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : vcompHistory.length > 0 ? (() => {
                          const values = vcompHistory.map(d => d.value);
                          const minValue = Math.min(...values);
                          const maxValue = Math.max(...values);
                          const padding = (maxValue - minValue) * 0.1 || 0.1;
                          const yMin = Math.max(0, minValue - padding);
                          const yMax = Math.min(1, maxValue + padding);
                          
                          return (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={vcompHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                  dataKey="timestamp" 
                                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                                  tick={{fontSize: 11}}
                                />
                                <YAxis 
                                  tick={{fontSize: 11}} 
                                  domain={[yMin, yMax]}
                                  tickFormatter={(value) => value.toFixed(3)}
                                />
                                <Tooltip 
                                  labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                  formatter={(value: number) => value.toFixed(6)}
                                />
                                <ReferenceLine 
                                  y={qrngVcompThreshold} 
                                  stroke="#f97316" 
                                  strokeWidth={3}
                                  strokeDasharray="5 5"
                                  label={{ 
                                    value: `Threshold: ${qrngVcompThreshold}`, 
                                    position: 'right', 
                                    fontSize: 11,
                                    fill: '#f97316',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="hsl(var(--primary))" 
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                            No historical data available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  
                  <div>
                    <div className="flex items-center justify-between">
                      <Label>QRNG Temperature (qrng_temp)</Label>
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            if (showTempGraph) {
                              setShowTempGraph(false);
                            } else {
                              loadHistoricalData('temp');
                            }
                          }}
                          className="h-7 w-7 p-0"
                          disabled={isLoadingHistory}
                        >
                          <ChartLine className="h-3 w-3" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setAdjustingMetric('temp');
                            setTempThreshold(qrngTempThreshold.toString());
                          }}
                          className="h-7 w-7 p-0"
                        >
                          <Sliders className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="mt-2">
                      {isLoadingMetric ? (
                        <Badge variant="outline" className="text-sm">
                          <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                          Loading metric...
                        </Badge>
                      ) : qrngTempValue !== null ? (
                        <Badge 
                          variant={qrngTempValue >= qrngTempThreshold ? "default" : "outline"}
                          className={`text-sm font-mono ${
                            qrngTempValue >= qrngTempThreshold 
                              ? 'bg-primary text-primary-foreground' 
                              : 'border-orange-500 text-orange-500 bg-orange-50 dark:bg-orange-950'
                          }`}
                        >
                          {qrngTempValue.toFixed(6)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-sm">
                          Metric not available
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      QRNG temperature measurement (threshold: {qrngTempThreshold})
                    </p>
                    
                    {/* History Graph */}
                    {showTempGraph && (
                      <div className="mt-4 p-4 border rounded-lg bg-muted/30">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-medium">
                            Last {historyTimeRange === 60 ? '1 Hour' : `${historyTimeRange} Minutes`}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowTempGraph(false)}
                            className="h-6 text-xs"
                          >
                            Hide
                          </Button>
                        </div>
                        {isLoadingHistory ? (
                          <div className="h-48 flex items-center justify-center">
                            <Loader2 className="h-6 w-6 animate-spin" />
                          </div>
                        ) : tempHistory.length > 0 ? (() => {
                          const values = tempHistory.map(d => d.value);
                          const minValue = Math.min(...values);
                          const maxValue = Math.max(...values);
                          const padding = (maxValue - minValue) * 0.1 || 0.1;
                          const yMin = Math.max(0, minValue - padding);
                          const yMax = Math.min(1, maxValue + padding);
                          
                          return (
                            <ResponsiveContainer width="100%" height={200}>
                              <LineChart data={tempHistory}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis 
                                  dataKey="timestamp" 
                                  tickFormatter={(ts) => new Date(ts).toLocaleTimeString()}
                                  tick={{fontSize: 11}}
                                />
                                <YAxis 
                                  tick={{fontSize: 11}} 
                                  domain={[yMin, yMax]}
                                  tickFormatter={(value) => value.toFixed(3)}
                                />
                                <Tooltip 
                                  labelFormatter={(ts) => new Date(ts).toLocaleString()}
                                  formatter={(value: number) => value.toFixed(6)}
                                />
                                <ReferenceLine 
                                  y={qrngTempThreshold} 
                                  stroke="#f97316" 
                                  strokeWidth={3}
                                  strokeDasharray="5 5"
                                  label={{ 
                                    value: `Threshold: ${qrngTempThreshold}`, 
                                    position: 'right', 
                                    fontSize: 11,
                                    fill: '#f97316',
                                    fontWeight: 'bold'
                                  }}
                                />
                                <Line 
                                  type="monotone" 
                                  dataKey="value" 
                                  stroke="hsl(var(--primary))" 
                                  strokeWidth={2}
                                  dot={false}
                                  isAnimationActive={false}
                                />
                              </LineChart>
                            </ResponsiveContainer>
                          );
                        })() : (
                          <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
                            No historical data available
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Tags and Metadata - Common for newKeyPair and importKeyPair */}
            {(selectedMode === 'newKeyPair' || selectedMode === 'importKeyPair') && (
              <Card>
                <SectionHeader icon={Tag} title="Tags & Metadata (Optional)" />
                <CardContent className="space-y-6">
                  <div>
                    <Label htmlFor="tags">Tags</Label>
                    <TagInput
                      id="tags"
                      value={tags}
                      onChange={setTags}
                      placeholder="Add tags..."
                      className="mt-1"
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      Add tags to categorize and filter keys (e.g., production, critical, us-east-1)
                    </p>
                  </div>
                  
                  <div>
                    <Label htmlFor="metadata">Metadata (JSON)</Label>
                    <div className="mt-1">
                      <MonacoEditor
                        height="200px"
                        defaultLanguage="json"
                        value={metadata}
                        onChange={handleMetadataChange}
                        options={{
                          minimap: { enabled: false },
                          scrollBeyondLastLine: false,
                          fontSize: 13,
                          lineNumbers: 'on',
                          automaticLayout: true,
                          tabSize: 2,
                          formatOnPaste: true,
                          formatOnType: true,
                        }}
                        theme="vs-dark"
                      />
                    </div>
                    {metadataError && (
                      <Alert variant="destructive" className="mt-2">
                        <AlertDescription>{metadataError}</AlertDescription>
                      </Alert>
                    )}
                    <p className="text-xs text-muted-foreground mt-1">
                      Define custom metadata as JSON (e.g., owner, project, cost-center)
                    </p>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedMode === 'importKeyPair' && (
              <Card>
                <SectionHeader icon={FileKey} title="Import Key Pair Material" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="importKeyName">Key Name / Alias</Label>
                    <Input
                      id="importKeyName"
                      value={importKeyName}
                      onChange={(e) => setImportKeyName(e.target.value)}
                      placeholder="Enter a name for the imported key"
                      required
                      className="mt-1"
                    />
                    {!importKeyName.trim() && <p className="text-xs text-destructive mt-1">Key name is required.</p>}
                  </div>
                  <div>
                    <Label htmlFor="importCryptoEngine">Crypto Engine</Label>
                    <CryptoEngineSelector
                      value={cryptoEngineId}
                      onValueChange={setCryptoEngineId}
                      disabled={isSubmitting}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label htmlFor="privateKeyPem">Private Key (PEM format)</Label>
                    <Textarea
                      id="privateKeyPem"
                      value={privateKeyPem}
                      onChange={(e) => setPrivateKeyPem(e.target.value)}
                      placeholder="-----BEGIN PRIVATE KEY-----\n..."
                      rows={8}
                      required
                      className="mt-1 font-mono"
                    />
                    {!privateKeyPem.trim() && <p className="text-xs text-destructive mt-1">Private Key (PEM) is required.</p>}
                    <p className="text-xs text-muted-foreground mt-1">Paste your private key in PEM format. The public key will be automatically derived.</p>
                  </div>
                </CardContent>
              </Card>
            )}

            {selectedMode === 'importPublicKey' && (
              <Card>
                <SectionHeader icon={FileText} title="Import Public Key Material" />
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="publicKeyPem">Public Key (PEM format)</Label>
                    <Textarea
                      id="publicKeyPem"
                      value={publicKeyPem}
                      onChange={(e) => setPublicKeyPem(e.target.value)}
                      placeholder="-----BEGIN PUBLIC KEY-----\n..."
                      rows={6}
                      required
                      className="mt-1 font-mono"
                    />
                    {!publicKeyPem.trim() && <p className="text-xs text-destructive mt-1">Public Key (PEM) is required.</p>}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Warning if metrics below threshold */}
            {(selectedMode === 'newKeyPair' || selectedMode === 'importKeyPair') && 
             ((qrngHminValue !== null && qrngHminValue < qrngHminThreshold) || 
              (qrngRavgValue !== null && qrngRavgValue < qrngRavgThreshold) ||
              (qrngQfactorValue !== null && qrngQfactorValue < qrngQfactorThreshold) ||
              (qrngVcompValue !== null && qrngVcompValue < qrngVcompThreshold) ||
              (qrngTempValue !== null && qrngTempValue < qrngTempThreshold)) && (
              <Alert variant="default" className="border-orange-500 bg-orange-50 dark:bg-orange-950">
                <AlertTriangle className="h-4 w-4 text-orange-600" />
                <AlertDescription className="text-orange-800 dark:text-orange-200">
                  <strong>Warning:</strong> One or more QRNG metrics are below the configured threshold. 
                  {qrngHminValue !== null && qrngHminValue < qrngHminThreshold && 
                    ` qrng_hmin: ${qrngHminValue.toFixed(6)} < ${qrngHminThreshold}`}
                  {qrngRavgValue !== null && qrngRavgValue < qrngRavgThreshold && 
                    ` qrng_ravg: ${qrngRavgValue.toFixed(6)} < ${qrngRavgThreshold}`}
                  {qrngQfactorValue !== null && qrngQfactorValue < qrngQfactorThreshold && 
                    ` qrng_qfactor: ${qrngQfactorValue.toFixed(6)} < ${qrngQfactorThreshold}`}
                  {qrngVcompValue !== null && qrngVcompValue < qrngVcompThreshold && 
                    ` qrng_vcomp: ${qrngVcompValue.toFixed(6)} < ${qrngVcompThreshold}`}
                  {qrngTempValue !== null && qrngTempValue < qrngTempThreshold && 
                    ` qrng_temp: ${qrngTempValue.toFixed(6)} < ${qrngTempThreshold}`}
                </AlertDescription>
              </Alert>
            )}

            <div className="flex justify-end pt-4">
              <Button type="submit" size="lg" disabled={isSubmitting}>
                {isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <PlusCircle className="mr-2 h-5 w-5" />}
                {selectedMode === 'newKeyPair' ? 'Create Key Pair' : 
                 selectedMode === 'importKeyPair' ? 'Import Key Pair' :
                 'Import Public Key'}
              </Button>
            </div>
          </form>
        </div>
      </div>

      {/* Threshold Adjustment Dialog */}
      <Dialog open={adjustingMetric !== null} onOpenChange={(open) => !open && setAdjustingMetric(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Threshold</DialogTitle>
            <DialogDescription>
              Set the threshold for {adjustingMetric === 'hmin' ? 'qrng_hmin (Minimum Entropy)' : adjustingMetric === 'ravg' ? 'qrng_ravg (Running Average)' : adjustingMetric === 'qfactor' ? 'qrng_qfactor (Quality Factor)' : adjustingMetric === 'vcomp' ? 'qrng_vcomp (Voltage Comparison)' : 'qrng_temp (Temperature)'}.
              Values below this threshold will be highlighted in orange.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Label htmlFor="threshold-input">Threshold Value</Label>
            <Input
              id="threshold-input"
              type="number"
              step="0.01"
              min="0"
              max="1"
              value={tempThreshold}
              onChange={(e) => setTempThreshold(e.target.value)}
              className="mt-2"
              placeholder="Enter threshold (e.g., 0.5)"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setAdjustingMetric(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={() => {
                const value = parseFloat(tempThreshold);
                if (!isNaN(value) && value >= 0 && value <= 1) {
                  if (adjustingMetric === 'hmin') {
                    setQrngHminThreshold(value);
                    setCookie('qrng_hmin_threshold', value.toString());
                  } else if (adjustingMetric === 'ravg') {
                    setQrngRavgThreshold(value);
                    setCookie('qrng_ravg_threshold', value.toString());
                  } else if (adjustingMetric === 'qfactor') {
                    setQrngQfactorThreshold(value);
                    setCookie('qrng_qfactor_threshold', value.toString());
                  } else if (adjustingMetric === 'vcomp') {
                    setQrngVcompThreshold(value);
                    setCookie('qrng_vcomp_threshold', value.toString());
                  } else {
                    setQrngTempThreshold(value);
                    setCookie('qrng_temp_threshold', value.toString());
                  }
                  setAdjustingMetric(null);
                  toast({ 
                    title: "Threshold Updated", 
                    description: `${adjustingMetric === 'hmin' ? 'qrng_hmin' : adjustingMetric === 'ravg' ? 'qrng_ravg' : adjustingMetric === 'qfactor' ? 'qrng_qfactor' : adjustingMetric === 'vcomp' ? 'qrng_vcomp' : 'qrng_temp'} threshold set to ${value}` 
                  });
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
