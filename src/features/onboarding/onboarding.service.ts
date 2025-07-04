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
  const isCompanyOwner = await isUserCompanyOwner({
    userId: user?.id,
    companyId: company?.id,
  });

  console.log("user", user.onboardingState, "company", company.onboardingState);

  const isBypassed =
    user.isPlatformUser || company?.isDemoCompany || company?.isPlatformCompany;
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

  // Collect all explicitly assigned step keys from onboarding state
  const assignedUserStepKeys = Object.keys(user.onboardingState?.steps || {});
  const assignedCompanyStepKeys = Object.keys(
    company.onboardingState?.steps || {}
  );

  const assignedStepKeys = new Set([
    ...assignedUserStepKeys,
    ...assignedCompanyStepKeys,
  ]);

  // Build a map of step metadata for assigned steps
  const assignedStepsWithMeta = onboardingStepConfig
    .filter((step) => assignedStepKeys.has(step.key)) // Only use assigned steps
    .filter((step) => step.restrictedTo !== "company_owner" || isCompanyOwner) // If the step is restricted to company owners, only use it if the user is a company owner
    .map((step) => {
      const complete = step.isComplete({ user, company });
      return {
        key: step.key,
        label: step.label,
        scope: step.scope,
        complete,
        optional: !!step.optional,
        orderIndex: step.orderIndex ?? 999,
        dependsOn: step.dependsOn ?? [],
      };
    });

  // Compute which steps are blocked by incomplete dependencies
  const stepStatusMap = new Map<string, { complete: boolean }>();
  for (const step of assignedStepsWithMeta) {
    stepStatusMap.set(step.key, { complete: step.complete });
  }

  const evaluatedSteps = assignedStepsWithMeta.map((step) => {
    const blocked = step.dependsOn.some((depKey) => {
      const dep = stepStatusMap.get(depKey);
      return dep ? !dep.complete : false; // If dep is not assigned, do NOT block
    });

    return {
      ...step,
      blocked,
    };
  });

  // ort steps in display order
  const orderedSteps = evaluatedSteps.sort(
    (a, b) => a.orderIndex - b.orderIndex
  );

  // Determine next step (first incomplete + unblocked)
  const nextStep =
    orderedSteps.find((s) => !s.complete && !s.blocked)?.key ?? null;

  // Determine if all assigned steps are complete (excluding optional)
  const userStepsComplete = orderedSteps.every((s) => s.complete || s.optional);

  // Evaluate company-wide step completion independently (ignores assignment)
  const allCompanySteps = onboardingStepConfig.filter(
    (step) => step.scope === "company"
  );
  const companyStepsComplete = allCompanySteps.every((step) =>
    step.isComplete({ user, company })
  );

  // Determine app access:
  // - Company owners: need to complete all their available required steps
  // - Company members: need their steps complete AND company onboarding complete
  const canAccessApp = isCompanyOwner
    ? userStepsComplete
    : userStepsComplete && companyStepsComplete;

  console.log({
    orderedSteps,
    a: orderedSteps[1].dependsOn,
    nextStep,
  });

  return {
    isCompanyOwner,
    canAccessApp,
    userStepsComplete,
    nextStepToComplete: nextStep,
    steps: orderedSteps,
  };
}
