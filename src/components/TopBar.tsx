'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Search, User, Menu, X, Calendar, Folder, FileText } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useSidebar } from '@/context/SidebarContext';

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

  const [masterfolders, setmasterfolders] = useState<any[]>([]);

  const [masterfolderId, setMasterfolderId] = useState<string>("");
  const [ismasterfolderOpen, setIsmasterfolderOpen] = useState(false);
  

  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ username?: string; role?: string } | null>(null);
  const [allowedMasterfolderIds, setAllowedMasterfolderIds] = useState<number[] | null>(null);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  // Search UI is intentionally NOT synced to URL params.
  // This keeps it independent from the main dashboard listing.
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<'all_masterfolders'|'category'|'folder'>('folder');
  const [fileType, setFileType] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [exact, setExact] = useState(false);
  const [dateFilter, setDateFilter] = useState(''); // '7days', '30days', 'custom'
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
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
        const tokenRole: string | null = payload?.role ;

        const effectiveRole = tokenRole || parsedUser?.role ;
        if (effectiveRole !== 'Admin') {
          const ids = Array.from(
            new Set<number>([
              ...(Array.isArray(parsedUser?.masterfolder_access) ? parsedUser.masterfolder_access : []).map((entry: any) => Number(entry?.masterfolder_id)),
              ...(Array.isArray(parsedUser?.folder_access) ? parsedUser.folder_access : [])
                  .filter((entry: any) => !entry.is_exclusion)
                  .map((entry: any) => Number(entry?.masterfolder_id))
            ].filter((id: number) => Number.isFinite(id)))
          );
          setAllowedMasterfolderIds(ids.length > 0 ? ids : []);
        } else {
          setAllowedMasterfolderIds(null);
        }
      } catch {}
    }

  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(apiUrl('/api/masterfolders'), { headers: { 'Authorization': `Bearer ${token}` } })
    .then(async (resComps) => {
      if (resComps.status === 401 || resComps.status === 403) {
        localStorage.removeItem('token');
        window.location.href = '/login';
        return;
      }
      
      const comps = await resComps.json();
      const allComps = Array.isArray(comps) ? comps : [];
      const validComps =
        Array.isArray(allowedMasterfolderIds) && allowedMasterfolderIds.length > 0
          ? allComps.filter((c: any) => allowedMasterfolderIds.includes(Number(c.id)))
          : allComps;
      
      setmasterfolders(validComps);

      // First-run onboarding: if there are no masterfolders, guide Admin to create one.
      // Keep this non-blocking; it only nudges and preserves current page.
      if (validComps.length === 0) {
        setMasterfolderId('');
        const currentParams = new URLSearchParams(searchParams);
        currentParams.delete('masterfolderId');
        const nextQuery = currentParams.toString();
        if (nextQuery !== searchKey) {
          router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
        }
      }
      
      const currentParams = new URLSearchParams(searchParams);
      let updated = false;

      let initialCompId = searchParams.get('masterfolderId');
      const currentCompAllowed = validComps.some((c: any) => String(c.id) === String(initialCompId || ''));
      if ((!initialCompId || !currentCompAllowed) && validComps.length > 0) {
        initialCompId = validComps[0].id.toString();
        currentParams.set('masterfolderId', initialCompId!);
        updated = true;
      }
      if (validComps.length === 0) {
        currentParams.delete('masterfolderId');
        updated = true;
      }
      if (initialCompId) setMasterfolderId(initialCompId);

      const nextQuery = currentParams.toString();
      if (updated && nextQuery !== searchKey) {
        router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
      }
    }).catch(console.error);
  }, [allowedMasterfolderIds, pathname, router, searchKey]);



  // Ensure params are preserved in URL when navigating across views
  useEffect(() => {
    const urlMasterfolderId = searchParams.get('masterfolderId');
    let updated = false;
    const params = new URLSearchParams(searchParams);

    if (!urlMasterfolderId && masterfolderId) {
      params.set('masterfolderId', masterfolderId);
      updated = true;
    }


    const nextQuery = params.toString();
    if (updated && nextQuery !== searchKey) {
      if (masterfolderId) localStorage.setItem('last_masterfolderId', masterfolderId);
      router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname);
    } else if (masterfolderId) {
      localStorage.setItem('last_masterfolderId', masterfolderId);
    }
  }, [searchParams, pathname, masterfolderId, router, searchKey]);

  useEffect(() => {
    const onOutsideClick = (e: MouseEvent) => {
      if (!searchRef.current) return;
      if (!searchRef.current.contains(e.target as Node)) setIsSearchOpen(false);
    };
    window.addEventListener('mousedown', onOutsideClick);
    return () => window.removeEventListener('mousedown', onOutsideClick);
  }, []);

  const handlemasterfolderChange = (id: string) => {
    setMasterfolderId(id);
    setIsmasterfolderOpen(false);
    const params = new URLSearchParams(searchParams);
    params.set('masterfolderId', id);
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
        if (masterfolderId) params.set('masterfolderId', masterfolderId);
        
        let category = searchParams.get('category');
        if (!category && pathname.startsWith('/categories/')) {
          const rawCategory = pathname.split('/')[2];
          category = rawCategory.charAt(0).toUpperCase() + rawCategory.slice(1);
        }
        if (scope === 'category' && category && category !== 'All files') params.set('categories', category);
        
        const folder = searchParams.get('folder');
        if (scope === 'folder') {
          if (folder) params.set('folder', folder);
          if (category && category !== 'All files') params.set('categories', category);
        }
        if (fileType) params.set('fileType', fileType);
        if (matchCase) params.set('matchCase', 'true');
        if (exact) params.set('exact', 'true');

        if (dateFilter === '7days') {
          const d = new Date(); d.setDate(d.getDate() - 7);
          params.set('from', d.toISOString());
        } else if (dateFilter === '30days') {
          const d = new Date(); d.setDate(d.getDate() - 30);
          params.set('from', d.toISOString());
        } else if (dateFilter === 'custom') {
          if (customFrom) params.set('from', new Date(customFrom).toISOString());
          if (customTo) params.set('to', new Date(customTo).toISOString());
        }
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
    }, 400);
    return () => clearTimeout(id);
  }, [query, scope, fileType, matchCase, exact, masterfolderId, folderParam, dateFilter, customFrom, customTo]);



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
    if (file.masterfolder_id) params.set('masterfolderId', String(file.masterfolder_id));
    if (file.fy_id) params.set('fyId', String(file.fy_id));
    if (file.category) params.set('category', file.category);
    
    if (file.type === 'folder') {
       // If it's a folder result, the "folder" we navigate to should be its full path or just the name if root
       const targetFolder = file.folder ? `${file.folder}/${file.original_name}` : file.original_name;
       params.set('folder', targetFolder);
    } else if (file.type === 'category') {
       params.delete('folder');
    } else {
       if (file.folder) params.set('folder', file.folder);
       params.set('focusFileId', String(file.id));
       if (openPreview) params.set('openFileId', String(file.id));
       else params.delete('openFileId');
    }
    
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

          {/* Masterfolder Dropdown — hidden on mobile, visible on md+ */}
          <div className="hidden md:flex items-center gap-2">
            <div className="relative">
              <button
                onClick={() => setIsmasterfolderOpen(!ismasterfolderOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--bg-surface)] hover:bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[8px] text-[13px] font-medium text-[var(--text-secondary)] transition-colors min-w-[140px] justify-between cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--accent)]/20"
              >
                <span className="truncate">{masterfolders.find(c => String(c.id) === masterfolderId)?.name || 'Loading...'}</span>
                <span className="text-[9px] text-[var(--text-tertiary)] opacity-60 ml-1">▼</span>
              </button>
              {ismasterfolderOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setIsmasterfolderOpen(false)} />
                  <div className="absolute top-[calc(100%+4px)] left-0 w-[240px] rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] z-50 py-1 max-h-[300px] overflow-y-auto">
                    {masterfolders.length === 0 ? (
                      <div className="px-3 py-2 text-[12px] text-[var(--text-tertiary)]">No masterfolders available</div>
                    ) : (
                      masterfolders.map((c) => (
                        <button
                          key={c.id}
                          onClick={() => handlemasterfolderChange(String(c.id))}
                          className={`w-full text-left px-3 py-2 text-[13px] hover:bg-[var(--bg-neutral)] transition-colors ${masterfolderId === String(c.id) ? 'bg-[var(--accent-soft)] text-[var(--accent)] font-semibold' : 'text-[var(--text-primary)]'}`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="truncate">{c.name}</span>
                          </div>
                        </button>
                      ))
                    )}
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
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors p-1"
                title="Clear search"
              >
                <X size={14} />
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
                    <button onClick={() => goTo('/admin/masterfolders')} className="w-full text-left px-4 py-2.5 text-[13px] text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-colors">Masterfolders</button>
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
                ['all_masterfolders', 'All masterfolders'],
                ['category', 'This category only'],
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
                  ['folders', 'Folders'],
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
                <div className="w-[1px] h-[24px] bg-[var(--border-subtle)] mx-1" />
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

                {/* Date Filters */}
                <div className="w-full mt-2 flex items-center gap-2 flex-wrap">
                  <span className="text-[11px] text-[var(--text-tertiary)] mr-1 flex items-center gap-1"><Calendar size={12}/> Date:</span>
                  {[
                    ['', 'Any time'],
                    ['7days', 'Last 7 days'],
                    ['30days', 'Last 30 days'],
                    ['custom', 'Custom Range']
                  ].map(([key, label]) => (
                    <button
                      key={key}
                      onClick={() => setDateFilter(key)}
                      className={`text-[11px] px-2.5 py-1.5 rounded-[10px] border transition-colors ${
                        dateFilter === key
                          ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]'
                          : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                  
                  {dateFilter === 'custom' && (
                    <div className="flex items-center gap-1 ml-2 bg-[var(--bg-elevated)] border border-[var(--border-subtle)] rounded-[8px] px-2 py-1">
                      <input 
                        type="date" 
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="bg-transparent text-[11px] text-[var(--text-secondary)] outline-none"
                      />
                      <span className="text-[10px] text-[var(--text-tertiary)]">to</span>
                      <input 
                        type="date" 
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="bg-transparent text-[11px] text-[var(--text-secondary)] outline-none"
                      />
                    </div>
                  )}
                </div>
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
                    <div className="flex items-center gap-3">
                      {file.type === 'folder' ? <Folder size={16} className="text-[#007aff]" /> : <FileText size={16} className="text-[var(--text-tertiary)]" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-[13px] font-semibold text-[var(--text-primary)] truncate">
                          {file.user_alias || file.custom_name || file.original_name}
                        </p>
                        <div className="mt-1 text-[11px] text-[var(--text-tertiary)] flex flex-wrap items-center gap-1">
                          <span>{file.masterfolder_name || '-'}</span><span>›</span><span>{file.category || '-'}</span>
                          {file.folder && (<><span>›</span><span>{file.folder}</span></>)}
                        </div>
                      </div>
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
