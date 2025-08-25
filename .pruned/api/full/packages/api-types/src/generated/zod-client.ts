import { makeApi, Zodios, type ZodiosOptions } from '@zodios/core';
import { z } from 'zod';

const loginUser_Body = z
  .object({ email: z.string().email(), password: z.string().min(8) })
  .passthrough();
const HealthResponse = z.object({ ok: z.boolean() }).passthrough();
const Email = z.string();
const LoginForm = z
  .object({ email: z.string().email(), password: z.string().min(8) })
  .passthrough();
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
const CompanyType = z.enum(['business', 'individual', 'accounting_firm']);
const AuthCompanyContext = z
  .object({
    id: z.string().uuid(),
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
  })
  .passthrough();
const AuthUserContext = z
  .object({
    id: z.string().uuid(),
    email: z.string().email(),
    firstname: z.string(),
    lastname: z.string().optional(),
    isPlatformUser: z.boolean().optional(),
    platformUserKey: z.string().nullish(),
    currentCompanyId: z.string().uuid(),
    currentCompany: z
      .object({
        id: z.string().uuid(),
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
      })
      .passthrough(),
    companies: z.array(
      z
        .object({
          id: z.string().uuid(),
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
        })
        .passthrough(),
    ),
  })
  .passthrough();
const AuthContextData = z
  .object({
    user: z
      .object({
        id: z.string().uuid(),
        email: z.string().email(),
        firstname: z.string(),
        lastname: z.string().optional(),
        isPlatformUser: z.boolean().optional(),
        platformUserKey: z.string().nullish(),
        currentCompanyId: z.string().uuid(),
        currentCompany: z
          .object({
            id: z.string().uuid(),
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
          })
          .passthrough(),
        companies: z.array(
          z
            .object({
              id: z.string().uuid(),
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
            })
            .passthrough(),
        ),
      })
      .passthrough(),
    csrfToken: z.string().optional(),
  })
  .passthrough();
const LoginResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z
      .object({
        user: z
          .object({
            id: z.string().uuid(),
            email: z.string().email(),
            firstname: z.string(),
            lastname: z.string().optional(),
            isPlatformUser: z.boolean().optional(),
            platformUserKey: z.string().nullish(),
            currentCompanyId: z.string().uuid(),
            currentCompany: z
              .object({
                id: z.string().uuid(),
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
              })
              .passthrough(),
            companies: z.array(
              z
                .object({
                  id: z.string().uuid(),
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
                })
                .passthrough(),
            ),
          })
          .passthrough(),
        csrfToken: z.string().optional(),
      })
      .passthrough()
      .optional(),
    error: z.object({}).partial().passthrough().optional(),
    code: z.string().optional(),
  })
  .passthrough();
const ApiResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z.unknown().optional(),
    error: z.unknown().optional(),
    code: z.string().optional(),
  })
  .passthrough();
const RefreshResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z.object({ csrfToken: z.string() }).partial().passthrough().optional(),
    error: z.object({}).partial().passthrough().optional(),
    code: z.string().optional(),
  })
  .passthrough();
const MeResponse = z
  .object({
    success: z.boolean(),
    message: z.string(),
    data: z
      .object({
        user: z
          .object({
            id: z.string().uuid(),
            email: z.string().email(),
            firstname: z.string(),
            lastname: z.string().optional(),
            isPlatformUser: z.boolean().optional(),
            platformUserKey: z.string().nullish(),
            currentCompanyId: z.string().uuid(),
            currentCompany: z
              .object({
                id: z.string().uuid(),
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
              })
              .passthrough(),
            companies: z.array(
              z
                .object({
                  id: z.string().uuid(),
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
                })
                .passthrough(),
            ),
          })
          .passthrough(),
        csrfToken: z.string().optional(),
      })
      .passthrough()
      .optional(),
    error: z.object({}).partial().passthrough().optional(),
    code: z.string().optional(),
  })
  .passthrough();

