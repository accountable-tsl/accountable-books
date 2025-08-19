import { describe, it, expect } from 'vitest';

// Simple utility functions to test
function add(a: number, b: number): number {
  return a + b;
}

function multiply(a: number, b: number): number {
  return a * b;
}

function formatName(firstName: string, lastName: string): string {
  return `${firstName} ${lastName}`.replace(/\s+/g, ' ').trim();
}

describe('Simple Math Functions', () => {
  describe('add', () => {
    it('should add two positive numbers', () => {
      expect(add(2, 3)).toBe(5);
    });

    it('should add negative numbers', () => {
      expect(add(-1, -2)).toBe(-3);
    });

    it('should add zero', () => {
      expect(add(5, 0)).toBe(5);
    });
  });

  describe('multiply', () => {
    it('should multiply two positive numbers', () => {
      expect(multiply(2, 3)).toBe(6);
    });

    it('should multiply by zero', () => {
      expect(multiply(5, 0)).toBe(0);
    });

    it('should handle negative numbers', () => {
      expect(multiply(-2, 3)).toBe(-6);
    });
  });
});

describe('String Functions', () => {
  describe('formatName', () => {
    it('should format first and last name', () => {
      expect(formatName('John', 'Doe')).toBe('John Doe');
    });

    it('should handle empty strings', () => {
      expect(formatName('', 'Doe')).toBe('Doe');
      expect(formatName('John', '')).toBe('John');
    });

    it('should trim whitespace', () => {
      expect(formatName('  John  ', '  Doe  ')).toBe('John Doe');
    });
  });
});
