import { sileo as _sileo } from 'sileo';

type SileoOptions = Parameters<typeof _sileo.success>[0];
type SileoPosition = NonNullable<SileoOptions['position']>;
type ToastTheme = 'dark' | 'light';

const DARK_TOAST = {
  fill: '#18181b',
} satisfies Partial<SileoOptions>;

const LIGHT_TOAST = {
  fill: '#fafafa',
} satisfies Partial<SileoOptions>;

export function getToastPosition(): SileoPosition | undefined {
  if (typeof window === 'undefined') {
    return undefined;
  }

  const position = (window as any).lamassuConfig?.TOAST_POSITION;
  return typeof position === 'string' ? position as SileoPosition : undefined;
}

export function getToastTheme(): ToastTheme {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return 'dark';
  }

  return 'light';
}

export function getToastDefaults(): Partial<SileoOptions> {
  const position = getToastPosition();
  const themeDefaults = getToastTheme() === 'dark' ? LIGHT_TOAST : DARK_TOAST;

  return { ...themeDefaults, ...(position ? { position } : {}) };
}

function withTheme(options: SileoOptions): SileoOptions {
  return { ...getToastDefaults(), ...options };
}

export const sileo = {
  success: (options: SileoOptions) => _sileo.success(withTheme(options)),
  error: (options: SileoOptions) => _sileo.error(withTheme(options)),
  warning: (options: SileoOptions) => _sileo.warning(withTheme(options)),
  info: (options: SileoOptions) => _sileo.info(withTheme(options)),
  show: (options: SileoOptions) => _sileo.show(withTheme(options)),
  action: (options: SileoOptions) => _sileo.action(withTheme(options)),
  promise: _sileo.promise.bind(_sileo),
  dismiss: _sileo.dismiss.bind(_sileo),
  clear: _sileo.clear.bind(_sileo),
};
