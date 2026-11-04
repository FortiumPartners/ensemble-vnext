import React from 'react';
import { createRoot } from 'react-dom/client';
import { Button, Card, Chip } from '../components/index.jsx';

const routes = {
  '/': () => (
    <Card title="Home">
      <p className="mb-3">Welcome to the fixture app.</p>
      <Button onClick={() => navigate('/trips')}>See trips</Button>
    </Card>
  ),
  '/trips': () => (
    <Card title="Trips">
      <div className="flex gap-2"><Chip>Lisbon</Chip><Chip>Osaka</Chip><Chip>Quito</Chip></div>
    </Card>
  ),
  '/settings': () => (
    <Card title="Settings">
      <Button variant="secondary">Sign out</Button>
    </Card>
  ),
};

function navigate(path) {
  history.pushState({}, '', path);
  render();
}

const root = createRoot(document.getElementById('root'));
function render() {
  const Page = routes[location.pathname] || routes['/'];
  root.render(
    <main className="mx-auto max-w-md space-y-4 p-4 text-ink">
      <nav className="flex gap-4 text-brand">
        {Object.keys(routes).map((p) => (
          <a key={p} href={p} onClick={(e) => { e.preventDefault(); navigate(p); }}>{p === '/' ? 'Home' : p.slice(1)}</a>
        ))}
      </nav>
      <Page />
    </main>
  );
}
window.addEventListener('popstate', render);
render();
