import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // Fallback for non-secure HTTP contexts
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

const PRESERVED_USAGE_ACRONYMS = ["OCSP", "CRL"] as const;

export function formatCertificateUsageLabel(value: string): string {
  if (!value) return '';

  const words: string[] = [];
  let currentWord = '';
  let index = 0;

  while (index < value.length) {
    const matchedAcronym = PRESERVED_USAGE_ACRONYMS.find((acronym) => {
      if (index + acronym.length > value.length) return false;

      for (let acronymIndex = 0; acronymIndex < acronym.length; acronymIndex += 1) {
        const sourceCharacter = value[index + acronymIndex].toUpperCase();
        if (sourceCharacter !== acronym[acronymIndex]) {
          return false;
        }
      }

      return true;
    });

    if (matchedAcronym) {
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
      }
      words.push(matchedAcronym);
      index += matchedAcronym.length;
      continue;
    }

    const character = value[index];
    const previousCharacter = currentWord[currentWord.length - 1];
    const startsNewWord =
      currentWord.length > 0 &&
      character >= 'A' &&
      character <= 'Z' &&
      previousCharacter >= 'a' &&
      previousCharacter <= 'z';

    if (startsNewWord) {
      words.push(currentWord);
      currentWord = character;
    } else {
      currentWord += character;
    }

    index += 1;
  }

  if (currentWord) {
    words.push(currentWord);
  }

  return words
    .filter(Boolean)
    .map((word, wordIndex) => {
      if (PRESERVED_USAGE_ACRONYMS.includes(word as typeof PRESERVED_USAGE_ACRONYMS[number])) {
        return word;
      }

      if (wordIndex === 0 && word[0] >= 'a' && word[0] <= 'z') {
        return word[0].toUpperCase() + word.slice(1);
      }

      return word;
    })
    .join(' ');
}


export function isValidSemver(v: string): boolean {
  return /^\d+\.\d+\.\d+$/.test((v || '').trim());
}

export function compareSemver(a: string, b: string): number {
  const pa = (a || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  const pb = (b || '').trim().split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i++) {
    const x = pa[i] || 0, y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function formatBytes(bytes?: number | null, decimals = 1): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes <= 0) return '—';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${parseFloat(value.toFixed(i === 0 ? 0 : decimals))} ${sizes[i]}`;
}

export function downloadFile(data: string | Uint8Array | ArrayBuffer | null | undefined, filename: string, mimeType: string): void {
  if (data == null) return;
  let blob: Blob;
  if (typeof data === 'string') {
    const binary = atob(data);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    blob = new Blob([bytes], { type: mimeType });
  } else {
    blob = new Blob([data], { type: mimeType });
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function setCookie(name: string, value: string, maxAge: number = 31536000) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}
