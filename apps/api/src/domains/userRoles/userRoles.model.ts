import { type Knex } from 'knex';
import { knexClient } from '../../db/knexClient.js';
import { type ApiResponse } from '../../core/types/api.types.js';
import { errorResponse, successResponse, AppError } from '../../shared/utils/response.utils.js';
import { type RoleKey, type RoleScope, roleKey } from '../roles/roles.types.js';
import type {
  AccessibleCompanies,
  AccessibleCompaniesResponse,
  GrantAccessResponse,
  GrantAccessToFirmClient,
  GrantDirectAccess,
  UserCompanyRoleAssignmentRes,
  UserCompanyRoleWithDetails,
  CompanyBaseFields,
} from './userRoles.types.js';
import { logger } from '../../shared/utils/logger.js';

/**
 * Get roles where user is directly assigned to companies
 */
const getDirectCompanyRoles = async (
  userId: string,
  trx?: Knex.Transaction,
): Promise<UserCompanyRoleWithDetails[]> => {
  if (!userId?.trim()) {
    throw new AppError('Invalid user ID provided for direct company roles');
  }

  const knex = trx || knexClient;
  const startTime = Date.now();

  try {
    // Query direct company roles
    const directRoles = await knex('user_company_roles as ucr')
      .join('roles as r', 'ucr.role_id', 'r.id')
      .join('companies as c', 'ucr.company_id', 'c.id')
      .leftJoin('accounting_firms_meta as af', 'c.assigned_firm_id', 'af.company_id')
      .where({ 'ucr.user_id': userId, 'ucr.is_deleted': false })
      .select(
        'ucr.user_id as userId',
        'c.short_code as companyId',
        'c.legal_name as legalName',
        'c.display_name as displayName',
        'af.slug as firmSlug',
        'c.type as companyType',
        'r.id as roleId',
        'r.key as roleKey',
        'r.name as roleName',
        'r.scope as roleScope',
        'c.onboarding_state as onboardingState',
        'c.is_demo_company as isDemoCompany',
      );

    // Log only if no results or slow query
    const duration = Date.now() - startTime;
    if (directRoles.length === 0) {
      logger.debug({ userId, duration }, 'No direct company roles found');
    } else if (duration > 1000) {
      logger.warn({ userId, duration, resultCount: directRoles.length }, 'Slow direct roles query');
    }

    return directRoles;
  } catch (error) {
    const duration = Date.now() - startTime;
    logger.error(
      {
        userId,
        duration,
        error,
      },
      'Direct company roles query failed',
    );
    throw new AppError('Failed to fetch direct company roles', error);
  }
};

/**
 * Get roles where user accesses companies through their accounting firm
 */
const getFirmMediatedRoles = async (
  userId: string,
  trx?: Knex.Transaction,
): Promise<UserCompanyRoleWithDetails[]> => {
  if (!userId?.trim()) {
    throw new AppError('Invalid user ID provided for firm-mediated roles');
  }

  const knex = trx || knexClient;
  const startTime = Date.now();

  try {
    // Query firm-mediated roles
    const rolesViaFirmAssignments = await knex('firm_user_client_assignments as fuca')
      .join('companies as c', 'fuca.client_company_id', 'c.id')
      .join('client_firm_assignments as cfa', 'fuca.client_company_id', 'cfa.client_company_id')
      .join('user_company_roles as ucr', function () {
        // Critical join: ensure user's role is at the firm assigned to this client
        this.on('ucr.user_id', 'fuca.firm_staff_user_id') // User matches
          .andOn('ucr.company_id', 'cfa.accounting_firm_company_id'); // Role is at the assigned firm
      })
      .leftJoin('accounting_firms_meta as af', 'c.assigned_firm_id', 'af.company_id')
      .join('roles as r', 'ucr.role_id', 'r.id')
      .where({
        'fuca.firm_staff_user_id': userId,
        'fuca.is_deleted': false,
        'ucr.is_deleted': false,
      })
      .select(
        'fuca.firm_staff_user_id as userId',
        'c.short_code as companyId',
        'c.legal_name as legalName',
        'c.display_name as displayName',
        'c.type as companyType',
        'af.slug as firmSlug',
        'r.id as roleId',
        'r.key as roleKey',
        'r.name as roleName',
        'r.scope as roleScope',
        'c.onboarding_state as onboardingState',
        'c.is_demo_company as isDemoCompany',
      );

    // Log only if slow query
    const duration = Date.now() - startTime;
    if (duration > 1000) {
      logger.warn(
        { userId, duration, resultCount: rolesViaFirmAssignments.length },
        'Slow firm roles query',
      );
    }

    return rolesViaFirmAssignments;
  } catch (error) {
    logger.error(
      {
        userId,
        duration: Date.now() - startTime,
        error,
      },
      'Firm-mediated roles query failed',
    );
    throw new AppError('Failed to fetch firm-mediated roles', error);
  }
};

