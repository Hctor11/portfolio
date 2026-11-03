import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { CustomBlending, HalfFloatType, OneFactor, OneMinusSrcColorFactor, Vector2, WebGLRenderTarget } from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { CopyShader } from 'three/addons/shaders/CopyShader.js'
import { backgroundConfig as config } from './config'

export function Bloom() {
  const { gl, scene, camera, size, viewport, invalidate } = useThree()
  const pipeline = useMemo(() => {
    const target = new WebGLRenderTarget(1, 1, { type: HalfFloatType, samples: 4 })
    const composer = new EffectComposer(gl, target)
    const render = new RenderPass(scene, camera)
    const { strength, radius, threshold, smoothing } = config.bloom
    const bloom = new UnrealBloomPass(new Vector2(1, 1), strength, radius, threshold)
    // Spline uses Screen blending; additive bloom clips the white material details.
    bloom.blendMaterial.blending = CustomBlending
    bloom.blendMaterial.blendSrc = OneFactor
    bloom.blendMaterial.blendDst = OneMinusSrcColorFactor
    const highPass = bloom.highPassUniforms as Record<string, { value: number }>
    highPass.smoothWidth.value = smoothing
    // Match Spline's display-space composite; an extra sRGB transfer washes out its layer values.
    const output = new ShaderPass(CopyShader)
    composer.addPass(render)
    composer.addPass(bloom)
    composer.addPass(output)
    return { composer, bloom, output }
  }, [gl, scene, camera])

  useEffect(() => {
    pipeline.composer.setPixelRatio(viewport.dpr)
    pipeline.composer.setSize(size.width, size.height)
    invalidate()
  }, [pipeline, size.width, size.height, viewport.dpr, invalidate])

  useEffect(() => () => {
    pipeline.bloom.dispose()
    pipeline.output.dispose()
    pipeline.composer.dispose()
  }, [pipeline])

  // A positive priority owns R3F's render step; it does not create another animation loop.
  useFrame((_, delta) => pipeline.composer.render(delta), 1)
  return null
}
