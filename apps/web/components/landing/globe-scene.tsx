"use client";

import { useRef, useMemo, useEffect } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Stars } from "@react-three/drei";
import * as THREE from "three";

/* ── Atmosphere Fresnel Shader ───────────────────── */
const atmosphereVert = /* glsl */ `
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    vNormal = normalize(normalMatrix * normal);
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vViewDir = normalize(-mvPos.xyz);
    gl_Position = projectionMatrix * mvPos;
  }
`;

const atmosphereFrag = /* glsl */ `
  uniform vec3 uColor;
  uniform float uPower;
  uniform float uOpacity;
  varying vec3 vNormal;
  varying vec3 vViewDir;
  void main() {
    float fresnel = pow(1.0 - max(dot(vNormal, vViewDir), 0.0), uPower);
    gl_FragColor = vec4(uColor, fresnel * uOpacity);
  }
`;

/* ── Orbit satellite ─────────────────────────────── */
function Satellite({
  radius,
  tiltX,
  tiltZ,
  speed,
  color,
  phase,
}: {
  radius: number;
  tiltX: number;
  tiltZ: number;
  speed: number;
  color: string;
  phase: number;
}) {
  const ref = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!ref.current) return;
    const t = clock.elapsedTime * speed + phase;
    const x = Math.cos(t) * radius;
    const y = Math.sin(t) * Math.sin(tiltX) * radius;
    const z = Math.sin(t) * Math.cos(tiltZ) * radius;
    ref.current.position.set(x, y, z);
    // Pulse glow
    const scale = 1 + Math.sin(clock.elapsedTime * 3) * 0.25;
    ref.current.scale.setScalar(scale);
  });

  return (
    <mesh ref={ref}>
      <sphereGeometry args={[0.04, 8, 8]} />
      <meshBasicMaterial color={color} toneMapped={false} />
    </mesh>
  );
}

/* ── Earth Group ─────────────────────────────────── */
function Earth() {
  const groupRef = useRef<THREE.Group>(null);

  // Continent patches (procedural colored meshes slightly above surface)
  const continentPatches = useMemo(() => {
    const patches: { lat: number; lon: number; rx: number; ry: number; tilt: number }[] = [
      { lat: 0.7, lon: 0.4,  rx: 0.6, ry: 0.4, tilt: 0.3 },  // North America
      { lat: -0.2, lon: 0.6, rx: 0.3, ry: 0.55, tilt: 0.1 }, // South America
      { lat: 0.8, lon: -0.4, rx: 0.5, ry: 0.35, tilt: -0.2 },// Europe
      { lat: 0.1, lon: -0.5, rx: 0.6, ry: 0.8, tilt: 0.1 },  // Africa
      { lat: 0.6, lon: -1.2, rx: 0.9, ry: 0.6, tilt: 0.2 },  // Asia
      { lat: -0.6, lon: -1.4, rx: 0.5, ry: 0.4, tilt: -0.3 },// Australia
    ];
    return patches;
  }, []);

  useFrame(({ clock }) => {
    if (groupRef.current) {
      groupRef.current.rotation.y = clock.elapsedTime * 0.06;
      groupRef.current.rotation.x = Math.sin(clock.elapsedTime * 0.07) * 0.04;
    }
  });

  return (
    <group ref={groupRef}>
      {/* Ocean base */}
      <mesh>
        <sphereGeometry args={[2, 96, 64]} />
        <meshStandardMaterial
          color="#05160e"
          metalness={0.15}
          roughness={0.88}
          emissive="#020c06"
          emissiveIntensity={0.4}
        />
      </mesh>

      {/* Continent patches */}
      {continentPatches.map((p, i) => {
        const phi = Math.PI / 2 - p.lat;
        const theta = p.lon;
        const x = 2.01 * Math.sin(phi) * Math.cos(theta);
        const y = 2.01 * Math.cos(phi);
        const z = 2.01 * Math.sin(phi) * Math.sin(theta);
        return (
          <mesh key={i} position={[x, y, z]} rotation={[p.tilt, theta, 0]}>
            <sphereGeometry args={[p.rx * 0.28, 16, 12]} />
            <meshStandardMaterial
              color="#10321c"
              metalness={0.1}
              roughness={0.9}
              emissive="#0a1f10"
              emissiveIntensity={0.3}
            />
          </mesh>
        );
      })}

      {/* Atmosphere — Fresnel glow (outer shell, backside) */}
      <mesh scale={1.09}>
        <sphereGeometry args={[2, 32, 32]} />
        <shaderMaterial
          vertexShader={atmosphereVert}
          fragmentShader={atmosphereFrag}
          uniforms={{
            uColor: { value: new THREE.Color("#00e87a") },
            uPower: { value: 3.5 },
            uOpacity: { value: 0.7 },
          }}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>

      {/* Atmosphere rim — wide halo */}
      <mesh scale={1.22}>
        <sphereGeometry args={[2, 16, 16]} />
        <shaderMaterial
          vertexShader={atmosphereVert}
          fragmentShader={atmosphereFrag}
          uniforms={{
            uColor: { value: new THREE.Color("#00e87a") },
            uPower: { value: 6.0 },
            uOpacity: { value: 0.28 },
          }}
          transparent
          depthWrite={false}
          side={THREE.BackSide}
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  );
}

