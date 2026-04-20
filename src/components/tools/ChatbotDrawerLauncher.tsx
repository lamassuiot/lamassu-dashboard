'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';

import { WebLlmChatbot } from '@/components/tools/WebLlmChatbot';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function ChatbotDrawerLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        className="fixed bottom-6 right-6 z-40 shadow-sm"
        onClick={() => setOpen(true)}
        size="sm"
      >
        <Bot className="mr-2 h-4 w-4" />
        <span className="hidden sm:inline">AI Chat</span>
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex h-full w-full flex-col overflow-hidden p-0 sm:max-w-xl lg:max-w-2xl">
          <SheetHeader className="border-b px-4 py-3 pr-12">
            <SheetTitle>AI Chatbot</SheetTitle>
            <SheetDescription>
              Local WebLLM chat running in the browser with WebGPU acceleration.
            </SheetDescription>
          </SheetHeader>
          <div className="flex min-h-0 flex-1 flex-col p-4 md:p-6">
            <WebLlmChatbot variant="panel" />
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
