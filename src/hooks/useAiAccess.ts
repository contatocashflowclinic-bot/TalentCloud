import { useTenant } from '../context/TenantContext.js';
import { canAccessModule } from '../access.js';

/** Module of the "Avaliação Assistida por IA" routine in the sidebar. */
const AI_MODULE_ID = 9;

/**
 * Whether the organization uses the AI at all, and whether this person can open it.
 *  - `aiEnabled`: the Conta Mãe left the "Avaliação por IA" module on for the organization. When off, no AI score,
 *    card, column, tab or button is shown anywhere (the server also answers no evaluations).
 *  - `canOpenAI`: the module is on AND this person's profile allows it — the only case where "Avaliar com IA" shortcuts make sense.
 * While the organization is still loading (or its routines are unknown) the AI is treated as enabled: nothing is hidden by mistake.
 */
export function useAiAccess(): { aiEnabled: boolean; canOpenAI: boolean } {
  const { activeTenant, permissions } = useTenant();
  const aiEnabled = activeTenant?.enabledRoutines ? activeTenant.enabledRoutines.includes('ai_evaluation') : true;
  return { aiEnabled, canOpenAI: aiEnabled && canAccessModule(permissions, AI_MODULE_ID) };
}
