import { useCallback } from 'react';
import { useCompanySwitch } from '@/domains-pending-migration/switchCompany/hooks';
import { routes } from '@/shared/routes';
import { useSession } from '@session';
import { useNavigate } from 'react-router';

export function useOpenClientBook() {
  const navigate = useNavigate();
  const { user } = useSession();
  const { switchCompany, isSwitching } = useCompanySwitch();

  const canOpenClientBook = useCallback(
    (clientCompanyId: string) =>
      !!user?.currentCompanyId &&
      user.companies.some((c) => c.id === clientCompanyId),
    [user],
  );

  const openClientBook = useCallback(
    async (clientCompanyId: string) => {
      const currentId = user?.currentCompanyId;
      if (!currentId) return;
      if (!user.companies.some((c) => c.id === clientCompanyId)) return;

      if (clientCompanyId === currentId) {
        navigate(
          routes.general.dashboard.build({ companyId: clientCompanyId }),
        );
        return;
      }

      await switchCompany({
        fromCompanyId: currentId,
        toCompanyId: clientCompanyId,
      });
    },
    [navigate, switchCompany, user],
  );

  return { openClientBook, canOpenClientBook, isSwitching };
}
