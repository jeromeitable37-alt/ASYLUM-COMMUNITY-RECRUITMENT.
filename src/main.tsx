import { Component, StrictMode, type ErrorInfo, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

type BoundaryState = { error: Error | null };

class AppErrorBoundary extends Component<{ children: ReactNode }, BoundaryState> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('ASYLUM recruitment app failed to render.', error, info.componentStack);
  }

  async resetAppAndReload() {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((registration) => registration.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys
            .filter((key) => key.startsWith('asy-recruitment-pwa-'))
            .map((key) => caches.delete(key))
        );
      }
    } catch (error) {
      console.warn('Could not clear all cached app files.', error);
    }
    window.location.reload();
  }

  render() {
    if (this.state.error) {
      return (
        <main style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: '24px', background: '#09090c', color: '#f4f0f4', fontFamily: 'Arial, sans-serif' }}>
          <section style={{ width: '100%', maxWidth: '560px', padding: '28px', border: '1px solid #49343b', borderRadius: '12px', background: '#141216' }}>
            <p style={{ margin: 0, color: '#ef4552', fontSize: '11px', fontWeight: 800, letterSpacing: '2px' }}>ASYLUM COMMUNITY · RECRUITMENT</p>
            <h1 style={{ margin: '12px 0', fontSize: '25px' }}>The page could not load.</h1>
            <p style={{ color: '#c0b7c1', fontSize: '14px', lineHeight: 1.6 }}>The app encountered an error before showing the dashboard. Your applications and screenshots are stored separately and were not deleted.</p>
            <pre style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', padding: '12px', borderRadius: '7px', background: '#0b0a0d', color: '#ff9aa2', fontSize: '11px' }}>{this.state.error.message || 'Unknown app error'}</pre>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', marginTop: '18px' }}>
              <button onClick={() => window.location.reload()} style={{ padding: '12px 16px', border: 0, borderRadius: '5px', background: '#e52d3b', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Reload page</button>
              <button onClick={() => void this.resetAppAndReload()} style={{ padding: '12px 16px', border: '1px solid #514650', borderRadius: '5px', background: '#211c22', color: 'white', fontWeight: 700, cursor: 'pointer' }}>Reset app cache and reload</button>
            </div>
            <small style={{ display: 'block', marginTop: '18px', color: '#928994', lineHeight: 1.5 }}>Do not send your password or login code. Share only a screenshot of this error with recruitment support.</small>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('The ASYLUM app root element is missing.');
}

createRoot(rootElement).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>
);
