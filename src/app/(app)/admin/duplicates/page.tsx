'use client';

import { useState, useEffect } from 'react';
import { Shield, Copy, AlertCircle, HardDrive, Trash2, ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { apiUrl } from '@/lib/api';

export default function DuplicateReport() {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchDuplicates();
  }, []);

  const fetchDuplicates = async () => {
    setLoading(true);
    setError(null);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl('/api/admin/duplicates'), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Failed to fetch duplicate report');
      const data = await res.json();
      setDuplicates(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalWasted = duplicates.reduce((acc, curr) => acc + Number(curr.total_size_wasted || 0), 0);

  return (
    <div className="max-w-[1200px] mx-auto p-4 sm:p-6 md:p-10 w-full flex flex-col gap-6 md:gap-8 pb-24">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-2">
        <div>
          <div className="flex items-center gap-2 text-[var(--text-tertiary)] mb-3">
            <Link href="/admin/users" className="hover:text-[var(--accent)] transition-colors flex items-center gap-1 text-[14px] font-medium">
              <ArrowLeft size={14} /> Back to Admin
            </Link>
          </div>
          <h1 className="text-[40px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] leading-[1.1] flex items-center gap-3">
            Duplicate Report
          </h1>
          <p className="text-[17px] font-normal tracking-[-0.374px] text-[var(--text-secondary)] mt-3">
            Identify mathematically identical files and recover wasted storage.
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] p-6 flex items-start gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[#ff950015] flex items-center justify-center shrink-0">
            <Copy className="text-[#ff9500]" size={24} />
          </div>
          <div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1">Total Duplicated Groups</p>
            <p className="text-[32px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] leading-none">
              {loading ? '-' : duplicates.length}
            </p>
          </div>
        </div>
        
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] p-6 flex items-start gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-full bg-[var(--accent-soft)] flex items-center justify-center shrink-0">
            <HardDrive className="text-[var(--accent)]" size={24} />
          </div>
          <div>
            <p className="text-[14px] font-medium text-[var(--text-secondary)] uppercase tracking-wider mb-1">Storage Wasted</p>
            <p className="text-[32px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] leading-none">
              {loading ? '-' : formatBytes(totalWasted)}
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      {loading ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-surface)] rounded-[20px] border border-[var(--border-subtle)]">
          <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[var(--accent)] rounded-full animate-spin mb-4"></div>
          <p className="text-[15px] text-[var(--text-secondary)]">Running SHA-256 background scan...</p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-[#ff3b300a] rounded-[20px] border border-[#ff3b3020]">
          <AlertCircle className="text-[#ff5b52] mb-4" size={32} />
          <p className="text-[17px] font-medium text-[#ff5b52] mb-2">Scan Failed</p>
          <p className="text-[15px] text-[var(--text-secondary)]">{error}</p>
        </div>
      ) : duplicates.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-16 text-center bg-[var(--bg-surface)] rounded-[20px] border border-[var(--border-subtle)]">
          <div className="w-16 h-16 rounded-full bg-[#34c75915] flex items-center justify-center mb-4">
            <Shield className="text-[#34c759]" size={32} />
          </div>
          <h3 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] mb-2">Vault is Clean</h3>
          <p className="text-[15px] font-normal text-[var(--text-secondary)] max-w-sm">
            No duplicated files detected across your system. Your storage is perfectly optimized.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {duplicates.map((group, idx) => (
            <div key={idx} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[20px] overflow-hidden">
              <div className="bg-[var(--bg-elevated)] px-4 sm:px-6 py-4 border-b border-[var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="bg-[#ff9500] text-white text-[12px] font-bold px-2 py-0.5 rounded-[6px] uppercase tracking-wider">
                    {group.duplicate_count} Copies
                  </div>
                  <span className="text-[13px] font-mono text-[var(--text-tertiary)] bg-[var(--bg-neutral)] px-2 py-1 rounded-[6px]">
                    Hash: {group.file_hash.substring(0, 16)}...
                  </span>
                </div>
                <div className="text-[14px] font-medium text-[var(--text-secondary)]">
                  Wasting <span className="text-[#ff9500] font-semibold">{formatBytes(group.total_size_wasted)}</span>
                </div>
              </div>
              
              <div className="divide-y divide-[var(--border-subtle)]">
                {group.files.map((file: any) => (
                  <div key={file.id} className="p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-[var(--bg-neutral)] transition-colors">
                    <div className="flex-1 min-w-0">
                      <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate mb-1">
                        {file.original_name}
                      </p>
                      <div className="flex items-center gap-3 text-[13px] text-[var(--text-secondary)]">
                        <span className="bg-[var(--bg-elevated)] px-2 py-0.5 rounded border border-[var(--border-subtle)]">
                          {file.category} {file.folder ? `/ ${file.folder}` : ''}
                        </span>
                        <span>•</span>
                        <span>Uploaded by <span className="font-medium text-[var(--text-primary)]">{file.uploader_name}</span></span>
                        <span>•</span>
                        <span>{new Date(file.upload_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-[14px] font-medium text-[var(--text-primary)] px-4">
                        {formatBytes(file.size_bytes)}
                      </div>
                      <a href={`/preview/${file.id}`} target="_blank" className="text-[13px] font-semibold text-[var(--accent)] hover:opacity-80 px-3 py-1.5 bg-[var(--accent-soft)] rounded-[8px] transition-colors">
                        Preview
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
