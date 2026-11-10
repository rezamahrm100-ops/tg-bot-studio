import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiFetch, getToken, setToken } from '../services/api';

/**
 * Authentication context value.
 * @interface AuthContextValue
 * @property {boolean} authenticated - Whether a session is active.
 * @property {boolean} checking - Boot-time session validation in flight.
 * @property {(masterKey: string) => Promise<void>} login - Exchanges the master key for a session.
 * @property {() => void} logout - Revokes the session locally and remotely.
 */
interface AuthContextValue {
  authenticated: boolean;
  checking: boolean;
  login: (masterKey: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  authenticated: false,
  checking: true,
  login: async () => undefined,
  logout: () => undefined,
});

/**
 * Provides dashboard session state and actions to the app tree. The JWT is
 * kept in memory only (the server also sets an HttpOnly session cookie), so
 * after a reload the session is re-validated against `/api/auth/me` — the
 * cookie authenticates that check, and a 401 means signed out.
 * @param {object} props - Component props.
 * @param {React.ReactNode} props.children - Wrapped application tree.
 * @returns {React.ReactElement} The provider element.
 */
export function AuthProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [authenticated, setAuthenticated] = useState<boolean>(Boolean(getToken()));
  const [checking, setChecking] = useState<boolean>(!getToken());

  useEffect(() => {
    if (getToken()) {
      // Bearer token already restored in memory this session; no /me needed.
      setChecking(false);
      return;
    }
    let cancelled = false;
    const telegram = (window as Window & {
      Telegram?: { WebApp?: { initData?: string; ready?: () => void; expand?: () => void } };
    }).Telegram?.WebApp;
    const launchedFromOperatorBot =
      new URLSearchParams(window.location.search).get('tg_admin') === '1';
    if (launchedFromOperatorBot && telegram) {
      telegram.ready?.();
      telegram.expand?.();
    }

    // Preserve ordinary dashboard cookie login. Only a signed, explicit
    // operator WebApp launch may exchange initData for a Studio session.
    const restoreSession = async (): Promise<void> => {
      try {
        await apiFetch('/api/auth/me');
        if (!cancelled) setAuthenticated(true);
      } catch {
        if (launchedFromOperatorBot && telegram?.initData) {
          try {
            const result = await apiFetch<{ token: string }>('/api/auth/telegram-login', {
              method: 'POST',
              headers: { 'X-Telegram-Init-Data': telegram.initData },
            });
            if (!cancelled) {
              setToken(result.token);
              setAuthenticated(true);
            }
          } catch {
            if (!cancelled) setToken(null);
          }
        } else if (!cancelled) {
          setToken(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    };
    void restoreSession();
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (masterKey: string) => {
    const result = await apiFetch<{ token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ masterKey }),
    });
    setToken(result.token);
    setAuthenticated(true);
  }, []);

  const logout = useCallback(() => {
    void apiFetch('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setToken(null);
    setAuthenticated(false);
    window.location.href = '/login';
  }, []);

  const value = useMemo(
    () => ({ authenticated, checking, login, logout }),
    [authenticated, checking, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Accesses the authentication context.
 * @returns {AuthContextValue} Session state and actions.
 */
export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
