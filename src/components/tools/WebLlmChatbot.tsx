'use client';

import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionMessageParam,
  ChatCompletionMessageToolCall,
  ChatCompletionToolMessageParam,
  InitProgressReport,
  MLCEngineInterface,
} from '@mlc-ai/web-llm';
import type { FileUIPart } from 'ai';
import {
  Attachment,
  AttachmentPreview,
  AttachmentRemove,
  Attachments,
} from '@/components/ai-elements/attachments';
import {
  Confirmation,
  ConfirmationAccepted,
  ConfirmationAction,
  ConfirmationActions,
  ConfirmationRejected,
  ConfirmationRequest,
  ConfirmationTitle,
} from '@/components/ai-elements/confirmation';
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
  ModelSelectorLogo,
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
import {
  Tool,
  ToolContent,
  ToolHeader,
  ToolInput,
  ToolOutput,
} from '@/components/ai-elements/tool';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import {
  CHAT_TOOL_COUNT,
  createSyntheticToolCall,
  createPendingToolInvocation,
  createToolResultMessage,
  executeChatToolCall,
  getChatToolPlanningCatalog,
  isDestructiveTool,
  type ChatToolInvocation,
} from '@/lib/chat-tools';
import {
  ensureSeedIndex,
  searchSeedIndex,
  type RagIndexSummary,
  type RagSearchResult,
} from '@/lib/local-rag';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { AlertCircleIcon, BotIcon, CheckIcon, ChevronDownIcon, CpuIcon, GlobeIcon, GripHorizontalIcon, SearchIcon, SparklesIcon, WandSparklesIcon, WrenchIcon } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

type WebLLMModule = typeof import('@mlc-ai/web-llm');

interface WebLlmChatbotProps {
  variant?: 'page' | 'panel';
}

interface ChatMessage {
  key: string;
  from: 'user' | 'assistant';
  status?: 'streaming' | 'error';
  sources?: { href: string; title: string }[];
  tools?: ChatToolInvocation[];
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
  chefSlug: 'alibaba' | 'llama' | 'mistral';
  id: string;
  name: string;
  note: string;
  providers: ('alibaba' | 'huggingface' | 'llama' | 'mistral')[];
  supportsToolCalling?: boolean;
  vram: string;
}

interface PendingToolSession {
  assistantKey: string;
  assistantVersionId: string;
  conversation: ChatMessage[];
  selectedModel: string;
  selectedModelName: string;
  ragResults: RagSearchResult[];
  toolCalls: ChatCompletionMessageToolCall[];
  toolMessages: Map<string, ChatCompletionToolMessageParam>;
  unresolvedToolIds: Set<string>;
}

interface ToolPlanningResult {
  assistant_response?: string | null;
  tool_calls?: Array<{
    name?: string;
    arguments?: Record<string, unknown>;
  }>;
}

const DEFAULT_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';
const MODEL_STORAGE_KEY = 'lamassu-webllm-model';
const SYSTEM_PROMPT = [
  'You are Lamassu Dashboard Assistant.',
  'Answer clearly and concisely.',
  'Focus on PKI, certificates, device identity, KMS, and IoT operations when relevant.',
  'If a request could be risky, call out the risk and suggest a safer path.',
].join(' ');
const TOOL_SYSTEM_PROMPT = [
  'You have access to live Lamassu dashboard REST tools.',
  'Use tools when the user asks about current dashboard state or asks to perform a dashboard action.',
  'Prefer tool calls over guessing when live data is needed.',
  'If no tool is needed, answer normally.',
  'Destructive tools require explicit user confirmation before execution.',
  'Never claim a tool ran unless tool output is present.',
].join(' ');
const PLANNING_RESPONSE_INSTRUCTIONS = [
  'Return JSON only.',
  'Do not include markdown fences.',
  'Use this shape exactly:',
  '{"assistant_response": string | null, "tool_calls": [{"name": string, "arguments": object}]}',
  'If live data or a dashboard action is needed, put the tool calls in tool_calls.',
  'If no tool is needed, return an empty tool_calls array and fill assistant_response.',
  'Never invent tool names.',
].join(' ');

const models: ModelOption[] = [
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-0.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 0.5B',
    note: 'Fastest startup, lighter answers',
    providers: ['alibaba', 'huggingface'],
    vram: '~1 GB VRAM',
  },
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-1.5B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 1.5B',
    note: 'Balanced local chat option',
    providers: ['alibaba', 'huggingface'],
    vram: '~2 GB VRAM',
  },
  {
    chef: 'Qwen 2.5',
    chefSlug: 'alibaba',
    id: 'Qwen2.5-3B-Instruct-q4f16_1-MLC',
    name: 'Qwen2.5 3B',
    note: 'Better quality, heavier download',
    providers: ['alibaba', 'huggingface'],
    vram: '~4 GB VRAM',
  },
  {
    chef: 'Qwen 3',
    chefSlug: 'alibaba',
    id: DEFAULT_MODEL_ID,
    name: 'Qwen3 1.7B',
    note: 'Recommended default and supported by the installed WebLLM build',
    providers: ['alibaba', 'huggingface'],
    vram: '~3 GB VRAM',
  },
  {
    chef: 'Hermes',
    chefSlug: 'llama',
    id: 'Hermes-2-Pro-Llama-3-8B-q4f16_1-MLC',
    name: 'Hermes 2 Pro Llama 3 8B',
    note: 'Supports native tool calling; heavier download than Qwen',
    providers: ['llama', 'huggingface'],
    supportsToolCalling: true,
    vram: '~8 GB VRAM',
  },
  {
    chef: 'Hermes',
    chefSlug: 'llama',
    id: 'Hermes-2-Pro-Llama-3-8B-q4f32_1-MLC',
    name: 'Hermes 2 Pro Llama 3 8B q4f32',
    note: 'Supports native tool calling; highest memory use in this list',
    providers: ['llama', 'huggingface'],
    supportsToolCalling: true,
    vram: '~12 GB VRAM',
  },
  {
    chef: 'Hermes',
    chefSlug: 'mistral',
    id: 'Hermes-2-Pro-Mistral-7B-q4f16_1-MLC',
    name: 'Hermes 2 Pro Mistral 7B',
    note: 'Recommended for tools; supports native tool calling with the lightest footprint in this list',
    providers: ['mistral', 'huggingface'],
    supportsToolCalling: true,
    vram: '~7 GB VRAM',
  },
  {
    chef: 'Hermes',
    chefSlug: 'llama',
    id: 'Hermes-3-Llama-3.1-8B-q4f16_1-MLC',
    name: 'Hermes 3 Llama 3.1 8B',
    note: 'Supports native tool calling; best fit if you want Hermes with q4f16',
    providers: ['llama', 'huggingface'],
    supportsToolCalling: true,
    vram: '~8 GB VRAM',
  },
  {
    chef: 'Hermes',
    chefSlug: 'llama',
    id: 'Hermes-3-Llama-3.1-8B-q4f32_1-MLC',
    name: 'Hermes 3 Llama 3.1 8B q4f32',
    note: 'Supports native tool calling; best quality and heaviest load',
    providers: ['llama', 'huggingface'],
    supportsToolCalling: true,
    vram: '~12 GB VRAM',
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

type ModelFamilyId = 'qwen' | 'llama' | 'mistral';

const modelFamilies: Array<{
  id: ModelFamilyId;
  label: string;
  logoProvider: string;
}> = [
  { id: 'qwen', label: 'Qwen', logoProvider: 'qwen' },
  { id: 'llama', label: 'Llama', logoProvider: 'llama' },
  { id: 'mistral', label: 'Mistral', logoProvider: 'mistral' },
];

function getModelFamilyId(modelOption: ModelOption): ModelFamilyId {
  if (modelOption.id.startsWith('Qwen')) {
    return 'qwen';
  }

  if (modelOption.id.includes('Mistral')) {
    return 'mistral';
  }

  return 'llama';
}

function getModelLogoProvider(modelOption: ModelOption) {
  const familyId = getModelFamilyId(modelOption);

  if (familyId === 'mistral') {
    return 'mistral';
  }

  if (familyId === 'llama') {
    return 'llama';
  }

  return 'qwen';
}

let workerInstance: Worker | null = null;
let webllmModulePromise: Promise<WebLLMModule> | null = null;
let enginePromise: Promise<MLCEngineInterface> | null = null;
let activeModelId: string | null = null;
const warmedModelIds = new Set<string>();

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
  warmedModelIds.clear();
}

