
'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useForm, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Card } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { TagInput } from '@/components/shared/TagInput';
import { AlertTriangle, Loader2, Save, Trash2, CheckCircle, XCircle, Settings2, UserPlus, Server, BookOpenCheck, Edit, PlusCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { ApiRaItem, RaCreationPayload } from '@/lib/dms-api';
import { createOrUpdateRa } from '@/lib/dms-api';
import { useAuth } from '@/contexts/AuthContext';
import { format, parseISO } from 'date-fns';
import { findCaById, fetchAndProcessCAs, updateCaMetadata, type CA, type PatchOperation } from '@/lib/ca-data';
import { cn } from '@/lib/utils';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../ui/accordion';
import { Switch } from '@/components/ui/switch';
import { AwsPolicyEditorModal } from './AwsPolicyEditorModal';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { policyBuilder } from '@/lib/integrations-api';
import { AwsRemediationPolicyModal } from './AwsRemediationPolicyModal';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';

interface AwsIotIntegrationTabProps {
  ra: ApiRaItem;
  configKey: string;
  onUpdate: () => void;
}

const awsPolicySchema = z.object({
  policy_name: z.string().min(1, 'Policy name is required.'),
  policy_document: z.string().refine((val) => {
    try {
      JSON.parse(val);
      return true;
    } catch {
      return false;
    }
  }, { message: 'Policy document must be a valid JSON string.'}),
});

const awsIntegrationSchema = z.object({
  registration_mode: z.enum(['none', 'auto', 'jitp']).default('none'),
  groups: z.array(z.string()).optional(),
  policies: z.array(awsPolicySchema).optional(),
  shadow_config: z.object({
    enable: z.boolean().default(false),
    shadow_name: z.string().optional(),
  }).optional(),
  jitp_config: z.object({
      enable_template: z.boolean().default(false),
      provisioning_role_arn: z.string().optional(),
  }).optional(),
});

export type AwsPolicy = z.infer<typeof awsPolicySchema>;
type AwsIntegrationFormValues = z.infer<typeof awsIntegrationSchema>;

// This function now defines the complete default state.
const getDefaultFormValues = (ra: ApiRaItem, configKey: string): AwsIntegrationFormValues => {
  const config = ra?.metadata?.[configKey] || {};
  
  return {
    registration_mode: config.registration_mode || 'none',
    groups: config.groups || ['LAMASSU'],
    policies: config.policies || [],
    shadow_config: {
        enable: config.shadow_config?.enable ?? false,
        shadow_name: config.shadow_config?.shadow_name || '',
    },
    jitp_config: {
        enable_template: config.jitp_config?.enable_template ?? false,
        provisioning_role_arn: config.jitp_config?.provisioning_role_arn || '',
    },
  };
};

export const AwsIotIntegrationTab: React.FC<AwsIotIntegrationTabProps> = ({ ra, configKey, onUpdate }) => {
  const { toast } = useToast();
  const { user } = useAuth();
  
  const [enrollmentCa, setEnrollmentCa] = useState<CA | null>(null);
  const [isLoadingCa, setIsLoadingCa] = useState(false);
  const [errorCa, setErrorCa] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isPrimaryAccount, setIsPrimaryAccount] = useState(true);

  // State for the policy modals
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [isRemediationModalOpen, setIsRemediationModalOpen] = useState(false);
  const [editingPolicyIndex, setEditingPolicyIndex] = useState<number | null>(null);
  
  // State for shadow type selector
  const [shadowType, setShadowType] = useState<'classic' | 'named'>('classic');

  const connectorId = useMemo(() => {
    const prefix = "lamassu.io/iot/";
    if(configKey.startsWith(prefix)) {
      return configKey.substring(prefix.length);
    }
    return configKey;
  }, [configKey]);

  const connectorIdUniquePart = useMemo(() => {
    const parts = connectorId.split('.');
    return parts.length > 2 ? parts.slice(2).join('.') : connectorId;
  }, [connectorId]);

  const LmsRemediationPolicyName = useMemo(() => `${connectorIdUniquePart}.lms-remediation-access`, [connectorIdUniquePart]);

  const form = useForm<AwsIntegrationFormValues>({
    resolver: zodResolver(awsIntegrationSchema),
    defaultValues: getDefaultFormValues(ra, configKey),
  });

  useEffect(() => {
    form.reset(getDefaultFormValues(ra, configKey));
    const shadowName = form.getValues('shadow_config.shadow_name');
    if (shadowName) {
        setShadowType('named');
    } else {
        setShadowType('classic');
    }
  }, [ra, configKey, form]);
  
  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "policies",
  });
  
  // Use useWatch to reactively get form values
  const shadowEnabled = useWatch({ control: form.control, name: "shadow_config.enable" });
  const registrationMode = useWatch({ control: form.control, name: "registration_mode" });
  const currentPolicies = useWatch({ control: form.control, name: "policies" });

  const hasRemediationPolicy = useMemo(() => {
    return currentPolicies?.some(p => p.policy_name === LmsRemediationPolicyName);
  }, [currentPolicies, LmsRemediationPolicyName]);

  const loadCaData = useCallback(async () => {
    if (!user?.access_token || !ra?.settings.enrollment_settings.enrollment_ca) return;

    setIsLoadingCa(true);
    setErrorCa(null);
    try {
        const allCAs = await fetchAndProcessCAs(user.access_token);
        const foundCa = findCaById(ra.settings.enrollment_settings.enrollment_ca, allCAs);
        setEnrollmentCa(foundCa || null);
        if (!foundCa) {
          setErrorCa("Configured Enrollment CA could not be found.");
        }
    } catch (err: any) {
        setErrorCa(err.message || "Failed to load Enrollment CA details.");
    } finally {
        setIsLoadingCa(false);
    }
  }, [user?.access_token, ra]);

  useEffect(() => {
    loadCaData();
  }, [ra, loadCaData]);

  
  const onSubmit = async (data: AwsIntegrationFormValues) => {
    if (!user?.access_token) {
        toast({ title: 'Authentication Error', variant: 'destructive' });
        return;
    }

    const updatedRaPayload: RaCreationPayload = JSON.parse(JSON.stringify({
        id: ra.id, name: ra.name, metadata: ra.metadata, settings: ra.settings,
    }));
    
    if (updatedRaPayload.metadata) {
        updatedRaPayload.metadata[configKey] = data;
    } else {
        updatedRaPayload.metadata = { [configKey]: data };
    }

    try {
        await createOrUpdateRa(updatedRaPayload, user.access_token, true, ra.id);
        toast({ title: "Success", description: "AWS IoT integration settings saved." });
        onUpdate();
    } catch (e: any) {
        toast({ title: "Save Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleSyncCa = async (isRetry = false) => {
    if (!user?.access_token || !enrollmentCa) {
        toast({ title: 'Error', description: 'Enrollment CA not found or user not authenticated.', variant: 'destructive' });
        return;
    }
    setIsSyncing(true);
    try {
        let patchOperations: PatchOperation[] = [];
        const awsConfigPointer = `/${configKey.replace(/\//g, '~1')}`;
        
        if (isRetry) {
             const statusPointer = `${awsConfigPointer}/registration/status`;
             patchOperations.push({ op: 'replace', path: statusPointer, value: 'REQUESTED' });
        } else {
            const registrationPayload = {
            "registration":  {
                primary_account: isPrimaryAccount,
                registration_request_time: new Date().toISOString(),
                status: "REQUESTED"
            }
          };
            patchOperations.push({ op: 'add', path: awsConfigPointer, value: registrationPayload});
        }
        
        await updateCaMetadata(enrollmentCa.id, patchOperations, user.access_token);
        
        toast({ title: "Success", description: "CA synchronization request has been sent." });
        loadCaData();

    } catch (e: any) {
        toast({ title: "Sync Failed", description: e.message, variant: "destructive" });
    } finally {
        setIsSyncing(false);
    }
  };
  
  const handleOpenPolicyModal = (index?: number) => {
    setEditingPolicyIndex(typeof index === 'number' ? index : null);
    setIsPolicyModalOpen(true);
  };

  const handleSavePolicy = (policy: AwsPolicy) => {
    if (editingPolicyIndex !== null) {
      update(editingPolicyIndex, policy);
    } else {
      append(policy);
    }
  };
  
  const handleAddRemediationPolicy = (accountId: string) => {
    const shadowName = form.getValues("shadow_config.shadow_name") || "";
    const policyDoc = policyBuilder(accountId, shadowName);
    
    append({
        policy_name: LmsRemediationPolicyName,
        policy_document: policyDoc,
    });

    toast({ title: "Policy Added", description: `${LmsRemediationPolicyName} has been added. Remember to save changes.` });
  };
  
  const handleShadowTypeChange = (value: 'classic' | 'named') => {
    setShadowType(value);
    if (value === 'classic') {
        form.setValue('shadow_config.shadow_name', '');
    } else {
        if (!form.getValues('shadow_config.shadow_name')) {
            form.setValue('shadow_config.shadow_name', 'lamassu-identity');
        }
    }
  };


  const registrationInfo = enrollmentCa?.rawApiData?.metadata?.[configKey]?.registration;

  const getStatusContent = (regInfo: any) => {
    switch(regInfo.status) {
        case 'SUCCEEDED': return { Icon: CheckCircle, variant: 'default', title: 'CA Registration Status: SUCCEEDED', message: `CA registration completed successfully at ${format(parseISO(regInfo.registration_request_time), 'PPpp')}.` };
        case 'FAILED': return { Icon: XCircle, variant: 'destructive', title: 'CA Registration Status: FAILED', message: `CA registration failed. Please check logs and try again.` };
        case 'REQUESTED': default: return { Icon: AlertTriangle, variant: 'warning', title: 'CA Registration Status: REQUESTED', message: "Registration process underway. Click 'Reload & Check' periodically." };
    }
  };

  const RegistrationStatusBadge: React.FC<{ info: any }> = ({ info }) => {
    if (!info) return null;
    const { status } = info;
    const Icon = status === 'SUCCEEDED' ? CheckCircle : status === 'FAILED' ? XCircle : Loader2;
    const text = status === 'SUCCEEDED' ? 'Synced' : status === 'FAILED' ? 'Failed' : 'Syncing';

    return (
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground ml-4">
            <Icon className={cn("h-4 w-4", status === 'REQUESTED' && "animate-spin", {
                'text-green-500': status === 'SUCCEEDED',
                'text-red-500': status === 'FAILED',
                'text-yellow-500': status === 'REQUESTED',
            })} />
            <span>{text}</span>
        </div>
    );
  };
  
  const isIntegrationEnabled = registrationInfo && registrationInfo.status === 'SUCCEEDED';
  const defaultAccordionValue = isIntegrationEnabled ? ['thing-provisioning'] : ['ca-registration'];

  const accordionTriggerStyle = "text-md font-medium bg-muted/30 hover:bg-muted/40 data-[state=open]:bg-muted/50 px-4 py-3 rounded-md";

  const awsAccountId = useMemo(() => {
    const parts = configKey.split('.');
    return parts.length > 2 ? parts[parts.length -1] : '';
  }, [configKey]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <Accordion type="multiple" defaultValue={defaultAccordionValue} className="w-full space-y-3">
            
            <AccordionItem value="ca-registration" className="border rounded-md shadow-sm">
                <AccordionTrigger className={accordionTriggerStyle}>
                    <div className="flex items-center justify-between w-full">
                        <span className="flex items-center"><Settings2 className="mr-2 h-5 w-5" /> 1. AWS CA Registration</span>
                        <RegistrationStatusBadge info={registrationInfo} />
                    </div>
                </AccordionTrigger>
                <AccordionContent className="p-4 pt-2">
                    <p className="text-sm text-muted-foreground mb-4">The Enrollment CA for this RA must be synchronized with AWS IoT Core for this integration to function.</p>
                     {isLoadingCa ? <div className="flex justify-center p-4"><Loader2 className="animate-spin" /></div> : 
                     errorCa ? <Alert variant="destructive"><AlertTitle>Error</AlertTitle><AlertDescription>{errorCa}</AlertDescription></Alert> :
                     !enrollmentCa ? <Alert variant="destructive"><AlertTitle>Configuration Error</AlertTitle><AlertDescription>No Enrollment CA found for this RA.</AlertDescription></Alert> :
                     (
                        <>
                            <CaVisualizerCard ca={enrollmentCa} allCryptoEngines={[]} />
                            <div className="pt-4">
                                 {registrationInfo ? (() => {
                                    const { Icon, variant, title, message } = getStatusContent(registrationInfo);
                                    return (
                                        <Alert variant={variant as any}>
                                            <Icon className="h-4 w-4" /> <AlertTitle>{title}</AlertTitle>
                                            <AlertDescription>
                                                <div className="space-y-3">
                                                    <p>{message}</p>
                                                    {registrationInfo.status === 'FAILED' ? (
                                                      <Button type="button" variant="outline" size="sm" onClick={() => handleSyncCa(true)} disabled={isSyncing}>
                                                        {isSyncing ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null} Retry Synchronization
                                                      </Button>
                                                    ) : (
                                                      <Button type="button" variant="link" className="p-0 h-auto font-semibold" onClick={loadCaData}>Reload & Check Status</Button>
                                                    )}
                                                    <Accordion type="single" collapsible className="w-full">
                                                        <AccordionItem value="item-1" className="border-t">
                                                            <AccordionTrigger className="text-xs pt-3">Details</AccordionTrigger>
                                                            <AccordionContent>
                                                                <pre className="text-xs bg-muted p-2 rounded-md overflow-x-auto mt-1">
                                                                    {JSON.stringify(registrationInfo, null, 2)}
                                                                </pre>
                                                            </AccordionContent>
                                                        </AccordionItem>
                                                    </Accordion>
                                                </div>
                                            </AlertDescription>
                                        </Alert>
                                    )
                                })() : (
                                    <Alert variant="warning">
                                      <AlertTriangle className="h-4 w-4"/><AlertTitle>Enrollment CA Not Synchronized</AlertTitle>
                                      <AlertDescription>
                                        <div className="space-y-3 mt-2">
                                          <p>The selected Enrollment CA is not registered in AWS. Make sure to synchronize it first.</p>
                                          <div className="space-y-2 pt-2">
                                              <Label htmlFor="account-type-select">Register as Primary Account</Label>
                                              <Select onValueChange={(value) => setIsPrimaryAccount(value === 'primary')} defaultValue={isPrimaryAccount ? 'primary' : 'secondary'}>
                                                  <SelectTrigger id="account-type-select" className="items-start h-auto"><SelectValue/></SelectTrigger>
                                                  <SelectContent>
                                                      <SelectItem value="primary">
                                                          <div className="flex flex-col"><span className="font-semibold">Primary Account - Register as CA owner</span><span className="text-xs text-muted-foreground">Only one account can be registered as the CA owner within the same AWS Region. It is required to have access to the CA private key.</span></div>
                                                      </SelectItem>
                                                      <SelectItem value="secondary">
                                                           <div className="flex flex-col"><span className="font-semibold">Secondary Account</span><span className="text-xs text-muted-foreground">No access to the CA private key is needed.</span></div>
                                                      </SelectItem>
                                                  </SelectContent>
                                              </Select>
                                          </div>
                                          <div className="flex justify-end pt-2">
                                              <Button type="button" variant="outline" onClick={() => handleSyncCa(false)} disabled={isSyncing}>
                                                {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                                                Synchronize CA with AWS
                                              </Button>
                                          </div>
                                        </div>
                                      </AlertDescription>
                                  </Alert>
                                )}
                            </div>
                        </>
                     )}
                </AccordionContent>
            </AccordionItem>

            <div className={cn("space-y-3", !isIntegrationEnabled && "opacity-50 pointer-events-none")}>
                {!isIntegrationEnabled && <Alert variant="warning"><AlertTriangle className="h-4 w-4"/><AlertTitle>Configuration Disabled</AlertTitle><AlertDescription>You must successfully register the CA with AWS before configuring the options below.</AlertDescription></Alert>}
                
                <AccordionItem value="thing-provisioning" className="border rounded-md shadow-sm">
                    <AccordionTrigger className={accordionTriggerStyle}>
                        <div className="flex items-center"><UserPlus className="mr-2 h-5 w-5" /> 2. Thing Provisioning &amp; Policies</div>
                    </AccordionTrigger>
                    <AccordionContent className="p-4 pt-2 space-y-4">
                        <FormField control={form.control} name="registration_mode" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Registration Mode</FormLabel>
                                <Select onValueChange={field.onChange} value={field.value}>
                                    <FormControl><SelectTrigger><SelectValue/></SelectTrigger></FormControl>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        <SelectItem value="auto">Automatic Registration on Enrollment</SelectItem>
                                        <SelectItem value="jitp">JITP Template</SelectItem>
                                    </SelectContent>
                                </Select>
                                <FormMessage />
                            </FormItem>
                        )}/>

                         {registrationMode === 'jitp' && (
                            <Card className="bg-muted/50 p-4 space-y-4">
                                <FormField control={form.control} name="jitp_config.enable_template" render={({ field }) => (
                                    <FormItem className="flex flex-row items-center justify-between rounded-lg border bg-background p-3 shadow-sm">
                                        <div className="space-y-0.5">
                                            <FormLabel>Enable JITP Template</FormLabel>
                                        </div>
                                        <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                                    </FormItem>
                                )}/>
                                <FormField control={form.control} name="jitp_config.provisioning_role_arn" render={({ field }) => (
                                    <FormItem>
                                        <FormLabel>Provisioning Role ARN</FormLabel>
                                        <FormControl><Input {...field} placeholder="arn:aws:iam::123456789012:role/JITP-Role"/></FormControl>
                                        <FormMessage />
                                    </FormItem>
                                )}/>
                            </Card>
                        )}


                        <FormField control={form.control} name="groups" render={({ field }) => (
                            <FormItem>
                                <FormLabel>Thing Groups</FormLabel>
                                <FormControl><TagInput {...field} value={field.value || []} placeholder="Add thing groups..."/></FormControl>
                            </FormItem>
                        )}/>
                        
                        <div className="space-y-2">
                             <div className="flex justify-between items-center">
                                 <FormLabel>IoT Policies</FormLabel>
                                 <Button type="button" variant="default" size="sm" onClick={() => handleOpenPolicyModal()}>
                                     <PlusCircle className="mr-2 h-4 w-4"/>
                                     Add Custom Policy
                                </Button>
                             </div>
                             <Card className="p-3">
                                <ul className="space-y-2">
                                    {fields.map((item, index) => (
                                        <li key={item.id} className="flex items-center justify-between p-2 rounded-md bg-muted/50">
                                            <div className="flex items-center gap-2">
                                                <BookOpenCheck className="h-4 w-4 text-primary"/>
                                                <span className="font-mono text-sm">{item.policy_name}</span>
                                            </div>
                                            <div className="space-x-1">
                                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => handleOpenPolicyModal(index)}><Edit className="h-4 w-4"/></Button>
                                                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(index)}><Trash2 className="h-4 w-4 text-destructive"/></Button>
                                            </div>
                                        </li>
                                    ))}
                                    {fields.length === 0 && <p className="text-sm text-muted-foreground text-center py-2">No policies added.</p>}
                                </ul>
                             </Card>
                        </div>
                    </AccordionContent>
                </AccordionItem>

                <AccordionItem value="shadow" className="border rounded-md shadow-sm">
                    <AccordionTrigger className={accordionTriggerStyle}><Server className="mr-2 h-5 w-5" /> 3. Device Shadow &amp; Automation</AccordionTrigger>
                    <AccordionContent className="p-4 pt-2 space-y-4">
                        <FormField
                          control={form.control}
                          name="shadow_config.enable"
                          render={({ field }) => (
                            <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 shadow-sm">
                              <div className="space-y-0.5">
                                <FormLabel className="text-base">Enable Device Shadow</FormLabel>
                                <FormDescription>Allow Lamassu to interact with the device's shadow document in AWS IoT.</FormDescription>
                              </div>
                              <FormControl><Switch checked={field.value} onCheckedChange={field.onChange} /></FormControl>
                            </FormItem>
                          )}
                        />
                        {shadowEnabled && (
                            <div className="space-y-4 pl-6">
                                <RadioGroup value={shadowType} onValueChange={handleShadowTypeChange} className="grid grid-cols-2 gap-4">
                                    <div>
                                        <RadioGroupItem value="classic" id="shadow-classic" className="peer sr-only" />
                                        <Label htmlFor="shadow-classic" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                            Classic Shadow
                                        </Label>
                                    </div>
                                    <div>
                                        <RadioGroupItem value="named" id="shadow-named" className="peer sr-only" />
                                        <Label htmlFor="shadow-named" className="flex flex-col items-center justify-center rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary">
                                            Named Shadow
                                        </Label>
                                    </div>
                                </RadioGroup>
                                <div className="space-y-2">
                                {shadowType === 'named' && (
                                     <FormField
                                        control={form.control}
                                        name="shadow_config.shadow_name"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>Shadow Name</FormLabel>
                                                <FormControl><Input {...field} placeholder="e.g., config, state..."/></FormControl>
                                                <FormMessage/>
                                            </FormItem>
                                        )}
                                    />
                                )}
                               
                                {!hasRemediationPolicy && (
                                    <Alert variant="warning">
                                      <AlertTriangle className="h-4 w-4"/>
                                      <AlertTitle>Policy Required</AlertTitle>
                                      <AlertDescription>
                                          For Lamassu to manage device shadows, a policy named '{LmsRemediationPolicyName}' must be attached.
                                          <Button type="button" variant="link" className="p-0 h-auto ml-2 text-amber-800 dark:text-amber-300 font-semibold" onClick={() => setIsRemediationModalOpen(true)}>
                                              Add Remediation Access Policy
                                          </Button>
                                      </AlertDescription>
                                    </Alert>
                                )}
                                </div>
                          </div>
                        )}
                    </AccordionContent>
                </AccordionItem>
            </div>

        </Accordion>
        
        <div className="flex justify-end pt-4">
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting || !isIntegrationEnabled}>
                {form.formState.isSubmitting ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Save className="mr-2 h-5 w-5" />}
                Update DMS
            </Button>
        </div>
      </form>
    </Form>
    <AwsPolicyEditorModal
        isOpen={isPolicyModalOpen}
        onOpenChange={setIsPolicyModalOpen}
        onSave={handleSavePolicy}
        existingPolicy={editingPolicyIndex !== null ? fields[editingPolicyIndex] : undefined}
    />
    <AwsRemediationPolicyModal
        isOpen={isRemediationModalOpen}
        onOpenChange={setIsRemediationModalOpen}
        onConfirm={handleAddRemediationPolicy}
        defaultAccountId={awsAccountId}
    />
    </>
  );
};
