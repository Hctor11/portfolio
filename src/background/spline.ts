import { Box3, Group, Matrix3, Mesh, OrthographicCamera, Vector3 } from 'three'
import type { BufferGeometry, Camera, LightShadow, Material, Scene, ShaderMaterial, Texture } from 'three'
import { backgroundConfig as config } from './config.ts'

type SplineMesh = Mesh & {
  data?: { visible?: boolean; cloner?: { disabled?: boolean; hideBase?: boolean } }
  localGeometry?: BufferGeometry
  geometryCreateDeleyed?: BufferGeometry
  cloner?: Group
  setFromClonerState?: (data: unknown, context: unknown) => void
  expandCloner?: (context: unknown) => void
}

export function restoreCloners(scene: Scene) {
  const meshes: SplineMesh[] = []
  scene.traverse((object) => {
    const mesh = object as SplineMesh
    if (mesh.isMesh && mesh.data?.cloner && !mesh.data.cloner.disabled) meshes.push(mesh)
  })
  for (const mesh of meshes) {
    const base = mesh.geometryCreateDeleyed
    if (!base?.isBufferGeometry || !mesh.setFromClonerState || !mesh.expandCloner) {
      throw new Error('Spline loader cannot restore the original cloner geometry for clone-space displacement.')
    }
    const merged = mesh.geometry
    const context = { scene, shared: (scene as Scene & { sharedAssets?: unknown }).sharedAssets }
    mesh.localGeometry = undefined
    mesh.setFromClonerState(mesh.data!.cloner, context)
    mesh.expandCloner(context)
    const cloner = mesh.cloner
    if (!cloner?.parent || !cloner.children.length) throw new Error('Spline cloner expansion returned no instances.')

    // Reuse Spline's exact cached vertices, material, and authored clone matrices.
    // Baking these matrices into vertices evaluates Displace and Depth in the wrong space.
    const group = new Group()
    group.name = `${mesh.name}-clones`
    group.matrix.copy(cloner.matrix)
    group.matrixAutoUpdate = false
    for (const child of cloner.children) {
      const clone = new Mesh(base, mesh.material)
      clone.name = `${mesh.name}-clone-${group.children.length}`
      clone.matrix.copy(child.matrix)
      clone.matrixAutoUpdate = false
      group.add(clone)
    }
    cloner.parent.add(group)
    mesh.setFromClonerState(null, context)
    mesh.visible = mesh.data!.visible !== false && !mesh.data!.cloner!.hideBase
    if (merged !== base) merged.dispose()
  }
}

