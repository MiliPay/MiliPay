import React from 'react';
import { Fingerprint } from 'lucide-react';

export function FingerprintScanner() {
  return (
    <div className="w-full h-40 rounded-2xl border-2 border-dashed border-white/20 flex items-center justify-center">
      <Fingerprint className="text-white/40 w-12 h-12" />
    </div>
  );
}