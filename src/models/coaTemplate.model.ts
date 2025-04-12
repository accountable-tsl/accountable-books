import type { Knex } from "knex";
import { z } from "zod";
import {
  Company,
  CompanyType,
  companyType,
  newCoaTemplate,
  NewCoaTemplateInput,
} from "../types/db.type";
import { ApiResponse } from "../types/generic";
import { errorResponse, splitIntoWords, successResponse } from "../utils/utils";
import {
  coaTemplateCompanyType,
  CoaTemplateCompanyType,
  CoaTemplateIndustry,
  CoaTemplateNameParts,
  coaTemplateType,
  IndustryKeywordConfig,
  loadCoaTemplate,
  LoadCoaTemplateInput,
  SelectBestCoa,
} from "../types/coaTemplate.type";
import _ from "lodash";

export const addNewCoaTemplates = async (
  knex: Knex,
  input: NewCoaTemplateInput[]
): Promise<ApiResponse> => {
  const validatedInput = newCoaTemplate
    .array()
    .nonempty("At least one template required")
    .safeParse(input);
  if (!validatedInput.success) {
    return errorResponse(
      "Invalid input provided",
      validatedInput.error.flatten()
    );
  }

  try {
    const insertedRecords = await knex.transaction(async (trx) => {
      const inserted = await trx("coa_template")
        .insert(validatedInput.data)
        .returning("*");
      return inserted;
    });

    if (!insertedRecords || insertedRecords.length === 0) {
      return errorResponse("Failed to insert any coa template records");
    }

    return successResponse(
      `coa template(s) with ${insertedRecords.length} records entered successfully`,
      insertedRecords
    );
  } catch (error) {
    return errorResponse("Error inserting coa template(s)", error);
  }
};

export const loadCoaTemplateForCompany = async (
  knex: Knex,
  input: LoadCoaTemplateInput
): Promise<ApiResponse> => {
  // Validate Input
  const validatedInput = loadCoaTemplate.safeParse(input);
  if (!validatedInput.success)
    return errorResponse("Invalid Input", validatedInput.error.flatten());

  const { companyId, template_name, use_code, additional_info } =
    validatedInput.data;

  try {
    // Fetch company
    const [company]: Partial<Company[]> = await knex("company")
      .where("id", companyId)
      .select(
        "display_name",
        "type",
        "industry",
        "website",
        "reporting_framework",
        "reporting_currency_id"
      );

    if (!company || !company.type || !company.reporting_currency_id)
      return errorResponse("Company not found or invalid type");

    let chosenTemplate;
    if (template_name) {
      chosenTemplate = template_name;
    }

    if (!chosenTemplate) {
      const matchInput: SelectBestCoa = {
        company,
        use_code,
        additional_info,
      };
      const { template } = await selectBestCoaTemplate(knex, matchInput);
      chosenTemplate = template;
    }

    const validTemplate = await knex("coa_template")
      .where("is_active", true)
      .where("template_name", chosenTemplate)
      .select("code", "name", "description", "account_type_id");

    if (!validTemplate.length) {
      return errorResponse(`Template ${chosenTemplate} is invalid or inactive`);
    }

    return knex.transaction(async (trx) => {
      const templateToInsert = validTemplate.map((t) => {
        return {
          code: t.code,
          name: t.name,
          description: t.description,
          is_active: true,
          currency_id: company.reporting_currency_id,
          company_id: companyId,
          created_by_id: input.created_by_id,
        };
      });

      const insertedCoa = await trx("coa").insert(templateToInsert);

      return successResponse(
        `Coa template with ${validTemplate.length} lines inserted for ${company.display_name}`,
        chosenTemplate
      );
    });
  } catch (error) {
    return errorResponse("Failed to load and insert coa template", error);
  }
};

