import { CheckCircle, Eye, Lock, Shield } from 'lucide-react';

export function SecurityBadge({ className = '' }: { className?: string }) {
  return (
    <div
      className={`inline-flex items-center gap-2 px-3 py-1 bg-green-50 text-green-700 rounded-full text-xs font-medium ${className}`}
    >
      <Shield className="w-3 h-3" />
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
    <div className="bg-muted/30 rounded-lg p-4 space-y-4">
      {indicators.map((indicator, index) => (
        <div key={index} className="flex items-center gap-3">
          <div
            className={`w-8 h-8 ${indicator.bgColor} rounded-full flex items-center justify-center`}
          >
            <indicator.icon className={`w-4 h-4 ${indicator.iconColor}`} />
          </div>
          <div>
            <div className="font-medium text-sm">{indicator.title}</div>
            <div className="text-xs text-muted-foreground">
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
    <div className="text-center text-xs text-muted-foreground mt-4 px-4">
      <Lock className="w-3 h-3 inline mr-1" />
      All data is processed securely and encrypted in transit
    </div>
  );
}
