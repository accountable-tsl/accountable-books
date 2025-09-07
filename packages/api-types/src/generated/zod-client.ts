import { makeApi, Zodios, type ZodiosOptions } from '@zodios/core';
import { z } from 'zod';

const loginUser_Body = z.looseObject({ email: z.email(), password: z.string().min(8) });
const AuthCompanyContext = z.looseObject({
    id: z.uuid(),
    legalName: z.string(),
    displayName: z.string().nullish(),
    assignedFirmSlug: z.string(),
    hasExplicitAccess: z.boolean(),
    roleKey: z
      .enum([
        'super_admin',
        'support_admin',
        'support_agent',
        'firm_owner',
        'firm_admin',
        'accountant',
        'staff_accountant',
        'client_owner',
        'client_admin',
        'client_user',
      ])
      .nullish(),
    roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
    isDemoCompany: z.boolean(),
    companyType: z.enum(['business', 'individual', 'accounting_firm']),
  });
const AuthContextData = z.looseObject({
    user: z.looseObject({
              id: z.uuid(),
              email: z.email(),
              firstname: z.string(),
              lastname: z.string().optional(),
              isPlatformUser: z.boolean().optional(),
              platformUserKey: z.string().nullish(),
              currentCompanyId: z.uuid(),
              currentCompany: z.looseObject({
                          id: z.uuid(),
                          legalName: z.string(),
                          displayName: z.string().nullish(),
                          assignedFirmSlug: z.string(),
                          hasExplicitAccess: z.boolean(),
                          roleKey: z
                            .enum([
                              'super_admin',
                              'support_admin',
                              'support_agent',
                              'firm_owner',
                              'firm_admin',
                              'accountant',
                              'staff_accountant',
                              'client_owner',
                              'client_admin',
                              'client_user',
                            ])
                            .nullish(),
                          roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                          isDemoCompany: z.boolean(),
                          companyType: z.enum(['business', 'individual', 'accounting_firm']),
                        }),
              companies: z.array(
                z.looseObject({
                                id: z.uuid(),
                                legalName: z.string(),
                                displayName: z.string().nullish(),
                                assignedFirmSlug: z.string(),
                                hasExplicitAccess: z.boolean(),
                                roleKey: z
                                  .enum([
                                    'super_admin',
                                    'support_admin',
                                    'support_agent',
                                    'firm_owner',
                                    'firm_admin',
                                    'accountant',
                                    'staff_accountant',
                                    'client_owner',
                                    'client_admin',
                                    'client_user',
                                  ])
                                  .nullish(),
                                roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                isDemoCompany: z.boolean(),
                                companyType: z.enum(['business', 'individual', 'accounting_firm']),
                              }),
              ),
            }),
    csrfToken: z.string().optional(),
  });
const AuthUserContext = z.looseObject({
    id: z.uuid(),
    email: z.email(),
    firstname: z.string(),
    lastname: z.string().optional(),
    isPlatformUser: z.boolean().optional(),
    platformUserKey: z.string().nullish(),
    currentCompanyId: z.uuid(),
    currentCompany: z.looseObject({
            id: z.uuid(),
            legalName: z.string(),
            displayName: z.string().nullish(),
            assignedFirmSlug: z.string(),
            hasExplicitAccess: z.boolean(),
            roleKey: z
              .enum([
                'super_admin',
                'support_admin',
                'support_agent',
                'firm_owner',
                'firm_admin',
                'accountant',
                'staff_accountant',
                'client_owner',
                'client_admin',
                'client_user',
              ])
              .nullish(),
            roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
            isDemoCompany: z.boolean(),
            companyType: z.enum(['business', 'individual', 'accounting_firm']),
          }),
    companies: z.array(
      z.looseObject({
                  id: z.uuid(),
                  legalName: z.string(),
                  displayName: z.string().nullish(),
                  assignedFirmSlug: z.string(),
                  hasExplicitAccess: z.boolean(),
                  roleKey: z
                    .enum([
                      'super_admin',
                      'support_admin',
                      'support_agent',
                      'firm_owner',
                      'firm_admin',
                      'accountant',
                      'staff_accountant',
                      'client_owner',
                      'client_admin',
                      'client_user',
                    ])
                    .nullish(),
                  roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                  isDemoCompany: z.boolean(),
                  companyType: z.enum(['business', 'individual', 'accounting_firm']),
                }),
    ),
  });
