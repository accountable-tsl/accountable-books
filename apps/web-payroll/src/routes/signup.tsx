import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { createFileRoute, Link } from '@tanstack/react-router';

export const Route = createFileRoute('/signup')({
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch() as {
    intent?: string;
    runId?: string;
    returnTo?: string;
  };

  const returnTo = search.returnTo ?? '/';

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <div className="space-y-1">
        <div className="text-xl font-semibold">Create an account</div>
        <div className="text-muted-foreground text-sm">
          Sync payroll runs across devices, keep history, and duplicate last
          month’s run in a click.
        </div>
      </div>

      {search.intent === 'sync-final-run' && search.runId && (
        <div className="bg-muted/30 rounded border p-3 text-sm">
          Ready to sync finalized run:{' '}
          <span className="font-mono">{search.runId}</span>
          <div className="text-muted-foreground mt-1 text-xs">
            It’s already saved on this device — syncing just makes it available
            everywhere.
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-muted-foreground text-xs">Email</label>
        <Input placeholder="you@company.com" />
      </div>
      <div className="space-y-2">
        <label className="text-muted-foreground text-xs">Password</label>
        <Input type="password" placeholder="••••••••" />
      </div>

      <div className="flex items-center gap-2">
        <Button disabled>Create account (coming soon)</Button>
        <Link
          to={returnTo}
          className="text-muted-foreground hover:text-foreground text-sm"
        >
          Back
        </Link>
      </div>

      <div className="text-muted-foreground text-xs">
        No pressure — you can run payroll without an account. Create one when
        you want sync and history.
      </div>
    </div>
  );
}
