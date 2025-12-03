// src/components/iot/update-pack-form.tsx
"use client";

import React, { useState, useEffect } from 'react';
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
import { Checkbox } from "@/components/ui/checkbox";
import type { UpdatePack, ApiCreateUpdatePackPayload } from '@/types/iot';
import { FileUpload } from '@/components/iot/file-upload';
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, HelpCircle, PackageCheck, FileUp, Settings2, Rocket, FileText } from 'lucide-react';
import { useDms } from '@/contexts/DmsContext';
import { get_CLIENT_UPDATES_API_BASE_URL } from '@/lib/api-domains';
import { useAuth } from '@/contexts/AuthContext';
import { fetchSymmetricKeys, type SymmetricKey } from '@/lib/symkms-api';
import { useQuery } from '@tanstack/react-query';


const updatePackFormSchema = z.object({
  name: z.string()
    .min(3, "Pack name must be at least 3 characters.")
    .regex(/^[^\s]+$/, "Pack name cannot contain spaces. Use underscores instead.")
    .transform(val => val.replace(/\s+/g, '_')),
  version: z.coerce.number().int().positive("Version must be a positive integer."),
  dmsId: z.string().min(1, "Please select a Device Management System."),
  type: z.enum(["rawfile", "firmware", "other"]),
  signingAlgorithm: z.enum(["none", "ecdsa-p256", "ecdsa-p384", "rsa-2048", "rsa-3072", "rsa-4096"]).optional(),
  encryptionKeyId: z.string().optional(),
  descriptorEncrypted: z.boolean().optional(),
  encryptAllFiles: z.boolean().optional(),
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
  const { data: symmetricKeys = [] } = useQuery<SymmetricKey[], Error>({
    queryKey: ['symmetricKeys', user?.profile?.sub],
    queryFn: () => fetchSymmetricKeys(user!.profile.sub!, user!.access_token!),
    enabled: !!user?.profile?.sub && !!user?.access_token,
  });

  const form = useForm<UpdatePackFormValues>({
    resolver: zodResolver(updatePackFormSchema),
    defaultValues: { 
      name: "", 
      version: 1, 
      dmsId: selectedDms?.id || "",
      type: "rawfile",
      signingAlgorithm: "none",
      encryptionKeyId: "none",
      descriptorEncrypted: false,
      encryptAllFiles: false
    } as any,
  });

  useEffect(() => {
    setBinaryFiles([]);
    setDescriptorFile(null);
    setDescriptorFileContent(null);

    const typeValue = initialPackData?.type as UpdatePackFormValues['type'] || 'rawfile';

    if (formModeActual === 'new') {
      form.reset({
        name: initialPackData?.name || "",
        version: initialPackData?.version || 1,
        type: typeValue,
        signingAlgorithm: "none",
        encryptionKeyId: "none",
        descriptorEncrypted: false,
        encryptAllFiles: false
      } as any);
    } else if (formModeActual === 'newVersion') {
      if (initialPackData && initialPackData.name) {
        form.reset({
          name: initialPackData.name,
          version: initialPackData.version,
          type: typeValue,
          signingAlgorithm: "none",
          encryptionKeyId: "none",
          descriptorEncrypted: false,
          encryptAllFiles: false
        } as any);
      } else {
        form.reset({ 
          name: "", 
          version: 0, 
          type: "rawfile",
          signingAlgorithm: "none",
          encryptionKeyId: "none",
          descriptorEncrypted: false,
          encryptAllFiles: false
        } as any);
      }
    } else if (formModeActual === 'edit' && initialPackData) {
      form.reset({
        name: initialPackData.name,
        version: initialPackData.version,
        type: typeValue,
        signingAlgorithm: "none",
        encryptionKeyId: "none",
        descriptorEncrypted: false,
        encryptAllFiles: false
      } as any);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formModeActual, initialPackData, form.reset]);

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
      } catch (jsonError) {
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
      const errors: string[] = [];
      const warnings: string[] = [];
      
      // Check for missing files
      requiredFiles.forEach((fileName: string) => {
        if (!uploadedFileNames.includes(fileName)) {
          errors.push(`File: ${fileName} is missing please upload it`);
        }
      });
      
      // Check for extra files not in descriptor
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
    const hasSigning = formValues.signingAlgorithm && formValues.signingAlgorithm !== 'none';
    const hasEncryption = formValues.encryptionKeyId && formValues.encryptionKeyId !== 'none' && formValues.encryptionKeyId !== '';
    const selectedKey = symmetricKeys.find(k => k.id === formValues.encryptionKeyId);
    
    // Build dynamic progress steps based on selected algorithms
    const dynamicSteps: ProgressStep[] = [
      { id: 1, title: "Initialize Pack Metadata", icon: Settings2, status: 'pending', message: "Waiting to start..." },
      { id: 2, title: "Upload Binary Artifact", icon: FileUp, status: 'pending', message: "Waiting for metadata..." },
      { id: 3, title: "Upload Descriptor File", icon: FileUp, status: 'pending', message: "Waiting for files..." },
    ];
    
    let stepCounter = 4;
    
    // Add signing step if signing algorithm is selected
    if (hasSigning) {
      dynamicSteps.push({
        id: stepCounter++,
        title: `Sign with ${formValues.signingAlgorithm?.toUpperCase()}`,
        icon: Settings2,
        status: 'pending',
        message: "Waiting for file uploads..."
      });
    }
    
    // Add encryption step if encryption key is selected
    if (hasEncryption && selectedKey) {
      dynamicSteps.push({
        id: stepCounter++,
        title: `Encrypt with ${selectedKey.algorithm.toUpperCase()}`,
        icon: Settings2,
        status: 'pending',
        message: "Waiting for signing..."
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
    const selectedDmsForPack = availableDms.find(dms => dms.id === formData.dmsId);
    
    if (!selectedDmsForPack) {
        setGenerationError("No Device Management System is selected.");
        setIsProcessingSwu(false);
        return;
    }
    const dmsId = selectedDmsForPack.id;

    const isValid = await form.trigger();
    if (!isValid) {
      setGenerationError("Form validation failed. Please correct errors and try again.");
      updateStepStatus(1, 'error', "Form validation failed.");
      setIsProcessingSwu(false);
      return;
    }

    if (binaryFiles.length === 0) {
      setGenerationError("Binary artifact files are missing. Please upload them.");
      updateStepStatus(2, 'error', "Binary artifact files are missing.");
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
        const basePackNameForApi = availableBasePacks.find(p => p.id === selectedBasePackIdProp)?.name || apiPackName;
        createPackResponse = await fetch(`${updatesApiBaseUrl}/dms/${dmsId}/updatepacks/${basePackNameForApi}/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token}` },
        });
      } else { 
        const createPayload: ApiCreateUpdatePackPayload = {
          name: packDetails.name,
          version: packDetails.version,
          type: packDetails.type,
          dms_id: dmsId
        };
        createPackResponse = await fetch(`${updatesApiBaseUrl}/dms/${dmsId}/updatepacks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.access_token}` },
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
      
      // Upload all binary files one by one
      updateStepStatus(2, 'in-progress', `Uploading ${binaryFiles.length} file(s)...`);
      
      for (let i = 0; i < binaryFiles.length; i++) {
        const file = binaryFiles[i];
        updateStepStatus(2, 'in-progress', `Uploading ${file.name}...`);
        
        const binaryFormData = new FormData();
        binaryFormData.append('file', file);
        
        const uploadBinaryResponse = await fetch(`${updatesApiBaseUrl}/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/artifact/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${user.access_token}` },
          body: binaryFormData,
        });
        
        if (!uploadBinaryResponse.ok) {
          const errorData = await uploadBinaryResponse.json().catch(() => ({ details: `Status: ${uploadBinaryResponse.status} - ${uploadBinaryResponse.statusText}` }));
          updateStepStatus(2, 'error', `Failed to upload ${file.name}: ${errorData.details || 'Unknown error'}`);
          throw new Error(`Failed to upload ${file.name}: ${errorData.details || 'Could not upload binary file.'}`);
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
        const uploadDescriptorResponse = await fetch(`${updatesApiBaseUrl}/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/descriptor/upload`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${user.access_token}` },
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
        updateStepStatus(currentStepId, 'in-progress', `Applying ${formValues.signingAlgorithm?.toUpperCase()} signature...`);
        setOverallProgress(70);
        
        // Simulate signing process with random delay (0.5-1s)
        const signingDelay = 500 + Math.random() * 500;
        await new Promise(resolve => setTimeout(resolve, signingDelay));
        
        updateStepStatus(currentStepId, 'success', `Successfully signed with ${formValues.signingAlgorithm?.toUpperCase()}`);
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
      
      // Prepare SWU generation payload with encryption parameters if selected
      const swuPayload: any = {};
      if (formValues.encryptionKeyId && selectedKey) {
        swuPayload.user = user.profile.sub;
        swuPayload.encryption_key_name = selectedKey.id;
        swuPayload.encryption_alg_name = convertToSWUGeneratorAlgorithmName(selectedKey.algorithm);
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
      
      const generateSwuResponse = await fetch(`${updatesApiBaseUrl}/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/swu?user_id=${encodeURIComponent(user.profile.sub)}`, {
        method: 'POST',
        headers: { 
          'Authorization': `Bearer ${user.access_token}`,
          'Content-Type': 'application/json'
        },
        body: Object.keys(swuPayload).length > 0 ? JSON.stringify(swuPayload) : undefined,
      });
      if (!generateSwuResponse.ok) {
        const errorData = await generateSwuResponse.json().catch(() => ({ details: `Status: ${generateSwuResponse.status} - ${generateSwuResponse.statusText}` }));
        updateStepStatus(currentStepId, 'error', errorData.details || 'Failed to trigger .swu generation.');
        throw new Error(errorData.details || 'Could not trigger .swu generation.');
      }
      const swuResult = await generateSwuResponse.json();
      updateStepStatus(currentStepId, 'success', swuResult.message || ".swu generation triggered successfully!");
      setOverallProgress(100);

      setGenerationSuccessMessage("Update pack generated and processed successfully!");
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

  let cardTitleText = "Update Pack Details"; // Generic default
  let cardDescriptionText = "Define details, upload files, and generate the .swu pack.";


  if (formModeActual === 'new') {
    cardTitleText = "Step 1: New Update Pack Details";
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
                      {availableBasePacks.map(p => (
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
                  name="dmsId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Management System</FormLabel>
                      <Select
                        onValueChange={field.onChange}
                        value={field.value}
                        disabled={isProcessingSwu}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select DMS" />
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
                      <FormDescription>Select the DMS where this update pack will be created.</FormDescription>
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
                      <FormLabel>Type</FormLabel>
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
                          <SelectItem value="rawfile">Raw File</SelectItem>
                          <SelectItem value="firmware">Firmware</SelectItem>
                          <SelectItem value="other">Other Type</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Type can be set for the new pack/version.</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
              
              {/* File Upload Section - Moved before Security */}
              <h3 className="text-lg font-semibold pt-4 border-t">Step 2: Upload Files</h3>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Side: Artifacts Upload */}
                <div className="space-y-4">
                  <div className="rounded-lg border bg-card p-4">
                    <h4 className="text-md font-semibold mb-3 flex items-center gap-2">
                      <FileUp className="h-5 w-5 text-primary" />
                      Artifacts Uploader
                    </h4>
                    <FileUpload
                      label="Upload Main Artifact (.swu, .bin, etc.)"
                      onFileUpload={handleBinaryUpload}
                    />
                    {binaryFiles.length > 0 && (
                      <div className="mt-3 space-y-2">
                        {binaryFiles.map((file, index) => (
                          <div key={index} className={`p-3 rounded-md border ${
                            descriptorValidationWarnings.some(w => w.includes(file.name)) 
                              ? 'bg-yellow-500/10 border-yellow-500/50' 
                              : 'bg-primary/10 border-primary/50'
                          }`}>
                            <div className="flex items-center justify-between">
                              <p className={`text-sm font-medium ${
                                descriptorValidationWarnings.some(w => w.includes(file.name))
                                  ? 'text-yellow-700 dark:text-yellow-400'
                                  : 'text-primary'
                              }`}>
                                {descriptorValidationWarnings.some(w => w.includes(file.name)) ? '⚠' : '✓'} {file.name}
                              </p>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  const newFiles = binaryFiles.filter((_, i) => i !== index);
                                  setBinaryFiles(newFiles);
                                  if (descriptorFileContent) {
                                    validateDescriptorFiles(descriptorFileContent, newFiles);
                                  }
                                }}
                                className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              >
                                ×
                              </Button>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">
                              Size: {(file.size / 1024).toFixed(2)} KB
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="signingAlgorithm"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Signing Algorithm</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select signing algorithm" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Signing</SelectItem>
                          <SelectItem value="ecdsa-p256">ECDSA-P256</SelectItem>
                          <SelectItem value="ecdsa-p384">ECDSA-P384</SelectItem>
                          <SelectItem value="rsa-2048">RSA-2048</SelectItem>
                          <SelectItem value="rsa-3072">RSA-3072</SelectItem>
                          <SelectItem value="rsa-4096">RSA-4096</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>Digital signature algorithm for update verification</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {/* Encryption Key Selection */}
                <FormField
                  control={form.control}
                  name="encryptionKeyId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Keys</FormLabel>
                      <Select onValueChange={field.onChange} defaultValue={field.value}>
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
                      <FormDescription>Select a symmetric key for encryption</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              {/* File Encryption Options - show when key is selected */}
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

            </form>
          </Form>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-2 border-t pt-6">
            <Button
              onClick={() => {
                const formValues = form.getValues();
                const hasSigning = formValues.signingAlgorithm && formValues.signingAlgorithm !== 'none';
                const hasEncryption = formValues.encryptionKeyId && formValues.encryptionKeyId !== 'none' && formValues.encryptionKeyId !== '';
                
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
                binaryFiles.length === 0 || // Disable if no binary files are uploaded
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
              Update Pack Generation Progress
            </AlertDialogTitle>
            {isProcessingSwu && <AlertDialogDescription>Please wait while the update pack is being generated...</AlertDialogDescription>}
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