export const schemas = {
  loginUser_Body,
  HealthResponse,
  Email,
  LoginForm,
  RoleKey,
  RoleScope,
  CompanyType,
  AuthCompanyContext,
  AuthUserContext,
  AuthContextData,
  LoginResponse,
  ApiResponse,
  RefreshResponse,
  MeResponse,
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
    response: z
      .object({
        success: z.boolean(),
        message: z.string(),
        data: z
          .object({
            user: z
              .object({
                id: z.string().uuid(),
                email: z.string().email(),
                firstname: z.string(),
                lastname: z.string().optional(),
                isPlatformUser: z.boolean().optional(),
                platformUserKey: z.string().nullish(),
                currentCompanyId: z.string().uuid(),
                currentCompany: z
                  .object({
                    id: z.string().uuid(),
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
                  })
                  .passthrough(),
                companies: z.array(
                  z
                    .object({
                      id: z.string().uuid(),
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
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
            csrfToken: z.string().optional(),
          })
          .passthrough()
          .optional(),
        error: z.object({}).partial().passthrough().optional(),
        code: z.string().optional(),
      })
      .passthrough(),
    errors: [
      {
        status: 400,
        description: `Invalid request`,
        schema: z
          .object({
            success: z.boolean(),
            message: z.string(),
            data: z.unknown().optional(),
            error: z.unknown().optional(),
            code: z.string().optional(),
          })
          .passthrough(),
      },
      {
        status: 401,
        description: `Invalid credentials`,
        schema: z
          .object({
            success: z.boolean(),
            message: z.string(),
            data: z.unknown().optional(),
            error: z.unknown().optional(),
            code: z.string().optional(),
          })
          .passthrough(),
      },
    ],
  },
  {
    method: 'post',
    path: '/auth/logout',
    alias: 'logoutUser',
    description: `Logout user by invalidating their session tokens`,
    requestFormat: 'json',
    response: z
      .object({
        success: z.boolean(),
        message: z.string(),
        data: z.unknown().optional(),
        error: z.unknown().optional(),
        code: z.string().optional(),
      })
      .passthrough(),
  },
  {
    method: 'get',
    path: '/auth/me',
    alias: 'getCurrentUser',
    description: `Retrieve the current authenticated user&#x27;s profile information`,
    requestFormat: 'json',
    response: z
      .object({
        success: z.boolean(),
        message: z.string(),
        data: z
          .object({
            user: z
              .object({
                id: z.string().uuid(),
                email: z.string().email(),
                firstname: z.string(),
                lastname: z.string().optional(),
                isPlatformUser: z.boolean().optional(),
                platformUserKey: z.string().nullish(),
                currentCompanyId: z.string().uuid(),
                currentCompany: z
                  .object({
                    id: z.string().uuid(),
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
                  })
                  .passthrough(),
                companies: z.array(
                  z
                    .object({
                      id: z.string().uuid(),
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
                    })
                    .passthrough(),
                ),
              })
              .passthrough(),
            csrfToken: z.string().optional(),
          })
          .passthrough()
          .optional(),
        error: z.object({}).partial().passthrough().optional(),
        code: z.string().optional(),
      })
      .passthrough(),
    errors: [
      {
        status: 401,
        description: `Unauthorized`,
        schema: z
          .object({
            success: z.boolean(),
            message: z.string(),
            data: z.unknown().optional(),
            error: z.unknown().optional(),
            code: z.string().optional(),
          })
          .passthrough(),
      },
    ],
  },
  {
    method: 'post',
    path: '/auth/refresh',
    alias: 'refreshToken',
    description: `Refresh the access token using a valid refresh token`,
    requestFormat: 'json',
    response: z
      .object({
        success: z.boolean(),
        message: z.string(),
        data: z.object({ csrfToken: z.string() }).partial().passthrough().optional(),
        error: z.object({}).partial().passthrough().optional(),
        code: z.string().optional(),
      })
      .passthrough(),
  },
  {
    method: 'get',
    path: '/health',
    alias: 'healthCheck',
    description: `Check the health status of the API service`,
    requestFormat: 'json',
    response: z.object({ ok: z.boolean() }).passthrough(),
  },
]);

export const api = new Zodios(endpoints);

export function createApiClient(baseUrl: string, options?: ZodiosOptions) {
  return new Zodios(baseUrl, endpoints, options);
}
