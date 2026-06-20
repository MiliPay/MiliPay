import React from 'react';

export function Select({ options, ...props }: React.SelectHTMLAttributes<HTMLSelectElement> & { options: string[] }) {
  return (
    <select className="w-full bg-slate-900 border border-white/10 rounded-xl py-3 px-4 text-white" {...props}>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}