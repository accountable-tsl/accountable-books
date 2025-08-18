import { faker } from '@faker-js/faker';
import { companyType as ct } from '../../../src/domains/companies/companies.types';
import { ContactInput } from '../../../src/domains/contacts/contact.types';

export function generateDemoContactsForCompany({
  companyType,
  countryCode,
}: {
  companyType: string;
  countryCode: string;
}): ContactInput[] {
  const isNigerian = countryCode === 'NG';

  switch (companyType) {
    case ct.enum.individual:
      return [...getIndividualCoreContacts(isNigerian), ...generateRandomContacts(10)];
    case ct.enum.business:
      return [...getBusinessCoreContacts(isNigerian), ...generateRandomContacts(10)];
    case ct.enum.accounting_firm:
      return [...getFirmCoreContacts(isNigerian), ...generateRandomContacts(10)];
    default:
      return generateRandomContacts(10);
  }
}

function getIndividualCoreContacts(isNigerian: boolean): ContactInput[] {
  return isNigerian
    ? [
        {
          displayName: 'Mama Toun',
          email: faker.internet.email({ firstName: 'mama.toun', lastName: '' }),
          notes: 'Weekly food supplier',
        },
        {
          displayName: 'MTN Nigeria',
          email: 'support@mtnonline.com',
          notes: 'Phone bills and airtime',
        },
        {
          displayName: 'PiggyVest',
          email: 'support@piggyvest.com',
          notes: 'Savings platform',
        },
        {
          displayName: 'Netflix',
          email: 'billing@netflix.com',
          notes: 'Streaming subscription',
        },
        {
          displayName: 'Ikeja Electric',
          email: 'care@ikejaelectric.com',
          notes: 'Electricity provider',
        },
      ]
    : [
        {
          displayName: 'Jane Doe',
          email: faker.internet.email({ firstName: 'jane' }),
          notes: 'Sister',
        },
        {
          displayName: 'Spotify',
          email: 'support@spotify.com',
          notes: 'Music streaming subscription',
        },
        {
          displayName: "John's Groceries",
          email: faker.internet.email({
            firstName: 'john.store',
            lastName: '',
          }),
          notes: 'Weekly grocery delivery',
        },
        {
          displayName: 'T-Mobile',
          email: 'support@t-mobile.com',
          notes: 'Mobile provider',
        },
        {
          displayName: 'Netflix',
          email: 'billing@netflix.com',
          notes: 'Streaming subscription',
        },
      ];
}

function getBusinessCoreContacts(isNigerian: boolean): ContactInput[] {
  return isNigerian
    ? [
        {
          displayName: 'GTBank',
          email: 'bizsupport@gtbank.com',
          notes: 'Corporate banking',
        },
        {
          displayName: 'Flutterwave',
          email: 'support@flutterwave.com',
          notes: 'Payment processor',
        },
        {
          displayName: 'Interswitch',
          email: 'support@interswitchgroup.com',
          notes: 'Payment gateway',
        },
        {
          displayName: 'Lidya',
          email: 'credit@lidya.co',
          notes: 'SME loan provider',
        },
        {
          displayName: 'Whogohost',
          email: 'support@whogohost.com',
          notes: 'Web hosting provider',
        },
      ]
    : [
        {
          displayName: 'Stripe',
          email: 'support@stripe.com',
          notes: 'Payment gateway',
        },
        {
          displayName: 'AWS',
          email: 'billing@amazon.com',
          notes: 'Cloud hosting',
        },
        {
          displayName: 'Zapier',
          email: 'support@zapier.com',
          notes: 'Workflow automation',
        },
        {
          displayName: 'Gusto',
          email: 'payroll@gusto.com',
          notes: 'Payroll service',
        },
        {
          displayName: 'Zoom',
          email: 'billing@zoom.us',
          notes: 'Online meetings',
        },
      ];
}

function getFirmCoreContacts(isNigerian: boolean): ContactInput[] {
  return isNigerian
    ? [
        {
          displayName: 'Xero',
          email: 'support@xero.com',
          notes: 'Cloud accounting',
        },
        {
          displayName: 'Taxaide',
          email: 'support@taxaide.com.ng',
          notes: 'Tax consultancy',
        },
        {
          displayName: 'QuickBooks',
          email: 'support@quickbooks.com',
          notes: 'Legacy accounting software',
        },
        {
          displayName: 'Paystack',
          email: 'support@paystack.com',
          notes: 'Client integration tool',
        },
        {
          displayName: 'Mono',
          email: 'support@mono.co',
          notes: 'Bank data APIs',
        },
      ]
    : [
        {
          displayName: 'QuickBooks',
          email: 'support@quickbooks.com',
          notes: 'Accounting software',
        },
        {
          displayName: 'Xero',
          email: 'support@xero.com',
          notes: 'Accounting software',
        },
        {
          displayName: 'Gusto',
          email: 'support@gusto.com',
          notes: 'Payroll integration',
        },
        {
          displayName: 'Bench',
          email: 'hello@bench.co',
          notes: 'Bookkeeping partner',
        },
        {
          displayName: 'Zapier',
          email: 'support@zapier.com',
          notes: 'Integration tool',
        },
      ];
}

// ---- Randomized Noise Contacts ----

function generateRandomContacts(count: number): ContactInput[] {
  return Array.from({ length: count }, () => ({
    displayName: faker.company.name(),
    email: faker.internet.email(),
    notes: faker.company.catchPhrase(),
    address: faker.location.streetAddress({ useFullAddress: true }),
  }));
}
