import { LaptopMinimal } from "lucide-react";
import { Separator } from "./ui/separator";

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
  title: "Best Viewed on Larger Screens",
  message:
    "Our site shines brightest on larger screens for now, but we're crafting a stellar experience for smaller screens soon!",
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
    <div className="flex items-center justify-center min-h-0 h-full">
      <div className="flex flex-col items-center gap-1 p-4 max-w-md m-4 rounded-md shadow-md">
        <div className="flex flex-col items-center">
          {showIcon && icon}
          <h1 className="text-lg text-center font-semibold">{title}</h1>
        </div>
        <hr className="w-full" />
        <p className="text-muted-foreground text-sm text-center">{message}</p>
      </div>
    </div>
  );
}
