'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, Mic, User, Menu } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useSidebar } from '@/context/SidebarContext';
import Link from 'next/link';

function decodeJwtPayload(token: string): any | null {
  try {
    const part = token.split('.')[1];
    if (!part) return null;
    // base64url -> base64
    const base64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
    return JSON.parse(atob(base64));
  } catch {
    return null;
  }
}

export default function TopBar() {
  const { toggleSidebar } = useSidebar();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [companies, setCompanies] = useState<any[]>([]);
  const [financialYears, setFinancialYears] = useState<any[]>([]);

  const [companyId, setCompanyId] = useState<string>("");
  const [isCompanyOpen, setIsCompanyOpen] = useState(false);
  
  const [fyId, setFyId] = useState<string>("");
  const [isFyOpen, setIsFyOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username?: string; role?: string } | null>(null);
  const [allowedCompanyIds, setAllowedCompanyIds] = useState<number[] | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Search UI is intentionally NOT synced to URL params.
  // This keeps it independent from the main dashboard listing.
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'fy'|'dept'|'folder'>('fy');
  const [fileType, setFileType] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [exact, setExact] = useState(false);
  const [results, setResults] = useState<any[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const searchRef = useRef<HTMLDivElement | null>(null);
  const folderParam = searchParams.get('folder') || '';
  const searchKey = searchParams.toString();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const storedUser = localStorage.getItem('user');
    let parsedUser: any = null;
    if (storedUser) {
      try {
        parsedUser = JSON.parse(storedUser);
        setCurrentUser(parsedUser);
        const payload = decodeJwtPayload(token);
        const tokenRole: string | null = payload?.role || null;

        const effectiveRole = tokenRole || parsedUser?.role || null;
        if (effectiveRole !== 'Admin') {
          const ids = Array.from(
            new Set(
              (Array.isArray(parsedUser?.company_access) ? parsedUser.company_access : [])
                .map((entry: any) => Number(entry?.company_id))
                .filter((id: number) => Number.isFinite(id))
            )
          );
          setAllowedCompanyIds(ids.length > 0 ? ids : []);
        } else {
          setAllowedCompanyIds(null);
        }
      } catch {}
    }

  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(apiUrl('/api/companies'), { headers: { 'Authorization': `Bearer ${token}` } })
    .then(async (resComps) => {
      if (resComps.status === 401 || resComps.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      
      const comps = await resComps.json();
      const allComps = Array.isArray(comps) ? comps : [];
      const validComps =
        Array.isArray(allowedCompanyIds) && allowedCompanyIds.length > 0
          ? allComps.filter((c: any) => allowedCompanyIds.includes(Number(c.id)))
          : allComps;
      
      setCompanies(validComps);

      // First-run onboarding: if there are no companies, guide Admin to create one.
      // Keep this non-blocking; it only nudges and preserves current page.
      if (validComps.length === 0) {
        setCompanyId('');
        setFyId('');
        const currentParams = new URLSearchParams(searchParams);
        currentParams.delete('companyId');
        currentParams.delete('fyId');
        const nextQuery = currentParams.toString();
        if (nextQuery !== searchKey) {
          router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
        }
      }
      
      const currentParams = new URLSearchParams(searchParams);
      let updated = false;

      let initialCompId = searchParams.get('companyId');
      const currentCompAllowed = validComps.some((c: any) => String(c.id) === String(initialCompId || ''));
      if ((!initialCompId || !currentCompAllowed) && validComps.length > 0) {
        initialCompId = validComps[0].id.toString();
        currentParams.set('companyId', initialCompId!);
        updated = true;
      }
      if (validComps.length === 0) {
        currentParams.delete('companyId');
        currentParams.delete('fyId');
        updated = true;
      }
      if (initialCompId) setCompanyId(initialCompId);

      let initialFyId = searchParams.get('fyId');
      if (initialFyId) setFyId(initialFyId);

      const nextQuery = currentParams.toString();
      if (updated && nextQuery !== searchKey) {
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
      }
    }).catch(console.error);
  }, [allowedCompanyIds, pathname, router, searchKey]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !companyId) return;
    fetch(apiUrl(`/api/financial-years?companyId=${companyId}`), { headers: { 'Authorization': `Bearer ${token}` } })
      .then(async (resFys) => {
        if (resFys.status === 401 || resFys.status === 403) {
          localStorage.removeItem('token');
          window.location.href = '/login';
          return;
        }
        const fys = await resFys.json();
        const validFys = Array.isArray(fys) ? fys : [];
        setFinancialYears(validFys);

        const params = new URLSearchParams(searchParams);
        // Ensure we never "snap back" to an old companyId due to stale searchParams closure.
        // Always prefer the current selected companyId state.
        if (companyId) params.set('companyId', companyId);
        const selectedFy = params.get('fyId');
        const fyExists = validFys.some((f: any) => f.id.toString() === selectedFy);
        if (!selectedFy || !fyExists) {
          const activeFy = validFys.find((f: any) => f.status === 'Active');
          const nextFyId = activeFy ? activeFy.id.toString() : validFys[0]?.id?.toString();
          if (nextFyId) {
            setFyId(nextFyId);
            params.set('fyId', nextFyId);
            const nextQuery = params.toString();
            if (nextQuery !== searchKey) {
              router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
            }
          }
        } else {
          setFyId(selectedFy);
        }
      })
      .catch(console.error);
  }, [companyId, pathname, router, searchKey]);

  useEffect(() => {
    setVoiceSupported(typeof window !== 'undefined' && Boolean((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition));
  }, []);

  // Ensure params are preserved in URL when navigating across views
  useEffect(() => {
    const urlCompanyId = searchParams.get('companyId');
    const urlFyId = searchParams.get('fyId');
    let updated = false;
    const params = new URLSearchParams(searchParams);

    if (!urlCompanyId && companyId) {
      params.set('companyId', companyId);
      updated = true;
    }
    // Only re-inject fyId if it's non-empty AND belongs to the current company
    // (prevents stale old-company FY being re-injected after company switch)
    if (!urlFyId && fyId && urlCompanyId === companyId) {
      params.set('fyId', fyId);
      updated = true;
    }

    const nextQuery = params.toString();
    if (updated && nextQuery !== searchKey) {
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    }
  }, [searchParams, pathname, companyId, fyId, router, searchKey]);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(e.target as Node)) setIsSearchOpen(false);
    };
    window.addEventListener('mousedown', onOutsideClick);
    return () => window.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const handleCompanyChange = (id: string) => {
    setCompanyId(id);
    setFyId(''); // clear stale FY immediately
    setIsCompanyOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('companyId', id);
    params.delete('fyId'); // remove stale fyId — will be repopulated by the FY fetch useEffect
    router.replace(`${pathname}?${params.toString()}`);
  };

  const handleFyChange = (id: string) => {
    setFyId(id);
    setIsFyOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('fyId', id);
    router.replace(`${pathname}?${params.toString()}`);
  };

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !query.trim()) {
      setResults([]);
      return;
    }
    const id = setTimeout(async () => {
      try {
        setLoadingResults(true);
        const params = new URLSearchParams();
        params.set('q', query.trim());
        params.set('scope', scope);
        if (companyId) params.set('companyId', companyId);
        if (fyId) params.set('fyId', fyId);
        let dept = searchParams.get('dept');
        if (!dept && pathname.startsWith('/departments/')) {
          const rawDept = pathname.split('/')[2];
          dept = rawDept.charAt(0).toUpperCase() + rawDept.slice(1);
        }
        if (scope === 'dept' && dept && dept !== 'All files') params.set('departments', dept);
        
        const folder = searchParams.get('folder');
        if (scope === 'folder') {
          if (folder) params.set('folder', folder);
          if (dept && dept !== 'All files') params.set('departments', dept);
        }
        if (fileType) params.set('fileType', fileType);
        if (matchCase) params.set('matchCase', 'true');
        if (exact) params.set('exact', 'true');
        const res = await fetch(apiUrl(`/api/files/search?${params.toString()}`), {
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json();
        setResults(Array.isArray(data) ? data : []);
      } catch {
        setResults([]);
      } finally {
        setLoadingResults(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [query, scope, fileType, matchCase, exact, companyId, fyId, folderParam]);

  const startVoiceSearch = () => {
    const Recognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!Recognition) return;
    const recognition = new Recognition();
    recognition.lang = 'en-US';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event: any) => {
      const spokenText = event.results?.[0]?.[0]?.transcript?.trim();
      if (spokenText) setQuery(spokenText);
    };
    recognition.start();
  };

  const openUploadModal = () => {
    const params = new URLSearchParams(searchParams);
    params.set('upload', 'true');
    router.replace(`${pathname}?${params.toString()}`);
  };

  const goTo = (target: string) => {
    setIsUserMenuOpen(false);
    router.push(target);
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.href = '/login';
  };

  const openResultLocation = (file: any, openPreview = false) => {
    const params = new URLSearchParams(searchParams);
    if (file.company_id) params.set('companyId', String(file.company_id));
    if (file.fy_id) params.set('fyId', String(file.fy_id));
    if (file.department) params.set('dept', file.department);
    if (file.folder) params.set('folder', file.folder);
    params.set('focusFileId', String(file.id));
    if (openPreview) params.set('openFileId', String(file.id));
    else params.delete('openFileId');
    params.delete('q');
    params.delete('scope');
    setIsSearchOpen(false);
    router.push(`${pathname}?${params.toString()}`);
  };

  return (
    <div
      ref={searchRef}
      className="fixed top-0 right-0 left-0 md:left-64 z-30 bg-[var(--bg-app)]/85 backdrop-blur-md border-b border-[var(--border-subtle)]"
    >
      {/* First-run: no companies created yet */}
      {Array.isArray(companies) && companies.length === 0 && (
        <div className="px-2 sm:px-3 md:px-6 py-2 border-b border-[var(--border-subtle)] bg-[#ff950015]">
          <div className="max-w-[1200px] mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="text-[13px] text-[#a15c00]">
              No companies found. Create your first company to start using SmartVault.
            </div>
            <Link
              href="/admin/companies"
              className="inline-flex items-center justify-center px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold"
            >
              Go to Companies Setup
            </Link>
          </div>
        </div>
      )}
      {/* Main row */}
      <div className="h-[52px] flex items-center justify-between px-2 sm:px-3 md:px-6 gap-1.5 md:gap-0">
        {/* Left side: Hamburger (mobile) + Logo + Dropdowns */}
        <div className="flex items-center gap-2 md:gap-6 flex-shrink-0">
          {/* Hamburger — mobile only */}
          <button
            onClick={toggleSidebar}
            className="md:hidden flex items-center justify-center w-[36px] h-[36px] rounded-[8px] hover:bg-[var(--bg-neutral)] text-[var(--text-primary)] transition-colors active:scale-[0.95]"
            aria-label="Open menu"
          >
            <Menu size={20} />
          </button>

          <h2 className="hidden min-[390px]:block text-[16px] md:text-[21px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] whitespace-nowrap">
            SmartVault
          </h2>

          {/* Dropdowns — hidden on mobile, visible on md+ */}
          <div className="hidden md:flex items-center gap-2">
            {/* Company Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsCompanyOpen(!isCompanyOpen)}
                className="flex items-center justify-between min-w-[130px] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[14px] tracking-[-0.224px] rounded-[11px] border border-[var(--border-subtle)] py-[4px] pl-[14px] pr-[12px] cursor-pointer outline-none focus:border-[var(--accent)] transition-colors"
              >
                <span className="opacity-80">
                  {(Array.isArray(companies) ? companies : []).find((c) => c.id.toString() === companyId)?.name || 'Loading...'}
                </span>
                <div className={`ml-2 text-[var(--text-tertiary)] text-[10px] transition-transform duration-200 ${isCompanyOpen ? 'rotate-180' : ''}`}>▼</div>
              </button>

              {isCompanyOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsCompanyOpen(false)}></div>
                  <div className="absolute top-[calc(100%+4px)] left-0 min-w-[130px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] rounded-[11px] overflow-hidden z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {(Array.isArray(companies) ? companies : []).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleCompanyChange(opt.id.toString())}
                        className={`w-full text-left px-[14px] py-[6px] text-[14px] tracking-[-0.224px] transition-colors hover:bg-[var(--bg-neutral)] ${companyId === opt.id.toString() ? 'text-[var(--accent)] font-medium bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Financial Year Dropdown */}
            <div className="relative">
              <button
                onClick={() => setIsFyOpen(!isFyOpen)}
                className="flex items-center justify-between min-w-[160px] bg-[var(--bg-elevated)] text-[var(--text-primary)] text-[14px] tracking-[-0.224px] rounded-[11px] border border-[var(--border-subtle)] py-[4px] pl-[14px] pr-[12px] cursor-pointer outline-none focus:border-[var(--accent)] transition-colors whitespace-nowrap"
              >
                <span className="opacity-80">
                  {(Array.isArray(financialYears) ? financialYears : []).find((f) => f.id.toString() === fyId)?.name || 'Loading...'}
                </span>
                <div className={`ml-2 text-[var(--text-tertiary)] text-[10px] transition-transform duration-200 ${isFyOpen ? 'rotate-180' : ''}`}>▼</div>
              </button>

              {isFyOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsFyOpen(false)}></div>
                  <div className="absolute top-[calc(100%+4px)] left-0 min-w-[200px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] rounded-[11px] overflow-hidden z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                    {(Array.isArray(financialYears) ? financialYears : []).map((opt) => (
                      <button
                        key={opt.id}
                        onClick={() => handleFyChange(opt.id.toString())}
                        className={`w-full text-left px-[14px] py-[6px] text-[14px] tracking-[-0.224px] transition-colors hover:bg-[var(--bg-neutral)] flex items-center justify-between gap-2 ${fyId === opt.id.toString() ? 'text-[var(--accent)] font-medium bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]' : 'text-[var(--text-primary)]'}`}
                      >
                        {opt.name}
                        {opt.status === 'Active' && (
                          <span className="text-[10px] font-semibold text-[#34c759] bg-[#34c75915] px-[6px] py-[1px] rounded-full border border-[#34c75920]">Current</span>
                        )}
                        {opt.status === 'Archived' && (
                          <span className="text-[10px] font-medium text-[var(--text-tertiary)] bg-[var(--bg-neutral)] px-[6px] py-[1px] rounded-full border border-[var(--border-subtle)]">Archived</span>
                        )}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Center: Search Input */}
        <div className="flex-1 mx-1 min-w-0 md:mx-6">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" size={14} />
            <input
              type="text"
              placeholder="Search files..."
              value={query}
              onFocus={() => setIsSearchOpen(true)}
              onChange={(e) => setQuery(e.target.value)}
              className={`w-full min-w-0 bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[980px] py-[6px] pl-[34px] pr-[42px] md:pr-[68px] text-[var(--text-primary)] text-[16px] tracking-[-0.374px] focus:outline-none focus:border-[var(--accent)] transition-all placeholder:text-[var(--text-tertiary)] ${isSearchOpen ? 'ring-2 ring-[var(--accent)]/15' : ''}`}
            />
            {voiceSupported && (
              <button
                onClick={startVoiceSearch}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                title="Voice search"
              >
                <Mic size={14} />
              </button>
            )}
          </div>
        </div>

        {/* Right side: Actions */}
        <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
          <button
            onClick={openUploadModal}
            className="bg-[var(--accent)] text-white text-[12px] md:text-[13px] font-medium px-[10px] sm:px-[12px] md:px-[18px] py-[7px] rounded-[980px] active:scale-[0.96] transition-all cursor-pointer shadow-sm hover:opacity-90 whitespace-nowrap"
          >
            <span className="hidden sm:inline">New Upload</span>
            <span className="sm:hidden">Upload</span>
          </button>
          <div className="relative">
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="flex items-center justify-center w-[34px] h-[34px] rounded-full hover:bg-[var(--bg-neutral)] text-[var(--text-primary)] transition-colors cursor-pointer border border-[var(--border-subtle)]"
            >
              <User size={16} />
            </button>
            {isUserMenuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setIsUserMenuOpen(false)} />
                <div className="absolute right-0 top-[calc(100%+8px)] w-[220px] rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[var(--border-subtle)]">
                    <p className="text-[13px] font-bold text-[var(--text-primary)]">{currentUser?.username || 'User'}</p>
                    <p className="text-[11px] text-[var(--text-tertiary)]">{currentUser?.role || ''}</p>
                  </div>
                  <button onClick={() => goTo('/admin/users')} className="w-full text-left px-4 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-colors">Users & Roles</button>
                  {currentUser?.role === 'Admin' && (
                    <button onClick={() => goTo('/admin/companies')} className="w-full text-left px-4 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-colors">Companies & FY</button>
                  )}
                  <div className="h-[1px] bg-[var(--border-subtle)]" />
                  <button onClick={handleLogout} className="w-full text-left px-4 py-2.5 text-[13px] text-[#ff5b52] hover:bg-[#ff5b5210] transition-colors">Sign Out</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Wide navbar-extended search panel */}
      {isSearchOpen && (
        <div className="px-2 sm:px-3 md:px-6 pb-3 md:pb-4">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-default)] rounded-[16px] shadow-[var(--shadow-medium)] overflow-hidden">
            <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
              {[
                ['fy', 'This FY only'],
                ['dept', 'This department only'],
                ['folder', 'This folder only']
              ].map(([key, label]) => (
                <button
                  key={key}
                  onClick={() => setScope(key as any)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-[10px] border transition-colors ${
                    scope === key
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                  }`}
                >
                  {label}
                </button>
              ))}
              <button
                onClick={() => setShowAdvancedFilters((v) => !v)}
                className="ml-auto text-[11px] px-2.5 py-1.5 rounded-[10px] border border-[var(--border-subtle)] text-[var(--text-secondary)] bg-[var(--bg-elevated)] hover:border-[var(--border-default)] transition-colors"
              >
                {showAdvancedFilters ? 'Hide filters' : 'More filters'}
              </button>
            </div>

            {showAdvancedFilters && (
              <div className="px-4 py-3 border-b border-[var(--border-subtle)] flex items-center gap-2 flex-wrap">
                {[
                  ['docs', 'Docs'],
                  ['video', 'Video'],
                  ['audio', 'Audio'],
                  ['images', 'Images'],
                  ['design', 'Design'],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setFileType(fileType === key ? '' : key)}
                    className={`text-[11px] px-2.5 py-1.5 rounded-[10px] border transition-colors ${
                      fileType === key
                        ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                        : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                    }`}
                  >
                    {label}
                  </button>
                ))}
                <button
                  onClick={() => setMatchCase((v) => !v)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-[10px] border transition-colors ${
                    matchCase
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                  }`}
                >
                  Match case
                </button>
                <button
                  onClick={() => setExact((v) => !v)}
                  className={`text-[11px] px-2.5 py-1.5 rounded-[10px] border transition-colors ${
                    exact
                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                      : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                  }`}
                >
                  Exact
                </button>
              </div>
            )}

            <div className="max-h-[360px] overflow-y-auto">
              {results.length === 0 ? (
                <p className="px-4 py-4 text-[13px] text-[var(--text-tertiary)]">
                  {query ? 'No matching files found.' : 'Type to search files...'}
                </p>
              ) : (
                results.map((file) => (
                  <div
                    key={file.id}
                    onClick={() => openResultLocation(file, false)}
                    onDoubleClick={() => openResultLocation(file, true)}
                    className="px-4 py-3 border-b border-[var(--border-subtle)] last:border-b-0 hover:bg-[var(--bg-neutral)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                        {file.custom_name || file.auto_name || file.original_name}
                      </p>
                    </div>
                    <div className="mt-1 text-[11px] text-[var(--text-tertiary)] flex flex-wrap items-center gap-1">
                      <span>{file.company_name || '-'}</span><span>›</span><span>{file.fy_name || '-'}</span><span>›</span><span>{file.department || '-'}</span>
                      {file.folder && (<><span>›</span><span>{file.folder}</span></>)}
                    </div>
                  </div>
                ))
              )}
            </div>
            {loadingResults && (
              <div className="px-4 py-2 text-[11px] text-[var(--text-tertiary)] border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/30">
                Updating results...
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
