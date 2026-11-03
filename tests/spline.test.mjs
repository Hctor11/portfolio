import assert from 'node:assert/strict'
import test from 'node:test'
import {
  Box3, BoxGeometry, Group, Matrix3, Matrix4, Mesh, MeshStandardMaterial, Object3D, OrthographicCamera,
  PointLight, Scene, ShaderMaterial, Texture, Vector3,
} from 'three'
import { disposeSpline, fitCamera, prepareSpline, restoreCloners, setTurbineRotation } from '../src/background/spline.ts'
import { backgroundConfig as config } from '../src/background/config.ts'

function fixture() {
  const scene = new Scene()
  const main = new Group()
  main.name = 'main'
  main.position.set(7, -3, 4)
  main.rotation.set(0.4, -0.2, 0.7)
  main.scale.set(2, 3, 2)
  const mesh = new Mesh(new BoxGeometry(2, 4, 3), new MeshStandardMaterial())
  mesh.data = { visible: true }
  main.add(mesh)
  const camera = new OrthographicCamera()
  camera.rotation.set(-0.10476563268562922, Math.PI / 2, 0)
  camera.makeDefault = true
  scene.add(main, camera, new PointLight())
  scene.updateMatrixWorld(true)
  return { scene, main, mesh, camera }
}

test('preserves imported geometry, materials, world transforms, camera direction, and lights', () => {
  const { scene, main, mesh, camera: source } = fixture()
  const matrix = mesh.matrixWorld.clone()
  const geometry = mesh.geometry
  const material = mesh.material
  const imported = prepareSpline(scene)
  scene.updateMatrixWorld(true)
  assert.equal(mesh.geometry, geometry)
  assert.equal(mesh.material, material)
  assert.equal(mesh.visible, true)
  assert.ok(matrix.elements.every((value, index) => Math.abs(value - mesh.matrixWorld.elements[index]) < 1e-10))
  assert.equal(main.parent, imported.idle)
  assert.equal(imported.idle.parent, imported.parallax)
  assert.ok(imported.camera.quaternion.angleTo(source.quaternion) < 1e-7)
  assert.equal(scene.children.filter((object) => object.isLight).length, 1)
  disposeSpline(scene)
})

test('camera frames the lower-right composition on phones and restores the desktop camera after resizing', () => {
  const { scene, main } = fixture()
  const center = new Box3().setFromObject(main).getCenter(new Vector3())
  const { camera, radius } = prepareSpline(scene)
  const sourcePosition = camera.position.clone()
  for (const [width, height] of [[390, 844], [640, 1000]]) {
    fitCamera(camera, radius, width, height)
    const point = center.clone().project(camera)
    assert.ok(point.x > 0.25 && point.x < 0.7, 'sculpture center stays in the right portion')
    assert.ok(point.y < -0.2 && point.y > -0.7, 'sculpture center stays in the lower portion')
    assert.ok(Math.abs(point.z) < 1, 'depth remains inside the clipping planes')
  }
  fitCamera(camera, radius, 1440, 1000)
  assert.deepEqual(camera.position.toArray(), sourcePosition.toArray())
  assert.ok(Math.abs(camera.top - camera.bottom - 2 / 1.02) < 1e-10)
  assert.ok(Math.abs((camera.right - camera.left) / (camera.top - camera.bottom) - 1.44) < 1e-10)
  disposeSpline(scene)
})

test('cleanup disposes shared geometry, materials, textures, and shadow resources once', () => {
  const { scene, main, mesh } = fixture()
  const texture = new Texture()
  mesh.material.map = texture
  const shader = new ShaderMaterial({ uniforms: { matcap: { value: texture } } })
  main.add(new Mesh(mesh.geometry, [mesh.material, shader]))
  const resources = [mesh.geometry, mesh.material, shader, texture, scene.children.find((object) => object.isLight).shadow]
  const counts = resources.map(() => 0)
  resources.forEach((resource, index) => { resource.dispose = () => { counts[index]++ } })
  disposeSpline(scene)
  assert.deepEqual(counts, [1, 1, 1, 1, 1])
  assert.equal(scene.children.length, 0)
})

test('invalid scene fails without generating replacement geometry', () => {
  assert.throws(() => prepareSpline(new Scene()), /sculpture or exported camera is missing/)
})

test('recognizes cameras, meshes, and textures from another Three.js module instance', () => {
  const { scene, mesh, camera } = fixture()
  // Preserve native Three.js flags and Object3D behavior without local class identity.
  Object.setPrototypeOf(camera, Object3D.prototype)
  Object.setPrototypeOf(mesh, Object.create(Object3D.prototype, Object.getOwnPropertyDescriptors(Mesh.prototype)))
  assert.equal(camera instanceof OrthographicCamera, false)
  assert.equal(mesh instanceof Mesh, false)
  const texture = new Texture()
  Object.setPrototypeOf(texture, Object.getPrototypeOf(Texture.prototype))
  assert.equal(texture instanceof Texture, false)
  mesh.material.map = texture
  let disposed = 0
  texture.dispose = () => { disposed++ }

  const imported = prepareSpline(scene)
  assert.equal(mesh.visible, true)
  assert.ok(imported.radius > 0)
  disposeSpline(scene)
  assert.equal(disposed, 1)
})

