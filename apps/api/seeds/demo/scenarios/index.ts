import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import type { Scenario } from '../engine/registry';
import { getCountry } from '../../src/domains/countries/countries.utils';
import { getCurrency } from '../../src/domains/currencies/currencies.utils';
import {
  createCompleteCompanyOnboardingState,
  createCompleteUserOnboardingState,
} from '../../src/features/onboarding/onboarding.utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

type ScenarioDef = {
  countryCode: 'US' | 'NG' | string;
  currencyCode: 'USD' | 'NGN' | string;
  type: 'individual' | 'business' | 'accounting_firm';
  company: { legalName: string; shortCode: string; slug?: string };
  user: { firstname: string; lastname?: string; email: string };
};

export async function getAllScenarios(configPath?: string): Promise<Scenario[]> {
  const resolved = configPath
    ? path.resolve(process.cwd(), configPath)
    : path.resolve(__dirname, '../config/scenarios.json');

  const raw = fs.readFileSync(resolved, 'utf8');
  const defs: ScenarioDef[] = JSON.parse(raw);

  const out: Scenario[] = [];
  for (const d of defs) {
    const [country, currency] = await Promise.all([
      getCountry(d.countryCode),
      getCurrency(d.currencyCode),
    ]);
    out.push({
      name: `demo:${d.countryCode}:${d.type}:${d.company.shortCode}`,
      country: d.countryCode as any,
      type: d.type,
      company: {
        legalName: d.company.legalName,
        shortCode: d.company.shortCode,
        slug: d.company.slug,
        type: d.type,
        onboardingState: createCompleteCompanyOnboardingState(d.type),
        reportingCurrencyId: currency.id,
        countryId: country.id,
        isDemoCompany: true,
        yearEndDay: 31,
        yearEndMonth: 12,
      },
      user: {
        firstname: d.user.firstname,
        lastname: d.user.lastname ?? null,
        email: d.user.email,
        password: 'StrongDemoPass!',
        isDemoUser: true,
        emailVerifiedAt: new Date(),
        onboardingState: createCompleteUserOnboardingState(),
      },
    });
  }
  return out;
}
