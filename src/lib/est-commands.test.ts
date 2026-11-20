import { describe, it, expect } from 'vitest';
import {
  cacertsCommand,
  continued,
  csrCommands,
  decodeCertificateCommands,
  estRequestCommand,
  newKeyArgs,
  resolveEndpoint,
  serverChainCommand,
  serverKeygenParseCommands,
} from './est-commands';

describe('est-commands', () => {
  it('splits commands one argument per line with continuations', () => {
    expect(continued('curl', '--a', '--b')).toBe('curl \\\n  --a \\\n  --b');
  });

  it('builds key arguments for RSA and EC keys', () => {
    expect(newKeyArgs({ type: 'RSA', spec: '3072' })).toBe('-newkey rsa:3072');
    expect(newKeyArgs({ type: 'ECDSA', spec: 'P-256' })).toBe('-newkey ec -pkeyopt ec_paramgen_curve:P-256');
  });

  it('generates a CSR with a new key and strips the PEM armor', () => {
    const cmd = csrCommands({
      commonName: 'dev-1',
      key: { generate: { type: 'RSA', spec: '2048' }, keyOut: 'dev-1.key' },
      csrFile: 'dev-1.csr',
      strippedFile: 'dev-1.stripped.csr',
    });
    expect(cmd).toBe(
      [
        'openssl req -new \\',
        '  -newkey rsa:2048 \\',
        '  -nodes -keyout dev-1.key \\',
        '  -subj "/CN=dev-1" \\',
        '  -out dev-1.csr',
        '',
        '# EST expects the base64 body without the PEM header/footer',
        "sed '/-----/d' dev-1.csr > dev-1.stripped.csr",
      ].join('\n'),
    );
  });

  it('reuses an existing key when requested', () => {
    const cmd = csrCommands({
      commonName: 'dev-1',
      key: { existing: 'dev-1.existing.key' },
      csrFile: 'dev-1.new.csr',
      strippedFile: 'dev-1.new.stripped.csr',
    });
    expect(cmd).toContain('  -key dev-1.existing.key \\');
    expect(cmd).not.toContain('-newkey');
  });

  it('quotes enrollment data that contains shell or OpenSSL subject delimiters', () => {
    const cmd = csrCommands({
      commonName: 'device/$(printf example)',
      key: { existing: 'device key.pem' },
      csrFile: 'device;name.csr',
      strippedFile: '-device.csr',
    });
    expect(cmd).toContain("-key 'device key.pem'");
    expect(cmd).toContain("-subj '/CN=device\\/$(printf example)'");
    expect(cmd).toContain("-out 'device;name.csr'");
    expect(cmd).toContain("sed '/-----/d' 'device;name.csr' > ./-device.csr");
  });

  it('derives the TLS host and port from the EST URL', () => {
    expect(resolveEndpoint('https://pki.example.com/api/dmsmanager/.well-known/est')).toEqual({ host: 'pki.example.com', port: '443' });
    expect(resolveEndpoint('http://10.0.0.5:8080/est')).toEqual({ host: '10.0.0.5', port: '8080' });
    expect(resolveEndpoint('/api/est', 'https://ui.example.com')).toEqual({ host: 'ui.example.com', port: '443' });
    expect(serverChainCommand('https://pki.example.com/est', 'root-ca.pem')).toContain('-connect pki.example.com:443');
  });

  it('verifies TLS with a CA file or explicitly disables verification', () => {
    const base = { url: 'https://h/est/ra/simpleenroll', cert: 'b.crt', key: 'b.key', body: 'x.csr', output: 'x.p7' };
    const verified = estRequestCommand({ ...base, caFile: 'root-ca.pem' });
    expect(verified.split('\n')[0]).toBe('curl --fail --silent --show-error \\');
    expect(verified).toContain('--cacert root-ca.pem');
    expect(verified.endsWith('"https://h/est/ra/simpleenroll"')).toBe(true);
    expect(estRequestCommand(base)).toContain('--insecure');
  });

  it('decodes PKCS#7 responses and parses server keygen multipart bodies', () => {
    expect(decodeCertificateCommands('x.p7', 'x.crt')).toContain('| openssl pkcs7 -inform DER -print_certs -out x.crt');
    const parse = serverKeygenParseCommands('x.multipart', 'x.key', 'x.crt');
    expect(parse).toContain("awk '/Content-Type: application\\/pkcs8/{f=1; next} /--estServerLamassuBoundary/{f=0} f' < x.multipart > x.key.b64");
    expect(parse).toContain('| openssl pkey -inform DER -out x.key');
  });

  it('builds cacerts requests', () => {
    expect(cacertsCommand('https://h/est', 'ra-1', 'application/x-pem-file')).toBe(
      'curl --fail --silent --show-error \\\n  --header "Accept: application/x-pem-file" \\\n  "https://h/est/ra-1/cacerts"',
    );
  });
});