const selectBestCoaTemplate = async (
  knex: Knex,
  input: SelectBestCoa
): Promise<{ template: string; score?: number; log?: string }> => {
  const {
    company,
    templates: inputTemplates,
    use_code,
    additional_info,
  } = input;

  if (!company.type) {
    throw new Error("Company type is required");
  }

  const typeMap: Record<CompanyType, CoaTemplateCompanyType> = {
    individual: "ind",
    business: "biz",
    accounting_firm: "acc",
  };
  const companyType = typeMap[company.type];
  console.log(`Starting template matching for ${companyType} company`);

  // 1. Template Collection
  let templates = (inputTemplates || []).filter((t) =>
    t.startsWith(`${companyType}:`)
  );
  if (!templates.length) {
    console.log(`Fetching templates from DB for ${companyType}`);
    templates = await knex("coa_templates")
      .where("is_active", true)
      .where("template_name", "like", `${companyType}:%`)
      .pluck("template_name");
  }

  // 2. Validation Layer
  const validTemplates = templates.filter(
    (t) => coaTemplateName.safeParse(t).success
  );
  console.log(`Valid templates found: ${validTemplates.length}`);

  if (!validTemplates.length) {
    throw new Error(
      templates.length
        ? `No valid templates for ${companyType} after validation`
        : `No active templates found for ${companyType}`
    );
  }
  if (validTemplates.length === 1) {
    console.log(`Single valid template found: ${validTemplates[0]}`);
    return {
      template: validTemplates[0],
      log: "Single valid template found, not scored",
    };
  }

  // 3. Scoring Preparation
  const cleanIndustry = company.industry?.toLowerCase().trim() || "";
  const additionalInfo = additional_info
    ? splitIntoWords(additional_info).join(" ")
    : "";
  const searchText = `${cleanIndustry} ${additionalInfo}`.trim().toLowerCase();
  console.log(`Search text for matching: "${searchText}"`);

  // 4. Scoring Engine
  const scores = validTemplates.map((template) => {
    const parts = template.split(":");
    const [t_company_type, t_industry, t_template_type, t_code, t_version] =
      parts as CoaTemplateNameParts;

    let score = 0;
    const scoringLog: string[] = [];

    // Industry Scoring
    const { primary, secondary, aliasPrimary, aliasSecondary } =
      getKeywords(t_industry);
    let industryScore = 0;

    primary.forEach((phrase) => {
      if (searchText.includes(phrase)) {
        industryScore += SCORE.INDUSTRY_PRIMARY;
        scoringLog.push(`+${SCORE.INDUSTRY_PRIMARY} (primary: ${phrase})`);
      }
    });
    secondary.forEach((keyword) => {
      const safeKeyword = _.escapeRegExp(keyword);
      if (new RegExp(`\\b${safeKeyword}\\b`).test(searchText)) {
        industryScore += SCORE.INDUSTRY_SECONDARY;
        scoringLog.push(`+${SCORE.INDUSTRY_SECONDARY} (secondary: ${keyword})`);
      }
    });

    aliasPrimary.forEach((phrase) => {
      if (searchText.includes(phrase)) {
        industryScore += SCORE.INDUSTRY_ALIAS_PRIMARY;
        scoringLog.push(
          `+${SCORE.INDUSTRY_ALIAS_PRIMARY} (alias primary: ${phrase})`
        );
      }
    });
    aliasSecondary.forEach((keyword) => {
      const safeKeyword = _.escapeRegExp(keyword);
      if (new RegExp(`\\b${safeKeyword}\\b`).test(searchText)) {
        industryScore += SCORE.INDUSTRY_ALIAS_SECONDARY;
        scoringLog.push(
          `+${SCORE.INDUSTRY_ALIAS_SECONDARY} (alias secondary: ${keyword})`
        );
      }
    });

    if (companyType === "ind" && t_industry === "none") {
      industryScore = SCORE.INDUSTRY_PRIMARY;
      scoringLog.push(`+${SCORE.INDUSTRY_PRIMARY} (individual default)`);
    } else if (!searchText && t_industry === "none") {
      industryScore = SCORE.ONE * 5;
      scoringLog.push(`+5 (empty search default)`);
    }
    score += industryScore;

    // Template Type Scoring
    const templateScore =
      {
        basic: SCORE.TEMPLATE_BASIC,
        adv: SCORE.TEMPLATE_ADV,
        pro: SCORE.TEMPLATE_PRO,
      }[t_template_type] || 0;
    score += templateScore;
    scoringLog.push(`+${templateScore} (template: ${t_template_type})`);

    // Code Matching
    const effectiveUseCode = use_code ?? companyType !== "ind";
    const codeMatch = effectiveUseCode
      ? t_code === "code"
      : ["nocode", "none"].includes(t_code);

    if (codeMatch) {
      score += SCORE.CODE_MATCH;
      scoringLog.push(`+${SCORE.CODE_MATCH} (code match)`);
    } else {
      score -= SCORE.CODE_MISMATCH_PENALTY;
      scoringLog.push(`-${SCORE.CODE_MISMATCH_PENALTY} (code mismatch)`);
    }

    // Version Scoring
    const versionMatch = t_version.match(/^v(\d+)$/);
    const versionNum = versionMatch ? parseInt(versionMatch[1], 10) : 0;
    if (isNaN(versionNum)) {
      console.warn(`Invalid version in template ${template}`);
    }
    const versionScore = versionNum * SCORE.VERSION_MULTIPLIER;
    score += versionScore;
    scoringLog.push(`+${versionScore} (version)`);

    console.log(`Scoring ${template}: ${score}\n  ${scoringLog.join("\n  ")}`);
    return { template, score };
  });

  // 5. Result Determination
  const viableScores = scores.filter(({ score }) => score > 0);
  const [best] = [...viableScores].sort((a, b) => b.score - a.score);

  if (best) {
    console.log(
      `Best template selected: ${best.template} (score: ${best.score})`
    );
    return {
      template: best.template,
      score: best.score,
      log: [
        `🔎 Matching COA Template for ${companyType}`,
        `Industry: ${company.industry}`,
        `Search Text: "${searchText}"`,
        ...scores.map((s) => `  ${s.template} → ${s.score}`),
        `✅ Selected: ${best.template} (score: ${best.score})`,
      ].join("\n"),
    };
  }

  // 6. Fallback Mechanism
  const defaultTemplate = DEFAULT_TEMPLATES[companyType];
  const defaultNoCode = defaultTemplate.replace(":code:", ":nocode:");
  console.log(`No positive scores, attempting default: ${defaultTemplate}`);

  // Try code first, then nocode
  if (companyType !== "ind") {
    const hasCodeVersion = validTemplates.includes(defaultTemplate);
    const hasNoCodeVersion = validTemplates.includes(defaultNoCode);

    if (hasCodeVersion) {
      return {
        template: defaultTemplate,
        score: 0,
        log: `Fallback to default template: ${defaultTemplate} (code version found)`,
      };
    }

    if (hasNoCodeVersion) {
      return {
        template: defaultNoCode,
        score: 0,
        log: `Fallback to default template: ${defaultNoCode} (nocode version found)`,
      };
    }
  } else if (validTemplates.includes(defaultTemplate)) {
    return {
      template: defaultTemplate,
      score: 0,
      log: `Fallback to default template: ${defaultTemplate}`,
    };
  }

  throw new Error(
    `No suitable template found for ${companyType}. ` +
      `Defaults (${defaultTemplate}, ${defaultNoCode}) missing. Valid templates: [${validTemplates.join(", ")}]`
  );
};

