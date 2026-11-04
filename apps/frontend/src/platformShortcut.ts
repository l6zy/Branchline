export function getShortcutModifier(platform: string = typeof navigator === 'undefined' ? '' : navigator.platform) {
  return /Mac|iPhone|iPad|iPod/i.test(platform) ? '⌘' : 'Ctrl'
}
