'use client';

import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import { 
  Folder, 
  Clock, 
  Star, 
  Activity, 
  Briefcase, 
  Users, 
  Scale, 
  ImageIcon, 
  Shield,
  UserCog,
  Building2,
  LayoutDashboard,
  Database,
  Layers,
  X
} from 'lucide-react';

import { useState, useEffect } from 'react';
import { useSidebar } from '@/context/SidebarContext';
import { apiUrl } from '@/lib/api';

export default function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { isSidebarOpen, closeSidebar } = useSidebar();
  
  let activeDept = searchParams.get('dept') || 'All files';
  if (pathname.startsWith('/departments/')) {
    const rawDept = pathname.split('/')[2];
    activeDept = rawDept.charAt(0).toUpperCase() + rawDept.slice(1);
  }

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userDept, setUserDept] = useState<string | null>(null);
  const [allowedDepts, setAllowedDepts] = useState<string[]>([]);
  const [structureDepts, setStructureDepts] = useState<string[]>([]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const user = storedUser ? JSON.parse(storedUser) : null;
        setUserRole(payload.role);
        setUserDept(payload.department);
        setAllowedDepts(user?.allowed_departments || payload.allowed_departments || []);
      } catch (e) {
        console.error('Invalid token payload in Sidebar');
      }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const companyId = searchParams.get('companyId');
    const fyId = searchParams.get('fyId');
    if (!companyId || !fyId) {
      setStructureDepts([]);
      return;
    }
    const params = new URLSearchParams({ companyId, fyId });
    fetch(apiUrl(`/api/structure?${params.toString()}`), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [];
        const depts = Array.isArray((data as any)?.departments) ? (data as any).departments : [];
        return depts.map((d: any) => String(d?.name || '')).filter(Boolean);
      })
      .then((names: string[]) => setStructureDepts(names))
      .catch(() => setStructureDepts([]));
  }, [searchParams]);

  useEffect(() => {
    const handler = (ev: any) => {
      const token = localStorage.getItem('token');
      if (!token) return;
      const companyId = searchParams.get('companyId');
      const fyId = searchParams.get('fyId');
      const detailCompany = ev?.detail?.companyId;
      const detailFy = ev?.detail?.fyId;
      if (!companyId || !fyId) return;
      if (Number(detailCompany) !== Number(companyId) || Number(detailFy) !== Number(fyId)) return;
      const params = new URLSearchParams({ companyId, fyId });
      fetch(apiUrl(`/api/structure?${params.toString()}`), { headers: { Authorization: `Bearer ${token}` } })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return [];
          const depts = Array.isArray((data as any)?.departments) ? (data as any).departments : [];
          return depts.map((d: any) => String(d?.name || '')).filter(Boolean);
        })
        .then((names: string[]) => setStructureDepts(names))
        .catch(() => {});
    };
    window.addEventListener('smartvault:structureChanged', handler as any);
    return () => window.removeEventListener('smartvault:structureChanged', handler as any);
  }, [searchParams]);

  // Close sidebar on route change (mobile)
  useEffect(() => {
    closeSidebar();
  }, [pathname, searchParams]);

  // Prevent body scroll when mobile sidebar is open
  useEffect(() => {
    if (isSidebarOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [isSidebarOpen]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    window.location.href = '/login';
  };

  const navigateTo = (path: string, params?: Record<string, string>) => {
    const currentParams = new URLSearchParams(searchParams);
    
    if (!params?.dept) {
      currentParams.delete('dept');
    }
    
    if (params?.dept && currentParams.get('dept') !== params.dept) {
      currentParams.delete('folder');
    } else if (pathname !== path) {
      currentParams.delete('folder');
    }

    if (params) {
      Object.entries(params).forEach(([k, v]) => currentParams.set(k, v));
    }
    const qs = currentParams.toString();
    router.push(qs ? `${path}?${qs}` : path);
  };

  const views = [
    { name: 'All files', path: '/', params: {}, icon: Folder, adminOnly: false },
    { name: 'Recent', path: '/recent', params: {}, icon: Clock, adminOnly: false },
    { name: 'Starred', path: '/starred', params: {}, icon: Star, adminOnly: false },
    { name: 'Admin Dashboard', path: '/admin', params: {}, icon: LayoutDashboard, adminOnly: true },
    { name: 'Backups', path: '/admin/backups', params: {}, icon: Database, adminOnly: true },
    { name: 'Departments & Folders', path: '/admin/structure', params: {}, icon: Layers, adminOnly: true },
  ].filter(v => !v.adminOnly || userRole === 'Admin');

  const departments = (structureDepts.length > 0 ? structureDepts : [])
    .filter((name) => {
      if (userRole === 'Admin') return true;
      return name === userDept || allowedDepts.includes(name);
    })
    .map((name) => ({
      name,
      path: '/',
      params: { dept: name },
      icon: Briefcase,
      adminOnly: false
    }));

  const sidebarContent = (
    <aside className="w-64 h-full bg-[var(--bg-app)] border-r border-[var(--border-subtle)] flex flex-col">
      {/* App Logo Area */}
      <div className="h-[64px] flex items-center justify-between px-6 flex-shrink-0">
        <span className="text-[17px] font-semibold tracking-[-0.374px] text-[var(--text-primary)]">SmartVault</span>
        {/* Close button — mobile only */}
        <button
          onClick={closeSidebar}
          className="md:hidden flex items-center justify-center w-[32px] h-[32px] rounded-full hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)] transition-colors"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto px-4 py-2 space-y-8 no-scrollbar">
        <div>
          <h3 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-4 px-3">Views</h3>
          <ul className="space-y-1">
            {views.map((item) => {
              const isActive = item.name === 'All files' ? activeDept === 'All files' && pathname === '/' : pathname === item.path;
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <button 
                    onClick={() => navigateTo(item.path, item.params)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14px] tracking-[-0.224px] transition-all duration-200 active:scale-[0.97] ${
                      isActive 
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-sm' 
                        : 'text-[var(--text-secondary)] font-medium hover:bg-[var(--bg-neutral)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-[var(--accent)]' : 'opacity-70'} />
                    <span>{item.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <h3 className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em] mb-4 px-3">Departments</h3>
          <ul className="space-y-1">
            {departments.map((item) => {
              const isActive = activeDept === item.name;
              const Icon = item.icon;
              return (
                <li key={item.name}>
                  <button 
                    onClick={() => navigateTo(item.path, item.params)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-[8px] text-[14px] tracking-[-0.224px] transition-all duration-200 active:scale-[0.97] ${
                      isActive 
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold shadow-sm' 
                        : 'text-[var(--text-secondary)] font-medium hover:bg-[var(--bg-neutral)] hover:text-[var(--text-primary)]'
                    }`}
                  >
                    <Icon size={16} strokeWidth={isActive ? 2.5 : 2} className={isActive ? 'text-[var(--accent)]' : 'opacity-70'} />
                    <span>{item.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="p-4 border-t border-[var(--border-subtle)] bg-[var(--bg-app)] flex-shrink-0">
        <button 
          onClick={handleLogout}
          className="w-full flex items-center justify-between px-3 py-3 rounded-[10px] bg-[rgba(255,59,48,0.05)] hover:bg-[rgba(255,59,48,0.1)] text-[#ff5b52] text-[14px] tracking-[-0.224px] transition-all font-semibold active:scale-[0.97]"
        >
          Sign Out
        </button>
      </div>
    </aside>
  );

  return (
    <>
      {/* ── Desktop: fixed sidebar, always visible ── */}
      <div className="hidden md:flex fixed top-0 left-0 h-full w-64 z-40 flex-col">
        {sidebarContent}
      </div>

      {/* ── Mobile: full-screen overlay drawer ── */}
      {/* Backdrop */}
      <div
        className={`md:hidden fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px] transition-opacity duration-300 ${
          isSidebarOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* Drawer panel */}
      <div
        className={`md:hidden fixed top-0 left-0 h-full w-[280px] z-50 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isSidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {sidebarContent}
      </div>
    </>
  );
}
