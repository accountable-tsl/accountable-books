export namespace Schemas {
  // <Schemas>
  export type AuthCompanyContext = {
    id: string;
    legalName: string;
    displayName?: (string | null) | undefined;
    assignedFirmSlug: string;
    hasExplicitAccess: boolean;
    roleKey?:
      | (
          | (
              | 'super_admin'
              | 'support_admin'
              | 'support_agent'
              | 'firm_owner'
              | 'firm_admin'
              | 'accountant'
              | 'staff_accountant'
              | 'client_owner'
              | 'client_admin'
              | 'client_user'
            )
          | null
        )
      | undefined;
    roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
    isDemoCompany: boolean;
    companyType: 'business' | 'individual' | 'accounting_firm';
  };
  export type AuthContextData = {
    user: {
      id: string;
      email: string;
      firstname: string;
      lastname?: string | undefined;
      isPlatformUser?: boolean | undefined;
      platformUserKey?: (string | null) | undefined;
      currentCompanyId: string;
      currentCompany: {
        id: string;
        legalName: string;
        displayName?: (string | null) | undefined;
        assignedFirmSlug: string;
        hasExplicitAccess: boolean;
        roleKey?:
          | (
              | (
                  | 'super_admin'
                  | 'support_admin'
                  | 'support_agent'
                  | 'firm_owner'
                  | 'firm_admin'
                  | 'accountant'
                  | 'staff_accountant'
                  | 'client_owner'
                  | 'client_admin'
                  | 'client_user'
                )
              | null
            )
          | undefined;
        roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
        isDemoCompany: boolean;
        companyType: 'business' | 'individual' | 'accounting_firm';
      };
      companies: Array<{
        id: string;
        legalName: string;
        displayName?: (string | null) | undefined;
        assignedFirmSlug: string;
        hasExplicitAccess: boolean;
        roleKey?:
          | (
              | (
                  | 'super_admin'
                  | 'support_admin'
                  | 'support_agent'
                  | 'firm_owner'
                  | 'firm_admin'
                  | 'accountant'
                  | 'staff_accountant'
                  | 'client_owner'
                  | 'client_admin'
                  | 'client_user'
                )
              | null
            )
          | undefined;
        roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
        isDemoCompany: boolean;
        companyType: 'business' | 'individual' | 'accounting_firm';
      }>;
    };
    csrfToken?: string | undefined;
  };
  export type AuthUserContext = {
    id: string;
    email: string;
    firstname: string;
    lastname?: string | undefined;
    isPlatformUser?: boolean | undefined;
    platformUserKey?: (string | null) | undefined;
    currentCompanyId: string;
    currentCompany: {
      id: string;
      legalName: string;
      displayName?: (string | null) | undefined;
      assignedFirmSlug: string;
      hasExplicitAccess: boolean;
      roleKey?:
        | (
            | (
                | 'super_admin'
                | 'support_admin'
                | 'support_agent'
                | 'firm_owner'
                | 'firm_admin'
                | 'accountant'
                | 'staff_accountant'
                | 'client_owner'
                | 'client_admin'
                | 'client_user'
              )
            | null
          )
        | undefined;
      roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
      isDemoCompany: boolean;
      companyType: 'business' | 'individual' | 'accounting_firm';
    };
    companies: Array<{
      id: string;
      legalName: string;
      displayName?: (string | null) | undefined;
      assignedFirmSlug: string;
      hasExplicitAccess: boolean;
      roleKey?:
        | (
            | (
                | 'super_admin'
                | 'support_admin'
                | 'support_agent'
                | 'firm_owner'
                | 'firm_admin'
                | 'accountant'
                | 'staff_accountant'
                | 'client_owner'
                | 'client_admin'
                | 'client_user'
              )
            | null
          )
        | undefined;
      roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
      isDemoCompany: boolean;
      companyType: 'business' | 'individual' | 'accounting_firm';
    }>;
  };
  export type LoginForm = { email: string; password: string };
  export type LoginResponse = {
    success: boolean;
    message: string;
    data?:
      | {
          user: {
            id: string;
            email: string;
            firstname: string;
            lastname?: string | undefined;
            isPlatformUser?: boolean | undefined;
            platformUserKey?: (string | null) | undefined;
            currentCompanyId: string;
            currentCompany: {
              id: string;
              legalName: string;
              displayName?: (string | null) | undefined;
              assignedFirmSlug: string;
              hasExplicitAccess: boolean;
              roleKey?:
                | (
                    | (
                        | 'super_admin'
                        | 'support_admin'
                        | 'support_agent'
                        | 'firm_owner'
                        | 'firm_admin'
                        | 'accountant'
                        | 'staff_accountant'
                        | 'client_owner'
                        | 'client_admin'
                        | 'client_user'
                      )
                    | null
                  )
                | undefined;
              roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
              isDemoCompany: boolean;
              companyType: 'business' | 'individual' | 'accounting_firm';
            };
            companies: Array<{
              id: string;
              legalName: string;
              displayName?: (string | null) | undefined;
              assignedFirmSlug: string;
              hasExplicitAccess: boolean;
              roleKey?:
                | (
                    | (
                        | 'super_admin'
                        | 'support_admin'
                        | 'support_agent'
                        | 'firm_owner'
                        | 'firm_admin'
                        | 'accountant'
                        | 'staff_accountant'
                        | 'client_owner'
                        | 'client_admin'
                        | 'client_user'
                      )
                    | null
                  )
                | undefined;
              roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
              isDemoCompany: boolean;
              companyType: 'business' | 'individual' | 'accounting_firm';
            }>;
          };
          csrfToken?: string | undefined;
        }
      | undefined;
    error?: Record<string, unknown> | undefined;
    code?: string | undefined;
  };
  export type MeResponse = {
    success: boolean;
    message: string;
    data?:
      | {
          user: {
            id: string;
            email: string;
            firstname: string;
            lastname?: string | undefined;
            isPlatformUser?: boolean | undefined;
            platformUserKey?: (string | null) | undefined;
            currentCompanyId: string;
            currentCompany: {
              id: string;
              legalName: string;
              displayName?: (string | null) | undefined;
              assignedFirmSlug: string;
              hasExplicitAccess: boolean;
              roleKey?:
                | (
                    | (
                        | 'super_admin'
                        | 'support_admin'
                        | 'support_agent'
                        | 'firm_owner'
                        | 'firm_admin'
                        | 'accountant'
                        | 'staff_accountant'
                        | 'client_owner'
                        | 'client_admin'
                        | 'client_user'
                      )
                    | null
                  )
                | undefined;
              roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
              isDemoCompany: boolean;
              companyType: 'business' | 'individual' | 'accounting_firm';
            };
            companies: Array<{
              id: string;
              legalName: string;
              displayName?: (string | null) | undefined;
              assignedFirmSlug: string;
              hasExplicitAccess: boolean;
              roleKey?:
                | (
                    | (
                        | 'super_admin'
                        | 'support_admin'
                        | 'support_agent'
                        | 'firm_owner'
                        | 'firm_admin'
                        | 'accountant'
                        | 'staff_accountant'
                        | 'client_owner'
                        | 'client_admin'
                        | 'client_user'
                      )
                    | null
                  )
                | undefined;
              roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
              isDemoCompany: boolean;
              companyType: 'business' | 'individual' | 'accounting_firm';
            }>;
          };
          csrfToken?: string | undefined;
        }
      | undefined;
    error?: Record<string, unknown> | undefined;
    code?: string | undefined;
  };
  export type RefreshResponse = {
    success: boolean;
    message: string;
    data?: Partial<{ csrfToken: string }> | undefined;
    error?: Record<string, unknown> | undefined;
    code?: string | undefined;
  };
  export type ApiResponse = {
    success: boolean;
    message: string;
    data?: unknown | undefined;
    error?: unknown | undefined;
    code?: string | undefined;
  };
  export type CompanyType = 'business' | 'individual' | 'accounting_firm';
  export type Email = string;
  export type HealthResponse = { ok: boolean };
  export type RoleKey =
    | 'super_admin'
    | 'support_admin'
    | 'support_agent'
    | 'firm_owner'
    | 'firm_admin'
    | 'accountant'
    | 'staff_accountant'
    | 'client_owner'
    | 'client_admin'
    | 'client_user';
  export type RoleScope = 'platform' | 'firm' | 'company';

  // </Schemas>
}

