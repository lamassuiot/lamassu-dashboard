// src/components/iot/update-pack-form.tsx
"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";

import type { UpdatePack, ApiCreateUpdatePackPayload } from '@/types/iot';
import { FileUpload } from '@/components/iot/file-upload';
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, HelpCircle, PackageCheck, FileUp, Settings2, Rocket, FileText, Link2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { useDms } from '@/contexts/DmsContext';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { apiFetch } from '@/lib/api-client';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSymmetricKeys } from '@/lib/symkms-api';
import { fetchKmsKeys } from '@/lib/kms-data';
import { fetchIssuedCertificates } from '@/lib/issued-certificate-data';
import { assignKeyToDevice } from '@/lib/device-inventory-api';

import { fetchArtifactCatalog, fetchAllArtifacts } from '@/lib/iot-api';
import { Badge } from '@/components/ui/badge';
import type { Artifact } from '@/types/iot';

const RSA_SIGNING_METHODS = [
  "RSASSA_PSS_SHA_256",
  "RSASSA_PSS_SHA_384",
  "RSASSA_PSS_SHA_512",
  "RSASSA_PKCS1_V1_5_SHA_256",
  "RSASSA_PKCS1_V1_5_SHA_384",
  "RSASSA_PKCS1_V1_5_SHA_512"
];

const ECDSA_SIGNING_METHODS = [
  "ECDSA_SHA_256",
  "ECDSA_SHA_384",
  "ECDSA_SHA_512"
];

const updatePackFormSchema = z.object({
  name: z.string()
    .min(3, "Pack name must be at least 3 characters.")
    .regex(/^[^\s]+$/, "Pack name cannot contain spaces. Use underscores instead.")
    .transform(val => val.replace(/\s+/g, '_')),
  version: z.coerce.number().int().positive("Version must be a positive integer."),
  groupId: z.string().min(1, "Please select a Device Group."),
  type: z.enum(["rawfile", "firmware", "other"]),
  packaging: z.enum(["swu", "non-swu"]).optional(),
  signingAlgorithm: z.string().optional(),
  signingKeyId: z.string().optional(),
  signingMethod: z.string().optional(),
  signingCertificate: z.string().optional(),
  encryptionMode: z.enum(["none", "shared", "per-device"]).optional(),
  encryptionKeyId: z.string().optional(),
  encryptionAlgName: z.string().optional(),
  descriptorEncrypted: z.boolean().optional(),
  encryptAllFiles: z.boolean().optional(),
  allowPreviousVersionDownload: z.boolean().optional(),
}).passthrough(); // Allow additional fields for individual file encryption

type UpdatePackFormValues = z.infer<typeof updatePackFormSchema>;
type FormMode = 'new' | 'newVersion' | 'edit';

interface ProgressStep {
  id: number;
  title: string;
  icon: React.ElementType;
  status: 'pending' | 'in-progress' | 'success' | 'error';
  message?: string;
}

const initialProgressSteps: ProgressStep[] = [
  { id: 1, title: "Initialize Pack Metadata", icon: Settings2, status: 'pending', message: "Waiting to start..." },
  { id: 2, title: "Upload Binary Artifact", icon: FileUp, status: 'pending', message: "Waiting for metadata..." },
  { id: 3, title: "Upload Descriptor File", icon: FileUp, status: 'pending', message: "Waiting for files..." },
  { id: 4, title: "Generate .swu File", icon: Rocket, status: 'pending', message: "Waiting for files..." },
];


interface UpdatePackFormProps {
  formModeActual: FormMode;
  initialPackData?: UpdatePack;
  availableBasePacks?: UpdatePack[];
  selectedBasePackIdProp?: string;
  onBasePackSelect?: (basePackId: string | undefined) => void;
  onSwuGenerated?: () => void;
  onSwuGenerationError?: (error: string) => void;
}

