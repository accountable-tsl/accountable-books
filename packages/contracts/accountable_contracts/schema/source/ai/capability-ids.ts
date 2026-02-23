/**
 * Allowed AI capability IDs. Single source of truth for the API and web.
 * When adding a new capability: add the id here, then add the full entry in the API registry.
 */
export const AI_CAPABILITY_IDS = [
  'journals.from_text.v1',
  'journals.generate_memo.v1',
  'journals.dev_sample.v1',
  'categorization.interpret_command.v1',
  'categorization.clean_description.v1',
  'categorization.explain.v1',
  'categorization.dev_sample.v1',
  'reporting.explain.v1',
  'reporting.dev_sample.v1',
] as const;

export type AiCapabilityId = (typeof AI_CAPABILITY_IDS)[number];
