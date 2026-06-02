
'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { useForm, useWatch, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { TagInput } from '@/components/shared/TagInput';
import { AlertTriangle, Loader2, Save, Trash2, CheckCircle, XCircle, Edit, PlusCircle } from 'lucide-react';
import { sileo } from '@/lib/toast';
import type { ApiRaItem, RaCreationPayload } from '@/lib/dms-api';
import { createOrUpdateRa } from '@/lib/dms-api';
import { format, parseISO } from 'date-fns';
import { findCaById, fetchAndProcessCAs, updateCaMetadata, type CA, type PatchOperation } from '@/lib/ca-data';
import { CaVisualizerCard } from '../CaVisualizerCard';
import { Switch } from '@/components/ui/switch';
import { AwsPolicyEditorModal } from './AwsPolicyEditorModal';
import { Input } from '../ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../ui/select';
import { policyBuilder } from '@/lib/integrations-api';
import { AwsRemediationPolicyModal } from './AwsRemediationPolicyModal';
import { RadioGroup, RadioGroupItem } from '../ui/radio-group';
import { Label } from '../ui/label';
import { Separator } from '../ui/separator';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';

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

interface PolicySummary {
  actionPreview: string;
  statementCount: number;
  version: string;
}

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

const getPolicySummary = (policyDocument: string): PolicySummary => {
  try {
    const parsed = JSON.parse(policyDocument);
    const rawStatements = parsed?.Statement;
    const statements = Array.isArray(rawStatements)
      ? rawStatements
      : rawStatements
        ? [rawStatements]
        : [];

    const actions = statements.flatMap((statement: { Action?: string | string[] }) => {
      if (!statement?.Action) {
        return [];
      }

      return Array.isArray(statement.Action) ? statement.Action : [statement.Action];
    });

    const uniqueActions = [...new Set(actions)];
    const actionPreview = uniqueActions.length === 0
      ? 'No actions defined'
      : uniqueActions.length <= 2
        ? uniqueActions.join(', ')
        : `${uniqueActions.slice(0, 2).join(', ')} +${uniqueActions.length - 2} more`;

    return {
      actionPreview,
      statementCount: statements.length,
      version: parsed?.Version || 'Unknown',
    };
  } catch {
    return {
      actionPreview: 'Invalid policy document',
      statementCount: 0,
      version: 'Invalid',
    };
  }
};

