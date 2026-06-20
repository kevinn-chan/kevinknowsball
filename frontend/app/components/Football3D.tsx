"use client";

import { useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Sphere } from "@react-three/drei";
import * as THREE from "three";

// R3F extends JSX globally when loaded — cast to any to avoid TS JSX intrinsic conflicts
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const R: any = {};
void R;

function FootballMesh() {
  const meshRef = useRef<THREE.Mesh>(null);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  useFrame((_state: any, delta: number) => {
    if (meshRef.current) {
      meshRef.current.rotation.y += delta * 0.6;
      meshRef.current.rotation.x += delta * 0.2;
    }
  });

  return (
    <Sphere ref={meshRef} args={[1.2, 32, 32]}>
      {/* eslint-disable-next-line */}
      {/* @ts-ignore */}
      <meshStandardMaterial color="#f0f0f0" roughness={0.4} metalness={0.1} />
    </Sphere>
  );
}

export default function Football3D() {
  return (
    <Canvas
      camera={{ position: [0, 0, 4], fov: 45 }}
      style={{ width: "100%", height: "100%" }}
    >
      {/* @ts-ignore */}
      <ambientLight intensity={0.5} />
      {/* @ts-ignore */}
      <pointLight position={[5, 5, 5]} intensity={1.5} color="#FFD700" />
      {/* @ts-ignore */}
      <pointLight position={[-5, -5, 5]} intensity={0.8} color="#00D4FF" />
      <FootballMesh />
    </Canvas>
  );
}
