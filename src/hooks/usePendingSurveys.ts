import { useEffect, useState } from 'react';
import { TenantApi } from '../services/api.js';
import { CLIMATE_ANSWERED_EVENT } from '../utils/retentionUtils.js';

/** Both the home banner and the menu badge ask the same question: one request serves them within a moment. */
let shared: { tenantId: string; at: number; request: Promise<number> } | null = null;
const SHARE_MS = 3000;

function pendingCount(tenantId: string): Promise<number> {
  if (shared && shared.tenantId === tenantId && Date.now() - shared.at < SHARE_MS) return shared.request;
  const request = TenantApi.getPendingSurveys().then(list => list.filter(s => !s.answered).length).catch(() => 0);
  shared = { tenantId, at: Date.now(), request };
  return request;
}

/** How many open climate surveys the signed-in person has not answered yet (0 when they cannot answer any). */
export function usePendingSurveyCount(tenantId: string | undefined, enabled: boolean): number {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled || !tenantId) {
      setCount(0);
      return;
    }
    let alive = true;
    const load = () => { void pendingCount(tenantId).then(n => { if (alive) setCount(n); }); };
    const refresh = () => { shared = null; load(); };
    load();
    window.addEventListener(CLIMATE_ANSWERED_EVENT, refresh);
    return () => {
      alive = false;
      window.removeEventListener(CLIMATE_ANSWERED_EVENT, refresh);
    };
  }, [tenantId, enabled]);

  return count;
}
