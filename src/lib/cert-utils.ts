const PRESERVED_USAGE_ACRONYMS = ["OCSP", "CRL"] as const;

export function formatCertificateUsageLabel(value: string): string {
  if (!value) return '';

  const words: string[] = [];
  let currentWord = '';
  let index = 0;

  while (index < value.length) {
    const matchedAcronym = PRESERVED_USAGE_ACRONYMS.find((acronym) => {
      if (index + acronym.length > value.length) return false;
      for (let i = 0; i < acronym.length; i += 1) {
        if (value[index + i].toUpperCase() !== acronym[i]) return false;
      }
      return true;
    });

    if (matchedAcronym) {
      if (currentWord) { words.push(currentWord); currentWord = ''; }
      words.push(matchedAcronym);
      index += matchedAcronym.length;
      continue;
    }

    const character = value[index];
    const previousCharacter = currentWord[currentWord.length - 1];
    const startsNewWord =
      currentWord.length > 0 &&
      character >= 'A' && character <= 'Z' &&
      previousCharacter >= 'a' && previousCharacter <= 'z';

    if (startsNewWord) {
      words.push(currentWord);
      currentWord = character;
    } else {
      currentWord += character;
    }
    index += 1;
  }

  if (currentWord) words.push(currentWord);

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

export function downloadFile(data: ArrayBuffer, filename: string, mimeType: string): void {
  const blob = new Blob([data], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