test('restores original cloner vertices, materials, and matrices without baking displacement space', () => {
  const { scene, mesh } = fixture()
  const base = mesh.geometry
  const merged = base.clone()
  let mergedDisposals = 0
  merged.addEventListener('dispose', () => { mergedDisposals++ })
  mesh.geometryCreateDeleyed = base
  mesh.localGeometry = merged
  Object.defineProperty(mesh, 'geometry', { get() { return this.localGeometry ?? this.geometryCreateDeleyed } })
  mesh.data.cloner = { hideBase: true, disabled: false }
  const matrices = [new Matrix4().makeTranslation(2, 0, 0), new Matrix4().makeRotationY(Math.PI / 3)]
  mesh.setFromClonerState = function (data) {
    if (data === null) { this.cloner.removeFromParent(); this.cloner = undefined }
    else this.cloner = new Group()
  }
  mesh.expandCloner = function () {
    this.cloner.matrix.copy(this.matrix)
    for (const matrix of matrices) {
      const child = new Object3D()
      child.matrix.copy(matrix)
      this.cloner.add(child)
    }
    this.parent.add(this.cloner)
  }
  restoreCloners(scene)
  const clones = scene.getObjectByName('-clones')
  assert.equal(mesh.visible, false)
  assert.equal(clones.children.length, 2)
  assert.deepEqual(clones.matrix.elements, mesh.matrix.elements)
  for (const [index, clone] of clones.children.entries()) {
    assert.equal(clone.geometry, base)
    assert.equal(clone.material, mesh.material)
    assert.deepEqual(clone.matrix.elements, matrices[index].elements)
    assert.equal(clone.matrixAutoUpdate, false)
  }
  assert.equal(mergedDisposals, 1)
  disposeSpline(scene)
})

test('turbine keeps its authored center and plane fixed across many complete revolutions', () => {
  const { scene, main, mesh } = fixture()
  main.remove(mesh)
  const ring = new Group()
  ring.name = 'Plane-clones'
  ring.position.set(0, 0, -0.358)
  ring.rotation.x = -0.372
  main.add(ring)
  for (let index = 0; index < 25; index++) {
    const clone = new Mesh(mesh.geometry, mesh.material)
    const angle = index * Math.PI * 2 / 25
    clone.position.set(Math.cos(angle) * 50, 0, Math.sin(angle) * 50)
    ring.add(clone)
  }
  scene.updateMatrixWorld(true)
  const center = ring.getWorldPosition(new Vector3())
  const normal = new Vector3(0, 1, 0).applyNormalMatrix(new Matrix3().getNormalMatrix(ring.matrixWorld))
  const initialMatrices = ring.children.map((clone) => clone.matrixWorld.clone())
  const imported = prepareSpline(scene)
  const period = Math.PI * 2 / config.motion.idleSpeed
  assert.ok(Math.abs(period - 80) < 1e-10)
  assert.ok(imported.rotationAxis.distanceTo(normal) < 1e-12)
  fitCamera(imported.camera, imported.radius, 1920, 1080)
  const screen = center.clone().project(imported.camera)
  const frameNormal = new Vector3()
  const frameCenter = new Vector3()
  const normalMatrix = new Matrix3()
  // Include partial turns, ten full turns, and a one-million-revolution timestamp.
  const timestamps = Array.from({ length: 171 }, (_, index) => index * period / 17)
  timestamps.push(period * 1_000_000)
  for (const seconds of timestamps) {
    setTurbineRotation(imported.idle, imported.rotationAxis, seconds)
    scene.updateMatrixWorld(true)
    ring.getWorldPosition(frameCenter)
    assert.ok(frameCenter.distanceTo(center) < 1e-10, `center moved at ${seconds}s`)
    assert.ok(frameCenter.project(imported.camera).distanceTo(screen) < 1e-10)
    frameNormal.set(0, 1, 0).applyNormalMatrix(normalMatrix.getNormalMatrix(ring.matrixWorld))
    assert.ok(frameNormal.dot(normal) > 1 - 1e-12, 'ring must spin without tumbling')
    assert.ok(Math.abs(imported.idle.quaternion.length() - 1) < 1e-12)
  }
  for (const [index, clone] of ring.children.entries()) {
    assert.ok(clone.matrixWorld.elements.every((value, component) => Math.abs(value - initialMatrices[index].elements[component]) < 1e-9))
    assert.equal(clone.geometry, mesh.geometry)
    assert.equal(clone.material, mesh.material)
  }
  disposeSpline(scene)
})

test('elapsed-time rotation is independent of refresh rate and never compounds earlier transforms', () => {
  const axis = new Vector3(0.8, 0.5, 0.2).normalize()
  const pivot = new Group()
  setTurbineRotation(pivot, axis, 413)
  const expected = pivot.quaternion.clone()
  for (const rate of [60, 144, 320]) {
    let elapsed = 0
    for (let frame = 0; frame < rate * 413; frame++) elapsed += 1 / rate
    pivot.rotation.set(1.2, -3.1, 0.7)
    setTurbineRotation(pivot, axis, elapsed)
    assert.ok(pivot.quaternion.angleTo(expected) < 1e-6)
  }
})
