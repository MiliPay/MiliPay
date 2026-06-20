import type { HTMLAttributes, ReactNode } from "react";

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  children: ReactNode;
  raised?: boolean;
}

export function Card({ children, raised, className = "", ...props }: CardProps) {
  return (
    <div
      className={`
        rounded-lg border border-ledger-line
        ${raised ? "bg-ledger-raised" : "bg-white/[0.02]"}
        ${className}
      `}
      {...props}
    >
      {children}
    </div>
  );
}