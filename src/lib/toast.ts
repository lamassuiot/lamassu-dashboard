import { sileo as _sileo } from 'sileo';

type SileoOptions = Parameters<typeof _sileo.success>[0];

const DARK_TOAST = {
  fill: '#18181b',
} satisfies Partial<SileoOptions>;

const LIGHT_TOAST = {
  fill: '#fafafa',
} satisfies Partial<SileoOptions>;

function getThemeDefaults(): Partial<SileoOptions> {
  if (typeof document !== 'undefined' && document.documentElement.classList.contains('dark')) {
    return LIGHT_TOAST;
  }
  return DARK_TOAST;
}

function withTheme(options: SileoOptions): SileoOptions {
  return { ...getThemeDefaults(), ...options };
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
