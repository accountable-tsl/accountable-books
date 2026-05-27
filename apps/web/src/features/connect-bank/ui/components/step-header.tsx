type StepHeaderProps = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

export function StepHeader({ Icon, title, description }: StepHeaderProps) {
  return (
    <div className="space-y-4 text-center">
      <div className="bg-primary mx-auto flex h-12 w-12 items-center justify-center rounded-full">
        <Icon className="text-primary-foreground h-8 w-8" />
      </div>
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
