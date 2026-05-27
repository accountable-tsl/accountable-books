function isApplePlatform() {
  if (typeof globalThis.navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(globalThis.navigator.platform);
}

export function getShortcutModifierLabel() {
  return isApplePlatform() ? 'Cmd' : 'Ctrl';
}
