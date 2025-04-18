import { Label } from "./ui/label";

type FormFieldProps = {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  children: React.ReactNode;
};

export const FormField = ({
  id,
  label,
  required,
  error,
  children,
}: FormFieldProps) => (
  <div className="space-y-2 relative">
    <div className="flex justify-between">
      <Label htmlFor={id}>
        {label}
        {required && <span className="-ml-1.5 text-destructive">*</span>}
      </Label>
      {error && (
        <span className="text-xs text-destructive" id={`${id}-error`}>
          {error}
        </span>
      )}
    </div>
    {children}
  </div>
);
