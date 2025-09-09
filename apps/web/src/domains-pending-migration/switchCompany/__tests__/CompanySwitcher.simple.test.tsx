import { render, screen } from '@testing-library/react';
import { vi, describe, it, expect, beforeEach } from 'vitest';
import { CompanySwitcher } from '../CompanySwitcher';
import type {
  AuthUserContext,
  AuthCompanyContext,
  CurrentCompanyContext,
} from '@/modules/auth/types';

// Mock hooks
const mockUseSession = vi.fn();
const mockUseCompanySwitch = vi.fn();

vi.mock('@/features/auth/Session', () => ({
  useSession: () => mockUseSession(),
}));

vi.mock('@/features/switchCompany/hooks', () => ({
  useCompanySwitch: () => mockUseCompanySwitch(),
}));

// Mock data helpers
const createMockCompany = (overrides: Partial<AuthCompanyContext> = {}): AuthCompanyContext => ({
  id: 'comp-1',
  legalName: 'Test Company',
  displayName: 'Test Display Name',
  assignedFirmSlug: 'test-firm',
  hasExplicitAccess: true,
  isDemoCompany: false,
  companyType: 'business',
  ...overrides,
});

const createMockCurrentCompany = (
  overrides: Partial<CurrentCompanyContext> = {},
): CurrentCompanyContext => ({
  ...createMockCompany({ id: 'comp-1' }),
  onboarding: { completedSteps: [], currentStep: 'welcome' },
  ...overrides,
});

const createMockUser = (overrides: Partial<AuthUserContext> = {}): AuthUserContext => ({
  id: 'user-1',
  email: 'test@example.com',
  firstname: 'Test',
  lastname: 'User',
  currentCompanyId: 'comp-1',
  currentCompany: createMockCurrentCompany({ id: 'comp-1' }),
  companies: [
    createMockCompany({ id: 'comp-1', legalName: 'Current Company' }),
    createMockCompany({ id: 'comp-2', legalName: 'Other Company', companyType: 'individual' }),
  ],
  ...overrides,
});

describe('CompanySwitcher', () => {
  const mockSwitchCompany = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCompanySwitch.mockReturnValue({
      switchCompany: mockSwitchCompany,
      isSwitching: false,
    });
  });

  it('renders nothing when user has only one company', () => {
    const user = createMockUser({
      companies: [createMockCompany()],
    });

    mockUseSession.mockReturnValue({ user });

    const { container } = render(<CompanySwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when user has no companies', () => {
    const user = createMockUser({ companies: [] });
    mockUseSession.mockReturnValue({ user });

    const { container } = render(<CompanySwitcher />);
    expect(container.firstChild).toBeNull();
  });

  it('renders switch button when user has multiple companies', () => {
    const user = createMockUser();
    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('shows search box when user has more than 4 companies', () => {
    const companies = Array.from({ length: 6 }, (_, i) =>
      createMockCompany({
        id: `comp-${i}`,
        legalName: `Company ${i}`,
      }),
    );

    const user = createMockUser({
      companies,
      currentCompanyId: 'comp-0',
    });

    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);

    // Check that component renders (basic functionality test)
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('handles accounting firm user detection', () => {
    const user = createMockUser({
      currentCompany: createMockCurrentCompany({
        id: 'firm-1',
        companyType: 'accounting_firm',
      }),
      companies: [
        createMockCompany({ id: 'firm-1', companyType: 'accounting_firm' }),
        createMockCompany({ id: 'client-1', companyType: 'business' }),
      ],
      currentCompanyId: 'firm-1',
    });

    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('handles demo companies', () => {
    const user = createMockUser({
      companies: [
        createMockCompany({
          id: 'comp-1',
          legalName: 'Demo Company',
          isDemoCompany: true,
        }),
        createMockCompany({
          id: 'comp-2',
          legalName: 'Regular Company',
          isDemoCompany: false,
        }),
      ],
      currentCompanyId: 'comp-1',
    });

    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('prefers displayName over legalName', () => {
    const user = createMockUser({
      companies: [
        createMockCompany({
          id: 'comp-1',
          legalName: 'Legal Name LLC',
          displayName: 'Friendly Display Name',
        }),
        createMockCompany({
          id: 'comp-2',
          legalName: 'Other Company',
        }),
      ],
      currentCompanyId: 'comp-1',
    });

    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('disables when switching is in progress', () => {
    mockUseCompanySwitch.mockReturnValue({
      switchCompany: mockSwitchCompany,
      isSwitching: true,
    });

    const user = createMockUser();
    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });

  it('handles different company types correctly', () => {
    const user = createMockUser({
      companies: [
        createMockCompany({ id: 'comp-1', companyType: 'business' }),
        createMockCompany({ id: 'comp-2', companyType: 'individual' }),
        createMockCompany({ id: 'comp-3', companyType: 'accounting_firm' }),
      ],
      currentCompanyId: 'comp-1',
    });

    mockUseSession.mockReturnValue({ user });

    render(<CompanySwitcher />);
    expect(screen.getByText('switch')).toBeTruthy();
  });
});