export namespace Endpoints {
  // <Endpoints>

  export type get_HealthCheck = {
    method: 'GET';
    path: '/health';
    requestFormat: 'json';
    parameters: never;
    response: { ok: boolean };
  };
  export type post_LoginUser = {
    method: 'POST';
    path: '/auth/login';
    requestFormat: 'json';
    parameters: {
      body: { email: string; password: string };
    };
    response: {
      success: boolean;
      message: string;
      data?:
        | {
            user: {
              id: string;
              email: string;
              firstname: string;
              lastname?: string | undefined;
              isPlatformUser?: boolean | undefined;
              platformUserKey?: (string | null) | undefined;
              currentCompanyId: string;
              currentCompany: {
                id: string;
                legalName: string;
                displayName?: (string | null) | undefined;
                assignedFirmSlug: string;
                hasExplicitAccess: boolean;
                roleKey?:
                  | (
                      | (
                          | 'super_admin'
                          | 'support_admin'
                          | 'support_agent'
                          | 'firm_owner'
                          | 'firm_admin'
                          | 'accountant'
                          | 'staff_accountant'
                          | 'client_owner'
                          | 'client_admin'
                          | 'client_user'
                        )
                      | null
                    )
                  | undefined;
                roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
                isDemoCompany: boolean;
                companyType: 'business' | 'individual' | 'accounting_firm';
              };
              companies: Array<{
                id: string;
                legalName: string;
                displayName?: (string | null) | undefined;
                assignedFirmSlug: string;
                hasExplicitAccess: boolean;
                roleKey?:
                  | (
                      | (
                          | 'super_admin'
                          | 'support_admin'
                          | 'support_agent'
                          | 'firm_owner'
                          | 'firm_admin'
                          | 'accountant'
                          | 'staff_accountant'
                          | 'client_owner'
                          | 'client_admin'
                          | 'client_user'
                        )
                      | null
                    )
                  | undefined;
                roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
                isDemoCompany: boolean;
                companyType: 'business' | 'individual' | 'accounting_firm';
              }>;
            };
            csrfToken?: string | undefined;
          }
        | undefined;
      error?: Record<string, unknown> | undefined;
      code?: string | undefined;
    };
    responseHeaders: { 'set-cookie': string };
  };
  export type post_LogoutUser = {
    method: 'POST';
    path: '/auth/logout';
    requestFormat: 'json';
    parameters: never;
    response: {
      success: boolean;
      message: string;
      data?: unknown | undefined;
      error?: unknown | undefined;
      code?: string | undefined;
    };
  };
  export type post_RefreshToken = {
    method: 'POST';
    path: '/auth/refresh';
    requestFormat: 'json';
    parameters: never;
    response: {
      success: boolean;
      message: string;
      data?: Partial<{ csrfToken: string }> | undefined;
      error?: Record<string, unknown> | undefined;
      code?: string | undefined;
    };
  };
  export type get_GetCurrentUser = {
    method: 'GET';
    path: '/auth/me';
    requestFormat: 'json';
    parameters: never;
    response: {
      success: boolean;
      message: string;
      data?:
        | {
            user: {
              id: string;
              email: string;
              firstname: string;
              lastname?: string | undefined;
              isPlatformUser?: boolean | undefined;
              platformUserKey?: (string | null) | undefined;
              currentCompanyId: string;
              currentCompany: {
                id: string;
                legalName: string;
                displayName?: (string | null) | undefined;
                assignedFirmSlug: string;
                hasExplicitAccess: boolean;
                roleKey?:
                  | (
                      | (
                          | 'super_admin'
                          | 'support_admin'
                          | 'support_agent'
                          | 'firm_owner'
                          | 'firm_admin'
                          | 'accountant'
                          | 'staff_accountant'
                          | 'client_owner'
                          | 'client_admin'
                          | 'client_user'
                        )
                      | null
                    )
                  | undefined;
                roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
                isDemoCompany: boolean;
                companyType: 'business' | 'individual' | 'accounting_firm';
              };
              companies: Array<{
                id: string;
                legalName: string;
                displayName?: (string | null) | undefined;
                assignedFirmSlug: string;
                hasExplicitAccess: boolean;
                roleKey?:
                  | (
                      | (
                          | 'super_admin'
                          | 'support_admin'
                          | 'support_agent'
                          | 'firm_owner'
                          | 'firm_admin'
                          | 'accountant'
                          | 'staff_accountant'
                          | 'client_owner'
                          | 'client_admin'
                          | 'client_user'
                        )
                      | null
                    )
                  | undefined;
                roleScope?: (('platform' | 'firm' | 'company') | null) | undefined;
                isDemoCompany: boolean;
                companyType: 'business' | 'individual' | 'accounting_firm';
              }>;
            };
            csrfToken?: string | undefined;
          }
        | undefined;
      error?: Record<string, unknown> | undefined;
      code?: string | undefined;
    };
  };

