import { describe, expect, test } from 'vitest';
import { validate as uuidValidate, version as uuidVersion } from 'uuid';
import {
  normalizeName,
  uuidV5ForCompanyName,
  uuidV5ForCompanyProject,
  dedupeByNormalizedKey,
} from './id.js';

describe('normalizeName', () => {
  test('should trim and lowercase input', () => {
    expect(normalizeName('  Hello World  ')).toBe('hello world');
  });

  test('should handle empty string', () => {
    expect(normalizeName('')).toBe('');
  });

  test('should handle string with only whitespace', () => {
    expect(normalizeName('   ')).toBe('');
  });

  test('should handle mixed case input', () => {
    expect(normalizeName('CaMeL cAsE')).toBe('camel case');
  });

  test('should handle special characters', () => {
    expect(normalizeName('  John Doe & Co.  ')).toBe('john doe & co.');
  });

  test('should handle unicode characters', () => {
    expect(normalizeName('  André & José  ')).toBe('andré & josé');
  });

  test('should be idempotent', () => {
    const input = 'Test Name';
    const normalized = normalizeName(input);
    expect(normalizeName(normalized)).toBe(normalized);
  });
});

describe('uuidV5ForCompanyName', () => {
  const testCompanyId = '123e4567-e89b-12d3-a456-426614174000';
  const testName = 'Test Contact';

  test('should generate valid UUIDv5', () => {
    const result = uuidV5ForCompanyName(testCompanyId, testName);

    expect(uuidValidate(result)).toBe(true);
    expect(uuidVersion(result)).toBe(5);
  });

  test('should be deterministic for same inputs', () => {
    const result1 = uuidV5ForCompanyName(testCompanyId, testName);
    const result2 = uuidV5ForCompanyName(testCompanyId, testName);

    expect(result1).toBe(result2);
  });

  test('should generate different UUIDs for different names', () => {
    const result1 = uuidV5ForCompanyName(testCompanyId, 'Contact One');
    const result2 = uuidV5ForCompanyName(testCompanyId, 'Contact Two');

    expect(result1).not.toBe(result2);
  });

  test('should generate different UUIDs for different company IDs', () => {
    const companyId2 = '987fcdeb-51a2-43d1-b789-123456789abc';
    const result1 = uuidV5ForCompanyName(testCompanyId, testName);
    const result2 = uuidV5ForCompanyName(companyId2, testName);

    expect(result1).not.toBe(result2);
  });

  test('should normalize name before generating UUID', () => {
    const result1 = uuidV5ForCompanyName(testCompanyId, 'Test Contact');
    const result2 = uuidV5ForCompanyName(testCompanyId, '  TEST CONTACT  ');

    expect(result1).toBe(result2);
  });

  test('should handle empty name', () => {
    const result = uuidV5ForCompanyName(testCompanyId, '');

    expect(uuidValidate(result)).toBe(true);
    expect(uuidVersion(result)).toBe(5);
  });

  test('should handle special characters in name', () => {
    const result = uuidV5ForCompanyName(testCompanyId, 'John Doe & Co., Inc.');

    expect(uuidValidate(result)).toBe(true);
    expect(uuidVersion(result)).toBe(5);
  });
});

describe('uuidV5ForCompanyProject', () => {
  const testCompanyId = '123e4567-e89b-12d3-a456-426614174000';
  const testProjectName = 'Test Project';

  test('should generate valid UUIDv5', () => {
    const result = uuidV5ForCompanyProject(testCompanyId, testProjectName);

    expect(uuidValidate(result)).toBe(true);
    expect(uuidVersion(result)).toBe(5);
  });

  test('should be deterministic for same inputs', () => {
    const result1 = uuidV5ForCompanyProject(testCompanyId, testProjectName);
    const result2 = uuidV5ForCompanyProject(testCompanyId, testProjectName);

    expect(result1).toBe(result2);
  });

  test('should generate different UUIDs for different project names', () => {
    const result1 = uuidV5ForCompanyProject(testCompanyId, 'Project Alpha');
    const result2 = uuidV5ForCompanyProject(testCompanyId, 'Project Beta');

    expect(result1).not.toBe(result2);
  });

  test('should generate different UUIDs for different company IDs', () => {
    const companyId2 = '987fcdeb-51a2-43d1-b789-123456789abc';
    const result1 = uuidV5ForCompanyProject(testCompanyId, testProjectName);
    const result2 = uuidV5ForCompanyProject(companyId2, testProjectName);

    expect(result1).not.toBe(result2);
  });

  test('should normalize project name before generating UUID', () => {
    const result1 = uuidV5ForCompanyProject(testCompanyId, 'Test Project');
    const result2 = uuidV5ForCompanyProject(testCompanyId, '  TEST PROJECT  ');

    expect(result1).toBe(result2);
  });

  test('should use same namespace as uuidV5ForCompanyName (both use companyId)', () => {
    const contactUuid = uuidV5ForCompanyName(testCompanyId, testProjectName);
    const projectUuid = uuidV5ForCompanyProject(testCompanyId, testProjectName);

    // Both functions use the same namespace (companyId), so they generate the same UUID
    expect(contactUuid).toBe(projectUuid);
  });
});

