import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Tenant,
  UserRole,
  TenantConnectionTelemetry,
  TenantRoutingResolution
} from '../types.js';
import {
  MasterApi,
  TenantApi,
  setActiveTenantSlug
} from '../services/api.js';
import { useAuth } from './AuthContext.js';

interface TenantContextValue {
  activeTenant: Tenant | null;
  /** Only populated for the SuperAdmin (organization users never see other organizations). */
  allTenants: Tenant[];
  isSuperAdmin: boolean;
  isSuperAdminMode: boolean;
  /** Real role of the signed-in user (from the server session). */
  currentRole: UserRole;
  telemetry: TenantConnectionTelemetry | null;
  routingResolution: TenantRoutingResolution | null;
  isLoading: boolean;
  error: string | null;
  switchTenant: (slug: string) => Promise<void>;
  setSuperAdminMode: (enabled: boolean) => void;
  refreshTenants: () => Promise<Tenant[]>;
  refreshContext: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.type === 'super_admin';

  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
  // Conta Mãe lands on its console from the very first render (no flash of a tenant module / tenant data fetch)
  const [isSuperAdminMode, setIsSuperAdminMode] = useState<boolean>(isSuperAdmin);
  const [telemetry, setTelemetry] = useState<TenantConnectionTelemetry | null>(null);
  const [routingResolution, setRoutingResolution] = useState<TenantRoutingResolution | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const refreshTenants = useCallback(async () => {
    if (!isSuperAdmin) return [];
    try {
      const tenants = await MasterApi.getTenants();
      setAllTenants(tenants);
      return tenants;
    } catch (err: any) {
      console.error('Failed to load tenants:', err);
      setError(err.message);
      return [];
    }
  }, [isSuperAdmin]);

  const refreshContext = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await TenantApi.getContext();
      setActiveTenant(res.tenant);
      setTelemetry(res.telemetry);
      setRoutingResolution(res.routingResolution);
    } catch (err: any) {
      console.error('Failed to refresh tenant context:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const switchTenant = useCallback(async (slug: string) => {
    if (!isSuperAdmin) return; // organization users are pinned to their own organization
    setActiveTenantSlug(slug);
    setIsSuperAdminMode(false);
    await refreshContext();
  }, [isSuperAdmin, refreshContext]);

  // Bootstrap whenever the signed-in user changes (login / logout)
  useEffect(() => {
    setActiveTenant(null);
    setAllTenants([]);
    setTelemetry(null);
    setRoutingResolution(null);
    setError(null);
    setActiveTenantSlug('');

    if (!user) {
      setIsSuperAdminMode(false);
      return;
    }
    if (user.type === 'super_admin') {
      // Conta Mãe lands on its console; a tenant's data is only opened (and audited) on demand
      setIsSuperAdminMode(true);
      refreshTenants();
      return;
    }
    setIsSuperAdminMode(false);
    refreshContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.type]);

  return (
    <TenantContext.Provider
      value={{
        activeTenant,
        allTenants,
        isSuperAdmin,
        isSuperAdminMode: isSuperAdmin && isSuperAdminMode,
        currentRole: user?.role ?? 'COLLABORATOR',
        telemetry,
        routingResolution,
        isLoading,
        error,
        switchTenant,
        setSuperAdminMode: (enabled) => {
          if (!isSuperAdmin) return;
          setIsSuperAdminMode(enabled);
          if (!enabled && !activeTenant && allTenants[0]) {
            void switchTenant(allTenants[0].slug);
          }
        },
        refreshTenants,
        refreshContext
      }}
    >
      {children}
    </TenantContext.Provider>
  );
};

export function useTenant() {
  const ctx = useContext(TenantContext);
  if (!ctx) {
    throw new Error('useTenant must be used within a TenantProvider');
  }
  return ctx;
}
