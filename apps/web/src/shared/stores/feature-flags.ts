import { create } from 'zustand';

/**
 * Lightweight feature-flag store (Zustand).
 *
 * For AI-specific flags, use `aiRuntimeStore.policy` instead — it already
 * handles `VITE_AI_ENABLED`, domain allow/deny lists, and capability-level
 * gating.  This store is for *non-AI* product features that may be behind
 * a paywall or gradual roll-out.
 *
 * Usage:
 *   const hasMultiCurrency = featureFlagStore(s => s.flags['multi-currency']);
 *
 * Hydration (e.g. after fetching subscription):
 *   featureFlagStore.getState().setFlags({ 'multi-currency': true });
 */

export type FeatureKey =
  | 'multi-currency'
  | 'recurring-journals'
  | 'audit-trail'
  | 'advanced-reports'
  // add more as needed
  | (string & {}); // allows arbitrary keys without losing autocomplete

interface FeatureFlagState {
  /** Current flag values.  `true` = enabled. Missing key = disabled. */
  flags: Record<FeatureKey, boolean>;
  /** Merge new flag values (partial update). */
  setFlags: (patch: Partial<Record<FeatureKey, boolean>>) => void;
  /** Check a single flag. Returns `false` for unknown keys. */
  isEnabled: (key: FeatureKey) => boolean;
}

export const featureFlagStore = create<FeatureFlagState>()((set, get) => ({
  flags: {
    // Defaults — override at runtime via setFlags()
  } as Record<FeatureKey, boolean>,

  setFlags: (patch) =>
    set((state) => ({
      flags: { ...state.flags, ...patch } as Record<FeatureKey, boolean>,
    })),

  isEnabled: (key) => get().flags[key] ?? false,
}));
