import React from 'react';

export function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className="w-full bg-white/5 border border-white/10 rounded-xl py-3 px-4 text-white" {...props} />;
}