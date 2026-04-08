import { useSession } from '@session';
import { Navigate } from 'react-router';

import { getWorkspaceBillingView } from '../lib/billing-visibility';

function BillingStubSection({
  title,
  description,
  detail,
}: {
  title: string;
  description: string;
  detail: string;
}) {
  return (
    <div className="flex flex-col gap-2 p-2 *:first:font-medium">
      <div>{title}</div>
      <div>{description}</div>
      <div>{detail}</div>
    </div>
  );
}

export function SettingsBillingPage() {
  const { companyId, company, companyType, tenantRoutes, user } = useSession();

  const billingView = getWorkspaceBillingView({
    companyType,
    currentCompany: user?.currentCompany,
    company,
    isPlatformUser: user?.isPlatformUser,
  });

  if (!companyId || !tenantRoutes) return null;

  if (billingView === 'hidden') {
    return <Navigate to={tenantRoutes.general.settings.hub()} replace />;
  }

  // Firm workspace: this is where the firm's own subscription controls will land.
  if (billingView === 'firm') {
    return (
      <BillingStubSection
        title="Firm billing"
        description="Subscriptions, payment methods, invoices, and firm-wide billing rollups will live here."
        detail="Wave 0 establishes the workspace entry point and access rules so the real billing summary and portal actions can land without changing navigation later."
      />
    );
  }

  // Managed client workspace: keep the route visible, but make the state read-only.
  if (billingView === 'client-managed') {
    return (
      <BillingStubSection
        title="Managed by your firm"
        description="This workspace’s billing relationship is currently managed by your accounting firm."
        detail={`Your firm${company?.assignedFirmName ? `, ${company.assignedFirmName},` : ''} handles subscription setup for this workspace. Later phases will keep this page available for billing context without exposing the firm’s internal controls.`}
      />
    );
  }

  // Self-serve client workspace: this becomes checkout, plan, invoice, and AI usage home.
  return (
    <BillingStubSection
      title="Workspace billing"
      description="This page will become the self-serve home for plan details, payment methods, invoices, and billable AI usage for this workspace."
      detail="Wave 0 puts the route and visibility model in place first. Later phases will connect checkout, subscription state, and usage-based billing without changing where people expect to find it."
    />
  );
}
