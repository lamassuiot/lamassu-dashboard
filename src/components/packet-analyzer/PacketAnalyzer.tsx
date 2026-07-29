'use client';

import {
  type ChangeEvent,
  type DragEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  AlertCircle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  FileUp,
  Filter,
  HardDrive,
  Loader2,
  RotateCcw,
  Search,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  formatBytes,
  formatCaptureDuration,
  wiregasmColor,
} from '@/lib/packet-analyzer/format';
import type {
  CaptureSummary,
  PacketFrame,
  PacketFrameDetails,
  PacketFramesPage,
  ProtocolSelection,
  WiregasmEngineInfo,
} from '@/lib/packet-analyzer/types';
import { WiregasmWorkerClient } from '@/lib/packet-analyzer/wiregasm-client';
import { cn } from '@/lib/utils';
import { HexViewer } from './HexViewer';
import { ProtocolTree } from './ProtocolTree';

const PAGE_SIZE = 250;
const MAX_CAPTURE_SIZE = 256 * 1024 * 1024;
const ACCEPTED_EXTENSIONS = ['.pcap', '.pcapng', '.cap'];

type EngineState = 'loading' | 'ready' | 'error';

const isSupportedCapture = (file: File) =>
  ACCEPTED_EXTENSIONS.some((extension) =>
    file.name.toLowerCase().endsWith(extension),
  );

