"use client";

import {
  MessageBranch,
  MessageBranchContent,
  MessageBranchNext,
  MessageBranchPage,
  MessageBranchPrevious,
  MessageBranchSelector,
} from "@/components/ai-elements/message";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  type PromptInputMessage,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { MessageResponse } from "@/components/ai-elements/message";
import {
  Source,
  Sources,
  SourcesContent,
  SourcesTrigger,
} from "@/components/ai-elements/sources";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ToolUIPart } from "ai";
import {
  AudioWaveformIcon,
  BarChartIcon,
  BoxIcon,
  CameraIcon,
  CodeSquareIcon,
  FileIcon,
  GlobeIcon,
  GraduationCapIcon,
  ImageIcon,
  NotepadTextIcon,
  PaperclipIcon,
  ScreenShareIcon,
} from "lucide-react";
import { nanoid } from "nanoid";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

type MessageType = {
  key: string;
  from: "user" | "assistant";
  sources?: { href: string; title: string }[];
  versions: {
    id: string;
    content: string;
  }[];
  reasoning?: {
    content: string;
    duration: number;
  };
  tools?: {
    name: string;
    description: string;
    status: ToolUIPart["state"];
    parameters: Record<string, unknown>;
    result: string | undefined;
    error: string | undefined;
  }[];
  isReasoningComplete?: boolean;
  isContentComplete?: boolean;
  isReasoningStreaming?: boolean;
};

const mockMessages: MessageType[] = [
  {
    key: nanoid(),
    from: "user",
    versions: [
      {
        id: nanoid(),
        content: "Can you explain how to use React hooks effectively?",
      },
    ],
  },
  {
    key: nanoid(),
    from: "assistant",
    versions: [
      {
        id: nanoid(),
        content: "React hooks are a powerful feature that let you use state and other React features without writing a class. Here are the key principles for using hooks effectively...",
      },
    ],
    sources: [
      {
        href: "https://react.dev/reference/react",
        title: "React Documentation",
      },
      {
        href: "https://react.dev/reference/react-dom",
        title: "React DOM Documentation",
      },
    ],
    tools: [
      {
        name: "mcp",
        description: "Searching React documentation",
        status: "input-available",
        parameters: {
          query: "React hooks best practices",
          source: "react.dev",
        },
        result: `{
  "query": "React hooks best practices",
  "results": [
    {
      "title": "Rules of Hooks",
      "url": "https://react.dev/warnings/invalid-hook-call-warning",
      "snippet": "Hooks must be called at the top level of your React function components or custom hooks. Don't call hooks inside loops, conditions, or nested functions."
    },
    {
      "title": "useState Hook",
      "url": "https://react.dev/reference/react/useState",
      "snippet": "useState is a React Hook that lets you add state to your function components. It returns an array with two values: the current state and a function to update it."
    },
    {
      "title": "useEffect Hook",
      "url": "https://react.dev/reference/react/useEffect",
      "snippet": "useEffect lets you synchronize a component with external systems. It runs after render and can be used to perform side effects like data fetching."
    }
  ]
}`,
        error: undefined,
      },
    ],
  },
];

const suggestions = [
  { icon: BarChartIcon, text: "Analyze data", color: "#76d0eb" },
  { icon: BoxIcon, text: "Surprise me", color: "#76d0eb" },
  { icon: NotepadTextIcon, text: "Summarize text", color: "#ea8444" },
  { icon: CodeSquareIcon, text: "Code", color: "#6c71ff" },
  { icon: GraduationCapIcon, text: "Get advice", color: "#76d0eb" },
  { icon: null, text: "More" },
];

