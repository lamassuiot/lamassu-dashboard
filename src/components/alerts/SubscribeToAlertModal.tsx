
'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
} from '@/components/ui/sheet';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Mail, Users, Webhook, Check, ArrowLeft, Info, AlertTriangle } from 'lucide-react';
import { subscribeToAlert, type SubscriptionPayload, type ApiSubscription, updateSubscription } from '@/lib/alerts-api';
import { cn } from '@/lib/utils';
import { Textarea } from '../ui/textarea';
import { JSONPath } from 'jsonpath-plus';
import { Validator } from 'jsonschema';
import { Alert, AlertDescription as AlertDescUI } from '@/components/ui/alert';
import { createSchema } from 'genson-js';
import { Stepper } from '@/components/shared/Stepper';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
});


interface SubscribeToAlertModalProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  eventType: string | null;
  samplePayload: object | null;
  onSuccess: () => void;
  subscriptionToEdit?: ApiSubscription | null;
    presentation?: 'sheet' | 'inline';
    className?: string;
}

const channelOptions = [
    { value: 'EMAIL', label: 'Email Notification', icon: Mail },
    { value: 'TEAMS_WEBHOOK', label: 'Microsoft Teams Webhook', icon: Users },
    { value: 'WEBHOOK', label: 'Webhook', icon: Webhook },
];

const filterOptions = [
    { value: 'NONE', label: 'None' },
    { value: 'JSON-PATH', label: 'JSON Path' },
    { value: 'JSON-SCHEMA', label: 'JSON Schema' },
    { value: 'JAVASCRIPT', label: 'Javascript' },
];


