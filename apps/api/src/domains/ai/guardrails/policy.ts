export const AI_OFF_TOPIC_FALLBACK_MESSAGE =
  'I can help with accounting and this app’s workflows. Share the relevant report, transaction, or accounting context and I’ll help.';

export const AI_ACCESS_DISCLOSURE_FALLBACK_MESSAGE =
  'I don’t have automatic access to your full app, private endpoints, or databases. I can only use the context shared in this chat/request.';

export const AI_POLICY_BYPASS_FALLBACK_MESSAGE =
  'I can’t help with requests to ignore safety or policy constraints. I can help with accounting and app workflow questions.';

export const AI_CRISIS_SUPPORT_FALLBACK_MESSAGE =
  'I’m really sorry you’re going through this. If you might act on thoughts of self-harm or are in immediate danger, contact your local emergency services right now. If you want, share your country and I can provide crisis support options in your area, or use https://findahelpline.com/';

export const ACCESS_DISCLOSURE_PATTERNS: RegExp[] = [
  /\bdo you have access\b/,
  /\bcan you access\b/,
  /\bdo you see\b/,
  /\bfull app\b/,
  /\bwhole app\b/,
  /\bendpoints?\b/,
  /\bapi\b/,
  /\bdatabase\b/,
  /\bsource code\b/,
  /\bcodebase\b/,
  /\bprivate data\b/,
  /\binternal system\b/,
];

export const CRISIS_SUPPORT_PATTERNS: RegExp[] = [
  /\bsuicid(e|al)\b/,
  /\bkill myself\b/,
  /\bend my life\b/,
  /\bself[- ]harm\b/,
  /\bhurt myself\b/,
  /\bwant to die\b/,
  /\bdon't want to live\b/,
  /\bcannot go on\b/,
  /\bcan.t go on\b/,
  /\boverdose\b/,
];

export const POLICY_BYPASS_PATTERNS: RegExp[] = [
  /\bignore (all )?(previous|prior|above) instructions\b/,
  /\bdisregard (all )?(previous|prior|above) instructions\b/,
  /\boverride (system|safety|policy)\b/,
  /\bbypass (guardrails?|safety|policy)\b/,
  /\bjailbreak\b/,
  /\bsystem prompt\b/,
  /\bdeveloper prompt\b/,
  /\bprompt injection\b/,
  /\bpretend to be\b/,
  /\bact as\b/,
];

export const NON_BUSINESS_CREATIVE_PATTERNS: RegExp[] = [
  /\bpoem\b/,
  /\bhaiku\b/,
  /\blyrics?\b/,
  /\brap\b/,
  /\bjoke\b/,
  /\bstory\b/,
];

export const ACCOUNTING_SCOPE_PATTERNS: RegExp[] = [
  /\baccounting\b/,
  /\bbookkeeping\b/,
  /\bjournal\b/,
  /\bentry\b/,
  /\bledger\b/,
  /\btrial balance\b/,
  /\bbalance sheet\b/,
  /\bincome statement\b/,
  /\bcash flow\b/,
  /\breport\b/,
  /\breporting\b/,
  /\bvariance\b/,
  /\brevenue\b/,
  /\bexpense\b/,
  /\bprofit\b/,
  /\bmarg(in|ins)\b/,
  /\bdebit\b/,
  /\bcredit\b/,
  /\breconcile\b/,
  /\bcoa\b/,
  /\bchart of accounts\b/,
  /\bcategori(s|z)e\b/,
  /\btransaction\b/,
  /\bbank\b/,
  /\bmemo\b/,
  /\bposting\b/,
  /\bfiscal\b/,
  /\bperiod\b/,
  /\bmonth\b/,
  /\bquarter\b/,
  /\byear\b/,
  /\btax\b/,
  /\bvat\b/,
  /\binvoice\b/,
  /\bvendor\b/,
  /\bcustomer\b/,
  /\bcontact\b/,
  /\bproject\b/,
  /\bline item\b/,
  /\bdashboard\b/,
  /\bthis app\b/,
  /\bthis report\b/,
  // Strategic and advisory
  /\bbudget\b/,
  /\bforecast\b/,
  /\bprojection(s)?\b/,
  /\bscenario\b/,
  // Operating costs and HR
  /\bspend\b/,
  /\bcost(s)?\b/,
  /\bpay(roll)?\b/,
  /\bsalar(y|ies)\b/,
  /\bhir(e|ing)\b/,
  /\bcontractor(s)?\b/,
  /\bmarketing\b/,
  // Cash and metrics
  /\bburn( rate)?\b/,
  /\brunway\b/,
  /\bcash\b/,
  /\bfunding\b/,
  /\binvestor(s)?\b/,
  /\bvaluation\b/,
  /\bebitda\b/,
  /\bmetric(s)?\b/,
  /\bkpi(s)?\b/,
];

export const CONTINUATION_PATTERNS: RegExp[] = [
  /^explain this\b/,
  /^explain that\b/,
  /^summari[sz]e this\b/,
  /^make (it|that) shorter\b/,
  /^make (it|that) clearer\b/,
  /^adjust (it|that)\b/,
  /^rewrite (it|that)\b/,
  /^what does (this|that) mean\b/,
  /^can you expand\b/,
  /^can you simplify\b/,
];
