import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
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

// Cookie utility functions
export function setCookie(name: string, value: string, maxAge: number = 31536000) {
  document.cookie = `${name}=${value}; path=/; max-age=${maxAge}; samesite=lax`;
}

export function getCookie(name: string): string | null {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}
