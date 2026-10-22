import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { api, clearAdminToken } from '../lib/api';
import type { AuthMe, SiteConfig } from '../types';

const defaultConfig: SiteConfig = {
  siteName: 'Lensa',
  timezone: 'Asia/Jakarta',
  sessionDurationMinutes: 15,
  version: '1.0.0',
};

interface SiteContextValue {
  config: SiteConfig;
  loaded: boolean;
}

const SiteContext = createContext<SiteContextValue>({ config: defaultConfig, loaded: false });

export function SiteProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState(defaultConfig);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let alive = true;
    api
      .getConfig()
      .then((value) => {
        if (!alive) return;
        setConfig({ ...defaultConfig, ...value });
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setLoaded(true);
      });
    return () => {
      alive = false;
    };
  }, []);

  const value = useMemo(() => ({ config, loaded }), [config, loaded]);
  return <SiteContext.Provider value={value}>{children}</SiteContext.Provider>;
}

export function useSite() {
  return useContext(SiteContext);
}

interface AuthContextValue {
  auth: AuthMe;
  loading: boolean;
  login: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  setAuthenticated: (value: boolean) => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthMe>({
    authenticated: false,
    configured: true,
    siteName: 'Lensa',
  });
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const value = await api.me();
      if (!value.authenticated) clearAdminToken();
      setAuth(value);
    } catch {
      clearAdminToken();
      setAuth((current) => ({ ...current, authenticated: false }));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const onUnauthorized = () => {
      clearAdminToken();
      setAuth((current) => ({ ...current, authenticated: false }));
    };
    window.addEventListener('lensa:unauthorized', onUnauthorized);
    return () => window.removeEventListener('lensa:unauthorized', onUnauthorized);
  }, []);

  const login = useCallback(async (password: string) => {
    await api.login(password);
    const value = await api.me();
    if (!value.authenticated) clearAdminToken();
    setAuth(value);
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      clearAdminToken();
      setAuth((current) => ({ ...current, authenticated: false }));
    }
  }, []);

  const setAuthenticated = useCallback((value: boolean) => {
    setAuth((current) => ({ ...current, authenticated: value }));
  }, []);

  const context = useMemo(
    () => ({ auth, loading, login, logout, refresh, setAuthenticated }),
    [auth, loading, login, logout, refresh, setAuthenticated],
  );

  return <AuthContext.Provider value={context}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth harus dipakai di dalam AuthProvider');
  return context;
}
