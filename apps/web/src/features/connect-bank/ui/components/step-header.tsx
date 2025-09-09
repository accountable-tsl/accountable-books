type StepHeaderProps = {
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
};

export function StepHeader({ Icon, title, description }: StepHeaderProps) {
  return (
    <div className="text-center space-y-4">
      <div className="w-12 h-12 bg-primary rounded-full flex items-center justify-center mx-auto">
        <Icon className="w-8 h-8 text-primary-foreground" />
      </div>
      <div>
        <h2 className="text-lg font-medium">{title}</h2>
        <p className="text-muted-foreground text-sm">{description}</p>
      </div>
    </div>
  );
}
