import { BankFeedProviderInputCamel } from "../../src/domains/bankFeedProviders/bankFeedProviders.types";

export const SEED_BANK_FEED_PROVIDERS: BankFeedProviderInputCamel[] = [
  {
    key: "mono",
    name: "Mono",
    description: "Mono API",
    website: "https://mono.co",
    logoUrl: "https://i.postimg.cc/bNMg2Bhh/mono.png",
    status: "active",
    priority: 1,
  },
  {
    key: "okra",
    name: "Okra",
    description: "Okra API",
    website: "https://okra.ng",
    logoUrl: "https://i.postimg.cc/mgfM4f4t/okra.png",
    status: "inactive",
    priority: 2,
  },
  {
    key: "plaid",
    name: "Plaid",
    description: "Plaid API",
    website: "https://plaid.com",
    logoUrl: "https://i.postimg.cc/RFsVZfng/plaid.png",
    status: "active",
    priority: 1,
  },
  {
    key: "stripe",
    name: "Stripe",
    description: "Stripe API",
    website: "https://stripe.com",
    logoUrl: "https://i.postimg.cc/vBM3Zxdx/stripe.png",
    status: "active",
    priority: 2,
  },
];

export const MONO_COUNTRIES = ["NG", "GH", "KE", "ZA"]; // Nigeria, Ghana, Kenya, South Africa
export const OKRA_COUNTRIES = ["NG", "KE", "ZA"]; // Nigeria, Kenya, South Africa
export const PLAID_COUNTRIES = ["US", "CA"]; // US, Canada
export const STRIPE_COUNTRIES = ["US", "CA", "GB"]; // US, Canada
