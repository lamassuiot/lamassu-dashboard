import { describe, expect, it, vi } from 'vitest';
import { runBackgroundEnrollment } from './est-background';

describe('background enrollment', () => {
  it('returns the certificate and key and sends the enrollment script through stdin', async () => {
    const certificate = '-----BEGIN CERTIFICATE-----\ncertificate\n-----END CERTIFICATE-----\n';
    const privateKey = '-----BEGIN PRIVATE KEY-----\nprivate\n-----END PRIVATE KEY-----\n';
    const run = vi.fn().mockResolvedValue({ exitCode: 0, stderr: '', stdout: `unrelated output\nsubject=example\nserial=AB\n__EST_CERT__${btoa(certificate)}\n__EST_KEY__${btoa(privateKey)}\n__EST_END__\n` });
    const script = 'echo bootstrap-secret';
    await expect(runBackgroundEnrollment(run, script, [], 'device.crt', 'device.key', vi.fn())).resolves.toEqual({
      certificate, privateKey, inspection: 'subject=example\nserial=AB',
    });
    expect(run.mock.calls[0][1]).toEqual(['-s', '--', 'device.crt', 'device.key']);
    expect(run.mock.calls[0][2]).toContain(script);
    expect(run.mock.calls[0][2]).toContain('cmp -s cert.pub key.pub');
    expect(run.mock.calls[0][2]).toContain('rm -rf "$workdir"');
  });

  it('reports failures without treating partial output as an enrollment', async () => {
    const run = vi.fn().mockResolvedValue({ exitCode: 1, stdout: '', stderr: '__EST_STEP__0\n\nEST request failed' });
    await expect(runBackgroundEnrollment(run, '', [], 'device.crt', 'device.key', vi.fn())).rejects.toThrow(/^EST request failed$/);
    run.mockResolvedValue({ exitCode: 0, stdout: 'partial result', stderr: '' });
    await expect(runBackgroundEnrollment(run, '', [], 'device.crt', 'device.key', vi.fn())).rejects.toThrow('did not return a certificate and private key');
  });
});
