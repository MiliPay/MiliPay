import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  raised?: boolean;
}

/** A panel: white (or dark panel) on the page colour, 18px corners. `raised`
 *  is kept for older callers and looks the same. */
export function Card({ children, raised: _raised, className = "", ...props }: CardProps) {
  return (
    <div
      className={`rounded-card border border-line bg-panel shadow-card ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}