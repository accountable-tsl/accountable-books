import type { Knex } from 'knex';

import { escapeRegExp } from '../../shared/utils/random.utils.js';
import { splitIntoWords } from '../../shared/utils/string.utils.js';
import { type CompanyType } from '../companies/companies.types.js';
import type {
  CoaTemplateCompanyType,
  CoaTemplateIndustry,
  CoaTemplateNameParts,
  IndustryKeywordConfig,
  SelectBestCoa,
} from './coa-template.type.js';
import { coaTemplateName } from './coa-template.type.js';

export const selectBestCoaTemplate = async (
  knex: Knex,
  input: SelectBestCoa,
): Promise<{ template: string; score?: number; log?: string }> => {
  const {
    company,
    templates: inputTemplates,
    use_code,
    additional_info,
  } = input;

  if (!company.type) {
    throw new Error('Company type is required');
  }

  const typeMap: Record<CompanyType, CoaTemplateCompanyType> = {
    individual: 'ind',
    business: 'biz',
    accounting_firm: 'acc',
  };
  const companyType: CoaTemplateCompanyType = typeMap[company.type];
  if (!Object.keys(typeMap).includes(company.type))
    throw new Error(`Invalid company type: ${company.type}`);

  // 1. Template Collection
  let templates = Array.isArray(inputTemplates)
    ? inputTemplates.filter((t) => t.startsWith(`${companyType}:`))
    : [];

  if (!templates.length) {
    templates = await knex('coa_templates')
      .where('is_active', true)
      .andWhere('template_name', 'like', `${companyType}:%`)
      .pluck('template_name');
  }

  // 2. Validation Layer
  const validTemplates = templates.filter(
    (t) => coaTemplateName.safeParse(t).success,
  );

  if (!validTemplates.length) {
    throw new Error(
      templates.length
        ? `No valid templates for ${companyType} after validation`
        : `No active templates found for ${companyType}`,
    );
  }
  if (validTemplates.length === 1) {
    return {
      template: validTemplates[0],
      log: 'Single valid template found, not scored',
    };
  }

  // 3. Scoring Preparation
  const cleanIndustry = company.industry?.toLowerCase().trim() || '';
  const additionalInfo = additional_info
    ? splitIntoWords(additional_info).join(' ')
    : '';
  const searchText = `${cleanIndustry} ${additionalInfo}`.trim().toLowerCase();

  // 4. Scoring Engine
  const scores = validTemplates.map((template) => {
    const parts = template.split(':');
    const [t_company_type, t_industry, t_template_type, t_code, t_version] =
      parts as CoaTemplateNameParts;

    let score = 0;
    const scoringLog: string[] = [];

    // Industry Scoring
    const { primary, secondary, aliasPrimary, aliasSecondary } =
      getKeywords(t_industry);
    let industryScore = 0;

    // Map company industry to expected template industry
    const expectedIndustry =
      company.industry &&
      industryKeywords[company.industry.toLowerCase() as CoaTemplateIndustry]
        ? company.industry.toLowerCase()
        : 'none';

    // Apply mismatch penalty if template industry doesn't align with expected
    if (expectedIndustry !== 'none' && t_industry !== expectedIndustry) {
      industryScore -= SCORE.INDUSTRY_MISMATCH_PENALTY;
      scoringLog.push(
        `-200 (industry mismatch: expected ${expectedIndustry}, got ${t_industry})`,
      );
    }

    primary.forEach((phrase) => {
      if (searchText.includes(phrase)) {
        industryScore += SCORE.INDUSTRY_PRIMARY;
        scoringLog.push(`+${SCORE.INDUSTRY_PRIMARY} (primary: ${phrase})`);
      }
    });
    secondary.forEach((keyword) => {
      const safeKeyword = escapeRegExp(keyword);
      if (new RegExp(`\\b${safeKeyword}\\b`).test(searchText)) {
        industryScore += SCORE.INDUSTRY_SECONDARY;
        scoringLog.push(`+${SCORE.INDUSTRY_SECONDARY} (secondary: ${keyword})`);
      }
    });

    aliasPrimary.forEach((phrase) => {
      if (searchText.includes(phrase)) {
        industryScore += SCORE.INDUSTRY_ALIAS_PRIMARY;
        scoringLog.push(
          `+${SCORE.INDUSTRY_ALIAS_PRIMARY} (alias primary: ${phrase})`,
        );
      }
    });
    aliasSecondary.forEach((keyword) => {
      const safeKeyword = escapeRegExp(keyword);
      if (new RegExp(`\\b${safeKeyword}\\b`).test(searchText)) {
        industryScore += SCORE.INDUSTRY_ALIAS_SECONDARY;
        scoringLog.push(
          `+${SCORE.INDUSTRY_ALIAS_SECONDARY} (alias secondary: ${keyword})`,
        );
      }
    });

    if (companyType === 'ind' && t_industry === 'none') {
      industryScore = SCORE.INDUSTRY_PRIMARY;
      scoringLog.push(`+${SCORE.INDUSTRY_PRIMARY} (individual default)`);
    } else if (!searchText && t_industry === 'none') {
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
    const effectiveUseCode = use_code ?? companyType !== 'ind';
    const codeMatch = effectiveUseCode
      ? t_code === 'code'
      : ['nocode', 'none'].includes(t_code);

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

    return { template, score };
  });

  // 5. Result Determination
  const viableScores = scores.filter(
    ({ score }) => score > SCORE.MIN_THRESHOLD,
  );
  const [best] = [...viableScores].sort((a, b) => b.score - a.score);

  if (best) {
    return {
      template: best.template,
      score: best.score,
      log: [
        `🔎 Matching COA Template for ${companyType}`,
        `Industry: ${company.industry}`,
        `Search Text: "${searchText}"`,
        ...scores.map((s) => `  ${s.template} → ${s.score}`),
        `✅ Selected: ${best.template} (score: ${best.score})`,
      ].join('\n'),
    };
  }

  // 6. Fallback Mechanism
  const defaultTemplate = DEFAULT_TEMPLATES[companyType];
  const defaultNoCode = defaultTemplate.replace(':code:', ':nocode:');

  // Try code first, then nocode
  if (companyType !== 'ind') {
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
      `Defaults (${defaultTemplate}, ${defaultNoCode}) missing. Valid templates: [${validTemplates.join(', ')}]`,
  );
};

const SCORE = {
  MIN_THRESHOLD: 150,

  INDUSTRY_PRIMARY: 500,
  INDUSTRY_SECONDARY: 200,

  INDUSTRY_ALIAS_PRIMARY: 100,
  INDUSTRY_ALIAS_SECONDARY: 50,

  INDUSTRY_MISMATCH_PENALTY: 150,

  TEMPLATE_BASIC: 20,
  TEMPLATE_ADV: 10,
  TEMPLATE_PRO: 5,

  CODE_MATCH: 0,
  CODE_MISMATCH_PENALTY: 0,

  VERSION_MULTIPLIER: 5,
  ONE: 1,
};

const DEFAULT_TEMPLATES: Record<CoaTemplateCompanyType, string> = {
  ind: 'ind:none:basic:nocode:v1',
  biz: 'biz:none:basic:code:v1',
  acc: 'acc:prof:basic:code:v1',
};

// Keyword mappings for industry matching
const industryKeywords: Record<CoaTemplateIndustry, IndustryKeywordConfig> = {
  saas: {
    primary: [
      'saas',
      'software as a service',
      'cloud software',
      'subscription software',
      'recurring billing',
      'hosted software',
      'online platform',
      'web app',
    ],
    secondary: [
      'software',
      'cloud',
      'platform',
      'subscription',
      'digital',
      'monthly plan',
      'annual license',
      'user seats',
      'scalable',
      'api',
    ],
    aliases: ['tech'],
  },
  tech: {
    primary: [
      'technology',
      'tech',
      'it services',
      'tech support',
      'computer systems',
      'software development',
      'information technology',
      'tech',
    ],
    secondary: [
      'hardware',
      'ai',
      'machine learning',
      'data',
      'network',
      'cybersecurity',
      'servers',
    ],
    aliases: ['saas'],
  },
  int_design: {
    primary: [
      'interior design',
      'interior designer',
      'home design',
      'space planning',
      'home decor',
    ],
    secondary: [
      'decor',
      'architecture',
      'renovation',
      'remodel',
      'construction',
      'design consultation',
      'furniture',
      'aesthetics',
      'home improvement',
    ],
    aliases: [],
  },
  retail: {
    primary: [
      'retail',
      'store',
      'ecommerce',
      'online store',
      'brick and mortar',
      'retail sales',
    ],
    secondary: [
      'shop',
      'merchandise',
      'sales',
      'inventory',
      'point of sale',
      'customer service',
      'stock',
      'checkout',
      'product display',
    ],
    aliases: [],
  },
  prof: {
    primary: [
      'professional services',
      'consulting',
      'freelance',
      'business consulting',
      'management consulting',
      'advisory services',
    ],
    secondary: [
      'advisor',
      'expert',
      'specialist',
      'strategy',
      'coaching',
      'training',
      'project management',
      'business services',
    ],
    aliases: ['legal'],
  },
  legal: {
    primary: [
      'legal',
      'law firm',
      'attorney',
      'legal services',
      'law practice',
      'legal consulting',
    ],
    secondary: [
      'lawyer',
      'litigation',
      'compliance',
      'contract',
      'dispute',
      'regulation',
      'legal advice',
      'court',
    ],
    aliases: ['prof'],
  },
  manuf: {
    primary: [
      'manufacturing',
      'production',
      'factory',
      'industrial',
      'fabrication',
      'assembly line',
    ],
    secondary: [
      'assembly',
      'supply chain',
      'equipment',
      'logistics',
      'machinery',
      'production line',
      'quality control',
      'warehousing',
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
      { primary: [] as string[], secondary: [] as string[] },
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
  return keyword.toLowerCase().trim().replace(/\s+/g, ' ');
}
