// Accepts any event-like object (mouse or keyboard) carrying a DOM target.
export function isClickInsideExcludedElement(e: {
  target: EventTarget | null;
}) {
  const target = e.target as HTMLElement;
  const interactiveElements = [
    'input',
    'select',
    'textarea',
    'button',
    'a',
    '[data-no-row-click]',
    "input[type='checkbox']",
  ];

  return interactiveElements.some((selector) => target.closest(selector));
}

export function isInternalUrl(url: string): boolean {
  const protocolRegex = /^[a-zA-Z]+:\/\//;
  if (protocolRegex.test(url)) {
    try {
      const currentOrigin = window.location.origin;
      const targetUrl = new URL(url);
      return targetUrl.origin === currentOrigin;
    } catch {
      return false;
    }
  }

  return true;
}
