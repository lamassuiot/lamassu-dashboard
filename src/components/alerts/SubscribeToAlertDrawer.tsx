'use client';

import React, { useState, useEffect } from 'react';
import dynamic from '@/components/shared/dynamic';
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
    SheetDescription,
    SheetFooter,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { sileo } from '@/lib/toast';
import { useAuth } from '@/contexts/AuthContext';
import { Loader2, Mail, Users, Webhook, Check, ArrowLeft, ArrowRight, Info, AlertTriangle } from 'lucide-react';
import { subscribeToAlert, type SubscriptionPayload, type ApiSubscription, updateSubscription } from '@/lib/alerts-api';
import { cn } from '@/lib/utils';
import { JSONPath } from 'jsonpath-plus';
import { Validator } from 'jsonschema';
import { checkJsFilterSyntax, runJsFilter } from '@/lib/js-filter';
import { Alert, AlertDescription as AlertDescUI } from '@/components/ui/alert';
import { createSchema } from 'genson-js';
import { Stepper } from '@/components/shared/Stepper';
import { CardSelector } from '@/components/shared/CardSelector';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
import { useMonacoTheme } from '@/hooks/useMonacoTheme';
import { FormFieldError, FormValidationSummary } from '@/components/shared/FormValidationSummary';

const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
    ssr: false,
});


interface SubscribeToAlertDrawerProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
  eventType: string | null;
  samplePayload: object | null;
  onSuccess: () => void;
  subscriptionToEdit?: ApiSubscription | null;
}

type ChannelType = 'EMAIL' | 'TEAMS_WEBHOOK' | 'WEBHOOK';

const channelOptions: { value: ChannelType; label: string; description: string; icon: React.ElementType }[] = [
    { value: 'EMAIL', label: 'Email', description: 'Send a message to an address', icon: Mail },
    { value: 'TEAMS_WEBHOOK', label: 'Teams', description: 'Post to a Teams channel', icon: Users },
    { value: 'WEBHOOK', label: 'Webhook', description: 'Call a custom HTTP endpoint', icon: Webhook },
];

const filterOptions = [
    { value: 'NONE', label: 'None' },
    { value: 'JSON-PATH', label: 'JSON Path' },
    { value: 'JSON-SCHEMA', label: 'JSON Schema' },
    { value: 'JAVASCRIPT', label: 'Javascript' },
];

const isValidEmail = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const isValidWebhookUrl = (value: string) => {
    try {
        const url = new URL(value);
        return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
        return false;
    }
};


const editorOptions = {
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    automaticLayout: true,
    fontSize: 12,
    lineNumbersMinChars: 3,
    wordWrap: 'on' as const,
};

const Field: React.FC<{ id: string; label: string; error?: string | null; children: React.ReactNode }> = ({ id, label, error, children }) => (
    <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        {children}
        {error && <FormFieldError id={`${id}-error`} title={error} />}
    </div>
);

const EditorBox: React.FC<{ id?: string; invalid?: boolean; errorId?: string; children: React.ReactNode }> = ({ id, invalid, errorId, children }) => (
    <div
        id={id}
        aria-invalid={invalid}
        aria-describedby={errorId}
        className={cn('overflow-hidden rounded-md border', invalid && 'border-destructive ring-3 ring-destructive/20')}
    >
        {children}
    </div>
);

