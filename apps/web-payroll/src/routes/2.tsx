import { Payroll2App } from '@/payroll2/ui/payroll2-app';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/2')({
  component: RouteComponent,
});

function RouteComponent() {
  return <Payroll2App />;
}
