"use client";

import React, { useCallback, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
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
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputActionAddAttachments,
  PromptInputActionMenu,
  PromptInputActionMenuContent,
  PromptInputActionMenuTrigger,
  PromptInputAttachment,
  PromptInputAttachments,
  PromptInputBody,
  PromptInputFooter,
  PromptInputHeader,
  type PromptInputMessage,
  PromptInputSubmit,
  PromptInputTextarea,
  PromptInputTools,
} from "@/components/ai-elements/prompt-input";
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { useToast } from "@/hooks/use-toast";
import { nanoid } from "nanoid";

interface AIChatDialogProps {
  isOpen: boolean;
  onOpenChange: (isOpen: boolean) => void;
}

type MessageType = {
  key: string;
  from: "user" | "assistant";
  versions: {
    id: string;
    content: string;
  }[];
};

const initialMessages: MessageType[] = [
  {
    key: nanoid(),
    from: "assistant",
    versions: [
      {
        id: nanoid(),
        content: "Hello! I'm your Lamassu AI assistant. How can I help you with certificates, CAs, devices, or PKI operations today?",
      },
    ],
  },
];

const suggestions = [
  "How do I create a new Certificate Authority?",
  "Explain certificate revocation",
  "What are the key management best practices?",
  "How to issue a device certificate?",
  "What is OCSP validation?",
  "Tell me about EST protocol",
];

const mockResponses = [
  "That's a great question about Lamassu! Let me help you understand this PKI concept better. The key thing to remember is that proper certificate management requires careful consideration of security policies and best practices.",
  "I'd be happy to explain this Lamassu feature in detail. From my understanding, there are several important factors to consider when managing your PKI infrastructure. Let me break it down step by step for you.",
  "This is an important topic in certificate management. The solution typically involves understanding the core PKI concepts and applying them correctly within your Lamassu deployment. Here's what I recommend...",
  "Great choice of topic! This is something that many PKI administrators encounter. The approach I'd suggest is to start with the CA hierarchy fundamentals and then build up to more complex certificate operations.",
  "That's definitely worth exploring in your Lamassu environment. From what I can see, the best way to handle this is to consider both the security implications and operational requirements.",
];

export const AIChatDialog: React.FC<AIChatDialogProps> = ({ isOpen, onOpenChange }) => {
  const { toast } = useToast();
  const [text, setText] = useState<string>("");
  const [status, setStatus] = useState<"submitted" | "streaming" | "ready" | "error">("ready");
  const [messages, setMessages] = useState<MessageType[]>(initialMessages);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const streamResponse = useCallback(
    async (messageId: string, content: string) => {
      setStatus("streaming");
      setStreamingMessageId(messageId);

      const words = content.split(" ");
      let currentContent = "";

      for (let i = 0; i < words.length; i++) {
        currentContent += (i > 0 ? " " : "") + words[i];

        setMessages((prev) =>
          prev.map((msg) => {
            if (msg.versions.some((v) => v.id === messageId)) {
              return {
                ...msg,
                versions: msg.versions.map((v) =>
                  v.id === messageId ? { ...v, content: currentContent } : v
                ),
              };
            }
            return msg;
          })
        );

        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 100 + 50)
        );
      }

      setStatus("ready");
      setStreamingMessageId(null);
    },
    []
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
        const assistantMessageId = `assistant-${Date.now()}`;
        const randomResponse =
          mockResponses[Math.floor(Math.random() * mockResponses.length)];

        const assistantMessage: MessageType = {
          key: `assistant-${Date.now()}`,
          from: "assistant",
          versions: [
            {
              id: assistantMessageId,
              content: "",
            },
          ],
        };

        setMessages((prev) => [...prev, assistantMessage]);
        streamResponse(assistantMessageId, randomResponse);
      }, 500);
    },
    [streamResponse]
  );

  const handleSubmit = (message: PromptInputMessage) => {
    const hasText = Boolean(message.text);
    const hasAttachments = Boolean(message.files?.length);

    if (!(hasText || hasAttachments)) {
      return;
    }

    setStatus("submitted");

    if (message.files?.length) {
      toast({
        title: "Files attached",
        description: `${message.files.length} file(s) attached to message`,
      });
    }

    addUserMessage(message.text || "Sent with attachments");
    setText("");
  };

  const handleSuggestionClick = (suggestion: string) => {
    setStatus("submitted");
    addUserMessage(suggestion);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[900px] h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b">
          <DialogTitle>Lamassu AI Assistant</DialogTitle>
          <DialogDescription>
            Ask questions about certificates, CAs, devices, or get help with PKI operations.
          </DialogDescription>
        </DialogHeader>

        <div className="relative flex size-full flex-col divide-y overflow-hidden">
          <Conversation>
            <ConversationContent>
              {messages.map(({ versions, ...message }) => (
                <MessageBranch defaultBranch={0} key={message.key}>
                  <MessageBranchContent>
                    {versions.map((version) => (
                      <Message
                        from={message.from}
                        key={`${message.key}-${version.id}`}
                      >
                        <MessageContent>
                          <MessageResponse>{version.content}</MessageResponse>
                        </MessageContent>
                      </Message>
                    ))}
                  </MessageBranchContent>
                  {versions.length > 1 && (
                    <MessageBranchSelector from={message.from}>
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
          <div className="grid shrink-0 gap-4 pt-4">
            <Suggestions className="px-4">
              {suggestions.map((suggestion) => (
                <Suggestion
                  key={suggestion}
                  onClick={() => handleSuggestionClick(suggestion)}
                  suggestion={suggestion}
                />
              ))}
            </Suggestions>
            <div className="w-full px-4 pb-4">
              <PromptInput globalDrop multiple onSubmit={handleSubmit}>
                <PromptInputHeader>
                  <PromptInputAttachments>
                    {(attachment) => <PromptInputAttachment data={attachment} />}
                  </PromptInputAttachments>
                </PromptInputHeader>
                <PromptInputBody>
                  <PromptInputTextarea
                    onChange={(event) => setText(event.target.value)}
                    value={text}
                  />
                </PromptInputBody>
                <PromptInputFooter>
                  <PromptInputTools>
                    <PromptInputActionMenu>
                      <PromptInputActionMenuTrigger />
                      <PromptInputActionMenuContent>
                        <PromptInputActionAddAttachments />
                      </PromptInputActionMenuContent>
                    </PromptInputActionMenu>
                  </PromptInputTools>
                  <PromptInputSubmit
                    disabled={!(text.trim() || status) || status === "streaming"}
                    status={status}
                  />
                </PromptInputFooter>
              </PromptInput>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
