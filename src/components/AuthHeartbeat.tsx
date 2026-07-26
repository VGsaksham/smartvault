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
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.user) {
            const oldUserStr = localStorage.getItem('user');
            const newUserStr = JSON.stringify(data.user);
            if (oldUserStr && oldUserStr !== newUserStr) {
              // Only reload if the user changed and it's not the first render
              // wait, the first render would also have an oldUserStr.
              // Let's just compare the critical fields: role, masterfolder_access, allowed_categories
              const oldUser = JSON.parse(oldUserStr);
              const roleChanged = oldUser.role !== data.user.role;
              
              const oldAllowed = JSON.stringify(oldUser.allowed_categories || []);
              const newAllowed = JSON.stringify(data.user.allowed_categories || []);
              
              const oldmasterfolderAccess = JSON.stringify(oldUser.masterfolder_access || []);
              const newmasterfolderAccess = JSON.stringify(data.user.masterfolder_access || []);

              const oldFolderAccess = JSON.stringify(oldUser.folder_access || []);
              const newFolderAccess = JSON.stringify(data.user.folder_access || []);
              
              if (roleChanged || oldAllowed !== newAllowed || oldmasterfolderAccess !== newmasterfolderAccess || oldFolderAccess !== newFolderAccess) {
                localStorage.setItem('user', newUserStr);
                window.location.reload();
              } else if (oldUserStr !== newUserStr) {
                // If just preferences or name changed, update it silently
                localStorage.setItem('user', newUserStr);
              }
            } else if (!oldUserStr) {
              localStorage.setItem('user', newUserStr);
            }
          }
          return;
        }

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

