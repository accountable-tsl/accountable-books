import { useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Loader } from 'lucide-react';

interface MonoWidgetProps {
  config: string; // JSON string with Mono configuration
  onSuccess: (code: string, metadata?: any) => void;
  onClose?: () => void;
}

declare global {
  interface Window {
    Mono?: any;
  }
}

export function MonoWidget({ config, onSuccess, onClose }: MonoWidgetProps) {
  const monoRef = useRef<any>(null);
  const configData = JSON.parse(config);

  useEffect(() => {
    // Load Mono script if not already loaded
    if (!window.Mono) {
      const script = document.createElement('script');
      script.src = 'https://connect.withmono.com/connect.js';
      script.async = true;
      document.head.appendChild(script);
    }

    return () => {
      // Cleanup
      if (monoRef.current) {
        monoRef.current.close();
      }
    };
  }, []);

  const handleConnect = () => {
    if (window.Mono && configData) {
      monoRef.current = new window.Mono({
        ...configData,
        onSuccess: (code: string, metadata?: any) => {
          onSuccess(code, metadata);
        },
        onClose: () => {
          onClose?.();
        },
      });

      monoRef.current.setup();
      monoRef.current.open();
    }
  };

  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="text-lg font-semibold mb-2">Connect Your Bank Account</h3>
        <p className="text-muted-foreground text-sm mb-4">
          Securely link your Nigerian bank account to import transactions automatically.
        </p>
      </div>

      <Button onClick={handleConnect} className="w-full" size="lg">
        Connect Bank Account
      </Button>

      <div className="text-xs text-muted-foreground text-center">
        Your credentials are encrypted and secure
      </div>
    </div>
  );
}
