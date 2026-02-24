import { TooltipHelper } from '@/components/TooltipHelper';

export function DemoDataBadge() {
  return (
    <TooltipHelper
      content="This is a demo data"
      contentStyle="text-center"
      icon={false}
      trigger={
        <div className="text-destructive bg-destructive/10 flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-xs whitespace-nowrap">
          Demo Data
        </div>
      }
    />
  );
}