  // </Endpoints>
}

// <EndpointByMethod>
export type EndpointByMethod = {
  get: {
    '/health': Endpoints.get_HealthCheck;
    '/auth/me': Endpoints.get_GetCurrentUser;
  };
  post: {
    '/auth/login': Endpoints.post_LoginUser;
    '/auth/logout': Endpoints.post_LogoutUser;
    '/auth/refresh': Endpoints.post_RefreshToken;
  };
};

// </EndpointByMethod>

// <EndpointByMethod.Shorthands>
export type GetEndpoints = EndpointByMethod['get'];
export type PostEndpoints = EndpointByMethod['post'];
// </EndpointByMethod.Shorthands>

// <ApiClientTypes>
export type EndpointParameters = {
  body?: unknown;
  query?: Record<string, unknown>;
  header?: Record<string, unknown>;
  path?: Record<string, unknown>;
};

export type MutationMethod = 'post' | 'put' | 'patch' | 'delete';
export type Method = 'get' | 'head' | 'options' | MutationMethod;

type RequestFormat = 'json' | 'form-data' | 'form-url' | 'binary' | 'text';

export type DefaultEndpoint = {
  parameters?: EndpointParameters | undefined;
  response: unknown;
  responseHeaders?: Record<string, unknown>;
};

export type Endpoint<TConfig extends DefaultEndpoint = DefaultEndpoint> = {
  operationId: string;
  method: Method;
  path: string;
  requestFormat: RequestFormat;
  parameters?: TConfig['parameters'];
  meta: {
    alias: string;
    hasParameters: boolean;
    areParametersRequired: boolean;
  };
  response: TConfig['response'];
  responseHeaders?: TConfig['responseHeaders'];
};

