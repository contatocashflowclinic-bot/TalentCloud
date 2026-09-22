import { useTenant } from '../context/TenantContext.js';
import { useAuth } from '../context/AuthContext.js';
import { screeningAccess } from '../screening.js';

/**
 * Access to the "Triagem Inteligente de Currículos" tab: same rules on the server and here (src/screening.ts), so the
 * tab never shows a button that the server would then refuse. `canView` gates the tab itself.
 */
export function useScreeningAccess() {
  const { activeTenant } = useTenant();
  const { user } = useAuth();
  const aiEnabled = activeTenant?.enabledRoutines ? activeTenant.enabledRoutines.includes('ai_evaluation') : true;
  return screeningAccess(user?.permissions ?? [], aiEnabled);
}
