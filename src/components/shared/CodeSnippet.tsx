'use client';

import React, { useMemo, useState } from 'react';
import { Check, Copy, Download, FileKey2, FileText, SquareTerminal, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { sileo } from '@/lib/toast';
import { highlightShell, type ShellTokenKind } from '@/lib/shell-highlight';
import { highlightPem } from '@/lib/pem-highlight';
import { useRunInTerminal } from '@/components/terminal/TerminalContext';

export type CodeSnippetLanguage = 'shell' | 'pem' | 'base64';

const LANGUAGE_DEFAULTS: Record<CodeSnippetLanguage, { label: string; icon: LucideIcon; mime: string; wrap: boolean }> = {
  shell: { label: 'bash', icon: SquareTerminal, mime: 'text/x-shellscript', wrap: false },
  pem: { label: 'pem', icon: FileKey2, mime: 'application/x-pem-file', wrap: false },
  base64: { label: 'base64', icon: FileText, mime: 'text/plain', wrap: true },
};

const SHELL_TOKEN_CLASS: Record<ShellTokenKind, string> = {
  command: 'font-medium text-sky-700 dark:text-sky-300',
  flag: 'text-violet-700 dark:text-violet-300',
  string: 'text-emerald-700 dark:text-emerald-300',
  variable: 'text-amber-700 dark:text-amber-300',
  operator: 'text-pink-600 dark:text-pink-400',
  comment: 'italic text-zinc-500',
  continuation: 'text-zinc-400 dark:text-zinc-500',
  heredoc: 'text-zinc-700 dark:text-zinc-300',
  text: 'text-zinc-800 dark:text-zinc-200',
};

const MUTED = 'text-zinc-400 dark:text-zinc-600';
const ICON_BUTTON =
  'inline-flex h-7 items-center gap-1.5 rounded-md px-2 text-xs text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-zinc-400 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100 dark:focus-visible:ring-zinc-500';

export interface CodeSnippetProps {
  /** Exact text that is copied and downloaded. */
  content: string;
  language: CodeSnippetLanguage;
  /** Header label, e.g. a filename or what the snippet does. */
  title?: React.ReactNode;
  /** Optional second header line. */
  subtitle?: React.ReactNode;
  /** Header icon; defaults to one matching the language. */
  icon?: LucideIcon;
  /** Extra element next to the title, e.g. a count badge. */
  badge?: React.ReactNode;
  /** Overrides the language tag shown on the right of the header. */
  languageLabel?: string;
  /** Wrap long lines instead of scrolling horizontally. Defaults per language. */
  wrap?: boolean;
  /** Offers a download of the content under this filename. */
  downloadFilename?: string;
  downloadMimeType?: string;
  /** Caps the body height (any CSS length); the body scrolls beyond it. */
  maxHeight?: string;
  /** Shown instead of the body when `content` is empty. */
  emptyMessage?: string;
  className?: string;
}

function ShellBody({ source }: { source: string }) {
  const lines = useMemo(() => highlightShell(source), [source]);
  return lines.map((line, index) => (
    <span key={index} className="flex">
      <span aria-hidden className={cn('w-5 shrink-0 select-none', MUTED)}>
        {line.kind === 'command' ? '$' : ''}
      </span>
      <span className="min-w-0 flex-1">
        {line.tokens.length === 0
          ? '​'
          : line.tokens.map((token, tokenIndex) => (
              <span key={tokenIndex} className={SHELL_TOKEN_CLASS[token.kind]}>
                {token.value}
              </span>
            ))}
      </span>
    </span>
  ));
}

function PemBody({ source }: { source: string }) {
  const lines = useMemo(() => highlightPem(source), [source]);
  let seenBlock = false;
  return lines.map((line, index) => {
    switch (line.kind) {
      case 'boundary': {
        const separated = line.edge === 'BEGIN' && seenBlock;
        seenBlock = true;
        return (
          <span key={index} className={cn('block text-primary', separated && 'mt-4')}>
            <span className="opacity-60">-----</span>
            <span className="font-semibold">{`${line.edge} ${line.label}`}</span>
            <span className="opacity-60">-----</span>
          </span>
        );
      }
      case 'meta':
        return (
          <span key={index} className="block italic text-zinc-500">
            {line.text}
          </span>
        );
      case 'body':
        return (
          <span key={index} className="block text-zinc-600 dark:text-zinc-400">
            {line.text}
          </span>
        );
      default:
        return null;
    }
  });
}

/**
 * Read-only code panel shared by shell commands, PEM objects and base64 payloads: theme-aware
 * surface, header with title and copy/download actions, and language-specific colouring.
 */
export const CodeSnippet: React.FC<CodeSnippetProps> = ({
  content,
  language,
  title,
  subtitle,
  icon,
  badge,
  languageLabel,
  wrap,
  downloadFilename,
  downloadMimeType,
  maxHeight,
  emptyMessage = 'Nothing to display.',
  className,
}) => {
  const [copied, setCopied] = useState(false);
  const runInTerminal = useRunInTerminal();
  const defaults = LANGUAGE_DEFAULTS[language];
  const Icon = icon ?? defaults.icon;
  const shouldWrap = wrap ?? defaults.wrap;
  const source = content.replace(/\s+$/, '');
  const isEmpty = source.trim() === '';

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(source);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      sileo.error({ title: 'Copy failed' });
    }
  };

  const handleDownload = () => {
    if (!downloadFilename) return;
    const url = URL.createObjectURL(new Blob([`${source}\n`], { type: downloadMimeType ?? defaults.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = downloadFilename;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 shadow-sm dark:border-zinc-800 dark:bg-zinc-950',
        className,
      )}
    >
      <div
        className={cn(
          'flex shrink-0 items-center gap-2 border-b border-zinc-200 bg-white pl-3 pr-1.5 dark:border-zinc-800 dark:bg-zinc-900/70',
          subtitle ? 'py-2' : 'h-9',
        )}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-zinc-400 dark:text-zinc-500" aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-xs font-medium text-zinc-700 dark:text-zinc-300">
              {title ?? (language === 'shell' ? 'Terminal' : defaults.label.toUpperCase())}
            </span>
            {badge}
          </div>
          {subtitle && <p className="truncate text-[11px] text-zinc-500">{subtitle}</p>}
        </div>
        <span className="select-none font-mono text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
          {languageLabel ?? defaults.label}
        </span>
        {language === 'shell' && runInTerminal && (
          <button
            type="button"
            onClick={() => runInTerminal(content)}
            disabled={isEmpty}
            className={ICON_BUTTON}
            aria-label="Run in terminal"
            title="Run in terminal"
          >
            <SquareTerminal className="h-3.5 w-3.5" aria-hidden="true" />
            <span className="hidden sm:inline">Run in terminal</span>
          </button>
        )}
        {downloadFilename && (
          <button
            type="button"
            onClick={handleDownload}
            disabled={isEmpty}
            className={ICON_BUTTON}
            aria-label={`Download ${downloadFilename}`}
            title={`Download ${downloadFilename}`}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
        )}
        <button type="button" onClick={handleCopy} disabled={isEmpty} className={ICON_BUTTON} aria-label={copied ? 'Copied' : 'Copy'}>
          {copied ? <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
      {isEmpty ? (
        <div className="flex h-24 items-center justify-center text-sm text-zinc-500">{emptyMessage}</div>
      ) : (
        <pre
          className={cn(
            'overflow-auto px-4 py-3',
            language === 'shell' ? 'text-[12.5px] leading-6' : 'text-xs leading-5',
            shouldWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre',
          )}
          style={{ maxHeight, fontFamily: 'var(--font-jetbrains-mono), ui-monospace, SFMono-Regular, Menlo, monospace' }}
        >
          <code className={cn('block', !shouldWrap && 'min-w-max')}>
            {language === 'shell' && <ShellBody source={source} />}
            {language === 'pem' && <PemBody source={source} />}
            {language === 'base64' && <span className="text-zinc-600 dark:text-zinc-400">{source}</span>}
          </code>
        </pre>
      )}
    </div>
  );
};

type ShellCommandProps = Omit<CodeSnippetProps, 'content' | 'language'> & { command: string };

/** Shell command snippet with `$` prompts; copying yields the raw command. */
export const ShellCommand: React.FC<ShellCommandProps> = ({ command, ...props }) => (
  <CodeSnippet content={command} language="shell" {...props} />
);
