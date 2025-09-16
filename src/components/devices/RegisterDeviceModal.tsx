
'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Loader2, AlertTriangle } from "lucide-react";
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { Separator } from '../ui/separator';
import { get_DMS_MANAGER_API_BASE_URL } from '@/lib/api-domains';
import { registerDevice } from '@/lib/devices-api';

// Re-defining RA types here to avoid complex imports, but ideally these would be shared
interface ApiRaDeviceProfile {
  icon: string;
  icon_color: string;
  tags: string[];
}
interface ApiRaEnrollmentSettings {
  registration_mode: string;
  enrollment_ca: string;
  device_provisioning_profile: ApiRaDeviceProfile;
}
interface ApiRaSettings {
  enrollment_settings: ApiRaEnrollmentSettings;
}
interface ApiRaItem {
  id: string;
  name: string;
  creation_ts: string;
  settings: ApiRaSettings;
}
interface ApiRaListResponse {
  next: string | null;
  list: ApiRaItem[];
}

interface RegisterDeviceModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  onDeviceRegistered: () => void;
}

export const RegisterDeviceModal: React.FC<RegisterDeviceModalProps> = ({
  isOpen,
  onOpenChange,
  onDeviceRegistered,
}) => {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { toast } = useToast();

  // Core state
  const [deviceId, setDeviceId] = useState('');
  const [selectedRa, setSelectedRa] = useState<ApiRaItem | null>(null);

  // Device profile state (defaults from RA, but editable)
  const [tags, setTags] = useState<string[]>([]);
  const [iconName, setIconName] = useState<string>('Cpu');
  const [iconColor, setIconColor] = useState<string>('#888888');
  const [iconBgColor, setIconBgColor] = useState<string>('#e0e0e0');

  // Modal and loading states
  const [ras, setRas] = useState<ApiRaItem[]>([]);
  const [isLoadingRas, setIsLoadingRas] = useState(true);
  const [errorRas, setErrorRas] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);

  // Generate new UUID when modal opens and reset all state
  useEffect(() => {
    if (isOpen) {
      setDeviceId(crypto.randomUUID());
      setSelectedRa(null);
      setTags([]);
      setIconName('Cpu');
      setIconColor('#888888');
      setIconBgColor('#e0e0e0');
    }
  }, [isOpen]);

  // Fetch RAs when modal opens
  const fetchRAs = useCallback(async () => {
    if (!isOpen || !isAuthenticated() || !user?.access_token) {
      if (!authLoading && !isAuthenticated()) {
        setErrorRas("User not authenticated.");
      }
      setIsLoadingRas(false);
      return;
    }

    setIsLoadingRas(true);
    setErrorRas(null);
    try {
      const response = await fetch(`${get_DMS_MANAGER_API_BASE_URL()}/dms?page_size=100`, {
        headers: { 'Authorization': `Bearer ${user.access_token}` },
      });
      if (!response.ok) {
        throw new Error('Failed to fetch Registration Authorities.');
      }
      const data: ApiRaListResponse = await response.json();
      setRas(data.list || []);
    } catch (err: any) {
      setErrorRas(err.message);
    } finally {
      setIsLoadingRas(false);
    }
  }, [isOpen, user?.access_token, isAuthenticated, authLoading]);

  useEffect(() => {
    if (isOpen) {
      fetchRAs();
    }
  }, [isOpen, fetchRAs]);

  // Update device profile state when RA is selected
  useEffect(() => {
    if (selectedRa) {
      const profile = selectedRa.settings.enrollment_settings.device_provisioning_profile;
      setTags(profile.tags || []);
      setIconName(profile.icon || 'Cpu');
      const [parsedIconColor, parsedBgColor] = (profile.icon_color || '#888888-#e0e0e0').split('-');
      setIconColor(parsedIconColor || '#888888');
      setIconBgColor(parsedBgColor || '#e0e0e0');
    } else {
      // Reset if RA is deselected
      setTags([]);
      setIconName('Cpu');
      setIconColor('#888888');
      setIconBgColor('#e0e0e0');
    }
  }, [selectedRa]);

  const handleRegister = async () => {
    if (!deviceId.trim() || !selectedRa) {
      toast({
        title: "Validation Error",
        description: "Please provide a Device ID and select a Registration Authority.",
        variant: "destructive",
      });
      return;
    }
    if (!user?.access_token) {
      toast({ title: "Authentication Error", description: "Not authenticated.", variant: "destructive" });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        id: deviceId.trim(),
        dms_id: selectedRa.id,
        tags: tags,
        icon: iconName,
        icon_color: `${iconColor}-${iconBgColor}`,
        metadata: {},
      };

      await registerDevice(payload, user.access_token);

      toast({
        title: "Device Registered",
        description: `Device with ID "${deviceId}" has been successfully registered.`,
      });
      onDeviceRegistered();
      onOpenChange(false);

    } catch (err: any) {
      toast({
        title: "Registration Failed",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRaSelectionChange = (raId: string) => {
    const ra = ras.find(r => r.id === raId);
    if (ra) {
      setSelectedRa(ra);
    }
  };

  const handleIconSelected = (name: string) => {
    setIconName(name);
    // Don't close the modal on icon selection to allow color changes
  };

  const handleColorsChange = ({ iconColor: newIconColor, bgColor: newBgColor }: { iconColor: string; bgColor: string }) => {
    setIconColor(newIconColor);
    setIconBgColor(newBgColor);
  };
  
  const SelectedIconComponent = getLucideIconByName(iconName);

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Register New Device</DialogTitle>
            <DialogDescription>
              Provide device details and assign it to a Registration Authority.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="deviceId">Device ID (GUID)</Label>
              <Input
                id="deviceId"
                value={deviceId}
                onChange={(e) => setDeviceId(e.target.value)}
                placeholder="Enter a unique device ID"
                disabled={isSubmitting}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="ra-select">Registration Authority</Label>
              {isLoadingRas ? (
                <div className="flex items-center space-x-2 p-2 h-10 border rounded-md bg-muted/50 text-sm text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading RAs...</span>
                </div>
              ) : errorRas ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error loading RAs</AlertTitle>
                  <AlertDescription>
                    {errorRas}
                    <Button variant="link" size="sm" onClick={fetchRAs} className="p-0 h-auto">Try again?</Button>
                  </AlertDescription>
                </Alert>
              ) : (
                <Select
                  value={selectedRa?.id}
                  onValueChange={handleRaSelectionChange}
                  disabled={isSubmitting}
                >
                  <SelectTrigger id="ra-select">
                    <SelectValue placeholder="Select an RA..." />
                  </SelectTrigger>
                  <SelectContent>
                    {ras.map(ra => (
                      <SelectItem key={ra.id} value={ra.id}>
                        {ra.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            
            {selectedRa && (
              <>
                <Separator />
                <div className="space-y-4">
                  <Label>Device Registration Profile</Label>
                  <div className="flex items-center space-x-4">
                    <div className="space-y-2">
                      <Label htmlFor="device-icon-preview">Icon</Label>
                      {SelectedIconComponent && (
                         <Button
                            id="device-icon-preview"
                            type="button"
                            variant="outline"
                            className="h-16 w-16 p-2 flex flex-col items-center justify-center"
                            onClick={() => setIsIconModalOpen(true)}
                            style={{ backgroundColor: iconBgColor }}
                         >
                            <SelectedIconComponent className="h-8 w-8" style={{ color: iconColor }} />
                         </Button>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="device-tags">Tags</Label>
                    <TagInput id="device-tags" value={tags} onChange={setTags} />
                  </div>
                </div>
              </>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button onClick={handleRegister} disabled={isSubmitting || isLoadingRas || !deviceId || !selectedRa}>
              {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Register Device
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <DeviceIconSelectorModal
        isOpen={isIconModalOpen}
        onOpenChange={setIsIconModalOpen}
        onIconSelected={handleIconSelected}
        currentSelectedIconName={iconName}
        initialIconColor={iconColor}
        initialBgColor={iconBgColor}
        onColorsChange={handleColorsChange}
      />
    </>
  );
};
