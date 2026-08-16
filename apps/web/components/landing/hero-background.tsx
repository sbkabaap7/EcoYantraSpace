"use client";

import { useRef, useMemo, useEffect, useState } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";

/* ══════════════════════════════════════════════════════
   HERO CANVAS — Three layers of animation:
   1. GPU Particle field (200k pts) — breathing, drifting
   2. Central morphing particle sphere
   3. Aurora energy beam
   ══════════════════════════════════════════════════════ */

/* ── Vertex shader — particle field ─────────────────── */
const FIELD_VERT = /* glsl */ `
  attribute float aSize;
  attribute float aSpeed;
  attribute float aPhase;
  attribute float aBrightness;

  uniform float uTime;
  uniform float uMouse;
  uniform vec2  uMousePos;

  varying float vBrightness;
  varying float vDist;

  void main() {
    vec3 pos = position;

    // Slow drift upward (each particle at own speed)
    pos.y += mod(uTime * aSpeed * 0.04 + aPhase * 100.0, 200.0) - 100.0;

    // Gentle horizontal wobble
    pos.x += sin(uTime * aSpeed * 0.3 + aPhase * 6.28) * 0.8;
    pos.z += cos(uTime * aSpeed * 0.2 + aPhase * 4.7)  * 0.6;

    // Mouse repulsion in XY plane
    vec2 screenPos = (modelViewMatrix * vec4(pos, 1.0)).xy;
    vec2 mouseDelta = screenPos - uMousePos * 10.0;
    float mouseInfluence = smoothstep(8.0, 0.0, length(mouseDelta));
    vec2 mouseDirection = normalize(mouseDelta + vec2(0.0001));
    pos.x += mouseDirection.x * mouseInfluence * 2.5;
    pos.y += mouseDirection.y * mouseInfluence * 2.5;

    vec4 mvPos = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPos;

    // Size: closer = bigger
    float dist = -mvPos.z;
    gl_PointSize = aSize * (80.0 / dist) * aBrightness;
    vBrightness = aBrightness;
    vDist = dist;
  }
`;

const FIELD_FRAG = /* glsl */ `
  uniform vec3 uColor;
  varying float vBrightness;
  varying float vDist;

  void main() {
    // Soft circular particle
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    float alpha = (1.0 - d * 2.0) * vBrightness * 0.75;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/* ── Vertex shader — morphing sphere ────────────────── */
const SPHERE_VERT = /* glsl */ `
  attribute float aRand;
  uniform float uTime;
  uniform float uPulse;
  varying float vNoise;

  // Simplex-like hash noise
  vec3 hash3(vec3 p) {
    p = vec3(dot(p, vec3(127.1, 311.7, 74.7)),
             dot(p, vec3(269.5, 183.3, 246.1)),
             dot(p, vec3(113.5, 271.9, 124.6)));
    return -1.0 + 2.0 * fract(sin(p) * 43758.5453123);
  }

  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    vec3 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dot(hash3(i + vec3(0,0,0)), f - vec3(0,0,0)),
                       dot(hash3(i + vec3(1,0,0)), f - vec3(1,0,0)), u.x),
                   mix(dot(hash3(i + vec3(0,1,0)), f - vec3(0,1,0)),
                       dot(hash3(i + vec3(1,1,0)), f - vec3(1,0,0)), u.x), u.y),
               mix(mix(dot(hash3(i + vec3(0,0,1)), f - vec3(0,0,1)),
                       dot(hash3(i + vec3(1,0,1)), f - vec3(1,0,1)), u.x),
                   mix(dot(hash3(i + vec3(0,1,1)), f - vec3(0,1,1)),
                       dot(hash3(i + vec3(1,1,1)), f - vec3(1,1,1)), u.x), u.y), u.z);
  }

  void main() {
    vec3 pos = position;
    vec3 dir = normalize(pos);

    // Organic noise displacement
    float n1 = noise(dir * 2.2 + uTime * 0.18);
    float n2 = noise(dir * 4.8 + uTime * 0.12 + 10.0);
    float n3 = noise(dir * 9.0 + uTime * 0.08 + 20.0);

    float displacement = n1 * 0.28 + n2 * 0.12 + n3 * 0.04;
    displacement *= uPulse;

    // Scatter mode — random offset
    float scatter = aRand * (1.0 - uPulse) * 0.8;
    pos = dir * (1.0 + displacement) + vec3(aRand, aRand * 1.3, aRand * 0.7) * scatter;

    vNoise = n1 * 0.5 + 0.5;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = 2.0 + vNoise * 2.5;
  }
