import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Sheet, SheetDescription, SheetTitle } from '@/components/ui/sheet';
import { ResizableSheetContent } from './ResizableSheetContent';

function renderSheet(props: Partial<React.ComponentProps<typeof ResizableSheetContent>> = {}) {
  return render(
    <Sheet open>
      <ResizableSheetContent storageKey="test-sheet" {...props}>
        <SheetTitle>Panel</SheetTitle>
        <SheetDescription>Body</SheetDescription>
      </ResizableSheetContent>
    </Sheet>
  );
}

describe('ResizableSheetContent', () => {
  afterEach(() => {
    window.localStorage.clear();
  });

  it("keeps the caller's width and max-width until the panel is resized", () => {
    renderSheet({ style: { width: '50vw', maxWidth: '50vw' } });

    const dialog = screen.getByRole('dialog');
    expect(dialog.style.width).toBe('50vw');
    expect(dialog.style.maxWidth).toBe('50vw');
  });

  it('resizes from the keyboard, clamps to the bounds and persists the width', () => {
    renderSheet({ minWidth: 400 });

    const handle = screen.getByRole('separator', { name: 'Resize panel' });
    expect(handle).toHaveAttribute('tabindex', '0');

    fireEvent.keyDown(handle, { key: 'Home' });
    expect(screen.getByRole('dialog').style.width).toBe('400px');
    expect(handle).toHaveAttribute('aria-valuenow', '400');

    // A right-hand sheet grows when its left edge moves left.
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(screen.getByRole('dialog').style.width).toBe('416px');
    expect(window.localStorage.getItem('resizable-sheet:test-sheet')).toBe('416');

    fireEvent.keyDown(handle, { key: 'ArrowRight', shiftKey: true });
    expect(screen.getByRole('dialog').style.width).toBe('400px');
  });

  it('shrinks a stored width when the window becomes narrower', () => {
    window.localStorage.setItem('resizable-sheet:test-sheet', '900');
    renderSheet();
    expect(screen.getByRole('dialog').style.width).toBe('900px');

    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 700 });
      fireEvent(window, new Event('resize'));
      // 700px viewport minus the 80px gutter.
      expect(screen.getByRole('dialog').style.width).toBe('620px');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it("keeps the caller's mobile width below the sm breakpoint and restores the stored width above it", () => {
    window.localStorage.setItem('resizable-sheet:test-sheet', '900');
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
      renderSheet({ style: { width: '100%' } });
      expect(screen.getByRole('dialog').style.width).toBe('100%');
      expect(screen.queryByRole('separator', { name: 'Resize panel' })).not.toBeInTheDocument();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      fireEvent(window, new Event('resize'));
      expect(screen.getByRole('dialog').style.width).toBe('900px');
      expect(screen.getByRole('separator', { name: 'Resize panel' })).toBeInTheDocument();
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
  });

  it('drops an active drag when the handle disappears, so a later hover does not resize', () => {
    // jsdom does not implement pointer capture.
    const capture = vi.spyOn(HTMLElement.prototype, 'setPointerCapture').mockImplementation(() => {});
    const hasCapture = vi.spyOn(HTMLElement.prototype, 'hasPointerCapture').mockReturnValue(false);
    const originalWidth = window.innerWidth;
    try {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      renderSheet();
      fireEvent.pointerDown(screen.getByRole('separator', { name: 'Resize panel' }), { clientX: 1000, pointerId: 1 });

      // The viewport drops below sm mid-drag: the handle unmounts before any pointerup.
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 });
      fireEvent(window, new Event('resize'));
      expect(screen.queryByRole('separator', { name: 'Resize panel' })).not.toBeInTheDocument();

      Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
      fireEvent(window, new Event('resize'));
      fireEvent.pointerMove(screen.getByRole('separator', { name: 'Resize panel' }), { clientX: 500, pointerId: 1 });

      expect(screen.getByRole('dialog').style.width).toBe('');
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
      capture.mockRestore();
      hasCapture.mockRestore();
    }
  });
});
