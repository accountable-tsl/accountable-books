import { Payroll } from '@/payroll/ui/payroll-app';
import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: App,
});

function App() {
  return <Payroll />;
}
