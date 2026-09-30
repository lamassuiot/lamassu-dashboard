import { readCertificateFile } from '@/lib-crypto';
import { sileo } from '@/lib/toast';

export const CERTIFICATE_FILE_EXTENSIONS = ['.pem', '.crt', '.cer', '.der'];
export const CERTIFICATE_MAX_FILE_SIZE = 5 * 1024 * 1024;

interface LoadCertificateFilesOptions {
  allowedExtensions?: string[];
  maxFileSize?: number;
}

const extensionFor = (fileName: string) => {
  const index = fileName.lastIndexOf('.');
  return index >= 0 ? fileName.slice(index).toLowerCase() : '';
};

/**
 * Validates and reads certificate files (PEM or DER), returning their combined PEM content.
 *
 * DER files are converted to PEM and the user is notified of the conversion.
 * Returns null (after showing an error toast) when any file is rejected or unreadable.
 */
export async function loadCertificateFilesAsPem(
  files: File[],
  {
    allowedExtensions = CERTIFICATE_FILE_EXTENSIONS,
    maxFileSize = CERTIFICATE_MAX_FILE_SIZE,
  }: LoadCertificateFilesOptions = {},
): Promise<string | null> {
  const invalidFile = files.find(file => !allowedExtensions.includes(extensionFor(file.name)));
  if (invalidFile) {
    sileo.error({
      title: 'Invalid File Type',
      description: `Only ${allowedExtensions.join(', ')} files are supported.`,
    });
    return null;
  }

  const oversizedFile = files.find(file => file.size > maxFileSize);
  if (oversizedFile) {
    sileo.error({
      title: 'File Too Large',
      description: `File size must be less than ${maxFileSize / 1024 / 1024}MB.`,
    });
    return null;
  }

  const pems: string[] = [];
  const convertedFileNames: string[] = [];
  const truncatedFileNames: string[] = [];
  for (const file of files) {
    try {
      const { pem, convertedFromDer, ignoredTrailingData } = await readCertificateFile(file);
      pems.push(pem);
      if (convertedFromDer) convertedFileNames.push(file.name);
      if (ignoredTrailingData) truncatedFileNames.push(file.name);
    } catch (error) {
      sileo.error({
        title: 'File Read Error',
        description: `Could not read "${file.name}": ${error instanceof Error ? error.message : 'unknown error'}`,
      });
      return null;
    }
  }

  if (convertedFileNames.length > 0) {
    sileo.info({
      title: 'DER Converted to PEM',
      description: convertedFileNames.length === 1
        ? `"${convertedFileNames[0]}" was DER-encoded and has been converted to PEM.`
        : `${convertedFileNames.length} DER-encoded files have been converted to PEM.`,
    });
  }

  if (truncatedFileNames.length > 0) {
    sileo.warning({
      title: 'Only First Certificate Used',
      description: `${truncatedFileNames.map(name => `"${name}"`).join(', ')} contained data after the first certificate `
        + '(e.g. a concatenated DER chain), which was ignored. Provide each chain certificate as a separate DER file or as PEM.',
    });
  }

  return pems.join('\n');
}