`;

const SPHERE_FRAG = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uColor2;
  varying float vNoise;

  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    vec3 col = mix(uColor, uColor2, vNoise);
    float alpha = (1.0 - d * 2.0) * 0.85;
    gl_FragColor = vec4(col, alpha);
  }
`;

/* ── Aurora beam shader ──────────────────────────────── */
const AURORA_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const AURORA_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  varying vec2  vUv;

  float hash(float n) { return fract(sin(n) * 43758.5453); }

  float noise1d(float x) {
    float i = floor(x);
    float f = fract(x);
    return mix(hash(i), hash(i + 1.0), f * f * (3.0 - 2.0 * f));
  }

  void main() {
    // Beam core along Y axis
    float cx = 0.5;

    // Sway the beam sideways
    float sway = sin(uTime * 0.4 + vUv.y * 3.0) * 0.04
                + sin(uTime * 0.7 + vUv.y * 7.0) * 0.015;

    float dist = abs(vUv.x - (cx + sway));

    // Sharp core + wide halo
    float core  = smoothstep(0.025, 0.0,   dist);
    float halo  = smoothstep(0.22,  0.0,   dist);
    float glow  = smoothstep(0.45,  0.0,   dist) * 0.25;

    // Vertical fade: bright at bottom, fades top
    float vfade = pow(1.0 - vUv.y, 0.6) * smoothstep(0.0, 0.08, vUv.y);

    // Shimmer flicker
    float shimmer = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.y * 12.0)
                         * noise1d(vUv.y * 8.0 + uTime);

    float intensity = (core * 0.9 + halo * 0.35 + glow) * vfade * shimmer;

    // Add energy bands moving up
    float band = sin(vUv.y * 24.0 - uTime * 2.5) * 0.5 + 0.5;
    intensity += band * core * 0.2 * vfade;

    vec3 col = uColor;
    // Core is whiter/brighter
    col = mix(col, vec3(0.9, 1.0, 0.96), core * 0.5);

    gl_FragColor = vec4(col, intensity * 0.9);
  }
`;

/* ── HUD scan lines shader ───────────────────────────── */
const HUD_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const HUD_FRAG = /* glsl */ `
  uniform float uTime;
  uniform vec3  uColor;
  varying vec2  vUv;

  void main() {
    // Horizontal scan line moving top to bottom, cycling
    float scanY = mod(uTime * 0.18, 1.0);
    float scanLine = smoothstep(0.01, 0.0, abs(vUv.y - scanY)) * 0.7;

    // Fine grid
    float gridX = smoothstep(0.98, 1.0, fract(vUv.x * 40.0));
    float gridY = smoothstep(0.98, 1.0, fract(vUv.y * 22.0));
    float grid  = max(gridX, gridY) * 0.08;

    // Corner bracket marks (top-left, top-right, bottom-left, bottom-right)
    float bx = min(vUv.x, 1.0 - vUv.x);
    float by = min(vUv.y, 1.0 - vUv.y);
    float bracket = 0.0;
    float bw = 0.003;
    float bl = 0.12; // bracket length
    if (bx < bw && by < bl) bracket = 1.0;
    if (by < bw && bx < bl) bracket = 1.0;

    float alpha = scanLine + grid + bracket * 0.5;
    gl_FragColor = vec4(uColor, alpha * 0.6);
  }
