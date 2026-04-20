'use client';

import type { InitProgressReport, MLCEngineInterface } from '@mlc-ai/web-llm';
import type { FileUIPart } from 'ai';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from '@/components/ai-elements/conversation';
import {
  Message,
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
  MessageContent,
  MessageResponse,
} from '@/components/ai-elements/message';
import {
  ModelSelector,
  ModelSelectorContent,
  ModelSelectorEmpty,
  ModelSelectorGroup,
  ModelSelectorInput,
  ModelSelectorItem,
  ModelSelectorList,
  ModelSelectorLogo,
  ModelSelectorLogoGroup,
  ModelSelectorName,
  ModelSelectorTrigger,
} from '@/components/ai-elements/model-selector';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputHeader,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
  usePromptInputAttachments,
} from '@/components/ai-elements/prompt-input';
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from '@/components/ai-elements/reasoning';
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from '@/components/ai-elements/sources';
import { SpeechInput } from '@/components/ai-elements/speech-input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { CheckIcon, AlertCircleIcon, BotIcon, CpuIcon, GlobeIcon, SparklesIcon, WandSparklesIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useEffect, useMemo, useState } from 'react';

type WebLLMModule = typeof import('@mlc-ai/web-llm');

interface WebLlmChatbotProps {
  variant?: 'page' | 'panel';
}

interface ChatMessage {
  key: string;
  from: 'user' | 'assistant';
  status?: 'streaming' | 'error';
  sources?: { href: string; title: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration?: number;
    isStreaming?: boolean;
  };
}

interface ModelOption {
  chef: string;
  chefSlug: 'alibaba';
  id: string;
  name: string;
  note: string;
  providers: ('alibaba' | 'huggingface')[];
}

const DEFAULT_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';
const MODEL_STORAGE_KEY = 'lamassu-webllm-model';
const SYSTEM_PROMPT = [
  'You are Lamassu Dashboard Assistant.',
  'Answer clearly and concisely.',
  'Focus on PKI, certificates, device identity, KMS, and IoT operations when relevant.',
  'If a request could be risky, call out the risk and suggest a safer path.',
].join(' ');

const models: ModelOption[] = [
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    note: 'Fastest startup, lighter answers',
    providers: ['alibaba', 'huggingface'],
  },
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    note: 'Balanced local chat option',
    providers: ['alibaba', 'huggingface'],
  },
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 3B',
    note: 'Better quality, heavier download',
    providers: ['alibaba', 'huggingface'],
  },
  {
    chef: 'Qwen 3',
    chefSlug: 'alibaba',
    id: DEFAULT_MODEL_ID,
    name: 'Qwen3 1.7B',
    note: 'Recommended default and supported by the installed WebLLM build',
    providers: ['alibaba', 'huggingface'],
  },
];

const suggestions = [
  'Explain the difference between a root CA and an intermediate CA.',
  'Give me a safe checklist for rotating a device certificate.',
  'What should I validate in a CSR before issuing a certificate?',
  'Draft a short incident response plan for a compromised registration authority.',
  'Summarize common reasons a certificate chain fails validation.',
  'How should I structure key rotation for a device fleet?',
];

const modelGroups = ['Qwen 2.5', 'Qwen 3'];

let workerInstance: Worker | null = null;
let webllmModulePromise: Promise<WebLLMModule> | null = null;
let enginePromise: Promise<MLCEngineInterface> | null = null;
let activeModelId: string | null = null;

function getBrowserWorker() {
  if (!workerInstance) {
    workerInstance = new Worker(new URL('./webllm.worker.ts', import.meta.url), {
      type: 'module',
    });
  }

  return workerInstance;
}

function resetEngineCache() {
  if (workerInstance) {
    workerInstance.terminate();
    workerInstance = null;
  }

  enginePromise = null;
  activeModelId = null;
}

async function loadWebLLMModule() {
  if (!webllmModulePromise) {
    webllmModulePromise = import('@mlc-ai/web-llm');
  }

  return webllmModulePromise;
}

