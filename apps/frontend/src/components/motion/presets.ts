// Shared physical responses keep navigation, surfaces and disclosures in the same rhythm.
// Position uses springs so an interrupted animation retains its current velocity.
export const motionPresets = {
  instant: { duration: 0 },
  page: { type: 'spring', stiffness: 560, damping: 42, mass: 1 },
  surface: { type: 'spring', stiffness: 460, damping: 32, mass: 0.85 },
  disclosure: { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 },
  selection: { type: 'spring', stiffness: 580, damping: 38, mass: 0.8 },
  fadeIn: { duration: 0.16, ease: 'easeOut' },
  fadeOut: { duration: 0.12, ease: 'easeOut' },
} as const
