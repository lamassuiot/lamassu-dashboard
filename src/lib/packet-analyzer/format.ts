export interface HexRow {
  offset: number;
  bytes: number[];
  ascii: string[];
}

export const formatBytes = (value: number): string => {
  if (!Number.isFinite(value) || value <= 0) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB'];
  const unitIndex = Math.min(
    Math.floor(Math.log(value) / Math.log(1024)),
    units.length - 1,
  );
  const scaled = value / 1024 ** unitIndex;
  const precision = scaled >= 10 || unitIndex === 0 ? 0 : 1;

  return `${scaled.toFixed(precision)} ${units[unitIndex]}`;
};

export const formatCaptureDuration = (seconds: number): string => {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '—';
  }

  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`;
  }

  if (seconds < 60) {
    return `${seconds.toFixed(seconds < 10 ? 2 : 1)} s`;
  }

  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.round(seconds % 60);
  return `${minutes}m ${remainingSeconds}s`;
};

export const wiregasmColor = (value: number): string | undefined => {
  if (!Number.isFinite(value) || value <= 0) {
    return undefined;
  }

  return `#${((value >>> 0) & 0xffffff).toString(16).padStart(6, '0')}`;
};

export const decodeBase64 = (value: string): Uint8Array => {
  if (!value) {
    return new Uint8Array();
  }

  const decoded = globalThis.atob(value);
  const bytes = new Uint8Array(decoded.length);

  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }

  return bytes;
};

export const buildHexRows = (
  bytes: Uint8Array,
  bytesPerRow = 16,
): HexRow[] => {
  if (bytesPerRow <= 0) {
    throw new Error('bytesPerRow must be greater than zero.');
  }

  const rows: HexRow[] = [];

  for (let offset = 0; offset < bytes.length; offset += bytesPerRow) {
    const rowBytes = Array.from(bytes.slice(offset, offset + bytesPerRow));
    rows.push({
      offset,
      bytes: rowBytes,
      ascii: rowBytes.map((byte) =>
        byte >= 0x20 && byte < 0x7f ? String.fromCharCode(byte) : '.',
      ),
    });
  }

  return rows;
};