const LoginForm = z.looseObject({ email: z.email(), password: z.string().min(8) });
const LoginResponse = z.looseObject({
    success: z.boolean(),
    message: z.string(),
    data: z.looseObject({
            user: z.looseObject({
                          id: z.uuid(),
                          email: z.email(),
                          firstname: z.string(),
                          lastname: z.string().optional(),
                          isPlatformUser: z.boolean().optional(),
                          platformUserKey: z.string().nullish(),
                          currentCompanyId: z.uuid(),
                          currentCompany: z.looseObject({
                                          id: z.uuid(),
                                          legalName: z.string(),
                                          displayName: z.string().nullish(),
                                          assignedFirmSlug: z.string(),
                                          hasExplicitAccess: z.boolean(),
                                          roleKey: z
                                            .enum([
                                              'super_admin',
                                              'support_admin',
                                              'support_agent',
                                              'firm_owner',
                                              'firm_admin',
                                              'accountant',
                                              'staff_accountant',
                                              'client_owner',
                                              'client_admin',
                                              'client_user',
                                            ])
                                            .nullish(),
                                          roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                          isDemoCompany: z.boolean(),
                                          companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                        }),
                          companies: z.array(
                            z.looseObject({
                                                id: z.uuid(),
                                                legalName: z.string(),
                                                displayName: z.string().nullish(),
                                                assignedFirmSlug: z.string(),
                                                hasExplicitAccess: z.boolean(),
                                                roleKey: z
                                                  .enum([
                                                    'super_admin',
                                                    'support_admin',
                                                    'support_agent',
                                                    'firm_owner',
                                                    'firm_admin',
                                                    'accountant',
                                                    'staff_accountant',
                                                    'client_owner',
                                                    'client_admin',
                                                    'client_user',
                                                  ])
                                                  .nullish(),
                                                roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                isDemoCompany: z.boolean(),
                                                companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                              }),
                          ),
                        }),
            csrfToken: z.string().optional(),
          })
      .optional(),
    error: z.looseObject({}).partial().optional(),
    code: z.string().optional(),
  });
const MeResponse = z.looseObject({
    success: z.boolean(),
    message: z.string(),
    data: z.looseObject({
            user: z.looseObject({
                          id: z.uuid(),
                          email: z.email(),
                          firstname: z.string(),
                          lastname: z.string().optional(),
                          isPlatformUser: z.boolean().optional(),
                          platformUserKey: z.string().nullish(),
                          currentCompanyId: z.uuid(),
                          currentCompany: z.looseObject({
                                          id: z.uuid(),
                                          legalName: z.string(),
                                          displayName: z.string().nullish(),
                                          assignedFirmSlug: z.string(),
                                          hasExplicitAccess: z.boolean(),
                                          roleKey: z
                                            .enum([
                                              'super_admin',
                                              'support_admin',
                                              'support_agent',
                                              'firm_owner',
                                              'firm_admin',
                                              'accountant',
                                              'staff_accountant',
                                              'client_owner',
                                              'client_admin',
                                              'client_user',
                                            ])
                                            .nullish(),
                                          roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                          isDemoCompany: z.boolean(),
                                          companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                        }),
                          companies: z.array(
                            z.looseObject({
                                                id: z.uuid(),
                                                legalName: z.string(),
                                                displayName: z.string().nullish(),
                                                assignedFirmSlug: z.string(),
                                                hasExplicitAccess: z.boolean(),
                                                roleKey: z
                                                  .enum([
                                                    'super_admin',
                                                    'support_admin',
                                                    'support_agent',
                                                    'firm_owner',
                                                    'firm_admin',
                                                    'accountant',
                                                    'staff_accountant',
                                                    'client_owner',
                                                    'client_admin',
                                                    'client_user',
                                                  ])
                                                  .nullish(),
                                                roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                isDemoCompany: z.boolean(),
                                                companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                              }),
                          ),
                        }),
            csrfToken: z.string().optional(),
          })
      .optional(),
    error: z.looseObject({}).partial().optional(),
    code: z.string().optional(),
  });
