import { CheckCircle, Eye, Lock, Shield } from 'lucide-react';

export function SecurityBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1 text-xs font-medium text-green-700 ${className}`}
    >
      <Shield className="h-3 w-3" />
      <span>Bank-grade security</span>
    </div>
  );
}

const indicators = [
  {
    icon: Lock,
    bgColor: 'bg-green-100',
    iconColor: 'text-green-600',
    title: '256-bit encryption',
    description: 'Same security as your bank',
  },
  {
    icon: Eye,
    bgColor: 'bg-blue-100',
    iconColor: 'text-blue-600',
    title: 'Read-only access',
    description: 'We can only view, never modify',
  },
  {
    icon: CheckCircle,
    bgColor: 'bg-purple-100',
    iconColor: 'text-purple-600',
    title: 'Never stored',
    description: "Login details aren't saved",
  },
];

export function TrustIndicators() {
  return (
    <div className="bg-muted/30 space-y-4 rounded-lg p-4">
      {indicators.map((indicator, index) => (
        <div key={index} className="flex items-center gap-3">
          <div
            className={`h-8 w-8 ${indicator.bgColor} flex items-center justify-center rounded-full`}
          >
            <indicator.icon className={`h-4 w-4 ${indicator.iconColor}`} />
          </div>
          <div>
            <div className="text-sm font-medium">{indicator.title}</div>
            <div className="text-muted-foreground text-xs">
              {indicator.description}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProcessingNote() {
  return (
    <div className="text-muted-foreground mt-4 px-4 text-center text-xs">
      <Lock className="mr-1 inline h-3 w-3" />
      All data is processed securely and encrypted in transit
    </div>
  );
}
