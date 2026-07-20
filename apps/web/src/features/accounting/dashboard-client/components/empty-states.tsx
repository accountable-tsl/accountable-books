import { Button } from '@/components/ui/button';
import { useSession } from '@session';
import { Ellipsis, Landmark } from 'lucide-react';
import { useNavigate } from 'react-router';

export function EmptyStateUnlinkedBank() {
  const navigate = useNavigate();
  const { tenantRoutes } = useSession();

  return (
    <div className="border-border/50 bg-background relative flex min-h-165 flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border p-12 text-center shadow-sm">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:32px_32px]"></div>
      <div className="bg-primary/5 pointer-events-none absolute top-1/2 left-1/2 size-200 -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"></div>

      <div className="relative z-10 flex max-w-lg flex-col items-center">
        <div className="border-border/80 bg-background/50 relative mb-8 flex size-20 items-center justify-center rounded-2xl border shadow-xl backdrop-blur-md">
          <div className="from-primary/20 absolute inset-0 rounded-2xl bg-linear-to-tr via-transparent to-transparent opacity-50"></div>
          <Landmark className="text-primary relative z-10 size-8" />
        </div>
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          Connect your bank account
        </h2>
        <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
          Link your bank accounts to get started. We'll automatically categorize
          your transactions and calculate your real-time tax readiness.
        </p>
        <Button
          className="mt-8 cursor-pointer font-normal"
          variant="default"
          onClick={() => {
            if (!tenantRoutes) return;
            navigate(tenantRoutes.banking.connect());
          }}
        >
          Link a bank account
        </Button>
      </div>
    </div>
  );
}

export function EmptyStateSyncing() {
  const navigate = useNavigate();
  const { tenantRoutes } = useSession();

  return (
    <div className="border-border/50 bg-background relative flex min-h-165 flex-1 flex-col items-center justify-center overflow-hidden rounded-xl border p-12 text-center shadow-sm">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#8080800a_1px,transparent_1px),linear-gradient(to_bottom,#8080800a_1px,transparent_1px)] bg-[size:16px_16px]"></div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center">
        <div className="border-border/50 bg-muted/30 relative mb-8 flex size-16 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm">
          <Ellipsis className="text-primary/50 size-8 animate-pulse" />
        </div>
        <h2 className="text-foreground text-xl font-semibold tracking-tight">
          Preparing your dashboard
        </h2>
        <p className="text-muted-foreground mt-3 mb-10 text-sm leading-relaxed">
          We've securely connected to your institution. We are currently
          fetching and categorizing your transaction history. This usually takes
          a few minutes.
        </p>

        <div className="flex w-full flex-col gap-3 sm:flex-row">
          <Button
            variant="outline"
            className="flex-1 cursor-pointer font-normal"
            onClick={() => {
              if (!tenantRoutes) return;
              navigate(tenantRoutes.banking.connect());
            }}
          >
            Link another bank
          </Button>
          <Button
            variant="secondary"
            className="flex-1 cursor-pointer font-normal"
          >
            View Demo Company
          </Button>
        </div>
      </div>
    </div>
  );
}