/**
 * Get demo companies that user doesn't already have access to
 */
const getDemoCompanies = async ({
  excludeCompanyIds,
  trx,
}: {
  excludeCompanyIds?: string[];
  trx?: Knex.Transaction;
}): Promise<CompanyBaseFields[]> => {
  const knex = trx || knexClient;
  const startTime = Date.now();

  try {
    const demoCompanies = await knex('companies as c')
      .join('accounting_firms_meta as af', 'c.assigned_firm_id', 'af.company_id')
      .select(
        'c.legal_name as legalName',
        'c.display_name as displayName',
        'c.short_code as companyId',
        'c.type as companyType',
        'af.slug as firmSlug',
      )
      .where('is_demo_company', true)
      .whereNotIn('c.short_code', excludeCompanyIds || []);

    // Only log if slow or excessive demo companies
    const duration = Date.now() - startTime;
    if (duration > 500 || demoCompanies.length > 20) {
      logger.debug({ duration, resultCount: demoCompanies.length }, 'Demo companies query metrics');
    }

    return demoCompanies;
  } catch (error) {
    logger.error(
      {
        duration: Date.now() - startTime,
        error,
      },
      'Demo companies query failed',
    );
    throw new AppError('Failed to fetch demo companies', error);
  }
};

/**
 * Transform user company role to accessible company format
 */
const userRoleToAccessibleCompany = (role: UserCompanyRoleWithDetails): AccessibleCompanies => ({
  id: role.companyId,
  legalName: role.legalName,
  displayName: role.displayName,
  assignedFirmSlug: role.firmSlug || '',
  companyType: role.companyType,
  hasExplicitAccess: true,
  isDemoCompany: role.isDemoCompany || false,
  roleKey: role.roleKey,
  roleScope: role.roleScope,
  onboardingState: role.onboardingState,
});

/**
 * Transform demo company to accessible company format
 */
const demoToAccessibleCompany = (demo: CompanyBaseFields): AccessibleCompanies => ({
  id: demo.companyId,
  legalName: demo.legalName,
  displayName: demo.displayName,
  assignedFirmSlug: demo.firmSlug || '',
  companyType: demo.companyType,
  hasExplicitAccess: false,
  isDemoCompany: true,
  roleKey: null,
  roleScope: null,
  onboardingState: null,
});

/**
 * Determine platform access from user roles
 */
const determinePlatformAccess = (
  userRoles: UserCompanyRoleWithDetails[],
): {
  isPlatformUser: boolean;
  platformUserKey: RoleKey | null;
} => {
  const platformRoleHierarchy: RoleKey[] = [
    roleKey.enum.super_admin,
    roleKey.enum.support_admin,
    roleKey.enum.support_agent,
  ];

  const platformRoleAssignments = userRoles.filter((r) => r.roleScope === 'platform');

  const highestPlatformKey =
    platformRoleAssignments
      .map((r) => r.roleKey)
      .find((roleKey) => platformRoleHierarchy.includes(roleKey)) || null;

  return {
    isPlatformUser: !!highestPlatformKey,
    platformUserKey: highestPlatformKey,
  };
};

/**
 * Get all user company role assignments (direct + firm-mediated)
 */
const getUserCompanyRoleAssignments = async (
  userId: string,
  trx?: Knex.Transaction,
): Promise<ApiResponse<UserCompanyRoleAssignmentRes[]>> => {
  if (!userId?.trim()) {
    return errorResponse('Please provide a valid user ID');
  }

  try {
    // Get user role assignments (main entry point)

    // Execute both queries in parallel for better performance
    const [directRoles, firmRoles] = await Promise.all([
      getDirectCompanyRoles(userId, trx),
      getFirmMediatedRoles(userId, trx),
    ]);

    const allRoles = [...directRoles, ...firmRoles];

    if (!allRoles.length) {
      logger.warn({ userId }, 'User has no role assignments');
      return errorResponse('User is not assigned to any company');
    }

    // No transformation needed - queries already return the right shape
    const result: UserCompanyRoleAssignmentRes[] = allRoles;

    // Log role distribution for debugging
    logger.debug(
      {
        userId,
        directRoleCount: directRoles.length,
        firmRoleCount: firmRoles.length,
        totalRoleCount: result.length,
      },
      'User role assignments retrieved',
    );

    return successResponse('Successfully fetched user roles', result);
  } catch (error) {
    logger.error({ userId, error }, 'Failed to fetch user roles');
    return errorResponse('Failed to fetch user roles', error);
  }
};

