'use client';

import { useEffect } from 'react';
import { apiUrl } from '@/lib/api';

export default function AuthHeartbeat() {
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let alive = true;
    const tick = async () => {
      try {
        const res = await fetch(apiUrl('/api/auth/heartbeat'), {
          headers: { Authorization: `Bearer ${token}` },
          cache: 'no-store',
        });
        if (!alive) return;
        if (res.ok) return;
        // Only enforce logout for auth-related failures.
        // If backend doesn't implement this endpoint yet (404), do nothing.
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
      } catch {
        // ignore transient network errors
      }
    };

    // quick first check, then periodic
    tick();
    const id = window.setInterval(tick, 8000);
    return () => {
      alive = false;
      window.clearInterval(id);
    };
  }, []);

  return null;
}