async function ensureEngine(
  modelId: string,
  onInitProgress: (report: InitProgressReport) => void,
) {
  const webllm = await loadWebLLMModule();

  if (!enginePromise) {
    enginePromise = webllm.CreateWebWorkerMLCEngine(
      getBrowserWorker(),
      modelId,
      {
        initProgressCallback: onInitProgress,
        appConfig: {
          ...webllm.prebuiltAppConfig,
          useIndexedDBCache: true,
        },
      },
    );

    try {
      const engine = await enginePromise;
      activeModelId = modelId;
      return engine;
    } catch (error) {
      resetEngineCache();
      throw error;
    }
  }

  const engine = await enginePromise;
  engine.setInitProgressCallback(onInitProgress);

  if (activeModelId !== modelId) {
    try {
      await engine.reload(modelId);
      activeModelId = modelId;
    } catch (error) {
      resetEngineCache();
      throw error;
    }
  }

  return engine;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'The local model failed to initialize or generate a response.';
}

function formatProgress(report: InitProgressReport | null) {
  if (!report) {
    return 0;
  }

  const value = Number.isFinite(report.progress) ? report.progress * 100 : 0;
  return Math.min(100, Math.max(0, value));
}

const AttachmentItem = ({
  attachment,
  onRemove,
}: {
  attachment: FileUIPart & { id: string };
  onRemove: (id: string) => void;
}) => {
  const handleRemove = useCallback(() => {
    onRemove(attachment.id);
  }, [attachment.id, onRemove]);

  return (
    <Attachment data={attachment} onRemove={handleRemove}>
      <AttachmentPreview />
      <AttachmentRemove />
    </Attachment>
  );
};

const PromptInputAttachmentsDisplay = () => {
  const attachments = usePromptInputAttachments();

  const handleRemove = useCallback(
    (id: string) => {
      attachments.remove(id);
    },
    [attachments],
  );

  if (attachments.files.length === 0) {
    return null;
  }

  return (
    <Attachments variant="inline">
      {attachments.files.map((attachment) => (
        <AttachmentItem
          attachment={attachment}
          key={attachment.id}
          onRemove={handleRemove}
        />
      ))}
    </Attachments>
  );
};

const QuickPromptItem = ({
  suggestion,
  onClick,
}: {
  suggestion: string;
  onClick: (suggestion: string) => void;
}) => {
  const handleClick = useCallback(() => {
    onClick(suggestion);
  }, [onClick, suggestion]);

  return (
    <Button
      className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left"
      onClick={handleClick}
      type="button"
      variant="outline"
    >
      {suggestion}
    </Button>
  );
};

const ModelItem = ({
  m,
  isSelected,
  onSelect,
}: {
  m: ModelOption;
  isSelected: boolean;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(m.id);
  }, [m.id, onSelect]);

  return (
    <ModelSelectorItem onSelect={handleSelect} value={`${m.name} ${m.note} ${m.id}`}>
      <ModelSelectorLogo provider={m.chefSlug} />
      <ModelSelectorName>{m.name}</ModelSelectorName>
      <ModelSelectorLogoGroup>
        {m.providers.map((provider) => (
          <ModelSelectorLogo key={provider} provider={provider} />
        ))}
      </ModelSelectorLogoGroup>
      {isSelected ? (
        <CheckIcon className="ml-auto size-4" />
      ) : (
        <div className="ml-auto size-4" />
      )}
    </ModelSelectorItem>
  );
};

