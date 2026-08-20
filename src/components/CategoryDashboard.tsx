'use client';

import { useState, useEffect } from 'react';
import { HardDrive, Clock, AlertCircle, FileText, UploadCloud, Users, BarChart3, Database, ChevronRight, Download, Plus, Search } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import Link from 'next/link';

interface DeptStats {
  storage: {
    total_files: number;
    total_size: number;
    local_size: number;
    minio_size: number;
    quota_gb: number;
  };
  activity: any[];
  types: any[];
  top_uploaders: any[];
  duplicates: any[];
  cross_fy: {
    current: { total_files: number; total_size: number; };
    previous: { total_files: number; total_size: number; };
  };
}

export default function CategoryDashboard({ category, masterfolderId }: { category: string; masterfolderId: string | null }) {
  const [stats, setStats] = useState<DeptStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        setUserRole(payload.role);
      } catch (e) {}
    }
  }, []);

  useEffect(() => {
    if (!category || !masterfolderId ) return;

    setLoading(true);
    setStats(null); // reset stale data before fetching new
    const token = localStorage.getItem('token');
    fetch(apiUrl(`/api/stats/category/${encodeURIComponent(category)}?masterfolderId=${masterfolderId}`), {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(res => res.json())
      .then(data => {
        // Only set stats if response has expected structure
        if (data && data.storage) {
          setStats(data);
        } else {
          setStats(null);
        }
        setLoading(false);
      })
      .catch(err => {
        console.error("Failed to fetch stats:", err);
        setStats(null);
        setLoading(false);
      });
  }, [category, masterfolderId]);

  if (userRole && userRole !== 'Admin' && userRole !== 'Manager') {
    return null;
  }

  if (loading) return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      {[1, 2, 3].map(i => (
        <div key={i} className="bg-[var(--bg-neutral)] rounded-[22px] h-[200px] animate-pulse border border-[var(--border-subtle)]"></div>
      ))}
    </div>
  );


  // Use fallback zeros — dashboard renders even when category has no files yet in this masterfolder/FY
  const storage = stats?.storage ?? { total_files: 0, total_size: 0, local_size: 0, minio_size: 0, quota_gb: 5 };
  const usedGb = (storage.total_size / (1024 * 1024 * 1024)).toFixed(2);
  const localGb = (storage.local_size / (1024 * 1024 * 1024)).toFixed(2);
  const minioGb = (storage.minio_size / (1024 * 1024 * 1024)).toFixed(2);
  const quotaGb = storage.quota_gb || 5;
  const usagePercent = Math.min(100, (parseFloat(usedGb) / quotaGb) * 100);

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const prevUsed = stats?.cross_fy?.previous?.total_size ?? 0;
  const currUsed = stats?.cross_fy?.current?.total_size ?? 0;
  const growth = prevUsed ? ((currUsed - prevUsed) / prevUsed) * 100 : 0;

  return (
    <div className="flex flex-col gap-4 md:gap-6 mb-6 md:mb-8">
      
      {/* Top Row: Storage, Cross-FY, Quick Actions */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        
        {/* Storage Widget */}
        <div className="bg-[var(--bg-surface)] rounded-[18px] md:rounded-[22px] border border-[var(--border-subtle)] p-5 md:p-6 flex flex-col justify-between transition-all hover:shadow-[var(--shadow-medium)] min-h-[200px] md:h-[220px]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Storage Usage</span>
            <div className="w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center">
              <HardDrive size={16} className="text-[var(--accent)]" />
            </div>
          </div>
          <div>
            <div className="text-[30px] sm:text-[36px] font-bold tracking-[-0.03em] text-[var(--text-primary)] flex items-baseline">
              {usedGb} <span className="text-[14px] font-bold text-[var(--text-tertiary)] ml-2 uppercase">GB</span>
            </div>
            <div className="flex items-center gap-4 flex-wrap mt-3">
              <div className="flex items-center gap-1.5 min-w-0">
                <HardDrive size={15} className="text-[#34c759] shrink-0" />
                <p className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap"><strong className="text-[var(--text-primary)]">{localGb}GB</strong> Local</p>
              </div>
              <div className="flex items-center gap-1.5 min-w-0">
                <UploadCloud size={15} className="text-[#007aff] shrink-0" />
                <p className="text-[12px] text-[var(--text-secondary)] whitespace-nowrap"><strong className="text-[var(--text-primary)]">{minioGb}GB</strong> Cloud</p>
              </div>
            </div>
          </div>
          <div className="text-[11px] font-semibold text-[var(--text-secondary)]">
            Total: {storage.total_files} files
          </div>
        </div>



        {/* Quick Actions */}
        <div className="bg-[var(--bg-surface)] rounded-[18px] md:rounded-[22px] border border-[var(--border-subtle)] p-5 md:p-6 flex flex-col transition-all hover:shadow-[var(--shadow-medium)] min-h-[200px] md:h-[220px]">
          <div className="flex items-center justify-between mb-4">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Quick Actions</span>
          </div>
          <div className="grid grid-cols-2 gap-3 flex-1">
            <Link href={`/admin/duplicates?masterfolderId=${masterfolderId || ''}`} className="flex flex-col items-center justify-center gap-2 bg-[var(--bg-neutral)] rounded-[14px] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-transparent transition-all">
              <Search size={18} className="text-[var(--text-primary)]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)] text-center leading-tight">Duplicate Scan</span>
            </Link>
            <button 
              onClick={() => {
                const token = localStorage.getItem('token');
                fetch(apiUrl(`/api/export/activity-report/${encodeURIComponent(category)}?masterfolderId=${masterfolderId}`), { headers: { 'Authorization': `Bearer ${token}` } })
                  .then(res => res.blob())
                  .then(blob => {
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `activity_report_${category}.csv`;
                    a.click();
                  });
              }}
              className="flex flex-col items-center justify-center gap-2 bg-[var(--bg-neutral)] rounded-[14px] hover:bg-[var(--bg-elevated)] hover:border-[var(--accent)] border border-transparent transition-all">
              <Download size={18} className="text-[var(--text-primary)]" />
              <span className="text-[12px] font-medium text-[var(--text-primary)] text-center leading-tight">Export Activity</span>
            </button>
          </div>
        </div>

      </div>

      {/* Duplicate Alerts Banner */}
      {(stats?.duplicates?.length ?? 0) > 0 && (
        <div className="bg-[#ff950015] border border-[#ff950030] rounded-[18px] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <AlertCircle className="text-[#ff9500]" size={20} />
            <p className="text-[14px] font-medium text-[#cc7700]">
              <strong>{stats!.duplicates.length} duplicate groups</strong> detected in this category, wasting {formatBytes(stats!.duplicates.reduce((acc, curr) => acc + Number(curr.wasted_size), 0))}.
            </p>
          </div>
          {userRole === 'Admin' && (
            <Link href={`/admin/duplicates?masterfolderId=${masterfolderId || ''}`} className="text-[13px] font-bold text-[#ff9500] hover:underline bg-white/50 px-3 py-1.5 rounded-[8px]">
              Resolve Now
            </Link>
          )}
        </div>
      )}

      {/* Middle Row: Recent Activity, Top Uploaders, File Types */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
        
        {/* Recent Activity - Detailed & Scrollable */}
        <div className="bg-[var(--bg-surface)] rounded-[22px] border border-[var(--border-subtle)] p-6 flex flex-col transition-all hover:shadow-[var(--shadow-medium)] h-[320px] md:col-span-1">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Recent Activity</span>
            <Clock size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="flex-1 overflow-y-auto no-scrollbar pr-1 flex flex-col gap-3">
            {(stats?.activity?.length ?? 0) === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic py-2">No activity recorded</p>
            ) : (stats?.activity ?? []).map((log) => (
              <div key={log.id} className="flex flex-col min-w-0 border-l-2 border-[var(--accent)] pl-3 py-1 group">
                <span className="text-[13px] font-bold text-[var(--text-primary)] truncate leading-tight group-hover:text-[var(--accent)] transition-colors">{log.original_name}</span>
                <div className="flex items-center justify-between mt-1">
                   <span className="text-[11px] font-bold text-[var(--text-secondary)] opacity-80">
                     {log.action_type === 'UPLOAD' ? 'Added' : 'Managed'} by <span className="text-[var(--text-primary)]">{log.username}</span>
                   </span>
                   <span className="text-[10px] font-bold text-[var(--text-tertiary)] whitespace-nowrap ml-4 uppercase tracking-tight">
                     {new Date(log.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                   </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Top Uploaders */}
        <div className="bg-[var(--bg-surface)] rounded-[22px] border border-[var(--border-subtle)] p-6 flex flex-col transition-all hover:shadow-[var(--shadow-medium)] h-[320px]">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">Top Uploaders</span>
            <Users size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="flex flex-col gap-4 flex-1">
            {(stats?.top_uploaders?.length ?? 0) === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic">No uploads yet</p>
            ) : (stats?.top_uploaders ?? []).map((u, i) => (
              <div key={u.username} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center text-[12px] font-bold text-[var(--text-secondary)]">
                    {i + 1}
                  </div>
                  <span className="text-[14px] font-semibold text-[var(--text-primary)]">{u.username}</span>
                </div>
                <span className="text-[13px] font-bold text-[var(--text-tertiary)] bg-[var(--bg-neutral)] px-2 py-0.5 rounded-[6px]">
                  {u.upload_count} files
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* File Type Breakdown */}
        <div className="bg-[var(--bg-surface)] rounded-[22px] border border-[var(--border-subtle)] p-6 flex flex-col transition-all hover:shadow-[var(--shadow-medium)] h-[320px]">
          <div className="flex items-center justify-between mb-6 shrink-0">
            <span className="text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.1em]">File Type Distribution</span>
            <Database size={16} className="text-[var(--text-tertiary)]" />
          </div>
          <div className="flex-1 flex flex-col justify-center gap-4">
            {(stats?.types?.length ?? 0) === 0 ? (
              <p className="text-[13px] text-[var(--text-tertiary)] italic text-center">No files to analyze</p>
            ) : (
              <div className="space-y-4">
                {(stats?.types ?? []).slice(0, 5).map(t => {
                  let typeLabel = t.mime_type.split('/')[1] || t.mime_type;
                  if (t.mime_type.includes('wordprocessingml.document')) typeLabel = 'docx';
                  else if (t.mime_type.includes('spreadsheetml.sheet')) typeLabel = 'xlsx';
                  else if (t.mime_type.includes('presentationml.presentation')) typeLabel = 'pptx';
                  else if (t.mime_type === 'application/msword') typeLabel = 'doc';
                  else if (t.mime_type === 'application/vnd.ms-excel') typeLabel = 'xls';
                  else if (t.mime_type === 'application/vnd.ms-powerpoint') typeLabel = 'ppt';
                  
                  const pct = storage.total_files > 0 ? Math.round((t.count / storage.total_files) * 100) : 0;
                  return (
                    <div key={t.mime_type}>
                      <div className="flex justify-between text-[12px] font-semibold mb-1">
                        <span className="text-[var(--text-secondary)] uppercase tracking-wider">{typeLabel}</span>
                        <span className="text-[var(--text-primary)]">{pct}%</span>
                      </div>
                      <div className="w-full bg-[var(--bg-neutral)] h-1.5 rounded-full overflow-hidden">
                        <div className="bg-[var(--accent)] h-full rounded-full opacity-80" style={{ width: `${pct}%` }}></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
