import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import {
  Tenant,
  TenantConnectionTelemetry,
  TenantRoutingResolution
} from '../types.js';
import {
  MasterApi,
  TenantApi
} from '../services/api.js';
import { useAuth } from './AuthContext.js';

interface TenantContextValue {
  activeTenant: Tenant | null;
  /** Only populated for the SuperAdmin (organization users never see other organizations). */
  allTenants: Tenant[];
  isSuperAdmin: boolean;
  /** Effective permissions of the signed-in user in the active organization (from the server session). */
  permissions: string[];
  /** Access profile name shown next to the user. */
  profileLabel: string;
  can: (permission: string) => boolean;
  telemetry: TenantConnectionTelemetry | null;
  routingResolution: TenantRoutingResolution | null;
  isLoading: boolean;
  error: string | null;
  refreshTenants: () => Promise<Tenant[]>;
  refreshContext: () => Promise<void>;
}

const TenantContext = createContext<TenantContextValue | undefined>(undefined);

export const TenantProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user } = useAuth();
  const isSuperAdmin = user?.type === 'super_admin';

  const [allTenants, setAllTenants] = useState<Tenant[]>([]);
  const [activeTenant, setActiveTenant] = useState<Tenant | null>(null);
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

  // Bootstrap whenever the signed-in user changes (login / logout)
  useEffect(() => {
    setActiveTenant(null);
    setAllTenants([]);
    setTelemetry(null);
    setRoutingResolution(null);
    setError(null);

    if (!user) return;
    if (user.type === 'super_admin') {
      // Platform environment: only the organization catalog is loaded; no organization data is opened
      refreshTenants();
      return;
    }
    refreshContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.type, user?.tenantId]);

  return (
    <TenantContext.Provider
      value={{
        activeTenant,
        allTenants,
        isSuperAdmin,
        permissions: user?.permissions ?? [],
        profileLabel: isSuperAdmin ? 'SuperAdmin (Conta Mãe)' : user?.profileName ?? '',
        can: (permission: string) => isSuperAdmin || (user?.permissions ?? []).includes(permission),
        telemetry,
        routingResolution,
        isLoading,
        error,
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
