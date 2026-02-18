import type { ToasterProps } from 'sonner';
import { useMediaQuery } from '@/shared/hooks/use-media-query';
import { useTheme } from 'next-themes';
import { Toaster as Sonner } from 'sonner';

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { theme = 'system' } = useTheme();
  const isMobile = useMediaQuery('(max-width: 768px)');
  const resolvedPosition =
    position ?? (isMobile ? 'top-center' : 'bottom-right');

  return (
    <Sonner
      theme={theme as ToasterProps['theme']}
      position={resolvedPosition}
      className="toaster group"
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as React.CSSProperties
      }
      {...props}
    />
  );
};

export { Toaster };
