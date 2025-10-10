import { ConfettiCelebration } from '@/components/Confetti';
import { useEffect, useState } from 'react';
import { DotLottieReact } from '@lottiefiles/dotlottie-react';
import { useNavigate } from 'react-router';
import { useSession } from '@session';
import { routes } from '@/shared/routes/routes';

export default function Welcome() {
  const navigate = useNavigate();
  const { tenantRoutes, user, companyId } = useSession();
  const [phase, setPhase] = useState<'setup' | 'done'>('setup');
  const [isConfettiActive, setIsConfettiActive] = useState(true);

  const confettiDuration = 2000;
  const setupDuration = 2000; // show "completing setup..." for 2s
  const doneDuration = 3000; // show "You're all set" for another 3s

  useEffect(() => {
    const confettiTimer = setTimeout(() => {
      setIsConfettiActive(false);
    }, confettiDuration);

    const setupTimer = setTimeout(() => {
      setPhase('done');
    }, setupDuration);

    const doneTimer = setTimeout(() => {
      navigate(
        tenantRoutes?.general.dashboard() ||
          routes.general.dashboard.build({ companyId: companyId || '' }),
      );
    }, setupDuration + doneDuration);

    return () => {
      clearTimeout(confettiTimer);
      clearTimeout(setupTimer);
      clearTimeout(doneTimer);
    };
  }, [navigate]);
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
          {phase === 'setup'
            ? "We're completing your setup..."
            : `You're all set${user?.firstname ? `, ${user.firstname}` : ''} 🎉`}
        </p>
      </div>
    </div>
  );
}
