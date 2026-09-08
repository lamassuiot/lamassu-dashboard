'use client';

import type {
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
import { ChatToolInputForm } from '@/components/tools/ChatToolInputForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Progress } from '@/components/ui/progress';
import { Spinner } from '@/components/ui/spinner';
import { useConfig } from '@/contexts/ConfigContext';
import {
  CHAT_TOOL_COUNT,
  createSyntheticToolCall,
  createPendingToolInvocation,
  createToolInputInvocation,
  createToolResultMessage,
  executeChatToolCall,
  getChatToolInputRequest,
  getChatToolPlanningCatalog,
  isDestructiveTool,
  type ChatToolInvocation,
} from '@/lib/chat-tools';
import {
  buildToolExecutionHistory,
  cleanProviderAssistantText,
  createToolCallSignature,
} from '@/lib/chat-tool-loop';
import {
  ensureSeedIndex,
  searchSeedIndex,
  type RagIndexSummary,
  type RagSearchResult,
} from '@/lib/local-rag';
import {
  createOpenAICompatibleCompletion,
  DEFAULT_OPENAI_COMPATIBLE_BASE_URL,
  DEFAULT_OPENAI_COMPATIBLE_MODEL,
  getOpenAICompatibleConfigDefaults,
  streamOpenAICompatibleCompletion,
  type OpenAICompatibleConfig,
} from '@/lib/openai-compatible';
import { parseModelJson } from '@/lib/model-json';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { AlertCircleIcon, BotIcon, CheckIcon, GlobeIcon, GripHorizontalIcon, InfoIcon, SearchIcon, SettingsIcon, WrenchIcon } from 'lucide-react';
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
  inferenceTarget: InferenceTarget;
  ragResults: RagSearchResult[];
  toolCalls: ChatCompletionMessageToolCall[];
  toolMessages: Map<string, ChatCompletionToolMessageParam>;
  unresolvedToolIds: Set<string>;
}

type InferenceTarget =
  | {
      kind: 'webllm';
      model: string;
      name: string;
    }
  | {
      kind: 'openai-compatible';
      config: OpenAICompatibleConfig;
    };

interface ToolPlanningResult {
  assistant_response?: string | null;
  tool_calls?: Array<{
    name?: string;
    arguments?: Record<string, unknown>;
  }>;
}

