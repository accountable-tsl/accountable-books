import MonoConnect from "@mono.co/connect.js";
import { MonoWidgetProps } from "./types";
import { useEffect, useRef } from "react";

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
  const styleElementRef = useRef<HTMLStyleElement | null>(null);

  const callbacksRef = useRef({
    providedOnClose,
    providedOnLoad,
    providedOnSuccess,
  });

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
          console.log("Widget closed");
          callbacksRef.current.providedOnClose?.();
        },

        onLoad: () => {
          console.log("Widget loaded successfully");
          callbacksRef.current.providedOnLoad?.();
        },

        onSuccess: ({ code }) => {
          console.log(`Linked successfully: ${code}`);
          callbacksRef.current.providedOnSuccess?.(code);
          callbacksRef.current.providedOnClose?.();
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
      // Create and inject CSS styles
      const styleElement = document.createElement("style");
      styleElement.id = "mono-widget-portal-styles";
      styleElement.textContent = `
        /* Force MonoConnect widget to appear above everything */
        #mono-connect--widget-div {
          display: flex !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        #mono-connect--frame-id {
          display: block !important;
          visibility: visible !important;
          pointer-events: auto !important;
        }

        /* Disable pointer events on dialog overlays when widget is open */
        [data-radix-dialog-overlay] {
          pointer-events: none !important;
        }

        /* Disable focus guards that might interfere */
        [data-radix-focus-guard] {
          pointer-events: none !important;
        }

        /* Ensure dialog content can't capture events */
        [data-radix-dialog-content] {
          pointer-events: none !important;
        }
      `;

      document.head.appendChild(styleElement);
      styleElementRef.current = styleElement;

      return () => {
        // Clean up styles when component unmounts or widget closes
        if (styleElementRef.current) {
          document.head.removeChild(styleElementRef.current);
          styleElementRef.current = null;
        }
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
