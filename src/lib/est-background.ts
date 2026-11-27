import type { BackgroundCommand } from '@/components/terminal/background';

export interface EnrollmentArtifacts {
  certificate: string;
  privateKey: string;
  inspection: string;
}

export interface EnrollmentCommand {
  label: string;
  command: string;
}

export interface EnrollmentActivity {
  label: string;
  command?: string;
}

/** Run in an isolated directory and separate the PEM files from the public certificate summary. */
export async function runBackgroundEnrollment(
  run: BackgroundCommand,
  bootstrap: string,
  commands: readonly EnrollmentCommand[],
  certificateFile: string,
  keyFile: string,
  onActivity: (activity: EnrollmentActivity) => void,
): Promise<EnrollmentArtifacts> {
  const steps = [
    { label: 'Prepare the guest workspace', script: `umask 077
workdir=$(mktemp -d /tmp/est-background.XXXXXX)
trap 'rm -rf "$workdir"' EXIT
cd "$workdir"` },
    { label: 'Prepare bootstrap credentials', script: bootstrap },
    ...commands.map(({ label, command }) => ({ label, script: command, command })),
    { label: 'Verify that the certificate and key match', script: `openssl x509 -in "./$1" -noout
openssl pkey -in "./$2" -noout
openssl x509 -in "./$1" -pubkey -noout > cert.pub
openssl pkey -in "./$2" -pubout > key.pub
cmp -s cert.pub key.pub || { echo 'The certificate and private key do not match.' >&2; exit 1; }` },
    { label: 'Retrieve the certificate and private key', script: `printf '\\n__EST_CERT__'
base64 -w 0 "./$1"
printf '\\n__EST_KEY__'
base64 -w 0 "./$2"
printf '\\n__EST_END__\\n'` },
  ];
  const script = [
    'set -e',
    ...steps.map(({ script }, index) => `printf '\\n__EST_STEP__%s\\n' ${index} >&2\n${script}`),
  ].join('\n\n');

  let pending = '';
  let nextStep = 0;
  const readProgress = (chunk: string) => {
    const lines = (pending + chunk).split('\n');
    pending = lines.pop() ?? '';
    for (const line of lines) {
      // Only known progress markers reach the UI. Never stream raw stdout or stderr.
      if (line !== `__EST_STEP__${nextStep}`) continue;
      const step = steps[nextStep];
      if (!step) continue;
      nextStep += 1;
      onActivity({ label: step.label, command: 'command' in step ? step.command : undefined });
    }
  };
  const result = await run('/bin/sh', ['-s', '--', certificateFile, keyFile], script, readProgress);
  if (result.exitCode !== 0) {
    // The last marker identifies the failing step. Earlier steps can write
    // progress to stderr even when they succeed, such as OpenSSL key generation.
    const error = result.stderr.split(/^__EST_STEP__\d+\r?$/m).at(-1)?.trim();
    throw new Error(error || `Enrollment failed (exit code ${result.exitCode}).`);
  }
  const match = result.stdout.match(/\n__EST_CERT__([A-Za-z0-9+/=]+)\n__EST_KEY__([A-Za-z0-9+/=]+)\n__EST_END__\s*$/);
  if (!match) throw new Error('Enrollment did not return a certificate and private key.');
  const inspection = result.stdout.slice(0, match.index ?? 0)
    .split(/\r?\n/)
    .filter(line => /^(subject|issuer|serial|notBefore|notAfter)=/.test(line))
    .join('\n');
  try {
    return { certificate: atob(match[1]), privateKey: atob(match[2]), inspection };
  } catch {
    throw new Error('Enrollment returned invalid certificate or key data.');
  }
}