export type Fetcher = (
  method: Method,
  url: string,
  parameters?: EndpointParameters | undefined,
) => Promise<Response>;

type RequiredKeys<T> = {
  [P in keyof T]-?: undefined extends T[P] ? never : P;
}[keyof T];

type MaybeOptionalArg<T> = RequiredKeys<T> extends never ? [config?: T] : [config: T];

// </ApiClientTypes>

// <ApiClient>
export class ApiClient {
  baseUrl: string = '';

  constructor(public fetcher: Fetcher) {}

  setBaseUrl(baseUrl: string) {
    this.baseUrl = baseUrl;
    return this;
  }

  parseResponse = async <T>(response: Response): Promise<T> => {
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('application/json')) {
      return response.json();
    }
    return response.text() as unknown as T;
  };

  // <ApiClient.get>
  get<Path extends keyof GetEndpoints, TEndpoint extends GetEndpoints[Path]>(
    path: Path,
    ...params: MaybeOptionalArg<TEndpoint['parameters']>
  ): Promise<TEndpoint['response']> {
    return this.fetcher('get', this.baseUrl + path, params[0]).then((response) =>
      this.parseResponse(response),
    ) as Promise<TEndpoint['response']>;
  }
  // </ApiClient.get>

  // <ApiClient.post>
  post<Path extends keyof PostEndpoints, TEndpoint extends PostEndpoints[Path]>(
    path: Path,
    ...params: MaybeOptionalArg<TEndpoint['parameters']>
  ): Promise<TEndpoint['response']> {
    return this.fetcher('post', this.baseUrl + path, params[0]).then((response) =>
      this.parseResponse(response),
    ) as Promise<TEndpoint['response']>;
  }
  // </ApiClient.post>

  // <ApiClient.request>
  /**
   * Generic request method with full type-safety for any endpoint
   */
  request<
    TMethod extends keyof EndpointByMethod,
    TPath extends keyof EndpointByMethod[TMethod],
    TEndpoint extends EndpointByMethod[TMethod][TPath],
  >(
    method: TMethod,
    path: TPath,
    ...params: MaybeOptionalArg<TEndpoint extends { parameters: infer Params } ? Params : never>
  ): Promise<
    Omit<Response, 'json'> & {
      /** [MDN Reference](https://developer.mozilla.org/docs/Web/API/Request/json) */
      json: () => Promise<TEndpoint extends { response: infer Res } ? Res : never>;
    }
  > {
    return this.fetcher(method, this.baseUrl + (path as string), params[0] as EndpointParameters);
  }
  // </ApiClient.request>
}

export function createApiClient(fetcher: Fetcher, baseUrl?: string) {
  return new ApiClient(fetcher).setBaseUrl(baseUrl ?? '');
}

/**
 Example usage:
 const api = createApiClient((method, url, params) =>
   fetch(url, { method, body: JSON.stringify(params) }).then((res) => res.json()),
 );
 api.get("/users").then((users) => console.log(users));
 api.post("/users", { body: { name: "John" } }).then((user) => console.log(user));
 api.put("/users/:id", { path: { id: 1 }, body: { name: "John" } }).then((user) => console.log(user));
*/

// </ApiClient
