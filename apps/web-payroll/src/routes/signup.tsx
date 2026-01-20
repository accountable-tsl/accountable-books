import { Link, createFileRoute } from '@tanstack/react-router';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/signup')({
  component: RouteComponent,
})

function RouteComponent() {
  const search = Route.useSearch() as {
    intent?: string;
    runId?: string;
    returnTo?: string;
  };

  const returnTo = search.returnTo ?? '/';

  return (
    <div className="mx-auto max-w-lg p-6 space-y-4">
      <div className="space-y-1">
        <div className="text-xl font-semibold">Create an account</div>
        <div className="text-sm text-muted-foreground">
          Sync payroll runs across devices, keep history, and duplicate last month’s run in a click.
        </div>
      </div>

      {search.intent === 'sync-final-run' && search.runId && (
        <div className="rounded border bg-muted/30 p-3 text-sm">
          Ready to sync finalized run: <span className="font-mono">{search.runId}</span>
          <div className="mt-1 text-xs text-muted-foreground">
            It’s already saved on this device — syncing just makes it available everywhere.
          </div>
        </div>
      )}

      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Email</label>
        <Input placeholder="you@company.com" />
      </div>
      <div className="space-y-2">
        <label className="text-xs text-muted-foreground">Password</label>
        <Input type="password" placeholder="••••••••" />
      </div>

      <div className="flex items-center gap-2">
        <Button disabled>Create account (coming soon)</Button>
        <Link to={returnTo} className="text-sm text-muted-foreground hover:text-foreground">
          Back
        </Link>
      </div>

      <div className="text-xs text-muted-foreground">
        No pressure — you can run payroll without an account. Create one when you want sync and history.
      </div>
    </div>
  );
}
