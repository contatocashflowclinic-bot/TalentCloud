import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser } from '../types.js';
import { AuthApi, PERMISSION_DENIED_EVENT, SESSION_EXPIRED_EVENT, getAuthToken, setAuthToken } from '../services/api.js';

interface AuthContextValue {
  user: AuthUser | null;
  /** false while the stored session is being validated on first load */
  isReady: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Moves the session to another organization the person is linked to. */
  switchOrganization: (tenantId: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isReady, setIsReady] = useState<boolean>(!getAuthToken());

  // Validate a stored session on first load
  useEffect(() => {
    if (!getAuthToken()) return;
    AuthApi.me()
      .then(setUser)
      .catch(() => setAuthToken(null))
      .finally(() => setIsReady(true));
  }, []);

  // Server rejected the token (expired / revoked / user disabled)
  useEffect(() => {
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, []);

  // Permissions can change on the server at any time (profile edited, exception granted): re-read them when the
  // tab regains focus and after any permission denial, so menus and buttons never stay stale.
  useEffect(() => {
    let last = 0;
    const refresh = () => {
      if (!getAuthToken() || Date.now() - last < 5000) return;
      last = Date.now();
      AuthApi.me()
        .then(fresh => setUser(prev => (prev && JSON.stringify(prev) === JSON.stringify(fresh) ? prev : fresh)))
        .catch(() => undefined);
    };
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener(PERMISSION_DENIED_EVENT, refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener(PERMISSION_DENIED_EVENT, refresh);
    };
  }, []);

  const login = useCallback(async (email: string, password: string, tenantSlug?: string) => {
    const res = await AuthApi.login(email, password, tenantSlug);
    setAuthToken(res.token);
    setUser(res.user);
  }, []);

  const logout = useCallback(async () => {
    try {
      await AuthApi.logout();
    } catch {
      // token may already be invalid; local sign-out proceeds regardless
    }
    setAuthToken(null);
    setUser(null);
  }, []);

  const switchOrganization = useCallback(async (tenantId: string) => {
    setUser(await AuthApi.switchOrganization(tenantId));
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await AuthApi.changePassword(currentPassword, newPassword);
    setUser(await AuthApi.me());
  }, []);

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, switchOrganization, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