const RefreshResponse = z.looseObject({
    success: z.boolean(),
    message: z.string(),
    data: z.looseObject({ csrfToken: z.string() }).partial().optional(),
    error: z.looseObject({}).partial().optional(),
    code: z.string().optional(),
  });
const ApiResponse = z.looseObject({
    success: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
    error: z.unknown().optional(),
    code: z.string().optional(),
  });
const CompanyType = z.enum(['business', 'individual', 'accounting_firm']);
const Email = z.string();
const HealthResponse = z.looseObject({ ok: z.boolean() });
const RoleKey = z.enum([
  'super_admin',
  'support_admin',
  'support_agent',
  'firm_owner',
  'firm_admin',
  'accountant',
  'staff_accountant',
  'client_owner',
  'client_admin',
  'client_user',
]);
const RoleScope = z.enum(['platform', 'firm', 'company']);

export const schemas = {
  loginUser_Body,
  AuthCompanyContext,
  AuthContextData,
  AuthUserContext,
  LoginForm,
  LoginResponse,
  MeResponse,
  RefreshResponse,
  ApiResponse,
  CompanyType,
  Email,
  HealthResponse,
  RoleKey,
  RoleScope,
};

const endpoints = makeApi([
  {
    method: 'post',
    path: '/auth/login',
    alias: 'loginUser',
    description: `Authenticate user with email and password`,
    requestFormat: 'json',
    parameters: [
      {
        name: 'body',
        type: 'Body',
        schema: loginUser_Body,
      },
    ],
    response: z.looseObject({
            success: z.boolean(),
            message: z.string(),
            data: z.looseObject({
                        user: z.looseObject({
                                          id: z.uuid(),
                                          email: z.email(),
                                          firstname: z.string(),
                                          lastname: z.string().optional(),
                                          isPlatformUser: z.boolean().optional(),
                                          platformUserKey: z.string().nullish(),
                                          currentCompanyId: z.uuid(),
                                          currentCompany: z.looseObject({
                                                              id: z.uuid(),
                                                              legalName: z.string(),
                                                              displayName: z.string().nullish(),
                                                              assignedFirmSlug: z.string(),
                                                              hasExplicitAccess: z.boolean(),
                                                              roleKey: z
                                                                .enum([
                                                                  'super_admin',
                                                                  'support_admin',
                                                                  'support_agent',
                                                                  'firm_owner',
                                                                  'firm_admin',
                                                                  'accountant',
                                                                  'staff_accountant',
                                                                  'client_owner',
                                                                  'client_admin',
                                                                  'client_user',
                                                                ])
                                                                .nullish(),
                                                              roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                              isDemoCompany: z.boolean(),
                                                              companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                                            }),
                                          companies: z.array(
                                            z.looseObject({
                                                                    id: z.uuid(),
                                                                    legalName: z.string(),
                                                                    displayName: z.string().nullish(),
                                                                    assignedFirmSlug: z.string(),
                                                                    hasExplicitAccess: z.boolean(),
                                                                    roleKey: z
                                                                      .enum([
                                                                        'super_admin',
                                                                        'support_admin',
                                                                        'support_agent',
                                                                        'firm_owner',
                                                                        'firm_admin',
                                                                        'accountant',
                                                                        'staff_accountant',
                                                                        'client_owner',
                                                                        'client_admin',
                                                                        'client_user',
                                                                      ])
                                                                      .nullish(),
                                                                    roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                                    isDemoCompany: z.boolean(),
                                                                    companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                                                  }),
                                          ),
                                        }),
                        csrfToken: z.string().optional(),
                      })
              .optional(),
            error: z.looseObject({}).partial().optional(),
            code: z.string().optional(),
          }),
    errors: [
      {
        status: 400,
        description: `Invalid request`,
        schema: z.looseObject({
                    success: z.boolean(),
                    message: z.string(),
                    data: z.unknown().optional(),
                    error: z.unknown().optional(),
                    code: z.string().optional(),
                  }),
      },
      {
        status: 401,
        description: `Invalid credentials`,
        schema: z.looseObject({
                    success: z.boolean(),
                    message: z.string(),
                    data: z.unknown().optional(),
                    error: z.unknown().optional(),
                    code: z.string().optional(),
                  }),
      },
    ],
  },
  {
    method: 'post',
    path: '/auth/logout',
    alias: 'logoutUser',
    description: `Logout user by invalidating their session tokens`,
    requestFormat: 'json',
    response: z.looseObject({
            success: z.boolean(),
            message: z.string(),
            data: z.unknown().optional(),
            error: z.unknown().optional(),
            code: z.string().optional(),
          }),
  },
  {
    method: 'get',
    path: '/auth/me',
    alias: 'getCurrentUser',
    description: `Retrieve the current authenticated user&#x27;s profile information`,
    requestFormat: 'json',
    response: z.looseObject({
            success: z.boolean(),
            message: z.string(),
            data: z.looseObject({
                        user: z.looseObject({
                                          id: z.uuid(),
                                          email: z.email(),
                                          firstname: z.string(),
                                          lastname: z.string().optional(),
                                          isPlatformUser: z.boolean().optional(),
                                          platformUserKey: z.string().nullish(),
                                          currentCompanyId: z.uuid(),
                                          currentCompany: z.looseObject({
                                                              id: z.uuid(),
                                                              legalName: z.string(),
                                                              displayName: z.string().nullish(),
                                                              assignedFirmSlug: z.string(),
                                                              hasExplicitAccess: z.boolean(),
                                                              roleKey: z
                                                                .enum([
                                                                  'super_admin',
                                                                  'support_admin',
                                                                  'support_agent',
                                                                  'firm_owner',
                                                                  'firm_admin',
                                                                  'accountant',
                                                                  'staff_accountant',
                                                                  'client_owner',
                                                                  'client_admin',
                                                                  'client_user',
                                                                ])
                                                                .nullish(),
                                                              roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                              isDemoCompany: z.boolean(),
                                                              companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                                            }),
                                          companies: z.array(
                                            z.looseObject({
                                                                    id: z.uuid(),
                                                                    legalName: z.string(),
                                                                    displayName: z.string().nullish(),
                                                                    assignedFirmSlug: z.string(),
                                                                    hasExplicitAccess: z.boolean(),
                                                                    roleKey: z
                                                                      .enum([
                                                                        'super_admin',
                                                                        'support_admin',
                                                                        'support_agent',
                                                                        'firm_owner',
                                                                        'firm_admin',
                                                                        'accountant',
                                                                        'staff_accountant',
                                                                        'client_owner',
                                                                        'client_admin',
                                                                        'client_user',
                                                                      ])
                                                                      .nullish(),
                                                                    roleScope: z.enum(['platform', 'firm', 'company']).nullish(),
                                                                    isDemoCompany: z.boolean(),
                                                                    companyType: z.enum(['business', 'individual', 'accounting_firm']),
                                                                  }),
                                          ),
                                        }),
                        csrfToken: z.string().optional(),
                      })
              .optional(),
            error: z.looseObject({}).partial().optional(),
            code: z.string().optional(),
          }),
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z.looseObject({
                    success: z.boolean(),
                    message: z.string(),
                    data: z.unknown().optional(),
                    error: z.unknown().optional(),
                    code: z.string().optional(),
                  }),
      },
    ],
  },
  {
    method: 'post',
    path: '/auth/refresh',
    alias: 'refreshToken',
    description: `Refresh the access token using a valid refresh token`,
    requestFormat: 'json',
    response: z.looseObject({
            success: z.boolean(),
            message: z.string(),
            data: z.looseObject({ csrfToken: z.string() }).partial().optional(),
            error: z.looseObject({}).partial().optional(),
            code: z.string().optional(),
          }),
  },
  {
    method: 'get',
    path: '/health',
    alias: 'healthCheck',
    description: `Check the health status of the API service`,
    requestFormat: 'json',
    response: z.looseObject({ ok: z.boolean() }),
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}
