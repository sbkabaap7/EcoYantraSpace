"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";

function Field({ progress }: { progress: React.MutableRefObject<number> }) {
  const points = useRef<THREE.Points>(null);
  const targets = useMemo(() => {
    const count = typeof window === "undefined" || window.innerWidth > 700 ? 4200 : 1500;
    const sphere = new Float32Array(count * 3);
    const energy = new Float32Array(count * 3);
    const anomaly = new Float32Array(count * 3);
    const terrain = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      const randomA = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      const randomB = (Math.sin(i * 78.233) * 43758.5453) % 1;
      const randomC = (Math.sin(i * 39.3467) * 43758.5453) % 1;
      const phi = Math.acos(2 * Math.abs(randomA) - 1);
      const theta = Math.abs(randomB) * Math.PI * 2;
      const radius = 2.1 + (Math.abs(randomC) - 0.5) * 0.28;
      sphere[i * 3]! = radius * Math.sin(phi) * Math.cos(theta);
      sphere[i * 3 + 1]! = radius * Math.cos(phi);
      sphere[i * 3 + 2]! = radius * Math.sin(phi) * Math.sin(theta);
      const lane = (i % 84) / 84 - 0.5;
      energy[i * 3] = lane * 7;
      energy[i * 3 + 1] = Math.sin(lane * 12 + i * 0.13) * 0.55 + (Math.abs(randomC) - 0.5) * 0.18;
      energy[i * 3 + 2] = (Math.abs(randomA) - 0.5) * 1.35;
      const burst = i % 13 === 0 ? 3.8 : 1.2;
      anomaly[i * 3] = sphere[i * 3]! * burst;
      anomaly[i * 3 + 1] = sphere[i * 3 + 1]! * burst + Math.sin(i * 3.7) * 0.6;
      anomaly[i * 3 + 2] = sphere[i * 3 + 2]! * burst;
      const gridX = (i % 75) / 74 - 0.5;
      const gridZ = Math.floor(i / 75) / Math.ceil(count / 75) - 0.5;
      terrain[i * 3] = gridX * 7;
      terrain[i * 3 + 2] = gridZ * 6;
      terrain[i * 3 + 1] = Math.sin(gridX * 8) * .4 + Math.cos(gridZ * 9) * .32 + Math.sin((gridX + gridZ) * 18) * .13;
    }
    return { sphere, energy, anomaly, terrain };
  }, []);

  useFrame(({ clock }) => {
    if (!points.current) return;
    const stage = progress.current;
    const attribute = points.current.geometry.attributes.position!;
    const positions = attribute.array as Float32Array;
    const target = stage < .28 ? targets.sphere : stage < .52 ? targets.energy : stage < .76 ? targets.anomaly : targets.terrain;
    for (let i = 0; i < positions.length; i += 3) { positions[i]! += (target[i]! - positions[i]!) * .055; positions[i + 1]! += (target[i + 1]! - positions[i + 1]!) * .055; positions[i + 2]! += (target[i + 2]! - positions[i + 2]!) * .055; }
    attribute.needsUpdate = true;
    points.current.rotation.y = clock.elapsedTime * 0.07 + stage * 1.4;
    points.current.rotation.x = Math.sin(clock.elapsedTime * 0.15) * 0.08 + (stage > .76 ? -.26 : 0);
    points.current.scale.setScalar(stage > .52 && stage < .76 ? 1.18 : 1);
  });

  return <points ref={points}><bufferGeometry><bufferAttribute attach="attributes-position" args={[targets.sphere, 3]} /></bufferGeometry><pointsMaterial size={0.018} color="#80b88d" transparent opacity={0.78} sizeAttenuation depthWrite={false} /></points>;
}

function Camera({ progress }: { progress: React.MutableRefObject<number> }) { const { camera } = useThree(); useFrame(() => { const p = progress.current; // eslint-disable-next-line react-hooks/immutability
  camera.position.z += ((5.7 - p * 1.6) - camera.position.z) * .025; camera.position.x += (Math.sin(p * Math.PI * 2) * .38 - camera.position.x) * .02; camera.position.y += ((p > .76 ? 1.25 : 0) - camera.position.y) * .02; camera.lookAt(0, p > .76 ? .2 : 0, 0); }); return null; }

export function ParticleScene({ progress }: { progress: React.MutableRefObject<number> }) {
  return <Canvas dpr={[1, 1.5]} camera={{ position: [0, 0, 6], fov: 45 }} gl={{ antialias: false, powerPreference: "high-performance", alpha: true }}><fog attach="fog" args={["#020503", 3, 10]} /><Camera progress={progress} /><Field progress={progress} /></Canvas>;
}
