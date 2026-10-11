'use client';

import { useEffect, useState, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { apiUrl } from '@/lib/api';

export default function AutoVersionManager() {
  const [hasUpdate, setHasUpdate] = useState(false);
  const initialBootRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. Auto-recover from stale chunk errors after deployments
    const handleChunkError = (msg: string) => {
      if (
        msg.includes('Loading chunk') ||
        msg.includes('ChunkLoadError') ||
        msg.includes('Failed to fetch dynamically imported module') ||
        msg.includes('CSS chunk load failed')
      ) {
        const lastReload = Number(sessionStorage.getItem('sv_last_chunk_reload') || '0');
        const now = Date.now();
        // Prevent infinite reload loops (require at least 15s between auto-reloads)
        if (now - lastReload > 15000) {
          sessionStorage.setItem('sv_last_chunk_reload', String(now));
          console.warn('[AutoVersionManager] Stale asset detected after deployment. Auto-refreshing...');
          if ('caches' in window) {
            caches.keys().then((keys) => Promise.all(keys.map((k) => caches.delete(k)))).catch(() => {});
          }
          window.location.reload();
        }
      }
    };

    const onError = (e: ErrorEvent) => handleChunkError(e.message || '');
    const onUnhandledRejection = (e: PromiseRejectionEvent) => {
      const msg = String(e.reason?.message || e.reason || '');
      handleChunkError(msg);
    };

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onUnhandledRejection);

    // 2. Poll server version to detect new deployments
    let isMounted = true;
    const checkVersion = async () => {
      try {
        const res = await fetch(apiUrl(`/api/version?_t=${Date.now()}`), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache', 'Pragma': 'no-cache' },
        });
        if (!res.ok) return;
        const data = await res.json();
        const serverBootedAt = Number(data.bootedAt);
        if (!serverBootedAt) return;

        if (initialBootRef.current === null) {
          initialBootRef.current = serverBootedAt;
        } else if (serverBootedAt > initialBootRef.current) {
          // Server restarted or new deployment happened
          if (isMounted) setHasUpdate(true);
        }
      } catch {}
    };

    // Initial check
    checkVersion();

    // Check on window focus and every 45s
    const onFocus = () => checkVersion();
    window.addEventListener('focus', onFocus);
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') checkVersion();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const interval = setInterval(checkVersion, 45000);

    return () => {
      isMounted = false;
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onUnhandledRejection);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(interval);
    };
  }, []);

  const handleApplyUpdate = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {}
    window.location.href = window.location.pathname + '?_v=' + Date.now();
  };

  if (!hasUpdate) return null;

  return (
    <div className="fixed bottom-4 right-4 z-50 animate-in fade-in slide-in-from-bottom-3 duration-200">
      <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-[var(--bg-surface)]/95 backdrop-blur-md border border-[var(--border-default)] rounded-[12px] shadow-[var(--shadow-large)] text-[13px] text-[var(--text-primary)]">
        <span className="flex h-2 w-2 relative">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[var(--accent)] opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-[var(--accent)]"></span>
        </span>
        <span className="font-medium text-[var(--text-secondary)]">New update available</span>
        <button
          onClick={handleApplyUpdate}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-[var(--accent)] text-white text-[12px] font-semibold rounded-[7px] hover:opacity-90 active:scale-95 transition-all cursor-pointer shadow-xs"
        >
          <RefreshCw size={12} />
          <span>Update Now</span>
        </button>
        <button
          onClick={() => setHasUpdate(false)}
          className="p-1 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] rounded-[4px] hover:bg-[var(--bg-neutral)] transition-colors cursor-pointer"
          title="Dismiss"
        >
          <X size={13} />
        </button>
      </div>
    </div>
  );
}