export function WebLlmChatbot({ variant = 'page' }: WebLlmChatbotProps) {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [text, setText] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [progressReport, setProgressReport] = useState<InitProgressReport | null>(null);
  const [gpuVendor, setGpuVendor] = useState<string | null>(null);
  const [runtimeStats, setRuntimeStats] = useState<string | null>(null);
  const [hasWebGpuSupport, setHasWebGpuSupport] = useState<boolean | null>(null);
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(false);

  const isPanel = variant === 'panel';

  useEffect(() => {
    const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (storedModel && models.some((candidate) => candidate.id === storedModel)) {
      setModel(storedModel);
    }

    const gpuCapableNavigator = navigator as Navigator & { gpu?: unknown };
    setHasWebGpuSupport(Boolean(gpuCapableNavigator.gpu));
  }, []);

  useEffect(() => {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model]);

  const selectedModelData = useMemo(
    () => models.find((candidate) => candidate.id === model) ?? models.at(-1),
    [model],
  );

  const updateMessage = useCallback(
    (messageKey: string, updater: (message: ChatMessage) => ChatMessage) => {
      setMessages((currentMessages) =>
        currentMessages.map((message) =>
          message.key === messageKey ? updater(message) : message,
        ),
      );
    },
    [],
  );

  const syncEngineDiagnostics = useCallback(async (engine: MLCEngineInterface) => {
    const [vendor, stats] = await Promise.all([
      engine.getGPUVendor(),
      engine.runtimeStatsText(),
    ]);

    setGpuVendor(vendor || 'Unknown GPU vendor');
    setRuntimeStats(stats);
  }, []);

  const handleStop = useCallback(async () => {
    if (!enginePromise) {
      return;
    }

    try {
      const engine = await enginePromise;
      engine.interruptGenerate();
    } catch (_) {
      // Nothing else to do if the engine is already unavailable.
    }
  }, []);

  const handleModelSelect = useCallback((modelId: string) => {
    setModel(modelId);
    setModelSelectorOpen(false);
    setProgressReport(null);
    setRuntimeStats(null);
    setEngineError(null);
  }, []);

  const handleTextChange = useCallback(
    (event: React.ChangeEvent<HTMLTextAreaElement>) => {
      setText(event.target.value);
    },
    [],
  );

  const handleTranscriptionChange = useCallback((transcript: string) => {
    setText((previous) => (previous ? `${previous} ${transcript}` : transcript));
  }, []);

  const handleSuggestionClick = useCallback((suggestion: string) => {
    setText(suggestion);
    setQuickPromptsOpen(false);
  }, []);

  const toggleWebSearch = useCallback(() => {
    setUseWebSearch((previous) => !previous);
  }, []);

  const streamAssistantReply = useCallback(
    async ({
      assistantKey,
      conversation,
      messageId,
      selectedModel,
      selectedModelName,
      startedAt,
    }: {
      assistantKey: string;
      conversation: ChatMessage[];
      messageId: string;
      selectedModel: string;
      selectedModelName: string;
      startedAt: number;
    }) => {
      if (hasWebGpuSupport === false) {
        const errorMessage = 'WebGPU is not available in this browser. Use a recent Chrome or Edge build with WebGPU enabled.';
        setEngineError(errorMessage);
        setStatus('error');
        updateMessage(assistantKey, (message) => ({
          ...message,
          status: 'error',
          reasoning: {
            content: 'WebGPU support is required for local inference.',
            duration: 0,
            isStreaming: false,
          },
          versions: message.versions.map((version) =>
            version.id === messageId ? { ...version, content: errorMessage } : version,
          ),
        }));
        return;
      }

      try {
        setStatus('submitted');
        const engine = await ensureEngine(selectedModel, (report) => {
          setProgressReport(report);
          updateMessage(assistantKey, (message) => ({
            ...message,
            reasoning: {
              content: report.text,
              duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
              isStreaming: true,
            },
          }));
        });

        setStatus('streaming');

        updateMessage(assistantKey, (message) => ({
          ...message,
          reasoning: {
            content: `Generating a response locally with ${selectedModelName}.`,
            duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            isStreaming: true,
          },
        }));

        const stream = await engine.chat.completions.create({
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            ...conversation.map((message) => ({
              role: message.from,
              content: message.versions[0]?.content ?? '',
            })),
          ],
          stream: true,
          stream_options: { include_usage: true },
          temperature: 0.6,
        });

        let reply = '';

        for await (const chunk of stream) {
          const delta = chunk.choices[0]?.delta.content ?? '';
          if (!delta) {
            continue;
          }

          reply += delta;
          updateMessage(assistantKey, (message) => ({
            ...message,
            status: 'streaming',
            versions: message.versions.map((version) =>
              version.id === messageId ? { ...version, content: reply } : version,
            ),
          }));
        }

        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        updateMessage(assistantKey, (message) => ({
          ...message,
          status: undefined,
          reasoning: {
            content: `Response generated locally with ${selectedModelName} on WebGPU.`,
            duration,
            isStreaming: false,
          },
          versions: message.versions.map((version) =>
            version.id === messageId
              ? { ...version, content: reply || 'No output returned.' }
              : version,
          ),
        }));

        setStatus('ready');
        setProgressReport(null);
        await syncEngineDiagnostics(engine);
      } catch (error) {
        const message = normalizeError(error);
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        setEngineError(message);
        setStatus('error');
        setProgressReport(null);

        updateMessage(assistantKey, (currentMessage) => ({
          ...currentMessage,
          status: 'error',
          reasoning: {
            content: 'The local model returned an error while generating the response.',
            duration,
            isStreaming: false,
          },
          versions: currentMessage.versions.map((version) =>
            version.id === messageId ? { ...version, content: message } : version,
          ),
        }));
      }
    },
    [hasWebGpuSupport, syncEngineDiagnostics, updateMessage],
  );

  const handleSubmit = useCallback(
    async (message: PromptInputMessage) => {
      const prompt = message.text.trim();
      const hasText = Boolean(prompt);
      const hasAttachments = Boolean(message.files?.length);

      if (!(hasText || hasAttachments)) {
        return;
      }

      if (hasAttachments) {
        sileo.info({
          title: 'Attachments captured',
          description: 'The current local WebLLM flow does not parse attachment contents yet, so only your typed text will be sent.',
        });
      }

      if (!hasText) {
        sileo.warning({
          title: 'Text required',
          description: 'Add a text prompt alongside attachments so the local model has something to answer.',
        });
        return;
      }

      setEngineError(null);

      const userMessage: ChatMessage = {
        from: 'user',
        key: nanoid(),
        versions: [
          {
            content: prompt,
            id: nanoid(),
          },
        ],
      };

      const assistantKey = nanoid();
      const assistantVersionId = nanoid();
      const assistantMessage: ChatMessage = {
        from: 'assistant',
        key: assistantKey,
        status: 'streaming',
        reasoning: {
          content: 'Preparing the local model.',
          duration: 0,
          isStreaming: true,
        },
        versions: [
          {
            content: '',
            id: assistantVersionId,
          },
        ],
      };

      const conversation = [...messages, userMessage];
      setMessages((previous) => [...previous, userMessage, assistantMessage]);
      setText('');

      if (useWebSearch) {
        sileo.info({
          title: 'Search mode enabled',
          description: 'This panel still answers locally with WebLLM only. Remote retrieval is not wired yet.',
        });
      }

      void streamAssistantReply({
        assistantKey,
        conversation,
        messageId: assistantVersionId,
        selectedModel: model,
        selectedModelName: selectedModelData?.name ?? 'the selected model',
        startedAt: Date.now(),
      });
    },
    [messages, model, selectedModelData?.name, streamAssistantReply, useWebSearch],
  );

  const isSubmitDisabled = useMemo(
    () => !text.trim() || status === 'streaming' || status === 'submitted',
    [status, text],
  );

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4', isPanel ? 'h-full' : 'min-h-[720px]')}>
      {!isPanel && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Chatbot</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Local chat powered by WebLLM and WebGPU. The selected Qwen model downloads on first use and is cached in the browser.
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-md border bg-card">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasWebGpuSupport ? 'default' : 'outline'}>
              {hasWebGpuSupport ? 'WebGPU ready' : 'WebGPU required'}
            </Badge>
            <Badge variant="outline">{selectedModelData?.name}</Badge>
            {gpuVendor && (
              <Badge variant="outline">
                <CpuIcon className="mr-1 size-3.5" />
                {gpuVendor}
              </Badge>
            )}
            {useWebSearch && (
              <Badge variant="outline">
                <GlobeIcon className="mr-1 size-3.5" />
                Search UI only
              </Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{selectedModelData?.note}</p>
          {progressReport && (
            <div className="mt-3 space-y-2">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <SparklesIcon className="size-3.5" />
                <span>{progressReport.text}</span>
              </div>
              <Progress value={formatProgress(progressReport)} />
            </div>
          )}
          {runtimeStats && !progressReport && (
            <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{runtimeStats}</p>
          )}
        </div>

        {hasWebGpuSupport === false && (
          <div className="border-b px-4 py-3">
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>WebGPU unavailable</AlertTitle>
              <AlertDescription>
                This chatbot needs WebGPU for local inference. Open the dashboard in a compatible Chrome or Edge build to use it.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {engineError && (
          <div className="border-b px-4 py-3">
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>Local model error</AlertTitle>
              <AlertDescription>{engineError}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col divide-y overflow-hidden">
          <Conversation>
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState
                  description="Start a conversation and the selected Qwen model will load locally in your browser."
                  icon={<BotIcon className="size-5" />}
                  title="No messages yet"
                />
              ) : (
                messages.map(({ versions, ...message }) => (
                  <MessageBranch defaultBranch={0} key={message.key}>
                    <MessageBranchContent>
                      {versions.map((version) => (
                        <Message from={message.from} key={`${message.key}-${version.id}`}>
                          <div>
                            {message.sources?.length ? (
                              <Sources>
                                <SourcesTrigger count={message.sources.length} />
                                <SourcesContent>
                                  {message.sources.map((source) => (
                                    <Source
                                      href={source.href}
                                      key={source.href}
                                      title={source.title}
                                    />
                                  ))}
                                </SourcesContent>
                              </Sources>
                            ) : null}

                            {message.reasoning ? (
                              <Reasoning
                                duration={message.reasoning.duration}
                                isStreaming={message.reasoning.isStreaming}
                              >
                                <ReasoningTrigger />
                                <ReasoningContent>
                                  {message.reasoning.content}
                                </ReasoningContent>
                              </Reasoning>
                            ) : null}

                            <MessageContent>
                              <MessageResponse>
                                {version.content || (message.status === 'streaming' ? 'Thinking…' : '')}
                              </MessageResponse>
                            </MessageContent>
                          </div>
                        </Message>
                      ))}
                    </MessageBranchContent>
                    {versions.length > 1 ? (
                      <MessageBranchSelector>
                        <MessageBranchPrevious />
                        <MessageBranchPage />
                        <MessageBranchNext />
                      </MessageBranchSelector>
                    ) : null}
                  </MessageBranch>
                ))
              )}
            </ConversationContent>
            <ConversationScrollButton />
          </Conversation>

          <div className="grid shrink-0 gap-4 pt-4">
            <div className="w-full px-4 pb-4">
              <PromptInput globalDrop multiple onSubmit={handleSubmit}>
                <PromptInputHeader>
                  <PromptInputAttachmentsDisplay />
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    disabled={hasWebGpuSupport === false || status === 'streaming' || status === 'submitted'}
                    onChange={handleTextChange}
                    placeholder="Ask about PKI, devices, registrations, keys, or anything you want to reason through locally."
                    value={text}
                  />
                </PromptInputBody>
                <PromptInputFooter className="flex-wrap items-center gap-2">
                  <PromptInputTools className="flex-1 flex-wrap">
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                    <SpeechInput
                      className="shrink-0"
                      onTranscriptionChange={handleTranscriptionChange}
                      size="icon"
                      variant="ghost"
                    />
                    <Popover onOpenChange={setQuickPromptsOpen} open={quickPromptsOpen}>
                      <PopoverTrigger asChild>
                        <PromptInputButton type="button" variant={quickPromptsOpen ? 'default' : 'ghost'}>
                          <WandSparklesIcon size={16} />
                          <span>Quick prompts</span>
                        </PromptInputButton>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[320px] p-3" side="top">
                        <div className="space-y-3">
                          <div className="space-y-1">
                            <p className="text-sm font-medium text-foreground">Quick prompts</p>
                            <p className="text-xs text-muted-foreground">
                              Fill the input with a starter prompt.
                            </p>
                          </div>
                          <div className="flex flex-col gap-2">
                            {(isPanel ? suggestions.slice(0, 4) : suggestions).map((suggestion) => (
                              <QuickPromptItem
                                key={suggestion}
                                onClick={handleSuggestionClick}
                                suggestion={suggestion}
                              />
                            ))}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                    <PromptInputButton
                      onClick={toggleWebSearch}
                      type="button"
                      variant={useWebSearch ? 'default' : 'ghost'}
                    >
                      <GlobeIcon size={16} />
                      <span>Search</span>
                    </PromptInputButton>
                    <ModelSelector
                      onOpenChange={setModelSelectorOpen}
                      open={modelSelectorOpen}
                    >
                      <ModelSelectorTrigger asChild>
                        <PromptInputButton type="button">
                          {selectedModelData?.chefSlug ? (
                            <ModelSelectorLogo provider={selectedModelData.chefSlug} />
                          ) : null}
                          {selectedModelData?.name ? (
                            <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                          ) : null}
                        </PromptInputButton>
                      </ModelSelectorTrigger>
                      <ModelSelectorContent>
                        <ModelSelectorInput placeholder="Search models..." />
                        <ModelSelectorList>
                          <ModelSelectorEmpty>No models found.</ModelSelectorEmpty>
                          {modelGroups.map((group) => (
                            <ModelSelectorGroup heading={group} key={group}>
                              {models
                                .filter((candidate) => candidate.chef === group)
                                .map((candidate) => (
                                  <ModelItem
                                    isSelected={model === candidate.id}
                                    key={candidate.id}
                                    m={candidate}
                                    onSelect={handleModelSelect}
                                  />
                                ))}
                            </ModelSelectorGroup>
                          ))}
                        </ModelSelectorList>
                      </ModelSelectorContent>
                    </ModelSelector>
                  </PromptInputTools>
                  <PromptInputSubmit
                    className="ml-auto shrink-0"
                    disabled={isSubmitDisabled}
                    onStop={() => void handleStop()}
                    status={status}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
