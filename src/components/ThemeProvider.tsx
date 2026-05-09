'use client';

import { useEffect } from 'react';

export default function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const applyTheme = () => {
      // First check if there's a server-side preference in the stored user object
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        try {
          const user = JSON.parse(storedUser);
          if (user.theme_preference) {
            if (user.theme_preference === 'dark') {
              document.documentElement.classList.add('dark');
              localStorage.setItem('smartvault-theme', 'dark');
            } else {
              document.documentElement.classList.remove('dark');
              localStorage.setItem('smartvault-theme', 'light');
            }
            return;
          }
        } catch (e) {}
      }
      // Fallback to localStorage key
      const saved = localStorage.getItem('smartvault-theme');
      if (saved === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    };

    applyTheme();

    // Listen for theme changes from other tabs/windows
    const handleStorage = (e: StorageEvent) => {
      if (e.key === 'smartvault-theme' || e.key === 'user') applyTheme();
    };
    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return <>{children}</>;
}
