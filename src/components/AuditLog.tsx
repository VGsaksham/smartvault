'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { ShieldAlert, RefreshCw, Download, Undo2 } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';

interface AuditLog {
  id: string | number;
  user_id: string | number;
  username: string;
  action_type: string;
  file_id: string | number | null;
  details: string;
  ip_address: string;
  created_at: string;
}

export default function AuditLog() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const confirm = useConfirm();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');
  const fyId = searchParams.get('fyId');

  const fetchLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        router.replace('/login');
        return;
      }

      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (fyId) params.set('fyId', fyId);
      const endpoint = params.toString() ? `/api/audit?${params.toString()}` : '/api/audit';
      const res = await fetch(apiUrl(endpoint), {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (res.status === 403) {
        throw new Error('You do not have Administrator privileges to view audit logs.');
      }

      if (!res.ok) {
        throw new Error('Failed to fetch audit logs.');
      }

      const data = await res.json();
      setLogs(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An unexpected error occurred.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [companyId, fyId]);

  const exportLogs = async () => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const params = new URLSearchParams();
    if (companyId) params.set('companyId', companyId);
    if (fyId) params.set('fyId', fyId);
    const url = apiUrl(`/api/export/audit-logs${params.toString() ? `?${params.toString()}` : ''}`);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      setError('Failed to export logs.');
      return;
    }
    const blob = await res.blob();
    const href = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = href;
    a.download = 'system_audit_logs.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(href);
  };

  const undoLog = async (log: AuditLog) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const ok = await confirm({
      title: 'Undo audit log',
      message: `Undo log #${log.id}? Only reversible file/media logs are supported.`,
      confirmText: 'Undo',
      destructive: true,
    });
    if (!ok) return;
    const res = await fetch(apiUrl(`/api/audit/${log.id}/undo`), {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const apiError = String((data as any)?.error || 'Failed to undo this log.');
      await confirm({
        title: 'Undo not possible',
        message: apiError,
        confirmText: 'OK',
        cancelText: 'Close',
      });
      return;
    }
    await fetchLogs();
  };

  const canUndo = (log: AuditLog) => {
    const a = String(log.action_type || '').toUpperCase();
    if (a === 'UPLOAD' && Boolean(log.file_id)) return true;
    return ['BULK_MOVE', 'BULK_RENAME', 'BULK_TAG', 'BULK_EXPIRY'].includes(a);
  };

  const getActionBadge = (action: string) => {
    switch (action.toUpperCase()) {
      case 'UPLOAD':
        return (
          <span className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-[#e5f5ea] text-[#14833b] border border-[#d1ebd9]">
            UPLOAD
          </span>
        );
      case 'DELETE':
        return (
          <span className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-[#ffe5e5] text-[#ff3b30] border border-[#ffdbdb]">
            DELETE
          </span>
        );
      case 'LOGIN':
        return (
          <span className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-[#e8f2ff] text-[#0066cc] border border-[#d1e6ff]">
            LOGIN
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-[8px] py-[2px] rounded-full text-[11px] font-semibold bg-[#f5f5f7] text-[rgba(0,0,0,0.8)] border border-[rgba(0,0,0,0.08)]">
            {action}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center max-w-md mx-auto">
        <div className="w-14 h-14 rounded-full bg-[#ffe5e5] flex items-center justify-center mb-4">
          <ShieldAlert className="text-[#ff3b30]" size={28} />
        </div>
        <h2 className="text-[20px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-2">Access Denied</h2>
        <p className="text-[15px] tracking-[-0.24px] text-[rgba(0,0,0,0.48)]">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-[#ffffff] relative p-3 sm:p-4 md:p-6">
      <div className="mb-3 flex items-center justify-end gap-2">
        <button
          onClick={fetchLogs}
          className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-neutral)] text-[13px] font-semibold text-[var(--text-secondary)] inline-flex items-center gap-2"
        >
          <RefreshCw size={14} /> Refresh
        </button>
        <button
          onClick={exportLogs}
          className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold inline-flex items-center gap-2"
        >
          <Download size={14} /> Export Logs
        </button>
      </div>
      {/* Table Area */}
      <div className="flex-1 overflow-auto">
        <div className="bg-[#ffffff] border border-[rgba(0,0,0,0.08)] rounded-[14px] overflow-hidden shadow-[0_2px_8px_rgba(0,0,0,0.02)]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-[#fafafc] border-b border-[rgba(0,0,0,0.08)]">
                <th className="px-6 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.4px]">Date & Time</th>
                <th className="px-6 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.4px]">User</th>
                <th className="px-6 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.4px]">Action</th>
                <th className="px-6 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.4px]">Details</th>
                <th className="px-6 py-3 text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.4px]">IP Address</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(0,0,0,0.04)]">
              {logs.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center text-[14px] text-[rgba(0,0,0,0.48)] tracking-[-0.12px]">
                    No audit logs found.
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="group hover:bg-[#fafafc] dark:hover:bg-white/[0.03] transition-colors">
                    <td className="px-6 py-3 text-[13px] text-[rgba(0,0,0,0.8)] tracking-[-0.12px] whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString()}
                    </td>
                    <td className="px-6 py-3 text-[13px] font-medium text-[#1d1d1f] tracking-[-0.12px]">
                      {log.username || `User #${log.user_id}`}
                    </td>
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {getActionBadge(log.action_type)}
                        {canUndo(log) && (
                          <button
                            onClick={() => undoLog(log)}
                            className="opacity-100 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity px-2.5 py-1.5 rounded-[8px] border border-[#ff3b30]/30 bg-[#ff3b30]/10 text-[#ff3b30] text-[11px] font-semibold inline-flex items-center gap-1.5"
                          >
                            <Undo2 size={12} /> Undo
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3 text-[13px] text-[rgba(0,0,0,0.8)] tracking-[-0.12px] max-w-md truncate">
                      {log.details}
                    </td>
                    <td className="px-6 py-3 text-[13px] font-mono text-[rgba(0,0,0,0.48)] tracking-[-0.12px] whitespace-nowrap">
                      {log.ip_address}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
