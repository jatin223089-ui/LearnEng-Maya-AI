import { useEffect, useRef } from 'react';

/**
 * Voice orb — pulses to real audio amplitude when analyserNode is provided.
 */
export default function VoiceOrb({ state = 'idle', size = 220, analyserNode = null }) {
  const ringRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!analyserNode || state !== 'speaking') {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (ringRef.current) ringRef.current.style.transform = 'scale(1)';
      return undefined;
    }

    const data = new Uint8Array(analyserNode.frequencyBinCount);
    const tick = () => {
      analyserNode.getByteFrequencyData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) sum += data[i];
      const avg = sum / data.length / 255;
      if (ringRef.current) {
        const scale = 1 + Math.min(0.18, avg * 0.6);
        ringRef.current.style.transform = `scale(${scale})`;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [analyserNode, state]);

  return (
    <div className="relative flex items-center justify-center" style={{ width: size, height: size }}>
      <div className={`maya-orb ${state}`} style={{ width: size, height: size }} />
      <div
        ref={ringRef}
        className="absolute pointer-events-none rounded-full border-2 border-white/40"
        style={{
          width: size * 0.78,
          height: size * 0.78,
          mixBlendMode: 'overlay',
          transition: 'transform 60ms ease-out',
        }}
      />
    </div>
  );
}
