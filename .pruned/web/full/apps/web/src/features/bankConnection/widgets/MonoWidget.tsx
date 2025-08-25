import MonoConnect from '@mono.co/connect.js';
import type { MonoWidgetProps } from './types';
import { useEffect, useRef } from 'react';

export function MonoWidget({
  open,
  onClose: providedOnClose,
  onLoad: providedOnLoad,
  onSuccess: providedOnSuccess,
  data: customerData,
}: MonoWidgetProps) {
  const key = import.meta.env.VITE_MONO_PUBLIC_KEY;
  const monoInstanceRef = useRef<MonoConnect | null>(null);
  const isUnmountedRef = useRef(false);
  const hasCalledOnSuccessRef = useRef(false);

  const styleElementRef = useRef<HTMLStyleElement | null>(null);

  const callbacksRef = useRef({
    providedOnClose,
    providedOnLoad,
    providedOnSuccess,
  });

  // Noticed onSuccess firing multiple time, adding this to reset, added to onSuccess to prevent
  useEffect(() => {
    hasCalledOnSuccessRef.current = false; // reset on new mount
  }, [key, customerData]);

  // Update refs on callback changes
  useEffect(() => {
    callbacksRef.current = {
      providedOnClose,
      providedOnLoad,
      providedOnSuccess,
    };
  }, [providedOnClose, providedOnLoad, providedOnSuccess]);

  // Initialize Mono instance once
  useEffect(() => {
    isUnmountedRef.current = false; // Reset mount status

    if (!monoInstanceRef.current) {
      monoInstanceRef.current = new MonoConnect({
        key,
        data: { customer: customerData },

        onClose: () => {
          console.log('Widget closed');
          callbacksRef.current.providedOnClose?.();
        },

        onLoad: () => {
          console.log('Widget loaded successfully');
          callbacksRef.current.providedOnLoad?.();
        },

        onSuccess: async ({ code }) => {
          if (hasCalledOnSuccessRef.current) {
            console.warn('onSuccess already called; ignoring duplicate');
            return;
          }
          hasCalledOnSuccessRef.current = true;

          console.log(`Linked successfully: ${code}`);
          await callbacksRef.current.providedOnSuccess?.(code);
          // callbacksRef.current.providedOnClose?.();
        },
      });

      monoInstanceRef.current.setup();
    }

    // Cleanup on unmount or re-initialization
    return () => {
      isUnmountedRef.current = true;
      if (monoInstanceRef.current) {
        // If there's a clean up method, this will be where it's called
        monoInstanceRef.current = null;
      }
    };
  }, [key, customerData]); // Only recreate if key/customerData changes

  // Handle open state separately
  useEffect(() => {
    if (open && monoInstanceRef.current) {
      monoInstanceRef.current.open();
    }
  }, [open]);

  // Styling hack to get the widget to appear above everything including dialogs and make it interactive
  useEffect(() => {
    if (open) {
      const prevColorScheme = document.documentElement.style.colorScheme;

      // Create and inject CSS styles
      const styleElement = document.createElement('style');
      styleElement.id = 'mono-widget-portal-styles';
      styleElement.textContent = `
        /* Force MonoConnect widget to appear above everything */
        #mono-connect--widget-div {
          display: flex !important;
          visibility: visible !important;
          pointer-events: auto !important;
          background: rgba(0, 0, 0, 0.80) !important;
        }

        #mono-connect--frame-id {
          display: block !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }
            
        /* Disable pointer events on dialog overlays when widget is open */
        /* Disable focus guards that might interfere */
        /* Ensure dialog content can't capture events */
    
        [data-radix-dialog-overlay],
        [data-radix-focus-guard],
        [data-radix-dialog-content] {
          pointer-events: none !important;
        }
      `;

      document.head.appendChild(styleElement);
      document.documentElement.style.colorScheme = 'light';
      styleElementRef.current = styleElement;

      return () => {
        // Clean up styles when component unmounts or widget closes
        if (styleElementRef.current) {
          document.head.removeChild(styleElementRef.current);
          styleElementRef.current = null;
        }

        document.documentElement.style.colorScheme = prevColorScheme;
      };
    } else {
      // Remove styles if widget is closed or not using portal
      if (styleElementRef.current) {
        document.head.removeChild(styleElementRef.current);
        styleElementRef.current = null;
      }
    }
  }, [open]);

  return null;
}

MonoWidget.whyDidYouRender = true;
