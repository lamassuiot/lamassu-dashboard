import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalContext } from '@/components/terminal/TerminalContext';
import { EstEnrollModal } from './EstEnrollModal';

vi.mock('@/lib/ca-data', () => ({ fetchAndProcessCAs: vi.fn(async () => []), findCaById: vi.fn(), signCertificate: vi.fn() }));
vi.mock('@/lib/kms-data', () => ({ fetchCryptoEngines: vi.fn(async () => []) }));
vi.mock('@/hooks/use-mobile', () => ({ useIsMobile: () => false }));

const ra = { id: 'ra-1', name: 'RA', settings: { enrollment_settings: { enrollment_ca: 'ca' } } };

describe('EST enrollment terminal action', () => {
  it('prepares a complete device enrollment script without running it', async () => {
    const send = vi.fn();
    render(<TerminalContext.Provider value={send}><EstEnrollModal isOpen onOpenChange={vi.fn()} ra={ra} initialDeviceId="sensor-1" presentation="inline" /></TerminalContext.Provider>);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Next' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip & Use Existing' }));
    fireEvent.click(screen.getByRole('button', { name: 'Send to terminal' }));
    expect(send).toHaveBeenCalledOnce();
    const script = send.mock.calls[0]![0] as string;
    expect(script).toContain('set -e');
    expect(script).toContain('openssl req -new');
    expect(script).toContain('/ra-1/simpleenroll');
    expect(script).toContain('openssl pkcs7');
    expect(script).not.toContain('base64 -d > bootstrap.key');
  });
});