export const AwsIotIntegrationTab: React.FC<AwsIotIntegrationTabProps> = ({ ra, configKey, onUpdate }) => {
  
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
    if (!ra?.settings.enrollment_settings.enrollment_ca) return;

    setIsLoadingCa(true);
    setErrorCa(null);
    try {
        const allCAs = await fetchAndProcessCAs();
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
  }, [ra]);

  useEffect(() => {
    loadCaData();
  }, [ra, loadCaData]);

  
  const onSubmit = async (data: AwsIntegrationFormValues) => {
    const updatedRaPayload: RaCreationPayload = JSON.parse(JSON.stringify({
        id: ra.id, name: ra.name, metadata: ra.metadata, settings: ra.settings,
    }));
    
    if (updatedRaPayload.metadata) {
        updatedRaPayload.metadata[configKey] = data;
    } else {
        updatedRaPayload.metadata = { [configKey]: data };
    }

    try {
        await createOrUpdateRa(updatedRaPayload, true, ra.id);
        sileo.success({ title: "Success", description: "AWS IoT integration settings saved." });
        onUpdate();
    } catch (e: any) {
        sileo.error({ title: "Save Failed", description: e.message });
    }
  };

  const handleSyncCa = async (isRetry = false) => {
    if (!enrollmentCa) {
        sileo.error({ title: 'Error', description: 'Enrollment CA not found.' });
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
        
        await updateCaMetadata(enrollmentCa.id, patchOperations);
        
        sileo.success({ title: "Success", description: "CA synchronization request has been sent." });
        loadCaData();

    } catch (e: any) {
        sileo.error({ title: "Sync Failed", description: e.message });
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

    sileo.success({ title: "Policy Added", description: `${LmsRemediationPolicyName} has been added. Remember to save changes.` });
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
  
  const isIntegrationEnabled = registrationInfo && registrationInfo.status === 'SUCCEEDED';

  const awsAccountId = useMemo(() => {
    const parts = configKey.split('.');
    return parts.length > 2 ? parts[parts.length -1] : '';
  }, [configKey]);

  return (
    <>
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-0">
        <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
          <div>
            <p className="font-semibold">AWS CA Registration</p>
            <p className="mt-1 text-sm text-muted-foreground">The enrollment CA for this RA must be synchronized with AWS IoT Core before the remaining settings can be applied.</p>
          </div>
          <div className="space-y-4 lg:col-span-2">
            {isLoadingCa ? (
              <div className="flex items-center justify-center rounded-md border py-8">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : errorCa ? (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorCa}</AlertDescription>
              </Alert>
            ) : !enrollmentCa ? (
              <Alert variant="destructive">
                <AlertTitle>Configuration Error</AlertTitle>
                <AlertDescription>No Enrollment CA found for this RA.</AlertDescription>
              </Alert>
            ) : (
              <>
                <CaVisualizerCard ca={enrollmentCa} allCryptoEngines={[]} className="shadow-none ring-0" />
                {registrationInfo ? (() => {
                  const { Icon, variant, title, message } = getStatusContent(registrationInfo);
                  return (
                    <>
                      <Alert variant={variant as any}>
                        <Icon className="h-4 w-4" />
                        <AlertTitle>{title}</AlertTitle>
                        <AlertDescription>
                          <div className="space-y-3">
                            <p>{message}</p>
                            <div>
                              {registrationInfo.status === 'FAILED' ? (
                                <Button type="button" variant="outline" size="sm" onClick={() => handleSyncCa(true)} disabled={isSyncing}>
                                  {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                  Retry Synchronization
                                </Button>
                              ) : (
                                <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={loadCaData}>
                                  Reload and check status
                                </Button>
                              )}
                            </div>
                          </div>
                        </AlertDescription>
                      </Alert>
                      <div className="space-y-1.5">
                        <Label>Registration Details</Label>
                        <pre className="overflow-x-auto rounded-md border bg-muted/30 p-3 text-xs">
                          {JSON.stringify(registrationInfo, null, 2)}
                        </pre>
                      </div>
                    </>
                  );
                })() : (
                  <Alert variant="warning">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertTitle>Enrollment CA Not Synchronized</AlertTitle>
                    <AlertDescription>
                      <div className="space-y-4">
                        <p>The selected enrollment CA is not registered in AWS yet.</p>
                        <div className="space-y-1.5">
                          <Label htmlFor="account-type-select">Register As</Label>
                          <Select onValueChange={(value) => setIsPrimaryAccount(value === 'primary')} defaultValue={isPrimaryAccount ? 'primary' : 'secondary'}>
                            <SelectTrigger id="account-type-select" className="h-auto min-h-12 items-start pb-3 pt-1">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="primary">
                                <div className="flex flex-col">
                                  <span className="font-medium">Primary Account</span>
                                  <span className="text-xs text-muted-foreground">Registers as the CA owner and requires access to the CA private key.</span>
                                </div>
                              </SelectItem>
                              <SelectItem value="secondary">
                                <div className="flex flex-col">
                                  <span className="font-medium">Secondary Account</span>
                                  <span className="text-xs text-muted-foreground">No access to the CA private key is required.</span>
                                </div>
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="flex justify-end">
                          <Button type="button" variant="outline" onClick={() => handleSyncCa(false)} disabled={isSyncing}>
                            {isSyncing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                            Synchronize CA with AWS
                          </Button>
                        </div>
                      </div>
                    </AlertDescription>
                  </Alert>
                )}
              </>
            )}
          </div>
        </div>

        <Separator />

        {!isIntegrationEnabled ? (
          <div className="py-8">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Configuration Disabled</AlertTitle>
              <AlertDescription>You must successfully register the CA with AWS before configuring the options below.</AlertDescription>
            </Alert>
          </div>
        ) : null}

        <div className={!isIntegrationEnabled ? 'pointer-events-none opacity-50' : undefined}>
          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Thing Provisioning And Policies</p>
              <p className="mt-1 text-sm text-muted-foreground">Choose how devices are provisioned into AWS IoT Core and manage the policies attached during registration.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <FormField
                control={form.control}
                name="registration_mode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Registration Mode</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        <SelectItem value="auto">Automatic Registration on Enrollment</SelectItem>
                        <SelectItem value="jitp">JITP Template</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {registrationMode === 'jitp' ? (
                <div className="space-y-4 rounded-md border p-4">
                  <FormField
                    control={form.control}
                    name="jitp_config.enable_template"
                    render={({ field }) => (
                      <FormItem className="flex items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <FormLabel>Enable JITP Template</FormLabel>
                          <FormDescription>Generate and apply the AWS JITP template for this integration.</FormDescription>
                        </div>
                        <FormControl>
                          <Switch checked={field.value} onCheckedChange={field.onChange} />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="jitp_config.provisioning_role_arn"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Provisioning Role ARN</FormLabel>
                        <FormControl>
                          <Input {...field} placeholder="arn:aws:iam::123456789012:role/JITP-Role" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ) : null}

              <FormField
                control={form.control}
                name="groups"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Thing Groups</FormLabel>
                    <FormControl>
                      <TagInput {...field} placeholder="Add thing groups..." />
                    </FormControl>
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <div className="flex items-center justify-between gap-4">
                  <FormLabel>IoT Policies</FormLabel>
                  <Button type="button" size="sm" onClick={() => handleOpenPolicyModal()}>
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Custom Policy
                  </Button>
                </div>
                <div className="rounded-md border">
                  {fields.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Policy</TableHead>
                          <TableHead className="hidden md:table-cell">Version</TableHead>
                          <TableHead className="hidden md:table-cell">Statements</TableHead>
                          <TableHead>Actions</TableHead>
                          <TableHead className="text-right">Manage</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fields.map((item, index) => {
                          const summary = getPolicySummary(item.policy_document);

                          return (
                            <TableRow key={item.id}>
                              <TableCell className="max-w-[260px]">
                                <div className="min-w-0">
                                  <p className="truncate font-mono text-sm">{item.policy_name}</p>
                                </div>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline">{summary.version}</Badge>
                              </TableCell>
                              <TableCell className="hidden md:table-cell">
                                <Badge variant="outline">{summary.statementCount} {summary.statementCount === 1 ? 'statement' : 'statements'}</Badge>
                              </TableCell>
                              <TableCell className="max-w-[320px]">
                                <p className="truncate text-sm text-muted-foreground" title={summary.actionPreview}>
                                  {summary.actionPreview}
                                </p>
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex items-center justify-end gap-1">
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenPolicyModal(index)}>
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => remove(index)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  ) : (
                    <div className="px-3 py-6 text-sm text-muted-foreground">
                      No policies added.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Separator />

          <div className="grid grid-cols-1 gap-10 py-8 lg:grid-cols-3">
            <div>
              <p className="font-semibold">Device Shadow And Automation</p>
              <p className="mt-1 text-sm text-muted-foreground">Control Lamassu access to AWS IoT device shadows and add the remediation policy required for shadow management.</p>
            </div>
            <div className="space-y-4 lg:col-span-2">
              <FormField
                control={form.control}
                name="shadow_config.enable"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <FormLabel>Enable Device Shadow</FormLabel>
                      <FormDescription>Allow Lamassu to interact with the device shadow document in AWS IoT.</FormDescription>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />

              {shadowEnabled ? (
                <div className="space-y-4 border-t pt-4">
                  <div className="space-y-2">
                    <Label>Shadow Type</Label>
                    <RadioGroup value={shadowType} onValueChange={handleShadowTypeChange} className="space-y-2">
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="classic" id="shadow-classic" />
                        <Label htmlFor="shadow-classic" className="space-y-1 font-normal">
                          <span className="block font-medium text-foreground">Classic Shadow</span>
                          <span className="block text-sm text-muted-foreground">Uses the default shadow document without a custom name.</span>
                        </Label>
                      </div>
                      <div className="flex items-start gap-3 rounded-md border p-3">
                        <RadioGroupItem value="named" id="shadow-named" />
                        <Label htmlFor="shadow-named" className="space-y-1 font-normal">
                          <span className="block font-medium text-foreground">Named Shadow</span>
                          <span className="block text-sm text-muted-foreground">Stores Lamassu-managed state in a specific named shadow.</span>
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>

                  {shadowType === 'named' ? (
                    <FormField
                      control={form.control}
                      name="shadow_config.shadow_name"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Shadow Name</FormLabel>
                          <FormControl>
                            <Input {...field} placeholder="e.g., config, state..." />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  ) : null}

                  {!hasRemediationPolicy ? (
                    <Alert variant="warning">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Policy Required</AlertTitle>
                      <AlertDescription>
                        <div className="space-y-2">
                          <p>For Lamassu to manage device shadows, a policy named '{LmsRemediationPolicyName}' must be attached.</p>
                          <div>
                            <Button type="button" variant="link" className="h-auto p-0 font-medium" onClick={() => setIsRemediationModalOpen(true)}>
                              Add remediation access policy
                            </Button>
                          </div>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

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