export const SubscribeToAlertDrawer: React.FC<SubscribeToAlertDrawerProps> = ({
  isOpen,
  onOpenChange,
  eventType,
  samplePayload,
  onSuccess,
  subscriptionToEdit,
}) => {
  const monacoTheme = useMonacoTheme();
  const { user } = useAuth();
  const isEditMode = !!subscriptionToEdit;

  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  
  // Step 1 State
  const [channelType, setChannelType] = useState<ChannelType>('EMAIL');
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
          const existingWebhookUrl = sub.channel.config.webhook_url || sub.channel.config.url || '';
          const existingWebhookMethod = sub.channel.config.webhook_method || sub.channel.config.method;
          setChannelType(sub.channel.type);
          setEmail(sub.channel.config.email || '');
          setWebhookUrl(existingWebhookUrl);
          setWebhookName(sub.channel.name || '');
          setTeamsName(sub.channel.name || '');
          setWebhookMethod(existingWebhookMethod === 'PUT' ? 'PUT' : 'POST');

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
    let cancelled = false;
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
                const outcome = await runJsFilter(jsFunction, jsonPayload);
                if (cancelled) return;

                if (!outcome.ok) {
                    setEvaluationResult({ match: false, message: `Evaluation error: ${outcome.error}`, error: true });
                } else if (outcome.returnType !== 'boolean') {
                    setEvaluationResult({ match: false, message: `Function returned type '${outcome.returnType}', but a boolean was expected.`, error: true });
                } else if (outcome.match) {
                    setEvaluationResult({ match: true, message: 'The filter matches this Cloud Event' });
                } else {
                    setEvaluationResult({ match: false, message: 'The filter does not match this Cloud Event' });
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
    
    void evaluate();
    return () => { cancelled = true; };
  }, [filterCondition, jsFunction, filterType, inputEvent, jsonSchema]);

  // Syntax is checked in the same worker that runs the filter, so it is asynchronous.
  // `jsSyntaxCheck.source` records what the result belongs to; a mismatch means a check is pending.
  const [jsSyntaxCheck, setJsSyntaxCheck] = useState<{ source: string; error: string | null } | null>(null);
  useEffect(() => {
    if (filterType !== 'JAVASCRIPT' || !jsFunction.trim()) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      // A failed check must still settle, otherwise the submit button would stay disabled.
      void checkJsFilterSyntax(jsFunction)
        .catch(() => null)
        .then(error => {
          if (!cancelled) setJsSyntaxCheck({ source: jsFunction, error });
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [filterType, jsFunction]);

  const emailError = channelType === 'EMAIL'
      ? !email.trim()
          ? 'Email address is required.'
          : !isValidEmail(email)
              ? 'Enter a valid email address.'
              : null
      : null;
  const webhookNameError = channelType === 'WEBHOOK' && !webhookName.trim()
      ? 'Webhook name is required.'
      : null;
  const teamsNameError = channelType === 'TEAMS_WEBHOOK' && !teamsName.trim()
      ? 'Microsoft Teams webhook name is required.'
      : null;
  const webhookUrlError = channelType !== 'EMAIL'
      ? !webhookUrl.trim()
          ? 'Webhook URL is required.'
          : !isValidWebhookUrl(webhookUrl)
              ? 'Enter a valid HTTP or HTTPS webhook URL.'
              : null
      : null;

  let filterError: string | null = null;
  if (filterType === 'JSON-PATH') {
      filterError = !filterCondition.trim()
          ? 'JSONPath expression is required.'
          : !filterCondition.trim().startsWith('$')
              ? 'JSONPath expression must start with "$".'
              : null;
  } else if (filterType === 'JSON-SCHEMA') {
      if (!jsonSchema.trim()) {
          filterError = 'JSON Schema is required.';
      } else {
          try {
              JSON.parse(jsonSchema);
          } catch {
              filterError = 'JSON Schema must contain valid JSON.';
          }
      }
  } else if (filterType === 'JAVASCRIPT') {
      if (!jsFunction.trim()) {
          filterError = 'Javascript function is required.';
      } else if (jsSyntaxCheck?.source === jsFunction && jsSyntaxCheck.error) {
          filterError = 'Javascript filter must contain a valid function.';
      }
  }
  const isCheckingJsFilter = filterType === 'JAVASCRIPT' && !!jsFunction.trim() && jsSyntaxCheck?.source !== jsFunction;

  const channelValidationErrors = [emailError, webhookNameError, teamsNameError, webhookUrlError]
      .filter((error): error is string => Boolean(error));
  const validationErrors = [
      !eventType ? 'Event type is required.' : null,
      ...channelValidationErrors,
      filterError,
  ].filter((error): error is string => Boolean(error));

  const handleNext = () => {
    if(step === 1) {
        if(channelValidationErrors.length > 0) return;
    }
    if (step === 2 && filterError) return;
    setStep(s => s + 1);
  }

  const handleBack = () => setStep(s => s - 1);

  const handleSubmit = async () => {
    if (!eventType || validationErrors.length > 0 || isCheckingJsFilter) return;
    
    setIsSubmitting(true);
    try {
        let config: any = {};
        if (channelType === 'EMAIL') {
            config = { email };
        } else if (channelType === 'WEBHOOK') {
            config = {
                webhook_url: webhookUrl,
                webhook_method: webhookMethod,
            };
        } else { // TEAMS_WEBHOOK
            config = { webhook_url: webhookUrl };
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
            await updateSubscription(subscriptionToEdit.id, payload);
        } else {
            await subscribeToAlert(payload);
        }
        
        onSuccess();
    } catch(e: any) {
        sileo.error({ title: isEditMode ? "Update Failed" : "Subscription Failed", description: e.message });
    } finally {
        setIsSubmitting(false);
    }
  }
  
  const currentCondition = filterType === 'JAVASCRIPT' ? jsFunction
                         : filterType === 'JSON-SCHEMA' ? jsonSchema
                         : filterCondition;

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
            <div className="space-y-6">
                <CardSelector
                    label="Channel Type"
                    value={channelType}
                    onChange={setChannelType}
                    options={channelOptions}
                />

                {channelType === 'EMAIL' && (
                    <Field id="email-input" label="Email Address" error={emailError}>
                        <Input id="email-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="your.email@example.com" aria-invalid={!!emailError} aria-describedby={emailError ? 'email-input-error' : undefined} />
                    </Field>
                )}
                {channelType === 'WEBHOOK' && (
                    <div className="space-y-4">
                        <Field id="webhook-name-input" label="Name" error={webhookNameError}>
                            <Input id="webhook-name-input" type="text" value={webhookName} onChange={e => setWebhookName(e.target.value)} placeholder="e.g., My Notification Endpoint" aria-invalid={!!webhookNameError} aria-describedby={webhookNameError ? 'webhook-name-input-error' : undefined} />
                        </Field>
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[140px_minmax(0,1fr)]">
                            <Field id="webhook-method-select" label="Method">
                                <Select value={webhookMethod} onValueChange={(v: 'POST' | 'PUT') => setWebhookMethod(v)}>
                                    <SelectTrigger id="webhook-method-select"><SelectValue /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="POST">POST</SelectItem>
                                        <SelectItem value="PUT">PUT</SelectItem>
                                    </SelectContent>
                                </Select>
                            </Field>
                            <Field id="webhook-url-input" label="Webhook URL" error={webhookUrlError}>
                                <Input id="webhook-url-input" type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-webhook-url.com" aria-invalid={!!webhookUrlError} aria-describedby={webhookUrlError ? 'webhook-url-input-error' : undefined} />
                            </Field>
                        </div>
                    </div>
                )}
                {channelType === 'TEAMS_WEBHOOK' && (
                    <div className="space-y-4">
                        <Field id="teams-name-input" label="Name" error={teamsNameError}>
                            <Input id="teams-name-input" type="text" value={teamsName} onChange={e => setTeamsName(e.target.value)} placeholder="e.g., Critical Alerts Team" aria-invalid={!!teamsNameError} aria-describedby={teamsNameError ? 'teams-name-input-error' : undefined} />
                        </Field>
                        <Field id="webhook-url-input-teams" label="Incoming Microsoft Teams Webhook URL" error={webhookUrlError}>
                            <Input id="webhook-url-input-teams" type="url" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} placeholder="https://your-tenant.webhook.office.com/..." aria-invalid={!!webhookUrlError} aria-describedby={webhookUrlError ? 'webhook-url-input-teams-error' : undefined} />
                        </Field>
                    </div>
                )}
            </div>
        );
      case 2:
        return (
            <div className="space-y-6">
                <Field id="filter-type" label="Filter or Condition Format">
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
                </Field>
                {filterType === 'NONE' && (
                    <p className="text-sm text-muted-foreground">
                        Without a filter you will be notified every time this event occurs.
                    </p>
                )}
                {filterType === 'JSON-PATH' && (
                    <Field id="filter-condition-jsonpath" label="JSONPath Expression" error={filterError}>
                        <Input id="filter-condition-jsonpath" value={filterCondition} onChange={e => setFilterCondition(e.target.value)} placeholder="Enter JSONPath expression..." aria-invalid={!!filterError} aria-describedby={filterError ? 'filter-condition-jsonpath-error' : undefined} />
                    </Field>
                )}
                {filterType === 'JAVASCRIPT' && (
                    <Field id="filter-condition-js" label="Javascript Function" error={filterError}>
                        <EditorBox id="filter-condition-js" invalid={!!filterError} errorId={filterError ? 'filter-condition-js-error' : undefined}>
                            <MonacoEditor
                                height="220px"
                                language="javascript"
                                value={jsFunction}
                                onChange={(value) => setJsFunction(value ?? '')}
                                theme={monacoTheme}
                                options={editorOptions}
                            />
                        </EditorBox>
                    </Field>
                )}
                {filterType === 'JSON-SCHEMA' && (
                    <Field id="filter-condition-jsonschema" label="JSON Schema" error={filterError}>
                        <EditorBox id="filter-condition-jsonschema" invalid={!!filterError} errorId={filterError ? 'filter-condition-jsonschema-error' : undefined}>
                            <MonacoEditor
                                height="220px"
                                language="json"
                                value={jsonSchema}
                                onChange={(value) => setJsonSchema(value ?? '')}
                                theme={monacoTheme}
                                options={editorOptions}
                            />
                        </EditorBox>
                    </Field>
                )}
                {filterType !== 'NONE' && (
                    <div className="space-y-6 border-t pt-6">
                        <Field id="input-event" label="Input Event">
                            <EditorBox id="input-event">
                                <MonacoEditor
                                    height="220px"
                                    language="json"
                                    value={inputEvent}
                                    onChange={(value) => setInputEvent(value ?? '')}
                                    theme={monacoTheme}
                                    options={editorOptions}
                                />
                            </EditorBox>
                        </Field>
                        <div className="space-y-2">
                            <Label>Evaluation Result</Label>
                            {evaluationResult ? (
                                <Alert variant={evaluationResult.error ? 'destructive' : evaluationResult.match ? 'success' : 'warning'}>
                                    {evaluationResult.error ? <AlertTriangle className="h-4 w-4" />
                                        : evaluationResult.match ? <Check className="h-4 w-4" />
                                        : <Info className="h-4 w-4" />}
                                    <AlertDescUI>{evaluationResult.message}</AlertDescUI>
                                </Alert>
                            ) : (
                                <div className="flex items-center justify-center rounded-md border bg-muted/30 p-4 text-sm text-muted-foreground">
                                    Awaiting evaluation...
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
      case 3:
        return (
            <div className="space-y-6">
                <section className="space-y-1">
                    <h3 className="text-sm font-semibold">Channel</h3>
                    <DetailInfoRows>
                        <DetailInfoRow label="Event Type" value={<span className="font-mono text-xs">{eventType}</span>} />
                        <DetailInfoRow label="Channel" value={channelOptions.find(o => o.value === channelType)?.label} />
                        {channelType === 'EMAIL' && <DetailInfoRow label="Email" value={email} />}
                        {channelType === 'WEBHOOK' && (
                            <>
                                <DetailInfoRow label="Name" value={webhookName} />
                                <DetailInfoRow label="Method" value={webhookMethod} />
                                <DetailInfoRow label="URL" value={<span className="font-mono text-xs">{webhookUrl}</span>} />
                            </>
                        )}
                        {channelType === 'TEAMS_WEBHOOK' && (
                            <>
                                <DetailInfoRow label="Name" value={teamsName} />
                                <DetailInfoRow label="URL" value={<span className="font-mono text-xs">{webhookUrl}</span>} />
                            </>
                        )}
                    </DetailInfoRows>
                </section>

                <section className="space-y-2">
                    <h3 className="text-sm font-semibold">Condition</h3>
                    {filterType === 'NONE' ? (
                        <p className="text-sm text-muted-foreground">No filter, every occurrence of this event will notify.</p>
                    ) : (
                        <>
                            <Badge variant="secondary">{filterOptions.find(o => o.value === filterType)?.label}</Badge>
                            {filterType === 'JSON-SCHEMA' || filterType === 'JAVASCRIPT' ? (
                                <EditorBox>
                                    <MonacoEditor
                                        height="140px"
                                        language={filterType === 'JSON-SCHEMA' ? 'json' : 'javascript'}
                                        value={currentCondition}
                                        theme={monacoTheme}
                                        options={{ ...editorOptions, readOnly: true, lineNumbers: 'off' }}
                                    />
                                </EditorBox>
                            ) : (
                                <p className="rounded-md border bg-muted/30 p-2 font-mono text-xs">{currentCondition}</p>
                            )}
                        </>
                    )}
                </section>
            </div>
        );
      default:
        return null;
    }
  };

    return (
        <Sheet open={isOpen} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="p-0 data-[side=right]:w-full data-[side=right]:sm:w-[70vw] data-[side=right]:lg:w-1/2 data-[side=right]:sm:max-w-none"
            >
                <SheetHeader className="border-b px-6 py-5 pr-14 text-left">
                    <SheetTitle>{isEditMode ? 'Edit Subscription' : 'Subscribe to event'}</SheetTitle>
                    <SheetDescription>
                        {isEditMode ? 'Modify' : 'Get notified when'} this event occurs.
                    </SheetDescription>
                    <div className="mt-1 flex flex-wrap gap-2">
                        <Badge variant="secondary" className="font-mono">{eventType ?? 'Unknown event'}</Badge>
                    </div>
                </SheetHeader>

                <div className="flex-1 overflow-y-auto px-6 py-6">
                    <Stepper currentStep={step} steps={["Channel", "Filter", "Confirm"]} />
                    {renderStepContent()}
                </div>

                <SheetFooter className="gap-3 border-t px-6 py-4">
                    <FormValidationSummary errors={validationErrors} />
                    <div className="flex w-full items-center justify-between">
                        <div>
                            {step > 1 && (
                                <Button variant="ghost" onClick={handleBack} disabled={isSubmitting}>
                                    <ArrowLeft className="mr-2 h-4 w-4" />Back
                                </Button>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button variant="secondary" onClick={() => onOpenChange(false)} disabled={isSubmitting}>Cancel</Button>
                            {step < 3 && (
                                <Button onClick={handleNext} disabled={step === 1 ? channelValidationErrors.length > 0 : !!filterError}>
                                    Next<ArrowRight className="ml-2 h-4 w-4" />
                                </Button>
                            )}
                            {step === 3 && (
                                <Button onClick={handleSubmit} disabled={isSubmitting || validationErrors.length > 0 || isCheckingJsFilter}>
                                    {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {isEditMode ? 'Save Changes' : 'Confirm Subscription'}
                                </Button>
                            )}
                        </div>
                    </div>
                </SheetFooter>
            </SheetContent>
        </Sheet>
    );
};
