import { Progress } from "../ui/progress";

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
}
export function StepProgress({
  currentStep,
  totalSteps,
  steps,
}: StepProgressProps) {
  const progress = Math.round((currentStep / totalSteps) * 100);
  return (
    <div className="w-full">
      <Progress value={progress} />
      <div></div>
    </div>
  );
}
