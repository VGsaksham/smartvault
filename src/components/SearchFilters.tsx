'use client';

import { useEffect, useMemo, useState } from 'react';
import { Settings2 } from 'lucide-react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';

export default function SearchFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isSearchInOpen, setIsSearchInOpen] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [options, setOptions] = useState<{categories:string[];masterfolders:string[];uploadedBy:string[];tags:string[];hddLocations:string[]}>({
    categories: [], masterfolders: [], uploadedBy: [], tags: [], hddLocations: []
  });

  const activeFilter = searchParams.get('fileType') || searchParams.get('type') || '';
  const rawScope = searchParams.get('scope') || 'fy';
  const activeScope = (rawScope === 'all' || rawScope === 'masterfolder') ? 'fy' : rawScope;
  const folder = searchParams.get('folder') || '';
  const currentFyName = searchParams.get('fyLabel') || 'This FY';

  useEffect(() => {
    if (rawScope === 'all' || rawScope === 'masterfolder') {
      const params = new URLSearchParams(searchParams);
      params.set('scope', 'fy');
      router.replace(`${pathname}?${params.toString()}`);
    }
  }, [rawScope, pathname, router, searchParams]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    fetch(apiUrl('/api/search/options'), { headers: { Authorization: `Bearer ${token}` } })
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        setOptions({
          categories: data.categories || [],
          masterfolders: data.masterfolders || [],
          uploadedBy: data.uploadedBy || [],
          tags: data.tags || [],
          hddLocations: data.hddLocations || []
        });
      })
      .catch(() => {});
  }, []);

  const setParam = (key: string, value?: string) => {
    const params = new URLSearchParams(searchParams);
    if (!value) params.delete(key);
    else params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`);
  };

  const setFilter = (filter: string) => setParam('fileType', filter === activeFilter ? '' : filter);

  const toggleMulti = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams);
    const values = (params.get(key) || '').split(',').filter(Boolean);
    const next = values.includes(value) ? values.filter(v => v !== value) : [...values, value];
    if (next.length === 0) params.delete(key);
    else params.set(key, next.join(','));
    router.replace(`${pathname}?${params.toString()}`);
  };

  const setMultiFromSelect = (key: string, values: string[]) => {
    const params = new URLSearchParams(searchParams);
    if (values.length === 0) params.delete(key);
    else params.set(key, values.join(','));
    router.replace(`${pathname}?${params.toString()}`);
  };

  const applyQuickDate = (preset: 'today' | 'week' | 'month' | 'fy') => {
    const params = new URLSearchParams(searchParams);
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    if (preset === 'today') {
      params.set('from', fmt(now));
      params.set('to', fmt(now));
    } else if (preset === 'week') {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      params.set('from', fmt(from));
      params.set('to', fmt(now));
    } else if (preset === 'month') {
      const from = new Date(now.getFullYear(), now.getMonth(), 1);
      params.set('from', fmt(from));
      params.set('to', fmt(now));
    } else if (preset === 'fy') {
      const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
      params.set('from', `${year}-04-01`);
      params.set('to', `${year + 1}-03-31`);
    }
    router.replace(`${pathname}?${params.toString()}`);
  };

  const filters = ['docs', 'video', 'audio', 'images', 'design'];
  const scopeLabel = useMemo(() => ({
    fy: 'This FY only',
    category: 'This category only',
    folder: folder ? `This folder: ${folder}` : 'This folder only'
  }[activeScope] || 'This FY only'), [activeScope, folder]);
  const selected = (key: string) => (searchParams.get(key) || '').split(',').filter(Boolean);

  return (
    <div className="sticky top-0 z-20 bg-[var(--bg-app)]/85 backdrop-blur-md border-b border-[var(--border-subtle)] px-3 sm:px-4 md:px-10 py-3 flex flex-col gap-3">
      <div className="flex items-center gap-4 overflow-x-auto no-scrollbar">
      {/* Search In Dropdown */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest">Search In</span>
        <div className="relative">
          <button
            onClick={() => setIsSearchInOpen(!isSearchInOpen)}
            className="flex items-center justify-between min-w-[170px] bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[14px] tracking-[-0.224px] rounded-[11px] border border-[var(--border-subtle)] h-[32px] pl-[14px] pr-[12px] cursor-pointer outline-none focus:border-[var(--accent)] transition-colors font-medium"
          >
            {scopeLabel}
            <div className={`ml-2 text-[var(--text-tertiary)] text-[10px] transition-transform duration-200 ${isSearchInOpen ? 'rotate-180' : ''}`}>▼</div>
          </button>
          
          {isSearchInOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setIsSearchInOpen(false)}></div>
              <div className="absolute top-[calc(100%+4px)] left-0 min-w-[170px] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-medium)] rounded-[11px] overflow-hidden z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-200">
                {[
                  ['fy', currentFyName],
                  ['category', 'This category only'],
                  ['folder', 'This folder only']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => {
                      setParam('scope', value);
                      setIsSearchInOpen(false);
                    }}
                    className={`w-full text-left px-[14px] py-[6px] text-[14px] tracking-[-0.224px] transition-colors hover:bg-[var(--bg-neutral)] ${activeScope === value ? 'text-[var(--accent)] font-medium bg-[var(--accent-soft)] hover:bg-[var(--accent-soft)]' : 'text-[var(--text-primary)]'}`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="w-px h-[24px] bg-[var(--border-subtle)] shrink-0 mx-2"></div>

      {/* File Type Toggles */}
      <div className="flex items-center gap-3 shrink-0">
        <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mr-1">Type</span>
        
        {filters.map((filter) => (
          <button
            key={filter}
            onClick={() => setFilter(filter)}
            className={`flex items-center justify-center h-[32px] px-[16px] rounded-[11px] text-[14px] tracking-[-0.224px] font-medium cursor-pointer outline-none transition-all shrink-0 ${
              activeFilter === filter
                ? 'bg-[var(--text-primary)] text-[var(--bg-app)] hover:scale-[0.98]'
                : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border border-[var(--border-subtle)] hover:border-[var(--border-default)]'
            }`}
          >
            {filter[0].toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      <div className="w-px h-[24px] bg-[var(--border-subtle)] shrink-0 mx-2"></div>

      {/* Match Case Toggle */}
      <button onClick={() => setParam('matchCase', searchParams.get('matchCase') === 'true' ? '' : 'true')} className={`flex items-center gap-2 border h-[32px] px-[14px] rounded-[11px] text-[14px] tracking-[-0.224px] font-medium cursor-pointer outline-none transition-colors shrink-0 ${searchParams.get('matchCase') === 'true' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'}`}>
        <Settings2 size={14} />
        Match case
      </button>
      <button onClick={() => setParam('exact', searchParams.get('exact') === 'true' ? '' : 'true')} className={`flex items-center gap-2 border h-[32px] px-[14px] rounded-[11px] text-[14px] tracking-[-0.224px] font-medium cursor-pointer outline-none transition-colors shrink-0 ${searchParams.get('exact') === 'true' ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] border-[var(--border-subtle)] hover:border-[var(--border-default)]'}`}>
        Exact file name
      </button>
      <button onClick={() => setShowAdvanced(v => !v)} className="ml-auto shrink-0 bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-[12px] font-semibold px-[12px] py-[6px] rounded-[8px] border border-[var(--border-subtle)] hover:border-[var(--accent)] transition-colors uppercase tracking-wider">
        {showAdvanced ? 'Hide filters' : 'More filters'}
      </button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="bg-[var(--bg-elevated)] rounded-[12px] border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Date range</p>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" value={searchParams.get('from') || ''} onChange={(e) => setParam('from', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px]" />
              <input type="date" value={searchParams.get('to') || ''} onChange={(e) => setParam('to', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px]" />
            </div>
            <div className="flex flex-wrap gap-2">
              {['today','week','month'].map(preset => (
                <button key={preset} onClick={() => applyQuickDate(preset as any)} className="text-[11px] px-2 py-1 rounded-[8px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:border-[var(--accent)]">
                  {preset[0].toUpperCase() + preset.slice(1)}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input type="number" placeholder="Year" value={searchParams.get('year') || ''} onChange={(e) => setParam('year', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px]" />
              <input type="number" placeholder="Month" value={searchParams.get('month') || ''} onChange={(e) => setParam('month', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px]" />
              <input type="number" placeholder="Day" value={searchParams.get('day') || ''} onChange={(e) => setParam('day', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px]" />
            </div>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-[12px] border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Scope & people</p>
            <select multiple value={selected('uploadedBy')} onChange={(e) => setMultiFromSelect('uploadedBy', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.uploadedBy.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-[12px] border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Metadata filters</p>
            <select multiple value={selected('categories')} onChange={(e) => setMultiFromSelect('categories', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.categories.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select multiple value={selected('masterfolders')} onChange={(e) => setMultiFromSelect('masterfolders', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.masterfolders.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select multiple value={selected('masterfolders')} onChange={(e) => setMultiFromSelect('masterfolders', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.masterfolders.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>

          <div className="bg-[var(--bg-elevated)] rounded-[12px] border border-[var(--border-subtle)] p-3 flex flex-col gap-2">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Content & storage</p>
            <input placeholder="Specific extension e.g. xlsx" value={searchParams.get('extension') || ''} onChange={(e) => setParam('extension', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-3 py-2 text-[13px]" />
            <input placeholder="Text inside file / OCR" value={searchParams.get('textInside') || ''} onChange={(e) => setParam('textInside', e.target.value)} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-3 py-2 text-[13px]" />
            <select multiple value={selected('tags')} onChange={(e) => setMultiFromSelect('tags', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.tags.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
            <select multiple value={selected('hddLocation')} onChange={(e) => setMultiFromSelect('hddLocation', Array.from(e.currentTarget.selectedOptions).map(opt => opt.value))} className="bg-[var(--bg-surface)] rounded-[8px] border border-[var(--border-subtle)] px-2 py-2 text-[13px] min-h-[76px]">
              {options.hddLocations.map(v => <option key={v} value={v}>{v}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  );
}