const SCORE = {
  INDUSTRY_PRIMARY: 10,
  INDUSTRY_SECONDARY: 2,

  INDUSTRY_ALIAS_PRIMARY: 5,
  INDUSTRY_ALIAS_SECONDARY: 1,

  TEMPLATE_BASIC: 100,
  TEMPLATE_ADV: 10,
  TEMPLATE_PRO: 5,

  CODE_MATCH: 30,
  CODE_MISMATCH_PENALTY: 20,

  VERSION_MULTIPLIER: 5,
  ONE: 1,
};

const DEFAULT_TEMPLATES: Record<CoaTemplateCompanyType, string> = {
  ind: "ind:none:basic:nocode:v1",
  biz: "biz:none:basic:code:v1",
  acc: "acc:prof:basic:code:v1",
};

export const coaTemplateCompanyTypes = ["ind", "biz", "acc"] as const;
export const coaTemplateIndustries = [
  "none",
  "prof",
  "int_design",
  "retail",
  "saas",
  "legal",
  "manuf",
  "tech",
] as const;
export const coaTemplateTypes = ["basic", "adv", "pro"] as const;
export const coaTemplateCodes = ["code", "nocode", "none"] as const;

// Dynamic regex
const templateNameRegex = new RegExp(
  `^(${coaTemplateCompanyTypes.join("|")}):(${coaTemplateIndustries.join("|")}):(${coaTemplateTypes.join("|")}):(${coaTemplateCodes.join("|")}):v[1-9]\\d*$`
);

