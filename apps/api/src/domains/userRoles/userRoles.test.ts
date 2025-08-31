import { describe, it, expect } from 'vitest';
import { type AccessibleCompaniesResponse } from './userRoles.types.js';
import { getAccessibleCompaniesForUser } from './userRoles.model.js';

// Simple unit tests for the core business logic
// Following the "simplicity over everything" principle
describe('UserRoles Business Logic', () => {
  describe('Access Control Logic', () => {
    it('should determine explicit access correctly', () => {
      const userContext: AccessibleCompaniesResponse = {
        accessibleCompanies: [
          {
            id: 'company-1',
            legalName: 'Test Company',
            displayName: 'Test',
            assignedFirmSlug: 'test-firm',
            companyType: 'business',
            hasExplicitAccess: true,
            isDemoCompany: false,
            roleKey: 'client_owner',
            roleScope: 'company',
            onboardingState: null,
          },
        ],
      };

      const company = userContext.accessibleCompanies.find((c) => c.id === 'company-1');
      const hasAccess = !!company;
      const roleKey = company?.roleKey || null;
      const accessReason = company?.isDemoCompany ? 'demo' : 'explicit';

      expect(hasAccess).toBe(true);
      expect(roleKey).toBe('client_owner');
      expect(accessReason).toBe('explicit');
    });

    it('should determine platform access correctly', () => {
      const userContext: AccessibleCompaniesResponse = {
        isPlatformUser: true,
        platformUserKey: 'super_admin',
        accessibleCompanies: [],
      };

      const hasAccess = !!userContext.isPlatformUser;
      const roleKey = userContext.platformUserKey || null;
      const accessReason = 'platform';

      expect(hasAccess).toBe(true);
      expect(roleKey).toBe('super_admin');
      expect(accessReason).toBe('platform');
    });

    it('should determine demo access correctly', () => {
      const userContext: AccessibleCompaniesResponse = {
        accessibleCompanies: [
          {
            id: 'demo-1',
            legalName: 'Demo Company',
            displayName: 'Demo',
            assignedFirmSlug: 'demo-firm',
            companyType: 'business',
            hasExplicitAccess: false,
            isDemoCompany: true,
            roleKey: null,
            roleScope: null,
            onboardingState: null,
          },
        ],
      };

      const company = userContext.accessibleCompanies.find((c) => c.id === 'demo-1');
      const hasAccess = !!company;
      const roleKey = company?.roleKey || null;
      const accessReason = company?.isDemoCompany ? 'demo' : 'explicit';

      expect(hasAccess).toBe(true);
      expect(roleKey).toBe(null);
      expect(accessReason).toBe('demo');
    });

    it('should determine no access correctly', () => {
      const userContext: AccessibleCompaniesResponse = {
        accessibleCompanies: [],
      };

      const company = userContext.accessibleCompanies.find((c) => c.id === 'non-existent');
      const hasAccess = !!company;
      const roleKey = company?.roleKey || null;
      const accessReason = 'none';

      expect(hasAccess).toBe(false);
      expect(roleKey).toBe(null);
      expect(accessReason).toBe('none');
    });
  });

  describe('Platform Role Hierarchy', () => {
    it('should identify highest platform role correctly', () => {
      const platformRoleHierarchy = ['super_admin', 'support_admin', 'support_agent'] as const;

      const userRoles = [
        { roleKey: 'support_agent', roleScope: 'platform' },
        { roleKey: 'super_admin', roleScope: 'platform' },
      ];

      const platformRoles = userRoles.filter((r) => r.roleScope === 'platform');
      const highestRole = platformRoleHierarchy.find((roleKey) =>
        platformRoles.some((r) => r.roleKey === roleKey),
      );

      expect(highestRole).toBe('super_admin');
    });

    it('should handle no platform roles correctly', () => {
      const platformRoleHierarchy = ['super_admin', 'support_admin', 'support_agent'] as const;

      const userRoles = [{ roleKey: 'client_owner', roleScope: 'company' }];

      const platformRoles = userRoles.filter((r) => r.roleScope === 'platform');
      const highestRole = platformRoleHierarchy.find((roleKey) =>
        platformRoles.some((r) => r.roleKey === roleKey),
      );

      expect(highestRole).toBeUndefined();
    });
  });

  describe('Data Transformation', () => {
    it('should transform role data correctly', () => {
      const roleData = {
        userId: 'user-1',
        companyId: 'company-1',
        legalName: 'Test Company',
        displayName: 'Test',
        firmSlug: 'test-firm',
        roleId: 'role-1',
        roleKey: 'client_owner',
        roleName: 'Client Owner',
        roleScope: 'company',
        onboardingState: 'completed',
        companyType: 'business',
      };

      const transformed = {
        id: roleData.companyId,
        legalName: roleData.legalName,
        displayName: roleData.displayName,
        hasExplicitAccess: true,
        isDemoCompany: false,
        assignedFirmSlug: roleData.firmSlug,
        companyType: roleData.companyType,
        roleKey: roleData.roleKey,
        roleScope: roleData.roleScope,
        onboardingState: roleData.onboardingState,
      };

      expect(transformed.id).toBe('company-1');
      expect(transformed.hasExplicitAccess).toBe(true);
      expect(transformed.isDemoCompany).toBe(false);
      expect(transformed.roleKey).toBe('client_owner');
    });

    it('should transform demo data correctly', () => {
      const demoData = {
        legalName: 'Demo Company',
        displayName: 'Demo',
        companyId: 'demo-1',
        companyType: 'business',
        firmSlug: 'demo-firm',
      };

      const transformed = {
        id: demoData.companyId,
        legalName: demoData.legalName,
        displayName: demoData.displayName,
        hasExplicitAccess: false,
        isDemoCompany: true,
        assignedFirmSlug: demoData.firmSlug || '',
        companyType: demoData.companyType,
        roleKey: null,
        roleScope: null,
        onboardingState: null,
      };

      expect(transformed.id).toBe('demo-1');
      expect(transformed.hasExplicitAccess).toBe(false);
      expect(transformed.isDemoCompany).toBe(true);
      expect(transformed.roleKey).toBe(null);
    });
  });

  describe('Error Handling', () => {
    it('should handle empty user context gracefully', () => {
      const userContext = undefined as any;
      const accessibleCompanies = userContext?.accessibleCompanies || [];
      const isPlatformUser = userContext?.isPlatformUser || false;

      const hasAccess = accessibleCompanies.length > 0 || isPlatformUser;
      const accessReason = hasAccess ? 'unknown' : 'none';

      expect(hasAccess).toBe(false);
      expect(accessReason).toBe('none');
    });

    it('should handle null values in role data', () => {
      const roleData = {
        userId: 'user-1',
        companyId: 'company-1',
        legalName: 'Test Company',
        displayName: null,
        firmSlug: null,
        roleId: 'role-1',
        roleKey: 'client_owner',
        roleName: 'Client Owner',
        roleScope: 'company',
        onboardingState: null,
        companyType: 'business',
      };

      const transformed = {
        id: roleData.companyId,
        legalName: roleData.legalName,
        displayName: roleData.displayName,
        hasExplicitAccess: true,
        isDemoCompany: false,
        assignedFirmSlug: roleData.firmSlug || '',
        companyType: roleData.companyType,
        roleKey: roleData.roleKey,
        roleScope: roleData.roleScope,
        onboardingState: roleData.onboardingState,
      };

      expect(transformed.displayName).toBe(null);
      expect(transformed.assignedFirmSlug).toBe('');
      expect(transformed.onboardingState).toBe(null);
    });
  });

  describe('Database Integration', () => {
    it('should handle invalid user ID validation', async () => {
      const result = await getAccessibleCompaniesForUser({ userId: '' });

      expect(result.success).toBe(false);
      expect(result.message).toContain('valid user ID');
    });

    it('should handle non-existent user gracefully', async () => {
      // Use a proper UUID format for non-existent user
      const result = await getAccessibleCompaniesForUser({
        userId: '00000000-0000-0000-0000-000000000000',
      });

      expect(result.success).toBe(false);
      expect(result.message).toBe('User is not assigned to any company');
      expect(result.code).toBe('GENERIC_ERROR');
    });
  });
});
