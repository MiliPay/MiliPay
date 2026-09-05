import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Float, Sphere, Torus, Stars, MeshDistortMaterial } from '@react-three/drei';
import * as THREE from 'three';

export function Core() {
  const group = useRef<THREE.Group>(null);
  const ring1 = useRef<THREE.Mesh>(null);
  const ring2 = useRef<THREE.Mesh>(null);
  const ring3 = useRef<THREE.Mesh>(null);

  useFrame((state) => {
    const t = state.clock.getElapsedTime();
    if (group.current) {
      group.current.rotation.x = THREE.MathUtils.lerp(group.current.rotation.x, state.pointer.y * 0.3, 0.05);
      group.current.rotation.y = THREE.MathUtils.lerp(group.current.rotation.y, state.pointer.x * 0.3, 0.05);
    }
    
    if (ring1.current) {
      ring1.current.rotation.x = t * 0.3;
      ring1.current.rotation.y = t * 0.4;
    }
    if (ring2.current) {
      ring2.current.rotation.y = t * -0.2;
      ring2.current.rotation.z = t * 0.3;
    }
    if (ring3.current) {
      ring3.current.rotation.x = t * 0.5;
      ring3.current.rotation.z = t * -0.1;
    }
  });

  return (
    <group ref={group}>
      <Float speed={2} rotationIntensity={1} floatIntensity={1}>
        {/* Central Bio Core */}
        <Sphere args={[1.5, 64, 64]}>
          <MeshDistortMaterial 
            color="#10b981" 
            emissive="#059669" 
            emissiveIntensity={1.5} 
            roughness={0.2} 
            metalness={0.8}
            distort={0.4}
            speed={2}
          />
        </Sphere>
        
        {/* Security Rings */}
        <Torus ref={ring1} args={[2.5, 0.02, 16, 100]}>
          <meshStandardMaterial color="#34d399" emissive="#10b981" emissiveIntensity={2} />
        </Torus>
        
        <Torus ref={ring2} args={[3.2, 0.01, 16, 100]} rotation={[Math.PI/2, 0, 0]}>
          <meshStandardMaterial color="#ffffff" emissive="#ffffff" emissiveIntensity={0.5} transparent opacity={0.3} />
        </Torus>

        <Torus ref={ring3} args={[4, 0.05, 16, 100]} rotation={[0, Math.PI/3, 0]}>
          <meshStandardMaterial color="#022c22" wireframe transparent opacity={0.3} />
        </Torus>
      </Float>
    </group>
  );
}

export function MiliPay3DScene() {
  return (
    <>
      <ambientLight intensity={0.1} />
      <directionalLight position={[10, 10, 10]} intensity={1} color="#ffffff" />
      <pointLight position={[-10, -10, -10]} intensity={2} color="#10b981" />
      
      <Core />
      
      <Stars radius={50} depth={50} count={3000} factor={4} saturation={0} fade speed={1} />
    </>
  );
}
