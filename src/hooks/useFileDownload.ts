import { useCallback, useRef, useState } from 'react';
import { saveDownload, type DownloadProgress } from '@/lib/download-file';
import { sileo } from '@/lib/toast';

export type FileDownloadProgress = DownloadProgress & { fileName: string };

/**
 * State for the "download this file" buttons of a list: which file is being fetched, its progress,
 * and the error toast. One download at a time — a second click while one runs is ignored, so two
 * multi-GiB transfers never compete for the same uplink.
 */
export function useFileDownload() {
  const running = useRef(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<FileDownloadProgress | null>(null);

  const download = useCallback(async (id: string, filename: string, open: () => Promise<Response>) => {
    if (running.current) return;
    running.current = true;
    setBusyId(id);
    try {
      await saveDownload(open, filename, (p) => setProgress({ ...p, fileName: filename }));
    } catch (err) {
      sileo.error({ title: `Could not download ${filename}`, description: err instanceof Error ? err.message : String(err) });
    } finally {
      running.current = false;
      setBusyId(null);
      setProgress(null);
    }
  }, []);

  return { download, busyId, progress };
}
