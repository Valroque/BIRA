// Auth state — wraps the logged-in user and exposes login/logout/updateUser.
//
// On mount: if `bira:token` exists, calls fetchProfile() to hydrate the user.
// If the token is expired (API returns 401), tokens are cleared and user stays null.
// Mounted above TenantsProvider in main.tsx so every subtree can call useAuth().

import {
  createContext, useCallback, useContext, useEffect, useState,
  type ReactNode,
} from 'react';
import {
  login as apiLogin,
  logout as apiLogout,
  fetchProfile,
  type CurrentUser,
} from '../api/auth';
import { getToken, clearTokens } from '../api/client';

export type { CurrentUser };

export interface AuthCtxValue {
  /** The currently authenticated user, or null if not signed in. */
  user: CurrentUser | null;
  /** True only during the initial token check on mount. */
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Patch the in-memory user after a profile update (optimistic). */
  updateUser: (patch: Partial<CurrentUser>) => void;
}

const AuthContext = createContext<AuthCtxValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !!getToken());

  // Hydrate user from stored token on mount.
  useEffect(() => {
    const token = getToken();
    if (!token) {
      setLoading(false);
      return;
    }
    fetchProfile()
      .then((u) => setUser(u))
      .catch(() => {
        clearTokens();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const u = await apiLogin(email, password);
    setUser(u);
  }, []);

  const logout = useCallback(() => {
    apiLogout();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<CurrentUser>) => {
    setUser((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value: AuthCtxValue = { user, loading, login, logout, updateUser };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthCtxValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
