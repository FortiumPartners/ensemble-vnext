// The fixture's component package: three small components the design system is built from.
import React from 'react';

export function Button({ children, onClick, variant = 'primary' }) {
  const look = variant === 'primary' ? 'bg-brand text-white' : 'bg-white text-brand border border-brand';
  return (
    <button onClick={onClick} className={`min-h-[44px] rounded-md px-4 py-2 font-medium ${look}`}>
      {children}
    </button>
  );
}

export function Card({ title, children }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="mb-2 text-lg font-semibold text-ink">{title}</h2>
      {children}
    </section>
  );
}

export function Chip({ children }) {
  return <span className="rounded-full bg-slate-100 px-3 py-1 text-sm text-ink">{children}</span>;
}
