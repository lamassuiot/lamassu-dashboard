// Builders for the shell snippets shown in the EST enroll / re-enroll / cacerts panels.
// Every multi-flag command is split one option per line with `\` continuations so it
// reads like documentation and still pastes cleanly into a POSIX shell.

export interface KeyParams {
  /** 'RSA' or 'ECDSA' (see KEY_TYPE_OPTIONS). */
  type: string;
  /** RSA key size in bits, or an OpenSSL curve name such as `P-256`. */
  spec: string;
}

const INDENT = '  ';

function shellArgument(value: string): string {
  return /^[a-zA-Z0-9_./:@%+,-]+$/.test(value) ? value : "'" + value.replaceAll("'", "'\\''") + "'";
}

function fileArgument(path: string): string {
  return shellArgument(path.startsWith('-') ? './' + path : path);
}

function commonNameArgument(commonName: string): string {
  const subject = '/CN=' + commonName.replace(/[\\/+=]/g, '\\$&');
  return /^[a-zA-Z0-9_.:@ -]+$/.test(commonName) ? '"' + subject + '"' : shellArgument(subject);
}

/** Joins command parts as `head \` + indented continuation lines. */
export function continued(head: string, ...args: string[]): string {
  return [head, ...args.map((a) => `${INDENT}${a}`)].join(' \\\n');
}

/** Joins snippet sections with a blank line between them. */
export function sections(...parts: string[]): string {
  return parts.filter(Boolean).join('\n\n');
}

export function newKeyArgs({ type, spec }: KeyParams): string {
  return type === 'RSA' ? `-newkey rsa:${spec}` : `-newkey ec -pkeyopt ec_paramgen_curve:${spec}`;
}

/** EST transports PKCS#10 bodies as bare base64, so drop the PEM armor lines. */
export function stripPemCommand(pemFile: string, outFile: string): string {
  return `# EST expects the base64 body without the PEM header/footer\nsed '/-----/d' ${fileArgument(pemFile)} > ${fileArgument(outFile)}`;
}

type CsrKey =
  | { generate: KeyParams; keyOut: string }
  | { existing: string };

export interface CsrCommandOptions {
  commonName: string;
  key: CsrKey;
  csrFile: string;
  strippedFile: string;
}

export function csrCommands({ commonName, key, csrFile, strippedFile }: CsrCommandOptions): string {
  const keyArgs = 'existing' in key
    ? [`-key ${fileArgument(key.existing)}`]
    : [newKeyArgs(key.generate), `-nodes -keyout ${fileArgument(key.keyOut)}`];

  return sections(
    continued('openssl req -new', ...keyArgs, `-subj ${commonNameArgument(commonName)}`, `-out ${fileArgument(csrFile)}`),
    stripPemCommand(csrFile, strippedFile),
  );
}

/**
 * Server-side key generation still needs a CSR to carry the subject; its private key is
 * discarded straight to /dev/null.
 */
export function placeholderCsrCommands(commonName: string, csrFile: string, strippedFile: string): string {
  return sections(
    continued(
      'openssl req -new',
      '-newkey rsa:2048 -nodes -keyout /dev/null',
      `-subj ${commonNameArgument(commonName)}`,
      `-out ${fileArgument(csrFile)}`,
    ),
    stripPemCommand(csrFile, strippedFile),
  );
}

/** Resolves host and port of the EST endpoint; relative URLs are resolved against `origin`. */
export function resolveEndpoint(estBaseUrl: string, origin?: string): { host: string; port: string } {
  try {
    const url = new URL(estBaseUrl, origin);
    const port = url.port || (url.protocol === 'http:' ? '80' : '443');
    return { host: url.hostname, port };
  } catch {
    return { host: 'lamassu.example.com', port: '443' };
  }
}

export function serverChainCommand(estBaseUrl: string, outFile: string, origin?: string): string {
  const { host, port } = resolveEndpoint(estBaseUrl, origin);
  return `# Save the certificate chain presented by the EST server\n${continued(
    'openssl s_client -showcerts',
    `-connect ${shellArgument(host + ':' + port)}`,
    `-servername ${shellArgument(host)}`,
    '</dev/null 2>/dev/null',
    `| sed -n '/-BEGIN CERTIFICATE-/,/-END CERTIFICATE-/p' > ${fileArgument(outFile)}`,
  )}`;
}

export interface EstRequestOptions {
  url: string;
  cert: string;
  key: string;
  /** CA bundle used to verify the server; when omitted TLS verification is disabled. */
  caFile?: string;
  body: string;
  output: string;
}

export function estRequestCommand({ url, cert, key, caFile, body, output }: EstRequestOptions): string {
  return continued(
    'curl --fail --silent --show-error',
    `--cert ${fileArgument(cert)}`,
    `--key ${fileArgument(key)}`,
    caFile ? `--cacert ${fileArgument(caFile)}` : '--insecure',
    '--globoff',
    '--header "Content-Type: application/pkcs10"',
    `--data-binary ${shellArgument("@" + body)}`,
    `--output ${fileArgument(output)}`,
    `"${url.replace(/["\\$\x60]/g, '\\$&')}"`,
  );
}

export function decodeCertificateCommands(p7File: string, certFile: string): string {
  return sections(
    `# Convert the PKCS#7 response into a PEM certificate\n${continued(
      `openssl base64 -d -in ${fileArgument(p7File)}`,
      `| openssl pkcs7 -inform DER -print_certs -out ${fileArgument(certFile)}`,
    )}`,
    inspectCertificateCommand(certFile),
  );
}

export function inspectCertificateCommand(certFile: string): string {
  return `# Inspect the issued certificate\nopenssl x509 -in ${fileArgument(certFile)} -noout -subject -issuer -serial -dates`;
}

const MULTIPART_BOUNDARY = '--estServerLamassuBoundary';

const extractPart = (contentType: string, multipartFile: string, outFile: string) =>
  `awk '/Content-Type: ${contentType.replace('/', '\\/')}/{f=1; next} /${MULTIPART_BOUNDARY}/{f=0} f' < ${fileArgument(multipartFile)} > ${fileArgument(outFile)}`;

export function serverKeygenParseCommands(multipartFile: string, keyOut: string, certOut: string): string {
  const keyB64 = `${keyOut}.b64`;
  const certB64 = `${certOut}.p7`;
  return sections(
    `# Split the multipart response into its key and certificate parts\n${extractPart('application/pkcs8', multipartFile, keyB64)}\n${extractPart('application/pkcs7-mime', multipartFile, certB64)}`,
    `# Decode the PKCS#8 private key\n${continued(
      `openssl base64 -d -in ${fileArgument(keyB64)}`,
      `| openssl pkey -inform DER -out ${fileArgument(keyOut)}`,
    )}`,
    decodeCertificateCommands(certB64, certOut),
  );
}

/** One-liners that recreate PEM files from their base64 body. */
export function writePemFilesCommand(files: { filename: string; base64: string }[]): string {
  return files.map(({ filename, base64 }) => `echo '${base64}' | base64 -d > ${filename}`).join('\n');
}

export function cacertsCommand(estBaseUrl: string, raId: string, accept: 'application/x-pem-file' | 'application/pkcs7-mime'): string {
  return continued(
    'curl --fail --silent --show-error',
    `--header "Accept: ${accept}"`,
    `"${estBaseUrl}/${raId}/cacerts"`,
  );
}
