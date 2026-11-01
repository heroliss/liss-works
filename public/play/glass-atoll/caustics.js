/**
 * Refracted sun-light footprints on the actual lagoon bathymetry.
 *
 * Each grid vertex follows a ray through the SAME height field/normal used by
 * the visible water. The fragment Jacobian measures how that light bundle
 * contracts on the seabed. Folded bundles add their light instead of painting a
 * repeating caustic pattern. Technique background: Evan Wallace's explanation,
 * https://medium.com/@evanwallace/rendering-realtime-caustics-in-webgl-2a99a29a0b2c
 * This implementation is written for this scene, not copied from that demo.
 *
 * Texture UV = worldXZ / (2 * extent) + 0.5. The output is linear, untonemapped
 * relative light concentration. Flat, shallow water gives approximately 1.0.
 * Fade sampling to 1 outside the central region to avoid the finite grid edge.
 */
export function createCaustics(THREE, renderer, {
  waveGLSL,
  uniforms,
  terrainHeight,
  sunDirection,
  extent = 80,
  gridSegments = 1536,
  textureSize = 2048,
  heightmapSize = 512,
  maxHz = 30,
} = {}) {
  if (!waveGLSL || !uniforms?.uTime || !uniforms?.uRipples || !uniforms?.uWind ||
      typeof terrainHeight !== 'function' || !sunDirection) {
    throw new Error('Caustics require the shared water waves, uniforms, terrain and sun direction.');
  }

  // Texel centres correspond to world centres; manually bilinear filtering the
  // R32F heightfield avoids requiring OES_texture_float_linear on mobile GPUs.
  const heightData = new Float32Array(heightmapSize * heightmapSize);
  for (let z = 0; z < heightmapSize; z++) {
    const worldZ = ((z + 0.5) / heightmapSize * 2 - 1) * extent;
    for (let x = 0; x < heightmapSize; x++) {
      const worldX = ((x + 0.5) / heightmapSize * 2 - 1) * extent;
      heightData[z * heightmapSize + x] = terrainHeight(worldX, worldZ);
    }
  }
  const heightTexture = new THREE.DataTexture(
    heightData, heightmapSize, heightmapSize, THREE.RedFormat, THREE.FloatType,
  );
  heightTexture.name = 'Lagoon bathymetry / caustic receiver';
  heightTexture.minFilter = THREE.NearestFilter;
  heightTexture.magFilter = THREE.NearestFilter;
  heightTexture.wrapS = heightTexture.wrapT = THREE.ClampToEdgeWrapping;
  heightTexture.generateMipmaps = false;
  heightTexture.colorSpace = THREE.NoColorSpace;
  heightTexture.needsUpdate = true;

  const supportsFloatTarget = renderer.extensions.has('EXT_color_buffer_float');
  const target = new THREE.WebGLRenderTarget(textureSize, textureSize, {
    type: supportsFloatTarget ? THREE.HalfFloatType : THREE.UnsignedByteType,
    format: THREE.RGBAFormat,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: true,
  });
  target.texture.name = 'Snell / differential-area caustic irradiance';
  target.texture.colorSpace = THREE.NoColorSpace;

  const material = new THREE.ShaderMaterial({
    // Three.js emits these #defines before the shared waveGLSL. This retains
    // exactly the same physical spectrum but low-passes frequencies beyond the
    // projected grid's Nyquist limit. Full optical normals keep all frequencies.
    defines: {
      CAUSTICS_PASS: 1,
      BAKED_WAVE_TEXTURES: 1,
      ...(gridSegments <= 768 ? {CAUSTIC_LOW_QUALITY: 1} : {}),
    },
    uniforms: {
      // Keep these Uniform objects shared by identity with the water shader.
      uTime: uniforms.uTime,
      uRipples: uniforms.uRipples,
      uWind: uniforms.uWind,
      uSwell:uniforms.uSwell,uWindSea:uniforms.uWindSea,
      uMeanCurrent: uniforms.uMeanCurrent,
      uCurrentOffset: uniforms.uCurrentOffset,
      uRippleOffsets: uniforms.uRippleOffsets,
      uHydroState: uniforms.uHydroState,
      uHydroExtent: uniforms.uHydroExtent,
      uHydroResolution: uniforms.uHydroResolution,
      uHydroEnabled: uniforms.uHydroEnabled,
      uWave0:uniforms.uWave0,uWave1:uniforms.uWave1,uWave2:uniforms.uWave2,uWave3:uniforms.uWave3,
      uWaveDomains:uniforms.uWaveDomains,uWaveResolution:uniforms.uWaveResolution,
      uBathymetry: {value: heightTexture},
      uSunDirection: {value: sunDirection},
      uExtent: {value: extent},
      uHeightmapSize: {value: heightmapSize},
    },
    vertexShader: /* glsl */`
      uniform sampler2D uBathymetry;
      uniform vec3 uSunDirection;
      uniform float uExtent;
      uniform float uHeightmapSize;
      varying vec2 vSourcePosition;
      varying vec2 vReceiverPosition;
      varying float vDepth;
      varying float vValid;

      ${waveGLSL}

      float bottomHeight(vec2 worldXZ) {
        vec2 uv = clamp(worldXZ / (2.0 * uExtent) + 0.5, 0.0, 1.0);
        vec2 texel = uv * uHeightmapSize - 0.5;
        vec2 base = floor(texel);
        vec2 f = fract(texel);
        vec2 texelSize = vec2(1.0 / uHeightmapSize);
        vec2 uv00 = (base + 0.5) * texelSize;
        float h00 = texture2D(uBathymetry, uv00).r;
        float h10 = texture2D(uBathymetry, uv00 + vec2(texelSize.x, 0.0)).r;
        float h01 = texture2D(uBathymetry, uv00 + vec2(0.0, texelSize.y)).r;
        float h11 = texture2D(uBathymetry, uv00 + texelSize).r;
        return mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
      }

      void main() {
        vec2 sourceXZ = position.xy;
        float height = surface(sourceXZ);
        vec3 normal = normalize(surfaceNormal(sourceXZ));
        vec3 source = vec3(sourceXZ.x, height, sourceXZ.y);
        vec3 towardSun = normalize(uSunDirection);
        vec3 ray = refract(-towardSun, normal, 1.0 / 1.333);
        float downward = max(-ray.y, 0.04);
        float sourceBed = bottomHeight(sourceXZ);
        float pathLength = max(0.0, (height - sourceBed) / downward);

        // Fixed-point ray/heightfield intersection. The low sand shelf is
        // single-valued; three corrections are enough at this grid spacing.
        // At grazing shore boundaries invalid/above-water receivers are culled.
        vec3 receiver = source + ray * pathLength;
        for (int i = 0; i < 3; i++) {
          pathLength = max(0.0, (height - bottomHeight(receiver.xz)) / downward);
          receiver = source + ray * pathLength;
        }

        float seabed = bottomHeight(receiver.xz);
        float incidentCosine = max(dot(towardSun, normal), 0.0);
        vSourcePosition = sourceXZ;
        vReceiverPosition = receiver.xz;
        vDepth = max(height - seabed, 0.0);
        vValid = step(sourceBed, height - 0.008)
          * step(seabed, -0.005)
          * step(0.015, towardSun.y)
          * step(0.02, incidentCosine)
          * step(ray.y, -0.02);
        gl_Position = vec4(receiver.x / uExtent, receiver.z / uExtent, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */`
      varying vec2 vSourcePosition;
      varying vec2 vReceiverPosition;
      varying float vDepth;
      varying float vValid;

      float areaDeterminant(vec2 dx, vec2 dy) {
        return abs(dx.x * dy.y - dx.y * dy.x);
      }

      void main() {
        // Evaluate derivatives before any discard (derivatives in divergent
        // fragment control flow are undefined). The determinant handles skew
        // and rotation unlike multiplying the two derivative-vector lengths.
        float oldArea = areaDeterminant(dFdx(vSourcePosition), dFdy(vSourcePosition));
        float newArea = areaDeterminant(dFdx(vReceiverPosition), dFdy(vReceiverPosition));
        float concentration = clamp(oldArea / max(newArea, 0.000001), 0.0, 6.0);
        if (vValid < 0.99 || vDepth > 23.0) discard;

        // Pure concentration only. Incoming solar Fresnel transmission and
        // Beer-Lambert absorption are already handled by the water optics;
        // including them again here would attenuate the same path twice.
        // Fade contrast in the distant bed instead of reducing its baseline.
        float deepFade = 1.0 - smoothstep(17.0, 23.0, vDepth);
        float irradiance = mix(1.0, concentration, deepFade);
        gl_FragColor = vec4(vec3(irradiance), 1.0);
      }
    `,
    side: THREE.DoubleSide,
    depthTest: false,
    depthWrite: false,
    transparent: true,
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquationAlpha: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.ZeroFactor,
    toneMapped: false,
  });
  let geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, gridSegments, gridSegments);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = false;
  const passScene = new THREE.Scene();
  passScene.add(mesh);
  const passCamera = new THREE.OrthographicCamera(-extent, extent, extent, -extent, 0, 1);

  const savedColor = new THREE.Color();
  const savedViewport = new THREE.Vector4();
  const savedScissor = new THREE.Vector4();
  const lastSun = new THREE.Vector3(Infinity, Infinity, Infinity);
  let lastTime = -Infinity;
  let lastWind = NaN;
  let lastRippleSignature = '';
  let disposed = false;
  let forceNextUpdate = true;

  function rippleSignature() {
    const values = uniforms.uRipples.value;
    if (!values) return '';
    return Array.from(values, ripple => {
      if (typeof ripple === 'number') return ripple;
      if (ripple?.isVector4) return `${ripple.x},${ripple.y},${ripple.z},${ripple.w}`;
      return Array.from(ripple || []).join(',');
    }).join(';');
  }

  function update(time = uniforms.uTime.value, force = false) {
    if (disposed) return false;
    const signature = rippleSignature();
    const sunChanged = lastSun.distanceToSquared(sunDirection) > 1e-10;
    const rippleChanged = signature !== lastRippleSignature;
    // Exponential wind smoothing changes its last float for many seconds;
    // exact inequality used to defeat the update-rate limit on every frame.
    const windChanged = Math.abs(uniforms.uWind.value-lastWind)>Math.max(.025,Math.abs(lastWind)*.04);
    if (!force && !forceNextUpdate && !sunChanged && !rippleChanged && !windChanged && Math.abs(time - lastTime) < 1 / maxHz) return false;
    uniforms.uTime.value = time;

    const previousTarget = renderer.getRenderTarget();
    const previousCubeFace = renderer.getActiveCubeFace();
    const previousMipmapLevel = renderer.getActiveMipmapLevel();
    const previousAutoClear = renderer.autoClear;
    const previousClearAlpha = renderer.getClearAlpha();
    const previousScissorTest = renderer.getScissorTest();
    const previousXREnabled = renderer.xr.enabled;
    const previousShadowUpdate = renderer.shadowMap.needsUpdate;
    renderer.getClearColor(savedColor);
    renderer.getViewport(savedViewport);
    renderer.getScissor(savedScissor);
    try {
      renderer.xr.enabled = false;
      renderer.autoClear = false;
      renderer.setRenderTarget(target);
      renderer.setScissorTest(false);
      renderer.setClearColor(0x000000, 0);
      renderer.clear(true, false, false);
      renderer.render(passScene, passCamera);
    } finally {
      renderer.setRenderTarget(previousTarget, previousCubeFace, previousMipmapLevel);
      renderer.setViewport(savedViewport);
      renderer.setScissor(savedScissor);
      renderer.setScissorTest(previousScissorTest);
      renderer.setClearColor(savedColor, previousClearAlpha);
      renderer.autoClear = previousAutoClear;
      renderer.xr.enabled = previousXREnabled;
      renderer.shadowMap.needsUpdate = previousShadowUpdate;
    }
    lastTime = time;
    lastWind = uniforms.uWind.value;
    lastSun.copy(sunDirection);
    lastRippleSignature = signature;
    forceNextUpdate = false;
    return true;
  }

  function setQuality(quality) {
    if (disposed) return;
    const nextSegments = quality === 'balanced' ? 768 : 1536;
    maxHz = quality === 'balanced' ? 15 : 30;
    if (nextSegments === gridSegments) return;
    gridSegments = nextSegments;
    geometry.dispose();
    geometry = new THREE.PlaneGeometry(extent * 2, extent * 2, gridSegments, gridSegments);
    mesh.geometry = geometry;
    if (gridSegments <= 768) material.defines.CAUSTIC_LOW_QUALITY = 1;
    else delete material.defines.CAUSTIC_LOW_QUALITY;
    material.needsUpdate = true;
    textureSize=quality==='balanced'?1024:2048;
    target.setSize(textureSize,textureSize);
    forceNextUpdate = true;
  }
  function setSampling({grid=gridSegments,size=textureSize,hz=maxHz}={}){
    if(disposed)return;const n=Math.max(128,Math.min(2048,Math.round(grid)));
    if(n!==gridSegments){gridSegments=n;geometry.dispose();geometry=new THREE.PlaneGeometry(extent*2,extent*2,n,n);mesh.geometry=geometry;}
    const nextSize=Math.max(256,Math.min(renderer.capabilities.maxTextureSize,Math.round(size)));if(nextSize!==textureSize){textureSize=nextSize;target.setSize(nextSize,nextSize);}
    const low=n<=768;if(low!==!!material.defines.CAUSTIC_LOW_QUALITY){if(low)material.defines.CAUSTIC_LOW_QUALITY=1;else delete material.defines.CAUSTIC_LOW_QUALITY;material.needsUpdate=true;}
    maxHz=Math.max(1,hz);forceNextUpdate=true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    geometry.dispose();
    material.dispose();
    heightTexture.dispose();
    target.dispose();
  }

  return {
    texture: target.texture,
    extent,
    update,
    setQuality,
    setSampling,
    dispose,
    // Expose simple factual metadata for the renderer's quality/report UI.
    get triangleCount() {return gridSegments * gridSegments * 2;},
    get gridSegments() {return gridSegments;},
    get textureSize(){return textureSize;},
    get maxHz() {return maxHz;},
    supportsFloatTarget,
  };
}