describe('dedupeByNormalizedKey', () => {
  type TestItem = {
    id: number;
    name: string;
    value: string;
  };

  const createTestItems = (): TestItem[] => [
    { id: 1, name: 'John Doe', value: 'first' },
    { id: 2, name: '  JOHN DOE  ', value: 'second' },
    { id: 3, name: 'jane smith', value: 'third' },
    { id: 4, name: 'John Doe', value: 'fourth' },
    { id: 5, name: 'Jane Smith', value: 'fifth' },
    { id: 6, name: 'Bob Wilson', value: 'sixth' },
  ];

  test('should remove duplicates by normalized key', () => {
    const items = createTestItems();
    const result = dedupeByNormalizedKey(items, (item) => item.name);

    expect(result).toHaveLength(3);

    // Should keep first occurrence of each normalized name
    expect(result[0]).toEqual({ id: 1, name: 'John Doe', value: 'first' });
    expect(result[1]).toEqual({ id: 3, name: 'jane smith', value: 'third' });
    expect(result[2]).toEqual({ id: 6, name: 'Bob Wilson', value: 'sixth' });
  });

  test('should preserve original order of first occurrences', () => {
    const items = createTestItems();
    const result = dedupeByNormalizedKey(items, (item) => item.name);

    // Order should be based on first occurrence
    expect(result.map((item) => item.name)).toEqual(['John Doe', 'jane smith', 'Bob Wilson']);
  });

  test('should handle empty array', () => {
    const result = dedupeByNormalizedKey([], (item: TestItem) => item.name);
    expect(result).toEqual([]);
  });

  test('should handle array with single item', () => {
    const items = [{ id: 1, name: 'Single Item', value: 'test' }];
    const result = dedupeByNormalizedKey(items, (item) => item.name);

    expect(result).toEqual(items);
  });

  test('should handle array with no duplicates', () => {
    const items = [
      { id: 1, name: 'Alice', value: 'first' },
      { id: 2, name: 'Bob', value: 'second' },
      { id: 3, name: 'Charlie', value: 'third' },
    ];
    const result = dedupeByNormalizedKey(items, (item) => item.name);

    expect(result).toEqual(items);
  });

  test('should handle complex key extraction with normalization', () => {
    type ComplexItem = {
      fullName: string;
      data: string;
    };

    const items: ComplexItem[] = [
      { fullName: 'John Doe', data: 'first' },
      { fullName: '  JOHN DOE  ', data: 'second' },
      { fullName: 'Jane Smith', data: 'third' },
    ];

    const result = dedupeByNormalizedKey(
      items,
      (item) => item.fullName, // This gets normalized inside dedupeByNormalizedKey
    );

    expect(result).toHaveLength(2); // John Doe duplicates should be deduplicated
    expect(result[0].data).toBe('first');
    expect(result[1].data).toBe('third');
  });

  test('should handle items with empty key strings', () => {
    const items = [
      { id: 1, name: '', value: 'first' },
      { id: 2, name: '  ', value: 'second' },
      { id: 3, name: 'Valid Name', value: 'third' },
      { id: 4, name: '', value: 'fourth' },
    ];

    const result = dedupeByNormalizedKey(items, (item) => item.name);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ id: 1, name: '', value: 'first' });
    expect(result[1]).toEqual({ id: 3, name: 'Valid Name', value: 'third' });
  });

  test('should handle items with special characters in keys', () => {
    const items = [
      { id: 1, name: 'John & Co.', value: 'first' },
      { id: 2, name: '  JOHN & CO.  ', value: 'second' },
      { id: 3, name: 'Smith & Sons', value: 'third' },
    ];

    const result = dedupeByNormalizedKey(items, (item) => item.name);

    expect(result).toHaveLength(2);
    expect(result[0].name).toBe('John & Co.');
    expect(result[1].name).toBe('Smith & Sons');
  });
});

describe('Integration Tests', () => {
  test('UUID functions should work well with dedupe function', () => {
    type ContactItem = {
      companyId: string;
      name: string;
      uuid?: string;
    };

    const companyId = '123e4567-e89b-12d3-a456-426614174000';
    const contacts: ContactItem[] = [
      { companyId, name: 'John Doe' },
      { companyId, name: '  JOHN DOE  ' },
      { companyId, name: 'Jane Smith' },
      { companyId, name: 'john doe' },
    ];

    // Dedupe first
    const deduped = dedupeByNormalizedKey(contacts, (item) => item.name);

    // Then generate UUIDs
    const withUuids = deduped.map((contact) => ({
      ...contact,
      uuid: uuidV5ForCompanyName(contact.companyId, contact.name),
    }));

    expect(withUuids).toHaveLength(2);
    expect(withUuids[0].name).toBe('John Doe');
    expect(withUuids[1].name).toBe('Jane Smith');

    // UUIDs should be valid and different
    expect(uuidValidate(withUuids[0].uuid!)).toBe(true);
    expect(uuidValidate(withUuids[1].uuid!)).toBe(true);
    expect(withUuids[0].uuid).not.toBe(withUuids[1].uuid);
  });

  test('UUID functions should be consistent across different normalization scenarios', () => {
    const companyId = '123e4567-e89b-12d3-a456-426614174000';

    // Test various forms of the same name
    const nameVariants = ['John Doe', '  John Doe  ', 'JOHN DOE', 'john doe', '  JOHN DOE  '];

    const uuids = nameVariants.map((name) => uuidV5ForCompanyName(companyId, name));

    // All should generate the same UUID
    uuids.forEach((uuid) => {
      expect(uuid).toBe(uuids[0]);
    });
  });
});