export const coaTemplateName = z
  .string()
  .transform((input, ctx) => {
    const normalizedInput = input.replace(/::/g, ":none:");
    const parts = normalizedInput.trim().toLowerCase().split(":");
    if (parts.length === 3) {
      if (
        !coaTemplateCompanyType.safeParse(parts[0]).success ||
        !coaTemplateType.safeParse(parts[1]).success ||
        !/^v[1-9]\d*$/.test(parts[2])
      ) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Invalid shorthand format",
        });
        return z.NEVER;
      }
      return `${parts[0]}:none:${parts[1]}:none:${parts[2]}`;
    }
    if (parts.length !== 5) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Invalid segment count",
      });
      return z.NEVER;
    }
    return input;
  })
  .pipe(
    z
      .string()
      .regex(templateNameRegex, "Invalid template name format or values")
  );
// Keyword mappings for industry matching
const industryKeywords: Record<CoaTemplateIndustry, IndustryKeywordConfig> = {
  saas: {
    primary: [
      "saas",
      "software as a service",
      "cloud software",
      "subscription software",
      "recurring billing",
      "hosted software",
      "online platform",
      "web app",
    ],
    secondary: [
      "software",
      "cloud",
      "platform",
      "subscription",
      "digital",
      "monthly plan",
      "annual license",
      "user seats",
      "scalable",
      "api",
    ],
    aliases: ["tech"],
  },
  tech: {
    primary: [
      "technology",
      "tech",
      "it services",
      "tech support",
      "computer systems",
      "software development",
      "information technology",
      "tech consulting",
    ],
    secondary: [
      "hardware",
      "ai",
      "machine learning",
      "data",
      "network",
      "cybersecurity",
      "servers",
    ],
    aliases: ["saas"],
  },
  int_design: {
    primary: [
      "interior design",
      "interior designer",
      "home design",
      "space planning",
      "home decor",
    ],
    secondary: [
      "decor",
      "architecture",
      "renovation",
      "remodel",
      "construction",
      "design consultation",
      "furniture",
      "aesthetics",
      "home improvement",
    ],
    aliases: [],
  },
  retail: {
    primary: [
      "retail",
      "store",
      "ecommerce",
      "online store",
      "brick and mortar",
      "retail sales",
    ],
    secondary: [
      "shop",
      "merchandise",
      "sales",
      "inventory",
      "point of sale",
      "customer service",
      "stock",
      "checkout",
      "product display",
    ],
    aliases: [],
  },
  prof: {
    primary: [
      "professional services",
      "consulting",
      "freelance",
      "business consulting",
      "management consulting",
      "advisory services",
    ],
    secondary: [
      "advisor",
      "expert",
      "specialist",
      "strategy",
      "coaching",
      "training",
      "project management",
      "business services",
    ],
    aliases: ["legal"],
  },
  legal: {
    primary: [
      "legal",
      "law firm",
      "attorney",
      "legal services",
      "law practice",
      "legal consulting",
    ],
    secondary: [
      "lawyer",
      "litigation",
      "compliance",
      "contract",
      "dispute",
      "regulation",
      "legal advice",
      "court",
    ],
    aliases: ["prof"],
  },
  manuf: {
    primary: [
      "manufacturing",
      "production",
      "factory",
      "industrial",
      "fabrication",
      "assembly line",
    ],
    secondary: [
      "assembly",
      "supply chain",
      "equipment",
      "logistics",
      "machinery",
      "production line",
      "quality control",
      "warehousing",
    ],
    aliases: [],
  },
  none: {
    primary: [],
    secondary: [],
    aliases: [],
  },
};

export function getKeywords(industry: CoaTemplateIndustry) {
  const config = industryKeywords[industry] || {
    primary: [],
    secondary: [],
    aliases: [],
  };

  const aliasKeywords =
    config.aliases &&
    config.aliases.reduce(
      (acc, alias) => {
        const aliasConfig = industryKeywords[alias] || {
          primary: [],
          secondary: [],
        };
        acc.primary.push(...aliasConfig.primary);
        acc.secondary.push(...aliasConfig.secondary);
        return acc;
      },
      { primary: [] as string[], secondary: [] as string[] }
    );

  return {
    primary: [...new Set(config.primary.map(normalizeKeyword))],
    secondary: [...new Set(config.secondary.map(normalizeKeyword))],
    aliasPrimary: aliasKeywords
      ? [...new Set(aliasKeywords.primary.map(normalizeKeyword))]
      : [],
    aliasSecondary: aliasKeywords
      ? [...new Set(aliasKeywords.secondary.map(normalizeKeyword))]
      : [],
  };
}

function normalizeKeyword(keyword: string) {
  return keyword.toLowerCase().trim().replace(/\s+/g, " ");
}
