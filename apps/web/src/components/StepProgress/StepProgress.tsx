import { Progress } from '../ui/progress';

interface StepProgressProps {
  currentStep: number;
  totalSteps: number;
  steps: string[];
}
export function StepProgress({ currentStep, totalSteps }: StepProgressProps) {
  const progress = Math.round(((currentStep - 1) / totalSteps) * 100);
  return (
    <div className="w-full">
      <Progress value={progress} />
      <div className="mt-2 flex justify-between px-1 text-xs text-gray-500">
        <span>
          Step {currentStep} of {totalSteps}
        </span>
        <span>{progress}% Complete</span>
      </div>
    </div>
  );
}
