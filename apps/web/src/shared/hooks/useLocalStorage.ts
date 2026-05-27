import { useEffect, useState } from 'react';

/**
 * Custom hook for syncing state with localStorage
 * Handles serialization/deserialization and SSR safety
 *
 * @param key - localStorage key
 * @param initialValue - Default value if nothing in localStorage
 * @param options - Optional configuration
 * @returns [value, setValue] tuple similar to useState
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options?: {
    /**
     * Custom serializer (e.g., for Date objects)
     * Should return a JSON-serializable object
     */
    serialize?: (value: T) => string;
    /**
     * Custom deserializer (e.g., for Date objects)
     * Should parse the stored string back to T
     */
    deserialize?: (value: string) => T;
  },
): [T, (value: T | ((prev: T) => T)) => void] {
  const { serialize, deserialize } = options || {};

  // Initialize state with value from localStorage or initialValue
  const [storedValue, setStoredValue] = useState<T>(() => {
    if (typeof window === 'undefined') {
      return initialValue;
    }

    try {
      const item = window.localStorage.getItem(key);
      if (!item) {
        return initialValue;
      }

      if (deserialize) {
        return deserialize(item);
      }

      return JSON.parse(item) as T;
    } catch (error) {
      console.warn(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Update localStorage when state changes
  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    try {
      const valueToStore = serialize
        ? serialize(storedValue)
        : JSON.stringify(storedValue);
      window.localStorage.setItem(key, valueToStore);
    } catch (error) {
      console.warn(`Error setting localStorage key "${key}":`, error);
    }
  }, [key, storedValue, serialize]);

  // Return setter that works like useState setter
  const setValue = (value: T | ((prev: T) => T)) => {
    try {
      setStoredValue((prev) => {
        // Support both direct value and function updater
        return value instanceof Function ? value(prev) : value;
      });
    } catch (error) {
      console.warn(`Error updating localStorage key "${key}":`, error);
    }
  };

  return [storedValue, setValue];
}