const DEFAULT_MODEL_ID = 'Qwen3-1.7B-q4f16_1-MLC';
const MODEL_STORAGE_KEY = 'lamassu-webllm-model';
const OPENAI_BASE_URL_STORAGE_KEY = 'lamassu-openai-compatible-base-url';
const OPENAI_MODEL_STORAGE_KEY = 'lamassu-openai-compatible-model';
const MAX_TOOL_PLANNING_ROUNDS = 12;
const MAX_TOOL_CALLS = 24;
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
  'If a tool is appropriate but required arguments were not provided by the user, call it with the arguments that are known. The dashboard will render a form for the missing values. Do not ask for those values in assistant_response.',
  'Never claim a tool ran unless tool output is present.',
].join(' ');
const PLANNING_RESPONSE_INSTRUCTIONS = [
  'Return JSON only.',
  'Do not include markdown fences.',
  'Use double quotes around every property name and string value. Do not use single quotes, comments, or trailing commas.',
  'Use this shape exactly:',
  '{"assistant_response": string | null, "tool_calls": [{"name": string, "arguments": object}]}',
  'If live data or a dashboard action is needed, put the tool calls in tool_calls.',
  'If a needed tool argument is missing from the user request, omit that argument and still return the tool call so the UI can collect it with a form. Never invent missing values.',
  'If no tool is needed, return an empty tool_calls array and fill assistant_response.',
  'After receiving tool results, request another tool call whenever more live data is needed.',
  'For exhaustive list requests, use the largest allowed page_size to minimize pagination calls.',
  'For requests asking for all results, continue pagination while the latest result has a non-null next bookmark.',
  'When continuing pagination, reuse the same filters and pass the returned next value as bookmark.',
  'Do not repeat an identical tool call with identical arguments.',
  'Never emit provider-specific tool tokens such as <|open|>, <|close|>, or <|sep|>.',
  'Never invent tool names.',
].join(' ');
const FINAL_RESPONSE_INSTRUCTIONS = [
  'The live dashboard tool phase is complete.',
  'Answer the user using the supplied tool results.',
  'Do not request or emit another tool call.',
  'Do not output internal control tokens such as <|open|>, <|close|>, or <|sep|>.',
  'If a safety limit stopped pagination, clearly say that the results are partial.',
].join(' ');
const VISUALIZATION_RESPONSE_INSTRUCTIONS = [
  'When structured or quantitative data would be clearer as a dashboard block, include a concise textual summary followed by one fenced code block tagged tremor.',
  'The block must contain valid JSON with no comments and use only the fields described below.',
  'Supported chart types are bar, line, area, donut, spark-line, spark-area, spark-bar, and category-bar. Supported dashboard blocks are metric, bar-list, progress, progress-circle, tracker, and table.',
  'For bar use: {"type":"bar","title":"Certificates by status","data":[{"status":"active","count":8}],"index":"status","categories":["count"],"showLegend":false,"showGrid":true,"valueFormat":"number","orientation":"vertical","stack":"none"}. Only bar accepts orientation (vertical or horizontal).',
  'For area use the same data/index/categories fields with type area and stack set to none, stacked, or percent.',
  'For line charts prefer a rich layout inspired by Tremor blocks: summary combines an overall metric, chart, and detailed series rows; comparison combines a main chart with a side summary; metric-grid renders one detailed mini-trend per category. Example: {"type":"line","title":"Certificate growth","description":"Current period compared with the first period","data":[{"month":"Jan","active":8,"expired":4},{"month":"Feb","active":12,"expired":2}],"index":"month","categories":["active","expired"],"layout":"comparison","series":[{"category":"active","label":"Active","description":"Ready to use","badge":"Healthy"},{"category":"expired","label":"Expired"}],"summaryLabel":"Current certificates","showGrid":true,"showLegend":true,"valueFormat":"number"}. layout must be summary, comparison, metric-grid, or default.',
  'For donut charts prefer one of these detailed layouts: breakdown (chart plus value/share rows), rings (concentric progress with max), split (chart plus side breakdown), tabs, tabs-bordered, or tabs-rows. Example: {"type":"donut","title":"Certificates by status","data":[{"status":"active","count":8},{"status":"expired","count":2}],"index":"status","category":"count","variant":"donut","layout":"breakdown","centerLabel":"Total","showLegend":true,"valueFormat":"number"}.',
  'Tabbed donut layouts require groups instead of data, with 2 to 5 datasets: {"type":"donut","title":"Certificate breakdown","groups":[{"name":"By status","data":[{"name":"Active","count":8},{"name":"Expired","count":2}]},{"name":"By algorithm","data":[{"name":"RSA","count":6},{"name":"ECDSA","count":4}]}],"index":"name","category":"count","layout":"tabs","showLegend":true,"valueFormat":"number"}. Do not invent a seventh donut layout.',
  'For a compact trend use spark-line, spark-area, or spark-bar: {"type":"spark-line","title":"Issued certificates","data":[{"month":"Jan","count":8},{"month":"Feb","count":12}],"index":"month","category":"count","valueFormat":"number"}.',
  'For composition on one scale use: {"type":"category-bar","title":"Certificate states","data":[{"name":"Active","value":80},{"name":"Expired","value":20}],"marker":{"value":75,"tooltip":"Target"},"showLegend":true,"valueFormat":"number"}.',
  'For a KPI use: {"type":"metric","title":"Active certificates","value":42,"description":"Optional context","valueFormat":"number","delta":{"value":"+12%","label":"vs previous period","trend":"up"}}.',
  'For ranked values use: {"type":"bar-list","title":"Algorithms","data":[{"name":"RSA","value":12}],"sort":"descending","valueFormat":"number"}.',
  'For genuine bounded progress use progress or progress-circle: {"type":"progress","title":"Rotation rollout","label":"Completed","value":12,"max":20,"display":"percent","variant":"default"}.',
  'For a status timeline use: {"type":"tracker","title":"Last checks","data":[{"status":"success","tooltip":"Healthy"},{"status":"warning","tooltip":"Delayed"}]}. Status must be success, warning, error, or neutral.',
  'For exact row data use: {"type":"table","title":"Certificates","columns":[{"key":"name","label":"Name"},{"key":"expires","label":"Expires"},{"key":"status","label":"Status","format":"badge"}],"data":[{"name":"api","expires":"2027-01-01","status":"active"}]}. Column format may be text, number, compact, percent, or badge; align may be left or right.',
  'valueFormat must be number, compact, or percent. Percent values must be decimals between 0 and 1.',
  'Put all block data directly in the JSON; never use URLs, code, component names, colors, or arbitrary React properties.',
  'Do not invent values: visualize only data supplied by the user, retrieved context, or completed tool results.',
  'Use at most one block unless the user explicitly requests a dashboard. Do not include a block when prose communicates the result better.',
].join(' ');
const VISUALIZATION_REQUEST_PATTERN = /(bar.?list|category.?bar|chart|dashboard|graph|kpi|metric|plot|progress|spark|table|tracker|visuali[sz]|estad[ií]st|gr[aá]fic|m[eé]trica|progreso|seguimiento|tabla)/i;

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
          cacheBackend: 'indexeddb',
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
    } catch {
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
  return cleanProviderAssistantText(text);
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
  const parsed = parseModelJson<ToolPlanningResult>(extractJsonObject(text));
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
  toolCalls: ChatCompletionMessageToolCall[] = [],
  toolMessages: ChatCompletionToolMessageParam[] = [],
): ChatCompletionMessageParam[] {
  const toolHistory = buildToolExecutionHistory(toolCalls, toolMessages);
  const plannerPrompt = [
    TOOL_SYSTEM_PROMPT,
    PLANNING_RESPONSE_INSTRUCTIONS,
    '',
    'Available tools:',
    toolPlanningCatalog,
    '',
    'Plan the response for this user request:',
    currentPrompt,
    ...(toolHistory.length > 0
      ? [
          '',
          'Tool calls already completed (JSON):',
          JSON.stringify(toolHistory, null, 2),
          '',
          'Decide whether another tool call is required. Do not repeat completed calls.',
        ]
      : []),
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...buildConversationMessages(conversation, plannerPrompt),
  ];
}

function buildFinalResponseMessages(
  conversation: ChatMessage[],
  currentPrompt: string,
  ragResults: RagSearchResult[],
  toolCalls: ChatCompletionMessageToolCall[],
  toolMessages: ChatCompletionToolMessageParam[],
  stopReason?: string | null,
): ChatCompletionMessageParam[] {
  const toolHistory = buildToolExecutionHistory(toolCalls, toolMessages);
  const finalPrompt = [
    buildPromptWithRag(currentPrompt, ragResults),
    ...(toolHistory.length > 0
      ? [
          '',
          'Completed live dashboard tool calls (JSON):',
          JSON.stringify(toolHistory, null, 2),
        ]
      : []),
    ...(stopReason ? ['', `Tool loop note: ${stopReason}`] : []),
    '',
    FINAL_RESPONSE_INSTRUCTIONS,
    VISUALIZATION_RESPONSE_INSTRUCTIONS,
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    ...buildConversationMessages(conversation, finalPrompt),
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
      className="h-auto w-full justify-start whitespace-normal px-3 py-2 text-left text-xs font-normal text-muted-foreground hover:text-foreground"
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
        'h-auto w-full items-center justify-start gap-3 rounded-md px-3 py-2.5 text-left shadow-none',
        isSelected ? 'bg-accent/60' : 'hover:bg-accent/40',
      )}
      onClick={handleSelect}
      type="button"
      variant="ghost"
    >
      <ModelSelectorLogo className="size-4 shrink-0" provider={getModelLogoProvider(m)} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-medium text-foreground">{m.name}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{m.vram}</span>
          {m.supportsToolCalling ? (
            <Badge className="h-4 px-1.5 text-[10px]" variant="outline">
              Tools
            </Badge>
          ) : null}
        </div>
        <p className="truncate text-xs text-muted-foreground">{detail}</p>
      </div>
      {isLoading ? (
        <Spinner className="size-4 shrink-0 text-muted-foreground" />
      ) : isSelected ? (
        <CheckIcon className="size-4 shrink-0 text-foreground" />
      ) : null}
    </Button>
  );
};