export function prepareSpline(scene: Scene) {
  restoreCloners(scene)
  const sculpture = scene.getObjectByName('main')
  let sourceCamera: Camera | undefined
  scene.traverse((object) => {
    // Native flags survive Vite's cached module copies; instanceof does not.
    const camera = object as Camera & { makeDefault?: boolean }
    if (camera.isCamera && camera.makeDefault) sourceCamera = camera
  })
  if (!sculpture?.parent || !sourceCamera) throw new Error('Spline sculpture or exported camera is missing.')

  scene.updateMatrixWorld(true)
  const bounds = new Box3().setFromObject(sculpture, true)
  const center = bounds.getCenter(new Vector3())
  const point = new Vector3()
  let radiusSquared = 0
  sculpture.traverse((object) => {
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    const positions = mesh.geometry.getAttribute('position')
    for (let index = 0; index < positions.count; index++) {
      point.fromBufferAttribute(positions, index).applyMatrix4(mesh.matrixWorld)
      radiusSquared = Math.max(radiusSquared, point.distanceToSquared(center))
    }
  })
  // CPU bounds omit the imported noise displacement; reserve space for its peaks.
  const radius = Math.sqrt(radiusSquared) * 1.12
  if (!Number.isFinite(radius) || radius <= 0) throw new Error('Spline sculpture has invalid bounds.')

  // Pivot wrappers preserve every imported world transform and keep lights stationary.
  const ring = sculpture.getObjectByName('Plane-clones') ?? sculpture
  const rotationCenter = ring.getWorldPosition(new Vector3())
  // The authored clone centers lie in local XZ; account for the imported nonuniform scales.
  const rotationAxis = new Vector3(0, 1, 0).applyNormalMatrix(new Matrix3().getNormalMatrix(ring.matrixWorld))
  const parallax = new Group()
  parallax.name = 'cursor-parallax'
  sculpture.parent.add(parallax)
  parallax.position.copy(parallax.parent!.worldToLocal(rotationCenter.clone()))
  const idle = new Group()
  idle.name = 'idle-rotation'
  parallax.add(idle)
  idle.attach(sculpture)

  // Keep R3F's resize handler from overwriting the frustum owned by fitCamera.
  const camera = Object.assign(new OrthographicCamera(-1, 1, 1, -1, 0.1, radius * 10), { manual: true })
  sourceCamera.getWorldQuaternion(camera.quaternion)
  sourceCamera.getWorldPosition(camera.position)
  const source = sourceCamera as OrthographicCamera
  camera.userData.splineFraming = {
    position: camera.position.clone(), center,
    height: (source.top - source.bottom) / source.zoom,
  }
  const distance = camera.position.distanceTo(center)
  camera.near = Math.max(0.1, distance - radius * 2)
  camera.far = distance + radius * 2
  camera.updateMatrixWorld(true)
  return { scene, camera, parallax, idle, radius, rotationAxis }
}

export function setTurbineRotation(pivot: Group, axis: Vector3, elapsedSeconds: number) {
  const period = (Math.PI * 2) / config.motion.idleSpeed
  // Rebuild from a bounded phase, never from the previous transform.
  pivot.quaternion.setFromAxisAngle(axis, (elapsedSeconds % period) * config.motion.idleSpeed)
}

export function fitCamera(camera: OrthographicCamera, radius: number, width: number, height: number) {
  // Start with the exported view, then frame the right/lower composition from Figma.
  const aspect = width / Math.max(height, 1)
  const framing = camera.userData.splineFraming
  const composition = aspect >= 1 ? config.composition.desktop : config.composition.portrait
  const halfHeight = (aspect >= 1 ? framing.height / 2 : radius / (0.82 * aspect)) / composition.scale
  camera.position.copy(framing.position)
  if (aspect < 1) {
    camera.position.set(0, 0, radius * 4).applyQuaternion(camera.quaternion).add(framing.center)
    camera.near = radius
    camera.far = radius * 7
  } else {
    const distance = camera.position.distanceTo(framing.center)
    camera.near = Math.max(0.1, distance - radius * 2)
    camera.far = distance + radius * 2
  }
  const horizontalOffset = halfHeight * aspect * composition.offsetX * 2
  const verticalOffset = halfHeight * composition.offsetY * 2
  camera.left = -halfHeight * aspect - horizontalOffset
  camera.right = halfHeight * aspect - horizontalOffset
  camera.top = halfHeight + verticalOffset
  camera.bottom = -halfHeight + verticalOffset
  camera.updateProjectionMatrix()
  camera.updateMatrixWorld(true)
}

export function disposeSpline(scene: Scene) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  scene.traverse((object) => {
    if ('shadow' in object && object.shadow) (object.shadow as LightShadow).dispose()
    const mesh = object as Mesh
    if (!mesh.isMesh) return
    geometries.add(mesh.geometry)
    for (const material of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      materials.add(material)
      for (const value of Object.values(material)) if ((value as Texture)?.isTexture) textures.add(value as Texture)
      const uniforms = (material as ShaderMaterial).uniforms
      if (uniforms) for (const { value } of Object.values(uniforms)) {
        if ((value as Texture)?.isTexture) textures.add(value as Texture)
      }
    }
  })
  textures.forEach((texture) => texture.dispose())
  materials.forEach((material) => material.dispose())
  geometries.forEach((geometry) => geometry.dispose())
  scene.clear()
}
