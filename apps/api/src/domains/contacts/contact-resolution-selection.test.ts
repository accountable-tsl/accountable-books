import { describe, expect, it } from 'vitest';

import { chooseContactMatch } from './contact-resolution-selection.utils.js';

describe('contact resolution evidence selection', () => {
  it('returns ambiguous when canonical and alias evidence identify different contacts', () => {
    expect(
      chooseContactMatch({
        aliases: [{ id: 'alias-a', contact_id: 'contact-a' }],
        contacts: [{ id: 'contact-b' }],
      }),
    ).toMatchObject({
      contactId: null,
      aliasId: null,
      status: 'ambiguous',
    });
  });

  it('returns ambiguous when duplicate canonical names identify multiple contacts', () => {
    expect(
      chooseContactMatch({
        aliases: [],
        contacts: [{ id: 'contact-a' }, { id: 'contact-b' }],
      }),
    ).toMatchObject({
      contactId: null,
      status: 'ambiguous',
    });
  });

  it('returns the alias only when all evidence identifies one contact', () => {
    expect(
      chooseContactMatch({
        aliases: [{ id: 'alias-a', contact_id: 'contact-a' }],
        contacts: [{ id: 'contact-a' }],
      }),
    ).toMatchObject({
      contactId: 'contact-a',
      aliasId: 'alias-a',
      source: 'alias',
    });
  });
});
