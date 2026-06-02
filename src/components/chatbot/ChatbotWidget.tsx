'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { MessageSquare, X, Send, Loader2, Bot, User, AlertCircle, Trash2, Maximize2, Minimize2, Copy, Check } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { sendChatMessage, type ChatMessage } from '@/lib/mattin-api';
import { sileo } from '@/lib/toast';

const WELCOME_MESSAGE: ChatMessage = {
  role: 'assistant',
  content: 'Hello! I\'m the Lamassu AI assistant. I can help you manage certificates, devices, keys, and more. What would you like to do?',
};

const SUGGESTED_PROMPTS = [
  'List all CAs',
  'Show my devices',
  'List available crypto engines',
  'Show recent alerts',
];

export function ChatbotWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME_MESSAGE]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [copiedMessageIndex, setCopiedMessageIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimeoutRef = useRef<number | null>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
      inputRef.current?.focus();
    }
  }, [isOpen, messages, scrollToBottom]);

  const sendMessage = useCallback(async (rawMessage: string) => {
    const trimmed = rawMessage.trim();
    if (!trimmed || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: trimmed };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setError(null);
    setIsLoading(true);

    try {
      const result = await sendChatMessage(trimmed, conversationId);
      setConversationId(result.conversation_id);
      setMessages(prev => [...prev, { role: 'assistant', content: result.response }]);
    } catch (err: any) {
      setError(err.message ?? 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, [conversationId, isLoading]);

  const handleSend = () => {
    void sendMessage(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleClear = () => {
    setMessages([WELCOME_MESSAGE]);
    setConversationId(undefined);
    setError(null);
    setInput('');
    setCopiedMessageIndex(null);
  };

  const toggleMaximize = () => setIsMaximized(prev => !prev);

  const handlePromptClick = (prompt: string) => {
    void sendMessage(prompt);
  };

  return (
    <>
      {/* Panel */}
      <div
        className={cn(
          'fixed z-40 flex flex-col bg-background border border-border shadow-2xl',
          'transition-all duration-300 ease-in-out',
          isMaximized
            ? 'inset-4 rounded-xl'
            : [
                'top-0 right-0 w-80 md:w-96 rounded-none border-l',
                isOpen ? 'translate-x-0' : 'translate-x-full',
              ],
        )}
        style={
          isMaximized
            ? undefined
            : { marginTop: 'var(--header-height, 3rem)', height: 'calc(100% - var(--header-height, 3rem))' }
        }
        aria-hidden={!isOpen}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-primary text-primary-foreground flex-shrink-0 rounded-t-[inherit]">
          <div className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            <span className="font-semibold text-sm">Lamassu AI Assistant</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              onClick={handleClear} title="Clear conversation"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              onClick={toggleMaximize} title={isMaximized ? 'Restore' : 'Maximize'}
            >
              {isMaximized ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost" size="icon"
              className="h-7 w-7 text-primary-foreground hover:bg-primary-foreground/20 hover:text-primary-foreground"
              onClick={() => { setIsOpen(false); setIsMaximized(false); }} title="Close"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 min-h-0">
          {messages.length === 1 && messages[0]?.role === 'assistant' && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {SUGGESTED_PROMPTS.map(prompt => (
                  <Button
                    key={prompt}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => handlePromptClick(prompt)}
                    disabled={isLoading}
                    className="h-8 rounded-md border-border bg-background text-xs font-normal text-foreground hover:bg-accent hover:text-accent-foreground"
                  >
                    {prompt}
                  </Button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, idx) => (
            <MessageBubble
              key={idx}
              message={msg}
              isMaximized={isMaximized}
              messageIndex={idx}
              copiedMessageIndex={copiedMessageIndex}
              onCopyMessage={async (content, messageIndex) => {
                try {
                  await navigator.clipboard.writeText(content);
                  setCopiedMessageIndex(messageIndex);
                  sileo.success({ title: 'Copied to clipboard' });

                  if (copyTimeoutRef.current !== null) {
                    window.clearTimeout(copyTimeoutRef.current);
                  }

                  copyTimeoutRef.current = window.setTimeout(() => {
                    setCopiedMessageIndex(current => (current === messageIndex ? null : current));
                  }, 2000);
                } catch {
                  sileo.error({ title: 'Copy failed', description: 'Could not copy the assistant response.' });
                }
              }}
            />
          ))}

          {isLoading && (
            <div className="flex items-start gap-2">
              <div className="flex-shrink-0 h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center">
                <Bot className="h-4 w-4 text-primary" />
              </div>
              <div className="bg-muted rounded-2xl rounded-tl-sm px-3 py-2">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 text-destructive">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <p className="text-xs">{error}</p>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="flex-shrink-0 border-t border-border px-4 py-3 bg-background rounded-b-[inherit]">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask me anything about Lamassu..."
              disabled={isLoading}
              rows={1}
              className={cn(
                'flex-1 resize-none rounded-lg border border-input bg-background px-3 py-2',
                'text-sm placeholder:text-muted-foreground',
                'focus:outline-none focus:ring-2 focus:ring-ring focus:border-transparent',
                'disabled:opacity-50 disabled:cursor-not-allowed max-h-32 overflow-y-auto',
              )}
              style={{ fieldSizing: 'content' } as React.CSSProperties}
            />
            <Button
              size="icon" onClick={handleSend}
              disabled={isLoading || !input.trim()}
              className="flex-shrink-0 h-9 w-9" title="Send"
            >
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5 text-center">
            Enter to send · Shift+Enter for new line
          </p>
        </div>
      </div>

      {/* Backdrop */}
      {isOpen && (
        <div
          className={cn(
            'fixed inset-0 z-30 bg-black/30',
            isMaximized ? 'block' : 'block md:hidden',
          )}
          onClick={() => { setIsOpen(false); setIsMaximized(false); }}
          aria-hidden
        />
      )}

      {/* FAB */}
      <Button
        size="icon"
        onClick={() => setIsOpen(prev => !prev)}
        className={cn(
          'fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full shadow-lg',
          'ring-2 ring-white ring-offset-1 ring-offset-primary',
          'transition-transform duration-200',
          isOpen ? 'scale-90' : 'scale-100 hover:scale-105',
        )}
        title={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
        aria-label={isOpen ? 'Close AI assistant' : 'Open AI assistant'}
      >
        {isOpen ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </Button>
    </>
  );
}

function MessageBubble({
  message,
  isMaximized,
  messageIndex,
  copiedMessageIndex,
  onCopyMessage,
}: {
  message: ChatMessage;
  isMaximized: boolean;
  messageIndex: number;
  copiedMessageIndex: number | null;
  onCopyMessage: (content: string, messageIndex: number) => Promise<void>;
}) {
  const isUser = message.role === 'user';
  const isCopied = copiedMessageIndex === messageIndex;

  return (
    <div className={cn('group flex items-start gap-2', isUser && 'flex-row-reverse')}>
      <div className={cn(
        'flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center',
        isUser ? 'bg-primary text-primary-foreground' : 'bg-primary/10',
      )}>
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4 text-primary" />}
      </div>

      <div className={cn(
        'relative rounded-2xl px-3 py-2 text-sm leading-relaxed',
        isUser
          ? 'bg-primary text-primary-foreground rounded-tr-sm max-w-[80%]'
          : 'bg-muted text-foreground rounded-tl-sm pr-10',
        !isUser && (isMaximized ? 'max-w-[85%]' : 'max-w-[85%]'),
      )}>
        {!isUser && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => { void onCopyMessage(message.content, messageIndex); }}
            className={cn(
              'absolute right-2 top-2 h-7 w-7 text-muted-foreground transition-opacity duration-150',
              'opacity-0 group-hover:opacity-100 focus-visible:opacity-100',
            )}
            title={isCopied ? 'Copied' : 'Copy response'}
            aria-label={isCopied ? 'Copied response' : 'Copy response'}
          >
            {isCopied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
          </Button>
        )}

        {isUser ? (
          <p className="whitespace-pre-wrap break-words">{message.content}</p>
        ) : (
          <div className="prose prose-sm dark:prose-invert max-w-none prose-table:text-xs">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                table: ({ children }) => (
                  <div className="overflow-x-auto my-2">
                    <table className="border-collapse border border-border text-xs w-full">{children}</table>
                  </div>
                ),
                th: ({ children }) => (
                  <th className="border border-border bg-muted px-2 py-1 text-left font-semibold whitespace-nowrap">{children}</th>
                ),
                td: ({ children }) => (
                  <td className="border border-border px-2 py-1 whitespace-nowrap">{children}</td>
                ),
                code: ({ children, className }) => {
                  const isBlock = className?.includes('language-');
                  return isBlock
                    ? <code className="block bg-background border border-border rounded p-2 text-xs overflow-x-auto">{children}</code>
                    : <code className="bg-background border border-border rounded px-1 text-xs">{children}</code>;
                },
                p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
                ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
              }}
            >
              {message.content}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
