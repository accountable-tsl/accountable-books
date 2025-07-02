import { isUserCompanyOwner } from "../../domains/userRoles/userRoles.model";
import {
  OnboardingCompanyObj,
  OnboardingStateResult,
  OnboardingStepConfig,
  OnboardingStepKey,
  OnboardingUserObj,
} from "./onboarding.types";
import { onboardingStepConfig } from "./onboarding.utils";

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
  // This affects which onboarding steps they can see and complete
  const isCompanyOwner = await isUserCompanyOwner({
    userId: user?.id,
    companyId: company?.id,
  });

  if (
    user.isPlatformUser ||
    company?.isDemoCompany ||
    company?.isPlatformCompany
  ) {
    return {
      isCompanyOwner,
      canAccessApp: true,
      userStepsComplete: true,
      nextStepToComplete: null,
      steps: [],
    };
  }

  // Filter onboarding steps to only include those available to this user
  // Some steps are restricted to company owners only
  const availableSteps = onboardingStepConfig.filter((step) => {
    if (step.restrictedTo === "company_owner" && !isCompanyOwner) {
      return false;
    }
    return step.isAvailable?.({ user, company, isCompanyOwner }) ?? true;
  });

  // Pre-compute completion status for all steps
  const stepStatusMap = new Map<
    OnboardingStepKey,
    { complete: boolean; step: OnboardingStepConfig }
  >();
  for (const step of availableSteps) {
    const complete = step.isComplete({ user, company });
    stepStatusMap.set(step.key, { complete, step });
  }

  // Process each available step to determine its current status
  const results = Array.from(stepStatusMap.entries())
    .map(([key, { complete, step }]) => {
      // A step is blocked if any of its dependencies are incomplete
      // We only check dependencies that are also available to this user
      const isBlocked = (step.dependsOn || []).some((depKey) => {
        const dep = stepStatusMap.get(depKey);

        // If dependency exists in available steps, check if it's complete
        // If dependency doesn't exist (filtered out), consider it blocking
        return dep ? !dep.complete : true;
      });

      return {
        key,
        label: step.label,
        scope: step.scope,
        complete,
        blocked: isBlocked,
        optional: !!step.optional,
        orderIndex: step.orderIndex ?? 999,
      };
    })
    // Sort steps by their defined order to ensure consistent presentation
    .sort((a, b) => a.orderIndex - b.orderIndex);

  // Find the next step the user should complete
  // This is the first incomplete, non-blocked step in order
  const nextIncompleteStep = results.find(
    (step) => !step.complete && !step.blocked
  );
  const nextStep = nextIncompleteStep ? nextIncompleteStep.key : null;

  // Determine if all steps visible to this user is complete
  const userStepsComplete = results.every((s) => s.complete || s.optional);

  // Check if all company steps are complete (regardless of user role)
  const companySteps = onboardingStepConfig.filter(
    (step) => step.scope === "company"
  );
  const companyStepsComplete = companySteps.every((step) =>
    step.isComplete({ user, company })
  );

  // Determine app access:
  // - Company owners: need to complete all their available required steps
  // - Company members: need their steps complete AND company onboarding complete
  const canAccessApp = isCompanyOwner
    ? userStepsComplete
    : userStepsComplete && companyStepsComplete;

  return {
    isCompanyOwner,
    canAccessApp,
    userStepsComplete,
    nextStepToComplete: nextStep,
    steps: results,
  };
}
