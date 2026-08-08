
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, RefreshCw, RotateCcw, ShieldAlert, Sparkles, Settings } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';

type BackupItem = {
  backup_id: string;
  filename: string;
  size_bytes: number;
  created_at: string;
};

type PreviewResponse = {
  backup_id: string;
  created_at: string;
  reason: string | null;
  changes: {
    files_in_backup: number;
    files_current: number;
    files_to_add: number;
    files_to_remove: number;
    files_renamed: number;
    files_moved: number;
    files_updated: number;
  };
};

type BackupConfig = {
  backup_storage_path: string;
  backup_cron: string;
  backup_retention_days: number;
  enabled?: boolean;
  interval?: string;
};

const fmtBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let idx = 0;
  while (value >= 1024 && idx < units.length - 1) {
    value /= 1024;
    idx += 1;
  }
  return `${value.toFixed(value >= 100 ? 0 : 1)} ${units[idx]}`;
};

export default function AdminBackupsPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [list, setList] = useState<BackupItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [config, setConfig] = useState<BackupConfig | null>(null);

  // Granular Filters
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const [filters, setFilters] = useState({ masterfolder_id: '', category: '', folder: '' });
  const [masterfolders, setMasterfolders] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  
  // Fetch masterfolders
  useEffect(() => {
    if (!isAuthorized) return;
    fetch(apiUrl('/api/masterfolders'), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) setMasterfolders(data);
      })
      .catch(() => {});
  }, [isAuthorized, token]);


  const availableFolders = useMemo(() => {
    if (!filters.category) return [];
    const cat = categories.find((c: any) => c.name === filters.category);
    if (!cat || !cat.folders) return [];
    const flat = cat.folders;
    const paths: string[] = [];
    
    const getPath = (folder: any) => {
      let pathStr = folder.name;
      let curr = folder;
      while (curr.parent_folder_id) {
        const parent = flat.find((f: any) => f.id === curr.parent_folder_id);
        if (!parent) break;
        pathStr = parent.name + '/' + pathStr;
        curr = parent;
      }
      return pathStr;
    };

    flat.forEach((f: any) => paths.push(getPath(f)));
    return paths.sort();
  }, [categories, filters.category]);

  // Fetch categories when masterfolder changes
  useEffect(() => {
    if (!filters.masterfolder_id || !isAuthorized) {
      setCategories([]);
      return;
    }
    fetch(apiUrl(`/api/admin/structure?masterfolderId=${filters.masterfolder_id}`), { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => {
        if (data.categories && Array.isArray(data.categories)) {
          setCategories(data.categories);
        } else if (Array.isArray(data)) {
          setCategories(data);
        }
      })
      .catch(() => {});
  }, [filters.masterfolder_id, isAuthorized, token]);
  
  // Job Tracking
  const [activeJob, setActiveJob] = useState<any>(null);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/');
      return;
    }
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.role !== 'Admin') {
        router.push('/');
        return;
      }
      setIsAuthorized(true);
    } catch {
      router.push('/');
    }
  }, [router]);

  const fetchBackups = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl('/api/admin/backups'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load backups');
      setList(data);
      if (data.length > 0 && !selectedId) setSelectedId(data[0].backup_id);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load backups');
    } finally {
      setLoading(false);
    }
  }, [token, selectedId]);

  const fetchConfig = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/admin/backups/config?t=' + Date.now()), {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store'
      });
      const data = await res.json();
      if (res.ok) setConfig(data);
      else setMessage("API returned error: " + data.error);
    } catch (e: any) {
      setMessage("Config fetch error: " + e.message);
    }
  }, [token]);

  useEffect(() => {
    if (!isAuthorized) return;
    fetchBackups();
    fetchConfig();
  }, [isAuthorized, fetchBackups, fetchConfig]);

  const fetchPreview = useCallback(async () => {
    if (!token || !selectedId) return;
    setPreviewLoading(true);
    try {
      const res = await fetch(apiUrl(`/api/admin/backups/preview`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: selectedId, filters: cleanFilters() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load backup preview');
      setPreview(data.preview);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [token, selectedId, filters]);

  useEffect(() => {
    setPreview(null);
    if (selectedId) fetchPreview();
  }, [selectedId, fetchPreview]);

  const cleanFilters = () => {
    const f: any = {};
    if (filters.masterfolder_id) f.masterfolder_id = filters.masterfolder_id;
    if (filters.category) f.category = filters.category;
    if (filters.folder) f.folder = filters.folder;
    return f;
  };

  const pollJobStatus = (jobId: string, type: string) => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch(apiUrl(`/api/admin/backups/status/${jobId}`), {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) {
          setActiveJob(data.status);
          if (data.status.status === 'completed' || data.status.status === 'failed') {
            clearInterval(interval);
            setBusy(false);
            if (data.status.status === 'completed') {
              setMessage(`${type} completed successfully!`);
              if (type === 'Backup') {
                fetchBackups();
                setSelectedId(data.status.result?.backup_id);
              } else {
                fetchPreview();
                fetchBackups();
              }
            } else {
              setMessage(`${type} failed: ${data.status.error}`);
            }
            setTimeout(() => setActiveJob(null), 5000);
          }
        }
      } catch (err) {
        // ignore network errors while polling
      }
    }, 1000);
  };

  const createManualBackup = async () => {
    if (!token) return;
    setBusy(true);
    setMessage('Starting backup job...');
    setActiveJob(null);
    try {
      const res = await fetch(apiUrl('/api/admin/backups'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ filters: cleanFilters() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create backup');
      pollJobStatus(data.job_id, 'Backup');
    } catch (error: any) {
      setMessage(error.message || 'Failed to create backup');
      setBusy(false);
    }
  };

  const restoreSelected = async () => {
    if (!token || !selectedId) return;
    const ok = await confirm({
      title: 'Restore backup',
      message: `Restore backup ${selectedId}? This will overwrite current records matching the selected filters.`,
      confirmText: 'Restore',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setMessage('Starting restore job...');
    setActiveJob(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/backups/restore`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupId: selectedId, filters: cleanFilters() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to restore backup');
      pollJobStatus(data.job_id, 'Restore');
    } catch (error: any) {
      setMessage(error.message || 'Failed to restore backup');
      setBusy(false);
    }
  };

  const saveSchedule = async (enabled: boolean, interval: string) => {
    if (!token) return;
    try {
      await fetch(apiUrl('/api/admin/backup-schedule'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled, interval })
      });
      setMessage('Schedule updated successfully.');
      fetchConfig();
    } catch (err) {
      setMessage('Failed to update schedule.');
    }
  };

  const cards = useMemo(() => {
    if (!preview?.changes) return [];
    const c = preview.changes;
    return [
      { label: 'Files To Add', value: c.files_to_add, color: 'text-[#34c759]' },
      { label: 'Files To Remove', value: c.files_to_remove, color: 'text-[#ff5b52]' },
      { label: 'Renamed', value: c.files_renamed, color: 'text-[var(--accent)]' },
      { label: 'Moved', value: c.files_moved, color: 'text-[var(--text-primary)]' },
      { label: 'Updated', value: c.files_updated, color: 'text-[#ff9500]' },
    ];
  }, [preview]);

  if (!isAuthorized) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-[var(--text-primary)]">Backups & Restore</h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Manage granular snapshots, restore specific categories, and track progress.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBackups}
            className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>
      
      {/* Active Job Progress Tracker */}
      {activeJob && (
        <div className="px-5 py-4 rounded-[12px] border border-[var(--accent)] bg-[var(--accent)]/10 text-sm">
          <div className="flex justify-between font-bold text-[var(--accent)] mb-2">
            <span>{activeJob.type === 'backup' ? 'Backup' : 'Restore'} Progress ({activeJob.status})</span>
            {activeJob.eta_seconds !== null && <span>ETA: {activeJob.eta_seconds}s</span>}
          </div>
          <div className="w-full bg-[var(--bg-neutral)] rounded-full h-2.5">
            <div className="bg-[var(--accent)] h-2.5 rounded-full" style={{ width: `${Math.max(5, (activeJob.progress / (activeJob.total || 1)) * 100)}%` }}></div>
          </div>
          <div className="flex justify-between mt-2 text-xs text-[var(--text-secondary)]">
            <span>{activeJob.message}</span>
            <span>{activeJob.progress} / {activeJob.total}</span>
          </div>
        </div>
      )}

      {message && !activeJob && <div className="px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px]">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="space-y-6 lg:col-span-1">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] p-5 space-y-4">
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Granular Filter</h2>
            <p className="text-[12px] text-[var(--text-secondary)]">Narrow down what to backup or restore.</p>
            
            <select
              value={filters.masterfolder_id}
              onChange={e => {
                setFilters(f => ({ ...f, masterfolder_id: e.target.value, category: '', folder: '' }));
              }}
              className="w-full p-2.5 rounded-[10px] bg-[var(--bg-surface)] text-[14px] font-medium border border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none transition-colors"
            >
              <option value="">All / Everything</option>
              {masterfolders.map((m: any) => (
                <option key={m.id} value={m.id}>{m.name || m.title || `Masterfolder ${m.id}`}</option>
              ))}
            </select>

            <select
              disabled={!filters.masterfolder_id}
              value={filters.category}
              onChange={e => setFilters(f => ({ ...f, category: e.target.value, folder: '' }))}
              className="w-full p-2.5 rounded-[10px] bg-[var(--bg-surface)] text-[14px] font-medium border border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none disabled:opacity-50 transition-colors"
            >
              <option value="">All Categories</option>
              {categories.map((c: any) => (
                <option key={c.id || c.name} value={c.name}>{c.name}</option>
              ))}
            </select>

            <select
              disabled={!filters.category}
              value={filters.folder}
              onChange={e => setFilters(f => ({ ...f, folder: e.target.value }))}
              className="w-full p-2.5 rounded-[10px] bg-[var(--bg-surface)] text-[14px] font-medium border border-[var(--border-subtle)] focus:border-[var(--accent)] outline-none disabled:opacity-50 transition-colors"
            >
              <option value="">All Folders</option>
              {availableFolders.map((path: string) => (
                <option key={path} value={path}>{path}</option>
              ))}
            </select>

            <button
              disabled={busy}
              onClick={createManualBackup}
              className="w-full py-2.5 mt-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex justify-center items-center gap-2 disabled:opacity-60"
            >
              <Database size={15} /> Create Backup
            </button>
          </div>
        
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] overflow-hidden">
            <div className="px-5 py-4 border-b border-[var(--border-subtle)] font-semibold text-[14px]">Available Backups</div>
            <div className="max-h-[300px] overflow-y-auto">
              {loading ? (
                <div className="p-5 text-[13px] text-[var(--text-tertiary)]">Loading...</div>
              ) : list.length === 0 ? (
                <div className="p-5 text-[13px] text-[var(--text-tertiary)]">No backups found yet.</div>
              ) : (
                list.map((item) => (
                  <button
                    key={item.backup_id}
                    onClick={() => setSelectedId(item.backup_id)}
                    className={`w-full text-left px-5 py-4 border-b border-[var(--border-subtle)] hover:bg-[var(--bg-neutral)] transition-colors ${
                      selectedId === item.backup_id ? 'bg-[var(--accent-soft)]/40' : ''
                    }`}
                  >
                    <div className="text-[13px] font-semibold text-[var(--text-primary)]">{new Date(item.created_at).toLocaleString()}</div>
                    <div className="text-[12px] text-[var(--text-tertiary)] mt-1">{item.backup_id}</div>
                    <div className="text-[12px] text-[var(--text-secondary)] mt-1">{fmtBytes(item.size_bytes)}</div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Restore Preview</h2>
            <button
              disabled={!selectedId || busy || previewLoading}
              onClick={restoreSelected}
              className="px-3 py-2 rounded-[10px] bg-[#ff5b52] text-white text-[13px] font-bold disabled:opacity-60 flex items-center gap-2"
            >
              <RotateCcw size={14} /> Restore Selected Scope
            </button>
          </div>

          {!selectedId && <p className="text-[13px] text-[var(--text-tertiary)]">Select a backup from the left panel.</p>}
          {previewLoading && <p className="text-[13px] text-[var(--text-tertiary)]">Calculating changes...</p>}

          {preview && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-[12px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-neutral)]/40">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Backup Date</div>
                  <div className="text-[13px] font-semibold mt-1">{new Date(preview.created_at).toLocaleString()}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-neutral)]/40">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Files In Scope</div>
                  <div className="text-[20px] font-bold mt-1">{preview.changes.files_in_backup}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-neutral)]/40">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Current Scope Files</div>
                  <div className="text-[20px] font-bold mt-1">{preview.changes.files_current}</div>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {cards.map((card) => (
                  <div key={card.label} className="rounded-[12px] border border-[var(--border-subtle)] p-4">
                    <div className="text-[11px] text-[var(--text-tertiary)]">{card.label}</div>
                    <div className={`text-[22px] font-bold mt-1 ${card.color}`}>{card.value}</div>
                  </div>
                ))}
              </div>

              <div className="rounded-[12px] border border-[#ff9500]/30 bg-[#ff9500]/10 p-4 text-[13px] text-[var(--text-primary)] flex items-start gap-3">
                <ShieldAlert size={18} className="mt-0.5 text-[#ff9500]" />
                <div>
                  <div className="font-semibold">Restore Scope (Filtered)</div>
                  <div className="text-[12px] mt-1 text-[var(--text-secondary)]">
                    This restore will only overwrite records that match your selected Masterfolder, Category, or Folder filters on the left.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-5 space-y-4">
        <div className="flex items-center gap-2 font-bold text-[15px]"><Settings size={16} /> Auto-Backup Schedule</div>
        <p className="text-xs text-[var(--text-secondary)]">Configure automatic backups (currently configured in <code>backup_config.json</code>). Retention policies are disabled indefinitely as requested.</p>
        <div className="text-xs text-red-500 font-mono">DEBUG CONFIG: {JSON.stringify(config)}</div>
        
        <div className="flex items-center gap-4 mt-3">
          <select 
            className="p-2 bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-lg text-sm outline-none"
            onChange={(e) => saveSchedule(true, e.target.value)}
            value={config?.interval && config.interval !== 'Disabled' ? config.interval : "Daily"}
          >
            <option value="Daily">Daily (2:00 AM)</option>
            <option value="Weekly">Weekly (Sun 2:00 AM)</option>
            <option value="Monthly">Monthly (1st 2:00 AM)</option>
            <option value="Quarterly">Quarterly</option>
          </select>
          {config?.enabled ? (
            <button onClick={() => saveSchedule(false, 'Disabled')} className="px-3 py-2 rounded-lg border border-[#ff5b52] text-[#ff5b52] text-sm font-semibold hover:bg-[#ff5b52]/10 transition-colors">
              Disable Auto-Backup
            </button>
          ) : (
            <button onClick={() => saveSchedule(true, config?.interval && config.interval !== 'Disabled' ? config.interval : 'Daily')} className="px-3 py-2 rounded-lg bg-[#34c759] text-white text-sm font-semibold hover:bg-[#2fa84d] transition-colors">
              Enable Auto-Backup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
