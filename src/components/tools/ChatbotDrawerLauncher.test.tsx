import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ChatbotDrawerLauncher } from './ChatbotDrawerLauncher';

vi.mock('./WebLlmChatbot', () => ({
  WebLlmChatbot: () => <div>Chat content</div>,
}));

const mockViewport = (isMobile: boolean) => {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: vi.fn().mockReturnValue({ matches: isMobile }),
    writable: true,
  });
};

describe('ChatbotDrawerLauncher', () => {
  beforeEach(() => {
    mockViewport(false);
  });

  it('opens as a side panel and can switch to fullscreen without remounting the chat', () => {
    render(<ChatbotDrawerLauncher />);

    const launcher = screen.getByRole('button', { name: 'AI Chat' });
    expect(launcher).toHaveClass('h-9');

    fireEvent.click(launcher);
    const chat = screen.getByRole('complementary', { name: 'AI Chatbot' });
    expect(chat).not.toHaveClass('fixed');

    fireEvent.click(screen.getByRole('button', { name: 'Open fullscreen' }));
    expect(chat).toHaveClass('fixed', 'inset-0', 'h-dvh', 'w-full');
    expect(screen.getByText('Chat content')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Exit fullscreen' }));
    expect(chat).not.toHaveClass('fixed');
  });

  it('opens directly in fullscreen on a small viewport', () => {
    mockViewport(true);
    render(<ChatbotDrawerLauncher />);

    fireEvent.click(screen.getByRole('button', { name: 'AI Chat' }));

    expect(screen.getByRole('complementary', { name: 'AI Chatbot' }))
      .toHaveClass('fixed', 'inset-0', 'h-dvh', 'w-full');
  });
});