/**
 * Given a user ID, return an array of companies that the user has access to,
 * along with the highest platform role the user has been assigned, if any.
 */
export const getAccessibleCompaniesForUser = async ({
  userId,
  trx,
}: {
  userId: string;
  trx?: Knex.Transaction;
}): Promise<ApiResponse<AccessibleCompaniesResponse>> => {
  const startTime = Date.now();

  try {
    // Main entry point for auth context building

    // Get user's role assignments
    const rolesResponse = await getUserCompanyRoleAssignments(userId, trx);
    if (!rolesResponse.success || !rolesResponse.data) {
      return errorResponse(rolesResponse.message);
    }

    const userRoles = rolesResponse.data;

    // Map explicit company access
    const explicitCompanies = userRoles.map(userRoleToAccessibleCompany);

    // Get demo companies (excluding those user already has access to)
    const knownCompanyIds = userRoles.map((r) => r.companyId);
    const demoCompanies = await getDemoCompanies({ excludeCompanyIds: knownCompanyIds, trx });
    const mappedDemoCompanies = demoCompanies.map(demoToAccessibleCompany);

    // Determine platform access
    const { isPlatformUser, platformUserKey } = determinePlatformAccess(userRoles);

    // Combine all accessible companies
    const accessibleCompanies = [...explicitCompanies, ...mappedDemoCompanies];

    if (!accessibleCompanies.length && !isPlatformUser) {
      logger.warn({ userId }, 'User has no access to any company');
      return errorResponse('User has no access to any company');
    }

    // Log summary for performance monitoring
    const duration = Date.now() - startTime;
    logger.debug(
      {
        userId,
        duration,
        explicitCount: explicitCompanies.length,
        demoCount: mappedDemoCompanies.length,
        totalCount: accessibleCompanies.length,
        isPlatformUser,
      },
      'Accessible companies determined',
    );

    // Warn on slow auth context building (critical path)
    if (duration > 500) {
      logger.warn({ userId, duration }, 'Slow auth context building');
    }

    const response: AccessibleCompaniesResponse = {
      accessibleCompanies,
      ...(isPlatformUser && {
        isPlatformUser,
        platformUserKey: platformUserKey || undefined,
      }),
    };

    return successResponse('User has access to these companies', response);
  } catch (error) {
    logger.error(
      { userId, duration: Date.now() - startTime, error },
      'Failed to get accessible companies',
    );
    return errorResponse('Internal server error', error);
  }
};

/**
 * Helper function to check if a user has access to a specific company
 */
export const hasAccessToCompany = async ({
  companyId: companyIdentifier,
  userContext,
}: {
  companyId: string;
  userContext: AccessibleCompaniesResponse;
}): Promise<{
  hasAccess: boolean;
  roleKey: RoleKey | null;
  roleScope: RoleScope | null;
  accessReason: string;
}> => {
  try {
    const companyResult = await knexClient
      .select('short_code')
      .from('companies')
      .where('id', companyIdentifier)
      .first();

    if (!companyResult) {
      return { hasAccess: false, roleKey: null, roleScope: null, accessReason: 'none' };
    }

    const { isPlatformUser = false, platformUserKey, accessibleCompanies = [] } = userContext ?? {};

    const company = accessibleCompanies.find((c) => c.id === companyResult.short_code);
    const hasAccess = !!company || !!isPlatformUser;

    const roleKey = company?.roleKey || (isPlatformUser ? platformUserKey : null) || null;
    const roleScope = company?.roleScope || (isPlatformUser ? 'platform' : null);

    const accessReason = company
      ? company.isDemoCompany
        ? 'demo'
        : 'explicit'
      : isPlatformUser
        ? 'platform'
        : 'none';

    return { hasAccess, roleKey, roleScope, accessReason };
  } catch (error) {
    logger.error({ companyIdentifier, error }, 'Error checking company access');
    return { hasAccess: false, roleKey: null, roleScope: null, accessReason: 'none' };
  }
};

