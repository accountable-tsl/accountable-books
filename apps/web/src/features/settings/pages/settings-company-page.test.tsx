import type { CompanyData } from '@/modules/company/companies';
import { getDefaultCompanyData } from '@/modules/company/companies';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SettingsCompanyPage } from './settings-company-page';

const mocks = vi.hoisted(() => ({
  useSession: vi.fn(),
  updateCompanyMutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  uploadCompanyLogoMutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  deleteCompanyLogoMutation: {
    isPending: false,
    mutateAsync: vi.fn(),
  },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock('@session', () => ({
  useSession: () => mocks.useSession(),
}));

vi.mock('sonner', () => ({
  toast: {
    success: mocks.toastSuccess,
    error: mocks.toastError,
  },
}));

vi.mock('@/modules/company/companies', async () => {
  const actual = await vi.importActual<
    typeof import('@/modules/company/companies')
  >('@/modules/company/companies');

  return {
    ...actual,
    useUpdateCompanyDetails: () => mocks.updateCompanyMutation,
  };
});

vi.mock('@/modules/objects', async () => {
  const actual =
    await vi.importActual<typeof import('@/modules/objects')>(
      '@/modules/objects',
    );

  return {
    ...actual,
    useUploadCompanyLogo: () => mocks.uploadCompanyLogoMutation,
    useDeleteCompanyLogo: () => mocks.deleteCompanyLogoMutation,
  };
});

function mockMatchMedia() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation(() => ({
      matches: false,
      media: '',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  );
}

function createCompany(overrides: Partial<CompanyData> = {}): CompanyData {
  return {
    ...getDefaultCompanyData(),
    id: 'co1',
    legalName: 'Acme LLC',
    displayName: 'Acme',
    countryId: '019d6d01-8c4a-7ba6-b99f-d01811fc193b',
    countryCode: 'US',
    countryName: 'United States',
    createdById: '019d6d01-6a55-725f-a07b-a33187e6de7c',
    reportingCurrencyId: '019d6d01-6a55-725f-a07b-a33187e6de7d',
    defaultTimezone: 'America/New_York',
    companyLogo: 'https://cdn.example/logo.png',
    ...overrides,
  };
}

function createUser(overrides: Record<string, unknown> = {}) {
  const currentCompany = {
    id: 'co1',
    legalName: 'Acme LLC',
    displayName: 'Acme',
    assignedFirmSlug: 'firm',
    companyType: 'business',
    hasExplicitAccess: true,
    roleScope: 'company',
    roleKey: 'client_admin',
    isDemoCompany: false,
    isPlatformCompany: false,
    onboardingState: null,
    accessOrigin: 'explicit_company',
    supportAccessLevel: null,
    supportGrantId: null,
    breakGlassSessionId: null,
    onboarding: {
      canAccessApp: true,
      isCompanyOwner: true,
      nextStepToComplete: null,
      steps: [],
      userStepsComplete: true,
    },
  };

  return {
    id: 'user1',
    email: 'user@example.com',
    firstname: 'User',
    lastname: 'Example',
    currentCompanyId: 'co1',
    currentCompany,
    companies: [currentCompany],
    isPlatformUser: false,
    ...overrides,
  };
}

function renderPage({
  company = createCompany(),
  user = createUser(),
}: {
  company?: CompanyData;
  user?: ReturnType<typeof createUser>;
} = {}) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const refetchCompany = vi.fn().mockResolvedValue(undefined);

  mocks.useSession.mockReturnValue({
    user,
    company,
    companyId: 'co1',
    refetchCompany,
  });

  const rendered = render(
    <QueryClientProvider client={queryClient}>
      <SettingsCompanyPage />
    </QueryClientProvider>,
  );

  return { ...rendered, refetchCompany };
}

describe('SettingsCompanyPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.unstubAllGlobals();
    mockMatchMedia();
    mocks.updateCompanyMutation.isPending = false;
    mocks.uploadCompanyLogoMutation.isPending = false;
    mocks.deleteCompanyLogoMutation.isPending = false;
    mocks.updateCompanyMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: createCompany(),
    });
    mocks.uploadCompanyLogoMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: {
        fileId: 'file1',
        key: 'co1/company-logo/logo.png',
        url: 'https://cdn.example/new-logo.png',
      },
    });
    mocks.deleteCompanyLogoMutation.mutateAsync.mockResolvedValue({
      success: true,
      data: null,
    });
  });

  it('renders verified legal names as locked', () => {
    renderPage({
      company: createCompany({
        verification: {
          legalName: { verifiedAt: new Date(0).toISOString() },
          address: { verifiedAt: null },
          registrationNumber: { verifiedAt: null },
          taxId: { verifiedAt: null },
        },
      }),
    });

    expect(
      (screen.getByDisplayValue('Acme LLC') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      screen.getByText('Verified. Contact support to change.'),
    ).toBeTruthy();
  });

  it('disables save and logo actions for demo non-platform sessions', () => {
    renderPage({
      user: createUser({
        currentCompany: {
          ...createUser().currentCompany,
          isDemoCompany: true,
        },
      }),
    });

    expect(screen.getByText(/Demo workspaces are read-only/i)).toBeTruthy();
    expect(
      (
        screen.getByRole('button', {
          name: 'Save Changes',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole('button', {
          name: 'Upload workspace logo',
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it('sends only changed fields when saving', async () => {
    renderPage();

    fireEvent.change(screen.getByDisplayValue('Acme'), {
      target: { value: 'Acme Studio' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    await waitFor(() => {
      expect(mocks.updateCompanyMutation.mutateAsync).toHaveBeenCalledWith({
        companyId: 'co1',
        data: { displayName: 'Acme Studio' },
      });
    });
  });

  it('uploads and removes logos through object hooks', async () => {
    const createObjectUrl = vi.fn(() => 'blob:preview');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    const { container } = renderPage();
    const fileInput =
      container.querySelector<HTMLInputElement>('input[type="file"]');

    expect(fileInput).toBeTruthy();

    fireEvent.change(fileInput!, {
      target: {
        files: [new File(['logo'], 'logo.png', { type: 'image/png' })],
      },
    });

    await waitFor(() => {
      expect(mocks.uploadCompanyLogoMutation.mutateAsync).toHaveBeenCalledWith({
        companyId: 'co1',
        file: expect.objectContaining({ name: 'logo.png' }),
      });
    });

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove workspace logo' }),
    );

    await waitFor(() => {
      expect(mocks.deleteCompanyLogoMutation.mutateAsync).toHaveBeenCalledWith(
        'co1',
      );
    });
  });
});
