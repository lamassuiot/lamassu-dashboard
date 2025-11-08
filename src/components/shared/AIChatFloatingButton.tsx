
'use client';

import React from 'react';
import { Button } from "@/components/ui/button";

interface AIChatFloatingButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const AIChatFloatingButton: React.FC<AIChatFloatingButtonProps> = ({ isOpen, onClick }) => {
    return (
        <>
            {/* Floating Button - only show when sidebar is closed */}
            {!isOpen && (
                <Button
                    onClick={onClick}
                    className="fixed bottom-6 right-6 h-14 w-14 rounded-full bg-primary hover:bg-primary/90 shadow-2xl hover:shadow-3xl transition-shadow z-40"
                    size="icon"
                >
                    <img height="32" src="https://unpkg.com/@lobehub/icons-static-svg@latest/icons/githubCopilot.svg" style={{ filter: "invert(1)", height: "30px" }} />
                    <span className="sr-only">Open AI Assistant</span>
                </Button>
            )}
        </>
    );
};
