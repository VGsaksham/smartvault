"use client";

import { useEffect } from "react";

// This layout isolates /preview/* from the main app shell.
// It applies CSS variables directly since ThemeProvider doesn't run here.
export default function PreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  useEffect(() => {
    // Apply CSS variables for preview pages
    document.body.style.background = 'var(--preview-bg, #f5f5f7)';
    
    // Detect system dark mode and apply variables
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = (dark: boolean) => {
      const r = document.documentElement;
      if (dark) {
        r.style.setProperty('--bg-app', '#0f0f10');
        r.style.setProperty('--bg-surface', '#1c1c1e');
        r.style.setProperty('--bg-neutral', '#2c2c2e');
        r.style.setProperty('--bg-elevated', '#3a3a3c');
        r.style.setProperty('--text-primary', '#f5f5f7');
        r.style.setProperty('--text-secondary', '#aeaeb2');
        r.style.setProperty('--text-tertiary', '#6e6e73');
        r.style.setProperty('--border-subtle', 'rgba(255,255,255,0.08)');
        r.style.setProperty('--accent', '#0a84ff');
        r.style.setProperty('--shadow-large', '0 12px 40px rgba(0,0,0,0.5)');
        r.style.setProperty('--shadow-medium', '0 4px 16px rgba(0,0,0,0.3)');
        document.body.style.background = '#0f0f10';
        document.body.style.color = '#f5f5f7';
      } else {
        r.style.setProperty('--bg-app', '#f5f5f7');
        r.style.setProperty('--bg-surface', '#ffffff');
        r.style.setProperty('--bg-neutral', '#f0f0f2');
        r.style.setProperty('--bg-elevated', '#e8e8ed');
        r.style.setProperty('--text-primary', '#1d1d1f');
        r.style.setProperty('--text-secondary', '#6e6e73');
        r.style.setProperty('--text-tertiary', '#aeaeb2');
        r.style.setProperty('--border-subtle', 'rgba(0,0,0,0.08)');
        r.style.setProperty('--accent', '#0071e3');
        r.style.setProperty('--shadow-large', '0 12px 40px rgba(0,0,0,0.08)');
        r.style.setProperty('--shadow-medium', '0 4px 16px rgba(0,0,0,0.06)');
        document.body.style.background = '#f5f5f7';
        document.body.style.color = '#1d1d1f';
      }
    };
    applyTheme(mq.matches);
    mq.addEventListener('change', (e) => applyTheme(e.matches));
    return () => mq.removeEventListener('change', (e) => applyTheme(e.matches));
  }, []);

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg-app)' }}>
      {/* Minimal branded header — no links, no navigation */}
      <header style={{
        width: '100%',
        padding: '14px 24px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--bg-surface)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        boxSizing: 'border-box',
      }}>
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect width="24" height="24" rx="6" fill="var(--accent, #0071e3)" />
          <path d="M7 8h10M7 12h6M7 16h8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span style={{
          fontSize: '16px',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-inter, system-ui, sans-serif)',
        }}>
          SmartVault
        </span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '12px',
          color: 'var(--text-tertiary)',
          fontWeight: 500,
          fontFamily: 'var(--font-inter, system-ui, sans-serif)',
        }}>
          Secure Preview
        </span>
      </header>

      <main style={{ minHeight: 'calc(100vh - 53px)', background: 'var(--bg-app)' }}>
        {children}
      </main>
    </div>
  );
}
