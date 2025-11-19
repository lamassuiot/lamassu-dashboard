'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from '@/components/ui/badge';
import { Textarea } from "@/components/ui/textarea";
import { Loader2, AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react";
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { reissueCa, fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { SigningProfileSelector, type ProfileMode } from '@/components/shared/SigningProfileSelector';
import type { ExpirationConfig } from '@/components/shared/ExpirationInput';
import { DetailItem } from '@/components/shared/DetailItem';
import { formatISO, add, parseISO, isAfter, type Duration, differenceInYears, differenceInWeeks, differenceInDays } from 'date-fns';
import { cn } from '@/lib/utils';

interface ReissueCertificateModalProps {
    isOpen: boolean;
    onClose: () => void;
    caId: string;
    caName: string;
    caExpiryDate: string;
    caValidFrom?: string;
    onReissueSuccess?: () => void;
}

const INDEFINITE_DATE_API_VALUE = "9999-12-31T23:59:58.999Z";

const parseDurationString = (durationStr: string): Duration => {
    const duration: Duration = {};
    const regex = /(\d+)(y|w|d|h|m|s)/g;
    let match;
    while ((match = regex.exec(durationStr)) !== null) {
        const value = parseInt(match[1], 10);
        const unit = match[2];
        switch (unit) {
            case 'y': duration.years = value; break;
            case 'w': duration.weeks = value; break;
            case 'd': duration.days = value; break;
            case 'h': duration.hours = value; break;
            case 'm': duration.minutes = value; break;
            case 's': duration.seconds = value; break;
        }
    }
    return duration;
};

export const ReissueCertificateModal: React.FC<ReissueCertificateModalProps> = ({
    isOpen,
    onClose,
    caId,
    caName,
    caExpiryDate,
    caValidFrom,
    onReissueSuccess,
}) => {
    const { toast } = useToast();
    const { user } = useAuth();

    // State for profile selection
    const [profileMode, setProfileMode] = useState<ProfileMode>('inline');
    const [signingProfiles, setSigningProfiles] = useState<ApiSigningProfile[]>([]);
    const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
    const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
    const [keyUsages, setKeyUsages] = useState<string[]>(['DigitalSignature', 'KeyEncipherment']);
    const [extendedKeyUsages, setExtendedKeyUsages] = useState<string[]>(['ClientAuth', 'ServerAuth']);
    const [validity, setValidity] = useState<ExpirationConfig>({ type: 'Duration', durationValue: '1y' });

    // State for reissuance process
    const [step, setStep] = useState<1 | 2>(1); // 1: Configure, 2: Done
    const [isReissuing, setIsReissuing] = useState(false);
    const [reissuanceError, setReissuanceError] = useState<string | null>(null);
    const [reissuedCertificate, setReissuedCertificate] = useState<{ pem: string; serial: string } | null>(null);

    // UX State for copy button
    const [certificateCopied, setCertificateCopied] = useState(false);

    const validityWarning = useMemo(() => {
        if (!validity) return null;

        let certExpiryDate: Date;

        if (validity.type === 'Indefinite') {
            return `The certificate's indefinite validity extends beyond the issuer CA's expiration date.`;
        } else if (validity.type === 'Date' && validity.dateValue) {
            certExpiryDate = validity.dateValue;
        } else if (validity.type === 'Duration' && validity.durationValue) {
            try {
                const durationObj = parseDurationString(validity.durationValue);
                certExpiryDate = add(new Date(), durationObj);
            } catch {
                return null;
            }
        } else {
            return null;
        }

        const caExpiry = parseISO(caExpiryDate);

        if (isAfter(certExpiryDate, caExpiry)) {
            return `The certificate's validity extends beyond the issuer CA's expiration date.`;
        }

        return null;
    }, [validity, caExpiryDate]);

    const selectedProfile = useMemo(() => {
        if (profileMode === 'reuse' && selectedProfileId) {
            return signingProfiles.find(p => p.id === selectedProfileId);
        }
        return null;
    }, [profileMode, selectedProfileId, signingProfiles]);

    useEffect(() => {
        if (caValidFrom && caExpiryDate) {
            const validFrom = parseISO(caValidFrom);
            const expiry = parseISO(caExpiryDate);

            let remaining = validFrom;
            const parts: string[] = [];

            // Years
            const years = differenceInYears(expiry, remaining);
            if (years > 0) {
                parts.push(`${years}y`);
                remaining = add(remaining, { years });
            }

            // Weeks
            const weeks = differenceInWeeks(expiry, remaining);
            if (weeks > 0) {
                parts.push(`${weeks}w`);
                remaining = add(remaining, { weeks });
            }

            // Days
            const days = differenceInDays(expiry, remaining);
            if (days > 0) {
                parts.push(`${days}d`);
            }

            if (parts.length > 0) {
                setValidity({ type: 'Duration', durationValue: parts.join('') });
            }
        }
    }, [caValidFrom, caExpiryDate]);

    // Load profiles on mount
    useEffect(() => {
        if (!isOpen || !user?.access_token) return;

        const loadProfiles = async () => {
            setIsLoadingProfiles(true);
            try {
                const profiles = await fetchSigningProfiles(user.access_token!);
                setSigningProfiles(profiles.list);
                if (profiles.list.length > 0) {
                    setSelectedProfileId(profiles.list[0].id);
                }
            } catch (error: any) {
                toast({
                    title: "Error loading profiles",
                    description: error.message,
                    variant: "destructive",
                });
            } finally {
                setIsLoadingProfiles(false);
            }
        };

        loadProfiles();
    }, [isOpen, user?.access_token, toast]);

    const formatValidityForApi = () => {
        if (validity.type === "Duration") {
            return { type: "Duration", duration: validity.durationValue };
        }
        if (validity.type === "Date" && validity.dateValue) {
            return { type: "Date", time: formatISO(validity.dateValue) };
        }
        if (validity.type === "Indefinite") {
            return { type: "Date", time: INDEFINITE_DATE_API_VALUE };
        }
        return { type: "Duration", duration: "1y" };
    };

    const buildProfilePayload = () => {
        if (profileMode === 'reuse') {
            return { profile_id: selectedProfileId };
        }
        // Inline profile mode
        return {
            profile: {
                extended_key_usages: extendedKeyUsages,
                key_usage: keyUsages,
                honor_extensions: true,
                honor_subject: true,
                validity: formatValidityForApi(),
            }
        };
    };

    const handleReissue = async () => {
        if (!user?.access_token) {
            toast({
                title: "Error",
                description: "Authentication token not available",
                variant: "destructive",
            });
            return;
        }

        setReissuanceError(null);
        setIsReissuing(true);

        try {
            const payload = buildProfilePayload();
            const result = await reissueCa(caId, payload, user.access_token);

            setReissuedCertificate({
                pem: result.certificate || result.pem,
                serial: result.serial_number || result.serialNumber,
            });
            setStep(2);
            toast({
                title: "Success",
                description: `CA "${caName}" reissued successfully`,
            });
        } catch (error: any) {
            const errorMessage = error.message || "Failed to reissue CA";
            setReissuanceError(errorMessage);
            toast({
                title: "Error",
                description: errorMessage,
                variant: "destructive",
            });
        } finally {
            setIsReissuing(false);
        }
    };

    const handleCopy = async (text: string, type: string = "Certificate") => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text.replace(/\\n/g, '\n'));
            setCertificateCopied(true);
            toast({ title: "Copied!", description: `${type} PEM copied to clipboard.` });
            setTimeout(() => setCertificateCopied(false), 2000);
        } catch {
            toast({ title: "Copy Failed", description: `Could not copy ${type} PEM.`, variant: "destructive" });
        }
    };

    const handleDownload = (content: string, filename: string, mime: string = "text/plain") => {
        if (!content) return;
        const blob = new Blob([content.replace(/\\n/g, '\n')], { type: mime });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleClose = () => {
        if (step === 2 && onReissueSuccess) {
            onReissueSuccess();
        }
        setStep(1);
        setReissuedCertificate(null);
        setReissuanceError(null);
        setCertificateCopied(false);
        onClose();
    };

    const handleBack = () => {
        setStep(1);
        setReissuanceError(null);
    };

    return (
        <Dialog open={isOpen} onOpenChange={handleClose}>
            <DialogContent className="max-w-2xl">
                <DialogHeader>
                    <DialogTitle>Reissue CA Certificate</DialogTitle>
                    <DialogDescription>
                        Reissue the certificate for CA "{caName}"
                    </DialogDescription>
                </DialogHeader>

                {step === 1 ? (
                    <div className="space-y-6 py-4">
                        {/* Current CA Certificate Info */}
                        <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                            <h3 className="font-semibold text-sm">Current CA Certificate</h3>
                            <p className="text-sm text-muted-foreground">
                                A new certificate will be issued for this CA with the same subject and issuer information.
                            </p>
                        </div>

                        {/* Validity Warning */}
                        {validityWarning && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Validity Warning</AlertTitle>
                                <AlertDescription>{validityWarning}</AlertDescription>
                            </Alert>
                        )}

                        {/* Profile Selection */}
                        {isLoadingProfiles ? (
                            <div className="flex items-center justify-center p-6">
                                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                <p className="ml-2">Loading profiles...</p>
                            </div>
                        ) : (
                            <SigningProfileSelector
                                profileMode={profileMode}
                                onProfileModeChange={setProfileMode}
                                selectedProfileId={selectedProfileId}
                                onProfileIdChange={setSelectedProfileId}
                                availableProfiles={signingProfiles}
                                isLoadingProfiles={false}
                                inlineModeEnabled={true}
                                availableModes={['reuse', 'inline']}
                                keyUsages={keyUsages}
                                onKeyUsageChange={(usage, checked) =>
                                    setKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage))
                                }
                                extendedKeyUsages={extendedKeyUsages}
                                onExtendedKeyUsageChange={(usage, checked) =>
                                    setExtendedKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage))
                                }
                                validity={validity}
                                onValidityChange={setValidity}
                                validityWarning={validityWarning}
                            />
                        )}

                        {/* Error Message */}
                        {reissuanceError && (
                            <Alert variant="destructive">
                                <AlertTriangle className="h-4 w-4" />
                                <AlertTitle>Error</AlertTitle>
                                <AlertDescription>{reissuanceError}</AlertDescription>
                            </Alert>
                        )}

                        {/* Action Buttons */}
                        <div className="flex justify-end gap-3 pt-4">
                            <Button variant="outline" onClick={handleClose} disabled={isReissuing}>
                                Cancel
                            </Button>
                            <Button onClick={handleReissue} disabled={isReissuing} className="gap-2">
                                {isReissuing && <Loader2 className="h-4 w-4 animate-spin" />}
                                Reissue CA Certificate
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-6 py-8 flex flex-col items-center justify-center text-center">
                        <div className="rounded-full bg-green-100 p-3 dark:bg-green-900/20">
                            <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-400" />
                        </div>

                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold">Certificate Reissued Successfully</h3>
                            <p className="text-muted-foreground max-w-sm mx-auto">
                                A new certificate has been created with the same subject information.
                            </p>
                        </div>

                        <div className="bg-muted/50 p-4 rounded-lg space-y-2 w-full max-w-md">
                            <h3 className="font-semibold text-sm text-left">New Certificate Details</h3>
                            <div className="grid grid-cols-1 gap-2 text-sm text-left">
                                <DetailItem label="Serial Number" value={reissuedCertificate?.serial || "N/A"} />
                            </div>
                        </div>

                        <div className="flex justify-center pt-4 w-full">
                            <Button onClick={handleClose} className="w-full max-w-xs">Done</Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
};