/**
 * Get company owner information
 */
export const getCompanyOwner = async ({
  companyId,
  trx,
}: {
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<
  ApiResponse<{
    userId: string;
    firstname: string;
    lastname?: string;
    email: string;
    roleKey: RoleKey;
    roleScope: RoleScope;
  } | null>
> => {
  const knex = trx || knexClient;

  try {
    const companyUUIDResult = await knex
      .select('id')
      .from('companies')
      .where('short_code', companyId)
      .first();

    if (!companyUUIDResult) {
      return successResponse('No company owner found', null);
    }

    const ownerRoleKeys: RoleKey[] = ['firm_owner', 'client_owner'];
    const result = await knex('user_company_roles as ucr')
      .join('roles as r', 'ucr.role_id', 'r.id')
      .join('users as u', 'ucr.user_id', 'u.id')
      .where('ucr.company_id', companyUUIDResult.id)
      .andWhere('ucr.is_deleted', false)
      .whereIn('r.key', ownerRoleKeys)
      .select(
        'ucr.user_id as userId',
        'ucr.company_id as companyId',
        'u.firstname as firstname',
        'u.lastname as lastname',
        'u.email as email',
        'r.key as roleKey',
        'r.scope as roleScope',
      )
      .first();

    if (!result) {
      return successResponse('No company owner found', null);
    }

    return successResponse('Company owner retrieved', {
      userId: result.userId,
      firstname: result.firstname,
      lastname: result.lastname,
      email: result.email,
      roleKey: result.roleKey as RoleKey,
      roleScope: result.roleScope as RoleScope,
    });
  } catch (error) {
    logger.error({ companyId, error }, 'Error getting company owner');
    return errorResponse('An unexpected error occurred', error);
  }
};

/**
 * Check if user is company owner
 */
export const isUserCompanyOwner = async ({
  userId,
  companyId,
  trx,
}: {
  userId: string;
  companyId: string;
  trx?: Knex.Transaction;
}): Promise<boolean> => {
  const knex = trx || knexClient;

  try {
    const ownerRoleKeys: RoleKey[] = ['firm_owner', 'client_owner'];
    const companyUUIDResult = await knex
      .select('id')
      .from('companies')
      .where('short_code', companyId)
      .first();

    if (!companyUUIDResult) {
      return false;
    }

    const result = await knex('user_company_roles as ucr')
      .join('roles as r', 'ucr.role_id', 'r.id')
      .where('ucr.user_id', userId)
      .andWhere('ucr.company_id', companyUUIDResult.id)
      .andWhere('ucr.is_deleted', false)
      .whereIn('r.key', ownerRoleKeys)
      .first();

    return !!result;
  } catch (error) {
    logger.error({ userId, companyId, error }, 'Error checking if user is company owner');
    return false;
  }
};

/**
 * Grant direct access to a company
 */
export const grantDirectAccess = async ({
  trx,
  userId,
  companyId: inputedCompanyId,
  roleKey,
  grantedBy,
}: GrantDirectAccess): Promise<ApiResponse<GrantAccessResponse>> => {
  const executeWithTransaction = async (knex: Knex | Knex.Transaction) => {
    // Validate all entities exist first
    const [companyResult, userExists, roleResult] = await Promise.all([
      knex.select('id').from('companies').where('short_code', inputedCompanyId).first(),
      knex('users').where('id', userId).first(),
      knex('roles').where('key', roleKey).select('id').first(),
    ]);

    if (!companyResult) {
      throw new AppError('Company not found');
    }
    if (!userExists) {
      throw new AppError('User not found');
    }
    if (!roleResult) {
      throw new AppError(`Role '${roleKey}' not found`);
    }

    // Check if user already has a role at this company
    const existingRole = await knex('user_company_roles')
      .where({
        user_id: userId,
        company_id: companyResult.id,
        is_deleted: false,
      })
      .first();

    let action: 'no change' | 'updated' | 'created';

    if (existingRole) {
      if (existingRole.role_id === roleResult.id) {
        action = 'no change';
      } else {
        // Update existing role
        await knex('user_company_roles')
          .where({
            user_id: userId,
            company_id: companyResult.id,
            is_deleted: false,
          })
          .update({
            role_id: roleResult.id,
            updated_by_id: grantedBy,
            updated_at: knex.fn.now(),
          });
        action = 'updated';
      }
    } else {
      // Create new role assignment
      await knex('user_company_roles').insert({
        user_id: userId,
        company_id: companyResult.id,
        role_id: roleResult.id,
        created_by_id: grantedBy,
        updated_by_id: grantedBy,
      });
      action = 'created';
    }

    return { action };
  };

  try {
    if (trx) {
      // Use existing transaction
      const result = await executeWithTransaction(trx);
      // Log access changes for audit trail
      if (result.action !== 'no change') {
        logger.info(
          {
            userId,
            companyId: inputedCompanyId,
            roleKey,
            grantedBy,
            action: result.action,
          },
          'Direct access granted',
        );
      }
      return successResponse('Access granted successfully', result);
    } else {
      // Create new transaction for atomicity
      return await knexClient.transaction(async (newTrx) => {
        const result = await executeWithTransaction(newTrx);
        // Log access changes for audit trail
        if (result.action !== 'no change') {
          logger.info(
            {
              userId,
              companyId: inputedCompanyId,
              roleKey,
              grantedBy,
              action: result.action,
            },
            'Direct access granted',
          );
        }
        return successResponse('Access granted successfully', result);
      });
    }
  } catch (error) {
    logger.error(
      { userId, companyId: inputedCompanyId, roleKey, error },
      'Error granting direct access',
    );
    return errorResponse('Failed to grant access', error);
  }
};

/**
 * Grant access to firm client
 */
export const grantAccessToFirmClient = async ({
  trx,
  userId,
  clientCompanyId,
  firmId,
  roleKey,
  grantedBy,
}: GrantAccessToFirmClient): Promise<ApiResponse<GrantAccessResponse>> => {
  const executeWithTransaction = async (knex: Knex | Knex.Transaction) => {
    // Validate all entities exist first
    const [companyResult, userExists, roleResult] = await Promise.all([
      knex.select('id').from('companies').where('short_code', clientCompanyId).first(),
      knex('users').where('id', userId).first(),
      knex('roles').where('key', roleKey).select('id').first(),
    ]);

    if (!companyResult) {
      throw new AppError('Company not found');
    }
    if (!userExists) {
      throw new AppError('User not found');
    }
    if (!roleResult) {
      throw new AppError(`Role '${roleKey}' not found`);
    }

    // Check if client is assigned to the firm
    const clientAssigned = await knex('client_firm_assignments as cfa')
      .where({
        'cfa.client_company_id': companyResult.id,
        'cfa.accounting_firm_company_id': firmId,
        'cfa.is_deleted': false,
      })
      .first();

    if (!clientAssigned) {
      throw new AppError('Client is not assigned to this firm');
    }

    // Check if user already has access to this client
    const existingAssignment = await knex('firm_user_client_assignments as fuca')
      .where({
        'fuca.firm_staff_user_id': userId,
        'fuca.client_company_id': companyResult.id,
        'fuca.is_deleted': false,
      })
      .first();

    let action: 'no change' | 'updated' | 'created';

    if (existingAssignment) {
      action = 'no change'; // Assignment already exists
    } else {
      // Create new assignment
      await knex('firm_user_client_assignments').insert({
        firm_staff_user_id: userId,
        client_company_id: companyResult.id,
        created_by_id: grantedBy,
        updated_by_id: grantedBy,
      });
      action = 'created';
    }

    return { action };
  };

  try {
    if (trx) {
      // Use existing transaction
      const result = await executeWithTransaction(trx);
      // Log access changes for audit trail
      if (result.action !== 'no change') {
        logger.info(
          {
            userId,
            clientCompanyId,
            firmId,
            roleKey,
            grantedBy,
            action: result.action,
          },
          'Firm client access granted',
        );
      }
      return successResponse('Access granted successfully', result);
    } else {
      // Create new transaction for atomicity
      return await knexClient.transaction(async (newTrx) => {
        const result = await executeWithTransaction(newTrx);
        // Log access changes for audit trail
        if (result.action !== 'no change') {
          logger.info(
            {
              userId,
              clientCompanyId,
              firmId,
              roleKey,
              grantedBy,
              action: result.action,
            },
            'Firm client access granted',
          );
        }
        return successResponse('Access granted successfully', result);
      });
    }
  } catch (error) {
    logger.error(
      { userId, clientCompanyId, firmId, roleKey, error },
      'Error granting firm client access',
    );
    return errorResponse('Failed to grant access', error);
  }
};