export const SubscribeToAlertModal: React.FC<SubscribeToAlertModalProps> = ({
  isOpen,
  onOpenChange,
  eventType,
  samplePayload,
  onSuccess,
  subscriptionToEdit,
    presentation = 'sheet',
    className,
}) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const isEditMode = !!subscriptionToEdit;

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Step 1 State
  const [channelType, setChannelType] = useState<'EMAIL' | 'TEAMS_WEBHOOK' | 'WEBHOOK'>('EMAIL');
  const [email, setEmail] = useState('');
  const [webhookUrl, setWebhookUrl] = useState('');
  const [teamsName, setTeamsName] = useState('');
  const [webhookName, setWebhookName] = useState('');
  const [webhookMethod, setWebhookMethod] = useState<'POST' | 'PUT'>('POST');

  // Step 2 State
  const [filterType, setFilterType] = useState<string>('NONE');
  const [filterCondition, setFilterCondition] = useState('$.data');
  const [jsonSchema, setJsonSchema] = useState('{}');
  const [jsFunction, setJsFunction] = useState('function (event) {\n  return true;\n}');
  const [evaluationResult, setEvaluationResult] = useState<{ match: boolean; message: string; error?: boolean } | null>(null);
  const [inputEvent, setInputEvent] = useState('');


  useEffect(() => {
    if (isOpen) {
      // Reset or populate state when modal opens
      if (isEditMode && subscriptionToEdit) {
          // Populate from existing subscription
          const sub = subscriptionToEdit;
          setChannelType(sub.channel.type);
          setEmail(sub.channel.config.email || '');
          setWebhookUrl(sub.channel.config.url || '');
          setWebhookName(sub.channel.config.name || '');
          setTeamsName(sub.channel.config.name || ''); // Assuming name is shared
          setWebhookMethod(sub.channel.config.method || 'POST');

          if(sub.conditions && sub.conditions.length > 0) {
              const firstCond = sub.conditions[0];
              setFilterType(firstCond.type);
              if (firstCond.type === 'JAVASCRIPT') setJsFunction(firstCond.condition);
              else if (firstCond.type === 'JSON-SCHEMA') setJsonSchema(firstCond.condition);
              else setFilterCondition(firstCond.condition);
          } else {
              setFilterType('NONE');
              setFilterCondition('$.data');
              setJsFunction('function (event) {\n  return true;\n}');
          }

      } else {
          // Reset to default for new subscription
          setChannelType('EMAIL');
          setEmail(user?.profile.email || '');
          setWebhookUrl('');
          setTeamsName('');
          setWebhookName('');
          setWebhookMethod('POST');
          setFilterType('NONE');
          setFilterCondition('$.data');
          if (samplePayload) {
              const generatedSchema = createSchema(samplePayload);
              setJsonSchema(JSON.stringify(generatedSchema, null, 2));
          } else {
              setJsonSchema('{}');
          }
          setJsFunction('function (event) {\n  return true;\n}');
      }
      
      setInputEvent(samplePayload ? JSON.stringify(samplePayload, null, 2) : '');
      setStep(1); // Always start at step 1
    }
  }, [isOpen, user, samplePayload, subscriptionToEdit, isEditMode]);

  useEffect(() => {
    const evaluate = async () => {
        if (filterType === 'NONE' || !inputEvent) {
            setEvaluationResult(null);
            return;
        }

        try {
            const jsonPayload = JSON.parse(inputEvent);

            if (filterType === 'JSON-PATH') {
                if (!filterCondition.trim() || !filterCondition.startsWith('$')) {
                    setEvaluationResult({ match: false, message: 'Invalid JSONPath expression. Must start with "$".', error: true });
                    return;
                }
                const result = JSONPath({ path: filterCondition, json: jsonPayload });
                if (result.length > 0) {
                    setEvaluationResult({ match: true, message: 'The filter matches this Cloud Event' });
                } else {
                    setEvaluationResult({ match: false, message: 'The filter does not match this Cloud Event' });
                }
            } else if (filterType === 'JAVASCRIPT') {
                try {
                    // Using Function constructor is safer than eval, but not a true sandbox.
                    // It doesn't have access to local scope but can access globals.
                    const userFunc = new Function('event', `return (${jsFunction})(event)`);
                    const result = userFunc(jsonPayload);
                    
                    if (typeof result === 'boolean') {
                        if (result) {
                            setEvaluationResult({ match: true, message: 'The filter matches this Cloud Event' });
                        } else {
                            setEvaluationResult({ match: false, message: 'The filter does not match this Cloud Event' });
                        }
                    } else {
                        setEvaluationResult({ match: false, message: `Function returned type '${typeof result}', but a boolean was expected.`, error: true });
                    }
                } catch (e: any) {
                    setEvaluationResult({ match: false, message: `Evaluation error: ${e.message}`, error: true });
                }
            } else if (filterType === 'JSON-SCHEMA') {
                try {
                    const schema = JSON.parse(jsonSchema);
                    const validator = new Validator();
                    const result = validator.validate(jsonPayload, schema);
                    if (result.valid) {
                        setEvaluationResult({ match: true, message: 'The event conforms to the schema.' });
                    } else {
                        const errorMessages = result.errors.map(e => `${e.property} ${e.message}`).join('; ');
                        setEvaluationResult({ match: false, message: `Schema validation failed: ${errorMessages}`, error: true });
                    }
                } catch (e: any) {
                     setEvaluationResult({ match: false, message: `Invalid JSON Schema: ${e.message}`, error: true });
                }
            }
             else {
                setEvaluationResult(null); // No evaluation for other types yet
            }

        } catch (e: any) {
            if (e instanceof SyntaxError) {
                setEvaluationResult({ match: false, message: 'The Input Event is not valid JSON.', error: true });
            } else {
                setEvaluationResult({ match: false, message: e.message, error: true });
            }
        }
    };
    
    evaluate();
  }, [filterCondition, jsFunction, filterType, inputEvent, jsonSchema]);

  const handleNext = () => {
    if(step === 1) {
        if(channelType === 'EMAIL' && !email.trim()) {
            toast({ title: 'Validation Error', description: 'Email address is required.', variant: 'destructive' });
            return;
        }
        if(channelType === 'WEBHOOK' && (!webhookUrl.trim() || !webhookName.trim())) {
            toast({ title: 'Validation Error', description: 'Name and Webhook URL are required.', variant: 'destructive' });
            return;
        }
        if(channelType === 'TEAMS_WEBHOOK' && (!webhookUrl.trim() || !teamsName.trim())) {
            toast({ title: 'Validation Error', description: 'Name and Webhook URL are required for Teams.', variant: 'destructive' });
            return;
        }
    }
    setStep(s => s + 1);
  }

  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    if (!eventType || !user?.access_token) {
        toast({ title: "Error", description: "Event type or authentication is missing.", variant: "destructive" });
        return;
    }
    
    setIsSubmitting(true);
    try {
        let config: any = {};
        if (channelType === 'EMAIL') {
            config = { email };
        } else if (channelType === 'WEBHOOK') {
            config = {
                url: webhookUrl,
                method: webhookMethod,
                name: webhookName,
            };
        } else { // TEAMS_WEBHOOK
            config = { url: webhookUrl, name: teamsName };
        }

        let channelName = `${channelType.toLowerCase()}-subscription-for-${eventType}`;
        if (channelType === 'TEAMS_WEBHOOK' && teamsName.trim()) {
            channelName = teamsName.trim();
        } else if (channelType === 'WEBHOOK' && webhookName.trim()){
            channelName = webhookName.trim();
        }

        const currentCondition = filterType === 'JAVASCRIPT' ? jsFunction 
                               : filterType === 'JSON-SCHEMA' ? jsonSchema
                               : filterCondition;

        const payload: SubscriptionPayload = {
            event_type: eventType,
            conditions: filterType !== 'NONE' && currentCondition.trim() ? [{ type: filterType, condition: currentCondition.trim() }] : [],
            channel: {
                type: channelType,
                name: channelName,
                config: config,
            }
        };

        if (isEditMode && subscriptionToEdit) {
            await updateSubscription(subscriptionToEdit.id, payload, user.access_token);
        } else {
            await subscribeToAlert(payload, user.access_token);
        }
        
        onSuccess();
    } catch(e: any) {
        toast({ title: isEditMode ? "Update Failed" : "Subscription Failed", description: e.message, variant: "destructive" });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
            <div className="space-y-4">
                <Label htmlFor="channel-type">Channel Type</Label>
                <Select value={channelType} onValueChange={(v) => setChannelType(v as any)}>
                    <SelectTrigger id="channel-type">
                        <SelectValue placeholder="Select a channel type..." />
                    </SelectTrigger>
                    <SelectContent>
                        {channelOptions.map(opt => {
                            const Icon = opt.icon;
                            return (
                                <SelectItem key={opt.value} value={opt.value}>
                                    <div className="flex items-center gap-2">
                                        <Icon className="h-4 w-4 text-muted-foreground" />
                                        <span>{opt.label}</span>
                                    </div>
                                </SelectItem>
                            )
                        })}
                    </SelectContent>
                </Select>
                
                {channelType === 'EMAIL' && (
                    <div>
                        <Label htmlFor="email-input">Email Address</Label>
                        <Input id="email-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your.email@example.com" />
                    </div>
                )}
                {channelType === 'WEBHOOK' && (
                     <div className="space-y-4">
                        <div>
                            <Label htmlFor="webhook-name-input">Name</Label>
                            <Input id="webhook-name-input" type="text" value={webhookName} onChange={e => setWebhookName(e.target.value)} placeholder="e.g., My Notification Endpoint" />
                        </div>
                        <div>
                            <Label htmlFor="webhook-method-select">Method</Label>
                            <Select value={webhookMethod} onValueChange={(v: 'POST' | 'PUT') => setWebhookMethod(v)}>
                                <SelectTrigger id="webhook-method-select"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="POST">POST</SelectItem>
                                    <SelectItem value="PUT">PUT</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div>
                            <Label htmlFor="webhook-url-input">Webhook URL</Label>
                            <Input id="webhook-url-input" type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-webhook-url.com" />
                        </div>
                    </div>
                )}
                {channelType === 'TEAMS_WEBHOOK' && (
                     <div className="space-y-4">
                        <div>
                            <Label htmlFor="teams-name-input">Name</Label>
                            <Input id="teams-name-input" type="text" value={teamsName} onChange={e => setTeamsName(e.target.value)} placeholder="e.g., Critical Alerts Team" />
                        </div>
                        <div>
                            <Label htmlFor="webhook-url-input-teams">Incoming Microsoft Teams Webhook URL</Label>
                            <Input id="webhook-url-input-teams" type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-tenant.webhook.office.com/..." />
                        </div>
                    </div>
                )}
            </div>
        );
      case 2:
        return (
            <div className="space-y-4">
                <div>
                    <Label htmlFor="filter-type">Filter or Condition Format</Label>
                    <Select value={filterType} onValueChange={setFilterType}>
                        <SelectTrigger id="filter-type">
                            <SelectValue placeholder="Select a filter type..." />
                        </SelectTrigger>
                        <SelectContent>
                            {filterOptions.map(opt => (
                                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                </div>
                {filterType === 'JSON-PATH' && (
                    <div>
                        <Label htmlFor="filter-condition-jsonpath">JSONPath Expression</Label>
                        <Input id="filter-condition-jsonpath" value={filterCondition} onChange={e => setFilterCondition(e.target.value)} placeholder={`Enter JSONPath expression...`} />
                    </div>
                )}
                {filterType === 'JAVASCRIPT' && (
                    <div>
                        <Label htmlFor="filter-condition-js">Javascript Function</Label>
                        <Textarea id="filter-condition-js" value={jsFunction} onChange={e => setJsFunction(e.target.value)} rows={5} className="font-mono"/>
                    </div>
                )}
                {filterType === 'JSON-SCHEMA' && (
                    <div>
                        <Label htmlFor="filter-condition-jsonschema">JSON Schema</Label>
                        <div id="filter-condition-jsonschema" className="mt-2 overflow-hidden rounded-md border">
                            <MonacoEditor
                                height="220px"
                                language="json"
                                value={jsonSchema}
                                onChange={(value) => setJsonSchema(value ?? '')}
                                options={{
                                    minimap: { enabled: false },
                                    scrollBeyondLastLine: false,
                                    automaticLayout: true,
                                    fontSize: 12,
                                    lineNumbersMinChars: 3,
                                }}
                            />
                        </div>
                    </div>
                )}
                {(filterType !== 'NONE') && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                        <div className="space-y-1.5">
                            <Label htmlFor="input-event">Input Event</Label>
                            <div id="input-event" className="overflow-hidden rounded-md border">
                                <MonacoEditor
                                    height="256px"
                                    language="json"
                                    value={inputEvent}
                                    onChange={(value) => setInputEvent(value ?? '')}
                                    options={{
                                        minimap: { enabled: false },
                                        scrollBeyondLastLine: false,
                                        automaticLayout: true,
                                        fontSize: 12,
                                        lineNumbersMinChars: 3,
                                        wordWrap: 'on',
                                    }}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Evaluation Result</Label>
                            {evaluationResult ? (
                                <Alert variant={evaluationResult.error ? 'destructive' : 'default'} className={cn(
                                    !evaluationResult.error && evaluationResult.match && "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700",
                                    !evaluationResult.error && !evaluationResult.match && "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700"
                                )}>
                                    <div className="flex items-center">
                                       {evaluationResult.error ? <AlertTriangle className="h-4 w-4 text-destructive" /> : 
                                        evaluationResult.match ? <Check className="h-4 w-4 text-green-600 dark:text-green-400" /> : 
                                        <Info className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />
                                       }
                                       <AlertDescUI className="ml-2">{evaluationResult.message}</AlertDescUI>
                                    </div>
                                </Alert>
                            ) : (
                                <div className="h-full flex items-center justify-center text-sm text-muted-foreground p-4 border rounded-md bg-muted/30">
                                    Awaiting evaluation...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
      case 3:
        const currentCondition = filterType === 'JAVASCRIPT' ? jsFunction 
                               : filterType === 'JSON-SCHEMA' ? jsonSchema
                               : filterCondition;
        return (
            <div className="space-y-4 text-sm">
                <h4 className="font-semibold mb-2">Confirm Subscription</h4>
                
                <div className="space-y-3 p-3 border rounded-md bg-muted/50">
                    <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Event Type:</span>
                        <span className="font-mono text-xs text-right">{eventType}</span>
                    </div>
                    <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Channel:</span>
                        <span className="text-right">{channelOptions.find(o => o.value === channelType)?.label}</span>
                    </div>
                    {channelType === 'EMAIL' && <div className="flex justify-between"><span className="text-muted-foreground">Email:</span><span>{email}</span></div>}
                    {channelType === 'WEBHOOK' && (
                        <>
                            <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span>{webhookName}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">Method:</span><span>{webhookMethod}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">URL:</span><span className="truncate ml-4 text-right">{webhookUrl}</span></div>
                        </>
                    )}
                    {channelType === 'TEAMS_WEBHOOK' && (
                         <>
                            <div className="flex justify-between"><span className="text-muted-foreground">Name:</span><span>{teamsName}</span></div>
                            <div className="flex justify-between"><span className="text-muted-foreground">URL:</span><span className="truncate ml-4 text-right">{webhookUrl}</span></div>
                        </>
                    )}
                </div>
                
                <div className="space-y-2 p-3 border rounded-md bg-muted/50">
                     <div className="flex justify-between items-start">
                        <span className="text-muted-foreground">Condition Type:</span>
                        <span>{filterOptions.find(o => o.value === filterType)?.label}</span>
                    </div>
                     {filterType !== 'NONE' && (
                        <div className="space-y-1">
                            <Label className="text-muted-foreground">Condition:</Label>
                            {(filterType === 'JSON-SCHEMA' || filterType === 'JAVASCRIPT') ? (
                                filterType === 'JSON-SCHEMA' ? (
                                    <div className="overflow-hidden rounded-md border bg-background">
                                        <MonacoEditor
                                            height="112px"
                                            language="json"
                                            value={currentCondition}
                                            options={{
                                                readOnly: true,
                                                minimap: { enabled: false },
                                                scrollBeyondLastLine: false,
                                                automaticLayout: true,
                                                fontSize: 12,
                                                lineNumbers: 'off',
                                            }}
                                        />
                                    </div>
                                ) : (
                                    <Textarea 
                                        value={currentCondition} 
                                        readOnly 
                                        className="font-mono text-xs h-28 bg-background"
                                    />
                                )
                            ) : (
                                <p className="font-mono text-xs p-2 bg-background rounded-md border">{currentCondition}</p>
                            )}
                        </div>
                    )}
                </div>
            </div>
        );
      default:
        return null;
    }
  }

    const panelContent = (
        <>
            <div className="border-b p-6 pb-4">
                <h2 className="text-lg font-semibold">{isEditMode ? 'Edit Subscription' : 'Subscribe to event'}</h2>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                    <span>{isEditMode ? 'Modify' : 'Get notified when'} event occurs:</span>
                    <Badge variant="secondary" className="max-w-full truncate">{eventType ?? 'Unknown event'}</Badge>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 pt-4">
                <Stepper currentStep={step} steps={["Channels", "Filters", "Confirmation"]} />
                <div className="min-h-[200px]">
                    {renderStepContent()}
                </div>
            </div>

            <div className="flex w-full items-center justify-between border-t p-6 pt-4">
                <div>
                    {step > 1 && <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}><ArrowLeft className="mr-2 h-4 w-4"/>Back</Button>}
                </div>
                <div className="flex space-x-2">
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
                    {step < 3 && <Button onClick={handleNext}>Next</Button>}
                    {step === 3 && <Button onClick={handleSubmit} disabled={isSubmitting}>
                        {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
                        {isEditMode ? 'Save Changes' : 'Confirm Subscription'}
                    </Button>}
                </div>
            </div>
        </>
    );

    if (presentation === 'inline') {
        if (!isOpen) return null;

        return (
            <Card className={cn("flex h-full min-h-[650px] flex-col overflow-hidden", className)}>
                {panelContent}
            </Card>
        );
    }

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent side="right" className={cn("w-full sm:max-w-3xl lg:max-w-5xl p-0", className)}>
                <SheetHeader className="sr-only">
                    <SheetTitle>{isEditMode ? 'Edit Subscription' : 'Subscribe to event'}</SheetTitle>
                    <SheetDescription>
                        {isEditMode ? 'Modify' : 'Get notified when'} a "{eventType}" event occurs.
                    </SheetDescription>
                </SheetHeader>
                <div className="h-full p-4">
                    <Card className="flex h-full flex-col overflow-hidden bg-white">
                        {panelContent}
                    </Card>
                </div>
            </SheetContent>
        </Sheet>
    );
};
