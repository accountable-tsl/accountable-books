import { z } from 'zod';

import { dbBaseFields } from '../../core/types/core.js';
import { type Company } from '../companies/companies.types.js';

export const loadCoaTemplate = z.object({
  companyId: z.uuid(),
  created_by_id: z.uuid(),
  template_name: z.string().optional(),
  use_code: z.boolean().optional(),
  additional_info: z.string().optional(),
});
export type LoadCoaTemplateInput = z.infer<typeof loadCoaTemplate>;

export const coaTemplateSelection = z.object({
  companyId: z.uuid(),
  description: z.string().optional(),
  additionalNotes: z.string().optional(),
});
export type CoaTemplateSelection = z.infer<typeof coaTemplateSelection>;
export const coaTemplateCompanyTypes = ['ind', 'biz', 'acc'] as const;
export const coaTemplateIndustries = [
  'none',
  'prof',
  'int_design',
  'retail',
  'saas',
  'legal',
  'manuf',
  'tech',
] as const;
export const coaTemplateTypes = ['basic', 'adv', 'pro'] as const;
export const coaTemplateCodes = ['code', 'nocode', 'none'] as const;

export const coaTemplateCompanyType = z.enum(coaTemplateCompanyTypes);
export type CoaTemplateCompanyType = z.infer<typeof coaTemplateCompanyType>;

export const coaTemplateIndustry = z.enum(coaTemplateIndustries);
export type CoaTemplateIndustry = z.infer<typeof coaTemplateIndustry>;

export const coaTemplateType = z.enum(coaTemplateTypes);
export type CoaTemplateType = z.infer<typeof coaTemplateType>;

export const coaTemplateCode = z.enum(coaTemplateCodes);
export type CoaTemplateCode = z.infer<typeof coaTemplateCode>;

export type CoaTemplateNameParts = [
  company_type: CoaTemplateCompanyType,
  industry: CoaTemplateIndustry,
  template_type: CoaTemplateType,
  code: CoaTemplateCode,
  version: string,
];

export type SelectBestCoa = {
  company: Partial<Company>;
  templates?: string[];
  use_code?: boolean;
  additional_info?: string | string[];
};

export type IndustryKeywordConfig = {
  primary: string[];
  secondary: string[];
  /**
   * @default true - Whether to match exact phrases or individual words
   */
  matchExactPhrases?: boolean;
  /**
   * @default [] - Alternative industry codes that should inherit these keywords
   */
  aliases?: CoaTemplateIndustry[];
};

export const keywordSchema = z.object({
  primary: z.array(z.string().min(1).toLowerCase()).prefault([]),
  secondary: z.array(z.string().min(1).toLowerCase()).prefault([]),
  matchExactPhrases: z.boolean().prefault(true),
  aliases: z.array(z.string()).prefault([]),
});

// Dynamic regex
const templateNameRegex = new RegExp(
  `^(${coaTemplateCompanyTypes.join('|')}):(${coaTemplateIndustries.join('|')}):(${coaTemplateTypes.join('|')}):(${coaTemplateCodes.join('|')}):v[1-9]\\d*$`,
);

export const coaTemplateName = z
  .string()
  .transform((input, ctx) => {
    const normalizedInput = input.replace(/::/g, ':none:');
    const parts = normalizedInput.trim().toLowerCase().split(':');
    if (parts.length === 3) {
      if (
        !coaTemplateCompanyType.safeParse(parts[0]).success ||
        !coaTemplateType.safeParse(parts[1]).success ||
        !/^v[1-9]\d*$/.test(parts[2])
      ) {
        ctx.addIssue({
          code: 'custom',
          message: 'Invalid shorthand format',
        });
        return z.NEVER;
      }
      return `${parts[0]}:none:${parts[1]}:none:${parts[2]}`;
    }
    if (parts.length !== 5) {
      ctx.addIssue({
        code: 'custom',
        message: 'Invalid segment count',
      });
      return z.NEVER;
    }
    return normalizedInput;
  })
  .pipe(
    z
      .string()
      .regex(templateNameRegex, 'Invalid template name format or values'),
  );

export const newCoaTemplate = z.object({
  template_name: coaTemplateName,
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(256, 'Max account name length exceeded'),
  code: z.string().min(1, 'Code is required').max(256).nullish(),
  description: z.string().max(512).nullish(),
  account_type_id: z.uuid('Account Type ID is required'),
  is_active: z.boolean().prefault(true),
  locked: z.boolean().prefault(false),
});
export const coaTemplate = newCoaTemplate.merge(dbBaseFields);

export type CoaTemplateName = z.infer<typeof coaTemplateName>;
export type NewCoaTemplateInput = z.infer<typeof newCoaTemplate>;
export type CoaTemplate = z.infer<typeof coaTemplate>;
