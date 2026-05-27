import type { ClassValue } from 'clsx';
import { useEffect, useState } from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Hook to detect if a media query matches the current viewport.
 * @param query - A CSS media query string (e.g., "(max-width: 768px)").
 * @returns A boolean indicating if the media query matches.
 */
export function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(() => {
    // Initialize state with current media query result
    if (typeof window !== 'undefined') {
      return window.matchMedia(query).matches;
    }
    return false; // Default for SSR or non-browser environments
  });

  useEffect(() => {
    const media = window.matchMedia(query);
    if (media.matches !== matches) {
      setMatches(media.matches);
    }

    const listener = () => setMatches(media.matches);

    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

export function useSm() {
  return useMediaQuery('(max-width: 640px)');
}

export function useMd() {
  return useMediaQuery('(max-width: 768px)');
}

export function useLg() {
  return useMediaQuery('(min-width: 1024px)');
}

export function useXl() {
  return useMediaQuery('(min-width: 1280px)');
}

export function useIsMobile() {
  return useMediaQuery('(max-width: 639px)');
}

export function useIsTablet() {
  return useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
}

export function useIsDesktop() {
  return useMediaQuery('(min-width: 1024px)');
}
