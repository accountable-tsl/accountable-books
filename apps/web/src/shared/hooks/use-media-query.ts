import { useState, useEffect } from 'react';

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

const MOBILE_BREAKPOINT = 768;

export function useIsMobile() {
  return useMediaQuery(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
}
