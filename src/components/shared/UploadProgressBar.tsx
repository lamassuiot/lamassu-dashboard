'use client';

import { Progress } from '@/components/ui/progress';
import { cn, formatBytes, formatDuration } from '@/lib/utils';
import type { UploadProgress } from '@/lib/upload-with-progress';

/** One upload in flight; `fileIndex`/`fileCount` are there when several files go up one after the other. */
export type UploadProgressInfo = UploadProgress & {
  fileName?: string;
  fileIndex?: number;
  fileCount?: number;
};

/**
 * Progress of an upload that can take hours. While the browser is still sending it shows the bytes,
 * speed and time left; once the last byte is out the server is still storing the file (minutes for a
 * multi-GiB one), so the bar turns indeterminate and says so rather than sitting at 100% looking hung.
 */
export function UploadProgressBar({ progress, className, kind = 'upload' }: { progress: UploadProgressInfo | null; className?: string; kind?: 'upload' | 'download' }) {
  if (!progress) return null;

  const processing = progress.phase === 'processing';
  // A download whose size the server did not announce has bytes but no percentage.
  const sizeKnown = progress.total > 0;
  const percent = progress.total > 0 ? Math.floor((progress.loaded / progress.total) * 100) : 0;
  const title = progress.fileName
    ? progress.fileCount && progress.fileCount > 1
      ? `${progress.fileName} (file ${(progress.fileIndex ?? 0) + 1} of ${progress.fileCount})`
      : progress.fileName
    : kind === 'download' ? 'Downloading' : 'Uploading';

  return (
    <div className={cn('space-y-1.5', className)}>
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="truncate font-medium" title={title}>{title}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">{processing ? 'Storing…' : sizeKnown ? `${percent}%` : ''}</span>
      </div>
      <Progress
        value={processing || !sizeKnown ? 100 : percent}
        aria-label={processing ? 'Storing the file on the server' : kind === 'download' ? 'Download progress' : 'Upload progress'}
        className={cn('h-2', (processing || !sizeKnown) && 'animate-pulse')}
      />
      <p className="text-xs text-muted-foreground tabular-nums">
        {processing
          ? `${formatBytes(progress.total)} sent. The server is storing the file; this can take several minutes for a large one. Keep this page open.`
          : [
              sizeKnown ? `${formatBytes(progress.loaded)} of ${formatBytes(progress.total)}` : `${formatBytes(progress.loaded)} downloaded`,
              progress.bytesPerSecond ? `${formatBytes(progress.bytesPerSecond)}/s` : null,
              progress.secondsLeft !== null ? `${formatDuration(progress.secondsLeft)} left` : null,
            ].filter(Boolean).join(' · ')}
      </p>
    </div>
  );
}
