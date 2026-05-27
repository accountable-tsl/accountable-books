export const PRODUCT_EVENT_CATALOG = {
  'signup.started': {},
  'signup.completed': {},
  'signup.failed': {},
  'workspace.created': {},
} as const;

export type ProductEventName = keyof typeof PRODUCT_EVENT_CATALOG;

export interface ProductEventPropertiesMap {
  'signup.started': {
    company_type?: string;
    country?: string;
    flow?: 'signup';
    method?: 'direct';
    correlation_id?: string;
  };
  'signup.completed': {
    assigned_firm_id?: string;
    company_id: string;
    company_type: string;
    role: 'admin' | 'client';
    user_id: string;
    correlation_id?: string;
  };
  'signup.failed': {
    company_id?: string;
    company_type?: string;
    error_code: string;
    flow?: 'signup';
    step: string;
    user_id?: string;
    correlation_id?: string;
  };
  'workspace.created': {
    assigned_firm_id?: string;
    company_id: string;
    company_type: string;
    user_id: string;
    correlation_id?: string;
  };
}

export type ProductEventProperties<TEvent extends ProductEventName> =
  ProductEventPropertiesMap[TEvent];

/** PostHog and API catalog use the event key as the provider event name. */
export function getPostHogEventName(event: ProductEventName): ProductEventName {
  return event;
}
