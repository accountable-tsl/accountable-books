import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { routes } from '@/shared/routes';
import { useSession } from '@session';
import { CreditCard, Landmark, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router';

import { getWorkspaceBillingView } from '../lib/billing-visibility';

function BillingStubCard({
  title,
  description,
  detail,
  icon: Icon,
}: {
  title: string;
  description: string;
  detail: string;
  icon: typeof CreditCard;
}) {
  return (
    <Card>
      <CardHeader className="space-y-3">
        <div className="bg-muted flex size-10 items-center justify-center rounded-lg border">
          <Icon className="text-foreground/80 size-5" />
        </div>
        <div className="space-y-1">
          <CardTitle>{title}</CardTitle>
          <p className="text-muted-foreground text-sm leading-6">
            {description}
          </p>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm leading-6">{detail}</p>
      </CardContent>
    </Card>
  );
}

export function SettingsBillingPage() {
  const { companyId, company, companyType, user } = useSession();

  const billingView = getWorkspaceBillingView({
    companyType,
    currentCompany: user?.currentCompany,
    company,
    isPlatformUser: user?.isPlatformUser,
  });

  if (!companyId) return null;

  if (billingView === 'hidden') {
    return (
      <Navigate to={routes.general.settings.hub.build({ companyId })} replace />
    );
  }

  if (billingView === 'firm') {
    return (
      <BillingStubCard
        title="Firm billing"
        description="Subscriptions, payment methods, invoices, and firm-wide billing rollups will live here."
        detail="Wave 0 establishes the workspace entry point and access rules so the real billing summary and portal actions can land without changing navigation later."
        icon={Landmark}
      />
    );
  }

  if (billingView === 'client-managed') {
    return (
      <BillingStubCard
        title="Managed by your firm"
        description="This workspace’s billing relationship is currently managed by your accounting firm."
        detail={`Your firm${company?.assignedFirmName ? `, ${company.assignedFirmName},` : ''} handles subscription setup for this workspace. Later phases will keep this page available for billing context without exposing the firm’s internal controls.`}
        icon={ShieldCheck}
      />
    );
  }

  return (
    <BillingStubCard
      title="Workspace billing"
      description="This page will become the self-serve home for plan details, payment methods, invoices, and billable AI usage for this workspace."
      detail="Wave 0 puts the route and visibility model in place first. Later phases will connect checkout, subscription state, and usage-based billing without changing where people expect to find it."
      icon={CreditCard}
    />
  );
}
