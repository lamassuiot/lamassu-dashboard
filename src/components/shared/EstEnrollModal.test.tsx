import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TerminalContext } from '@/components/terminal/TerminalContext';
import { BackgroundCommandContext, type BackgroundCommand } from '@/components/terminal/background';
import { fetchAndProcessCAs, findCaById, signCertificate } from '@/lib/ca-data';
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

  it('keeps the command workflow separate when existing bootstrap credentials are used', async () => {
    const run = vi.fn();
    render(<BackgroundCommandContext.Provider value={run}><EstEnrollModal isOpen onOpenChange={vi.fn()} ra={ra} initialDeviceId="sensor-1" presentation="inline" /></BackgroundCommandContext.Provider>);
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Skip & Use Existing' }));
    expect(screen.queryByRole('button', { name: 'Enroll in background' })).not.toBeInTheDocument();
    expect(run).not.toHaveBeenCalled();
  });

  it.each([
    { method: 'device', exitCode: 0 },
    { method: 'server', exitCode: 0 },
    { method: 'device', exitCode: 60 },
  ])('reports $method enrollment in the console (exit $exitCode)', async ({ method, exitCode }) => {
    const ca = { id: 'bootstrap-ca', name: 'Bootstrap CA', expires: '2049-01-01T00:00:00Z', status: 'active' };
    vi.mocked(fetchAndProcessCAs).mockResolvedValueOnce([ca] as never);
    vi.mocked(findCaById).mockReturnValue(ca as never);
    vi.mocked(signCertificate).mockResolvedValue({ certificate: btoa('bootstrap certificate') } as never);
    const certificate = '-----BEGIN CERTIFICATE-----\ntest\n-----END CERTIFICATE-----';
    const key = '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----';
    let complete!: (result: Awaited<ReturnType<BackgroundCommand>>) => void;
    let stderr!: (chunk: string) => void;
    const pendingEnrollment = new Promise<Awaited<ReturnType<BackgroundCommand>>>(resolve => { complete = resolve; });
    const run = vi.fn<BackgroundCommand>((_file, _args, _input, onStderr) => {
      stderr = onStderr!;
      return pendingEnrollment;
    });
    const configuredRa = { ...ra, settings: { enrollment_settings: { ...ra.settings.enrollment_settings, est_rfc7030_settings: { client_certificate_settings: { validation_cas: ['bootstrap-ca'] } } }, server_keygen_settings: { enabled: true } } };
    render(<BackgroundCommandContext.Provider value={run}><EstEnrollModal isOpen onOpenChange={vi.fn()} ra={configuredRa} initialDeviceId="sensor-1" presentation="inline" /></BackgroundCommandContext.Provider>);
    await waitFor(() => expect(fetchAndProcessCAs).toHaveBeenCalled());
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
    fireEvent.click(screen.getByText('Enroll in background'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    if (method === 'server') fireEvent.click(screen.getByText('Generate key on server'));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(screen.queryByRole('button', { name: 'Skip & Use Existing' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Issue Bootstrap Cert' }));
    await screen.findByRole('button', { name: 'Enroll in background' });
    expect(screen.queryByRole('button', { name: 'Send to terminal' })).not.toBeInTheDocument();
    const details = screen.getByRole('button', { name: 'Terminal output Ready' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Enroll in background' }));
    expect(screen.getByRole('progressbar', { name: 'Enrolling device' })).toBeInTheDocument();
    if (exitCode !== 0) {
      const error = "curl: (60) SSL: no alternative certificate subject name matches target hostname 'lab.lamassu.io'";
      const trace = `__EST_STEP__0\n__EST_STEP__1\n__EST_STEP__2\n..+...++++++\n__EST_STEP__3\n${error}\nMore details here: https://curl.se/docs/sslcerts.html\n`;
      act(() => { stderr(trace); });
      await act(async () => { complete({ exitCode, stdout: '', stderr: trace }); });

      expect(details).toHaveAttribute('aria-expanded', 'true');
      const log = within(screen.getByRole('log', { name: 'Enrollment activity' }));
      expect(log.getByText('Request the certificate')).toBeInTheDocument();
      const consoleError = log.getByText(/curl: \(60\) SSL:/);
      expect(consoleError).toHaveTextContent(error);
      expect(consoleError).not.toHaveTextContent('++++++');
      expect(screen.getByRole('alert')).toHaveTextContent(error);
      expect(screen.getByRole('button', { name: 'Enroll in background' })).toBeEnabled();
      return;
    }
    fireEvent.click(details);
    const log = within(screen.getByRole('log', { name: 'Enrollment activity' }));
    expect(log.queryByText(/curl --fail/)).not.toBeInTheDocument();
    act(() => { stderr('__EST_STEP__0\n__EST_STEP__1\n__EST_ST'); });
    act(() => { stderr('EP__2\n'); });
    expect(log.getByText('Prepare bootstrap credentials')).toBeInTheDocument();
    expect(log.queryByText(/curl --fail/)).not.toBeInTheDocument();
    act(() => { stderr('__EST_STEP__3\n'); });
    expect(log.getByText(method === 'device' ? 'Request the certificate' : 'Request the key and certificate')).toBeInTheDocument();
    expect(log.getByText(/curl --fail/)).toBeInTheDocument();
    expect(log.queryByText(/base64 -d > bootstrap.key/)).not.toBeInTheDocument();
    expect(screen.queryByText('Device private key')).not.toBeInTheDocument();
    await act(async () => {
      complete({ exitCode: 0, stderr: '', stdout: `subject=CN=sensor-1\n__EST_CERT__${btoa(certificate)}\n__EST_KEY__${btoa(key)}\n__EST_END__\n` });
    });
    expect(log.getByText('subject=CN=sensor-1')).toBeInTheDocument();
    expect(log.queryByText(/__EST_KEY__|BEGIN PRIVATE KEY/)).not.toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('Device certificate')).toBeInTheDocument();
    expect(screen.getByText('Device private key')).toBeInTheDocument();
    expect(run).toHaveBeenCalledWith('/bin/sh', expect.any(Array), expect.stringContaining(method === 'device' ? '/ra-1/simpleenroll' : '/ra-1/serverkeygen'), expect.any(Function));
  });
});
