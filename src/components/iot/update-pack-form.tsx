
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
import type { UpdatePack, ApiCreateUpdatePackPayload } from '@/types/iot';
import { FileUpload } from '@/components/iot/file-upload';
import { toast } from "@/hooks/use-toast";
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter } from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Loader2, CheckCircle, XCircle, HelpCircle, PackageCheck, FileUp, Settings2, Rocket, FileText } from 'lucide-react';
import { useDms } from '@/contexts/DmsContext';

const updatePackFormSchema = z.object({
  name: z.string().min(3, "Pack name must be at least 3 characters."),
  version: z.coerce.number().int().positive("Version must be a positive integer."),
  type: z.enum(["rawfile", "firmware", "other"]),
});

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
}

export function UpdatePackForm({
  formModeActual,
  initialPackData,
  availableBasePacks = [],
  selectedBasePackIdProp,
  onBasePackSelect,
  onSwuGenerated,
}: UpdatePackFormProps) {
  const { selectedDms } = useDms();
  const [binaryFile, setBinaryFile] = useState<File | null>(null);
  const [descriptorFile, setDescriptorFile] = useState<File | null>(null);
  const [descriptorFileContent, setDescriptorFileContent] = useState<string | null>(null);
  const [isProcessingSwu, setIsProcessingSwu] = useState(false);
  const [showProgressDialog, setShowProgressDialog] = useState(false);
  const [progressSteps, setProgressSteps] = useState<ProgressStep[]>(() => initialProgressSteps.map(s => ({ ...s })));
  const [overallProgress, setOverallProgress] = useState(0);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [generationSuccessMessage, setGenerationSuccessMessage] = useState<string | null>(null);

  const form = useForm<UpdatePackFormValues>({
    resolver: zodResolver(updatePackFormSchema),
    defaultValues: { name: "", version: 1, type: "rawfile" },
  });

  useEffect(() => {
    setBinaryFile(null);
    setDescriptorFile(null);
    setDescriptorFileContent(null);

    const typeValue = initialPackData?.type as UpdatePackFormValues['type'] || 'rawfile';

    if (formModeActual === 'new') {
      form.reset({
        name: initialPackData?.name || "",
        version: initialPackData?.version || 1,
        type: typeValue,
      });
    } else if (formModeActual === 'newVersion') {
      if (initialPackData && initialPackData.name) {
        form.reset({
          name: initialPackData.name,
          version: initialPackData.version,
          type: typeValue,
        });
      } else {
        form.reset({ name: "", version: 0, type: "rawfile" });
      }
    } else if (formModeActual === 'edit' && initialPackData) {
      form.reset({
        name: initialPackData.name,
        version: initialPackData.version,
        type: typeValue,
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formModeActual, initialPackData, form.reset]);


  const handleBinaryUpload = async (file: File): Promise<boolean> => {
    setBinaryFile(null); // Clear previous before setting new
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay for UI update
    setBinaryFile(file);
    toast({ title: "Binary File Ready", description: `${file.name} selected.` });
    return true;
  };

  const handleDescriptorUpload = async (file: File): Promise<boolean> => {
    setDescriptorFile(null);
    setDescriptorFileContent(null);
    await new Promise(resolve => setTimeout(resolve, 50)); // Short delay

    return new Promise((resolvePromise, rejectPromise) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const text = event.target?.result as string;
          setDescriptorFileContent(text);
          setDescriptorFile(file); // Set the file object itself after content is read
          toast({ title: "Descriptor File Ready", description: `${file.name} selected and content loaded.` });
          resolvePromise(true);
        } catch (e) {
          console.error("Error reading descriptor file:", e);
          toast({ variant: "destructive", title: "Error Reading File", description: "Could not read descriptor file content." });
          setDescriptorFile(null); // Ensure file is not set if content read fails
          setDescriptorFileContent(null);
          resolvePromise(false); // Resolve with false to indicate failure to FileUpload if needed
        }
      };
      reader.onerror = (error) => {
        console.error("FileReader error:", error);
        toast({ variant: "destructive", title: "File Read Error", description: "An error occurred while reading the file." });
        setDescriptorFile(null);
        setDescriptorFileContent(null);
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
    setProgressSteps(initialProgressSteps.map(s => ({ ...s })));
    setOverallProgress(0);

    if (!selectedDms) {
        setGenerationError("No Device Management System is selected.");
        setIsProcessingSwu(false);
        return;
    }
    const dmsId = selectedDms.id;

    const isValid = await form.trigger();
    if (!isValid) {
      setGenerationError("Form validation failed. Please correct errors and try again.");
      updateStepStatus(1, 'error', "Form validation failed.");
      setIsProcessingSwu(false);
      return;
    }

    if (!binaryFile) {
      setGenerationError("Binary artifact file is missing. Please upload it.");
      updateStepStatus(2, 'error', "Binary artifact file is missing.");
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

    try {
      updateStepStatus(1, 'in-progress', 'Processing metadata...');
      setOverallProgress(10);
      let createPackResponse;

      if (formModeActual === 'newVersion' && selectedBasePackIdProp) {
        const basePackNameForApi = availableBasePacks.find(p => p.id === selectedBasePackIdProp)?.name || apiPackName;
        createPackResponse = await fetch(`/api/dms/${dmsId}/updatepacks/${basePackNameForApi}/new`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        });
      } else { 
        const createPayload: ApiCreateUpdatePackPayload = {
          name: packDetails.name,
          version: packDetails.version,
          type: packDetails.type,
          dms_id: dmsId
        };
        createPackResponse = await fetch(`/api/dms/${dmsId}/updatepacks`, {
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
      setOverallProgress(25);

      const targetPackNameForFilesAndSwu = apiPackName; 
      updateStepStatus(2, 'in-progress', `Uploading ${binaryFile.name}...`);
      const binaryFormData = new FormData();
      binaryFormData.append('file', binaryFile);
      const uploadBinaryResponse = await fetch(`/api/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/artifact/upload`, {
        method: 'POST',
        body: binaryFormData,
      });
      if (!uploadBinaryResponse.ok) {
        const errorData = await uploadBinaryResponse.json().catch(() => ({ details: `Status: ${uploadBinaryResponse.status} - ${uploadBinaryResponse.statusText}` }));
        updateStepStatus(2, 'error', errorData.details || 'Failed to upload binary file.');
        throw new Error(errorData.details || 'Could not upload binary file.');
      }
      const binaryResult = await uploadBinaryResponse.json();
      updateStepStatus(2, 'success', binaryResult.message || "Binary file uploaded.");
      setOverallProgress(50);

      if (descriptorFile) {
        updateStepStatus(3, 'in-progress', `Uploading ${descriptorFile.name}...`);
        const descriptorFormData = new FormData();
        descriptorFormData.append('file', descriptorFile);
        const uploadDescriptorResponse = await fetch(`/api/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/descriptor/upload`, {
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
      setOverallProgress(75);

      updateStepStatus(4, 'in-progress', 'Triggering .swu file generation...');
      const generateSwuResponse = await fetch(`/api/dms/${dmsId}/updatepacks/${targetPackNameForFilesAndSwu}/swu`, {
        method: 'POST',
      });
      if (!generateSwuResponse.ok) {
        const errorData = await generateSwuResponse.json().catch(() => ({ details: `Status: ${generateSwuResponse.status} - ${generateSwuResponse.statusText}` }));
        updateStepStatus(4, 'error', errorData.details || 'Failed to trigger .swu generation.');
        throw new Error(errorData.details || 'Could not trigger .swu generation.');
      }
      const swuResult = await generateSwuResponse.json();
      updateStepStatus(4, 'success', swuResult.message || ".swu generation triggered successfully!");
      setOverallProgress(100);

      setGenerationSuccessMessage("Update pack generated and processed successfully!");
      onSwuGenerated?.();

    } catch (error) {
      setGenerationError((error as Error).message || "An unknown error occurred during SWU generation.");
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
      <Card className="w-full max-w-2xl mx-auto" id="update-pack-form-card">
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
              
              <h3 className="text-lg font-semibold pt-4 border-t">Step 2: Upload Binary File</h3>
              <FileUpload
                label="Upload Main Artifact (.swu, .bin, etc.)"
                onFileUpload={handleBinaryUpload}
              />

              <h3 className="text-lg font-semibold pt-4 border-t">Step 3: Upload Descriptor File</h3>
              <FileUpload
                label="Upload Configuration/Descriptor File (.json, .cfg, .txt, etc.)"
                onFileUpload={handleDescriptorUpload}
              />
              {descriptorFileContent && descriptorFile && (
                <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between">
                        <h4 className="text-md font-semibold flex items-center gap-2">
                            <FileText className="h-5 w-5 text-muted-foreground" />
                            Preview: {descriptorFile.name}
                        </h4>
                        <Button variant="outline" size="sm" onClick={() => { setDescriptorFile(null); setDescriptorFileContent(null); }}>
                            Clear File
                        </Button>
                    </div>
                    <ScrollArea className="h-[200px] rounded-md border p-3 bg-muted/30 shadow-inner">
                        <pre className="text-xs whitespace-pre-wrap font-mono text-foreground">
                            {descriptorFileContent}
                        </pre>
                    </ScrollArea>
                </div>
              )}

            </form>
          </Form>
        </CardContent>
        <CardFooter className="mt-6 flex flex-col items-stretch gap-2 border-t pt-6">
            <Button
              onClick={handleGenerateSwu}
              disabled={
                isProcessingSwu ||
                (formModeActual === 'newVersion' && !selectedBasePackIdProp) ||
                !binaryFile || // Disable if binary file is not uploaded
                ((formModeActual === 'new' || (formModeActual === 'newVersion' && selectedBasePackIdProp)) && !descriptorFile) // Disable if descriptor is required but not uploaded
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
              Complete steps 1-3. Ensure all required files are uploaded. Then click here to generate the .swu file.
              {(formModeActual === 'newVersion' && !selectedBasePackIdProp) ? " Select a base pack first." : ""}
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
    </>
  );
}