/* ── Orbit Ring ──────────────────────────────────── */
function OrbitRing({
  rotation,
  color,
  opacity,
}: {
  rotation: [number, number, number];
  color: string;
  opacity: number;
}) {
  return (
    <mesh rotation={rotation as unknown as THREE.Euler}>
      <torusGeometry args={[2.9, 0.004, 8, 120]} />
      <meshBasicMaterial color={color} transparent opacity={opacity} depthWrite={false} />
    </mesh>
  );
}

/* ── Data Arc (bezier line between two globe points) */
function DataArc({
  start,
  end,
  color,
  speed,
}: {
  start: THREE.Vector3;
  end: THREE.Vector3;
  color: string;
  speed: number;
}) {
  const progress = useRef(0);

  const curve = useMemo(() => {
    const mid = start.clone().add(end).multiplyScalar(0.5).normalize().multiplyScalar(3.2);
    return new THREE.QuadraticBezierCurve3(start, mid, end);
  }, [start, end]);

  const points = useMemo(() => curve.getPoints(40), [curve]);
  const geometry = useMemo(() => {
    const nextGeometry = new THREE.BufferGeometry().setFromPoints(points);
    nextGeometry.setDrawRange(0, 0);
    return nextGeometry;
  }, [points]);
  const line = useMemo(() => {
    const material = new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.7, depthWrite: false });
    return new THREE.Line(geometry, material);
  }, [color, geometry]);

  useEffect(() => () => {
    geometry.dispose();
    (line.material as THREE.Material).dispose();
  }, [geometry, line]);

  useFrame((_, delta) => {
    progress.current = (progress.current + delta * speed) % 1;
    const sliceCount = Math.floor(progress.current * 40);
    const startIndex = Math.max(0, sliceCount - 10);
    geometry.setDrawRange(startIndex, Math.max(0, sliceCount - startIndex));
  });

  return <primitive object={line} />;
}

/* ── Scene ───────────────────────────────────────── */
function Scene() {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(0, 0.8, 6);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  // Gentle camera bob
  useFrame(({ clock }) => {
    camera.position.set(camera.position.x, 0.8 + Math.sin(clock.elapsedTime * 0.3) * 0.1, camera.position.z);
  });

  // Arc endpoints on globe surface
  const arcPoints = useMemo(() => {
    const pts = [
      { lat: 0.7, lon: 0.4 },   // North America
      { lat: 0.85, lon: -0.3 }, // Europe
      { lat: 0.1, lon: -0.5 },  // Africa
      { lat: 0.6, lon: -1.2 },  // Asia
      { lat: -0.3, lon: 2.5 },  // Pacific
    ].map(({ lat, lon }) => {
      const phi = Math.PI / 2 - lat;
      return new THREE.Vector3(
        2.05 * Math.sin(phi) * Math.cos(lon),
        2.05 * Math.cos(phi),
        2.05 * Math.sin(phi) * Math.sin(lon)
      );
    });
    return pts;
  }, []);

  return (
    <>
      {/* Lighting */}
      <ambientLight intensity={0.3} color="#1a4030" />
      <directionalLight
        position={[-4, 4, 2]}
        intensity={1.4}
        color="#e0f0e8"
      />
      <pointLight position={[3, -2, 4]} intensity={0.5} color="#00e87a" />
      <pointLight position={[-3, 3, -3]} intensity={0.3} color="#4fa6e0" />

      {/* Stars */}
      <Stars
        radius={120}
        depth={50}
        count={5000}
        factor={3}
        saturation={0.1}
        fade
        speed={0.4}
      />

      {/* Earth */}
      <Earth />

      {/* Orbit rings */}
      <OrbitRing rotation={[Math.PI / 2, 0, 0.4]} color="#00e87a" opacity={0.28} />
      <OrbitRing rotation={[-0.5, 0.3, 0.8]} color="#4fa6e0" opacity={0.18} />
      <OrbitRing rotation={[0.2, 0.8, -0.4]} color="#e8aa3a" opacity={0.12} />

      {/* Satellites */}
      <Satellite radius={2.9} tiltX={0.5}  tiltZ={1.0}  speed={0.22} color="#00e87a" phase={0} />
      <Satellite radius={2.9} tiltX={1.0}  tiltZ={0.3}  speed={0.18} color="#4fa6e0" phase={2.1} />
      <Satellite radius={2.9} tiltX={-0.3} tiltZ={0.7}  speed={0.28} color="#e8aa3a" phase={4.2} />
      <Satellite radius={2.9} tiltX={0.8}  tiltZ={-0.5} speed={0.15} color="#00e87a" phase={1.4} />

      {/* Data arcs between continents */}
      <DataArc start={arcPoints[0]!} end={arcPoints[1]!} color="#00e87a" speed={0.35} />
      <DataArc start={arcPoints[1]!} end={arcPoints[3]!} color="#4fa6e0" speed={0.28} />
      <DataArc start={arcPoints[2]!} end={arcPoints[3]!} color="#e8aa3a" speed={0.4}  />
      <DataArc start={arcPoints[0]!} end={arcPoints[4]!} color="#00e87a" speed={0.32} />
    </>
  );
}

/* ── Export ──────────────────────────────────────── */
export function GlobeScene() {
  return (
    <Canvas
      dpr={[1, 2]}
      camera={{ position: [0, 0.8, 6], fov: 42 }}
      gl={{
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.1,
      }}
      style={{ width: "100%", height: "100%", background: "transparent" }}
    >
      <Scene />
    </Canvas>
  );
}
