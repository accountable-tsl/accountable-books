import { isDev } from '../../config/env.js';
import { type AccountClassificationMetadata, type EnrichedAccountType } from './account.types.js';

const flattenAccountTypes = (data: AccountClassificationMetadata) => {
  const { accountTypes, accountElements, parentAccountElements, financialStatements } = data;

  const results: Array<EnrichedAccountType> = [];
  const orphaned: string[] = [];

  for (const at of accountTypes) {
    const ae = accountElements.find((ae) => ae.key === at.elementKey);
    if (!ae) {
      orphaned.push(at.key);
      continue;
    }

    console.log(accountElements);
    console.log(parentAccountElements);
    const parent = parentAccountElements.find((p) => p.key === ae.parentElementKey);
    console.log(parent);

    const fs = financialStatements.find((f) => f.key === ae.financialStatementKey);

    if (!parent || !fs) {
      orphaned.push(at.key);
      continue;
    }

    results.push({
      key: at.key,
      label: at.label,

      elementKey: ae.key,
      elementLabel: ae.label,

      parentElementKey: parent.key,
      parentElementLabel: parent.label,

      defaultSide: ae.defaultSide,

      financialStatementKey: fs.key,
      financialStatementLabel: fs.defaultLabel,

      reportCode: at.reportCode ?? null,
      elementReportCode: ae.reportCode ?? null,
      parentElementReportCode: parent.reportCode ?? null,

      _rawElement: ae,
      _rawParent: parent,
      _rawFinancialStatement: fs,
    });
  }

  if (isDev && orphaned.length > 0) {
    console.warn('Account types with missing relationships:', orphaned);
  }

  return results;
};
