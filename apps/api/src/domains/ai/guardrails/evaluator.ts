import {
  ACCESS_DISCLOSURE_PATTERNS,
  ACCOUNTING_SCOPE_PATTERNS,
  AI_ACCESS_DISCLOSURE_FALLBACK_MESSAGE,
  AI_CRISIS_SUPPORT_FALLBACK_MESSAGE,
  AI_OFF_TOPIC_FALLBACK_MESSAGE,
  AI_POLICY_BYPASS_FALLBACK_MESSAGE,
  CONTINUATION_PATTERNS,
  CRISIS_SUPPORT_PATTERNS,
  NON_BUSINESS_CREATIVE_PATTERNS,
  POLICY_BYPASS_PATTERNS,
} from './policy.js';

export type GuardrailReasonCode =
  | 'off_topic'
  | 'access_disclosure'
  | 'policy_bypass'
  | 'crisis_support';

export type GuardrailDecision =
  | {
      allow: true;
      latestUserText: string;
    }
  | {
      allow: false;
      reasonCode: GuardrailReasonCode;
      userMessage: string;
      latestUserText: string;
    };

function normalizeText(value: string): string {
  return value.trim().toLowerCase();
}

function extractUiMessageText(message: unknown): string {
  if (!message || typeof message !== 'object') return '';

  const content = (message as any).content;
  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  const parts = Array.isArray((message as any).parts)
    ? ((message as any).parts as unknown[])
    : [];
  const text = parts
    .filter(
      (part): part is { type: string; text: string } =>
        Boolean(part) &&
        typeof part === 'object' &&
        typeof (part as any).type === 'string' &&
        typeof (part as any).text === 'string',
    )
    .map((part) => part.text)
    .join('')
    .trim();

  return text;
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function extractUserTexts(messages: unknown[]): string[] {
  return messages
    .filter((msg) => (msg as any)?.role === 'user')
    .map((msg) => extractUiMessageText(msg))
    .filter((text) => text.length > 0);
}

function isLikelyContinuation(text: string): boolean {
  if (text.length > 120) return false;
  return matchesAny(text, CONTINUATION_PATTERNS);
}

export function evaluateAiGuardrail(params: {
  messages: unknown[];
  capabilityId: string;
  domain?: string;
}): GuardrailDecision {
  const userTexts = extractUserTexts(params.messages);
  const latestUserText = userTexts[userTexts.length - 1] ?? '';
  const latest = normalizeText(latestUserText);

  if (!latest) {
    return { allow: true, latestUserText: '' };
  }

  if (matchesAny(latest, CRISIS_SUPPORT_PATTERNS)) {
    return {
      allow: false,
      reasonCode: 'crisis_support',
      userMessage: AI_CRISIS_SUPPORT_FALLBACK_MESSAGE,
      latestUserText,
    };
  }

  if (matchesAny(latest, ACCESS_DISCLOSURE_PATTERNS)) {
    return {
      allow: false,
      reasonCode: 'access_disclosure',
      userMessage: AI_ACCESS_DISCLOSURE_FALLBACK_MESSAGE,
      latestUserText,
    };
  }

  if (
    matchesAny(latest, POLICY_BYPASS_PATTERNS) ||
    matchesAny(latest, NON_BUSINESS_CREATIVE_PATTERNS)
  ) {
    return {
      allow: false,
      reasonCode: 'policy_bypass',
      userMessage: AI_POLICY_BYPASS_FALLBACK_MESSAGE,
      latestUserText,
    };
  }

  if (matchesAny(latest, ACCOUNTING_SCOPE_PATTERNS)) {
    return { allow: true, latestUserText };
  }

  const previousUserTexts = userTexts.slice(0, -1).map(normalizeText);
  const priorScopeExists = previousUserTexts.some((text) =>
    matchesAny(text, ACCOUNTING_SCOPE_PATTERNS),
  );
  if (priorScopeExists && isLikelyContinuation(latest)) {
    return { allow: true, latestUserText };
  }

  return {
    allow: false,
    reasonCode: 'off_topic',
    userMessage: AI_OFF_TOPIC_FALLBACK_MESSAGE,
    latestUserText,
  };
}
