export const NIGERIAN_STATES = [
  'Abuja',
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
  'Ebonyi',
  'Edo',
  'Ekiti',
  'Enugu',
  'Gombe',
  'Imo',
  'Jigawa',
  'Kaduna',
  'Kano',
  'Katsina',
  'Kebbi',
  'Kogi',
  'Kwara',
  'Lagos',
  'Nassarawa',
  'Niger',
  'Ogun',
  'Ondo',
  'Osun',
  'Oyo',
  'Plateau',
  'Rivers',
  'Sokoto',
  'Taraba',
  'Yobe',
  'Zamfara',
] as const;

export const NIGERIAN_STATES_WITH_CODES = [
  { code: 'FC', value: 'Abuja' },
  { code: 'AB', value: 'Abia' },
  { code: 'AD', value: 'Adamawa' },
  { code: 'AK', value: 'Akwa Ibom' },
  { code: 'AN', value: 'Anambra' },
  { code: 'BA', value: 'Bauchi' },
  { code: 'BY', value: 'Bayelsa' },
  { code: 'BE', value: 'Benue' },
  { code: 'BO', value: 'Borno' },
  { code: 'CR', value: 'Cross River' },
  { code: 'DE', value: 'Delta' },
  { code: 'EB', value: 'Ebonyi' },
  { code: 'ED', value: 'Edo' },
  { code: 'EK', value: 'Ekiti' },
  { code: 'EN', value: 'Enugu' },
  { code: 'GO', value: 'Gombe' },
  { code: 'IM', value: 'Imo' },
  { code: 'JI', value: 'Jigawa' },
  { code: 'KD', value: 'Kaduna' },
  { code: 'KN', value: 'Kano' },
  { code: 'KT', value: 'Katsina' },
  { code: 'KE', value: 'Kebbi' },
  { code: 'KO', value: 'Kogi' },
  { code: 'KW', value: 'Kwara' },
  { code: 'LA', value: 'Lagos' },
  { code: 'NA', value: 'Nassarawa' },
  { code: 'NI', value: 'Niger' },
  { code: 'OG', value: 'Ogun' },
  { code: 'ON', value: 'Ondo' },
  { code: 'OS', value: 'Osun' },
  { code: 'OY', value: 'Oyo' },
  { code: 'PL', value: 'Plateau' },
  { code: 'RI', value: 'Rivers' },
  { code: 'SO', value: 'Sokoto' },
  { code: 'TA', value: 'Taraba' },
  { code: 'YO', value: 'Yobe' },
  { code: 'ZA', value: 'Zamfara' },
] as const satisfies {
  code: string;
  value: (typeof NIGERIAN_STATES)[number];
}[];

/** Type-safe state value (e.g., 'Lagos', 'Abuja', 'Kano') */
export type StateValue = (typeof NIGERIAN_STATES)[number];

/** Helper to get a state by value */
export function getStateByValue(
  value: string,
): (typeof NIGERIAN_STATES_WITH_CODES)[number] | undefined {
  return NIGERIAN_STATES_WITH_CODES.find((state) => state.value === value);
}

/** Helper to get Lagos state (commonly used default) */
export function getLagosState(): (typeof NIGERIAN_STATES_WITH_CODES)[number] {
  return NIGERIAN_STATES_WITH_CODES.find((state) => state.value === 'Lagos')!;
}