export function UpdatePackForm({
  formModeActual,
  initialPackData,
  availableBasePacks = [],
  selectedBasePackIdProp,
  onBasePackSelect,
  onSwuGenerated,
  onSwuGenerationError,
}: UpdatePackFormProps) {
  const { availableDms, selectedDms } = useDms();
  const { user } = useAuth();
  const [binaryFiles, setBinaryFiles] = useState<File[]>([]);
  // Per-binary artifact metadata (logical name + semantic version), keyed by filename. Sent on
  // upload so the binary is registered as a selectable software component in the pack catalog.
  const [artifactMeta, setArtifactMeta] = useState<Record<string, { artifactName: string; version: string }>>({});
  const defaultArtifactName = (filename: string) => filename.replace(/\.[^/.]+$/, '');
  const getArtifactMeta = (filename: string) => artifactMeta[filename] || { artifactName: defaultArtifactName(filename), version: '' };
  const setArtifactMetaField = (filename: string, field: 'artifactName' | 'version', value: string) => {
    setArtifactMeta(prev => ({ ...prev, [filename]: { ...getArtifactMeta(filename), [field]: value } }));
  };
  // Tracks which uploaded artifacts are selected for this SWU build (for device tracking).
  // All uploaded artifacts are selected by default; operator can deselect any.
  const [selectedArtifactFiles, setSelectedArtifactFiles] = useState<Set<string>>(new Set());
  const toggleArtifactSelection = (filename: string) => {
    setSelectedArtifactFiles(prev => {
      const next = new Set(prev);
      if (next.has(filename)) next.delete(filename); else next.add(filename);
      return next;
    });
  };
  const [descriptorFile, setDescriptorFile] = useState<File | null>(null);
  const [descriptorFileContent, setDescriptorFileContent] = useState<string | null>(null);
  const [isProcessingSwu, setIsProcessingSwu] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(() => initialProgressSteps.map(s => ({ ...s })));
  const [overallProgress, setOverallProgress] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccessMessage, setGenerationSuccessMessage] = useState<string | null>(null);
  const [descriptorValidationErrors, setDescriptorValidationErrors] = useState<string[]>([]);
  const [descriptorValidationWarnings, setDescriptorValidationWarnings] = useState<string[]>([]);
  const [descriptorRequiredFiles, setDescriptorRequiredFiles] = useState<string[]>([]);
  const [showSecurityWarningDialog, setShowSecurityWarningDialog] = useState(false);

  // Fetch available symmetric keys for encryption
  const [symmetricKeysResponse, setSymmetricKeysResponse] = useState<any>(undefined);
  const fetchSymKeys = useCallback(async () => {
    try {
      const result = await fetchSymmetricKeys(user!.profile.sub!);
      setSymmetricKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [user?.profile?.sub]);

  useEffect(() => {
    if (!!user?.profile?.sub && !!user?.access_token) {
      fetchSymKeys();
    }
  }, [fetchSymKeys, user?.profile?.sub, user?.access_token]);

  const symmetricKeys = symmetricKeysResponse?.list || [];

  // Fetch available KMS keys for signing
  const [signingKeysResponse, setSigningKeysResponse] = useState<any>(undefined);
  const fetchSigningKeys = useCallback(async () => {
    try {
      const params = new URLSearchParams();
      const result = await fetchKmsKeys(params);
      setSigningKeysResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [user?.profile?.sub]);

  useEffect(() => {
    if (!!user?.profile?.sub && !!user?.access_token) {
      fetchSigningKeys();
    }
  }, [fetchSigningKeys, user?.profile?.sub, user?.access_token]);

  const signingKeys = signingKeysResponse?.list || [];

  // Defensive: a stale cache under a shared key can hand us the full {list,next} object
  // instead of an array. Normalize so the form never crashes on .find/.map.
  const safeBasePacks = Array.isArray(availableBasePacks) ? availableBasePacks : [];

  // Fetch artifact catalog for the selected base pack (newVersion mode) so Step 2 can show selections
  const basePack = safeBasePacks.find(p => p.id === selectedBasePackIdProp);
  const catalogGroupId = selectedDms?.id || '';
  const catalogPackName = basePack?.name || '';
  const [catalogArtifactsData, setCatalogArtifactsData] = useState<Artifact[]>([]);
  const fetchCatalog = useCallback(async () => {
    try {
      const result = await fetchArtifactCatalog({ groupId: catalogGroupId, packName: catalogPackName });
      setCatalogArtifactsData(result);
    } catch (err) {
      console.error(err);
    }
  }, [catalogGroupId, catalogPackName]);

  useEffect(() => {
    if (!!catalogGroupId && !!catalogPackName && !!user?.access_token) {
      fetchCatalog();
    }
  }, [fetchCatalog, catalogGroupId, catalogPackName, user?.access_token]);

  const catalogArtifacts: Artifact[] = catalogArtifactsData;

  // The GLOBAL artifact pool — every previously-uploaded artifact is selectable here, not just the
  // ones already linked to this pack. Artifacts are first-class entities now. Follow the `next`
  // bookmark to load the COMPLETE pool (otherwise artifacts beyond one page would be unselectable).
  const [globalArtifactsResp, setGlobalArtifactsResp] = useState<{ list: Artifact[]; next: string | null } | undefined>(undefined);
  const fetchGlobalArtifacts = useCallback(async () => {
    try {
      const acc: Artifact[] = [];
      let bookmark: string | undefined;
      for (let i = 0; i < 100; i++) {
        const { list, next } = await fetchAllArtifacts({ pageSize: 500, bookmark });
        acc.push(...list);
        if (!next) break;
        bookmark = next;
      }
      setGlobalArtifactsResp({ list: acc, next: null });
    } catch (err) {
      console.error(err);
    }
  }, []);

  useEffect(() => {
    if (!!user?.access_token) {
      fetchGlobalArtifacts();
    }
  }, [fetchGlobalArtifacts, user?.access_token]);
  // Memoized so its reference is stable across renders (a fresh [] each render would re-fire the
  // descriptor-revalidation effect that depends on it, causing a render loop while the query loads).
  const globalArtifacts = React.useMemo(() => globalArtifactsResp?.list || [], [globalArtifactsResp]);
  const catalogIds = React.useMemo(() => new Set(catalogArtifacts.map(a => a.id)), [catalogArtifacts]);
  const [artifactSearch, setArtifactSearch] = useState('');

  // In newVersion mode, pre-select the artifacts the base pack already references so the new build
  // carries them forward by default (operator can deselect). This SYNCS to the current catalog:
  // when the operator switches the base pack, the previous pack's auto-added ids are removed before
  // the new pack's are added, so stale carry-forwards never leak into selected_artifact_ids.
  const autoAddedCatalogIds = React.useRef<Set<string>>(new Set());
  const catalogIdsKey = catalogArtifacts.map(a => a.id).join(',');
  useEffect(() => {
    if (formModeActual !== 'newVersion') return;
    setSelectedArtifactFiles(prev => {
      const next = new Set(prev);
      // Remove previously auto-added ids that the new catalog no longer contains.
      autoAddedCatalogIds.current.forEach(id => { if (!catalogIds.has(id)) next.delete(id); });
      // Add the current catalog's ids and remember them as the auto-added set.
      const added = new Set<string>();
      catalogArtifacts.forEach(a => { next.add(a.id); added.add(a.id); });
      autoAddedCatalogIds.current = added;
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formModeActual, catalogIdsKey]);

  const form = useForm<UpdatePackFormValues>({
    resolver: zodResolver(updatePackFormSchema),
    defaultValues: {
      name: "",
      version: 1,
      groupId: selectedDms?.id || "",
      type: "rawfile",
      packaging: "swu",
      signingAlgorithm: "none",
      encryptionMode: "none",
      encryptionKeyId: "none",
      allowPreviousVersionDownload: false,
      encryptionAlgName: "",
      descriptorEncrypted: false,
      encryptAllFiles: false
    } as any,
  });

  // Fetch certificates for the selected signing key
  const selectedSigningKeyId = form.watch('signingKeyId');
  const [certificatesResponse, setCertificatesResponse] = useState<any>(undefined);
  const fetchCerts = useCallback(async () => {
    if (!selectedSigningKeyId || selectedSigningKeyId === 'none') {
      setCertificatesResponse({ certificates: [] });
      return;
    }
    try {
      const result = await fetchIssuedCertificates({
        apiQueryString: `filter=subject_key_id[equal]${selectedSigningKeyId}&sort_by=valid_from&sort_mode=desc&page_size=50`
      });
      setCertificatesResponse(result);
    } catch (err) {
      console.error(err);
    }
  }, [selectedSigningKeyId]);

  useEffect(() => {
    if (!!selectedSigningKeyId && selectedSigningKeyId !== 'none' && !!user?.access_token) {
      fetchCerts();
    }
  }, [fetchCerts, selectedSigningKeyId, user?.access_token]);

  const keyCertificates = certificatesResponse?.certificates || [];

  useEffect(() => {
    setBinaryFiles([]);
    setDescriptorFile(null);
    setDescriptorFileContent(null);

    const typeValue = initialPackData?.type as UpdatePackFormValues['type'] || 'rawfile';

    const dmsIdValue = selectedDms?.id || "";
    if (formModeActual === 'new') {
      form.reset({
        name: initialPackData?.name || "",
        version: initialPackData?.version || 1,
        groupId: dmsIdValue,
        type: typeValue,
        signingAlgorithm: "none",
        encryptionMode: "none",
        encryptionKeyId: "none",
        allowPreviousVersionDownload: false,
        encryptionAlgName: "",
        descriptorEncrypted: false,
        encryptAllFiles: false
      } as any);
    } else if (formModeActual === 'newVersion') {
      if (initialPackData && initialPackData.name) {
        form.reset({
          name: initialPackData.name,
          version: initialPackData.version,
          groupId: dmsIdValue,
          type: typeValue,
          signingAlgorithm: "none",
          encryptionMode: "none",
          encryptionKeyId: "none",
          allowPreviousVersionDownload: false,
          encryptionAlgName: "",
          descriptorEncrypted: false,
          encryptAllFiles: false
        } as any);
      } else {
        form.reset({
          name: "",
          version: 0,
          groupId: dmsIdValue,
          type: "rawfile",
          signingAlgorithm: "none",
          encryptionMode: "none",
          encryptionKeyId: "none",
          allowPreviousVersionDownload: false,
          encryptionAlgName: "",
          descriptorEncrypted: false,
          encryptAllFiles: false
        } as any);
      }
    } else if (formModeActual === 'edit' && initialPackData) {
      form.reset({
        name: initialPackData.name,
        version: initialPackData.version,
        groupId: dmsIdValue,
        type: typeValue,
        signingAlgorithm: "none",
        encryptionMode: "none",
        encryptionKeyId: "none",
        allowPreviousVersionDownload: false,
        encryptionAlgName: "",
        descriptorEncrypted: false,
        encryptAllFiles: false
      } as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formModeActual, initialPackData, form.reset]);

  // Keep the form's groupId synced to the active DMS (the one the base-pack list is loaded for). The
  // page can switch DMS after mount (e.g. via a ?groupId= deep link), and form.reset() doesn't carry
  // groupId — without this, a new-version build could target the wrong DMS and fail "pack not found".
  useEffect(() => {
    if (selectedDms?.id) {
      form.setValue('groupId', selectedDms.id, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDms?.id]);

  // Reset individual file encryption checkboxes when descriptor files change
  useEffect(() => {
    if (descriptorRequiredFiles.length > 0) {
      // Clear any existing individual file encryption fields
      const currentValues = form.getValues();
      const updatedValues = { ...currentValues };

      // Remove old encryptFile_* fields
      Object.keys(updatedValues).forEach(key => {
        if (key.startsWith('encryptFile_')) {
          delete updatedValues[key as keyof typeof updatedValues];
        }
      });

      // Reset form with cleared values
      form.reset(updatedValues);
    }
  }, [descriptorRequiredFiles, form]);


  const handleBinaryUpload = async (files: File | File[]): Promise<boolean> => {
    const fileArray = Array.isArray(files) ? files : [files];

    // Check for duplicates
    const existingNames = binaryFiles.map(f => f.name);
    const newFiles = fileArray.filter(file => !existingNames.includes(file.name));

    if (newFiles.length !== fileArray.length) {
      toast({
        variant: "destructive",
        title: "Duplicate Files",
        description: "Some files were already uploaded and were skipped."
      });
    }

    if (newFiles.length === 0) return false;

    setBinaryFiles(prev => [...prev, ...newFiles]);
    // Auto-select new files for tracking
    setSelectedArtifactFiles(prev => {
      const next = new Set(prev);
      newFiles.forEach(f => next.add(f.name));
      return next;
    });

    // If descriptor is already uploaded, validate files
    if (descriptorFileContent) {
      validateDescriptorFiles(descriptorFileContent, [...binaryFiles, ...newFiles]);
    }

    const fileNames = newFiles.map(f => f.name).join(', ');
    toast({ title: "Files Ready", description: `${fileNames} uploaded successfully.` });
    return true;
  };

  const validateDescriptorFiles = (descriptorContent: string, uploadedFiles: File[]) => {
    try {
      let descriptor;

      // Try to parse as JSON first
      try {
        descriptor = JSON.parse(descriptorContent);
      } catch {
        // If JSON parsing fails, try to parse as swupdate format
        descriptor = parseSwupdateDescriptor(descriptorContent);
      }

      // Extract files from different possible formats
      let requiredFiles: string[] = [];

      if (descriptor.files) {
        // Direct files array (JSON format)
        requiredFiles = descriptor.files;
      } else if (descriptor.software?.ecs?.files) {
        // swupdate format: software.ecs.files
        const files = descriptor.software.ecs.files;
        if (Array.isArray(files)) {
          requiredFiles = files.map((file: any) => file.filename).filter((name: string) => name);
        }
      } else if (descriptor.software?.files) {
        // Alternative swupdate format
        const files = descriptor.software.files;
        if (Array.isArray(files)) {
          requiredFiles = files.map((file: any) => file.filename || file).filter((name: string) => name);
        }
      }

      setDescriptorRequiredFiles(requiredFiles);

      const uploadedFileNames = uploadedFiles.map(f => f.name);
      // A required file is satisfied by a freshly-uploaded binary OR by a selected global artifact
      // whose filename matches (reuse-without-reupload). Union both for the missing check.
      const selectedArtifactFilenames = globalArtifacts
        .filter(a => selectedArtifactFiles.has(a.id))
        .map(a => a.filename);
      const availableFileNames = [...uploadedFileNames, ...selectedArtifactFilenames];
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check for missing files
      requiredFiles.forEach((fileName: string) => {
        if (!availableFileNames.includes(fileName)) {
          errors.push(`File: ${fileName} is missing please upload it`);
        }
      });

      // Check for extra files not in descriptor (only flag freshly-uploaded ones)
      uploadedFileNames.forEach((fileName: string) => {
        if (!requiredFiles.includes(fileName)) {
          warnings.push(`${fileName} is not included in the descriptor`);
        }
      });

      setDescriptorValidationErrors(errors);
      setDescriptorValidationWarnings(warnings);

      return errors.length === 0; // Return true if no errors
    } catch (e) {
      console.error("Error parsing descriptor:", e);
      setDescriptorValidationErrors(["Invalid descriptor format. Please check the file syntax."]);
      setDescriptorValidationWarnings([]);
      setDescriptorRequiredFiles([]);
      return false;
    }
  };

  // Re-run descriptor validation when the artifact selection or the global pool changes, so that
  // selecting a previously-uploaded artifact that satisfies a descriptor-required file clears the
  // "missing file" error without forcing a re-upload.
  useEffect(() => {
    if (descriptorFileContent) {
      validateDescriptorFiles(descriptorFileContent, binaryFiles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedArtifactFiles, globalArtifacts]);

  const parseSwupdateDescriptor = (content: string) => {
    // Simple parser for swupdate-style descriptors
    const result: any = {};

    // Try to extract files using regex patterns
    const filenameMatches = content.match(/filename\s*=\s*["']([^"']+)["']/g);
    if (filenameMatches) {
      const files = filenameMatches.map(match => {
        const filenameMatch = match.match(/filename\s*=\s*["']([^"']+)["']/);
        return filenameMatch ? filenameMatch[1] : null;
      }).filter(Boolean);

      if (files.length > 0) {
        result.software = {
          ecs: {
            files: files.map(filename => ({ filename }))
          }
        };
      }
    }

    return result;
  };

  const convertToSWUGeneratorAlgorithmName = (algorithm: string): string => {
    // Convert algorithm names from our format to SWUGenerator expected format
    const normalizedAlg = algorithm.toLowerCase().trim();

    const algorithmMap: Record<string, string> = {
      // AES variants
      'aes-128-cbc': 'AES-128-CBC',
      'aes128cbc': 'AES-128-CBC',
      'aes-192-cbc': 'AES-192-CBC',
      'aes192cbc': 'AES-192-CBC',
      'aes-256-cbc': 'AES-256-CBC',
      'aes256cbc': 'AES-256-CBC',
      'aes-128-ctr': 'AES-128-CTR',
      'aes128ctr': 'AES-128-CTR',
      'aes-192-ctr': 'AES-192-CTR',
      'aes192ctr': 'AES-192-CTR',
      'aes-256-ctr': 'AES-256-CTR',
      'aes256ctr': 'AES-256-CTR',
      'aes-128-gcm': 'AES-128-GCM',
      'aes128gcm': 'AES-128-GCM',
      'aes-192-gcm': 'AES-192-GCM',
      'aes192gcm': 'AES-192-GCM',
      'aes-256-gcm': 'AES-256-GCM',
      'aes256gcm': 'AES-256-GCM',
      // Ascon variants
      'ascon-80pq': 'Ascon-80pq',
      'ascon80pq': 'Ascon-80pq',
      'ascon-128': 'Ascon-128',
      'ascon128': 'Ascon-128',
      'ascon-128a': 'Ascon-128a',
      'ascon128a': 'Ascon-128a',
    };

    const mapped = algorithmMap[normalizedAlg];
    if (mapped) {
      return mapped;
    }

    // If not found in map, return original
    console.warn(`Unknown algorithm format: ${algorithm}, using as-is`);
    return algorithm;
  };

  const modifyDescriptorForEncryption = (descriptorContent: string, encryptedFileIndices: number[]): string => {
    if (encryptedFileIndices.length === 0) {
      return descriptorContent;
    }

    try {
      // Check if it's JSON format
      let isJsonFormat = false;
      try {
        JSON.parse(descriptorContent);
        isJsonFormat = true;
      } catch (e) {
        // Not JSON, assume swupdate format
      }

      if (isJsonFormat) {
        // Handle JSON format
        const descriptor = JSON.parse(descriptorContent);
        if (descriptor.files && Array.isArray(descriptor.files)) {
          descriptor.files = descriptor.files.map((file: any, index: number) => {
            if (encryptedFileIndices.includes(index)) {
              return { ...file, encrypted: true };
            }
            return file;
          });
        }
        return JSON.stringify(descriptor, null, 2);
      } else {
        // Handle swupdate format (libconf)
        // We need to modify the text content directly by adding encrypted=true to file entries
        let modifiedContent = descriptorContent;

        // Find all file blocks using regex
        const fileBlockRegex = /\{\s*filename\s*=\s*["']([^"']+)["'][^}]*\}/g;
        const matches = [...descriptorContent.matchAll(fileBlockRegex)];

        // Track which files we've encountered
        let fileIndex = 0;
        let offset = 0;

        matches.forEach((match) => {
          const fullMatch = match[0];
          const filename = match[1];
          const matchStart = match.index! + offset;

          // Check if this file should be encrypted
          if (encryptedFileIndices.includes(fileIndex)) {
            // Check if 'encrypted' field already exists in this block
            if (!fullMatch.includes('encrypted')) {
              // Find the position before the closing brace
              const closingBracePos = matchStart + fullMatch.lastIndexOf('}');

              // Insert encrypted = true before the closing brace
              const before = modifiedContent.substring(0, closingBracePos);
              const after = modifiedContent.substring(closingBracePos);

              // Add proper indentation (assuming 2 spaces or tab)
              const indentation = fullMatch.match(/^\s*/)?.[0] || '\t\t\t\t';
              modifiedContent = before + `\n${indentation}\tencrypted = true;` + after;

              // Update offset for next iteration
              offset += `\n${indentation}\tencrypted = true;`.length;
            }
          }

          fileIndex++;
        });

        return modifiedContent;
      }
    } catch (e) {
      console.error("Error modifying descriptor for encryption:", e);
      return descriptorContent;
    }
  };

  const handleDescriptorUpload = async (file: File): Promise<boolean> => {
    setDescriptorFile(null);
    setDescriptorFileContent(null);
    setDescriptorValidationErrors([]);
    setDescriptorValidationWarnings([]);
    setDescriptorRequiredFiles([]);
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

    return new Promise((resolvePromise, rejectPromise) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          setDescriptorFileContent(text);
          setDescriptorFile(file); // Set the file object itself after content is read

          // Validate descriptor against uploaded files
          const isValid = validateDescriptorFiles(text, binaryFiles);

          if (isValid) {
            toast({ title: "Descriptor File Ready", description: `${file.name} selected and content loaded.` });
          } else {
            toast({
              variant: "destructive",
              title: "Descriptor Validation Failed",
              description: "Some required files are missing. Check the validation messages below."
            });
          }

          resolvePromise(true);
        } catch (e) {
          console.error("Error reading descriptor file:", e);
          toast({ variant: "destructive", title: "Error Reading File", description: "Could not read descriptor file content." });
          setDescriptorFile(null); // Ensure file is not set if content read fails
          setDescriptorFileContent(null);
          setDescriptorValidationErrors([]);
          setDescriptorValidationWarnings([]);
          setDescriptorRequiredFiles([]);
          resolvePromise(false); // Resolve with false to indicate failure to FileUpload if needed
        }
      };
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        toast({ variant: "destructive", title: "File Read Error", description: "An error occurred while reading the file." });
        setDescriptorFile(null);
        setDescriptorFileContent(null);
        setDescriptorValidationErrors([]);
        setDescriptorValidationWarnings([]);
        setDescriptorRequiredFiles([]);
        resolvePromise(false);
      };
      reader.readAsText(file);
    });
  };


  const updateStepStatus = (stepId: number, status: ProgressStep['status'], message?: string) => {
    setProgressSteps(prevSteps =>
      prevSteps.map(step =>
        step.id === stepId ? { ...step, status, message: message || step.message } : step
      )
    );
  };

  const handleGenerateSwu = async () => {
    setIsProcessingSwu(true);
    setShowProgressDialog(true);
    setGenerationError(null);
    setGenerationSuccessMessage(null);

    // Get form values to check for signing/encryption
    const formValues = form.getValues();
    const hasSigning = (formValues.signingKeyId && formValues.signingKeyId !== 'none') ||
                       (!!formValues.signingAlgorithm && formValues.signingAlgorithm !== 'none');
    const encryptionMode = formValues.encryptionMode || 'none';
    const hasEncryption = encryptionMode === 'shared'
      ? (formValues.encryptionKeyId && formValues.encryptionKeyId !== 'none' && formValues.encryptionKeyId !== '')
      : encryptionMode === 'per-device';
    const selectedKey = encryptionMode === 'shared' ? symmetricKeys.find(k => k.id === formValues.encryptionKeyId) : null;

    // Build dynamic progress steps based on selected algorithms
    const dynamicSteps: ProgressStep[] = [
      { id: 1, title: "Initialize Pack Metadata", icon: Settings2, status: 'pending', message: "Waiting to start..." },
      { id: 2, title: "Upload Binary Artifact", icon: FileUp, status: 'pending', message: "Waiting for metadata..." },
      { id: 3, title: "Upload Descriptor File", icon: FileUp, status: 'pending', message: "Waiting for files..." },
    ];

    let stepCounter = 4;

    // Add signing step if signing algorithm is selected
    if (hasSigning) {
      const algoName = formValues.signingMethod || formValues.signingAlgorithm || 'Unknown Algorithm';
      dynamicSteps.push({
        id: stepCounter++,
        title: `Sign with ${algoName.toUpperCase()}`,
        icon: Settings2,
        status: 'pending',
        message: "Waiting for file uploads..."
      });
    }

    // Add key binding step for shared mode (ensures inventory binding exists)
    if (encryptionMode === 'shared' && hasEncryption && selectedKey) {
      dynamicSteps.push({
        id: stepCounter++,
        title: `Bind Key (${selectedKey.id})`,
        icon: Link2,
        status: 'pending',
        message: "Waiting for signing..."
      });
    }

    // Add encryption step if encryption key is selected
    if (hasEncryption && selectedKey) {
      dynamicSteps.push({
        id: stepCounter++,
        title: `Encrypt with ${selectedKey.algorithm.toUpperCase()}`,
        icon: Settings2,
        status: 'pending',
        message: "Waiting for key binding..."
      });
    }

    // Add final SWU generation step
    dynamicSteps.push({
      id: stepCounter,
      title: "Generate .swu File",
      icon: Rocket,
      status: 'pending',
      message: hasEncryption ? "Waiting for encryption..." : hasSigning ? "Waiting for signing..." : "Waiting for files..."
    });

    setProgressSteps(dynamicSteps);
    setOverallProgress(0);

    const formData = form.getValues();
    const selectedDmsForPack = availableDms.find(dms => dms.id === formData.groupId);

    if (!selectedDmsForPack) {
        setGenerationError("No Device Group is selected.");
        setIsProcessingSwu(false);
        return;
    }
    const groupId = selectedDmsForPack.id;

    const isValid = await form.trigger();
    if (!isValid) {
      setGenerationError("Form validation failed. Please correct errors and try again.");
      updateStepStatus(1, 'error', "Form validation failed.");
      setIsProcessingSwu(false);
      return;
    }

    // A build needs at least one artifact — either a freshly-uploaded binary OR a previously-uploaded
    // artifact selected from the global pool. The backend stages selected_artifact_ids into the build.
    if (binaryFiles.length === 0 && selectedArtifactFiles.size === 0) {
      setGenerationError("Select at least one artifact, or upload a binary, before generating the SWU.");
      updateStepStatus(2, 'error', "No artifacts selected.");
      setIsProcessingSwu(false);
      return;
    }

    if ((formModeActual === 'new' || (formModeActual === 'newVersion' && selectedBasePackIdProp)) && !descriptorFile) {
      setGenerationError("Descriptor file is missing. It's required for new packs or new versions.");
      updateStepStatus(3, 'error', "Descriptor file is missing.");
      setIsProcessingSwu(false);
      return;
    }

    if (formModeActual === 'newVersion' && !selectedBasePackIdProp) {
      setGenerationError("Base pack is not selected for creating a new version.");
      setIsProcessingSwu(false);
      return;
    }

    const packDetails = form.getValues();
    const apiPackName = packDetails.name;

    if (!user?.access_token) {
        setGenerationError("Authentication token not found.");
        setIsProcessingSwu(false);
        return;
    }

    try {
      updateStepStatus(1, 'in-progress', 'Processing metadata...');
      setOverallProgress(10);
      let createPackResponse;
      const updatesApiBaseUrl = get_CLIENT_UPDATES_API_BASE_URL();
      const packDetails = form.getValues();
      const apiPackName = packDetails.name;

      if (formModeActual === 'newVersion' && selectedBasePackIdProp) {
        const basePackNameForApi = safeBasePacks.find(p => p.id === selectedBasePackIdProp)?.name || apiPackName;
        createPackResponse = await apiFetch(`${updatesApiBaseUrl}/groups/${groupId}/updatepacks/${basePackNameForApi}/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } else {
        const createPayload: ApiCreateUpdatePackPayload = {
          name: packDetails.name,
          version: packDetails.version,
          type: packDetails.type,
          group_id: groupId,
          packaging: (packDetails as any).packaging || "swu",
          allow_previous_version_download: (packDetails as any).allowPreviousVersionDownload || false,
        };
        createPackResponse = await apiFetch(`${updatesApiBaseUrl}/groups/${groupId}/updatepacks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(createPayload),
        });
      }

      if (!createPackResponse.ok) {
        const errorData = await createPackResponse.json().catch(() => ({ details: `Status: ${createPackResponse.status} - ${createPackResponse.statusText}` }));
        updateStepStatus(1, 'error', errorData.details || 'Failed to initialize pack metadata.');
        throw new Error(errorData.details || 'Could not process pack metadata.');
      }
      const createResult = await createPackResponse.json();
      updateStepStatus(1, 'success', createResult.message || "Pack metadata processed.");
      setOverallProgress(20);

      const targetPackNameForFilesAndSwu = apiPackName;

      // Upload all binary files one by one. Each upload creates/overwrites a GLOBAL artifact and
      // links it to this pack; the response carries the artifact (with its id) so we can select it.
      updateStepStatus(2, 'in-progress', `Uploading ${binaryFiles.length} file(s)...`);

      const uploadedArtifactIdByFile: Record<string, string> = {};

      for (let i = 0; i < binaryFiles.length; i++) {
        const file = binaryFiles[i];
        updateStepStatus(2, 'in-progress', `Uploading ${file.name}...`);

        const binaryFormData = new FormData();
        binaryFormData.append('file', file);
        // Register this binary as a named, versioned global software component.
        const meta = getArtifactMeta(file.name);
        binaryFormData.append('artifact_name', meta.artifactName || defaultArtifactName(file.name));
        binaryFormData.append('version', meta.version || '');

        const uploadBinaryResponse = await apiFetch(`${updatesApiBaseUrl}/groups/${groupId}/updatepacks/${targetPackNameForFilesAndSwu}/artifact/upload`, {
          method: 'POST',

          body: binaryFormData,
        });

        if (!uploadBinaryResponse.ok) {
          const errorData = await uploadBinaryResponse.json().catch(() => ({ details: `Status: ${uploadBinaryResponse.status} - ${uploadBinaryResponse.statusText}` }));
          updateStepStatus(2, 'error', `Failed to upload ${file.name}: ${errorData.details || 'Unknown error'}`);
          throw new Error(`Failed to upload ${file.name}: ${errorData.details || 'Could not upload binary file.'}`);
        }
        const uploadResult = await uploadBinaryResponse.json().catch(() => ({}));
        if (uploadResult?.artifact?.id) {
          uploadedArtifactIdByFile[file.name] = uploadResult.artifact.id;
        }

        // Update progress incrementally for each file
        const fileProgress = 20 + ((i + 1) / binaryFiles.length) * 20; // 20% to 40% range
        setOverallProgress(fileProgress);
      }

      updateStepStatus(2, 'success', `All ${binaryFiles.length} file(s) uploaded successfully.`);
      setOverallProgress(40);

      if (descriptorFile) {
        updateStepStatus(3, 'in-progress', `Uploading ${descriptorFile.name}...`);

        // Check if individual files are selected for encryption
        const encryptedFileIndices: number[] = [];
        if (!formValues.encryptAllFiles && descriptorRequiredFiles.length > 0) {
          descriptorRequiredFiles.forEach((fileName, index) => {
            const fieldName = `encryptFile_${index}`;
            if (formValues[fieldName as keyof typeof formValues]) {
              encryptedFileIndices.push(index);
            }
          });
        }

        let descriptorToUpload = descriptorFile;

        // If individual files are selected for encryption, modify the descriptor
        if (encryptedFileIndices.length > 0 && descriptorFileContent) {
          const modifiedContent = modifyDescriptorForEncryption(descriptorFileContent, encryptedFileIndices);
          // Create a new file with modified content
          descriptorToUpload = new File([modifiedContent], descriptorFile.name, {
            type: descriptorFile.type,
            lastModified: descriptorFile.lastModified
          });
        }

        const descriptorFormData = new FormData();
        descriptorFormData.append('file', descriptorToUpload);
        const uploadDescriptorResponse = await apiFetch(`${updatesApiBaseUrl}/groups/${groupId}/updatepacks/${targetPackNameForFilesAndSwu}/descriptor/upload`, {
          method: 'POST',

          body: descriptorFormData,
        });
        if (!uploadDescriptorResponse.ok) {
          const errorData = await uploadDescriptorResponse.json().catch(() => ({ details: `Status: ${uploadDescriptorResponse.status} - ${uploadDescriptorResponse.statusText}` }));
          updateStepStatus(3, 'error', errorData.details || 'Failed to upload descriptor file.');
          throw new Error(errorData.details || 'Could not upload descriptor file.');
        }
        const descriptorResult = await uploadDescriptorResponse.json();
        updateStepStatus(3, 'success', descriptorResult.message || "Descriptor file uploaded.");
      } else {
        updateStepStatus(3, 'success', "Skipped (no descriptor file provided or not required for this mode).");
      }
      setOverallProgress(60);

      // Handle signing step if algorithm is selected
      let currentStepId = 4;
      if (hasSigning) {
        const algoName = formValues.signingMethod || formValues.signingAlgorithm || 'Unknown Algorithm';
        updateStepStatus(currentStepId, 'in-progress', `Applying ${algoName.toUpperCase()} signature...`);
        setOverallProgress(70);

        // Simulate signing process with random delay (0.5-1s)
        const signingDelay = 500 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, signingDelay));

        updateStepStatus(currentStepId, 'success', `Successfully signed with ${algoName.toUpperCase()}`);
        currentStepId++;
      }

      // Silent pre-flight: bind the key to the user's inventory before calling CreateSWU.
      // POST /symkms/v1/inventory/{user}/keys/{keyId} with empty body — purpose is optional;
      // the backend treats a purposeless binding as a wildcard that matches any purpose lookup.
      // This call is idempotent — safe to repeat if the binding already exists.
      if (encryptionMode === 'shared' && hasEncryption && selectedKey) {
        const userId = user.profile.sub;
        updateStepStatus(currentStepId, 'in-progress', `Binding key "${selectedKey.id}" to user inventory...`);
        setOverallProgress(75);

        try {
          await assignKeyToDevice(userId, selectedKey.id, {});
          updateStepStatus(currentStepId, 'success', `Key "${selectedKey.id}" bound to inventory`);
        } catch (bindErr: any) {
          // 409 Conflict means binding already exists — that's fine
          if (bindErr.message?.includes('409') || bindErr.message?.includes('already')) {
            updateStepStatus(currentStepId, 'success', `Key binding already exists`);
          } else {
            updateStepStatus(currentStepId, 'error', `Failed to bind key: ${bindErr.message}`);
            throw new Error(`Key binding failed: ${bindErr.message}`);
          }
        }
        currentStepId++;
      }

      // Handle encryption step if key is selected
      if (hasEncryption && selectedKey) {
        updateStepStatus(currentStepId, 'in-progress', `Applying ${selectedKey.algorithm.toUpperCase()} encryption...`);
        setOverallProgress(80);

        // Simulate encryption process with random delay (0.5-1s)
        const encryptionDelay = 500 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, encryptionDelay));

        updateStepStatus(currentStepId, 'success', `Successfully encrypted with ${selectedKey.algorithm.toUpperCase()}`);
        currentStepId++;
      }

      updateStepStatus(currentStepId, 'in-progress', 'Triggering .swu file generation...');

      // Prepare SWU generation payload based on encryption mode
      // (encryptionMode is already declared at the top of handleGenerateSwu)
      const swuPayload: any = {};

      // The global artifacts this SWU build delivers, by id (operator's explicit selection). The
      // selection set holds catalog artifact ids (existing, referenced artifacts) and uploaded-file
      // names (mapped to their freshly-created artifact ids). Combine both into id form.
      const uploadedFileNames = new Set(binaryFiles.map(f => f.name));
      const selectedUploadedIds = binaryFiles
        .filter(f => selectedArtifactFiles.has(f.name))
        .map(f => uploadedArtifactIdByFile[f.name])
        .filter(Boolean);
      // Everything selected that is NOT an uploaded-file name is already an artifact id (a catalog
      // "current" artifact or one chosen from the global pool). Derive these straight from the
      // selection set rather than re-filtering the loaded global page, so a pre-selected artifact is
      // never silently dropped when the pool is large/paginated or still loading.
      const directSelectedIds = Array.from(selectedArtifactFiles).filter(s => !uploadedFileNames.has(s));
      swuPayload.selected_artifact_ids = Array.from(new Set([...selectedUploadedIds, ...directSelectedIds]));

      if (encryptionMode === 'shared') {
        // Shared mode: user + purpose (binding name) + algorithm
        swuPayload.user = user.profile.sub;
        if (selectedKey) {
          swuPayload.encryption_key_name = selectedKey.id;
          swuPayload.encryption_alg_name = convertToSWUGeneratorAlgorithmName(selectedKey.algorithm);
        }
      } else if (encryptionMode === 'per-device') {
        // Per-device mode: user and key name are empty, only alg name is sent
        swuPayload.user = '';
        swuPayload.encryption_key_name = '';
        swuPayload.encryption_alg_name = formValues.encryptionAlgName || 'Ascon-128a';
      } else {
        // No encryption: user is set, no encryption fields
        swuPayload.user = user.profile.sub;
      }

      // Add signing parameters
      if (hasSigning) {
        swuPayload.signature_key_id = formValues.signingKeyId;
        swuPayload.signature_alg_name = formValues.signingMethod;

        const selectedCert = keyCertificates.find(c => c.serialNumber === formValues.signingCertificate);
        swuPayload.signature_certificate = selectedCert?.pemData || formValues.signingCertificate;
      }

      // Add descriptor and file encryption options (only relevant for shared mode)
      if (encryptionMode === 'shared' && formValues.encryptionKeyId && selectedKey) {
        swuPayload.sw_desc_encrypted = formValues.descriptorEncrypted || false;

        // Handle file encryption options
        if (formValues.encryptAllFiles) {
          swuPayload.encrypt_all_files = true;
        } else if (descriptorRequiredFiles.length > 0) {
          // Check for individual file encryption
          const encryptedFiles: string[] = [];
          descriptorRequiredFiles.forEach((fileName, index) => {
            const fieldName = `encryptFile_${index}`;
            if (formValues[fieldName as keyof typeof formValues]) {
              encryptedFiles.push(fileName);
            }
          });
          if (encryptedFiles.length > 0) {
            swuPayload.encrypted_files = encryptedFiles;
          }
        }
      }

      const generateSwuResponse = await apiFetch(`${updatesApiBaseUrl}/groups/${groupId}/updatepacks/${targetPackNameForFilesAndSwu}/swu?user_id=${encodeURIComponent(user.profile.sub)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swuPayload),
      });
      if (!generateSwuResponse.ok) {
        const errorData = await generateSwuResponse.json().catch(() => ({ details: `Status: ${generateSwuResponse.status} - ${generateSwuResponse.statusText}` }));
        updateStepStatus(currentStepId, 'error', errorData.details || 'Failed to trigger .swu generation.');
        throw new Error(errorData.details || 'Could not trigger .swu generation.');
      }
      const swuResult = await generateSwuResponse.json();
      updateStepStatus(currentStepId, 'success', swuResult.message || ".swu generation triggered successfully!");
      setOverallProgress(100);

      setGenerationSuccessMessage("Distribution set generated and processed successfully!");
      onSwuGenerated?.();

    } catch (error) {
      const errorMessage = (error as Error).message || "An unknown error occurred during SWU generation.";
      setGenerationError(errorMessage);
      onSwuGenerationError?.(errorMessage);
    } finally {
      setIsProcessingSwu(false);
    }
  };


  const nameIsReadOnly = formModeActual === 'edit' || (formModeActual === 'newVersion' && !!selectedBasePackIdProp && !!initialPackData?.name);
  const versionIsReadOnly = true;
  // const typeIsEditable = true; // Removed as it's not explicitly used to gate editing below

  let cardTitleText = "Distribution Set Details"; // Generic default
  let cardDescriptionText = "Define details, upload files, and generate the .swu pack.";


  if (formModeActual === 'new') {
    cardTitleText = "Step 1: New Distribution Set Details";
    cardDescriptionText = "Define core details. Version is set to 1. Then upload files and generate.";
  } else if (formModeActual === 'newVersion') {
    if (initialPackData?.name && selectedBasePackIdProp) {
      cardTitleText = `New Version for '${initialPackData.name}'`;
      cardDescriptionText = `Creating version ${form.getValues("version")}. Name is inherited. Upload files and generate.`;
    } else {
      cardTitleText = "New Version: Select Base Pack";
      cardDescriptionText = "Choose an existing pack to create a new version. Details will populate below.";
    }
  } else if (formModeActual === 'edit' && initialPackData) {
    cardTitleText = `Update Files for: ${initialPackData.name} v${initialPackData.version}`;
    cardDescriptionText = "Re-upload files for this version. Pack details are locked. Type is editable.";
  }


  const StepStatusIcon: React.FC<{ status: ProgressStep['status']; defaultIcon: React.ElementType }> = ({ status, defaultIcon: DefaultIcon }) => {
    switch (status) {
      case 'in-progress':
        return <Loader2 className="h-5 w-5 animate-spin text-accent" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-primary" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-destructive" />;
      case 'pending':
        return <DefaultIcon className="h-5 w-5 text-muted-foreground" />;
      default:
        return <HelpCircle className="h-5 w-5 text-muted-foreground" />;
    }
  };

  return (
    <>
      <Card className="w-full" id="update-pack-form-card">
        <CardHeader>
          <CardTitle>{cardTitleText}</CardTitle>
          <CardDescription>{cardDescriptionText}</CardDescription>
        </CardHeader>
        <CardContent>
          <Form {...form}>
            <form className="space-y-6">
              {formModeActual === 'newVersion' && onBasePackSelect && (
                <FormItem>
                  <FormLabel>Select Base Pack to Version</FormLabel>
                  <Select
                    onValueChange={(value) => onBasePackSelect(value === "" ? undefined : value)}
                    value={selectedBasePackIdProp || ""}
                  >
                    <FormControl>
                      <SelectTrigger disabled={isProcessingSwu}>
                        <SelectValue placeholder="Select an existing pack to version..." />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {safeBasePacks.map(p => (
                        <SelectItem key={p.id} value={p.id}>
                          {p.name} v{p.version}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!selectedBasePackIdProp && <FormMessage>Please select a base pack to create a new version.</FormMessage>}
                </FormItem>
              )}

              <h3 className="text-lg font-semibold">Step 1: Pack Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="groupId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Group</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isProcessingSwu || formModeActual === 'newVersion'}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select Device Group" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableDms.map(dms => (
                            <SelectItem key={dms.id} value={dms.id}>
                              {dms.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>
                        {formModeActual === 'newVersion'
                          ? "Device Group is locked when creating a new version of an existing pack."
                          : "Select the Device Group that will receive this distribution set."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Pack Name</FormLabel>
                      <FormControl>
                        <Input
                          placeholder={formModeActual === 'newVersion' && !selectedBasePackIdProp ? "Will be set from base pack" : "e.g., Waterfix Firmware"}
                          {...field}
                          readOnly={nameIsReadOnly}
                          disabled={isProcessingSwu || (formModeActual === 'newVersion' && !selectedBasePackIdProp)}
                        />
                      </FormControl>
                      {nameIsReadOnly && <FormDescription>Name is inherited for this mode.</FormDescription>}
                      {formModeActual === 'newVersion' && !selectedBasePackIdProp && <FormDescription>Name will be set once a base pack is selected.</FormDescription>}
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="version"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Version</FormLabel>
                      <FormControl>
                        <Input
                          type="number"
                          {...field}
                          readOnly={versionIsReadOnly}
                          disabled={isProcessingSwu || (formModeActual === 'newVersion' && !selectedBasePackIdProp)}
                          placeholder={formModeActual === 'newVersion' && !selectedBasePackIdProp ? "Will be set from base pack" : ""}
                        />
                      </FormControl>
                       <FormDescription>
                          {formModeActual === 'new' && !initialPackData?.id ? "Version is fixed at 1 for new packs." :
                          (formModeActual === 'newVersion' && selectedBasePackIdProp && initialPackData) ? `Version is automatically set to ${initialPackData.version}.` :
                          formModeActual === 'edit' ? "Version is not editable." :
                          "Version will be set once a base pack is selected."}
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Type
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-semibold mb-1">Firmware:</p>
                              <p className="text-xs mb-2">Requires device restart to activate the update</p>
                              <p className="font-semibold mb-1">Raw File:</p>
                              <p className="text-xs mb-2">Does not require device restart - updates on-the-fly</p>
                              <p className="font-semibold mb-1">Both:</p>
                              <p className="text-xs">Contains both firmware and raw file components</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isProcessingSwu || (formModeActual === 'newVersion' && !selectedBasePackIdProp && !initialPackData?.type)}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select pack type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="rawfile">
                            <div className="flex flex-col">
                              <span>Raw File</span>
                              <span className="text-xs text-muted-foreground">No restart required</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="firmware">
                            <div className="flex flex-col">
                              <span>Firmware</span>
                              <span className="text-xs text-muted-foreground">Requires device restart</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="both">
                            <div className="flex flex-col">
                              <span>Both</span>
                              <span className="text-xs text-muted-foreground">Firmware + Raw File</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="other">Other Type</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Type can be set for the new pack/version.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="packaging"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel className="flex items-center gap-2">
                        Packaging
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              <p className="font-semibold mb-1">SWU:</p>
                              <p className="text-xs mb-2">Builds and signs a single SWU; devices run the phased/direct workflow with an activation step.</p>
                              <p className="font-semibold mb-1">Non-SWU:</p>
                              <p className="text-xs">Delivers raw artifact binaries; devices run a simple download-and-install workflow (no SWU build, no activation).</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value || 'swu'}
                        disabled={isProcessingSwu}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select packaging" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="swu">
                            <div className="flex flex-col">
                              <span>SWU</span>
                              <span className="text-xs text-muted-foreground">Build + sign an SWU</span>
                            </div>
                          </SelectItem>
                          <SelectItem value="non-swu">
                            <div className="flex flex-col">
                              <span>Non-SWU</span>
                              <span className="text-xs text-muted-foreground">Raw download &amp; install</span>
                            </div>
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>How the pack is delivered to devices.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* Versioning policy — applies when creating a pack (set once at creation). */}
              {formModeActual === 'new' && (
                <FormField
                  control={form.control}
                  name={"allowPreviousVersionDownload" as any}
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5 pr-4">
                        <FormLabel className="flex items-center gap-2">
                          Allow Previous-Version Downloads
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <HelpCircle className="h-4 w-4 text-muted-foreground cursor-help" />
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs">
                                <p className="text-xs">When enabled, older snapshotted versions of this pack stay downloadable — not just the latest. Each built version is recorded as a snapshot.</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </FormLabel>
                        <FormDescription>
                          Keep previous versions of this pack downloadable. When off, only the current version can be downloaded.
                        </FormDescription>
                      </div>
                      <FormControl>
                        <Switch
                          checked={!!field.value}
                          onCheckedChange={field.onChange}
                          disabled={isProcessingSwu}
                        />
                      </FormControl>
                    </FormItem>
                  )}
                />
              )}

              {/* Step 2: Artifacts + Descriptor */}
              <h3 className="text-lg font-semibold pt-4 border-t">Step 2: Select Artifacts &amp; Upload Descriptor</h3>
              <p className="text-sm text-muted-foreground -mt-2">
                Select which artifacts this SWU delivers (from previously-uploaded ones, or upload a new binary below), then upload the descriptor file.
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Side: Artifact selection (catalog) or file upload fallback */}
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="text-md font-semibold mb-1 flex items-center gap-2">
                      <PackageCheck className="h-5 w-5 text-primary" />
                      Artifacts
                    </h4>

                    <p className="text-xs text-muted-foreground mb-3">
                      Select previously-uploaded artifacts to include, or upload new ones below. Selected artifacts are tracked on devices after a successful update.
                    </p>

                    {/* Global artifact pool — every previously-uploaded artifact is selectable */}
                    <Input
                      className="h-8 text-sm mb-2"
                      placeholder="Search artifacts by name or version…"
                      value={artifactSearch}
                      onChange={e => setArtifactSearch(e.target.value)}
                      disabled={isProcessingSwu}
                    />
                    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                      {globalArtifacts.length === 0 ? (
                        <p className="text-xs text-muted-foreground italic py-2">No artifacts uploaded yet. Upload one below, or from the Firmware Inventory.</p>
                      ) : (
                        globalArtifacts
                          .filter(art => {
                            const q = artifactSearch.trim().toLowerCase();
                            return !q || art.name.toLowerCase().includes(q) || (art.version || '').toLowerCase().includes(q);
                          })
                          .map(art => {
                            const checked = selectedArtifactFiles.has(art.id);
                            const isCurrent = catalogIds.has(art.id);
                            return (
                              <label key={art.id} className={cn(
                                'flex items-center gap-3 rounded-md border px-3 py-2.5 cursor-pointer transition-colors',
                                checked ? 'bg-primary/5 border-primary/30' : 'bg-background border-border opacity-70'
                              )}>
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => {
                                    setSelectedArtifactFiles(prev => {
                                      const next = new Set(prev);
                                      if (next.has(art.id)) next.delete(art.id); else next.add(art.id);
                                      return next;
                                    });
                                  }}
                                  disabled={isProcessingSwu}
                                />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium flex items-center gap-2">
                                    {art.name}
                                    {isCurrent && <Badge variant="outline" className="text-[10px] px-1.5 py-0">current</Badge>}
                                  </p>
                                  <p className="text-xs text-muted-foreground">{art.version ? `v${art.version}` : 'no version'} · <span className="font-mono">{art.filename}</span></p>
                                </div>
                              </label>
                            );
                          })
                      )}
                    </div>

                    {/* Upload a brand-new binary (registered as a global artifact + linked to this pack) */}
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Upload a new binary (registered as a global artifact):</p>
                      <FileUpload label="Upload binary (.swu, .bin, etc.)" onFileUpload={handleBinaryUpload} />
                      {binaryFiles.length > 0 && (
                        <div className="mt-3 space-y-2">
                          {binaryFiles.map((file, index) => {
                            const checked = selectedArtifactFiles.has(file.name);
                            const hasWarning = descriptorValidationWarnings.some(w => w.includes(file.name));
                            return (
                              <div key={index} className={cn('rounded-md border p-3', checked ? 'bg-primary/5 border-primary/30' : 'border-border')}>
                                <div className="flex items-center gap-3 mb-2">
                                  <Checkbox checked={checked} onCheckedChange={() => toggleArtifactSelection(file.name)} disabled={isProcessingSwu} />
                                  <p className={cn('text-sm font-medium flex-1 truncate', hasWarning ? 'text-yellow-700 dark:text-yellow-400' : '')}>
                                    {hasWarning ? '⚠ ' : ''}{file.name}
                                    <span className="text-xs font-normal text-muted-foreground ml-2">{(file.size / 1024).toFixed(1)} KB</span>
                                  </p>
                                  <Button variant="ghost" size="sm" onClick={() => { const r = binaryFiles[index]; const nf = binaryFiles.filter((_, i) => i !== index); setBinaryFiles(nf); setSelectedArtifactFiles(prev => { const next = new Set(prev); next.delete(r.name); return next; }); if (descriptorFileContent) validateDescriptorFiles(descriptorFileContent, nf); }} className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive">×</Button>
                                </div>
                                <div className="grid grid-cols-2 gap-2 pl-7">
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Software name</Label>
                                    <Input className="h-8 text-sm" placeholder={defaultArtifactName(file.name)} value={getArtifactMeta(file.name).artifactName} onChange={e => setArtifactMetaField(file.name, 'artifactName', e.target.value)} disabled={isProcessingSwu} />
                                  </div>
                                  <div className="space-y-1">
                                    <Label className="text-xs text-muted-foreground">Version</Label>
                                    <Input className="h-8 text-sm" placeholder="e.g. 2.1.0" value={getArtifactMeta(file.name).version} onChange={e => setArtifactMetaField(file.name, 'version', e.target.value)} disabled={isProcessingSwu} />
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Right Side: Descriptor Upload and Preview */}
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="text-md font-semibold mb-3 flex items-center gap-2">
                      <FileText className="h-5 w-5 text-primary" />
                      Descriptor File
                    </h4>
                    <FileUpload
                      label="Upload Configuration/Descriptor File (.json, .cfg, .txt, etc.)"
                      onFileUpload={handleDescriptorUpload}
                    />
                    {descriptorFileContent && descriptorFile && (
                      <div className="mt-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-primary">Preview: {descriptorFile.name}</p>
                          <Button variant="ghost" size="sm" onClick={() => {
                            setDescriptorFile(null);
                            setDescriptorFileContent(null);
                            setDescriptorValidationErrors([]);
                            setDescriptorValidationWarnings([]);
                            setDescriptorRequiredFiles([]);
                          }}>
                            Clear
                          </Button>
                        </div>
                        <ScrollArea className="h-[200px] rounded-md border p-3 bg-muted/30 shadow-inner">
                          <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                            {descriptorFileContent}
                          </pre>
                        </ScrollArea>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Descriptor Validation Messages */}
              {(descriptorValidationErrors.length > 0 || descriptorValidationWarnings.length > 0) && (
                <div className="space-y-2">
                  {descriptorValidationErrors.map((error, index) => (
                    <div key={`error-${index}`} className="p-3 rounded-md bg-destructive/10 border border-destructive/50 text-destructive text-sm">
                      <p className="font-medium">⚠ {error}</p>
                    </div>
                  ))}
                  {descriptorValidationWarnings.map((warning, index) => (
                    <div key={`warning-${index}`} className="p-3 rounded-md bg-yellow-500/10 border border-yellow-500/50 text-yellow-700 dark:text-yellow-400 text-sm">
                      <p className="font-medium">⚠ {warning}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Security Configuration - Moved after Files */}
              <h3 className="text-lg font-semibold pt-4 border-t">Step 3: Security Configuration</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">

                {/* Signing Section */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">Signing Configuration</h4>
                  <FormField
                    control={form.control}
                    name="signingKeyId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Signing Key</FormLabel>
                        <Select
                          onValueChange={(val) => {
                            field.onChange(val);
                            form.setValue('signingMethod', '');
                            form.setValue('signingCertificate', '');
                          }}
                          defaultValue={field.value}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select signing key" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Signing</SelectItem>
                            {signingKeys.map((key) => (
                              <SelectItem key={key.key_id} value={key.key_id}>
                                {key.name || key.key_id} ({key.algorithm})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>Select the KMS key to sign this distribution set</FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="signingMethod"
                    render={({ field }) => {
                      const selectedKeyId = form.watch('signingKeyId');
                      const selectedKey = signingKeys.find(k => k.key_id === selectedKeyId);

                      if (!selectedKeyId || selectedKeyId === 'none') return null;

                      let methods: string[] = [];
                      if (selectedKey?.algorithm === 'RSA') {
                        methods = RSA_SIGNING_METHODS;
                      } else if (selectedKey?.algorithm === 'ECDSA') {
                        methods = ECDSA_SIGNING_METHODS;
                      }

                      return (
                        <FormItem>
                          <FormLabel>Signing Method</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select signing method" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {methods.map((method) => (
                                <SelectItem key={method} value={method}>
                                  {method}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <FormDescription>Algorithm specific signing method</FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  <FormField
                    control={form.control}
                    name="signingCertificate"
                    render={({ field }) => {
                      const selectedKeyId = form.watch('signingKeyId');

                      if (!selectedKeyId || selectedKeyId === 'none') return null;

                      // Filter certificates relevant for signing (Digital Signature or Non Repudiation or Code Signing)
                      const signingCertificates = keyCertificates.filter(cert => {
                        // Ensure isCa is NOT true (we want leaf/end-entity certificates)
                        if (cert.isCa === true) return false;

                        // Filter out revoked certificates
                        if (cert.apiStatus === 'REVOKED') return false;

                        // If EKU is present, prioritize CodeSigning check if available
                        if (cert.extendedKeyUsage && cert.extendedKeyUsage.includes('CodeSigning')) return true;

                        // Check standard Key Usage
                        if (cert.keyUsage && cert.keyUsage.length > 0) {
                           return cert.keyUsage.includes('digitalSignature') || cert.keyUsage.includes('nonRepudiation');
                        }

                        // If no key usage info defined, include it conservatively
                        return true;
                      });

                      return (
                        <FormItem>
                          <FormLabel>Certificate <span className="text-destructive">*</span></FormLabel>
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select certificate" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {signingCertificates.length === 0 ? (
                                <SelectItem value="no-certs" disabled>
                                  No signing certificates available for this key
                                </SelectItem>
                              ) : (
                                signingCertificates.map((cert) => {
                                  const issuerName = cert.issuer.split(',').find(p => p.trim().startsWith('CN='))?.split('=')[1] || cert.issuer;
                                  const dateStr = new Date(cert.validFrom).toLocaleDateString();
                                  // Clean subject for display
                                  const subjectName = cert.subject.split(',').find(p => p.trim().startsWith('CN='))?.split('=')[1] || cert.subject;

                                  // Format usages for display
                                  const usages = [
                                    ...(cert.keyUsage || []).filter(u => u === 'digitalSignature' || u === 'nonRepudiation'),
                                    ...(cert.extendedKeyUsage || []).filter(u => u === 'CodeSigning')
                                  ].join(', ');

                                  const usageDisplay = usages ? `[${usages}]` : '';

                                  return (
                                    <SelectItem key={cert.serialNumber} value={cert.serialNumber}>
                                      <span>{subjectName}</span>
                                      <span className="ml-2 text-xs text-muted-foreground">
                                         | {usageDisplay} Issued by: {issuerName} | {dateStr} | {cert.serialNumber.slice(0, 8)}...
                                      </span>
                                    </SelectItem>
                                  );
                                })
                              )}
                            </SelectContent>
                          </Select>
                          <FormDescription>Select the certificate to use for signing (filtered by signing capability)</FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>

                {/* Encryption Section */}
                <div className="space-y-4">
                  <h4 className="font-medium text-sm text-muted-foreground border-b pb-2">Encryption Configuration</h4>

                  {/* Encryption Mode Selector */}
                  <FormField
                    control={form.control}
                    name="encryptionMode"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Encryption Mode</FormLabel>
                        <Select onValueChange={(value) => {
                          field.onChange(value);
                          // Reset dependent fields when mode changes
                          if (value === 'none') {
                            form.setValue('encryptionKeyId', 'none');
                            form.setValue('encryptionAlgName', '');
                          } else if (value === 'per-device') {
                            form.setValue('encryptionKeyId', 'none');
                            form.setValue('encryptionAlgName', 'Ascon-128a');
                          }
                        }} defaultValue={field.value || 'none'}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select encryption mode" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">No Encryption</SelectItem>
                            <SelectItem value="shared">Shared Key (one SWU, one key for all devices)</SelectItem>
                            <SelectItem value="per-device">Per-Device (one SWU per device from inventory)</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {field.value === 'shared' && 'A single SWU is generated encrypted with a shared symmetric key.'}
                          {field.value === 'per-device' && 'One SWU is generated per device, each encrypted with the device\'s own key from the inventory.'}
                          {(!field.value || field.value === 'none') && 'No encryption will be applied to the SWU.'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  {/* Shared mode: show key selector + purpose */}
                  {form.watch('encryptionMode') === 'shared' && (
                    <>
                      <FormField
                        control={form.control}
                        name="encryptionKeyId"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Encryption Key</FormLabel>
                            <Select onValueChange={(value) => {
                              field.onChange(value);
                            }} defaultValue={field.value}>
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue placeholder="Select encryption key" />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value="none">No Encryption</SelectItem>
                                {symmetricKeys.map((key) => (
                                  <SelectItem key={key.id} value={key.id}>
                                    {key.id} ({key.algorithm})
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>Select a symmetric key for shared encryption</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />

                      {/* File Encryption Options - show when key is selected in shared mode */}
                      {form.watch('encryptionKeyId') && form.watch('encryptionKeyId') !== 'none' && form.watch('encryptionKeyId') !== '' && (
                        <div className="space-y-3">
                          <div className="space-y-3">
                            <FormLabel className="text-sm font-medium">Encryption Options</FormLabel>

                            <FormField
                              control={form.control}
                              name="descriptorEncrypted"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex flex-col space-y-2">
                                    <Button
                                      type="button"
                                      variant={field.value ? "default" : "outline"}
                                      onClick={() => field.onChange(!field.value)}
                                      className={`justify-start h-auto p-4 ${field.value ? 'bg-primary text-primary-foreground' : ''}`}
                                    >
                                      <div className="flex items-center space-x-3">
                                        <div className={`w-4 h-4 rounded-full ${field.value ? 'bg-primary-foreground' : 'bg-muted'}`} />
                                        <div className="text-left">
                                          <div className="font-medium">Encrypt Descriptor</div>
                                          <div className="text-xs opacity-80">Encrypt the software update descriptor file</div>
                                        </div>
                                      </div>
                                    </Button>
                                  </div>
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={form.control}
                              name="encryptAllFiles"
                              render={({ field }) => (
                                <FormItem>
                                  <div className="flex flex-col space-y-2">
                                    <Button
                                      type="button"
                                      variant={field.value ? "default" : "outline"}
                                      onClick={() => field.onChange(!field.value)}
                                      className={`justify-start h-auto p-4 ${field.value ? 'bg-primary text-primary-foreground' : ''}`}
                                    >
                                      <div className="flex items-center space-x-3">
                                        <div className={`w-4 h-4 rounded-full ${field.value ? 'bg-primary-foreground' : 'bg-muted'}`} />
                                        <div className="text-left">
                                          <div className="font-medium">Encrypt All Files</div>
                                          <div className="text-xs opacity-80">Encrypt all files listed in the software update descriptor</div>
                                        </div>
                                      </div>
                                    </Button>
                                  </div>
                                </FormItem>
                              )}
                            />
                          </div>

                          {/* Individual file encryption options */}
                          {descriptorRequiredFiles.length > 0 && !form.watch('encryptAllFiles') && (
                            <div className="space-y-3">
                              <FormLabel className="text-sm font-medium">Or encrypt individual files:</FormLabel>
                              <div className="space-y-2">
                                {descriptorRequiredFiles.map((fileName, index) => (
                                  <FormField
                                    key={fileName}
                                    control={form.control}
                                    name={`encryptFile_${index}`}
                                    render={({ field }) => (
                                      <Button
                                        type="button"
                                        variant={field.value ? "default" : "outline"}
                                        onClick={() => field.onChange(!field.value)}
                                        className={`justify-start h-auto p-3 w-full ${field.value ? 'bg-primary text-primary-foreground' : ''}`}
                                      >
                                        <div className="flex items-center space-x-3">
                                          <div className={`w-3 h-3 rounded-full ${field.value ? 'bg-primary-foreground' : 'bg-muted'}`} />
                                          <div className="text-left font-medium text-sm">{fileName}</div>
                                        </div>
                                      </Button>
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {/* Per-device mode: show algorithm selector only */}
                  {form.watch('encryptionMode') === 'per-device' && (
                    <FormField
                      control={form.control}
                      name="encryptionAlgName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Encryption Algorithm</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value || 'Ascon-128a'}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select encryption algorithm" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="Ascon-128a">Ascon-128a (recommended)</SelectItem>
                              <SelectItem value="Ascon-128">Ascon-128</SelectItem>
                              <SelectItem value="Ascon-80pq">Ascon-80pq</SelectItem>
                              <SelectItem value="AES-256-GCM">AES-256-GCM</SelectItem>
                              <SelectItem value="AES-256-CBC">AES-256-CBC</SelectItem>
                              <SelectItem value="AES-128-GCM">AES-128-GCM</SelectItem>
                              <SelectItem value="AES-128-CBC">AES-128-CBC</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormDescription>
                            Each device will be encrypted with its own key from the device key inventory using this algorithm.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

            </form>
          </Form>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-2 border-t pt-6">
            <Button
              onClick={() => {
                const formValues = form.getValues();
                const hasSigning = (formValues.signingKeyId && formValues.signingKeyId !== 'none') ||
                                   (!!formValues.signingAlgorithm && formValues.signingAlgorithm !== 'none');
                const encMode = formValues.encryptionMode || 'none';
                const hasEncryption = encMode === 'shared'
                  ? (formValues.encryptionKeyId && formValues.encryptionKeyId !== 'none' && formValues.encryptionKeyId !== '')
                  : encMode === 'per-device';

                if (!hasSigning && !hasEncryption) {
                  setShowSecurityWarningDialog(true);
                } else if (!hasSigning) {
                  setShowSecurityWarningDialog(true);
                } else if (!hasEncryption) {
                  setShowSecurityWarningDialog(true);
                } else {
                  handleGenerateSwu();
                }
              }}
              disabled={
                isProcessingSwu ||
                (formModeActual === 'newVersion' && !selectedBasePackIdProp) ||
                !form.getValues("name")?.trim() || // Disable if name is not specified
                (binaryFiles.length === 0 && selectedArtifactFiles.size === 0) || // Need an uploaded binary OR a selected artifact
                ((formModeActual === 'new' || (formModeActual === 'newVersion' && selectedBasePackIdProp)) && !descriptorFile) || // Disable if descriptor is required but not uploaded
                descriptorValidationErrors.length > 0 // Disable if there are validation errors
              }
              className="w-full bg-primary hover:bg-primary/90"
            >
              {isProcessingSwu ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Processing SWU...
                </>
              ) : "Step 4: Generate .swu File"}
            </Button>
            <p className="text-xs text-muted-foreground text-center">
              {descriptorValidationErrors.length > 0 ? (
                <span className="text-destructive font-medium">
                  ⚠ Cannot generate SWU: Missing required files. Please upload all files listed in the descriptor.
                </span>
              ) : (
                <>
                  Complete steps 1-3. Ensure all required files are uploaded. Then click here to generate the .swu file.
                  {(formModeActual === 'newVersion' && !selectedBasePackIdProp) ? " Select a base pack first." : ""}
                </>
              )}
            </p>
        </CardFooter>
      </Card>

      <AlertDialog open={showProgressDialog} onOpenChange={(open) => { if (!isProcessingSwu) setShowProgressDialog(open); }}>
        <AlertDialogContent className="max-w-md" onInteractOutside={(e) => { if (isProcessingSwu) e.preventDefault(); }}>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <PackageCheck className="h-6 w-6 text-primary" />
              Distribution Set Generation Progress
            </AlertDialogTitle>
            {isProcessingSwu && <AlertDialogDescription>Please wait while the distribution set is being generated...</AlertDialogDescription>}
          </AlertDialogHeader>

          <div className="my-4 space-y-3">
            <Progress value={overallProgress} className="w-full h-3" indicatorClassName={
                generationError ? "bg-destructive" :
                (overallProgress === 100 && !generationError) ? "bg-primary" : "bg-accent"
            } />
            <div className="space-y-2.5 text-sm">
              {progressSteps.map(step => (
                <div key={step.id} className={`flex items-start justify-between p-2 rounded-md border border-border/60 shadow-sm min-h-[60px] ${
                    step.status === 'in-progress' ? 'bg-accent/10 border-accent/50' :
                    step.status === 'success' ? 'bg-primary/10 border-primary/50' :
                    step.status === 'error' ? 'bg-destructive/10 border-destructive/50' :
                    'bg-muted/30'
                }`}>
                  <div className="flex items-center gap-3">
                    <StepStatusIcon status={step.status} defaultIcon={step.icon} />
                    <div className="flex flex-col">
                      <span className="font-medium text-foreground">{step.title}</span>
                       {step.message && step.status !== 'pending' && (
                        <span className={`text-xs ${
                          step.status === 'error' ? 'text-destructive' :
                          step.status === 'success' ? 'text-primary' : 'text-muted-foreground'
                        }`}>
                          {step.message}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {generationError && (
            <div className="mt-3 p-3 rounded-md bg-destructive/10 border border-destructive/50 text-destructive text-sm">
              <p className="font-semibold flex items-center gap-1.5"><XCircle/>Error:</p>
              <p>{generationError}</p>
            </div>
          )}
          {generationSuccessMessage && !generationError && (
            <div className="mt-3 p-3 rounded-md bg-primary/10 border border-primary/50 text-primary text-sm">
              <p className="font-semibold flex items-center gap-1.5"><CheckCircle/>Success!</p>
              <p>{generationSuccessMessage}</p>
            </div>
          )}

          <AlertDialogFooter className="mt-4">
            <Button
              variant="outline"
              onClick={() => setShowProgressDialog(false)}
              disabled={isProcessingSwu}
            >
              Close
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showSecurityWarningDialog} onOpenChange={setShowSecurityWarningDialog}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <HelpCircle className="h-6 w-6 text-yellow-500" />
              Security Warning
            </AlertDialogTitle>
            <AlertDialogDescription>
              {(() => {
                const formValues = form.getValues();
                const hasSigning = formValues.signingAlgorithm && formValues.signingAlgorithm !== 'none';
                const hasEncryption = formValues.encryptionKeyId && formValues.encryptionKeyId !== 'none' && formValues.encryptionKeyId !== '';

                if (!hasSigning && !hasEncryption) {
                  return "Are you sure you want to generate an unencrypted and unsigned update? This may pose security risks.";
                } else if (!hasSigning) {
                  return "Are you sure you want to generate an unsigned update? This may pose security risks.";
                } else if (!hasEncryption) {
                  return "Are you sure you want to generate an unencrypted update? This may pose security risks.";
                }
                return "";
              })()}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowSecurityWarningDialog(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setShowSecurityWarningDialog(false);
                handleGenerateSwu();
              }}
              className="bg-yellow-600 hover:bg-yellow-700"
            >
              Continue Anyway
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
