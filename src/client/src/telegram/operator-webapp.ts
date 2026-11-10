/**
 * Typed, optional Telegram Mini App bridge.
 * It is only activated when the dashboard was launched with signed initData
 * from the dedicated management bot; the server separately verifies the HMAC.
 */
export interface OperatorWebApp {
  initData: string;
  colorScheme?: 'light' | 'dark';
  themeParams?: {
    bg_color?: string;
    secondary_bg_color?: string;
    text_color?: string;
    hint_color?: string;
    button_color?: string;
    button_text_color?: string;
  };
  BackButton?: {
    show: () => void;
    hide: () => void;
    onClick: (callback: () => void) => void;
    offClick: (callback: () => void) => void;
  };
  HapticFeedback?: {
    selectionChanged?: () => void;
    impactOccurred?: (style: 'light' | 'medium' | 'heavy') => void;
  };
  onEvent?: (event: 'themeChanged', callback: () => void) => void;
  offEvent?: (event: 'themeChanged', callback: () => void) => void;
  ready?: () => void;
  expand?: () => void;
  setHeaderColor?: (color: string) => void;
  setBackgroundColor?: (color: string) => void;
  setBottomBarColor?: (color: string) => void;
}

let verifiedClientLaunch = false;

/** Query flags alone do not authorize a Telegram-specific UI. */
export function markOperatorWebAppLaunch(): void {
  const requested = new URLSearchParams(window.location.search).get('tg_admin') === '1';
  const app = getOperatorWebApp();
  verifiedClientLaunch = requested && Boolean(app?.initData);
  if (verifiedClientLaunch) {
    app?.ready?.();
    app?.expand?.();
    document.documentElement.dataset.telegramOperator = 'true';
  }
}

/** UI hint only. All privileged API requests still need server authentication. */
export function isOperatorWebApp(): boolean {
  return verifiedClientLaunch;
}

export function getOperatorWebApp(): OperatorWebApp | undefined {
  return (window as Window & { Telegram?: { WebApp?: OperatorWebApp } }).Telegram?.WebApp;
}

/** Reject CSS injection in server-untrusted Telegram theme fields. */
export function telegramThemeHex(value: string | undefined): string | undefined {
  return value && /^#[a-f\d]{6}$/i.test(value) ? value : undefined;
}

export function telegramSelectionFeedback(): void {
  if (isOperatorWebApp()) getOperatorWebApp()?.HapticFeedback?.selectionChanged?.();
}
