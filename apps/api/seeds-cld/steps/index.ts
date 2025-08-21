import type { SeedStep } from '../utils/types.js';
import { companiesStep } from './companies.js';
import { bankAccountsStep } from './bank-accounts.js';
import { contactsStep } from './contacts.js';
import { projectsStep } from './projects.js';
import { transactionsStep } from './transactions.js';
import { journalsStep } from './journals.js';

// All available seed steps
export const allSteps: SeedStep[] = [
  companiesStep,
  bankAccountsStep,
  contactsStep,
  projectsStep,
  transactionsStep,
  journalsStep,
];

// Step registry for easy lookup
export const stepRegistry = new Map(allSteps.map((step) => [step.id, step]));

// Get steps by IDs with dependency resolution
export function getSteps(stepIds?: string[]): SeedStep[] {
  if (!stepIds || stepIds.length === 0) {
    return allSteps;
  }

  const requestedSteps = stepIds
    .map((id) => stepRegistry.get(id))
    .filter((step): step is SeedStep => step !== undefined);

  if (requestedSteps.length !== stepIds.length) {
    const missing = stepIds.filter((id) => !stepRegistry.has(id));
    throw new Error(`Unknown step(s): ${missing.join(', ')}`);
  }

  return requestedSteps;
}

// Validate step dependencies exist
export function validateStepDependencies(steps: SeedStep[]): void {
  const stepIds = new Set(steps.map((s) => s.id));

  for (const step of steps) {
    for (const dep of step.dependencies) {
      if (!stepIds.has(dep)) {
        throw new Error(`Step '${step.id}' requires dependency '${dep}' which is not included`);
      }
    }
  }
}

export * from './companies.js';
export * from './bank-accounts.js';
export * from './contacts.js';
export * from './projects.js';
export * from './transactions.js';
export * from './journals.js';
