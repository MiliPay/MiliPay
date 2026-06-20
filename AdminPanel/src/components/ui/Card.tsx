import React from 'react';

export function Card({ children, className = '' }: { children: React.ReactNode, className?: string }) {
  return <div className={`glass-panel p-6 rounded-2xl ${className}`}>{children}</div>;
}