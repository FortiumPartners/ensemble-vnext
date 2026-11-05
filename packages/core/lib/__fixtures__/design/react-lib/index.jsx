// Fixture component library for the bundle tests: a Badge and a stateful Counter, the shape a
// product's component package has. `react` is intercepted by design-bundle's shims, so it need not
// be installed beside this file.
import React, { useState } from 'react';

export function Badge({ children, tone = 'info' }) {
  return <span data-fixture="badge" data-tone={tone} style={{ padding: 8, background: '#fde68a' }}>{children}</span>;
}

export function Counter({ label = 'Count', start = 0 }) {
  const [n, setN] = useState(Number(start));
  return <button data-fixture="counter" onClick={() => setN(n + 1)}>{label}: {n}</button>;
}
