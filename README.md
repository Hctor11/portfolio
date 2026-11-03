# Rivera portfolio

Implements the [Figma portfolio](https://www.figma.com/design/mXNym4qWklRrSYi0400mBo/Untitled?node-id=11-2) Home (`11:2`), Selected work (`12:14`), and navigation note (`16:187`). A persistent React Three Fiber canvas renders the original [Spline scene](https://prod.spline.design/jB8FZK-ZlIaxJAce/scene.splinecode) through `@splinetool/loader`.

```sh
pnpm install
pnpm dev
npm run build
npm test
```

Node.js 24 or newer runs the TypeScript-backed tests without another test dependency.

## Portfolio layout and navigation

`src/portfolio/Portfolio.tsx` owns Home, Selected work, and Social; `Navigation.tsx` owns keyboard handling and focus restoration. Enter opens the focused navigation item; the arrow button or Escape returns Home and restores focus to that item. Navigation and social links turn black on hover with a 200ms ease-out transition.

`tokens.css` contains colors, local fonts, spacing, and timing. `portfolio.css` owns responsive layout; `transitions.css` moves the original navigation item into the heading while RIVERA fades out and the active panel appears with a stagger. Reverse and interrupted transitions continue from their current CSS values. Reduced motion removes transitions. No animation library, router, per-frame React updates, or additional dependency was added.

Project cards link to the supplied Manifold UI and Alexandria websites. Their clipped, neutral spotlight follows pointer coordinates through CSS custom properties, with a 200ms opacity fade. Keyboard focus centers the light; reduced motion fixes it at the center. Social lists the supplied LinkedIn, GitHub, Dribbble, and Behance profiles. All six links use `target="_blank"` and `rel="noopener noreferrer"`.

At 1920 × 1080, the navigation begins at x=533. Cards start at (519, 192) and (519, 419), measuring 882 × 201 with a 26px gap. Narrow screens move the previews below the project copy and allow vertical scrolling without horizontal overflow. Returning Home resets scroll position.

`public/projects/` contains the original Manifold image fills, Figma exports of the two visible Alexandria preview regions, and the original back arrow. No temporary Figma asset URLs or raster background are used in the app. All fonts and their OFL licenses are local in `public/fonts/`. Geist drives the portfolio and Alexandria; the Manifold card retains Figma's Plus Jakarta Sans and Figtree typography.

## Persistent 3D background

`Background` stays mounted outside navigation state. Its geometry, material, camera, and WebGL canvas survive every transition. Pointer tracking uses window events so the UI does not block parallax. Selected work applies Figma's 70% white veil using CSS; it does not alter the imported material or add a WebGL effect.

`src/background/config.ts` controls motion, bloom, composition, and maximum DPR. `motion.idleSpeed` is radians per second, defaulting to one revolution per 80 seconds; `motion.parallax` bounds each cursor-tilt axis to ±2°. Set `motion.enabled: false` for stationary visual comparisons. Independent transform groups keep turbine rotation and camera-relative cursor tilt separate. Pointer leave, touch input, cancellation, and window blur return the cursor target to neutral. Parallax requires a fine pointer with hover support. Reduced motion preserves the turbine angle, neutralizes parallax, and renders on demand.

The old world-Y rotation tilted the authored ring plane, causing the sculpture to tumble and change its framing. Its bounds-derived pivot also missed the radial cloner's center, producing about 5px of center motion at a half-turn. The pivot now uses the cloner's authored origin, and the rotation axis is its XZ plane normal transformed correctly through the original nonuniform scales. Each frame rebuilds a bounded quaternion from active elapsed seconds, without incremental transform multiplication or position writes. Camera, geometry, materials, lighting, and initial framing remain unchanged.

The regression tests check the world/projected center and plane normal across ten revolutions plus a one-million-revolution timestamp, verify return to the original world matrices, and compare elapsed-time rotation at simulated 60/144/320 Hz.

## Fidelity fixes

The loader bakes this scene's radial cloner into one mesh before evaluating object-space Displace and Depth layers. That changes the sculpture. The integration restores the loader's cached original geometry and authored clone matrices using its native cloner expansion. All 25 copies share one 7,967-vertex geometry and the original layered material. Vertex, normal, and UV hashes match the published scene. No sculpture vertices or material uniforms are rewritten.

Both Pattern layers, physical Lighting, Displace, Depth, and the original Matcap texture remain intact. Image decoding finishes before the first scene render. Black marks are intentional pattern details: they also appear in the published renderer when bloom is disabled. The original three lights remain unchanged.

Desktop retains the exported orthographic camera's position and orientation, with a small frustum adjustment matching Figma's right/lower composition. Portrait viewports use a larger, offset background crop. Pivot wrappers preserve imported world transforms.

The published renderer's active bloom uses Screen blending, intensity 1.329, luminance threshold 0.147, and smoothing 0.333. Native `UnrealBloomPass` uses a different strength scale; strength 0.14 and radius 0.6 were tuned against paused 1440 × 1000 captures. Screen compositing preserves highlights, and the final copy matches Spline's display-space output without an additional sRGB transfer. No other effects or additional shadow passes are enabled.

Unmount aborts the request and disposes imported geometry, materials, textures, and postprocessing targets. Loading or failed requests leave a white 3D background while navigation remains available; errors remain visible in the console.

## Remaining differences

Spline's proprietary temporal antialiasing and Kawase bloom are not reproduced exactly. Native rendering uses 4× MSAA in the scene target and multi-scale Gaussian bloom. Fine lines remain slightly crisper and the glow differs locally. Geometry and material layers are preserved; no whitening material override masks those differences.

Cloner restoration uses internal loader methods, so `@splinetool/loader` is pinned to the verified 2.0.126 release. Missing cloner support produces an explicit error. The export identifies itself as 2.0.129 and emits a version warning. Three.js and its types remain pinned to 0.185.0 because 0.187.0 removes an API the loader imports. R3F also emits an upstream `THREE.Clock` deprecation warning. Neither warning is suppressed.

The sculpture renders 384,000 triangles across 25 draw calls; bloom adds 14 fullscreen draws. One R3F animation loop owns all rendering. Physical 144–320 Hz hardware has not been benchmarked; performance depends on GPU, viewport, and DPR.

Spline's loader omits authored events, actions, states, and postprocessing; Glass support is partial. This scene has no Glass layer. The requested slow rotation replaces authored animation, and bloom is recreated with existing Three.js addons.

Sources: [Spline code export](https://docs.spline.design/exporting-your-scene/web/exporting-as-code), [official Loader API and limitations](https://www.npmjs.com/package/@splinetool/loader).
