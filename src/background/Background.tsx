import { useEffect, useMemo, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import SplineLoader from '@splinetool/loader'
import { Box3, Euler, MathUtils, NoToneMapping, Vector2, Vector3 } from 'three'
import type { Mesh } from 'three'
import { backgroundConfig as config } from './config'
import { disposeSpline, fitCamera, prepareSpline, setTurbineRotation } from './spline'
import { Bloom } from './Bloom'

type ImportedScene = ReturnType<typeof prepareSpline>

function Sculpture({ imported, reducedMotion }: { imported: ImportedScene; reducedMotion: boolean }) {
  const { scene, camera, idle, parallax, radius, rotationAxis } = imported
  const pointer = useRef(new Vector2())
  const tilt = useRef(new Euler())
  const elapsed = useRef(0)
  const inverseView = useMemo(() => camera.quaternion.clone().invert(), [camera])
  const set = useThree((state) => state.set)
  const gl = useThree((state) => state.gl)
  const size = useThree((state) => state.size)
  const invalidate = useThree((state) => state.invalidate)

  useEffect(() => {
    set({ camera })
  }, [set, camera])

  useEffect(() => {
    fitCamera(camera, radius, size.width, size.height)
    invalidate()
    const hierarchy: Record<string, unknown>[] = []
    let meshCount = 0
    scene.traverse((object) => {
      if ((object as Mesh).isMesh) meshCount++
      hierarchy.push({
        name: object.name || '(root)', parent: object.parent?.name || '(root)', type: object.type,
        visible: object.visible, position: object.position.toArray(), scale: object.scale.toArray(),
      })
    })
    const bounds = new Box3().setFromObject(scene, true)
    console.groupCollapsed('[Spline] Loaded scene and fitted camera')
    console.table(hierarchy)
    console.info('Mesh count:', meshCount, 'Bounding box:', { min: bounds.min.toArray(), max: bounds.max.toArray() },
      'Center:', bounds.getCenter(new Vector3()).toArray())
    console.info('Camera:', { position: camera.position.toArray(), near: camera.near, far: camera.far,
      left: camera.left, right: camera.right, top: camera.top, bottom: camera.bottom,
      projection: camera.projectionMatrix.toArray() })
    console.groupEnd()
  }, [scene, camera, radius, size.width, size.height, invalidate])

  useEffect(() => {
    const canvas = gl.domElement
    const finePointer = window.matchMedia('(any-hover: hover) and (any-pointer: fine)')
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch' || !finePointer.matches) {
        pointer.current.set(0, 0)
        return
      }
      const rect = canvas.getBoundingClientRect()
      pointer.current.set(
        MathUtils.clamp(((event.clientX - rect.left) / rect.width) * 2 - 1, -1, 1),
        MathUtils.clamp(1 - ((event.clientY - rect.top) / rect.height) * 2, -1, 1),
      )
    }
    const reset = () => pointer.current.set(0, 0)
    // Listen above the canvas so portfolio navigation does not interrupt parallax.
    window.addEventListener('pointermove', move, { passive: true })
    document.documentElement.addEventListener('pointerleave', reset)
    window.addEventListener('pointercancel', reset)
    window.addEventListener('blur', reset)
    return () => {
      window.removeEventListener('pointermove', move)
      document.documentElement.removeEventListener('pointerleave', reset)
      window.removeEventListener('pointercancel', reset)
      window.removeEventListener('blur', reset)
    }
  }, [gl])

  useEffect(() => {
    if (reducedMotion) {
      pointer.current.set(0, 0)
      tilt.current.set(0, 0, 0)
      parallax.quaternion.identity()
      invalidate()
    }
  }, [reducedMotion, parallax, invalidate])

  useFrame((_, delta) => {
    if (reducedMotion || !config.motion.enabled) return
    // Use real elapsed seconds for rotation; bound only the pointer's catch-up step.
    const step = Math.min(delta, 0.05)
    elapsed.current += delta
    setTurbineRotation(idle, rotationAxis, elapsed.current)
    tilt.current.x = MathUtils.damp(tilt.current.x, -pointer.current.y * config.motion.parallax, config.motion.damping, step)
    tilt.current.y = MathUtils.damp(tilt.current.y, pointer.current.x * config.motion.parallax, config.motion.damping, step)
    // Cursor tilt uses the camera's axes; turbine rotation stays inside its own centered pivot.
    parallax.quaternion.setFromEuler(tilt.current).premultiply(camera.quaternion).multiply(inverseView)
  })

  return <primitive object={scene} dispose={null} />
}

export function Background() {
  const [imported, setImported] = useState<ImportedScene | null>(null)
  const [reducedMotion, setReducedMotion] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const update = () => setReducedMotion(query.matches)
    query.addEventListener('change', update)
    return () => query.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    let loaded: ImportedScene['scene'] | undefined
    void (async () => {
      try {
        const response = await fetch(config.sceneUrl, { signal: controller.signal })
        if (!response.ok) throw new Error(`Spline request failed: HTTP ${response.status}`)
        const bytes = await response.arrayBuffer()
        if (controller.signal.aborted) return
        const scene = await new SplineLoader().parse(bytes)
        if (controller.signal.aborted) {
          disposeSpline(scene)
          return
        }
        loaded = scene
        // parse() resolves before the original embedded matcap finishes decoding.
        const assets = (scene as typeof scene & { sharedAssets?: { getImageLoadPromises: () => Promise<unknown>[] } }).sharedAssets
        await Promise.all(assets?.getImageLoadPromises() ?? [])
        if (controller.signal.aborted) return
        setImported(prepareSpline(scene))
      } catch (error) {
        if (!controller.signal.aborted) {
          if (loaded) disposeSpline(loaded)
          loaded = undefined
          console.error(`Spline background failed to load: ${config.sceneUrl}`, error)
        }
      }
    })()
    return () => {
      controller.abort()
      if (loaded) disposeSpline(loaded)
    }
  }, [])

  return (
    <div className="background" aria-hidden="true">
      <Canvas
        dpr={[1, config.maxDpr]}
        frameloop={reducedMotion || !config.motion.enabled || !imported ? 'demand' : 'always'}
        gl={{ antialias: true, alpha: false, powerPreference: 'high-performance', toneMapping: NoToneMapping }}
        fallback={null}
      >
        <color attach="background" args={['#ffffff']} />
        {imported && <Sculpture imported={imported} reducedMotion={reducedMotion} />}
        {imported && <Bloom />}
      </Canvas>
    </div>
  )
}