async function loadWebLLMModule() {
  if (!webllmModulePromise) {
    webllmModulePromise = import('@mlc-ai/web-llm');
  }

  return webllmModulePromise;
}

async function ensureEngine(
  modelId: string,
  onInitProgress?: (report: InitProgressReport) => void,
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
      warmedModelIds.add(modelId);
      return engine;
    } catch (error) {
      resetEngineCache();
      throw error;
    }
  }

  const engine = await enginePromise;
  engine.setInitProgressCallback(onInitProgress ?? (() => undefined));

  if (activeModelId !== modelId) {
    try {
      await engine.reload(modelId);
      activeModelId = modelId;
      warmedModelIds.add(modelId);
    } catch (error) {
      resetEngineCache();
      throw error;
    }
  }

  return engine;
}

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    if (error.message?.trim()) {
      return error.message;
    }

    if (error.cause instanceof Error && error.cause.message?.trim()) {
      return error.cause.message;
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  if (error && typeof error === 'object') {
    const maybeMessage = 'message' in error ? error.message : undefined;
    if (typeof maybeMessage === 'string' && maybeMessage.trim()) {
      return maybeMessage;
    }

    try {
      return JSON.stringify(error);
    } catch (_) {
      // Fall through to the generic message below.
    }
  }

  return 'The local model failed to initialize or generate a response.';
}

function normalizeRuntimeStats(stats: string | null) {
  if (!stats || stats.includes('NaN tokens/sec')) {
    return null;
  }

  return stats;
}

function cleanAssistantText(text: string) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function extractTaggedReasoning(text: string) {
  const matches = [...text.matchAll(/<think>([\s\S]*?)<\/think>/gi)];

  if (matches.length === 0) {
    return null;
  }

  const reasoning = matches.map((match) => match[1]?.trim()).filter(Boolean).join('\n\n');
  const answer = cleanAssistantText(text.replace(/<think>[\s\S]*?<\/think>/gi, ' '));

  return {
    answer,
    reasoning,
  };
}

function looksLikeLeakedReasoning(text: string) {
  const normalized = text.toLowerCase();
  const signals = [
    'the user',
    'i should',
    'they might',
    'keep the response',
    'acknowledge their greeting',
    'possible needs',
    'since the previous messages',
    'i need to',
    'however,',
  ];

  return signals.filter((signal) => normalized.includes(signal)).length >= 2;
}

