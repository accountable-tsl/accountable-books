type Props = {
  score: number; // 0 to 4
  className?: { root?: string; bar?: string; label?: string };
};

export const PasswordStrengthMeter: React.FC<Props> = ({ score, className }) => {
  const levels = ['bg-red-500', 'bg-orange-500', 'bg-yellow-400', 'bg-green-400', 'bg-green-600'];
  const labels = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'];

  return (
    <div className={`${className?.root || ''} w-full`}>
      <div className={`h-1 w-full bg-border rounded ${className?.bar || ''}`}>
        <div
          className={`h-1 ${levels[score]} rounded transition-all ${className?.bar || ''}`}
          style={{ width: `${(score + 1) * 20}%` }}
        />
      </div>
      <p className={`text-xs text-muted-foreground mt-1 ${className?.label || ''}`}>
        {labels[score]}
      </p>
    </div>
  );
};
