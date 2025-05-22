import { useEffect, useState } from "react";
import { BeatLoader } from "react-spinners";

export function CenteredLoader({ delay = 2000 }: { delay?: number }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timeout = setTimeout(() => setVisible(false), delay);
    return () => clearTimeout(timeout);
  }, [delay]);

  if (!visible) return null;

  return (
    <div className="flex items-center justify-center W-full h-full min-h-[6rem]">
      <BeatLoader color={`text-foreground`} />
    </div>
  );
}