function splitSentences(text: string) {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

function isMetaReasoningSentence(sentence: string) {
  const normalized = sentence.toLowerCase();
  const signals = [
    'the user',
    'i should',
    'i need to',
    'they might',
    'keep the response',
    'since the previous messages',
    'maybe they',
    'let me check',
    'however,',
    'just a greeting',
    'relevant to the topics',
  ];

  return signals.some((signal) => normalized.includes(signal));
}

function splitReasoningFromAnswerBySentence(text: string) {
  const sentences = splitSentences(text);

  if (sentences.length < 2) {
    return null;
  }

  const answerSentences: string[] = [];

  for (let index = sentences.length - 1; index >= 0; index -= 1) {
    const sentence = sentences[index];

    if (isMetaReasoningSentence(sentence)) {
      break;
    }

    answerSentences.unshift(sentence);
  }

  if (answerSentences.length === 0 || answerSentences.length === sentences.length) {
    return null;
  }

  const answer = cleanAssistantText(answerSentences.join(' '));
  const reasoning = cleanAssistantText(
    sentences.slice(0, sentences.length - answerSentences.length).join(' '),
  );

  if (!answer || !reasoning || !looksLikeLeakedReasoning(reasoning)) {
    return null;
  }

  return { answer, reasoning };
}

function splitLeakedReasoning(text: string) {
  const normalized = cleanAssistantText(text);

  if (!normalized) {
    return null;
  }

  const tagged = extractTaggedReasoning(normalized);
  if (tagged) {
    return tagged;
  }

  const blocks = normalized.split(/\n\s*\n/).map((block) => block.trim()).filter(Boolean);
  if (blocks.length < 2) {
    return null;
  }

  const answer = blocks.at(-1) ?? '';
  const reasoning = blocks.slice(0, -1).join('\n\n');

  if (!answer || !reasoning) {
    return null;
  }

  if (!looksLikeLeakedReasoning(reasoning)) {
    return splitReasoningFromAnswerBySentence(normalized);
  }

  return {
    answer: cleanAssistantText(answer),
    reasoning,
  };
}

function sanitizeAssistantReply(text: string) {
  const normalized = cleanAssistantText(text);
  const split = splitLeakedReasoning(normalized);

  if (!split) {
    return {
      finalAnswer: normalized,
      leakedReasoning: null,
    };
  }

  return {
    finalAnswer: split.answer || normalized,
    leakedReasoning: split.reasoning,
  };
}

function withToolModelGuidance(message: string, selectedModelData?: ModelOption) {
  if (!selectedModelData?.supportsToolCalling) {
    return message;
  }

  return `${message} If this keeps happening on a Hermes model, switch to Hermes 2 Pro Mistral 7B, which is the lightest Hermes option in this panel.`;
}

function formatProgress(report: InitProgressReport | null) {
  if (!report) {
    return 0;
  }

  const value = Number.isFinite(report.progress) ? report.progress * 100 : 0;
  return Math.min(100, Math.max(0, value));
}

function getToolUiState(tool: ChatToolInvocation) {
  if (tool.state) {
    if (tool.state === 'approval-requested') {
      return 'approval-requested' as const;
    }

    if (tool.state === 'approval-responded') {
      return 'approval-responded' as const;
    }

    if (tool.state === 'output-denied') {
      return 'output-denied' as const;
    }

    return 'output-available' as const;
  }

  if (tool.status === 'pending') {
    return 'input-streaming' as const;
  }

  if (tool.status === 'running') {
    return 'input-available' as const;
  }

  if (tool.status === 'denied') {
    return 'output-denied' as const;
  }

  if (tool.status === 'error') {
    return 'output-error' as const;
  }

  return 'output-available' as const;
}

function buildRagContext(results: RagSearchResult[]) {
  return results
    .slice(0, 4)
    .map((result, index) => {
      const excerpt = result.text.length > 900 ? `${result.text.slice(0, 900)}...` : result.text;
      return [
        `Source ${index + 1}: ${result.documentTitle}`,
        `Path: ${result.documentPath}`,
        excerpt,
      ].join('\n');
    })
    .join('\n\n---\n\n');
}

function buildRagSources(results: RagSearchResult[]) {
  const sources = new Map<string, { href: string; title: string }>();

  for (const result of results) {
    if (!sources.has(result.documentPath)) {
      sources.set(result.documentPath, {
        href: result.documentPath,
        title: result.documentTitle,
      });
    }
  }

  return [...sources.values()];
}

function buildPromptWithRag(prompt: string, ragResults: RagSearchResult[]) {
  const ragContext = buildRagContext(ragResults);

  if (!ragContext) {
    return prompt;
  }

  return [
    prompt,
    '',
    'Local reference context:',
    ragContext,
    '',
    'Use the local reference context when it is relevant and say if the seed corpus is incomplete.',
  ].join('\n');
}

function buildConversationMessages(
  conversation: ChatMessage[],
  currentPrompt: string,
): ChatCompletionMessageParam[] {
  const messages: ChatCompletionMessageParam[] = [];

  for (const message of conversation) {
    const isLatestUserMessage = message === conversation.at(-1) && message.from === 'user';
    const content = isLatestUserMessage
      ? currentPrompt
      : message.versions[0]?.content?.trim() ?? '';

    if (!content) {
      continue;
    }

    messages.push({
      role: message.from,
      content,
    });
  }

  return messages;
}

function extractJsonObject(text: string) {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i) ?? text.match(/```\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1]?.trim() ?? text.trim();
  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');

  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    throw new Error(`Planner did not return JSON. Raw output: ${candidate}`);
  }

  return candidate.slice(firstBrace, lastBrace + 1);
}

function parseToolPlanningResult(text: string): ToolPlanningResult {
  const parsed = JSON.parse(extractJsonObject(text)) as ToolPlanningResult;
  return {
    assistant_response:
      typeof parsed.assistant_response === 'string' ? parsed.assistant_response : null,
    tool_calls: Array.isArray(parsed.tool_calls) ? parsed.tool_calls : [],
  };
}

function buildToolPlanningMessages(
  conversation: ChatMessage[],
  currentPrompt: string,
  toolPlanningCatalog: string,
): ChatCompletionMessageParam[] {
  const plannerPrompt = [
    TOOL_SYSTEM_PROMPT,
    PLANNING_RESPONSE_INSTRUCTIONS,
    '',
    'Available tools:',
    toolPlanningCatalog,
    '',
    'Plan the response for this user request:',
    currentPrompt,
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...buildConversationMessages(conversation, plannerPrompt),
  ];
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
  isLoading,
  onSelect,
}: {
  m: ModelOption;
  isSelected: boolean;
  isLoading: boolean;
  onSelect: (id: string) => void;
}) => {
  const handleSelect = useCallback(() => {
    onSelect(m.id);
  }, [m.id, onSelect]);
  const detail = [m.note, m.supportsToolCalling ? 'Native tool calling' : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <Button
      className={cn(
        'h-auto w-full items-start justify-between rounded-md px-4 py-3 text-left shadow-none',
        isSelected ? 'border-primary bg-accent/40 hover:bg-accent/50' : 'hover:bg-accent/40',
      )}
      onClick={handleSelect}
      type="button"
      variant="outline"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md border bg-background">
          <ModelSelectorLogo className="size-4" provider={getModelLogoProvider(m)} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
            {m.supportsToolCalling ? (
              <Badge className="h-5 px-1.5 text-[10px]" variant="secondary">
                Tools
              </Badge>
            ) : null}
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">{detail}</p>
          <div className="mt-2">
            <Badge className="h-5 px-1.5 text-[10px]" variant="outline">
              {m.vram}
            </Badge>
          </div>
        </div>
      </div>
      <div className="ml-3 flex shrink-0 items-center self-center text-muted-foreground">
        {isLoading ? (
          <Spinner className="size-4" />
        ) : isSelected ? (
          <CheckIcon className="size-4 text-foreground" />
        ) : (
          <ChevronDownIcon className="size-4" />
        )}
      </div>
    </Button>
  );
};

export function WebLlmChatbot({ variant = 'page' }: WebLlmChatbotProps) {
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(DEFAULT_MODEL_ID);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelFamily, setSelectedModelFamily] = useState<ModelFamilyId | null>(null);
  const [text, setText] = useState('');
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [useApiTools, setUseApiTools] = useState(false);
  const [status, setStatus] = useState<'submitted' | 'streaming' | 'ready' | 'error'>('ready');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [progressReport, setProgressReport] = useState<InitProgressReport | null>(null);
  const [gpuVendor, setGpuVendor] = useState<string | null>(null);
  const [runtimeStats, setRuntimeStats] = useState<string | null>(null);
  const [hasWebGpuSupport, setHasWebGpuSupport] = useState<boolean | null>(null);
  const [quickPromptsOpen, setQuickPromptsOpen] = useState(false);
  const [ragStatus, setRagStatus] = useState<'idle' | 'indexing' | 'ready' | 'error'>('idle');
  const [ragSummary, setRagSummary] = useState<RagIndexSummary | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const pendingToolSessionsRef = useRef<Map<string, PendingToolSession>>(new Map());
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [conversationHeight, setConversationHeight] = useState<number | null>(null);
  const conversationPanelRef = useRef<HTMLDivElement>(null);

  const isPanel = variant === 'panel';
  const toolPlanningCatalog = useMemo(() => getChatToolPlanningCatalog(), []);

  useEffect(() => {
    const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (storedModel && models.some((candidate) => candidate.id === storedModel)) {
      setModel(storedModel);
      setLoadingModelId(storedModel);
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
  const deferredModelSearch = useDeferredValue(modelSearch);
  const filteredModels = useMemo(() => {
    const query = deferredModelSearch.trim().toLowerCase();

    return models.filter((candidate) => {
      if (selectedModelFamily && getModelFamilyId(candidate) !== selectedModelFamily) {
        return false;
      }

      if (!query) {
        return true;
      }

      return `${candidate.name} ${candidate.note} ${candidate.vram} ${candidate.id}`.toLowerCase().includes(query);
    });
  }, [deferredModelSearch, selectedModelFamily]);

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
    setRuntimeStats(normalizeRuntimeStats(stats));
  }, []);

  useEffect(() => {
    if (hasWebGpuSupport === false) {
      setLoadingModelId(null);
      return;
    }

    let cancelled = false;
    const shouldPreload = !warmedModelIds.has(model) || activeModelId !== model;

    if (!shouldPreload) {
      setLoadingModelId(null);
      setProgressReport(null);
      return;
    }

    setLoadingModelId(model);

    void ensureEngine(
      model,
      (report) => {
        if (!cancelled) {
          setProgressReport(report);
        }
      },
    )
      .then(async (engine) => {
        if (cancelled) {
          return;
        }

        setLoadingModelId((current) => (current === model ? null : current));
        setProgressReport(null);
        await syncEngineDiagnostics(engine);
      })
      .catch((error) => {
        if (!cancelled) {
          setEngineError(withToolModelGuidance(normalizeError(error), selectedModelData));
          setLoadingModelId((current) => (current === model ? null : current));
          setProgressReport(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hasWebGpuSupport, model, selectedModelData, syncEngineDiagnostics]);

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
    setLoadingModelId(modelId);
    setModelSelectorOpen(false);
    setProgressReport(null);
    setRuntimeStats(null);
    setEngineError(null);
  }, []);

  const handleModelSelectorOpenChange = useCallback((open: boolean) => {
    setModelSelectorOpen(open);

    if (!open) {
      setModelSearch('');
      setSelectedModelFamily(null);
    }
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

  const initializeLocalRag = useCallback(
    async (showToast = false) => {
      setRagError(null);
      setRagStatus('indexing');

      try {
        const { summary } = await ensureSeedIndex();
        setRagSummary(summary);
        setRagStatus('ready');

        if (showToast) {
          sileo.success({
            title: summary.retrievalMode === 'semantic' ? 'Semantic local RAG ready' : 'Local RAG ready',
            description:
              summary.retrievalMode === 'semantic'
                ? `${summary.indexedDocumentCount}/${summary.documentCount} documents embedded locally across ${summary.chunkCount} chunks.`
                : `${summary.indexedDocumentCount}/${summary.documentCount} documents indexed across ${summary.chunkCount} chunks using lexical fallback.`,
          });
        }

        return summary;
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to index the local seed corpus.';
        setRagError(message);
        setRagStatus('error');

        if (showToast) {
          sileo.error({
            title: 'Local RAG unavailable',
            description: message,
          });
        }

        throw error;
      }
    },
    [],
  );

  const toggleWebSearch = useCallback(() => {
    setUseWebSearch((previous) => {
      const next = !previous;

      if (next) {
        void initializeLocalRag(true).catch(() => undefined);
      }

      return next;
    });
  }, [initializeLocalRag]);

  const toggleApiTools = useCallback(() => {
    setUseApiTools((previous) => !previous);
  }, []);

  const streamAssistantReply = useCallback(
    async ({
      assistantKey,
      messageId,
      completionMessages,
      ragResults,
      selectedModel,
      selectedModelName,
      startedAt,
      toolCallCount = 0,
    }: {
      assistantKey: string;
      messageId: string;
      completionMessages: ChatCompletionMessageParam[];
      ragResults: RagSearchResult[];
      selectedModel: string;
      selectedModelName: string;
      startedAt: number;
      toolCallCount?: number;
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
        const shouldReportProgress = !warmedModelIds.has(selectedModel) || activeModelId !== selectedModel;
        const engine = await ensureEngine(
          selectedModel,
          shouldReportProgress
            ? (report) => {
                setProgressReport(report);
                updateMessage(assistantKey, (message) => ({
                  ...message,
                  reasoning: {
                    content: report.text,
                    duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
                    isStreaming: true,
                  },
                }));
              }
            : undefined,
        );

        setStatus('streaming');

        updateMessage(assistantKey, (message) => ({
          ...message,
          reasoning: {
            content:
              toolCallCount > 0 && ragResults.length > 0
                ? `Generating a response locally with ${selectedModelName} using ${toolCallCount} live API tool result${toolCallCount > 1 ? 's' : ''} and ${ragResults.length} retrieved seed passages.`
                : toolCallCount > 0
                  ? `Generating a response locally with ${selectedModelName} using ${toolCallCount} live API tool result${toolCallCount > 1 ? 's' : ''}.`
                  : ragResults.length > 0
                    ? `Generating a response locally with ${selectedModelName} using ${ragResults.length} retrieved seed passages.`
                    : `Generating a response locally with ${selectedModelName}.`,
            duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            isStreaming: true,
          },
        }));

        const stream = await engine.chat.completions.create({
          messages: completionMessages,
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
        }

        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const sanitizedReply = sanitizeAssistantReply(reply);

        updateMessage(assistantKey, (message) => ({
          ...message,
          status: undefined,
          reasoning: {
            content: [
              toolCallCount > 0 && ragResults.length > 0
                ? `Response generated locally with ${selectedModelName} on WebGPU using live API tools and the local seed corpus.`
                : toolCallCount > 0
                  ? `Response generated locally with ${selectedModelName} on WebGPU using live API tools.`
                  : ragResults.length > 0
                    ? `Response generated locally with ${selectedModelName} on WebGPU using the local seed corpus.`
                    : `Response generated locally with ${selectedModelName} on WebGPU.`,
            ].filter(Boolean).join('\n\n'),
            duration,
            isStreaming: false,
          },
          versions: message.versions.map((version) =>
            version.id === messageId
              ? { ...version, content: sanitizedReply.finalAnswer || 'No output returned.' }
              : version,
          ),
        }));

        setStatus('ready');
        setProgressReport(null);
        await syncEngineDiagnostics(engine);
      } catch (error) {
        const message = withToolModelGuidance(normalizeError(error), selectedModelData);
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
    [hasWebGpuSupport, selectedModelData, syncEngineDiagnostics, updateMessage],
  );

  const continueToolConversation = useCallback(
    (session: PendingToolSession) => {
      const prompt = session.conversation.at(-1)?.versions[0]?.content ?? '';
      const completionMessages: ChatCompletionMessageParam[] = [
        { role: 'system', content: SYSTEM_PROMPT },
        ...buildConversationMessages(session.conversation, buildPromptWithRag(prompt, session.ragResults)),
        {
          role: 'assistant',
          content: '',
          tool_calls: session.toolCalls,
        } satisfies ChatCompletionAssistantMessageParam,
        ...Array.from(session.toolMessages.values()),
      ];

      void streamAssistantReply({
        assistantKey: session.assistantKey,
        messageId: session.assistantVersionId,
        completionMessages,
        ragResults: session.ragResults,
        selectedModel: session.selectedModel,
        selectedModelName: session.selectedModelName,
        startedAt: Date.now(),
        toolCallCount: session.toolCalls.length,
      });
    },
    [streamAssistantReply],
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

      if (loadingModelId === model) {
        sileo.info({
          title: 'Model still loading',
          description: `${selectedModelData?.name ?? 'The selected model'} is still downloading or initializing locally. Wait for it to finish before sending a message.`,
        });
        return;
      }

      setEngineError(null);
      setRagError(null);
      setStatus('submitted');

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
          content: useWebSearch ? 'Searching the local seed corpus.' : 'Preparing the local model.',
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

      let ragResults: RagSearchResult[] = [];
      let toolCalls: ChatCompletionMessageToolCall[] = [];
      let toolMessages: ChatCompletionToolMessageParam[] = [];

      if (useApiTools) {
        try {
          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            reasoning: {
              content: `Analyzing your request with ${selectedModelData?.name ?? 'the selected model'} and ${CHAT_TOOL_COUNT} available live API tools.`,
              duration: 0,
              isStreaming: true,
            },
          }));

          const shouldReportProgress = !warmedModelIds.has(model) || activeModelId !== model;
          const engine = await ensureEngine(
            model,
            shouldReportProgress
              ? (report) => {
                  setProgressReport(report);
                  updateMessage(assistantKey, (currentMessage) => ({
                    ...currentMessage,
                    reasoning: {
                      content: report.text,
                      duration: 0,
                      isStreaming: true,
                    },
                  }));
                }
              : undefined,
          );

          const planningMessages = buildToolPlanningMessages(conversation, prompt, toolPlanningCatalog);

          const planningResponse = await engine.chat.completions.create({
            messages: planningMessages,
            temperature: 0,
          });

          setProgressReport(null);
          await syncEngineDiagnostics(engine);

          const planningMessage = planningResponse.choices[0]?.message;
          const planningContent = planningMessage?.content ?? '';
          const planningResult = parseToolPlanningResult(planningContent);
          toolCalls = (planningResult.tool_calls ?? [])
            .filter((toolCall): toolCall is NonNullable<ToolPlanningResult['tool_calls']>[number] =>
              Boolean(toolCall?.name && typeof toolCall.name === 'string'),
            )
            .map((toolCall, index) =>
              createSyntheticToolCall(
                toolCall.name ?? '',
                toolCall.arguments && typeof toolCall.arguments === 'object' ? toolCall.arguments : {},
                `${assistantKey}-tool-${index + 1}`,
              ),
            );

          if (toolCalls.length === 0) {
            if (planningResult.assistant_response && !useWebSearch) {
              setStatus('ready');
              updateMessage(assistantKey, (currentMessage) => ({
                ...currentMessage,
                status: undefined,
                reasoning: {
                  content: `Response generated locally with ${selectedModelData?.name ?? 'the selected model'} without using live API tools.`,
                  duration: 1,
                  isStreaming: false,
                },
                versions: currentMessage.versions.map((version) =>
                  version.id === assistantVersionId
                    ? { ...version, content: planningResult.assistant_response ?? 'No output returned.' }
                    : version,
                ),
              }));
              return;
            }
          } else {
            const invocations: ChatToolInvocation[] = [];
            const pendingToolIds = new Set<string>();

            for (const toolCall of toolCalls) {
              if (isDestructiveTool(toolCall.function.name)) {
                pendingToolIds.add(toolCall.id);
                invocations.push(createPendingToolInvocation(toolCall));
                continue;
              }

              const executedTool = await executeChatToolCall(toolCall);
              invocations.push(executedTool.invocation);
              toolMessages.push(executedTool.toolMessage);
            }

            updateMessage(assistantKey, (currentMessage) => ({
              ...currentMessage,
              tools: invocations,
              reasoning: {
                content:
                  pendingToolIds.size > 0
                    ? `The model selected ${toolCalls.length} live API tool${toolCalls.length > 1 ? 's' : ''}. Confirm the destructive action${pendingToolIds.size > 1 ? 's' : ''} below to continue.`
                    : `Executed ${toolCalls.length} live API tool${toolCalls.length > 1 ? 's' : ''} selected by the model.`,
                duration: 0,
                isStreaming: true,
              },
            }));

            if (pendingToolIds.size > 0) {
              pendingToolSessionsRef.current.set(assistantKey, {
                assistantKey,
                assistantVersionId,
                conversation,
                selectedModel: model,
                selectedModelName: selectedModelData?.name ?? 'the selected model',
                ragResults: [],
                toolCalls,
                toolMessages: new Map(toolMessages.map((toolMessage) => [toolMessage.tool_call_id, toolMessage])),
                unresolvedToolIds: pendingToolIds,
              });

              setStatus('ready');
              updateMessage(assistantKey, (currentMessage) => ({
                ...currentMessage,
                status: undefined,
                versions: currentMessage.versions.map((version) =>
                  version.id === assistantVersionId
                    ? {
                        ...version,
                        content: 'The model requested a destructive action. Review the confirmation block below to continue.',
                      }
                    : version,
                ),
              }));
              return;
            }
          }
        } catch (error) {
          const toolPlanningError = withToolModelGuidance(normalizeError(error), selectedModelData);
          setEngineError(toolPlanningError);
          setStatus('error');
          setProgressReport(null);
          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            status: 'error',
            reasoning: {
              content: 'Tool planning failed before the final response could be generated.',
              duration: 0,
              isStreaming: false,
            },
            versions: currentMessage.versions.map((version) =>
              version.id === assistantVersionId
                ? { ...version, content: toolPlanningError }
                : version,
            ),
          }));
          return;
        }
      }

      if (useWebSearch) {
        try {
          setRagStatus('indexing');
          const ragSearch = await searchSeedIndex(prompt);
          setRagSummary(ragSearch.summary);
          setRagStatus('ready');
          ragResults = ragSearch.results;

          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            sources: buildRagSources(ragSearch.results),
            reasoning: {
              content:
                ragSearch.results.length > 0
                  ? `Retrieved ${ragSearch.results.length} matching passages from the local seed corpus using ${ragSearch.summary.retrievalMode === 'semantic' ? 'semantic embeddings' : 'lexical fallback'}.`
                  : `The local seed corpus is indexed${ragSearch.summary.retrievalMode === 'semantic' ? ' with embeddings' : ''}, but no matching passages were found for this prompt.`,
              duration: 0,
              isStreaming: true,
            },
          }));
        } catch (error) {
          const ragMessage = error instanceof Error ? error.message : 'Local retrieval failed.';
          setRagError(ragMessage);
          setRagStatus('error');

          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            reasoning: {
              content: 'Local RAG failed, so the model will answer without retrieved seed context.',
              duration: 0,
              isStreaming: true,
            },
          }));
        }
      }

      const promptWithRag = buildPromptWithRag(prompt, ragResults);
      const completionMessages: ChatCompletionMessageParam[] = toolCalls.length > 0
        ? [
            { role: 'system', content: SYSTEM_PROMPT },
            ...buildConversationMessages(conversation, promptWithRag),
            {
              role: 'assistant',
              content: '',
              tool_calls: toolCalls,
            } satisfies ChatCompletionAssistantMessageParam,
            ...toolMessages,
          ]
        : [
            { role: 'system', content: SYSTEM_PROMPT },
            ...buildConversationMessages(conversation, promptWithRag),
          ];

      void streamAssistantReply({
        assistantKey,
        messageId: assistantVersionId,
        completionMessages,
        ragResults,
        selectedModel: model,
        selectedModelName: selectedModelData?.name ?? 'the selected model',
        startedAt: Date.now(),
        toolCallCount: toolCalls.length,
      });
    },
    [
      messages,
      model,
      loadingModelId,
      selectedModelData,
      streamAssistantReply,
      syncEngineDiagnostics,
      toolPlanningCatalog,
      updateMessage,
      useApiTools,
      useWebSearch,
    ],
  );

  const handleToolApproval = useCallback(
    async (messageKey: string, toolId: string, approved: boolean) => {
      const session = pendingToolSessionsRef.current.get(messageKey);
      const toolCall = session?.toolCalls.find((candidate) => candidate.id === toolId);

      if (!session || !toolCall) {
        return;
      }

      if (!approved) {
        session.toolMessages.set(
          toolId,
          createToolResultMessage(toolId, {
            ok: false,
            cancelled: true,
            message: 'Action cancelled by the user.',
          }),
        );
        session.unresolvedToolIds.delete(toolId);

        updateMessage(messageKey, (message) => ({
          ...message,
          tools: message.tools?.map((tool) =>
            tool.id === toolId
              ? {
                  ...tool,
                  status: 'denied',
                  state: 'output-denied',
                  approval: {
                    id: toolId,
                    approved: false,
                  },
                  result: {
                    ok: false,
                    message: 'Action cancelled by the user.',
                  },
                }
              : tool,
          ),
          versions: message.versions.map((version, index) =>
            index === 0
              ? {
                  ...version,
                  content:
                    session.unresolvedToolIds.size > 0
                      ? 'Action cancelled. Resolve the remaining confirmation request(s) to continue.'
                      : 'Action cancelled. Preparing the final response with the resolved tool outcomes.',
                }
              : version,
          ),
        }));
      } else {
        updateMessage(messageKey, (message) => ({
          ...message,
          tools: message.tools?.map((tool) =>
            tool.id === toolId
              ? {
                  ...tool,
                  status: 'running',
                  state: 'approval-responded',
                  approval: {
                    id: toolId,
                    approved: true,
                  },
                }
              : tool,
          ),
          versions: message.versions.map((version, index) =>
            index === 0
              ? { ...version, content: 'Confirmation received. Executing the requested action...' }
              : version,
          ),
        }));

        const executedTool = await executeChatToolCall(toolCall);
        session.toolMessages.set(toolId, executedTool.toolMessage);
        session.unresolvedToolIds.delete(toolId);

        updateMessage(messageKey, (message) => ({
          ...message,
          tools: message.tools?.map((tool) =>
            tool.id === toolId
              ? executedTool.invocation
              : tool,
          ),
          versions: message.versions.map((version, index) =>
            index === 0
              ? {
                  ...version,
                  content:
                    session.unresolvedToolIds.size > 0
                      ? 'Action processed. Waiting for the remaining confirmation request(s).'
                      : 'Action processed. Preparing the final response...',
                }
              : version,
          ),
        }));
      }

      if (session.unresolvedToolIds.size > 0) {
        return;
      }

      if (useWebSearch) {
        const prompt = session.conversation.at(-1)?.versions[0]?.content ?? '';

        try {
          setRagStatus('indexing');
          const ragSearch = await searchSeedIndex(prompt);
          session.ragResults = ragSearch.results;
          setRagSummary(ragSearch.summary);
          setRagStatus('ready');

          updateMessage(messageKey, (currentMessage) => ({
            ...currentMessage,
            sources: buildRagSources(ragSearch.results),
            reasoning: {
              content:
                ragSearch.results.length > 0
                  ? `Retrieved ${ragSearch.results.length} matching passages from the local seed corpus using ${ragSearch.summary.retrievalMode === 'semantic' ? 'semantic embeddings' : 'lexical fallback'}.`
                  : `The local seed corpus is indexed${ragSearch.summary.retrievalMode === 'semantic' ? ' with embeddings' : ''}, but no matching passages were found for this prompt.`,
              duration: 0,
              isStreaming: true,
            },
          }));
        } catch (error) {
          const ragMessage = error instanceof Error ? error.message : 'Local retrieval failed.';
          setRagError(ragMessage);
          setRagStatus('error');

          updateMessage(messageKey, (currentMessage) => ({
            ...currentMessage,
            reasoning: {
              content: 'Local RAG failed, so the model will answer without retrieved seed context.',
              duration: 0,
              isStreaming: true,
            },
          }));
        }
      }

      pendingToolSessionsRef.current.delete(messageKey);
      continueToolConversation(session);
    },
    [continueToolConversation, updateMessage, useWebSearch],
  );

  const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const panel = conversationPanelRef.current;
    if (!panel) return;
    const startY = e.clientY;
    const startHeight = panel.getBoundingClientRect().height;
    resizeDragRef.current = { startY, startHeight };
    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!resizeDragRef.current) return;
      const delta = moveEvent.clientY - resizeDragRef.current.startY;
      setConversationHeight(Math.max(80, resizeDragRef.current.startHeight + delta));
    };
    const handleMouseUp = () => {
      resizeDragRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, []);

  const isSubmitDisabled = useMemo(
    () => !text.trim() || hasWebGpuSupport === false || loadingModelId === model || status === 'streaming' || status === 'submitted',
    [hasWebGpuSupport, loadingModelId, model, status, text],
  );
  const isBusyGenerating = status === 'streaming' || status === 'submitted';
  const isSelectedModelLoading = loadingModelId === model;
  const isComposerLocked = hasWebGpuSupport === false || isBusyGenerating || isSelectedModelLoading;

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col gap-4', isPanel ? 'h-full' : 'min-h-[720px]')}>
      {!isPanel && (
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Chatbot</h1>
          <p className="max-w-3xl text-sm text-muted-foreground">
            Local chat powered by WebLLM and WebGPU. The selected model downloads on first use and is cached in the browser.
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b px-4 py-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <Badge variant={hasWebGpuSupport ? 'default' : 'outline'}>
              {hasWebGpuSupport ? 'WebGPU ready' : 'WebGPU required'}
            </Badge>
            <Badge variant="outline">{selectedModelData?.name}</Badge>
            {isSelectedModelLoading && (
              <Badge variant="outline">
                <Spinner className="mr-1 size-3.5" />
                {progressReport ? `${Math.round(formatProgress(progressReport))}% loaded` : 'Loading model'}
              </Badge>
            )}
            {gpuVendor && (
              <Badge variant="outline">
                <CpuIcon className="mr-1 size-3.5" />
                {gpuVendor}
              </Badge>
            )}
            {useWebSearch && (
              <Badge variant="outline">
                <GlobeIcon className="mr-1 size-3.5" />
                {ragStatus === 'indexing'
                  ? 'Indexing local RAG'
                  : ragStatus === 'ready'
                    ? `${ragSummary?.retrievalMode === 'semantic' ? 'Semantic' : 'Lexical'} RAG ${ragSummary?.chunkCount ?? 0} chunks`
                    : ragStatus === 'error'
                      ? 'Local RAG error'
                      : 'Local RAG on'}
              </Badge>
            )}
            {useApiTools && (
              <Badge variant="outline">
                <WrenchIcon className="mr-1 size-3.5" />
                {CHAT_TOOL_COUNT} live API tools ready
              </Badge>
            )}
            {selectedModelData?.supportsToolCalling && (
              <Badge variant="outline">
                <WrenchIcon className="mr-1 size-3.5" />
                Native tool-calling
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{selectedModelData?.note}</p>
          {isSelectedModelLoading && (
            <p className="mt-2 text-xs text-muted-foreground">
              Loading {selectedModelData?.name}. The chat input stays locked until this model is fully downloaded and initialized.
            </p>
          )}
          {useApiTools ? (
            <p className="mt-2 text-xs text-muted-foreground">
              The model receives all {CHAT_TOOL_COUNT} live API tools on each prompt and decides whether to call them.
              {selectedModelData?.supportsToolCalling ? ' This model also advertises native tool-calling support in WebLLM.' : ''}
            </p>
          ) : null}
          {useWebSearch && ragSummary ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Seed corpus ready with {ragSummary.indexedDocumentCount}/{ragSummary.documentCount} documents indexed via{' '}
              {ragSummary.retrievalMode === 'semantic' ? 'local embeddings' : 'lexical fallback'}.
              {ragSummary.skippedDocumentCount > 0 ? ` ${ragSummary.skippedDocumentCount} document(s) were skipped.` : ''}
            </p>
          ) : null}
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

        {ragError && useWebSearch && (
          <div className="border-b px-4 py-3">
            <Alert variant="destructive">
              <AlertCircleIcon className="h-4 w-4" />
              <AlertTitle>Local RAG error</AlertTitle>
              <AlertDescription>{ragError}</AlertDescription>
            </Alert>
          </div>
        )}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={conversationPanelRef}
            className={conversationHeight === null ? 'flex min-h-0 flex-1 overflow-hidden' : 'shrink-0 overflow-hidden'}
            style={conversationHeight !== null ? { height: conversationHeight } : undefined}
          >
          <Conversation>
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState
                  description="Start a conversation and the selected model will load locally in your browser."
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

                            {message.tools?.length ? (
                              <div className="mb-3 space-y-2">
                                {message.tools.map((tool) => (
                                  <Tool defaultOpen={tool.status === 'running' || tool.status === 'error'} key={tool.id}>
                                    <ToolHeader
                                      state={getToolUiState(tool)}
                                      title={tool.name}
                                      type="dynamic-tool"
                                      toolName={tool.name}
                                    />
                                    <ToolContent>
                                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                                      <ToolInput input={tool.parameters} />
                                      <ToolOutput
                                        errorText={tool.error}
                                        output={tool.result}
                                      />
                                      {tool.destructive && tool.state ? (
                                        <Confirmation
                                          approval={
                                            tool.approval
                                              ? tool.approval.approved === undefined
                                                ? { id: tool.approval.id }
                                                : tool.approval.approved
                                                  ? {
                                                      id: tool.approval.id,
                                                      approved: true,
                                                      reason: tool.approval.reason,
                                                    }
                                                  : {
                                                      id: tool.approval.id,
                                                      approved: false,
                                                      reason: tool.approval.reason,
                                                    }
                                              : undefined
                                          }
                                          appearance="inline"
                                          className="mt-2"
                                          state={tool.state}
                                        >
                                          <ConfirmationTitle>
                                            {tool.confirmationTitle ?? 'This action requires confirmation.'}
                                          </ConfirmationTitle>
                                          <ConfirmationRequest>
                                            <ConfirmationActions>
                                              <ConfirmationAction
                                                onClick={() => void handleToolApproval(message.key, tool.id, false)}
                                                variant="outline"
                                              >
                                                Cancel
                                              </ConfirmationAction>
                                              <ConfirmationAction
                                                onClick={() => void handleToolApproval(message.key, tool.id, true)}
                                              >
                                                Confirm
                                              </ConfirmationAction>
                                            </ConfirmationActions>
                                          </ConfirmationRequest>
                                          <ConfirmationAccepted>
                                            <p className="text-foreground">Action approved.</p>
                                          </ConfirmationAccepted>
                                          <ConfirmationRejected>
                                            <p>Action was cancelled.</p>
                                          </ConfirmationRejected>
                                        </Confirmation>
                                      ) : null}
                                    </ToolContent>
                                  </Tool>
                                ))}
                              </div>
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
          </div>

          <div
            className="group relative flex h-2 shrink-0 cursor-row-resize items-center justify-center px-4"
            onMouseDown={handleResizeMouseDown}
          >
            <div className="h-px w-full bg-border" />
            <div className="absolute flex h-5 w-8 items-center justify-center rounded-sm border bg-background opacity-0 shadow-sm transition-opacity group-hover:opacity-100">
              <GripHorizontalIcon className="size-3.5 text-muted-foreground" />
            </div>
          </div>

          <div className="grid shrink-0">
            <div className="w-full px-4 pb-4 pt-3">
              <PromptInput globalDrop multiple onSubmit={handleSubmit}>
                <PromptInputHeader>
                  <PromptInputAttachmentsDisplay />
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    className="focus:outline-none focus:ring-0 focus-visible:outline-none focus-visible:ring-0 focus-visible:ring-offset-0"
                    disabled={isComposerLocked}
                    onChange={handleTextChange}
                    placeholder={
                      isSelectedModelLoading
                        ? `Loading ${selectedModelData?.name ?? 'the selected model'} locally before chat unlocks...`
                        : 'Ask about PKI, devices, registrations, keys, or anything you want to reason through locally.'
                    }
                    value={text}
                  />
                </PromptInputBody>
                <PromptInputFooter className="flex-wrap items-center gap-2">
                  <PromptInputTools className="flex-1 flex-wrap">
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger disabled={isComposerLocked} />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                    <SpeechInput
                      className="shrink-0"
                      disabled={isComposerLocked}
                      onTranscriptionChange={handleTranscriptionChange}
                      size="icon"
                      variant="ghost"
                    />
                    <Popover onOpenChange={setQuickPromptsOpen} open={quickPromptsOpen}>
                      <PopoverTrigger asChild>
                        <PromptInputButton disabled={isComposerLocked} type="button" variant={quickPromptsOpen ? 'default' : 'ghost'}>
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
                      disabled={isComposerLocked}
                      onClick={toggleApiTools}
                      type="button"
                      variant={useApiTools ? 'default' : 'ghost'}
                    >
                      <WrenchIcon size={16} />
                      <span>Tools</span>
                    </PromptInputButton>
                    <PromptInputButton
                      disabled={isComposerLocked}
                      onClick={toggleWebSearch}
                      type="button"
                      variant={useWebSearch ? 'default' : 'ghost'}
                    >
                      <GlobeIcon size={16} />
                      <span>Search</span>
                    </PromptInputButton>
                    <ModelSelector onOpenChange={handleModelSelectorOpenChange} open={modelSelectorOpen}>
                      <ModelSelectorTrigger asChild>
                        <PromptInputButton disabled={isBusyGenerating} type="button">
                          {selectedModelData ? (
                            <ModelSelectorLogo provider={getModelLogoProvider(selectedModelData)} />
                          ) : null}
                          {isSelectedModelLoading ? <Spinner className="size-3.5" /> : null}
                          {selectedModelData?.name ? (
                            <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                          ) : null}
                        </PromptInputButton>
                      </ModelSelectorTrigger>
                      <ModelSelectorContent className="gap-0 overflow-hidden p-0 sm:max-w-5xl" title="Model Selection">
                        <div className="border-b px-6 py-5">
                          <div className="flex items-center justify-between gap-4">
                            <div>
                              <h2 className="text-xl font-semibold text-foreground">Model Selection</h2>
                              <p className="mt-1 text-sm text-muted-foreground">
                                Choose the local model the chatbot should load and keep ready in this browser.
                              </p>
                            </div>
                          </div>
                        </div>

                        <div className="border-b px-6 py-4">
                          <div className="relative">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="h-11 pl-9"
                              onChange={(event) => setModelSearch(event.target.value)}
                              placeholder="Search model..."
                              value={modelSearch}
                            />
                          </div>

                          <div className="mt-4 flex flex-wrap gap-2">
                            {modelFamilies.map((family) => {
                              const isActive = selectedModelFamily === family.id;

                              return (
                                <Button
                                  className="h-9 rounded-md px-3"
                                  key={family.id}
                                  onClick={() =>
                                    setSelectedModelFamily((current) =>
                                      current === family.id ? null : family.id,
                                    )
                                  }
                                  type="button"
                                  variant={isActive ? 'secondary' : 'outline'}
                                >
                                  <ModelSelectorLogo provider={family.logoProvider} />
                                  <span>{family.label}</span>
                                </Button>
                              );
                            })}
                          </div>
                        </div>

                        <div className="max-h-[58vh] overflow-y-auto px-6 py-4">
                          {filteredModels.length === 0 ? (
                            <div className="rounded-md border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                              No models match that search.
                            </div>
                          ) : (
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                              {filteredModels.map((candidate) => (
                                <ModelItem
                                  isLoading={loadingModelId === candidate.id}
                                  isSelected={model === candidate.id}
                                  key={candidate.id}
                                  m={candidate}
                                  onSelect={handleModelSelect}
                                />
                              ))}
                            </div>
                          )}
                        </div>
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
