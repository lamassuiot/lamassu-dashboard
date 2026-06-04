

'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Rocket, ShieldCheck, FilePlus2, ArrowRight, ArrowLeft, Loader2, CheckCircle, XCircle, Info, AlertTriangle } from 'lucide-react';
import { BackendStatusCheck } from './BackendStatusCheck';
import { CryptoEngineSummary } from './CryptoEngineSummary';
import { Stepper } from '../shared/Stepper';
import type { ApiCryptoEngine } from '@/types/crypto-engine';
import {
  createCa,
  fetchAndProcessCAs,
  parseCertificatePemDetails,
  revokeCa,
  deleteCa,
  createSigningProfile,
  deleteSigningProfile,
  fetchSigningProfiles,
  signCertificate,
  fetchCaStatsSummary,
} from '@/lib/ca-data';
import { fetchCryptoEngines } from '@/lib/kms-data';
import { sileo } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Alert, AlertDescription, AlertTitle } from '../ui/alert';
import { createOrUpdateRa, deleteRa } from '@/lib/dms-api';
import { registerDevice, decommissionDevice, deleteDevice } from '@/lib/devices-api';
import { buildSelfSignedCsr, initPkijsEngine } from "@/lib-crypto";
import { updateCertificateStatus, deleteCertificate, fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { templateDefaults, type SigningProfileFormValues } from '../shared/SigningProfileForm';
import { checkOcspStatus } from '@/lib/va-api';
import { ReadyToPki } from './ReadyToPki';
import { CLIENT_AUTH_EXTENDED_KEY_USAGES, CLIENT_AUTH_KEY_USAGES, DEVICE_AUTH_EXTENDED_KEY_USAGES, TLS_KEY_USAGES } from '@/lib/certificate-usage-options';


// Log Entry Type
interface LogEntry {
  message: string;
  status: 'info' | 'success' | 'error';
  details?: string;
}

// Validation Error Type
interface ValidationError {
    message: string;
    url: string;
}


export const InitializationWizard: React.FC = () => {
    const router = useRouter();

    const [currentStep, setCurrentStep] = useState(1);
    const totalSteps = 5;

    // State for test
    const [isTestRunning, setIsTestRunning] = useState(false);
    const [testLogs, setTestLogs] = useState<LogEntry[]>([]);
    const [testError, setTestError] = useState<string | null>(null);
    const [testSuccess, setTestSuccess] = useState(false);
    const [availableEngines, setAvailableEngines] = useState<ApiCryptoEngine[]>([]);
    const [isCreatingProfile, setIsCreatingProfile] = useState(false);
    const [defaultProfileExists, setDefaultProfileExists] = useState<boolean | null>(null);
    const [caCount, setCaCount] = useState<number | null>(null);
    const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
    const logContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (logContainerRef.current) {
            logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
        }
    }, [testLogs]);

    const checkFinalStepStatus = useCallback(async () => {
                try {
            // Check for default profile
            const profileParams = new URLSearchParams();
            profileParams.append('filter', 'name[equal]Default Profile');
            const profiles = await fetchSigningProfiles(profileParams);
            setDefaultProfileExists(profiles.list.length > 0);

            // Check for existing CAs
            const stats = await fetchCaStatsSummary();
            setCaCount(stats.cas.total);

        } catch (e) {
            console.error("Failed to check final step status:", e);
            setDefaultProfileExists(false); // Assume it doesn't exist on error
            setCaCount(0); // Assume no CAs on error
        }
    }, []);


    useEffect(() => {
        const loadEngines = async () => {
            try {
                const engines = await fetchCryptoEngines();
                setAvailableEngines(engines);
            } catch (e) {
                console.error("Failed to load crypto engines for test", e);
            }
        };
        loadEngines();
        if (currentStep === 5) {
            checkFinalStepStatus();
        }
    }, [currentStep, checkFinalStepStatus]);


    const addLog = (message: string, status: 'info' | 'success' | 'error', details?: string) => {
        setTestLogs(prev => [...prev, { message, status, details }]);
    };

    const handleRunTest = async () => {
        if (availableEngines.length === 0) {
            const errorMsg = "Cannot run test: no crypto engines available.";
            addLog(errorMsg, 'error');
            setTestError(errorMsg);
            return;
        }
        
        initPkijsEngine();

        setIsTestRunning(true);
        setTestLogs([]);
        setTestError(null);
        setTestSuccess(false);
        setValidationErrors([]);

        const testId = `test-${Date.now()}`;
        const testCaId = `test-ca-${testId}`;
        const testProfileName = `Test Profile ${testId}`;
        const testRaId = `test-ra-${testId}`;
        const testDeviceId = `test-device-${testId}`;
        const testCertName = `test-cert-${testId}.lamassu.io`
        let testProfileId: string | null = null;
        let createdCa = false;
        let testCaCertSerialNumber: string | null = null;
        let createdRa = false;
        let createdDevice = false;
        let issuedCertSerialNumber: string | null = null;
        
        let engineToUse = availableEngines.find(e => e.default);
        if (!engineToUse) {
            addLog("No default engine found. Using first available engine for the test.", 'info');
            engineToUse = availableEngines[0];
        }
        
        const engineId = engineToUse.id;

        // --- Step 1: Create Dummy Issuance Profile ---
        addLog(`1. Creating dummy Issuance Profile: "${testProfileName}"...`, 'info');
        try {
            const newProfile = await createSigningProfile({
                name: testProfileName,
                description: "Temporary profile for system health check.",
                validity: { type: "Duration", duration: "1h" },
                sign_as_ca: false,
                honor_key_usage: false,
                key_usage: [...CLIENT_AUTH_KEY_USAGES],
                honor_extended_key_usages: false,
                extended_key_usages: [...CLIENT_AUTH_EXTENDED_KEY_USAGES],
                honor_subject: true,
                honor_extensions: true,
                crypto_enforcement: { enabled: false, allow_rsa_keys: true, allow_ecdsa_keys: true },
            });
            
            testProfileId = newProfile.id;
            addLog("Dummy profile created successfully.", 'success', `Profile ID: ${testProfileId}`);
        } catch (e: any) {
            addLog(`Failed to create profile: ${e.message}`, 'error');
        }

        // --- Step 2: Create Dummy CA ---
        if (testProfileId) {
            addLog(`2. Creating dummy Root CA: "${testCaId}"...`, 'info', `Using engine: ${engineId}`);
            try {
                await createCa({
                    id: testCaId,
                    parent_id: null,
                    engine_id: engineId,
                    profile_id: testProfileId,
                    subject: { common_name: `Lamassu Test CA ${new Date().toLocaleTimeString()}`, country: "XX", organization: "Lamassu Test" },
                    key_metadata: { type: "ECDSA", bits: 256 },
                    ca_expiration: { type: "Duration", duration: "24h" },
                    ca_type: "MANAGED",
                });
                addLog("Dummy CA created successfully.", 'success', `CA ID: ${testCaId}`);
                createdCa = true;
                
                // --- Step 2a: Verify CA cert ---
                addLog(`2a. Verifying dummy CA certificate...`, 'info');
                try {
                    const createdCaList = await fetchAndProcessCAs(`filter=id[equal]${testCaId}`);
                    if (createdCaList.length > 0 && createdCaList[0].pemData) {
                        const caCert = createdCaList[0];
                        testCaCertSerialNumber = caCert.serialNumber; // Store the CA's own certificate serial
                        addLog("Found CA cert with serial number.", 'info', testCaCertSerialNumber);
                        const parsedDetails = await parseCertificatePemDetails(caCert.pemData);
                        addLog("OCSP URLs found:", 'success', parsedDetails.ocspUrls?.join(', ') || 'None');
                        addLog("CRL URLs found:", 'success', parsedDetails.crlDistributionPoints?.join(', ') || 'None');
                    } else {
                        addLog('Could not fetch or parse created CA certificate.', 'error');
                    }
                } catch(e: any) {
                    addLog(`CA certificate verification failed: ${e.message}`, 'error');
                }

            } catch (e: any) {
                addLog(`Failed to create CA: ${e.message}`, 'error');
            }
        } else {
            addLog("2. Skipping CA creation due to profile creation failure.", 'error');
        }
        
        // --- Step 3: Issue Test Certificate ---
        if (createdCa && testProfileId) {
            addLog(`3. Issuing test certificate: "${testCertName}"...`, 'info');
            try {
                // In-memory key and CSR generation
                const algorithm = { name: "ECDSA", namedCurve: "P-256" };
                const keyPair = await crypto.subtle.generateKey(algorithm, true, ["sign", "verify"]);
                const signedCsrPem = await buildSelfSignedCsr({ subject: { commonName: testCertName }, keyPair });

                const result = await signCertificate(testCaId, { csr: window.btoa(signedCsrPem), profile_id: testProfileId });
                issuedCertSerialNumber = result.serial_number;
                addLog("Test certificate issued successfully.", 'success', `Serial Number: ${issuedCertSerialNumber}`);

                // --- Step 3a: Perform CRL and OCSP checks ---
                addLog(`3a. Checking validation endpoints for test certificate...`, 'info');
                try {
                    const createdCaList = await fetchAndProcessCAs(`filter=id[equal]${testCaId}`);
                    const { certificates } = await fetchIssuedCertificates({
                        apiQueryString: `filter=serial_number[equal_ignorecase]${issuedCertSerialNumber}&page_size=1`
                    });
                    const issuedCertDetails = certificates[0];
                    if (!issuedCertDetails?.pemData || createdCaList.length === 0 || !createdCaList[0].pemData) {
                        throw new Error("Could not retrieve PEM for issued or issuer certificate.");
                    }
                    
                    const parsedCert = await parseCertificatePemDetails(issuedCertDetails.pemData);

                    // Check all CRL URLs
                    if (parsedCert.crlDistributionPoints && parsedCert.crlDistributionPoints.length > 0) {
                        for (const url of parsedCert.crlDistributionPoints) {
                            const crlUrl = url.replace('http://', 'https://');
                            addLog(`Attempting CRL download from: ${crlUrl}`, 'info');
                            try {
                                const crlResponse = await fetch(crlUrl,{                                    
                                    headers: {
                                        'Accept': 'application/pkix-crl, */*'
                                    }
                                });
                                if (crlResponse.ok) {
                                    addLog(`CRL download successful (Status: ${crlResponse.status}).`, 'success', crlUrl);
                                } else {
                                    const errorMsg = `CRL download failed (Status: ${crlResponse.status}). This might be a missing endpoint or CORS issue.`;
                                    addLog(errorMsg, 'error', `URL: ${crlUrl}`);
                                    setValidationErrors(prev => [...prev, { url: crlUrl, message: `CRL download failed (Status: ${crlResponse.status})` }]);
                                }
                            } catch (crlError: any) {
                                const errorMsg = `CRL download failed: ${crlError.message}. This might be a network or CORS issue.`;
                                addLog(errorMsg, 'error', `URL: ${crlUrl}`);
                                setValidationErrors(prev => [...prev, { url: crlUrl, message: `CRL download failed: ${crlError.message}` }]);
                            }
                        }
                    } else {
                        addLog('No CRL Distribution Point found in certificate.', 'info');
                    }

                    // Check all OCSP URLs
                    if (parsedCert.ocspUrls && parsedCert.ocspUrls.length > 0) {
                        for (const url of parsedCert.ocspUrls) {
                            const ocspUrl = url.replace('http://', 'https://');
                            addLog(`Attempting OCSP request to: ${ocspUrl}`, 'info');

                            const ocspResult = await checkOcspStatus(
                                issuedCertDetails.pemData,
                                createdCaList[0].pemData,
                                ocspUrl
                            );

                            if (ocspResult.status === 'error') {
                                const errorMsg = `OCSP request failed: ${ocspResult.errorDetails}. This might be a missing endpoint or CORS issue.`;
                                addLog(errorMsg, 'error', `URL: ${ocspUrl}`);
                                setValidationErrors(prev => [...prev, { url: ocspUrl, message: `OCSP request failed: ${ocspResult.errorDetails}` }]);
                            } else {
                                addLog(`OCSP request successful (Status: ${ocspResult.statusText}).`, 'success', `URL: ${ocspUrl}`);
                            }
                        }
                    } else {
                         addLog('No OCSP URL found in certificate.', 'info');
                    }

                } catch (validationError: any) {
                    addLog(`Failed to perform validation checks: ${validationError.message}`, 'error');
                }

            } catch(e: any) {
                 addLog(`Failed to issue certificate: ${e.message}`, 'error');
            }
        } else {
            addLog("3. Skipping certificate issuance due to previous errors.", 'error');
        }

        // --- Step 4: Create Dummy RA ---
        if(createdCa) {
            addLog(`4. Creating dummy RA: "${testRaId}"...`, 'info');
            try {
                await createOrUpdateRa({
                    id: testRaId,
                    name: `Test RA ${testId}`,
                    metadata: {},
                    settings: {
                        enrollment_settings: {
                            enrollment_ca: testCaId, protocol: "EST_RFC7030", registration_mode: "JITP",
                            enable_replaceable_enrollment: true,
                            device_provisioning_profile: { icon: "Cpu", icon_color: "#888888-#e0e0e0", tags: ["test-device"] },
                        },
                        reenrollment_settings: { revoke_on_reenrollment: true, enable_expired_renewal: true, reenrollment_delta: "30d", preventive_delta: "7d", critical_delta: "1d", additional_validation_cas: [] },
                        server_keygen_settings: { enabled: false },
                        ca_distribution_settings: { include_enrollment_ca: true, include_system_ca: true, managed_cas: [] }
                    }
                }, false);
                addLog("Dummy RA created successfully.", 'success', `RA ID: ${testRaId}`);
                createdRa = true;
            } catch (e: any) {
                addLog(`Failed to create RA: ${e.message}`, 'error');
            }
        } else {
             addLog("4. Skipping RA creation due to previous errors.", 'error');
        }

        // --- Step 5: Register Dummy Device ---
        if (createdRa) {
            addLog(`5. Registering dummy Device: "${testDeviceId}"...`, 'info');
            try {
                await registerDevice({
                    id: testDeviceId, dms_id: testRaId, tags: ["test-device"],
                    icon: "Cpu", icon_color: "#888888-#e0e0e0", metadata: {},
                });
                addLog("Dummy Device registered successfully.", 'success', `Device ID: ${testDeviceId}`);
                createdDevice = true;
            } catch (e: any) {
                addLog(`Failed to register device: ${e.message}`, 'error');
            }
        } else {
            addLog("5. Skipping Device registration due to previous errors.", 'error');
        }

        // --- Step 6: Final Result ---
        const overallSuccess = !!testProfileId && createdCa && !!issuedCertSerialNumber && createdRa && createdDevice;
        if (overallSuccess) {
            addLog("All components created successfully.", 'success');
        } else {
            addLog("One or more components failed to create. Proceeding to cleanup.", 'error');
        }

        // --- Step 7: Cleanup ---
        addLog("--- Starting Cleanup ---", 'info');
        if (createdDevice) {
            try {
                addLog(`- Decommissioning Device "${testDeviceId}"...`, 'info');
                await decommissionDevice(testDeviceId);
                addLog("Device decommissioned.", 'success');

                addLog(`- Deleting Device "${testDeviceId}"...`, 'info');
                await deleteDevice(testDeviceId);
                addLog("Device deleted.", 'success');
            } catch (e: any) { addLog(`Device cleanup failed: ${e.message}`, 'error'); }
        }

        if (createdRa) {
            try {
                addLog(`- Deleting RA "${testRaId}"...`, 'info');
                await deleteRa(testRaId);
                addLog("RA deleted.", 'success');
            } catch (e: any) { addLog(`RA cleanup failed: ${e.message}`, 'error'); }
        }
        
        if (issuedCertSerialNumber) {
             try {
                addLog(`- Revoking test certificate "${issuedCertSerialNumber}"...`, 'info');
                await updateCertificateStatus({ serialNumber: issuedCertSerialNumber, status: 'REVOKED', reason: 'Unspecified' });
                addLog("Test certificate revoked successfully.", 'success');
            } catch (e: any) { addLog(`Certificate revocation failed: ${e.message}`, 'error'); }
        }

        if (createdCa) {
            try {
                addLog(`- Revoking CA "${testCaId}"...`, 'info');
                await revokeCa(testCaId, "Unspecified");
                addLog("CA revoked successfully.", 'success');
                
                addLog(`- Permanently deleting CA "${testCaId}"...`, 'info');
                await deleteCa(testCaId);
                addLog("CA deleted successfully.", 'success');
            } catch (e: any) { addLog(`CA cleanup failed: ${e.message}`, 'error'); }
        }

        if (issuedCertSerialNumber) {
             try {
                addLog(`- Deleting test certificate "${issuedCertSerialNumber}"...`, 'info');
                await deleteCertificate(issuedCertSerialNumber);
                addLog("Test certificate deleted successfully.", 'success');
            } catch (e: any) { addLog(`Certificate deletion cleanup failed: ${e.message}`, 'error'); }
        }

        if (testCaCertSerialNumber) {
             try {
                addLog(`- Deleting test CA certificate "${testCaCertSerialNumber}"...`, 'info');
                await deleteCertificate(testCaCertSerialNumber);
                addLog("Test CA certificate deleted successfully.", 'success');
            } catch (e: any) { addLog(`CA Certificate deletion cleanup failed: ${e.message}`, 'error'); }
        }
        
        if (testProfileId) {
            try {
                addLog(`- Deleting dummy profile "${testProfileName}"...`, 'info');
                await deleteSigningProfile(testProfileId);
                addLog("Dummy profile deleted successfully.", 'success');
            } catch (e: any) { addLog(`Profile cleanup failed: ${e.message}`, 'error'); }
        }
        
        if (overallSuccess && validationErrors.length === 0) {
            addLog("System Health Check Passed!", 'success');
            setTestSuccess(true);
        } else {
            addLog("System Health Check Completed with Errors.", 'error');
            setTestError("One or more steps failed. Please review the logs.");
        }

        setIsTestRunning(false);
    };

    const handleCompleteWizard = () => {
        // Set a cookie to indicate completion. Expires in 10 years.
        document.cookie = "lamassu_wizard_completed=true; path=/; max-age=315360000";
        window.location.reload();
    };

    const handleSkipWizard = () => {
        handleCompleteWizard(); // Skipping also marks it as complete for this session
    };


    const handleNext = () => setCurrentStep(prev => (prev < totalSteps ? prev + 1 : prev));
    const handleBack = () => setCurrentStep(prev => (prev > 1 ? prev - 1 : 1));

    const handleCreateDefaultProfile = async () => {
        setIsCreatingProfile(true);
        try {
            const templateData: Partial<SigningProfileFormValues> = templateDefaults['device-auth'] || {};
            const payload = {
                name: 'Default Profile',
                description: 'Default profile for general device authentication.',
                validity: { type: "Duration", duration: "5y" },
                sign_as_ca: false,
                honor_key_usage: false,
                key_usage: templateData.keyUsages || [...TLS_KEY_USAGES],
                honor_extended_key_usages: false,
                extended_key_usages: templateData.extendedKeyUsages || [...DEVICE_AUTH_EXTENDED_KEY_USAGES],
                honor_subject: true,
                honor_extensions: true,
                crypto_enforcement: {
                    enabled: true,
                    allow_rsa_keys: true,
                    allow_ecdsa_keys: true,
                    allowed_rsa_key_sizes: [2048, 3072, 4096],
                    allowed_ecdsa_key_sizes: [256, 384, 521],
                },
            };
            
            await createSigningProfile(payload);
            sileo.success({ title: "Success!", description: "Default Issuance Profile created." });
            checkFinalStepStatus(); // Re-check to update the button state
        } catch (e: any) {
             sileo.error({ title: "Creation Failed", description: e.message });
        } finally {
            setIsCreatingProfile(false);
        }
    };

    const handleCreateRootCA = () => {
        router.push('/certificate-authorities/new/generate');
    };

    const LogIcon: React.FC<{ status: LogEntry['status'] }> = ({ status }) => {
        if (status === 'success') return <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />;
        if (status === 'error') return <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />;
        return <Info className="h-4 w-4 text-muted-foreground flex-shrink-0" />;
    };

    const stepContent = () => {
        switch (currentStep) {
            case 1:
                return (
                    <div className="text-center animate-fade-in">
                        <Rocket className="mx-auto h-16 w-16 text-primary mb-4" />
                        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
                            Welcome to LamassuIoT
                        </h1>
                        <p className="mt-4 text-lg text-muted-foreground max-w-2xl mx-auto">
                            Your central hub for managing X.509 certificates and Public Key Infrastructure (PKI).
                            This setup wizard will guide you through the initial system checks and configuration.
                        </p>
                    </div>
                );
            case 2:
                return (
                    <div className="w-full max-w-2xl mx-auto animate-fade-in">
                        <h2 className="text-2xl font-semibold text-center mb-4">Backend Services Check</h2>
                        <p className="text-muted-foreground text-center mb-6">Let's ensure all backend services are running correctly.</p>
                        <BackendStatusCheck />
                    </div>
                );
            case 3:
                 return (
                    <div className="w-full max-w-2xl mx-auto animate-fade-in">
                        <h2 className="text-2xl font-semibold text-center mb-4">Crypto Engines</h2>
                         <p className="text-muted-foreground text-center mb-6">These are the available cryptographic engines for key management.</p>
                        <CryptoEngineSummary />
                    </div>
                );
            case 4:
                return (
                    <div className="w-full max-w-3xl mx-auto animate-fade-in">
                        <h2 className="text-2xl font-semibold text-center mb-4">System Health-Check</h2>
                        <p className="text-muted-foreground text-center mb-6">
                            Perform an end-to-end test to ensure the system is working correctly. This will create and then clean up a temporary test profile, CA, RA, and device.
                        </p>
                        <div className="flex justify-center items-center gap-4 mt-8">
                             <Button onClick={handleRunTest} className="px-8 py-6 text-lg" disabled={isTestRunning || availableEngines.length === 0}>
                                {isTestRunning ? <Loader2 className="mr-2 h-5 w-5 animate-spin"/> : <ShieldCheck className="mr-2 h-5 w-5"/>}
                                {isTestRunning ? 'Test in Progress...' : 'Run Test'}
                            </Button>
                        </div>
                        {availableEngines.length === 0 && <p className="text-center text-sm text-destructive mt-2">No crypto engines available to run the test.</p>}
                        
                        {testLogs.length > 0 && (
                            <div className="mt-6 p-4 border rounded-md bg-muted/30">
                                <h3 className="font-semibold mb-2">Test Log</h3>
                                <div ref={logContainerRef} className="max-h-60 overflow-y-auto space-y-2 bg-background p-2 rounded-sm">
                                    {testLogs.map((log, index) => (
                                        <div key={index} className="flex items-start gap-2 text-sm">
                                            <LogIcon status={log.status} />
                                            <div className="flex-1">
                                                <p className={cn(log.status === 'error' && 'text-destructive font-medium')}>{log.message}</p>
                                                {log.details && <p className="text-xs text-muted-foreground font-mono">{log.details}</p>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {testError && (
                                    <Alert variant="destructive" className="mt-2">
                                        <AlertTitle>Test Completed with Errors</AlertTitle>
                                        <AlertDescription>{testError}</AlertDescription>
                                    </Alert>
                                )}
                                {testSuccess && (
                                     <Alert variant="default" className="mt-2 bg-green-50 dark:bg-green-900/30 border-green-200 dark:border-green-600">
                                        <CheckCircle className="h-4 w-4 text-green-600" />
                                        <AlertTitle className="text-green-800 dark:text-green-300">Test Complete</AlertTitle>
                                        <AlertDescription className="text-green-700 dark:text-green-400">All system checks passed successfully.</AlertDescription>
                                    </Alert>
                                )}
                                {validationErrors.length > 0 && (
                                    <Alert variant="warning" className="mt-2">
                                        <AlertTriangle className="h-4 w-4" />
                                        <AlertTitle>Validation Service Warnings</AlertTitle>
                                        <AlertDescription>
                                            <ul className="list-disc list-inside mt-1 space-y-2">
                                                {validationErrors.map((err, i) => (
                                                  <li key={i}>
                                                    {err.message}
                                                    <p className="text-xs text-muted-foreground font-mono">{err.url}</p>
                                                  </li>
                                                ))}
                                            </ul>
                                        </AlertDescription>
                                    </Alert>
                                )}
                            </div>
                        )}
                    </div>
                );
            case 5:
                const allTasksDone = defaultProfileExists && caCount !== null && caCount > 0;
                return (
                    <div className="w-full max-w-3xl mx-auto animate-fade-in">
                        {allTasksDone && <ReadyToPki />}
                        <div className={cn("space-y-4", allTasksDone && "mt-8")}>
                            {!allTasksDone && (
                                <>
                                    <h2 className="text-2xl font-semibold text-center mb-4">Ready to Go!</h2>
                                    <p className="text-muted-foreground text-center mb-6">The system is ready. Here are some recommended next steps.</p>
                                </>
                            )}
                            {defaultProfileExists === null ? (
                                <div className="flex items-center justify-center p-4 border rounded-lg"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking for default profile...</div>
                            ) : defaultProfileExists ? (
                                <CompletedActionItem
                                    title="Global Issuance Profile"
                                    description="The 'Default Profile' for general device authentication already exists in the system."
                                    icon={FilePlus2}
                                />
                            ) : (
                                <ActionItem
                                    title="Create a Global Issuance Profile"
                                    description="Define a set of rules and defaults for issuing certificates. This profile will be named 'Default Profile' and use the IoT Device Authentication template."
                                    buttonText="Create Default Profile"
                                    onClick={handleCreateDefaultProfile}
                                    icon={FilePlus2}
                                    isWorking={isCreatingProfile}
                                />
                            )}
                            {caCount === null ? (
                                <div className="flex items-center justify-center p-4 border rounded-lg"><Loader2 className="mr-2 h-4 w-4 animate-spin" />Checking for existing CAs...</div>
                            ) : caCount > 0 ? (
                                <CompletedActionItem
                                    title="Create a Root Certificate Authority"
                                    description="You already have one or more CAs in the system. This step is complete."
                                    icon={Rocket}
                                />
                            ) : (
                                <ActionItem
                                    title="Create a Root Certificate Authority"
                                    description="Establish the foundation of your PKI. A Root CA is required to start issuing certificates."
                                    buttonText="Create Root CA"
                                    onClick={handleCreateRootCA}
                                    icon={Rocket}
                                />
                            )}
                        </div>
                    </div>
                );
            default:
                return null;
        }
    }

    return (
        <div className="container mx-auto p-4 sm:p-6 lg:p-8 flex flex-col items-center justify-center min-h-[calc(100vh-var(--header-height))]">
            <div className="w-full max-w-4xl">
                <Stepper currentStep={currentStep} steps={["Welcome", "Services", "Engines", "System Test", "Next Steps"]} />
                <div className="mt-8 min-h-[400px] flex items-center justify-center">
                    {stepContent()}
                </div>
                <div className="mt-8 flex justify-between items-center">
                    {currentStep > 1 ? (
                        <Button variant="secondary" onClick={handleBack} disabled={isTestRunning}>
                            <ArrowLeft className="mr-2 h-4 w-4"/>
                            Back
                        </Button>
                    ) : <div></div>}
                    
                    <div className="flex items-center space-x-2">
                        {currentStep < totalSteps && (
                             <Button variant="ghost" onClick={handleSkipWizard} disabled={isTestRunning}>
                                Skip for now
                             </Button>
                        )}
                        {currentStep < totalSteps ? (
                            <Button onClick={handleNext} disabled={isTestRunning}>
                                {currentStep === 4 ? (testSuccess ? 'Continue' : 'Skip & Continue') : 'Next'}
                                <ArrowRight className="ml-2 h-4 w-4"/>
                            </Button>
                        ) : (
                            <Button onClick={handleCompleteWizard}>Finish Setup</Button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

interface ActionItemProps {
    title: string;
    description: string;
    buttonText: string;
    onClick: () => void;
    icon: React.ElementType;
    isWorking?: boolean;
}

const ActionItem: React.FC<ActionItemProps> =
({ title, description, buttonText, onClick, icon: Icon, isWorking = false }) => (
    <div className="flex items-start space-x-4 rounded-lg border p-4 hover:bg-muted/50 transition-colors">
        <Icon className="h-8 w-8 text-primary mt-1 flex-shrink-0" />
        <div className="flex-1">
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={onClick} className="self-center" disabled={isWorking}>
            {isWorking && <Loader2 className="mr-2 h-4 w-4 animate-spin"/>}
            {buttonText}
        </Button>
    </div>
);

const CompletedActionItem: React.FC<{ title: string; description: string; icon: React.ElementType }> =
({ title, description, icon: Icon }) => (
    <div className="flex items-start space-x-4 rounded-lg border p-4 bg-muted/50">
        <Icon className="h-8 w-8 text-muted-foreground mt-1 flex-shrink-0" />
        <div className="flex-1">
            <h3 className="font-semibold text-muted-foreground">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <div className="self-center">
            <CheckCircle className="h-6 w-6 text-green-500" />
        </div>
    </div>
);

    
