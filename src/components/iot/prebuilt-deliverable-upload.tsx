// src/components/iot/prebuilt-deliverable-upload.tsx
"use client";

import React from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from '@/hooks/use-toast';
import { FileUpload } from '@/components/iot/file-upload';
import { uploadPrebuiltDeliverable } from '@/lib/iot-api';

interface PrebuiltDeliverableUploadProps {
  groupId: string;
  packName: string;
  // Non-SWU packs deliver a .tar.gz archive rather than a .swu; only the wording and the endpoint
  // differ, so both share this panel.
  isNonSwu?: boolean;
  // Called after a successful upload — the pack is built at that point, so the caller normally
  // refetches it and closes the dialog.
  onUploaded?: () => void;
  // A built version already has a deliverable and cannot take another (the backend answers 409).
  // Passing it renders the reason instead of a dropzone that could only fail.
  isBuilt?: boolean;
  builtVersion?: string;
}

/**
 * The "I already built this" half of the generate dialogs: attach a finished deliverable instead of
 * assembling one here.
 *
 * It exists because assembling was the ONLY way to get a deliverable into a pack, and that made
 * hawkbit mode a dead end — it ships no swugenerator, so its build action only validates and
 * produces nothing. The only way through was to build the file by hand in a terminal and push it
 * straight to hawkBit, bypassing this app entirely.
 *
 * The panel is deliberately blunt about what it does not do: these bytes reach the device exactly as
 * uploaded. Nothing here signs or encrypts them, and the pack's security metadata stays empty
 * because this app applied none — a signature it never produced is not one it can claim.
 */
export const PrebuiltDeliverableUpload: React.FC<PrebuiltDeliverableUploadProps> = ({
  groupId,
  packName,
  isNonSwu = false,
  onUploaded,
  isBuilt = false,
  builtVersion,
}) => {
  const { user } = useAuth();
  const kindLabel = isNonSwu ? 'package' : '.swu';

  const handleUpload = async (file: File): Promise<boolean> => {
    try {
      await uploadPrebuiltDeliverable({
        groupId,
        packName,
        file,
        isNonSwu,
        user: user?.profile?.sub || '',
      });
      toast({
        title: 'Deliverable attached',
        description: `${file.name} is now this version's deliverable — the pack is built and can be launched.`,
      });
      onUploaded?.();
      return true;
    } catch (err: any) {
      toast({
        title: 'Upload failed',
        description: err.message || 'An error occurred.',
        variant: 'destructive',
      });
      return false;
    }
  };

  // Unlike the build tab, this cannot replace an existing deliverable. That is not an arbitrary
  // restriction: hawkBit's software module accepts exactly one artifact and refuses a second, so
  // "replace" is not an operation both backends can offer. Say so rather than fail on drop.
  if (isBuilt) {
    return (
      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>This version already has a deliverable</AlertTitle>
        <AlertDescription>
          Version {builtVersion ? <span className="font-mono">{builtVersion}</span> : 'this version'} is
          built, and a built version is immutable — devices may already be running it. Create a new
          version to attach a different file.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <FileUpload
        label={`Upload a pre-built ${kindLabel}`}
        onFileUpload={handleUpload}
        // Firmware images are routinely larger than the component's 50MB default.
        maxFileSize={2 * 1024 * 1024 * 1024}
      />

      <Alert>
        <Info className="h-4 w-4" />
        <AlertTitle>Delivered to devices unchanged</AlertTitle>
        <AlertDescription>
          <p>
            This file is stored and served exactly as uploaded — it is not repacked, signed or
            encrypted here, so it must already be in the form your devices accept. A device that
            verifies signatures will reject it unless it was signed with a key that device trusts.
          </p>
          <p className="mt-2">
            Uploading marks this version <span className="font-medium">built</span>, and a built
            version is immutable: to change the deliverable afterwards, create a new version.
          </p>
        </AlertDescription>
      </Alert>
    </div>
  );
};
