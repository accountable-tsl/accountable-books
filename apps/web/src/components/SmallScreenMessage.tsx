import { LaptopMinimal } from 'lucide-react';
import React from 'react';

interface SmallScreenMessageProps {
  title?: string;
  message?: string;
  showIcon?: boolean;
  icon?: React.ReactNode;
  classNames?: {
    container?: string;
    box?: string;
    title?: string;
    message?: string;
  };
}

// Default props
const def: SmallScreenMessageProps = {
  title: 'Best Viewed on Larger Screens',
  message:
    "Our site shines brightest on larger screens for now, we'll craft a stellar experience for smaller screens soon!",
  showIcon: true,
  icon: <LaptopMinimal />,
};

export function SmallScreenMessage({
  title = def.title,
  message = def.message,
  showIcon = def.showIcon,
  icon = def.icon,
}: SmallScreenMessageProps) {
  return (
    <div className="flex h-full min-h-0 items-center justify-center">
      <div className="m-4 flex max-w-md flex-col items-center gap-1 rounded-md p-4">
        <div className="flex flex-col items-center">
          {showIcon && icon}
          <h1 className="text-center text-lg font-semibold">{title}</h1>
        </div>
        <hr className="w-full" />
        <p className="text-muted-foreground text-center text-sm">{message}</p>
      </div>
    </div>
  );
}
