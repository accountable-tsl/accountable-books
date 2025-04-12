import { z } from "zod";
import { company, Company } from "./db.type";
import {
  coaTemplateCodes,
  coaTemplateCompanyTypes,
  coaTemplateIndustries,
  coaTemplateTypes,
} from "../models/coaTemplate.model";

export const coaTemplateSelection = z.object({
  companyId: z.string().uuid(),
  description: z.string().optional(),
  additionalNotes: z.string().optional(),
});
export type CoaTemplateSelection = z.infer<typeof coaTemplateSelection>;

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

export const loadCoa = z.object({
  companyId: z.string().uuid(),
  template_name: z.string(),
});
export type LoadCoa = z.infer<typeof loadCoa>;

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

const keywordSchema = z.object({
  primary: z.array(z.string().min(1).toLowerCase()).default([]),
  secondary: z.array(z.string().min(1).toLowerCase()).default([]),
  matchExactPhrases: z.boolean().default(true),
  aliases: z.array(z.string()).default([]),
});