export function PacketAnalyzer() {
  const clientRef = useRef<WiregasmWorkerClient | null>(null);
  const frameRequestRef = useRef(0);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [engineState, setEngineState] = useState<EngineState>('loading');
  const [engineStatus, setEngineStatus] = useState(
    'Starting the packet engine…',
  );
  const [engineInfo, setEngineInfo] = useState<WiregasmEngineInfo | null>(null);
  const [capture, setCapture] = useState<CaptureSummary | null>(null);
  const [framesPage, setFramesPage] = useState<PacketFramesPage>({
    frames: [],
    matched: 0,
  });
  const [pageIndex, setPageIndex] = useState(0);
  const [filterInput, setFilterInput] = useState('');
  const [appliedFilter, setAppliedFilter] = useState('');
  const [filterError, setFilterError] = useState<string | null>(null);
  const [selectedFrameNumber, setSelectedFrameNumber] = useState<number | null>(
    null,
  );
  const [frameDetails, setFrameDetails] =
    useState<PacketFrameDetails | null>(null);
  const [protocolSelection, setProtocolSelection] =
    useState<ProtocolSelection | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoadingCapture, setIsLoadingCapture] = useState(false);
  const [isLoadingFrames, setIsLoadingFrames] = useState(false);
  const [isLoadingFrame, setIsLoadingFrame] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const client = new WiregasmWorkerClient((status) => {
      if (mounted) {
        setEngineStatus(status);
      }
    });
    clientRef.current = client;

    client
      .init()
      .then((info) => {
        if (!mounted) return;
        setEngineInfo(info);
        setEngineState('ready');
        setEngineStatus('Packet engine ready');
      })
      .catch((initError: unknown) => {
        if (!mounted) return;
        setEngineState('error');
        setError(
          initError instanceof Error
            ? initError.message
            : 'Unable to start the packet engine.',
        );
      });

    return () => {
      mounted = false;
      clientRef.current = null;
      void client.dispose();
    };
  }, []);

  const openFrame = useCallback(async (number: number) => {
    const client = clientRef.current;
    if (!client) return;

    const requestId = frameRequestRef.current + 1;
    frameRequestRef.current = requestId;
    setSelectedFrameNumber(number);
    setProtocolSelection(null);
    setIsLoadingFrame(true);

    try {
      const details = await client.frame(number);
      if (frameRequestRef.current === requestId) {
        setFrameDetails(details);
      }
    } catch (frameError) {
      if (frameRequestRef.current === requestId) {
        setError(
          frameError instanceof Error
            ? frameError.message
            : `Unable to load packet ${number}.`,
        );
      }
    } finally {
      if (frameRequestRef.current === requestId) {
        setIsLoadingFrame(false);
      }
    }
  }, []);

  const loadFrames = useCallback(
    async (filter: string, nextPageIndex: number, selectFirst = true) => {
      const client = clientRef.current;
      if (!client) return;

      setIsLoadingFrames(true);
      setFilterError(null);
      setError(null);

      try {
        const validation = await client.checkFilter(filter);
        if (!validation.ok) {
          setFilterError(validation.error || 'Invalid Wireshark display filter.');
          return;
        }

        const result = await client.frames(
          filter,
          nextPageIndex * PAGE_SIZE,
          PAGE_SIZE,
        );
        setFramesPage(result);
        setAppliedFilter(filter);
        setPageIndex(nextPageIndex);

        if (selectFirst && result.frames[0]) {
          await openFrame(result.frames[0].number);
        } else if (result.frames.length === 0) {
          setSelectedFrameNumber(null);
          setFrameDetails(null);
          setProtocolSelection(null);
        }
      } catch (framesError) {
        setError(
          framesError instanceof Error
            ? framesError.message
            : 'Unable to load packets from this capture.',
        );
      } finally {
        setIsLoadingFrames(false);
      }
    },
    [openFrame],
  );

  const loadCapture = useCallback(
    async (file: File) => {
      const client = clientRef.current;
      if (!client || engineState !== 'ready') return;

      if (!isSupportedCapture(file)) {
        setError('Choose a PCAP, PCAPNG, or CAP capture file.');
        return;
      }

      if (file.size > MAX_CAPTURE_SIZE) {
        setError(
          `This browser analyzer accepts captures up to ${formatBytes(
            MAX_CAPTURE_SIZE,
          )}.`,
        );
        return;
      }

      setError(null);
      setFilterError(null);
      setIsLoadingCapture(true);
      setCapture(null);
      setFramesPage({ frames: [], matched: 0 });
      setFrameDetails(null);
      setSelectedFrameNumber(null);
      setProtocolSelection(null);
      setFilterInput('');
      setAppliedFilter('');

      try {
        const buffer = await file.arrayBuffer();
        const result = await client.load(file.name, buffer);
        setCapture(result.summary);
        await loadFrames('', 0);
      } catch (captureError) {
        setError(
          captureError instanceof Error
            ? captureError.message
            : 'Unable to analyze this capture.',
        );
      } finally {
        setIsLoadingCapture(false);
      }
    },
    [engineState, loadFrames],
  );

  const handleFileInput = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void loadCapture(file);
    }
    event.target.value = '';
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (file) {
      void loadCapture(file);
    }
  };

  const applyFilter = (filter = filterInput.trim()) => {
    setFilterInput(filter);
    void loadFrames(filter, 0);
  };

  const clearFilter = () => {
    setFilterInput('');
    setFilterError(null);
    void loadFrames('', 0);
  };

  const totalPages = Math.max(1, Math.ceil(framesPage.matched / PAGE_SIZE));
  const canGoBack = pageIndex > 0 && !isLoadingFrames;
  const canGoForward =
    (pageIndex + 1) * PAGE_SIZE < framesPage.matched && !isLoadingFrames;

  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="border-b">
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Local packet analysis
          </CardTitle>
          <CardDescription>
            Captures are dissected inside your browser and are not uploaded to
            Lamassu.
          </CardDescription>
          <CardAction className="flex items-center gap-2">
            <Badge
              variant={engineState === 'error' ? 'destructive' : 'secondary'}
            >
              {engineState === 'loading' ? (
                <Loader2 className="animate-spin" />
              ) : engineState === 'ready' ? (
                <CheckCircle2 />
              ) : (
                <AlertCircle />
              )}
              {engineState === 'ready'
                ? `Wireshark ${engineInfo?.wiresharkVersion ?? ''}`
                : engineStatus}
            </Badge>
          </CardAction>
        </CardHeader>

        <CardContent>
          <div
            className={cn(
              'relative grid min-h-44 place-items-center rounded-xl border border-dashed p-6 text-center transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border bg-muted/20',
              engineState !== 'ready' && 'cursor-not-allowed opacity-70',
            )}
            onDragEnter={(event) => {
              event.preventDefault();
              if (engineState === 'ready') setIsDragging(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".pcap,.pcapng,.cap,application/vnd.tcpdump.pcap"
              className="sr-only"
              disabled={engineState !== 'ready' || isLoadingCapture}
              onChange={handleFileInput}
            />

            {isLoadingCapture ? (
              <div className="space-y-3">
                <Loader2 className="mx-auto size-9 animate-spin text-primary" />
                <div>
                  <p className="font-medium">{engineStatus}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Large captures can take a moment to index.
                  </p>
                </div>
              </div>
            ) : capture ? (
              <div className="w-full space-y-4">
                <div className="flex flex-col items-center gap-2">
                  <HardDrive className="size-8 text-primary" />
                  <div className="min-w-0">
                    <p className="break-all font-medium">{capture.filename}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatBytes(capture.file_length)} ·{' '}
                      {capture.packet_count.toLocaleString()} packets
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-center gap-2">
                  <Badge variant="outline">{capture.file_type}</Badge>
                  <Badge variant="outline">{capture.file_encap_type}</Badge>
                  <Badge variant="outline">
                    {formatCaptureDuration(capture.elapsed_time)}
                  </Badge>
                </div>

                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <RotateCcw />
                  Replace capture
                </Button>
              </div>
            ) : (
              <div className="space-y-3">
                {engineState === 'loading' ? (
                  <Loader2 className="mx-auto size-9 animate-spin text-primary" />
                ) : (
                  <FileUp className="mx-auto size-9 text-primary" />
                )}
                <div>
                  <p className="font-medium">
                    {engineState === 'loading'
                      ? engineStatus
                      : 'Drop a packet capture here'}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    PCAP, PCAPNG, or CAP · up to{' '}
                    {formatBytes(MAX_CAPTURE_SIZE)}
                  </p>
                </div>
                <Button
                  disabled={engineState !== 'ready'}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileUp />
                  Choose capture
                </Button>
              </div>
            )}
          </div>

          {error ? (
            <div
              role="alert"
              className="mt-4 flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0" />
              <span>{error}</span>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {capture ? (
        <>
          <Card className="gap-0 py-0">
            <div className="flex flex-col gap-3 border-b p-4 lg:flex-row lg:items-center">
              <div className="flex min-w-0 flex-1 items-center gap-2">
                <Filter className="size-4 shrink-0 text-muted-foreground" />
                <Input
                  value={filterInput}
                  aria-invalid={!!filterError}
                  placeholder="Wireshark display filter, e.g. tcp.port == 443"
                  className="font-mono"
                  onChange={(event) => setFilterInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyFilter();
                    }
                  }}
                />
              </div>
              <div className="flex items-center gap-2">
                <Button
                  onClick={() => applyFilter()}
                  disabled={isLoadingFrames}
                >
                  {isLoadingFrames ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <Search />
                  )}
                  Apply
                </Button>
                {appliedFilter || filterInput ? (
                  <Button
                    variant="outline"
                    onClick={clearFilter}
                    disabled={isLoadingFrames}
                  >
                    Clear
                  </Button>
                ) : null}
              </div>
            </div>

            {filterError ? (
              <div
                role="alert"
                className="border-b bg-destructive/5 px-4 py-2 text-xs text-destructive"
              >
                {filterError}
              </div>
            ) : null}

            <div className="relative h-[390px] overflow-auto">
              {isLoadingFrames ? (
                <div className="absolute inset-0 z-20 grid place-items-center bg-background/70 backdrop-blur-[1px]">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Applying packet filter…
                  </div>
                </div>
              ) : null}

              <table className="w-full min-w-[960px] border-collapse text-xs">
                <thead className="sticky top-0 z-10 bg-muted/95 text-foreground shadow-sm backdrop-blur">
                  <tr>
                    {(engineInfo?.columns ?? []).map((column) => (
                      <th
                        key={column}
                        className="h-9 border-b px-2 text-left font-medium"
                      >
                        {column}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {framesPage.frames.map((frame: PacketFrame) => {
                    const selected = frame.number === selectedFrameNumber;
                    const backgroundColor = wiregasmColor(frame.bg);
                    const color = wiregasmColor(frame.fg);

                    return (
                      <tr
                        key={frame.number}
                        aria-selected={selected}
                        className={cn(
                          'cursor-pointer border-b border-border/60 transition-[filter,box-shadow] hover:brightness-95 dark:hover:brightness-110',
                          selected &&
                            'relative z-[1] shadow-[inset_3px_0_0_var(--primary),inset_0_0_0_1px_var(--primary)]',
                        )}
                        style={{ backgroundColor, color }}
                        onClick={() => void openFrame(frame.number)}
                      >
                        {frame.columns.map((column, index) => (
                          <td
                            key={`${frame.number}-${index}`}
                            className={cn(
                              'max-w-[420px] truncate px-2 py-1.5 font-mono',
                              index === frame.columns.length - 1 && 'min-w-72',
                            )}
                            title={column}
                          >
                            {column}
                          </td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {!isLoadingFrames && framesPage.frames.length === 0 ? (
                <div className="grid h-72 place-items-center text-sm text-muted-foreground">
                  No packets match this display filter.
                </div>
              ) : null}
            </div>

            <div className="flex flex-col gap-2 border-t px-4 py-3 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
              <span>
                {framesPage.matched.toLocaleString()} matching packets · showing
                up to {PAGE_SIZE.toLocaleString()} per page
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canGoBack}
                  onClick={() =>
                    void loadFrames(appliedFilter, pageIndex - 1)
                  }
                >
                  <ChevronLeft />
                  Previous
                </Button>
                <span className="min-w-20 text-center text-foreground">
                  {pageIndex + 1} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!canGoForward}
                  onClick={() =>
                    void loadFrames(appliedFilter, pageIndex + 1)
                  }
                >
                  Next
                  <ChevronRight />
                </Button>
              </div>
            </div>
          </Card>

          <div className="grid min-h-[430px] gap-5 xl:grid-cols-2">
            <Card className="min-h-0 gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Protocol details</CardTitle>
                <CardDescription>
                  Packet {selectedFrameNumber ?? '—'} · double-click a field to
                  use its display filter
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-0">
                <div className="h-[365px] overflow-auto px-3 py-2">
                  {isLoadingFrame ? (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      <span className="flex items-center gap-2">
                        <Loader2 className="size-4 animate-spin" />
                        Dissecting packet…
                      </span>
                    </div>
                  ) : (
                    <ProtocolTree
                      nodes={frameDetails?.tree ?? []}
                      selection={protocolSelection}
                      onSelect={setProtocolSelection}
                      onApplyFilter={(filter) => applyFilter(filter)}
                    />
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="min-h-0 gap-0 py-0">
              <CardHeader className="border-b py-4">
                <CardTitle>Packet bytes</CardTitle>
                <CardDescription>
                  Select a protocol field to highlight its raw bytes.
                </CardDescription>
              </CardHeader>
              <CardContent className="min-h-0 flex-1 px-0">
                <div className="h-[365px]">
                  {isLoadingFrame ? (
                    <div className="grid h-full place-items-center text-sm text-muted-foreground">
                      <Loader2 className="size-4 animate-spin" />
                    </div>
                  ) : (
                    <HexViewer
                      dataSources={frameDetails?.data_sources ?? []}
                      selection={protocolSelection}
                    />
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : null}

      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-center gap-2">
            <Cpu className="size-3.5" />
            Powered by Wiregasm and Wireshark WebAssembly.
          </span>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <a
              href="/wiregasm/LICENSE.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              GPL-2.0 license
            </a>
            <Separator orientation="vertical" className="hidden h-3 sm:block" />
            <a
              href="/wiregasm/SOURCE.txt"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4 hover:text-foreground"
            >
              Corresponding source
            </a>
          </span>
        </div>
      </div>
    </div>
  );
}
