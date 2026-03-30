
'use client';

import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { sileo } from '@/lib/toast';
import { TagInput } from '@/components/shared/TagInput';
import { DeviceIconSelectorModal, getLucideIconByName } from '@/components/shared/DeviceIconSelectorModal';
import { DmsSelector } from '@/components/shared/DmsSelector';
import { Separator } from '../ui/separator';
import { fetchRaById, type ApiRaItem } from '@/lib/dms-api';
import { registerDevice } from '@/lib/devices-api';

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

  // Core state
  const [deviceId, setDeviceId] = useState('');
  const [selectedRaId, setSelectedRaId] = useState<string | null>(null);
  const [selectedRa, setSelectedRa] = useState<ApiRaItem | null>(null);

  // Device profile state (defaults from RA, but editable)
  const [tags, setTags] = useState<string[]>([]);
  const [iconName, setIconName] = useState<string>('Cpu');
  const [iconColor, setIconColor] = useState<string>('#888888');
  const [iconBgColor, setIconBgColor] = useState<string>('#e0e0e0');

  // Modal and loading states
  const [isLoadingRa, setIsLoadingRa] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isIconModalOpen, setIsIconModalOpen] = useState(false);

  // Generate new UUID when modal opens and reset all state
  useEffect(() => {
    if (isOpen) {
      setDeviceId(crypto.randomUUID());
      setSelectedRaId(null);
      setSelectedRa(null);
      setTags([]);
      setIconName('Cpu');
      setIconColor('#888888');
      setIconBgColor('#e0e0e0');
    }
  }, [isOpen]);

  // Fetch full RA details when an RA is selected via DmsSelector
  useEffect(() => {
    const fetchSelectedRa = async () => {
      if (!selectedRaId ) {
        setSelectedRa(null);
        return;
      }

      setIsLoadingRa(true);
      try {
        const ra = await fetchRaById(selectedRaId);
        setSelectedRa(ra);
        
        // Update device profile from RA settings
        const profile = ra.settings.enrollment_settings.device_provisioning_profile;
        setTags(profile.tags || []);
        setIconName(profile.icon || 'Cpu');
        const [parsedIconColor, parsedBgColor] = (profile.icon_color || '#888888-#e0e0e0').split('-');
        setIconColor(parsedIconColor || '#888888');
        setIconBgColor(parsedBgColor || '#e0e0e0');
      } catch (error: any) {
        console.error('Failed to fetch RA details:', error);
        sileo.error({ title: "Error", description: "Failed to load RA details" });
        setSelectedRaId(null);
      } finally {
        setIsLoadingRa(false);
      }
    };

    if (selectedRaId) {
      fetchSelectedRa();
    } else {
      // Reset if RA is deselected
      setSelectedRa(null);
      setTags([]);
      setIconName('Cpu');
      setIconColor('#888888');
      setIconBgColor('#e0e0e0');
    }
  }, [selectedRaId]);

  const handleDmsChange = (value: string | null) => {
    setSelectedRaId(value);
  };

  const handleRegister = async () => {
    if (!deviceId.trim() || !selectedRa) {
      sileo.error({
        title: "Validation Error",
        description: "Please provide a Device ID and select a Registration Authority."
      });
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

      await registerDevice(payload);

      sileo.success({
        title: "Device Registered",
        description: `Device with ID "${deviceId}" has been successfully registered.`
      });
      onDeviceRegistered();
      onOpenChange(false);

    } catch (err: any) {
      sileo.error({
        title: "Registration Failed",
        description: err.message
      });
    } finally {
      setIsSubmitting(false);
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
              <DmsSelector
                value={selectedRaId}
                onChange={handleDmsChange}
                disabled={isSubmitting || isLoadingRa}
                showAllOption={false}
                placeholder="Select a Registration Authority..."
                loadOnMount={isOpen}
              />
              {isLoadingRa && (
                <p className="text-xs text-muted-foreground">Loading RA details...</p>
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
            <Button onClick={handleRegister} disabled={isSubmitting || isLoadingRa || !deviceId || !selectedRa}>
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
