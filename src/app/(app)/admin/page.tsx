'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  HardDrive, Activity, Users, AlertCircle, Building, Clock,
  Folder, ChevronRight, RefreshCw, ExternalLink, Database, Layers
} from 'lucide-react';
import { apiUrl } from '@/lib/api';

function AdminDashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const masterfolderId = searchParams.get('masterfolderId');
  const dummyNull = searchParams.get('null');

  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthorized, setIsAuthorized] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { router.push('/'); return; }
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      if (p.role !== 'Admin') router.push('/');
      else setIsAuthorized(true);
    } catch (e) { router.push('/'); }
  }, [router]);

  const fetchDashboard = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (masterfolderId) params.set('masterfolderId', masterfolderId);
      const url = apiUrl(`/api/admin/dashboard${params.toString() ? '?' + params.toString() : ''}`);
      const res = await fetch(url, {
        headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, masterfolderId]);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Navigate to sub-admin pages
  const navTo = (path: string) => {
    router.push(path);
  };

  if (!isAuthorized || loading || !data) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--text-primary)]">Admin Dashboard</h1>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          {[1, 2, 3, 4].map(i => <div key={i} className="bg-[var(--bg-neutral)] rounded-[22px] h-[140px] animate-pulse"></div>)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map(i => <div key={i} className="bg-[var(--bg-neutral)] rounded-[22px] h-[300px] animate-pulse"></div>)}
        </div>
      </div>
    );
  }

  if (!data.system_health) {
    return (
      <div className="p-8 max-w-[1200px] mx-auto min-h-screen flex flex-col items-center justify-center gap-4">
        <p className="text-[var(--text-secondary)] text-[15px]">Backend returned unexpected data. Try restarting the server and refreshing.</p>
        <button onClick={fetchDashboard} className="px-4 py-2 bg-[var(--accent)] text-white rounded-[10px] font-semibold text-[14px]">Retry</button>
      </div>
    );
  }

  const { system_health, categories, active_users, duplicates, recent_audit, company_fy_overview } = data;
  const masterfolder_fy_overview = company_fy_overview || [];
  const s = system_health.server_storage;
  const storageDevices: any[] = Array.isArray(system_health.storage_devices) ? system_health.storage_devices : [];
  const masterfolderStorage = system_health.masterfolder_storage;
  const filterLabel = masterfolderId
    ? masterfolder_fy_overview.find((r: any) => String(r.masterfolder_id) === String(masterfolderId))
    : null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen pb-20 space-y-6 md:space-y-8">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-bold tracking-tight text-[var(--text-primary)]">Admin Dashboard</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={fetchDashboard}
            className="flex items-center gap-2 px-3 py-2 rounded-[10px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-all"
          >
            <RefreshCw size={14} /> Refresh
          </button>
          <span className="bg-[#34c75915] text-[#34c759] px-3 py-1 rounded-full text-[13px] font-bold flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-[#34c759] animate-pulse"></div>
            {system_health.status}
          </span>
        </div>
      </div>

      {/* Quick Nav Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Users & Roles', path: '/admin/users', icon: Users, desc: 'Manage accounts & permissions' },
          { label: 'Masterfolders', path: '/admin/masterfolders', icon: Building, desc: 'Manage masterfolder structure' },
          { label: 'Backups & Restore', path: '/admin/backups', icon: Database, desc: 'Review snapshots and restore by date' },
          { label: 'Categories & Folders', path: '/admin/structure', icon: Layers, desc: 'Create and manage vault structure' },
          { label: 'Full Audit Log', path: '/audit', icon: Activity, desc: 'View complete system activity log' },
        ].map(item => (
          <button
            key={item.path}
            onClick={() => navTo(item.path)}
            className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 text-left hover:border-[var(--accent)] hover:shadow-md transition-all group"
          >
            <div className="flex items-start justify-between mb-3">
              <item.icon size={20} className="text-[var(--accent)]" />
              <ExternalLink size={14} className="text-[var(--text-tertiary)] group-hover:text-[var(--accent)] transition-colors" />
            </div>
            <div className="font-bold text-[14px] text-[var(--text-primary)]">{item.label}</div>
            <div className="text-[12px] text-[var(--text-tertiary)] mt-1">{item.desc}</div>
          </button>
        ))}
      </div>

      {/* System Health Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[22px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Total Storage</span>
            <HardDrive size={16} className="text-[var(--accent)]" />
          </div>
          <div className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">{formatBytes(s.total_size)}</div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{s.total_files} files across all vaults</p>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[22px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Cloud / Local</span>
            <HardDrive size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="flex gap-4 mb-3">
            <div>
              <div className="text-[16px] font-bold text-[var(--text-primary)]">{formatBytes(s.minio_size)}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">Cloud</div>
            </div>
            <div>
              <div className="text-[16px] font-bold text-[var(--text-primary)]">{formatBytes(s.local_size)}</div>
              <div className="text-[11px] text-[var(--text-secondary)]">Local Drive</div>
            </div>
          </div>
          <div className="w-full bg-[var(--bg-neutral)] h-1.5 rounded-full overflow-hidden flex">
            <div className="bg-[var(--accent)] h-full" style={{ width: s.total_size > 0 ? `${(s.minio_size / s.total_size) * 100}%` : '0%' }}></div>
            <div className="bg-[#ff9500] h-full" style={{ width: s.total_size > 0 ? `${(s.local_size / s.total_size) * 100}%` : '0%' }}></div>
          </div>
        </div>

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[22px] p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Drive Usage</span>
            <Activity size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">{system_health.drive_usage}</div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Last backup: {new Date(system_health.last_backup_time).toLocaleDateString()}</p>
        </div>

        <div
          className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[22px] p-6 shadow-sm cursor-pointer hover:border-[#ff9500]/50 transition-all"
          onClick={() => navTo('/admin/duplicates')}
        >
          <div className="flex items-center justify-between mb-4">
            <span className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Duplicates</span>
            <AlertCircle size={16} className={duplicates.wasted_size > 0 ? "text-[#ff9500]" : "text-[#34c759]"} />
          </div>
          <div className="text-[28px] font-bold tracking-tight text-[var(--text-primary)]">{formatBytes(duplicates.wasted_size)}</div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">{duplicates.pairs} duplicate pairs → <span className="text-[var(--accent)]">Scan</span></p>
        </div>
      </div>

      {masterfolderStorage && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">masterfolder Storage Allocation</p>
              <p className="text-[16px] font-semibold text-[var(--text-primary)] mt-1">
                {masterfolderStorage.masterfolder_name}
                {masterfolderStorage.scoped_to_fy ? ' (selected FY)' : ''}
              </p>
            </div>
            <div className="text-right">
              <p className="text-[20px] font-bold text-[var(--text-primary)]">{formatBytes(masterfolderStorage.used_bytes)}</p>
              <p className="text-[12px] text-[var(--text-secondary)]">
                {masterfolderStorage.quota_gb > 0
                  ? `${masterfolderStorage.usage_percent}% of ${masterfolderStorage.quota_gb} GB quota`
                  : 'No quota configured'}
              </p>
            </div>
          </div>
        </div>
      )}

      {storageDevices.length > 0 && (
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] p-6 shadow-sm">
          <div className="flex items-center gap-3 mb-5">
            <HardDrive size={18} className="text-[var(--text-primary)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Live Storage Devices</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {storageDevices.map((d, idx) => (
              <div key={`${d.path}-${idx}`} className="rounded-[14px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-neutral)]/40">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)]">{d.label}</p>
                  <span className="text-[11px] text-[var(--text-tertiary)]">{d.used_percent === null ? 'N/A' : `${d.used_percent}%`}</span>
                </div>
                <p className="text-[11px] text-[var(--text-tertiary)] mt-1 break-all">{d.path}</p>
                <div className="mt-3 h-1.5 rounded-full bg-[var(--bg-elevated)] overflow-hidden">
                  <div
                    className={`h-full ${d.used_percent !== null && d.used_percent > 85 ? 'bg-[#ff5b52]' : 'bg-[var(--accent)]'}`}
                    style={{ width: `${Math.max(0, Math.min(100, Number(d.used_percent || 0)))}%` }}
                  />
                </div>
                <div className="mt-2 text-[12px] text-[var(--text-secondary)]">
                  {d.unavailable
                    ? 'Path unavailable on server'
                    : `${formatBytes(d.used_bytes)} used / ${formatBytes(d.total_bytes)} total`}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Categories Overview */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] p-6 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <Folder size={18} className="text-[var(--text-primary)]" />
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Categories Overview</h2>
          {masterfolderId && <span className="ml-auto text-[12px] text-[var(--text-tertiary)]">Filtered by selected masterfolder & FY</span>}
        </div>
        {categories.length === 0 ? (
          <p className="text-[13px] text-[var(--text-tertiary)] italic">No category data for the selected filter.</p>
        ) : (
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {categories.map((d: any) => (
              <button
                key={d.category}
                onClick={() => router.push(`/?${new URLSearchParams({ masterfolderId: masterfolderId||'', category: d.category }).toString()}`)}
                className="bg-[var(--bg-neutral)]/50 rounded-[14px] p-4 border border-[var(--border-subtle)] text-left hover:border-[var(--accent)]/40 hover:shadow-sm transition-all group"
              >
                <h3 className="font-bold text-[14px] text-[var(--text-primary)] mb-2 group-hover:text-[var(--accent)] transition-colors">{d.category}</h3>
                <div className="flex justify-between text-[12px] text-[var(--text-secondary)]">
                  <span>{d.total_files} files</span>
                  <span className="font-semibold text-[var(--text-primary)]">{formatBytes(d.total_size)}</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] overflow-hidden shadow-sm flex flex-col md:col-span-2">
          <div className="p-6 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-[var(--bg-neutral)]/50">
            <Building size={18} className="text-[var(--text-primary)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Masterfolder Overview</h2>
            <button onClick={() => navTo('/admin/masterfolders')} className="ml-auto text-[12px] text-[var(--accent)] font-semibold hover:underline flex items-center gap-1">
              Manage <ChevronRight size={12} />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[350px]">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[var(--bg-neutral)]/30 text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
                  <th className="px-6 py-4 font-semibold">Entity / Period</th>
                  <th className="px-6 py-4 font-semibold text-right">Statistics</th>
                  <th className="px-6 py-4 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="text-[14px]">
                {masterfolder_fy_overview.length === 0 ? (
                  <tr><td colSpan={3} className="p-6 text-center text-[var(--text-tertiary)] italic">No data available</td></tr>
                ) : masterfolder_fy_overview.map((row: any, i: number) => {
                  const isSelected = String(row.masterfolder_id) === String(masterfolderId);
                  return (
                    <tr
                      key={i}
                      className={`border-b border-[var(--border-subtle)] transition-colors group ${isSelected ? 'bg-[var(--accent-soft)]/50' : 'hover:bg-[var(--bg-neutral)]/30'}`}
                    >
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className={`font-bold ${isSelected ? 'text-[var(--accent)]' : 'text-[var(--text-primary)]'}`}>{row.masterfolder_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex flex-col items-end">
                          <span className="font-bold text-[var(--text-primary)]">{row.total_files} files</span>
                          <span className="text-[12px] text-[var(--text-tertiary)]">{formatBytes(row.total_size)} used</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => router.push(`/admin?masterfolderId=${row.masterfolder_id}&null=${row.fy_id}`)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--bg-neutral)] text-[12px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all border border-[var(--border-subtle)]"
                          >
                            Filter Admin
                          </button>
                          <button 
                            onClick={() => router.push(`/?masterfolderId=${row.masterfolder_id}&null=${row.fy_id}`)}
                            className="px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-[12px] font-bold hover:opacity-90 shadow-sm transition-all"
                          >
                            Go to Vault
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Active Users */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] overflow-hidden shadow-sm flex flex-col">
          <div className="p-6 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-[var(--bg-neutral)]/50">
            <Users size={18} className="text-[var(--text-primary)]" />
            <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Active Users</h2>
            <button onClick={() => navTo('/admin/users')} className="ml-auto text-[12px] text-[var(--accent)] font-semibold hover:underline flex items-center gap-1">
              Manage <ChevronRight size={12} />
            </button>
          </div>
          <div className="overflow-y-auto max-h-[350px] p-2">
            {active_users.length === 0 ? (
              <p className="p-4 text-center text-[var(--text-tertiary)] italic">No active users</p>
            ) : active_users.map((u: any) => (
              <div key={u.id} className="p-3 rounded-[12px] hover:bg-[var(--bg-neutral)]/50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--accent)]/10 text-[var(--accent)] flex items-center justify-center font-bold text-[12px]">
                    {u.username.substring(0, 2).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium text-[14px] text-[var(--text-primary)]">{u.username}</div>
                    {u.category && <div className="text-[11px] text-[var(--text-tertiary)]">{u.category}</div>}
                  </div>
                </div>
                <span className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase bg-[var(--bg-neutral)] px-2 py-0.5 rounded-md">{u.role}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Audit Logs */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[24px] overflow-hidden shadow-sm">
        <div className="p-6 border-b border-[var(--border-subtle)] flex items-center gap-3 bg-[var(--bg-neutral)]/50">
          <Clock size={18} className="text-[var(--text-primary)]" />
          <h2 className="text-[16px] font-bold text-[var(--text-primary)]">Recent Audit Entries</h2>
          {masterfolderId && <span className="text-[12px] text-[var(--text-tertiary)]">— filtered by selected masterfolder & FY</span>}
          <button onClick={() => navTo('/audit')} className="ml-auto text-[12px] text-[var(--accent)] font-semibold hover:underline flex items-center gap-1">
            View All <ChevronRight size={12} />
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[var(--bg-neutral)]/30 text-[12px] uppercase tracking-wider text-[var(--text-tertiary)] border-b border-[var(--border-subtle)]">
                <th className="px-6 py-3 font-semibold">User</th>
                <th className="px-6 py-3 font-semibold">Action</th>
                <th className="px-6 py-3 font-semibold">Details</th>
                <th className="px-6 py-3 font-semibold text-right whitespace-nowrap">Time</th>
              </tr>
            </thead>
            <tbody className="text-[13px]">
              {recent_audit.length === 0 ? (
                <tr><td colSpan={4} className="p-6 text-center text-[var(--text-tertiary)] italic">No recent activity</td></tr>
              ) : recent_audit.map((log: any) => (
                <tr key={log.id} className="border-b border-[var(--border-subtle)] hover:bg-[var(--bg-neutral)]/30 transition-colors">
                  <td className="px-6 py-3 font-medium text-[var(--text-primary)] whitespace-nowrap">{log.username || 'System'}</td>
                  <td className="px-6 py-3">
                    <span className="bg-[var(--bg-neutral)] px-2 py-1 rounded-md text-[11px] font-bold text-[var(--text-secondary)] uppercase">{log.action_type}</span>
                  </td>
                  <td className="px-6 py-3 text-[var(--text-secondary)] truncate max-w-[260px]">{log.details}</td>
                  <td className="px-6 py-3 text-right text-[var(--text-tertiary)] whitespace-nowrap">{new Date(log.created_at).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}

export default function AdminDashboardPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AdminDashboardContent />
    </Suspense>
  );
}
