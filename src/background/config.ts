export const backgroundConfig = {
  sceneUrl: 'https://prod.spline.design/jB8FZK-ZlIaxJAce/scene.splinecode',
  motion: {
    enabled: true,
    idleSpeed: (Math.PI * 2) / 80,
    parallax: Math.PI / 90,
    damping: 3.5,
  },
  bloom: {
    // Tuned against the published Screen bloom; UnrealBloomPass uses a different intensity scale.
    strength: 0.14,
    radius: 0.6,
    threshold: 0.147,
    smoothing: 0.333,
  },
  maxDpr: 1.75,
  composition: {
    desktop: { scale: 1.02, offsetX: 0.052, offsetY: 0.093 },
    portrait: { scale: 1.8, offsetX: 0.24, offsetY: 0.2 },
  },
} as const
