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
  FileUp,
  Filter,
  HardDrive,
  Loader2,
  Maximize2,
  Minimize2,
  RotateCcw,
  Search,
} from 'lucide-react';
import {
  Alert,
  AlertDescription,
  AlertTitle,
} from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { DetailInfoRow, DetailInfoRows } from '@/components/shared/DetailInfoRows';
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
import { useMediaQuery } from '@/hooks/use-media-query';
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
  const analysisContainerRef = useRef<HTMLDivElement | null>(null);

  const isWideLayout = useMediaQuery('(min-width: 1280px)');
  const isRegularLayout = useMediaQuery('(min-width: 768px)');
  const [isFullscreen, setIsFullscreen] = useState(false);

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

  useEffect(() => {
    const onFullscreenChange = () => {
      setIsFullscreen(document.fullscreenElement === analysisContainerRef.current);
    };
    document.addEventListener('fullscreenchange', onFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void analysisContainerRef.current?.requestFullscreen();
    }
  };

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

  // Larger viewports have room to give the table more relative height and to
  // split protocol/bytes side-by-side; narrower ones stack everything instead.
  const analysisHeightClass = isWideLayout
    ? 'h-[720px]'
    : isRegularLayout
    ? 'h-[820px]'
    : 'h-[960px]';
  const tableDefaultSize = isWideLayout ? 60 : isRegularLayout ? 50 : 35;
  const detailPanelsDirection = isWideLayout ? 'horizontal' : 'vertical';
  const protocolDefaultSize = isWideLayout ? 50 : 55;

  const pillClass = 'inline-flex h-6 items-center gap-1.5 rounded-md px-2 text-xs font-medium';
  const engineToneClass =
    engineState === 'ready'
      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
      : engineState === 'error'
      ? 'bg-destructive/10 text-destructive'
      : 'bg-muted/80 text-muted-foreground';

  return (
    <div className="flex flex-col">
      {/* Section: Capture */}
      <div className="grid grid-cols-1 gap-10 py-6 lg:grid-cols-3">
        <div className="space-y-3">
          <div>
            <p className="font-semibold">Local packet analysis</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Captures stay in your browser and are not uploaded to Lamassu.
            </p>
          </div>
          <span className={cn(pillClass, engineToneClass)}>
            {engineState === 'loading' ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : engineState === 'ready' ? (
              <CheckCircle2 className="h-3 w-3" />
            ) : (
              <AlertCircle className="h-3 w-3" />
            )}
            {engineState === 'ready'
              ? `Wireshark ${engineInfo?.wiresharkVersion ?? ''}`
              : engineStatus}
          </span>
        </div>

        <div className="space-y-4 lg:col-span-2">
          <div
            className={cn(
              'relative grid min-h-52 place-items-center rounded-xl border-2 border-dashed p-6 text-center transition-colors',
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border/60 bg-muted/10',
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
                  <p className="break-all font-medium">{capture.filename}</p>
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

          {capture ? (
            <DetailInfoRows>
              <DetailInfoRow label="Size" value={formatBytes(capture.file_length)} className="first:pt-0" />
              <DetailInfoRow label="Packets" value={capture.packet_count.toLocaleString()} />
              <DetailInfoRow label="File Type" value={capture.file_type} />
              <DetailInfoRow label="Encapsulation" value={capture.file_encap_type} />
              <DetailInfoRow label="Duration" value={formatCaptureDuration(capture.elapsed_time)} className="last:pb-0" />
            </DetailInfoRows>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Packet analyzer error</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
        </div>
      </div>

      {capture ? (
        <>
          <Separator />

          {/* Section: Packets & Analysis */}
          <div className="space-y-4 py-6">
            <div>
              <p className="font-semibold">Packets & Analysis</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Filter captured frames, then inspect the protocol tree and raw bytes
                for the selected packet. Drag a divider to resize.
              </p>
            </div>

            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
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
              <p role="alert" className="text-xs text-destructive">
                {filterError}
              </p>
            ) : null}

            <div
              ref={analysisContainerRef}
              className={cn(
                'relative',
                isFullscreen ? 'h-screen bg-background p-4' : analysisHeightClass,
                'overflow-hidden rounded-lg border',
              )}
            >
            <Button
              variant="outline"
              size="sm"
              className="absolute right-3 top-3 z-30 shadow-sm"
              onClick={toggleFullscreen}
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
              {isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
            </Button>
            <ResizablePanelGroup
              key={`${tableDefaultSize}-${detailPanelsDirection}`}
              direction="vertical"
            >
              <ResizablePanel defaultSize={tableDefaultSize} minSize={20}>
                <div className="relative h-full overflow-auto">
                  {isLoadingFrames ? (
                    <div className="absolute inset-0 z-20 grid place-items-center bg-background/80">
                      <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" />
                        Applying packet filter…
                      </div>
                    </div>
                  ) : null}

                  <table className="w-full min-w-[960px] border-collapse text-xs">
                    <thead className="sticky top-0 z-10 bg-muted text-foreground shadow-sm">
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
                                'relative z-[1] outline outline-2 -outline-offset-2 outline-primary',
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
              </ResizablePanel>

              <ResizableHandle withHandle />

              <ResizablePanel defaultSize={100 - tableDefaultSize} minSize={20}>
                <ResizablePanelGroup direction={detailPanelsDirection}>
                  <ResizablePanel defaultSize={protocolDefaultSize} minSize={20}>
                    <div className="flex h-full flex-col">
                      <div className="shrink-0 border-b bg-muted/30 px-4 py-3">
                        <p className="text-sm font-semibold">Protocol details</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Packet {selectedFrameNumber ?? '—'} · double-click a field
                          to use its display filter
                        </p>
                      </div>
                      <div className="flex-1 overflow-auto px-3 py-2">
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
                    </div>
                  </ResizablePanel>

                  <ResizableHandle withHandle />

                  <ResizablePanel defaultSize={100 - protocolDefaultSize} minSize={20}>
                    <div className="flex h-full flex-col">
                      <div className="shrink-0 border-b bg-muted/30 px-4 py-3">
                        <p className="text-sm font-semibold">Packet bytes</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          Select a protocol field to highlight its raw bytes.
                        </p>
                      </div>
                      <div className="flex-1 overflow-hidden">
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
                    </div>
                  </ResizablePanel>
                </ResizablePanelGroup>
              </ResizablePanel>
            </ResizablePanelGroup>
            </div>

            <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
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
          </div>
        </>
      ) : null}

      <Separator />

      <footer className="flex flex-col gap-2 pt-5 text-xs text-muted-foreground/70 sm:flex-row sm:items-center sm:justify-between">
        <p>
          Powered by Wiregasm and Wireshark WebAssembly.
        </p>
        <nav
          aria-label="Packet analyzer attribution"
          className="flex flex-wrap items-center gap-2"
        >
          <a
            href="/wiregasm/LICENSE.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            GPL-2.0 license
          </a>
          <span aria-hidden="true">·</span>
          <a
            href="/wiregasm/SOURCE.txt"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Corresponding source
          </a>
        </nav>
      </footer>
    </div>
  );
}
