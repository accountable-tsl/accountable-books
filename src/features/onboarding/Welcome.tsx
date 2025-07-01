import { ConfettiCelebration } from "@/components/Confetti";
import { useEffect, useState } from "react";
import { DotLottieReact } from "@lottiefiles/dotlottie-react";

export default function Welcome() {
  const [isConfettiActive, setIsConfettiActive] = useState(true);
  const confettiDuration = 2000;

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsConfettiActive(false);
    }, confettiDuration);

    return () => clearTimeout(timer);
  }, []);
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center p-6">
      <ConfettiCelebration
        isActive={isConfettiActive}
        duration={confettiDuration}
      />
      <div className="flex flex-col items-center">
        <div className="w-48 h-auto">
          <DotLottieReact
            src="https://lottie.host/cd21f427-784a-4c41-a8ad-996513ccbc53/PXZnpvunKI.lottie"
            loop
            autoplay
          />
        </div>
        <h2>Welcome to Accountable</h2>
        <p className="text-muted-foreground">
          We're completing your setup... ; You're all set, Temi🎉
        </p>
      </div>
    </div>
  );
}