export function WebLlmChatbot({ variant = 'page' }: WebLlmChatbotProps) {
  const { config } = useConfig();
  const configuredRemoteProvider = getOpenAICompatibleConfigDefaults(config);
  const configuredRemoteApiKey = configuredRemoteProvider.apiKey;
  const hasConfiguredRemoteBaseUrl =
    typeof config?.LAMASSU_OPENAI_BASE_URL === 'string'
    && Boolean(config.LAMASSU_OPENAI_BASE_URL.trim());
  const hasConfiguredRemoteModel =
    typeof config?.LAMASSU_OPENAI_MODEL === 'string'
    && Boolean(config.LAMASSU_OPENAI_MODEL.trim());
  const [model, setModel] = useState(DEFAULT_MODEL_ID);
  const [loadingModelId, setLoadingModelId] = useState<string | null>(null);
  const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedModelFamily, setSelectedModelFamily] = useState<ModelFamilyId | null>(null);
  const [providerSettingsOpen, setProviderSettingsOpen] = useState(false);
  const [remoteApiKey, setRemoteApiKey] = useState(configuredRemoteApiKey);
  const [remoteBaseUrl, setRemoteBaseUrl] = useState(
    configuredRemoteProvider.baseUrl,
  );
  const [remoteModel, setRemoteModel] = useState(
    configuredRemoteProvider.model,
  );
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
  const [ragStatus, setRagStatus] = useState<'idle' | 'indexing' | 'ready' | 'error'>('idle');
  const [ragSummary, setRagSummary] = useState<RagIndexSummary | null>(null);
  const [ragError, setRagError] = useState<string | null>(null);
  const pendingToolSessionsRef = useRef<Map<string, PendingToolSession>>(new Map());
  const remoteAbortControllerRef = useRef<AbortController | null>(null);
  const resizeDragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const [conversationHeight, setConversationHeight] = useState<number | null>(null);
  const conversationPanelRef = useRef<HTMLDivElement>(null);

  const isPanel = variant === 'panel';
  const toolPlanningCatalog = useMemo(() => getChatToolPlanningCatalog(), []);

  useEffect(() => {
    const storedModel = window.localStorage.getItem(MODEL_STORAGE_KEY);
    if (storedModel && models.some((candidate) => candidate.id === storedModel)) {
      setModel(storedModel);
    }

    const storedBaseUrl = window.localStorage.getItem(OPENAI_BASE_URL_STORAGE_KEY);
    const storedRemoteModel = window.localStorage.getItem(OPENAI_MODEL_STORAGE_KEY);
    if (!hasConfiguredRemoteBaseUrl && storedBaseUrl) setRemoteBaseUrl(storedBaseUrl);
    if (!hasConfiguredRemoteModel && storedRemoteModel) setRemoteModel(storedRemoteModel);

    const gpuCapableNavigator = navigator as Navigator & { gpu?: unknown };
    setHasWebGpuSupport(Boolean(gpuCapableNavigator.gpu));
  }, [hasConfiguredRemoteBaseUrl, hasConfiguredRemoteModel]);

  useEffect(() => {
    window.localStorage.setItem(MODEL_STORAGE_KEY, model);
  }, [model]);

  useEffect(() => {
    window.localStorage.setItem(OPENAI_BASE_URL_STORAGE_KEY, remoteBaseUrl);
  }, [remoteBaseUrl]);

  useEffect(() => {
    window.localStorage.setItem(OPENAI_MODEL_STORAGE_KEY, remoteModel);
  }, [remoteModel]);

  const selectedModelData = useMemo(
    () => models.find((candidate) => candidate.id === model) ?? models.at(-1),
    [model],
  );
  const inferenceTarget = useMemo<InferenceTarget>(() => {
    if (remoteApiKey.trim()) {
      return {
        config: {
          apiKey: remoteApiKey.trim(),
          baseUrl: remoteBaseUrl.trim(),
          model: remoteModel.trim(),
        },
        kind: 'openai-compatible',
      };
    }

    return {
      kind: 'webllm',
      model,
      name: selectedModelData?.name ?? 'the selected model',
    };
  }, [model, remoteApiKey, remoteBaseUrl, remoteModel, selectedModelData]);
  const isRemoteProvider = inferenceTarget.kind === 'openai-compatible';
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

  const handleStop = useCallback(async () => {
    if (remoteAbortControllerRef.current) {
      remoteAbortControllerRef.current.abort();
      return;
    }

    if (!enginePromise) {
      return;
    }

    try {
      const engine = await enginePromise;
      engine.interruptGenerate();
    } catch {
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
      target,
      startedAt,
      toolCallCount = 0,
    }: {
      assistantKey: string;
      messageId: string;
      completionMessages: ChatCompletionMessageParam[];
      ragResults: RagSearchResult[];
      target: InferenceTarget;
      startedAt: number;
      toolCallCount?: number;
    }) => {
      if (target.kind === 'webllm' && hasWebGpuSupport === false) {
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

      const targetName = target.kind === 'openai-compatible' ? target.config.model : target.name;
      const generationLocation = target.kind === 'openai-compatible'
        ? `with ${targetName} through the configured provider`
        : `locally with ${targetName}`;
      let localEngine: MLCEngineInterface | null = null;
      let remoteController: AbortController | null = null;

      try {
        setStatus('submitted');

        if (target.kind === 'webllm') {
          const shouldReportProgress = !warmedModelIds.has(target.model) || activeModelId !== target.model;
          if (shouldReportProgress) {
            setLoadingModelId(target.model);
          }

          localEngine = await ensureEngine(
            target.model,
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
          setLoadingModelId(null);
        } else {
          remoteController = new AbortController();
          remoteAbortControllerRef.current = remoteController;
        }

        setStatus('streaming');

        updateMessage(assistantKey, (message) => ({
          ...message,
          reasoning: {
            content:
              toolCallCount > 0 && ragResults.length > 0
                ? `Generating a response ${generationLocation} using ${toolCallCount} live API tool result${toolCallCount > 1 ? 's' : ''} and ${ragResults.length} retrieved seed passages.`
                : toolCallCount > 0
                  ? `Generating a response ${generationLocation} using ${toolCallCount} live API tool result${toolCallCount > 1 ? 's' : ''}.`
                  : ragResults.length > 0
                    ? `Generating a response ${generationLocation} using ${ragResults.length} retrieved seed passages.`
                    : `Generating a response ${generationLocation}.`,
            duration: Math.max(0, Math.round((Date.now() - startedAt) / 1000)),
            isStreaming: true,
          },
        }));

        let reply = '';

        if (target.kind === 'openai-compatible') {
          for await (const content of streamOpenAICompatibleCompletion(target.config, {
            messages: completionMessages,
            signal: remoteController?.signal,
            temperature: 0.6,
          })) {
            reply += content;
          }
        } else if (localEngine) {
          const stream = await localEngine.chat.completions.create({
            messages: completionMessages,
            stream: true,
            stream_options: { include_usage: true },
            temperature: 0.6,
          });

          for await (const chunk of stream) {
            reply += chunk.choices[0]?.delta.content ?? '';
          }
        }

        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));
        const sanitizedReply = sanitizeAssistantReply(reply);

        updateMessage(assistantKey, (message) => ({
          ...message,
          status: undefined,
          reasoning: {
            content: [
              toolCallCount > 0 && ragResults.length > 0
                ? `Response generated ${generationLocation} using live API tools and the local seed corpus.`
                : toolCallCount > 0
                  ? `Response generated ${generationLocation} using live API tools.`
                  : ragResults.length > 0
                    ? `Response generated ${generationLocation} using the local seed corpus.`
                    : `Response generated ${generationLocation}.`,
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
        if (localEngine) {
          await syncEngineDiagnostics(localEngine);
        }
      } catch (error) {
        const wasAborted = error instanceof Error && error.name === 'AbortError';
        const targetModelData = target.kind === 'webllm'
          ? models.find((candidate) => candidate.id === target.model)
          : undefined;
        const message = wasAborted
          ? 'Generation stopped.'
          : target.kind === 'webllm'
            ? withToolModelGuidance(normalizeError(error), targetModelData)
            : normalizeError(error);
        const duration = Math.max(1, Math.round((Date.now() - startedAt) / 1000));

        setEngineError(wasAborted ? null : message);
        setStatus(wasAborted ? 'ready' : 'error');
        setProgressReport(null);

        updateMessage(assistantKey, (currentMessage) => ({
          ...currentMessage,
          status: wasAborted ? undefined : 'error',
          reasoning: {
            content: wasAborted
              ? 'Generation was stopped by the user.'
              : target.kind === 'webllm'
                ? 'The local model returned an error while generating the response.'
                : 'The OpenAI-compatible provider returned an error while generating the response.',
            duration,
            isStreaming: false,
          },
          versions: currentMessage.versions.map((version) =>
            version.id === messageId ? { ...version, content: message } : version,
            ),
        }));
      } finally {
        setLoadingModelId((current) => target.kind === 'webllm' && current === target.model ? null : current);
        if (remoteController && remoteAbortControllerRef.current === remoteController) {
          remoteAbortControllerRef.current = null;
        }
      }
    },
    [hasWebGpuSupport, syncEngineDiagnostics, updateMessage],
  );

  const continueToolConversation = useCallback(
    (session: PendingToolSession) => {
      const prompt = session.conversation.at(-1)?.versions[0]?.content ?? '';
      const completionMessages = buildFinalResponseMessages(
        session.conversation,
        prompt,
        session.ragResults,
        session.toolCalls,
        Array.from(session.toolMessages.values()),
      );

      void streamAssistantReply({
        assistantKey: session.assistantKey,
        messageId: session.assistantVersionId,
        completionMessages,
        ragResults: session.ragResults,
        target: session.inferenceTarget,
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
          description: 'The chatbot does not parse attachment contents yet, so only your typed text will be sent.',
        });
      }

      if (!hasText) {
        sileo.warning({
          title: 'Text required',
          description: 'Add a text prompt alongside attachments so the model has something to answer.',
        });
        return;
      }

      if (inferenceTarget.kind === 'openai-compatible' && (!inferenceTarget.config.baseUrl || !inferenceTarget.config.model)) {
        sileo.warning({
          title: 'Provider settings incomplete',
          description: 'Add both a base URL and model for the OpenAI-compatible provider.',
        });
        setProviderSettingsOpen(true);
        return;
      }

      if (inferenceTarget.kind === 'webllm' && loadingModelId === model) {
        sileo.info({
          title: 'Model still loading',
          description: `${selectedModelData?.name ?? 'The selected model'} is still downloading or initializing locally. Wait for it to finish before sending a message.`,
        });
        return;
      }

      if (useWebSearch && ragStatus === 'indexing') {
        sileo.info({
          title: 'Local RAG still indexing',
          description: 'Wait for the local seed corpus to finish indexing before sending a new message.',
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
          content: useWebSearch
            ? 'Searching the local seed corpus.'
            : inferenceTarget.kind === 'openai-compatible'
              ? 'Preparing the OpenAI-compatible provider request.'
              : 'Preparing the local model.',
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
      let toolLoopStopReason: string | null = null;

      if (useApiTools) {
        try {
          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            reasoning: {
              content: `Analyzing your request with ${inferenceTarget.kind === 'openai-compatible' ? inferenceTarget.config.model : inferenceTarget.name} and ${CHAT_TOOL_COUNT} available live API tools.`,
              duration: 0,
              isStreaming: true,
            },
          }));

          const seenToolCalls = new Set<string>();
          let finalPlanningResponse: string | null = null;

          for (let round = 0; round < MAX_TOOL_PLANNING_ROUNDS; round += 1) {
            if (round > 0) {
              updateMessage(assistantKey, (currentMessage) => ({
                ...currentMessage,
                reasoning: {
                  content: `Reviewing ${toolCalls.length} live API result${toolCalls.length === 1 ? '' : 's'} for any required follow-up call.`,
                  duration: 0,
                  isStreaming: true,
                },
              }));
            }

            const planningMessages = buildToolPlanningMessages(
              conversation,
              prompt,
              toolPlanningCatalog,
              toolCalls,
              toolMessages,
            );
            let planningContent = '';

            if (inferenceTarget.kind === 'openai-compatible') {
              const controller = new AbortController();
              remoteAbortControllerRef.current = controller;

              try {
                planningContent = await createOpenAICompatibleCompletion(inferenceTarget.config, {
                  messages: planningMessages,
                  signal: controller.signal,
                  temperature: 0,
                });
              } finally {
                if (remoteAbortControllerRef.current === controller) {
                  remoteAbortControllerRef.current = null;
                }
              }
            } else {
              const shouldReportProgress = !warmedModelIds.has(model) || activeModelId !== model;
              if (shouldReportProgress) {
                setLoadingModelId(model);
              }

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

              setLoadingModelId(null);
              const planningResponse = await engine.chat.completions.create({
                messages: planningMessages,
                temperature: 0,
              });

              setProgressReport(null);
              await syncEngineDiagnostics(engine);
              planningContent = planningResponse.choices[0]?.message?.content ?? '';
            }

            const planningResult = parseToolPlanningResult(planningContent);
            const plannedCalls = (planningResult.tool_calls ?? [])
              .filter((toolCall): toolCall is NonNullable<ToolPlanningResult['tool_calls']>[number] =>
                Boolean(toolCall?.name && typeof toolCall.name === 'string'),
              );
            const roundToolCalls: ChatCompletionMessageToolCall[] = [];
            let repeatedCallCount = 0;

            for (const plannedCall of plannedCalls) {
              if (toolCalls.length + roundToolCalls.length >= MAX_TOOL_CALLS) {
                toolLoopStopReason = `The tool loop reached its ${MAX_TOOL_CALLS}-call safety limit.`;
                break;
              }

              const args = plannedCall.arguments && typeof plannedCall.arguments === 'object'
                ? plannedCall.arguments
                : {};
              const name = plannedCall.name ?? '';
              const signature = createToolCallSignature(name, args);
              if (seenToolCalls.has(signature)) {
                repeatedCallCount += 1;
                continue;
              }

              seenToolCalls.add(signature);
              roundToolCalls.push(createSyntheticToolCall(
                name,
                args,
                `${assistantKey}-tool-${toolCalls.length + roundToolCalls.length + 1}`,
              ));
            }

            if (roundToolCalls.length === 0) {
              if (toolLoopStopReason) {
                break;
              } else if (repeatedCallCount > 0) {
                toolLoopStopReason = 'The model repeated an identical tool call, so execution stopped to prevent a loop.';
              } else {
                finalPlanningResponse = planningResult.assistant_response ?? null;
              }
              break;
            }

            toolCalls = [...toolCalls, ...roundToolCalls];
            const invocations: ChatToolInvocation[] = [];
            const pendingToolIds = new Set<string>();
            let inputRequestCount = 0;

            for (const toolCall of roundToolCalls) {
              const inputInvocation = createToolInputInvocation(toolCall);
              if (inputInvocation) {
                pendingToolIds.add(toolCall.id);
                inputRequestCount += 1;
                invocations.push(inputInvocation);
                continue;
              }

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
              tools: [...(currentMessage.tools ?? []), ...invocations],
              reasoning: {
                content:
                  pendingToolIds.size > 0
                    ? inputRequestCount > 0
                      ? `The model selected ${roundToolCalls.length} live API tool${roundToolCalls.length > 1 ? 's' : ''}. Complete ${inputRequestCount > 1 ? 'the input forms' : 'the input form'}${pendingToolIds.size > inputRequestCount ? ' and review the confirmation requests' : ''} below to continue.`
                      : `The model selected ${roundToolCalls.length} live API tool${roundToolCalls.length > 1 ? 's' : ''}. Confirm the destructive action${pendingToolIds.size > 1 ? 's' : ''} below to continue.`
                    : `Executed ${toolCalls.length} live API tool call${toolCalls.length > 1 ? 's' : ''} across ${round + 1} planning round${round > 0 ? 's' : ''}.`,
                duration: 0,
                isStreaming: true,
              },
            }));

            if (pendingToolIds.size > 0) {
              pendingToolSessionsRef.current.set(assistantKey, {
                assistantKey,
                assistantVersionId,
                conversation,
                inferenceTarget,
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
                        content: inputRequestCount > 0
                          ? 'Additional input is required. Complete the tool form below to continue.'
                          : 'The model requested a destructive action. Review the confirmation block below to continue.',
                      }
                    : version,
                ),
              }));
              return;
            }

            if (toolCalls.length >= MAX_TOOL_CALLS) {
              toolLoopStopReason = `The tool loop reached its ${MAX_TOOL_CALLS}-call safety limit.`;
              break;
            }

            if (round === MAX_TOOL_PLANNING_ROUNDS - 1) {
              toolLoopStopReason = `The tool loop reached its ${MAX_TOOL_PLANNING_ROUNDS}-round safety limit.`;
            }
          }

          if (
            finalPlanningResponse
            && !useWebSearch
            && toolCalls.length === 0
            && !VISUALIZATION_REQUEST_PATTERN.test(prompt)
          ) {
            const sanitizedReply = sanitizeAssistantReply(finalPlanningResponse);
            setStatus('ready');
            updateMessage(assistantKey, (currentMessage) => ({
              ...currentMessage,
              status: undefined,
              reasoning: {
                content: inferenceTarget.kind === 'openai-compatible'
                  ? `Response generated with ${inferenceTarget.config.model} through the configured provider without using live API tools.`
                  : `Response generated locally with ${inferenceTarget.name} without using live API tools.`,
                duration: 1,
                isStreaming: false,
              },
              versions: currentMessage.versions.map((version) =>
                version.id === assistantVersionId
                  ? { ...version, content: sanitizedReply.finalAnswer || 'No output returned.' }
                  : version,
              ),
            }));
            return;
          }

        } catch (error) {
          const wasAborted = error instanceof Error && error.name === 'AbortError';
          const toolPlanningError = wasAborted
            ? 'Generation stopped.'
            : inferenceTarget.kind === 'webllm'
              ? withToolModelGuidance(normalizeError(error), selectedModelData)
              : normalizeError(error);
          setEngineError(wasAborted ? null : toolPlanningError);
          setStatus(wasAborted ? 'ready' : 'error');
          setLoadingModelId(null);
          setProgressReport(null);
          updateMessage(assistantKey, (currentMessage) => ({
            ...currentMessage,
            status: wasAborted ? undefined : 'error',
            reasoning: {
              content: wasAborted
                ? 'Generation was stopped by the user.'
                : 'Tool planning failed before the final response could be generated.',
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

      const completionMessages = buildFinalResponseMessages(
        conversation,
        prompt,
        ragResults,
        toolCalls,
        toolMessages,
        toolLoopStopReason,
      );

      void streamAssistantReply({
        assistantKey,
        messageId: assistantVersionId,
        completionMessages,
        ragResults,
        target: inferenceTarget,
        startedAt: Date.now(),
        toolCallCount: toolCalls.length,
      });
    },
    [
      messages,
      model,
      inferenceTarget,
      loadingModelId,
      selectedModelData,
      streamAssistantReply,
      syncEngineDiagnostics,
      toolPlanningCatalog,
      updateMessage,
      useApiTools,
      useWebSearch,
      ragStatus,
    ],
  );

  const handleToolApproval = useCallback(
    async (messageKey: string, toolId: string, approved: boolean) => {
      const session = pendingToolSessionsRef.current.get(messageKey);
      const toolCall = session?.toolCalls.find((candidate) => candidate.id === toolId);

      if (!session || !toolCall) {
        return;
      }

      const requiresApproval = isDestructiveTool(toolCall.function.name);

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
                      ? 'Action cancelled. Resolve the remaining tool request(s) to continue.'
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
                  state: requiresApproval ? 'approval-responded' : undefined,
                  approval: requiresApproval
                    ? {
                        id: toolId,
                        approved: true,
                      }
                    : undefined,
                }
              : tool,
          ),
          versions: message.versions.map((version, index) =>
            index === 0
              ? {
                  ...version,
                  content: requiresApproval
                    ? 'Confirmation received. Executing the requested action...'
                    : 'Input received. Running the tool...',
                }
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
                      ? 'Action processed. Waiting for the remaining tool request(s).'
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

  const handleToolInputSubmit = useCallback(
    async (messageKey: string, toolId: string, values: Record<string, unknown>) => {
      const session = pendingToolSessionsRef.current.get(messageKey);
      const toolCall = session?.toolCalls.find((candidate) => candidate.id === toolId);

      if (!session || !toolCall) {
        return;
      }

      let previousArguments: Record<string, unknown> = {};
      try {
        const parsed = JSON.parse(toolCall.function.arguments || '{}');
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          previousArguments = parsed as Record<string, unknown>;
        }
      } catch {
        previousArguments = {};
      }

      const parameters = { ...previousArguments, ...values };
      const updatedToolCall: ChatCompletionMessageToolCall = {
        ...toolCall,
        function: {
          ...toolCall.function,
          arguments: JSON.stringify(parameters),
        },
      };
      session.toolCalls = session.toolCalls.map((candidate) =>
        candidate.id === toolId ? updatedToolCall : candidate,
      );

      const inputRequest = getChatToolInputRequest(toolCall.function.name, parameters);
      if (inputRequest) {
        updateMessage(messageKey, (message) => ({
          ...message,
          tools: message.tools?.map((tool) =>
            tool.id === toolId
              ? { ...tool, parameters, inputRequest }
              : tool,
          ),
          versions: message.versions.map((version, index) =>
            index === 0
              ? {
                  ...version,
                  content: `More input is required: ${inputRequest.missingParameters.join(', ')}.`,
                }
              : version,
          ),
        }));
        return;
      }

      if (isDestructiveTool(toolCall.function.name)) {
        const pendingInvocation = createPendingToolInvocation(updatedToolCall);
        updateMessage(messageKey, (message) => ({
          ...message,
          tools: message.tools?.map((tool) => tool.id === toolId ? pendingInvocation : tool),
          versions: message.versions.map((version, index) =>
            index === 0
              ? { ...version, content: 'Input complete. Review and confirm the requested action.' }
              : version,
          ),
        }));
        return;
      }

      updateMessage(messageKey, (message) => ({
        ...message,
        tools: message.tools?.map((tool) =>
          tool.id === toolId
            ? { ...tool, inputRequest: undefined, parameters, status: 'running' }
            : tool,
        ),
      }));
      await handleToolApproval(messageKey, toolId, true);
    },
    [handleToolApproval, updateMessage],
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
    () =>
      !text.trim() ||
      (!isRemoteProvider && hasWebGpuSupport === false) ||
      (!isRemoteProvider && loadingModelId === model) ||
      (useWebSearch && ragStatus === 'indexing') ||
      status === 'streaming' ||
      status === 'submitted',
    [hasWebGpuSupport, isRemoteProvider, loadingModelId, model, ragStatus, status, text, useWebSearch],
  );
  const isBusyGenerating = status === 'streaming' || status === 'submitted';
  const isSelectedModelLoading = !isRemoteProvider && loadingModelId === model;
  const isRagIndexing = useWebSearch && ragStatus === 'indexing';
  const isComposerLocked = (!isRemoteProvider && hasWebGpuSupport === false) || isBusyGenerating || isSelectedModelLoading || isRagIndexing;

  const providerLabel = isRemoteProvider
    ? 'OpenAI-compatible'
    : hasWebGpuSupport === false
      ? 'Local WebLLM (unavailable)'
      : 'Local WebLLM';
  const activeModelLabel = isRemoteProvider
    ? inferenceTarget.config.model || 'No model configured'
    : (selectedModelData?.name ?? 'No model selected');
  const hasBlockingError = Boolean(engineError) || (!isRemoteProvider && hasWebGpuSupport === false);
  const statusTone = hasBlockingError
    ? 'bg-destructive'
    : isSelectedModelLoading || isRagIndexing
      ? 'bg-amber-500'
      : 'bg-emerald-500';
  const statusActivity = isSelectedModelLoading
    ? progressReport
      ? `Loading model ${Math.round(formatProgress(progressReport))}%`
      : 'Loading model'
    : isRagIndexing
      ? 'Indexing references'
      : null;

  const alerts: Array<{ description: string; title: string }> = [];
  if (!isRemoteProvider && hasWebGpuSupport === false) {
    alerts.push({
      description: 'Local inference needs WebGPU. Use a recent Chrome or Edge build, or configure an OpenAI-compatible provider.',
      title: 'WebGPU unavailable',
    });
  }
  if (engineError) {
    alerts.push({
      description: engineError,
      title: isRemoteProvider ? 'Provider error' : 'Local model error',
    });
  }
  if (ragError && useWebSearch) {
    alerts.push({ description: ragError, title: 'Retrieval error' });
  }

  const detailLines: string[] = [];
  detailLines.push(
    isRemoteProvider
      ? `Prompts, retrieved passages, and tool results are sent from this browser to ${inferenceTarget.config.baseUrl || 'the configured endpoint'}.`
      : 'Prompts and model weights stay in this browser. Nothing is sent to an inference provider.',
  );
  if (!isRemoteProvider && selectedModelData?.note) {
    detailLines.push(selectedModelData.note);
  }
  if (!isRemoteProvider && gpuVendor) {
    detailLines.push(`GPU: ${gpuVendor}`);
  }
  detailLines.push(
    useApiTools
      ? `Live API tools enabled: the model receives all ${CHAT_TOOL_COUNT} tools on each prompt and decides whether to call them.`
      : 'Live API tools disabled: answers use model knowledge only.',
  );
  if (useWebSearch) {
    detailLines.push(
      ragSummary
        ? `Document retrieval ready: ${ragSummary.indexedDocumentCount}/${ragSummary.documentCount} documents indexed via ${ragSummary.retrievalMode === 'semantic' ? 'local embeddings' : 'lexical fallback'}.`
        : 'Document retrieval enabled over the bundled reference corpus.',
    );
  }
  if (!isRemoteProvider && runtimeStats && !progressReport) {
    detailLines.push(runtimeStats);
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', isPanel ? 'h-full' : 'min-h-[720px] gap-4')}>
      {!isPanel && (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">AI Assistant</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Chat over your PKI with live dashboard tools and local document retrieval.
          </p>
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex h-9 shrink-0 items-center gap-2 border-b bg-muted/30 px-4 text-xs">
          <span aria-hidden className={cn('size-1.5 shrink-0 rounded-full', statusTone)} />
          <span className="shrink-0 font-medium text-foreground">{providerLabel}</span>
          <span aria-hidden className="shrink-0 text-border">|</span>
          <span className="truncate text-muted-foreground">{activeModelLabel}</span>
          {statusActivity ? (
            <span className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              <Spinner className="size-3" />
              {statusActivity}
            </span>
          ) : null}
          <Popover>
            <PopoverTrigger asChild>
              <Button
                className="ml-auto size-6 shrink-0 text-muted-foreground"
                size="icon"
                title="Session details"
                type="button"
                variant="ghost"
              >
                <InfoIcon className="size-3.5" />
                <span className="sr-only">Session details</span>
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-[320px] p-3" side="bottom">
              <p className="text-xs font-medium text-foreground">Session details</p>
              <ul className="mt-2 space-y-1.5">
                {detailLines.map((line) => (
                  <li className="text-xs leading-5 text-muted-foreground" key={line}>
                    {line}
                  </li>
                ))}
              </ul>
            </PopoverContent>
          </Popover>
        </div>

        {!isRemoteProvider && progressReport ? (
          <Progress className="h-0.5 shrink-0 rounded-none" value={formatProgress(progressReport)} />
        ) : null}

        {alerts.length > 0 ? (
          <div className="shrink-0 divide-y border-b">
            {alerts.map((alert) => (
              <div
                className="flex items-start gap-2 bg-destructive/5 px-4 py-2 text-xs leading-5 text-destructive"
                key={alert.title}
              >
                <AlertCircleIcon className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  <span className="font-medium">{alert.title}.</span> {alert.description}
                </p>
              </div>
            ))}
          </div>
        ) : null}

        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
          <div
            ref={conversationPanelRef}
            className={conversationHeight === null ? 'flex min-h-0 flex-1 overflow-hidden' : 'shrink-0 overflow-hidden'}
            style={conversationHeight !== null ? { height: conversationHeight } : undefined}
          >
          <Conversation>
            <ConversationContent>
              {messages.length === 0 ? (
                <ConversationEmptyState className="gap-4">
                  <div className="flex size-9 items-center justify-center rounded-md border bg-muted/40">
                    <BotIcon className="size-4 text-muted-foreground" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-medium text-foreground">Lamassu Assistant</h3>
                    <p className="max-w-sm text-sm text-muted-foreground">
                      Ask about certificate authorities, devices, registrations, or keys.
                    </p>
                  </div>
                  <div className="flex w-full max-w-md flex-col gap-1.5">
                    {suggestions.slice(0, 3).map((suggestion) => (
                      <QuickPromptItem
                        key={suggestion}
                        onClick={handleSuggestionClick}
                        suggestion={suggestion}
                      />
                    ))}
                  </div>
                </ConversationEmptyState>
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
                                  <Tool
                                    defaultOpen={Boolean(tool.inputRequest) || tool.status === 'running' || tool.status === 'error'}
                                    key={tool.id}
                                  >
                                    <ToolHeader
                                      state={getToolUiState(tool)}
                                      statusLabel={tool.inputRequest ? 'Input required' : undefined}
                                      title={tool.name}
                                      type="dynamic-tool"
                                      toolName={tool.name}
                                    />
                                    <ToolContent>
                                      <p className="text-sm text-muted-foreground">{tool.description}</p>
                                      {tool.inputRequest ? (
                                        <ChatToolInputForm
                                          initialValues={tool.parameters}
                                          onCancel={() => void handleToolApproval(message.key, tool.id, false)}
                                          onSubmit={(values) => handleToolInputSubmit(message.key, tool.id, values)}
                                          request={tool.inputRequest}
                                          submitLabel={tool.destructive ? 'Review action' : 'Run tool'}
                                        />
                                      ) : (
                                        <ToolInput input={tool.parameters} />
                                      )}
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

          <div className="shrink-0 px-4 pb-4 pt-3">
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
                      ? 'Loading the selected model…'
                      : isRagIndexing
                        ? 'Indexing reference documents…'
                        : 'Ask a question'
                  }
                  value={text}
                />
              </PromptInputBody>
              <PromptInputFooter className="items-center gap-1">
                <PromptInputTools className="gap-0.5">
                  <PromptInputActionMenu>
                    <PromptInputActionMenuTrigger disabled={isComposerLocked} tooltip="Attach files" />
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
                  <PromptInputButton
                    aria-pressed={useApiTools}
                    disabled={isComposerLocked}
                    onClick={toggleApiTools}
                    tooltip={useApiTools ? 'Live API tools on' : 'Live API tools off'}
                    type="button"
                    variant={useApiTools ? 'default' : 'ghost'}
                  >
                    <WrenchIcon size={16} />
                  </PromptInputButton>
                  <PromptInputButton
                    aria-pressed={useWebSearch}
                    disabled={isComposerLocked}
                    onClick={toggleWebSearch}
                    tooltip={useWebSearch ? 'Document retrieval on' : 'Document retrieval off'}
                    type="button"
                    variant={useWebSearch ? 'default' : 'ghost'}
                  >
                    <GlobeIcon size={16} />
                  </PromptInputButton>
                  <Popover onOpenChange={setProviderSettingsOpen} open={providerSettingsOpen}>
                    <PopoverTrigger asChild>
                      <PromptInputButton
                        disabled={isBusyGenerating}
                        tooltip="Provider settings"
                        type="button"
                        variant={isRemoteProvider ? 'default' : 'ghost'}
                      >
                        <SettingsIcon size={16} />
                      </PromptInputButton>
                    </PopoverTrigger>
                    <PopoverContent align="end" className="w-[360px] p-4" side="top">
                      <div className="space-y-4">
                        <div className="space-y-1">
                          <p className="text-sm font-medium text-foreground">OpenAI-compatible provider</p>
                          <p className="text-xs leading-5 text-muted-foreground">
                            Requests go directly from this browser, so the endpoint must allow browser CORS. A key entered here stays in memory only.
                          </p>
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground" htmlFor="openai-compatible-base-url">
                            Base URL
                          </label>
                          <Input
                            autoCapitalize="none"
                            id="openai-compatible-base-url"
                            onChange={(event) => setRemoteBaseUrl(event.target.value)}
                            placeholder={DEFAULT_OPENAI_COMPATIBLE_BASE_URL}
                            spellCheck={false}
                            value={remoteBaseUrl}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground" htmlFor="openai-compatible-model">
                            Model
                          </label>
                          <Input
                            autoCapitalize="none"
                            id="openai-compatible-model"
                            onChange={(event) => setRemoteModel(event.target.value)}
                            placeholder={DEFAULT_OPENAI_COMPATIBLE_MODEL}
                            spellCheck={false}
                            value={remoteModel}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-xs font-medium text-foreground" htmlFor="openai-compatible-api-key">
                            API key
                          </label>
                          <Input
                            autoCapitalize="none"
                            autoComplete="off"
                            id="openai-compatible-api-key"
                            onChange={(event) => setRemoteApiKey(event.target.value)}
                            placeholder="Enter a key to use the remote provider"
                            spellCheck={false}
                            type="password"
                            value={remoteApiKey}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3 border-t pt-3">
                          <p className="text-xs text-muted-foreground">
                            {isRemoteProvider ? 'Remote provider active.' : 'No key: local WebLLM is active.'}
                          </p>
                          {remoteApiKey ? (
                            <Button onClick={() => setRemoteApiKey('')} size="sm" type="button" variant="outline">
                              Clear key
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    </PopoverContent>
                  </Popover>
                  {!isRemoteProvider ? (
                  <ModelSelector onOpenChange={handleModelSelectorOpenChange} open={modelSelectorOpen}>
                    <ModelSelectorTrigger asChild>
                      <PromptInputButton disabled={isBusyGenerating} type="button" variant="outline">
                        {selectedModelData ? (
                          <ModelSelectorLogo provider={getModelLogoProvider(selectedModelData)} />
                        ) : null}
                        {isSelectedModelLoading ? <Spinner className="size-3.5" /> : null}
                        {selectedModelData?.name ? (
                          <ModelSelectorName>{selectedModelData.name}</ModelSelectorName>
                        ) : null}
                      </PromptInputButton>
                    </ModelSelectorTrigger>
                    <ModelSelectorContent className="gap-0 overflow-hidden p-0 sm:max-w-3xl" title="Select a local model">
                      <div className="space-y-3 border-b px-5 py-4">
                        <div>
                          <h2 className="text-base font-semibold text-foreground">Select a local model</h2>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            The model is downloaded once and cached in this browser.
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <div className="relative min-w-[200px] flex-1">
                            <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                              className="h-9 pl-9"
                              onChange={(event) => setModelSearch(event.target.value)}
                              placeholder="Search models"
                              value={modelSearch}
                            />
                          </div>
                          {modelFamilies.map((family) => (
                            <Button
                              className="h-9 px-3"
                              key={family.id}
                              onClick={() =>
                                setSelectedModelFamily((current) =>
                                  current === family.id ? null : family.id,
                                )
                              }
                              type="button"
                              variant={selectedModelFamily === family.id ? 'secondary' : 'outline'}
                            >
                              <ModelSelectorLogo provider={family.logoProvider} />
                              <span>{family.label}</span>
                            </Button>
                          ))}
                        </div>
                      </div>

                      <div className="max-h-[56vh] overflow-y-auto p-2">
                        {filteredModels.length === 0 ? (
                          <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                            No models match that search.
                          </div>
                        ) : (
                          <div className="flex flex-col">
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
                  ) : null}
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
  );
}
