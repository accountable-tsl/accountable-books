import {
  camelToSnake,
  snakeToCamel,
  toCamelCase,
  toSnakeCase,
} from "./formatting.utils";

describe("shares/utils/formatting.utils", () => {
  // Shared helper for testing unchanged inputs
  // Ensures the utility functions safely return unmodified results
  // for non-object inputs like strings, numbers, booleans, null, etc.
  const testUnchanged = (fn: (input: any) => any, name: string) => {
    describe(`${name} unchanged inputs`, () => {
      it("returns primitives as-is", () => {
        expect(fn("string")).toBe("string");
        expect(fn(42)).toBe(42);
        expect(fn(true)).toBe(true);
      });

      it("returns null, undefined, empty string as-is", () => {
        expect(fn(null)).toBe(null);
        expect(fn(undefined)).toBe(undefined);
        expect(fn("")).toBe("");
      });

      it("returns Date objects as-is", () => {
        const date = new Date();
        expect(fn(date)).toBe(date);
      });
    });
  };

  describe("camelToSnake", () => {
    testUnchanged(camelToSnake, "camelToSnake");

    it("converts flat camelCase objects to snake_case", () => {
      expect(camelToSnake({ key: "value" })).toEqual({ key: "value" });
      expect(camelToSnake({ firstName: "John", lastname: "Doe" })).toEqual({
        first_name: "John",
        lastname: "Doe",
      });
    });

    it("converts flat camelCase objects to snake_case", () => {
      expect(camelToSnake({ firstName: "John", userId: 1 })).toStrictEqual({
        first_name: "John",
        user_id: 1,
      });
    });

    it("handles nested camelCase objects", () => {
      expect(
        camelToSnake({
          userId: 1,
          nestedObj: { userRole: "admin", createdAt: "2023" },
        })
      ).toStrictEqual({
        user_id: 1,
        nested_obj: { user_role: "admin", created_at: "2023" },
      });
    });

    it("converts arrays of camelCase objects", () => {
      expect(camelToSnake([{ userId: 1 }, { userId: 2 }])).toStrictEqual([
        { user_id: 1 },
        { user_id: 2 },
      ]);
    });

    it("ignores non-string keys", () => {
      expect(
        camelToSnake({ 1: "value", symbol: "test", userId: 1 })
      ).toStrictEqual({ 1: "value", symbol: "test", user_id: 1 });
    });

    // Mixed input: snake_case key should be left untouched
    it("handles already snake_case keys", () => {
      expect(
        camelToSnake({ already_snake: "yes", notAlreadySnake: "no" })
      ).toStrictEqual({
        already_snake: "yes",
        not_already_snake: "no",
      });
    });
  });

  /**
   * snakeToCamel
   *
   * What it does:
   * - Recursively converts all object keys from snake_case to camelCase.
   *
   * Why:
   * - snake_case is used in the database but we return data in camelCase to the front end
   * - which matches the standard in JavaScript/TypeScript code.
   *
   * Notes:
   * - Does **not** change values, only keys.
   */

  describe("snakeToCamel", () => {
    testUnchanged(snakeToCamel, "snakeToCamel");

    it("converts flat snake_case objects to camelCase", () => {
      expect(snakeToCamel({ first_name: "John", user_id: 1 })).toStrictEqual({
        firstName: "John",
        userId: 1,
      });
    });

    it("handles nested snake_case objects", () => {
      expect(
        snakeToCamel({
          user_id: 1,
          nested_obj: { user_role: "admin", created_at: "2023" },
        })
      ).toStrictEqual({
        userId: 1,
        nestedObj: { userRole: "admin", createdAt: "2023" },
      });
    });

    it("converts arrays of snake_case objects", () => {
      expect(snakeToCamel([{ user_id: 1 }, { user_id: 2 }])).toStrictEqual([
        { userId: 1 },
        { userId: 2 },
      ]);
    });

    it("ignores non-string keys", () => {
      expect(
        snakeToCamel({ 1: "value", symbol: "test", user_id: 1 })
      ).toStrictEqual({ 1: "value", symbol: "test", userId: 1 });
    });

    it("handles already camelCase keys", () => {
      expect(snakeToCamel({ alreadyCamel: "yes" })).toStrictEqual({
        alreadyCamel: "yes",
      });
    });
  });

  describe("toSnakeCase", () => {
    it("converts camelCase and PascalCase to snake_case", () => {
      expect(toSnakeCase("helloWorld")).toBe("hello_world");
      expect(toSnakeCase("UserId")).toBe("user_id");
      expect(toSnakeCase("XMLParser")).toBe("xml_parser");
    });

    it("handles edge cases", () => {
      expect(toSnakeCase("")).toBe("");
      expect(toSnakeCase("hello__world")).toBe("hello_world");
      expect(toSnakeCase("_hello_world_")).toBe("hello_world");
      expect(toSnakeCase("URL")).toBe("url");
    });
  });

  // toCamelCase
  describe("toCamelCase", () => {
    it("converts snake_case to camelCase", () => {
      expect(toCamelCase("hello_world")).toBe("helloWorld");
      expect(toCamelCase("user_id")).toBe("userId");
    });

    it("handles edge cases", () => {
      expect(toCamelCase("")).toBe("");
      expect(toCamelCase("hello__world")).toBe("helloWorld");
      expect(toCamelCase("_hello_world_")).toBe("helloWorld");
      expect(toCamelCase("URL")).toBe("url");
      expect(toCamelCase("xml_parser")).toBe("xmlParser");
    });
  });
});
