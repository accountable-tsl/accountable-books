import type { RecurrenceFrequency } from './recurring-journal.js';

/**
 * Shape of the `recurring` key inside journal batch metadata.
 * Used when reading from API response (journal.metadata.recurring) and when
 * building the payload (payload.metadata.recurring).
 */
export type JournalMetadataRecurring = {
  enabled: boolean;
  frequency?: RecurrenceFrequency;
  nextDate?: string | null;
  autoPost?: boolean;
  endDate?: string | null;
};

/**
 * Journal batch metadata shape used by the app.
 * The API stores metadata as JSON; we use the `recurring` key for recurring
 * template state. Use this type when reading journal.metadata or building
 * payload.metadata (avoid Record<string, unknown> casts).
 */
export type JournalMetadata = {
  recurring?: JournalMetadataRecurring;
};
