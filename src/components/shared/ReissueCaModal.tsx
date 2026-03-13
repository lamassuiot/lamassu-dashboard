'use client';

import React, { useState, useEffect } from 'react';
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardHeader, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, BookText, Settings2, Info, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ExpirationInput, type ExpirationConfig } from './ExpirationInput';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { Badge } from '@/components/ui/badge';
import { differenceInSeconds, parseISO, isFuture, add } from 'date-fns';
import { fetchSigningProfiles, type ApiSigningProfile } from '@/lib/ca-data';
import { IssuanceProfileCard } from '@/components/shared/IssuanceProfileCard';
import { Skeleton } from '@/components/ui/skeleton';
import { KEY_USAGE_OPTIONS, EKU_OPTIONS } from '@/lib/form-options';

type ProfileMode = 'reuse' | 'inline';

interface ReissueCaModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (payload: { profile_id?: string; profile?: any }) => void;
  caName: string;
  caExpirationDate: string; // ISO date string
  isReissuing: boolean;
}

export const ReissueCaModal: React.FC<ReissueCaModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  caName,
  caExpirationDate,
  isReissuing,
}) => {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const isDesktop = isMobile === false;
  const [profileMode, setProfileMode] = useState<ProfileMode>('inline');
  
  // Profile selector state
  const [availableProfiles, setAvailableProfiles] = useState<ApiSigningProfile[]>([]);
  const [isLoadingProfiles, setIsLoadingProfiles] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  
  // Calculate duration from now to CA expiration
  const calculateDurationFromExpiration = () => {
    try {
      const expirationDate = parseISO(caExpirationDate);
      const now = new Date();
      const secondsRemaining = differenceInSeconds(expirationDate, now);
      
      if (secondsRemaining <= 0) {
        return '1y'; // Default to 1 year if CA is already expired
      }
      
      // Convert seconds to a duration string
      const years = Math.floor(secondsRemaining / (365.25 * 24 * 60 * 60));
      const remainingAfterYears = secondsRemaining % (365.25 * 24 * 60 * 60);
      const weeks = Math.floor(remainingAfterYears / (7 * 24 * 60 * 60));
      const remainingAfterWeeks = remainingAfterYears % (7 * 24 * 60 * 60);
      const days = Math.floor(remainingAfterWeeks / (24 * 60 * 60));
      
      const parts = [];
      if (years > 0) parts.push(`${years}y`);
      if (weeks > 0) parts.push(`${weeks}w`);
      if (days > 0) parts.push(`${days}d`);
      
      return parts.length > 0 ? parts.join('') : '1d';
    } catch (error) {
      console.error('Error calculating duration:', error);
      return '1y'; // Default fallback
    }
  };
  
  // Get CA expiration date for Date type validity
  const getCaExpirationDate = () => {
    try {
      return parseISO(caExpirationDate);
    } catch (error) {
      console.error('Error parsing CA expiration date:', error);
      // Default to 1 year from now if parsing fails
      const date = new Date();
      date.setFullYear(date.getFullYear() + 1);
      return date;
    }
  };
  
  // Inline profile state
  const [validity, setValidity] = useState<ExpirationConfig>({ 
    type: 'Duration', 
    durationValue: calculateDurationFromExpiration(),
    dateValue: getCaExpirationDate()
  });
  const [keyUsages, setKeyUsages] = useState<string[]>(['DigitalSignature', 'KeyEncipherment']);
  const [extendedKeyUsages, setExtendedKeyUsages] = useState<string[]>(['ServerAuth', 'ClientAuth']);

  // Load profiles when modal opens
  useEffect(() => {
    if (isOpen && user?.access_token) {
      loadProfiles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, user?.access_token]);

  const loadProfiles = async () => {
    if (!user?.access_token) return;
    
    setIsLoadingProfiles(true);
    try {
      const result = await fetchSigningProfiles(user.access_token);
      setAvailableProfiles(result.list || []);
    } catch (error: any) {
      console.error('Failed to load profiles:', error);
    } finally {
      setIsLoadingProfiles(false);
    }
  };

  const handleKeyUsageChange = (usage: string, checked: boolean) => {
    setKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };

  const handleExtendedKeyUsageChange = (usage: string, checked: boolean) => {
    setExtendedKeyUsages(prev => checked ? [...prev, usage] : prev.filter(u => u !== usage));
  };

  const handleReissue = () => {
    if (profileMode === 'reuse') {
      if (!selectedProfileId) return;
      onConfirm({ profile_id: selectedProfileId });
    } else {
      // Build inline profile
      const profile = {
        validity: validity.type === 'Duration'
          ? { type: 'Duration', duration: validity.durationValue }
          : { type: 'Date', time: validity.dateValue?.toISOString() },
        sign_as_ca: true,
        honor_key_usage: false,
        key_usage: keyUsages,
        honor_extended_key_usages: false,
        extended_key_usages: extendedKeyUsages,
        honor_subject: true,
        honor_extensions: false,
        crypto_enforcement: {
          enabled: false,
          allow_rsa_keys: true,
          allow_ecdsa_keys: true,
        },
      };
      onConfirm({ profile });
    }
  };

  const selectedProfile = availableProfiles.find(p => p.id === selectedProfileId);
  
  // Check if expiration will be in the future
  const isExpirationValid = () => {
    if (profileMode === 'reuse') {
      return true; // Profile validation is handled separately
    }
    
    try {
      if (validity.type === 'Date') {
        return validity.dateValue ? isFuture(validity.dateValue) : false;
      } else if (validity.type === 'Duration' && validity.durationValue) {
        // Parse duration string (e.g., "1y2w3d")
        const durationRegex = /(\d+)([ywdhms])/g;
        let match;
        const now = new Date();
        let expirationDate = now;
        
        while ((match = durationRegex.exec(validity.durationValue)) !== null) {
          const value = parseInt(match[1]);
          const unit = match[2];
          
          switch (unit) {
            case 'y':
              expirationDate = add(expirationDate, { years: value });
              break;
            case 'w':
              expirationDate = add(expirationDate, { weeks: value });
              break;
            case 'd':
              expirationDate = add(expirationDate, { days: value });
              break;
            case 'h':
              expirationDate = add(expirationDate, { hours: value });
              break;
            case 'm':
              expirationDate = add(expirationDate, { minutes: value });
              break;
            case 's':
              expirationDate = add(expirationDate, { seconds: value });
              break;
          }
        }
        
        return isFuture(expirationDate);
      }
      return false;
    } catch (error) {
      console.error('Error validating expiration:', error);
      return false;
    }
  };
  
  const expirationIsValid = isExpirationValid();
  
  // Check if selected profile has Sign as CA enabled
  const profileHasSignAsCA = selectedProfile ? selectedProfile.sign_as_ca : true;
  
  const canSubmit = profileMode === 'reuse' 
    ? (!!selectedProfileId && profileHasSignAsCA)
    : expirationIsValid;

  const cardClass = (mode: ProfileMode) => cn(
    "cursor-pointer transition-all duration-200 hover:shadow-md border-2",
    profileMode === mode 
      ? "border-primary bg-primary/5 shadow-sm" 
      : "border-border hover:border-primary/50"
  );

  const iconWrapperClass = (mode: ProfileMode) => cn(
    "p-2 rounded-lg",
    profileMode === mode 
      ? "bg-primary text-primary-foreground" 
      : "bg-muted text-muted-foreground"
  );

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !isReissuing && !open && onClose()} direction={isDesktop ? 'right' : 'bottom'}>
      <DrawerContent className={isDesktop
        ? "inset-y-0 right-0 left-auto bottom-auto mt-0 h-full w-[580px] max-w-[90vw] rounded-none rounded-l-[10px] flex flex-col [&>div:first-child]:hidden"
        : "max-h-[90vh] flex flex-col"
      }>
        <DrawerHeader className="border-b">
          <DrawerTitle>Reissue CA Certificate</DrawerTitle>
          <DrawerDescription>
            Reissue the certificate for CA &quot;{caName}&quot;
          </DrawerDescription>
        </DrawerHeader>

        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription>
              A new certificate will be issued for this CA with the same subject and issuer information.
            </AlertDescription>
          </Alert>
          <div>
            <Label>Profile Mode</Label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <Card className={cardClass('reuse')} onClick={() => setProfileMode('reuse')}>
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className={iconWrapperClass('reuse')}>
                      <BookText className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Reuse Existing Profile</h3>
                      <CardDescription className="text-sm">Use predefined issuance templates</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
              <Card className={cardClass('inline')} onClick={() => setProfileMode('inline')}>
                <CardHeader>
                  <div className="flex items-center space-x-3">
                    <div className={iconWrapperClass('inline')}>
                      <Settings2 className="h-5 w-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-semibold">Inline Profile</h3>
                      <CardDescription className="text-sm">Define a one-time issuance policy</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </div>
          </div>

          {profileMode === 'reuse' && (
            <div className="space-y-4 pt-4 border-t">
              <div className="space-y-2">
                <Label htmlFor="profile-select">Select Profile</Label>
                {isLoadingProfiles ? (
                  <Skeleton className="h-10 w-full" />
                ) : (
                  <Select value={selectedProfileId || ''} onValueChange={setSelectedProfileId}>
                    <SelectTrigger id="profile-select">
                      <SelectValue placeholder="Select a profile..." />
                    </SelectTrigger>
                    <SelectContent>
                      {availableProfiles.length > 0 ? (
                        availableProfiles.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                        ))
                      ) : (
                        <SelectItem value="none" disabled>No profiles available</SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                )}
              </div>
              {selectedProfile && (
                <div className="pt-2">
                  <IssuanceProfileCard profile={selectedProfile} />
                  {!profileHasSignAsCA && (
                    <Alert variant="destructive" className="mt-2">
                      <AlertTitle>Invalid Profile</AlertTitle>
                      <AlertDescription>
                        The selected profile must have &quot;Sign as CA&quot; enabled to reissue a CA certificate.
                      </AlertDescription>
                    </Alert>
                  )}
                </div>
              )}
            </div>
          )}

          {profileMode === 'inline' && (
            <div className="space-y-4 pt-4 border-t">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Label>Certificate Type</Label>
                  <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/30">
                    <CheckCircle2 className="h-3 w-3 mr-1" />
                    Sign as CA
                  </Badge>
                </div>
                <p className="text-sm text-muted-foreground">This certificate will be issued with CA signing capabilities.</p>
              </div>
              
              <div>
                <Label>Certificate Validity</Label>
                <ExpirationInput
                  idPrefix="reissue-validity"
                  label=""
                  value={validity}
                  onValueChange={setValidity}
                />
                {!expirationIsValid && (
                  <Alert variant="destructive" className="mt-2">
                    <AlertTitle>Invalid Expiration</AlertTitle>
                    <AlertDescription>
                      The certificate expiration must be set to a date in the future.
                    </AlertDescription>
                  </Alert>
                )}
              </div>

              <div>
                <Label>Key Usages</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm bg-background">
                  {KEY_USAGE_OPTIONS.map(({ id, label }) => (
                    <div key={id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`ku-${id}`}
                        checked={keyUsages.includes(id)}
                        onCheckedChange={(checked) => handleKeyUsageChange(id, checked as boolean)}
                      />
                      <label htmlFor={`ku-${id}`} className="text-sm font-normal cursor-pointer">
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Extended Key Usages</Label>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2 mt-2 border p-3 rounded-md shadow-sm bg-background">
                  {EKU_OPTIONS.map(({ id, label }) => (
                    <div key={id} className="flex items-center space-x-2">
                      <Checkbox
                        id={`eku-${id}`}
                        checked={extendedKeyUsages.includes(id)}
                        onCheckedChange={(checked) => handleExtendedKeyUsageChange(id, checked as boolean)}
                      />
                      <label htmlFor={`eku-${id}`} className="text-sm font-normal cursor-pointer">
                        {label}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        <DrawerFooter className="border-t">
          <Button onClick={handleReissue} disabled={isReissuing || !canSubmit}>
            {isReissuing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isReissuing ? 'Reissuing...' : 'Reissue CA Certificate'}
          </Button>
          <DrawerClose asChild>
            <Button variant="outline" onClick={onClose} disabled={isReissuing}>
              Cancel
            </Button>
          </DrawerClose>
        </DrawerFooter>
      </DrawerContent>
    </Drawer>
  );
};