`;

/* ══════════════════════════════════════════════════════
   React Three Fiber Components
   ══════════════════════════════════════════════════════ */

/* Deterministic noise keeps React renders pure while retaining an organic field. */
function seededRandom(index: number, channel: number) {
  const value = Math.sin(index * 12.9898 + channel * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

/* Particle field — fills entire viewport with drifting particles */
function ParticleField({ count = 36000 }: { count?: number }) {
  const ref = useRef<THREE.Points>(null);
  const mat = useRef<THREE.ShaderMaterial>(null);

  const geo = useMemo(() => {
    const positions   = new Float32Array(count * 3);
    const sizes       = new Float32Array(count);
    const speeds      = new Float32Array(count);
    const phases      = new Float32Array(count);
    const brightnesses = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Spread in a wide box around camera
      const randomX = seededRandom(i, 1);
      const randomY = seededRandom(i, 2);
      const randomZ = seededRandom(i, 3);
      const randomSize = seededRandom(i, 4);
      const randomSpeed = seededRandom(i, 5);
      const randomPhase = seededRandom(i, 6);
      const randomBrightness = seededRandom(i, 7);

      positions[i * 3]     = (randomX - 0.5) * 180;
      positions[i * 3 + 1] = (randomY - 0.5) * 200;
      positions[i * 3 + 2] = (randomZ - 0.5) * 80 - 20;

      sizes[i]       = 0.4 + randomSize * 1.8;
      speeds[i]      = 0.3 + randomSpeed * 0.9;
      phases[i]      = randomPhase;
      brightnesses[i] = 0.1 + randomBrightness * randomBrightness * 0.9; // most dim, few bright
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position",    new THREE.BufferAttribute(positions,    3));
    g.setAttribute("aSize",       new THREE.BufferAttribute(sizes,        1));
    g.setAttribute("aSpeed",      new THREE.BufferAttribute(speeds,       1));
    g.setAttribute("aPhase",      new THREE.BufferAttribute(phases,       1));
    g.setAttribute("aBrightness", new THREE.BufferAttribute(brightnesses, 1));
    return g;
  }, [count]);

  useFrame(({ clock, mouse }) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime!.value     = clock.elapsedTime;
    mat.current.uniforms.uMousePos!.value = [mouse.x, mouse.y];
  });

  return (
    <points ref={ref} geometry={geo} frustumCulled={false}>
      <shaderMaterial
        ref={mat}
        vertexShader={FIELD_VERT}
        fragmentShader={FIELD_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:     { value: 0 },
          uMousePos: { value: [0, 0] },
          uColor:    { value: new THREE.Color("#00e87a") },
        }}
      />
    </points>
  );
}

/* Morphing particle sphere — centre hero */
function MorphSphere({ count, visible }: { count: number; visible: boolean }) {
  const ref  = useRef<THREE.Points>(null);
  const mat  = useRef<THREE.ShaderMaterial>(null);
  const geo = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const rands     = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distribute on sphere surface (Fibonacci)
      const phi   = Math.acos(1 - 2 * (i + 0.5) / count);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      positions[i * 3]     = Math.sin(phi) * Math.cos(theta);
      positions[i * 3 + 1] = Math.cos(phi);
      positions[i * 3 + 2] = Math.sin(phi) * Math.sin(theta);
      rands[i] = (seededRandom(i, 8) - 0.5) * 2;
    }

    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    g.setAttribute("aRand",    new THREE.BufferAttribute(rands,     1));
    return g;
  }, [count]);

  useFrame(({ clock }) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime!.value  = clock.elapsedTime;
    mat.current.uniforms.uPulse!.value = visible ? 1 : 0;
    if (ref.current) {
      ref.current.rotation.y = clock.elapsedTime * 0.06;
      ref.current.rotation.x = Math.sin(clock.elapsedTime * 0.04) * 0.08;
    }
  });

  return (
    <points ref={ref} geometry={geo} frustumCulled={false} scale={2.8}>
      <shaderMaterial
        ref={mat}
        vertexShader={SPHERE_VERT}
        fragmentShader={SPHERE_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:   { value: 0 },
          uPulse:  { value: 1 },
          uColor:  { value: new THREE.Color("#00e87a") },
          uColor2: { value: new THREE.Color("#0aff8a") },
        }}
      />
    </points>
  );
}

/* Aurora energy beam — vertical neon pillar */
function AuroraBeam() {
  const mat = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime!.value = clock.elapsedTime;
  });

  return (
    <mesh position={[0, 0, -8]}>
      {/* Tall plane spanning full viewport height */}
      <planeGeometry args={[20, 60, 1, 1]} />
      <shaderMaterial
        ref={mat}
        vertexShader={AURORA_VERT}
        fragmentShader={AURORA_FRAG}
        transparent
        depthWrite={false}
        side={THREE.DoubleSide}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:  { value: 0 },
          uColor: { value: new THREE.Color("#00e87a") },
        }}
      />
    </mesh>
  );
}

/* HUD scan lines overlay */
function HudOverlay() {
  const mat = useRef<THREE.ShaderMaterial>(null);
  const { viewport } = useThree();

  useFrame(({ clock }) => {
    if (mat.current) mat.current.uniforms.uTime!.value = clock.elapsedTime;
  });

  return (
    <mesh position={[0, 0, 1]}>
      <planeGeometry args={[viewport.width, viewport.height]} />
      <shaderMaterial
        ref={mat}
        vertexShader={HUD_VERT}
        fragmentShader={HUD_FRAG}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:  { value: 0 },
          uColor: { value: new THREE.Color("#00e87a") },
        }}
      />
    </mesh>
  );
}

/* Ground mist plane */
function GroundMist() {
  const mat = useRef<THREE.ShaderMaterial>(null);

  useFrame(({ clock }) => {
    if (!mat.current) return;
    mat.current.uniforms.uTime!.value = clock.elapsedTime;
  });

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -5, 0]}>
      <planeGeometry args={[200, 200, 1, 1]} />
      <shaderMaterial
        ref={mat}
        vertexShader={AURORA_VERT}
        fragmentShader={/* glsl */ `
          uniform float uTime;
          uniform vec3  uColor;
          varying vec2  vUv;

          float hash(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
          }

          float noise(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            vec2 u = f * f * (3.0 - 2.0 * f);
            return mix(mix(hash(i + vec2(0,0)), hash(i + vec2(1,0)), u.x),
                       mix(hash(i + vec2(0,1)), hash(i + vec2(1,1)), u.x), u.y);
          }

          void main() {
            vec2 uv = vUv;
            float n = noise(uv * 3.0 + uTime * 0.05);
            n += noise(uv * 7.0 - uTime * 0.03) * 0.5;

            // Fade from centre outward
            float r = length(uv - 0.5) * 2.0;
            float alpha = (1.0 - r) * n * 0.18;
            alpha = max(0.0, alpha);

            gl_FragColor = vec4(uColor, alpha);
          }
        `}
        transparent
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        uniforms={{
          uTime:  { value: 0 },
          uColor: { value: new THREE.Color("#00cc55") },
        }}
      />
    </mesh>
  );
}

/* Scene orchestrator */
function HeroScene() {
  const { camera } = useThree();
  const isMobile = typeof window !== "undefined" && window.innerWidth < 768;

  useEffect(() => {
    camera.position.set(0, 0, 22);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Gentle camera parallax on mouse
  useFrame(({ mouse, clock }) => {
    const nextX = camera.position.x + (mouse.x * 1.5 - camera.position.x) * 0.03;
    const nextY = camera.position.y + (mouse.y * 0.8 - camera.position.y) * 0.03;
    const nextZ = 22 + Math.sin(clock.elapsedTime * 0.12) * 0.5;
    camera.position.set(nextX, nextY, nextZ);
  });

  return (
    <>
      {/* Ambient scene light */}
      <ambientLight intensity={0.05} color="#00e87a" />
      <pointLight position={[0, 8, 4]} intensity={2} color="#00e87a" distance={60} />
      <pointLight position={[-12, -4, 8]} intensity={0.6} color="#4fa6e0" distance={50} />

      {/* Layer 1: Full-field drifting particles */}
      <ParticleField count={isMobile ? 8000 : 36000} />

      {/* Layer 2: Aurora beam behind everything */}
      <AuroraBeam />

      {/* Layer 3: Ground mist */}
      <GroundMist />

      {/* Layer 4: Morphing sphere — positioned right side (globe zone) */}
      <group position={[5.5, 0, 0]}>
        <MorphSphere count={isMobile ? 3500 : 12000} visible={true} />
      </group>

      {/* Layer 5: HUD scan overlay */}
      <HudOverlay />
    </>
  );
}

/* ── Public export ───────────────────────────────────── */
export function HeroBackground() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(true);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsVisible(entry?.isIntersecting ?? false);
    }, { threshold: 0.01 });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={containerRef} style={{ position: "absolute", inset: 0 }}>
    <Canvas
      frameloop={isVisible ? "always" : "never"}
      dpr={[1, 1.5]}
      camera={{ position: [0, 0, 22], fov: 55 }}
      gl={{
        antialias: false,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.NoToneMapping,
      }}
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        background: "transparent",
      }}
    >
      <HeroScene />
    </Canvas>
    </div>
  );
}