const mockMessageResponses = [
  "That's a great question! Let me help you understand this concept better. The key thing to remember is that proper implementation requires careful consideration of the underlying principles and best practices in the field.",
  "I'd be happy to explain this topic in detail. From my understanding, there are several important factors to consider when approaching this problem. Let me break it down step by step for you.",
  "This is an interesting topic that comes up frequently. The solution typically involves understanding the core concepts and applying them in the right context. Here's what I recommend...",
  "Great choice of topic! This is something that many developers encounter. The approach I'd suggest is to start with the fundamentals and then build up to more complex scenarios.",
  "That's definitely worth exploring. From what I can see, the best way to handle this is to consider both the theoretical aspects and practical implementation details.",
];

interface AIChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

const Example = ({ isOpen, onClose }: AIChatSidebarProps) => {
  const [text, setText] = useState<string>("");
  const [useWebSearch, setUseWebSearch] = useState<boolean>(false);
  const [useMicrophone, setUseMicrophone] = useState<boolean>(false);
  const [status, setStatus] = useState<
    "submitted" | "streaming" | "ready" | "error"
  >("ready");
  const [messages, setMessages] = useState<MessageType[]>([]);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(
    null
  );
  const hasInitialized = useRef(false);
  const [width, setWidth] = useState<number>(600);
  const [isResizing, setIsResizing] = useState<boolean>(false);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const MIN_WIDTH = 400;
  const MAX_WIDTH = 1000;

  const streamReasoning = async (
    messageKey: string,
    versionId: string,
    reasoningContent: string
  ) => {
    const words = reasoningContent.split(" ");
    let currentContent = "";

    for (let i = 0; i < words.length; i++) {
      currentContent += (i > 0 ? " " : "") + words[i];

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.key === messageKey) {
            return {
              ...msg,
              reasoning: msg.reasoning
                ? { ...msg.reasoning, content: currentContent }
                : undefined,
            };
          }
          return msg;
        })
      );

      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 30 + 20)
      );
    }

    // Mark reasoning as complete
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.key === messageKey) {
          return {
            ...msg,
            isReasoningComplete: true,
            isReasoningStreaming: false,
          };
        }
        return msg;
      })
    );
  };

  const streamContent = async (
    messageKey: string,
    versionId: string,
    content: string
  ) => {
    const words = content.split(" ");
    let currentContent = "";

    for (let i = 0; i < words.length; i++) {
      currentContent += (i > 0 ? " " : "") + words[i];

      setMessages((prev) =>
        prev.map((msg) => {
          if (msg.key === messageKey) {
            return {
              ...msg,
              versions: msg.versions.map((v) =>
                v.id === versionId ? { ...v, content: currentContent } : v
              ),
            };
          }
          return msg;
        })
      );

      await new Promise((resolve) =>
        setTimeout(resolve, Math.random() * 50 + 25)
      );
    }

    // Mark content as complete
    setMessages((prev) =>
      prev.map((msg) => {
        if (msg.key === messageKey) {
          return { ...msg, isContentComplete: true };
        }
        return msg;
      })
    );
  };

  const streamMessageResponse = useCallback(
    async (
      messageKey: string,
      versionId: string,
      content: string,
      reasoning?: { content: string; duration: number }
    ) => {
      setStatus("streaming");
      setStreamingMessageId(versionId);

      // First stream the reasoning if it exists
      if (reasoning) {
        await streamReasoning(messageKey, versionId, reasoning.content);
        await new Promise((resolve) => setTimeout(resolve, 500)); // Pause between reasoning and content
      }

      // Then stream the content
      await streamContent(messageKey, versionId, content);

      setStatus("ready");
      setStreamingMessageId(null);
    },
    []
  );

  const streamMessage = useCallback(
    async (message: MessageType) => {
      if (message.from === "user") {
        setMessages((prev) => [...prev, message]);
        return;
      }

      // Add empty assistant message with reasoning structure
      const newMessage = {
        ...message,
        versions: message.versions.map((v) => ({ ...v, content: "" })),
        reasoning: message.reasoning
          ? { ...message.reasoning, content: "" }
          : undefined,
        isReasoningComplete: false,
        isContentComplete: false,
        isReasoningStreaming: !!message.reasoning,
      };

      setMessages((prev) => [...prev, newMessage]);

      // Get the first version for streaming
      const firstVersion = message.versions[0];
      if (!firstVersion) return;

      // Stream the response
      await streamMessageResponse(
        newMessage.key,
        firstVersion.id,
        firstVersion.content,
        message.reasoning
      );
    },
    [streamMessageResponse]
  );

  const addUserMessage = useCallback(
    (content: string) => {
      const userMessage: MessageType = {
        key: `user-${Date.now()}`,
        from: "user",
        versions: [
          {
            id: `user-${Date.now()}`,
            content,
          },
        ],
      };

      setMessages((prev) => [...prev, userMessage]);

      setTimeout(() => {
        const assistantMessageKey = `assistant-${Date.now()}`;
        const assistantMessageId = `version-${Date.now()}`;
        const randomMessageResponse =
          mockMessageResponses[Math.floor(Math.random() * mockMessageResponses.length)];

        // Create reasoning for some responses
        const shouldHaveReasoning = Math.random() > 0.5;
        const reasoning = shouldHaveReasoning
          ? {
              content:
                "Let me think about this question carefully. I need to provide a comprehensive and helpful response that addresses the user's needs while being clear and concise.",
              duration: 3,
            }
          : undefined;

        const assistantMessage: MessageType = {
          key: assistantMessageKey,
          from: "assistant",
          versions: [
            {
              id: assistantMessageId,
              content: "",
            },
          ],
          reasoning: reasoning ? { ...reasoning, content: "" } : undefined,
          isReasoningComplete: false,
          isContentComplete: false,
          isReasoningStreaming: !!reasoning,
        };

        setMessages((prev) => [...prev, assistantMessage]);
        streamMessageResponse(
          assistantMessageKey,
          assistantMessageId,
          randomMessageResponse,
          reasoning
        );
      }, 500);
    },
    [streamMessageResponse]
  );

  useEffect(() => {
    // Prevent duplicate initialization (e.g., in React Strict Mode)
    if (hasInitialized.current) {
      return;
    }
    
    hasInitialized.current = true;

    const processMessages = async () => {
      for (let i = 0; i < mockMessages.length; i++) {
        await streamMessage(mockMessages[i]);

        if (i < mockMessages.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    };

    // Small delay to ensure state is reset before starting
    const timer = setTimeout(() => {
      processMessages();
    }, 100);

    // Cleanup function to cancel any ongoing operations
    return () => {
      clearTimeout(timer);
    };
  }, [streamMessage]);

  // Resize handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing) return;
      
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= MIN_WIDTH && newWidth <= MAX_WIDTH) {
        setWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

    if (isResizing) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    setStatus("submitted");
    addUserMessage(message.text || "Sent with attachments");
    setText("");
  };

  const handleFileAction = (action: string) => {
    // toast.success("File action", {
    //   description: action,
    // });
  };

  const handleSuggestionClick = (suggestion: string) => {
    setStatus("submitted");
    addUserMessage(suggestion);
  };

  if (!isOpen) return null;

  return (
    <div
      ref={sidebarRef}
      className="fixed right-0 top-0 bottom-0 z-50 bg-background border-l shadow-2xl flex"
      style={{ width: `${width}px` }}
    >
      {/* Resize handle */}
      <div
        className={cn(
          "w-1 hover:w-1.5 bg-border hover:bg-primary transition-all cursor-col-resize flex-shrink-0",
          isResizing && "w-1.5 bg-primary"
        )}
        onMouseDown={handleMouseDown}
      />
      
      {/* Content */}
      <div className="relative flex flex-col flex-1 overflow-hidden">
        {/* Header with close button */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">AI Assistant</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
            aria-label="Close sidebar"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>

        {/* Chat content */}
        <div className="relative flex size-full flex-col divide-y overflow-hidden">
      <Conversation initial="instant" resize="instant">
        <ConversationContent>
          {messages.map(({ versions, ...message }) => (
            <MessageBranch defaultBranch={0} key={message.key}>
              <MessageBranchContent>
                {versions.map((version) => (
                  <Message
                    from={message.from}
                    key={`${message.key}-${version.id}`}
                  >
                    <div>
                      {message.sources?.length && (
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
                      )}
                      {message.reasoning && (
                        <Reasoning
                          duration={message.reasoning.duration}
                          isStreaming={message.isReasoningStreaming}
                        >
                          <ReasoningTrigger />
                          <ReasoningContent>
                            {message.reasoning.content}
                          </ReasoningContent>
                        </Reasoning>
                      )}
                      {(message.from === "user" ||
                        message.isReasoningComplete ||
                        !message.reasoning) && (
                        <MessageContent
                          className={cn(
                            "group-[.is-user]:rounded-[24px] group-[.is-user]:bg-secondary group-[.is-user]:text-foreground",
                            "group-[.is-assistant]:bg-transparent group-[.is-assistant]:p-0 group-[.is-assistant]:text-foreground"
                          )}
                        >
                          <MessageResponse>{version.content}</MessageResponse>
                        </MessageContent>
                      )}
                    </div>
                  </Message>
                ))}
              </MessageBranchContent>
              {versions.length > 1 && (
                <MessageBranchSelector className="px-0" from={message.from}>
                  <MessageBranchPrevious />
                  <MessageBranchPage />
                  <MessageBranchNext />
                </MessageBranchSelector>
              )}
            </MessageBranch>
          ))}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="grid shrink-0 gap-4 p-4">
        <PromptInput
          className="divide-y-0 rounded-[28px]"
          onSubmit={handleSubmit}
        >
          <PromptInputTextarea
            className="px-5 md:text-base"
            onChange={(event) => setText(event.target.value)}
            placeholder="Ask anything"
            value={text}
          />
          <PromptInputFooter className="p-2.5">
            <PromptInputTools>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <PromptInputButton
                    className="!rounded-full border font-medium"
                    variant="outline"
                  >
                    <PaperclipIcon size={16} />
                    <span>Attach</span>
                  </PromptInputButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start">
                  <DropdownMenuItem
                    onClick={() => handleFileAction("upload-file")}
                  >
                    <FileIcon className="mr-2" size={16} />
                    Upload file
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleFileAction("upload-photo")}
                  >
                    <ImageIcon className="mr-2" size={16} />
                    Upload photo
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleFileAction("take-screenshot")}
                  >
                    <ScreenShareIcon className="mr-2" size={16} />
                    Take screenshot
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onClick={() => handleFileAction("take-photo")}
                  >
                    <CameraIcon className="mr-2" size={16} />
                    Take photo
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <PromptInputButton
                className="rounded-full border font-medium"
                onClick={() => setUseWebSearch(!useWebSearch)}
                variant="outline"
              >
                <GlobeIcon size={16} />
                <span>Search</span>
              </PromptInputButton>
            </PromptInputTools>
            <PromptInputButton
              className="rounded-full font-medium text-foreground"
              onClick={() => setUseMicrophone(!useMicrophone)}
              variant="secondary"
            >
              <AudioWaveformIcon size={16} />
              <span>Voice</span>
            </PromptInputButton>
          </PromptInputFooter>
        </PromptInput>
        <Suggestions className="px-4">
          {suggestions.map(({ icon: Icon, text, color }) => (
            <Suggestion
              className="font-normal"
              key={text}
              onClick={() => handleSuggestionClick(text)}
              suggestion={text}
            >
              {Icon && <Icon size={16} style={{ color }} />}
              {text}
            </Suggestion>
          ))}
        </Suggestions>
      </div>
    </div>
      </div>
    </div>
  );
};

export { Example as AIChatSidebar };
export default Example;