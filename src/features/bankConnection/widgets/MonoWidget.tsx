import MonoConnect from "@mono.co/connect.js";
import { MonoWidgetProps } from "./types";
import { useEffect, useMemo } from "react";

export function MonoWidget({
  open,
  onClose,
  onSuccess,
  data: customerData,
}: MonoWidgetProps) {
  const key = import.meta.env.VITE_MONO_PUBLIC_KEY;
  // if (!key || !key.startsWith("live_pk_")) {
  //   console.warn("Invalid Mono key for production.");
  // throw new Error("Invalid Mono key for production.");
  // }

  const monoConnect = useMemo(() => {
    const monoInstance = new MonoConnect({
      key,
      data: { customer: customerData },
      onClose: () => {
        console.log("Widget closed");
        onClose?.();
      },

      onLoad: () => console.log("Widget loaded successfully"),

      onSuccess: ({ code }) => {
        console.log(`Linked successfully: ${code}`);
        onSuccess?.(code);
        onClose?.();
      },
    });

    monoInstance.setup();

    return monoInstance;
  }, [customerData, onClose, onSuccess]);

  useEffect(() => {
    if (open) monoConnect.open();
  }, [open, monoConnect]);

  // return (
  //   <div>
  //     <button onClick={() => monoConnect.open()}>
  //       {trigger ?? "Link account with Mono"}
  //     </button>
  //   </div>
  // );
  return null;
}
