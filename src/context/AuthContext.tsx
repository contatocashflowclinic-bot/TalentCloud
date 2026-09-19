import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { AuthUser } from '../types.js';
import { AuthApi, SESSION_EXPIRED_EVENT, getAuthToken, setActiveTenantSlug, setAuthToken } from '../services/api.js';

interface AuthContextValue {
  user: AuthUser | null;
  /** false while the stored session is being validated on first load */
  isReady: boolean;
  login: (email: string, password: string, tenantSlug?: string) => Promise<void>;
  logout: () => Promise<void>;
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
      setActiveTenantSlug('');
      setUser(null);
    };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
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
    setActiveTenantSlug('');
    setUser(null);
  }, []);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    await AuthApi.changePassword(currentPassword, newPassword);
    setUser(await AuthApi.me());
  }, []);

  return (
    <AuthContext.Provider value={{ user, isReady, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider');
  return ctx;
}
