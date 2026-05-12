'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Database, RefreshCw, RotateCcw, ShieldAlert, Sparkles } from 'lucide-react';
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

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

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
    setMessage(null);
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
      const res = await fetch(apiUrl('/api/admin/backups/config'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) setConfig(data);
    } catch {
      // Non-blocking; backups list still works.
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
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/backups/${selectedId}/preview`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load backup preview');
      setPreview(data);
    } catch (error: any) {
      setMessage(error.message || 'Failed to load preview');
    } finally {
      setPreviewLoading(false);
    }
  }, [token, selectedId]);

  useEffect(() => {
    setPreview(null);
    if (selectedId) fetchPreview();
  }, [selectedId, fetchPreview]);

  const createManualBackup = async () => {
    if (!token) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/admin/backups'), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create backup');
      await fetchBackups();
      setSelectedId(data.backup?.backup_id || null);
      setMessage(`Backup created: ${data.backup?.backup_id}`);
    } catch (error: any) {
      setMessage(error.message || 'Failed to create backup');
    } finally {
      setBusy(false);
    }
  };

  const restoreSelected = async () => {
    if (!token || !selectedId) return;
    const ok = await confirm({
      title: 'Restore backup',
      message: `Restore backup ${selectedId}? This will overwrite current records to match that snapshot.`,
      confirmText: 'Restore',
      destructive: true,
    });
    if (!ok) return;

    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/backups/${selectedId}/restore`), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to restore backup');
      setMessage(`Backup restored: ${selectedId}`);
      await fetchPreview();
      await fetchBackups();
    } catch (error: any) {
      setMessage(error.message || 'Failed to restore backup');
    } finally {
      setBusy(false);
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
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Manage 2:00 AM snapshots and roll back by date with a change preview.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchBackups}
            className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <button
            disabled={busy}
            onClick={createManualBackup}
            className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"
          >
            <Database size={14} /> Backup Now
          </button>
        </div>
      </div>

      {message && <div className="px-4 py-3 rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px]">{message}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] overflow-hidden lg:col-span-1">
          <div className="px-5 py-4 border-b border-[var(--border-subtle)] font-semibold text-[14px]">Available Backups</div>
          <div className="max-h-[520px] overflow-y-auto">
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

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] p-5 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Restore Preview</h2>
            <button
              disabled={!selectedId || busy || previewLoading}
              onClick={restoreSelected}
              className="px-3 py-2 rounded-[10px] bg-[#ff5b52] text-white text-[13px] font-bold disabled:opacity-60 flex items-center gap-2"
            >
              <RotateCcw size={14} /> Restore Selected Backup
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
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Files In Backup</div>
                  <div className="text-[20px] font-bold mt-1">{preview.changes.files_in_backup}</div>
                </div>
                <div className="rounded-[12px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-neutral)]/40">
                  <div className="text-[11px] uppercase tracking-wider text-[var(--text-tertiary)]">Current Files</div>
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
                  <div className="font-semibold">Restore scope</div>
                  <div className="text-[12px] mt-1 text-[var(--text-secondary)]">
                    This restore syncs database records, MinIO objects, and local media files from the selected backup folder.
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-4 text-[12px] text-[var(--text-secondary)] flex items-start gap-2">
        <Sparkles size={15} className="mt-0.5 text-[var(--accent)]" />
        <div>
          <div>Scheduled backups run at 2:00 AM server time (configurable with `BACKUP_CRON`).</div>
          {config && (
            <div className="mt-1 text-[11px] text-[var(--text-tertiary)]">
              Path: {config.backup_storage_path} | Cron: {config.backup_cron} | Retention: {config.backup_retention_days} days
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
