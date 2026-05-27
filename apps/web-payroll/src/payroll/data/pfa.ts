export const PFAS = [
  {
    key: 'aiico',
    label: 'AIICO',
    code: '033',
    name: 'AIICO PENSION MANAGERS LIMITED',
  },
  {
    key: 'apt',
    label: 'APT',
    code: '037',
    name: 'APT PENSION FUND MANAGERS LIMTED',
  },
  {
    key: 'arm',
    label: 'ARM',
    code: '026',
    name: 'ARM PENSION MANAGERS LIMITED',
  },
  {
    key: 'crusader',
    label: 'Crusader',
    code: '032',
    name: 'CRUSADER STERLING PENSIONS LIMITED',
  },
  { key: 'fcmb', label: 'Fcmb', code: '030', name: 'FCMB PENSIONS LIMITED' },
  {
    key: 'fidelity',
    label: 'Fidelity',
    code: '043',
    name: 'FIDELITY PENSION MANAGERS',
  },
  {
    key: 'first_guarantee',
    label: 'First Guarantee',
    code: '029',
    name: 'FIRST GUARANTEE PENSION LIMITED',
  },
  {
    key: 'iei',
    label: 'IEI',
    code: '036',
    name: 'IEI-ANCHOR PENSION MANAGERS LIMITED',
  },
  {
    key: 'gt',
    label: 'GT',
    code: '040',
    name: 'GUARANTY TRUST PENSION MANAGERS',
  },
  {
    key: 'leadway',
    label: 'Leadway',
    code: '023',
    name: 'LEADWAY PENSURE PFA LIMITED',
  },
  {
    key: 'nlpc',
    label: 'NLPC',
    code: '031',
    name: 'NLPC PENSION FUND ADMINISTRATORS LIMITED',
  },
  { key: 'npf', label: 'NPF', code: '047', name: 'NPF PENSIONS LIMITED' },
  {
    key: 'nupemco',
    label: 'NUPEMCO',
    code: '049',
    name: 'NIGERIAN UNIVERSITY PENSION MANAGEMENT COMPANY(NUPEMCO)',
  },
  { key: 'oak', label: 'Oak', code: '034', name: 'OAK PENSIONS LIMITED' },
  { key: 'pal', label: 'Pal', code: '025', name: 'PENSIONS ALLIANCE LIMITED' },
  {
    key: 'premium',
    label: 'Premium',
    code: '022',
    name: 'PREMIUM PENSION LIMITED',
  },
  {
    key: 'radix',
    label: 'Radix',
    code: '046',
    name: 'RADIX PENSION MANAGERS LIMITED',
  },
  { key: 'sigma', label: 'Sigma', code: '024', name: 'SIGMA PENSIONS LIMITED' },
  {
    key: 'stanbic',
    label: 'Stanbic',
    code: '021',
    name: 'STANBIC IBTC PENSION MANAGERS LIMITED',
  },
  {
    key: 'tangerine',
    label: 'Tangerine',
    code: '035',
    name: 'TANGERINE PENSIONS LIMITED',
  },
  {
    key: 'trustfund',
    label: 'Trustfund',
    code: '028',
    name: 'TRUSTFUND PENSIONS LIMITED',
  },
  {
    key: 'veritas',
    label: 'Veritas',
    code: '042',
    name: 'VERITAS GLANVILLS PENSIONS LIMITED',
  },
] as const;

export type PfaKey = (typeof PFAS)[number]['key'];
export type PfaName = (typeof PFAS)[number]['name'];
export type Pfa = (typeof PFAS)[number];

/**
 * Get all valid PFA keys as a tuple for Zod enum validation.
 * This ensures compile-time and runtime type safety.
 * We store by key (stable identifier) rather than name (can change).
 */
export const PFA_KEYS = PFAS.map((pfa) => pfa.key) as [PfaKey, ...PfaKey[]];

/**
 * Map for key lookups
 */
const PFA_BY_KEY = new Map<PfaKey, Pfa>(PFAS.map((pfa) => [pfa.key, pfa]));

/**
 * Get a PFA by its key (keys are stable identifiers).
 * Uses Map lookup for O(1) performance.
 */
export function getPfaByKey(key: string): Pfa | undefined {
  return PFA_BY_KEY.get(key as PfaKey);
}
