import chiperInfo from '../../chiper_info.json';

export type CipherStrength =
  | 'recommended'
  | 'secure'
  | 'weak'
  | 'insecure'
  | 'unknown';

export function getCipherStrength(cipherSuite: string): CipherStrength {
  if ((chiperInfo.recommended as string[]).includes(cipherSuite)) return 'recommended';
  if ((chiperInfo.secure as string[]).includes(cipherSuite)) return 'secure';
  if ((chiperInfo.weak as string[]).includes(cipherSuite)) return 'weak';
  if ((chiperInfo.insecure as string[]).includes(cipherSuite)) return 'insecure';
  return 'unknown';
}

export const cipherStrengthBadge: Record<
  CipherStrength,
  {
    label: string;
    className: string;
    short: string;
    compactClass: string;
  }
> = {
  recommended: {
    label: 'Recommended',
    className:
      'border border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-400',
    short: 'R',
    compactClass:
      'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
  },
  secure: {
    label: 'Secure',
    className:
      'border border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-400',
    short: 'S',
    compactClass:
      'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
  },
  weak: {
    label: 'Weak',
    className:
      'border border-yellow-500/30 bg-yellow-500/15 text-yellow-700 dark:text-yellow-400',
    short: 'W',
    compactClass:
      'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
  },
  insecure: {
    label: 'Insecure',
    className:
      'border border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-400',
    short: 'I',
    compactClass:
      'bg-rose-100 text-rose-800 dark:bg-rose-900/50 dark:text-rose-300',
  },
  unknown: {
    label: 'Unknown',
    className: 'border border-border bg-muted text-muted-foreground',
    short: '?',
    compactClass: 'bg-muted text-muted-foreground',
  },
};
