import React from 'react';

export function Button({ children, className = '', ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={`bg-biopay-teal hover:bg-biopay-dark text-white font-bold py-2 px-4 rounded-xl ${className}`} {...props}>
      {children}
    </button>
  );
}