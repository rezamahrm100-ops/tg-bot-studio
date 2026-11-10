import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { CssBaseline } from '@mui/material';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CacheProvider } from '@emotion/react';
import createCache from '@emotion/cache';
import rtlPlugin from '@mui/stylis-plugin-rtl';
import { prefixer } from 'stylis';
import { useTranslation } from 'react-i18next';
import { getOperatorWebApp, isOperatorWebApp, telegramThemeHex } from './telegram/operator-webapp';

/**
 * Enterprise theme mode (persisted to localStorage).
 * @typedef {'light'|'dark'} ThemeMode
 */
export type ThemeMode = 'light' | 'dark';

/**
 * Theme context value.
 * @interface ThemeContextValue
 * @property {ThemeMode} mode - Active mode.
 * @property {() => void} toggle - Switches between light and dark.
 */
interface ThemeContextValue {
  mode: ThemeMode;
  toggle: () => void;
}

const ThemeModeContext = createContext<ThemeContextValue>({ mode: 'dark', toggle: () => {} });

/**
 * Reads the persisted theme mode with a dark-mode default.
 * @returns {ThemeMode} Stored mode or 'dark'.
 */
function initialMode(): ThemeMode {
  if (isOperatorWebApp()) {
    return getOperatorWebApp()?.colorScheme === 'light' ? 'light' : 'dark';
  }
  const stored = window.localStorage.getItem('studio-theme-mode');
  return stored === 'light' ? 'light' : 'dark';
}

/**
 * Builds the enterprise MUI theme for the requested mode: neutral slate
 * palette, subtle borders, low elevation, and the Inter type ramp.
 * @param {ThemeMode} mode - Requested color mode.
 * @returns {ReturnType<typeof createTheme>} Configured MUI theme.
 */
const rtlCache = createCache({ key: 'tgbs-rtl', stylisPlugins: [prefixer, rtlPlugin] });

function buildTheme(mode: ThemeMode, direction: 'ltr' | 'rtl') {
  const dark = mode === 'dark';
  const colors = isOperatorWebApp() ? getOperatorWebApp()?.themeParams : undefined;
  const telegramColor = (value: string | undefined, fallback: string): string =>
    telegramThemeHex(value) ?? fallback;
  return createTheme({
    direction,
    palette: {
      mode,
      primary: { main: telegramColor(colors?.button_color, '#2563eb') },
      success: { main: '#16a34a' },
      warning: { main: '#d97706' },
      error: { main: '#dc2626' },
      background: dark
        ? {
            default: telegramColor(colors?.bg_color, '#0b0f17'),
            paper: telegramColor(colors?.secondary_bg_color, '#111726'),
          }
        : {
            default: telegramColor(colors?.bg_color, '#f8fafc'),
            paper: telegramColor(colors?.secondary_bg_color, '#ffffff'),
          },
      text: dark
        ? {
            primary: telegramColor(colors?.text_color, '#e2e8f0'),
            secondary: telegramColor(colors?.hint_color, '#94a3b8'),
          }
        : {
            primary: telegramColor(colors?.text_color, '#0f172a'),
            secondary: telegramColor(colors?.hint_color, '#475569'),
          },
      divider: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)',
    },
    shape: { borderRadius: 10 },
    typography: {
      fontFamily:
        direction === 'rtl'
          ? "'Vazirmatn Variable', Tahoma, sans-serif"
          : "'Inter Variable', 'Inter', sans-serif",
      h6: { fontWeight: 700, letterSpacing: '-0.01em' },
      subtitle2: { fontWeight: 600 },
      button: { textTransform: 'none', fontWeight: 600 },
    },
    components: {
      MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
      MuiCard: {
        defaultProps: { elevation: 0 },
        styleOverrides: {
          root: {
            border: `1px solid ${dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.12)'}`,
          },
        },
      },
      MuiTableCell: { styleOverrides: { head: { fontWeight: 600 } } },
      MuiToggleButton: { styleOverrides: { root: { textTransform: 'none' } } },
    },
  });
}

/**
 * Theme provider exposing the mode toggle and applying CssBaseline.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - Wrapped application tree.
 * @returns {React.ReactElement} The themed tree.
 */
export function StudioThemeProvider({
  children,
}: {
  children: React.ReactNode;
}): React.ReactElement {
  const [mode, setMode] = useState<ThemeMode>(initialMode);
  const [themeRevision, setThemeRevision] = useState(0);
  const { i18n } = useTranslation();
  const direction: 'ltr' | 'rtl' = i18n.resolvedLanguage === 'fa' ? 'rtl' : 'ltr';

  useEffect(() => {
    if (!isOperatorWebApp()) return;
    const app = getOperatorWebApp();
    if (!app) return;
    const onThemeChanged = (): void => {
      setMode(app.colorScheme === 'light' ? 'light' : 'dark');
      setThemeRevision((revision) => revision + 1);
    };
    app.onEvent?.('themeChanged', onThemeChanged);
    return () => app.offEvent?.('themeChanged', onThemeChanged);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({
      mode,
      toggle: () => {
        setMode((current) => {
          const next = current === 'dark' ? 'light' : 'dark';
          window.localStorage.setItem('studio-theme-mode', next);
          return next;
        });
      },
    }),
    [mode],
  );

  const theme = useMemo(() => buildTheme(mode, direction), [mode, direction, themeRevision]);

  useEffect(() => {
    if (!isOperatorWebApp()) return;
    const app = getOperatorWebApp();
    try {
      app?.setHeaderColor?.(theme.palette.background.paper);
      app?.setBackgroundColor?.(theme.palette.background.default);
      app?.setBottomBarColor?.(theme.palette.background.paper);
    } catch {
      // Older Telegram clients may not support one of these settings.
    }
  }, [theme]);

  return (
    <ThemeModeContext.Provider value={value}>
      {direction === 'rtl' ? (
        <CacheProvider value={rtlCache}>
          <ThemeProvider theme={theme}>
            <CssBaseline />
            {children}
          </ThemeProvider>
        </CacheProvider>
      ) : (
        <ThemeProvider theme={theme}>
          <CssBaseline />
          {children}
        </ThemeProvider>
      )}
    </ThemeModeContext.Provider>
  );
}

/**
 * Accesses the active theme mode context.
 * @returns {ThemeContextValue} Current mode and toggle callback.
 */
export function useThemeMode(): ThemeContextValue {
  return useContext(ThemeModeContext);
}
