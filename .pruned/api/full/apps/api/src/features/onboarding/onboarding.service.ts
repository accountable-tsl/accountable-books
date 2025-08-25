import { isUserCompanyOwner } from '../../domains/userRoles/userRoles.model.js';
import {
  type OnboardingCompanyObj,
  type OnboardingStateResult,
  type OnboardingUserObj,
} from './onboarding.types.js';
import { onboardingStepConfig } from './onboarding.utils.js';

/**
 * Gets the onboarding state for a user in a company
 *
 * This provides information about which onboarding steps are available to the user,
 * whether they've been completed, and whether they're blocked or optional.
 *
 * It also provides information about the user's access to the app: whether they
 * can access the app, and which step they should complete next.
 *
 * @param user The user object, containing the user's ID
 * @param company The company object, containing the company's ID
 *
 * @returns An object containing the onboarding state
 */
export async function getOnboardingState({
  user,
  company,
}: {
  user: OnboardingUserObj;
  company: OnboardingCompanyObj;
}): Promise<OnboardingStateResult> {
  // Determine if the current user is a company owner
  const isCompanyOwner = await isUserCompanyOwner({
    userId: user?.id,
    companyId: company?.id,
  });

  const isBypassed = user.isPlatformUser || company?.isDemoCompany || company?.isPlatformCompany;
  // Early exit for platform users and demo/platform companies
  if (isBypassed) {
    return {
      isCompanyOwner,
      canAccessApp: true,
      userStepsComplete: true,
      nextStepToComplete: null,
      steps: [],
    };
  }

  // Get assigned step keys from onboarding state
  const assignedUserStepKeys = Object.keys(user.onboardingState?.steps || {});
  const assignedCompanyStepKeys = Object.keys(company.onboardingState?.steps || {});

  const assignedStepKeys = new Set([...assignedUserStepKeys, ...assignedCompanyStepKeys]);

  // Pull metadata from config only for assigned steps and filter by role
  const assignedStepsWithMeta = onboardingStepConfig
    .filter((step) => assignedStepKeys.has(step.key)) // Only use assigned steps
    .filter((step) => step.restrictedTo !== 'company_owner' || isCompanyOwner) // If the step is restricted to company owners, only use it if the user is a company owner
    .map((step) => {
      const complete = step.isComplete({ user, company });
      return {
        key: step.key,
        label: step.label,
        scope: step.scope,
        complete,
        optional: !!step.optional,
        orderIndex: step.orderIndex ?? 999,
      };
    });

  // Sort steps in display order
  const orderedSteps = assignedStepsWithMeta.sort((a, b) => a.orderIndex - b.orderIndex);

  // Compute which steps are blocked
  const evaluatedSteps = orderedSteps.map((currentStep, i, allSteps) => {
    const isBlocked = allSteps
      .slice(0, i)
      .some((priorStep) => !priorStep.optional && !priorStep.complete);

    return {
      ...currentStep,
      blocked: isBlocked,
    };
  });

  // Determine next step (first incomplete + unblocked)
  const nextStepToComplete =
    evaluatedSteps.find((step) => !step.complete && !step.blocked)?.key ?? null;

  // Are all required assigned steps complete?
  const userStepsComplete = evaluatedSteps.every((step) => step.complete || step.optional);

  // Check company-wide onboarding steps (ignores assignment)
  const allCompanySteps = onboardingStepConfig.filter((step) => step.scope === 'company');
  const companyStepsComplete = allCompanySteps.every((step) => step.isComplete({ user, company }));

  // Determine if user can access the company/app:
  // - Company owners: need to complete all their available required steps
  // - Company members: need their steps complete AND company onboarding complete
  const canAccessApp = isCompanyOwner
    ? userStepsComplete
    : userStepsComplete && companyStepsComplete;

  return {
    isCompanyOwner,
    canAccessApp,
    userStepsComplete,
    nextStepToComplete,
    steps: evaluatedSteps,
  };
}
