export const DEFAULT_STOPWORDS = new Set([
  'THE',
  'AND',
  'OR',
  'FOR',
  'TO',
  'FROM',
  'AT',
  'IN',
  'ON',
  'WITH',
  'BY',
  'OF',
  'A',
  'AN',
]);

export const DEFAULT_ALLOW2 = new Set([
  'US',
  'UK',
  'NG',
  'IN',
  'EU',
  'CA',
  'AU',
  'FR',
  'DE',
  'NY',
  'TX',
]);

export const TOKEN_RE = /\p{L}[\p{L}\p{N}_-]*/gu;
