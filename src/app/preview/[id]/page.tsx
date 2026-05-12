"use client";

import React, { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { 
  FileText, 
  Download, 
  Eye, 
  Clock, 
  Building2, 
  Calendar, 
  Folder,
  Lock,
  X,
  AlertCircle
} from 'lucide-react';
import { apiUrl } from '@/lib/api';

const PREVIEWABLE_MIME_TYPES = [
  'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/webm', 'video/ogg',
  'audio/mpeg', 'audio/ogg', 'audio/wav',
  'text/plain', 'text/html', 'text/csv',
];

const PREVIEWABLE_OFFICE_EXTS = ['.doc','.docx','.xls','.xlsx','.ppt','.pptx','.odt','.ods','.odp'];

function canPreview(file: any): boolean {
  if (!file) return false;
  const mime = (file.mime_type || '').toLowerCase();
  const ext = (file.original_name || '').split('.').pop()?.toLowerCase();
  return (
    PREVIEWABLE_MIME_TYPES.some(m => mime.startsWith(m)) ||
    PREVIEWABLE_OFFICE_EXTS.includes(`.${ext}`)
  );
}

export default function PreviewPage() {
  const params = useParams();
  const [file, setFile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);

  useEffect(() => {
    const fetchFile = async () => {
      try {
        const res = await fetch(apiUrl(`/api/public/files/${params.id}`));
        if (!res.ok) {
          setError("File not found or has been removed.");
          return;
        }
        const data = await res.json();
        setFile(data);
      } catch {
        setError("Failed to load file details.");
      } finally {
        setLoading(false);
      }
    };
    if (params.id) fetchFile();
  }, [params.id]);

  const handlePreview = () => {
    if (!canPreview(file)) return;
    setPreviewLoading(true);
    setPreviewOpen(true);
  };

  const handleDownload = () => {
    window.open(apiUrl(`/api/public/download/${file.minio_filename}`), '_blank');
  };

  const previewUrl = file ? apiUrl(`/api/public/preview/${file.id}`) : '';
  const showPreviewable = canPreview(file);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[var(--text-secondary)] font-medium">Fetching file details...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mb-6">
          <Lock className="text-red-500" size={40} />
        </div>
        <h1 className="text-[24px] font-bold text-[var(--text-primary)] mb-2">File Unavailable</h1>
        <p className="text-[var(--text-secondary)] max-w-xs mb-8">{error}</p>
      </div>
    );
  }

  if (!file) return null;

  return (
    <>
      {/* ── Inline Preview Modal ── */}
      {previewOpen && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.82)',
            display: 'flex', flexDirection: 'column',
            backdropFilter: 'blur(12px)',
          }}
        >
          {/* Modal header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            background: 'rgba(28,28,30,0.95)',
            borderBottom: '1px solid rgba(255,255,255,0.08)',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <FileText size={18} color="#0a84ff" />
              <span style={{ fontSize: 14, fontWeight: 600, color: '#f5f5f7', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {file.original_name}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={handleDownload}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  background: 'rgba(255,255,255,0.1)', color: '#f5f5f7',
                  border: 'none', borderRadius: 8, padding: '7px 14px',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                }}
              >
                <Download size={15} /> Download
              </button>
              <button
                onClick={() => setPreviewOpen(false)}
                style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 34, height: 34,
                  background: 'rgba(255,255,255,0.08)', color: '#f5f5f7',
                  border: 'none', borderRadius: 8, cursor: 'pointer',
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Iframe viewer */}
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
            {previewLoading && (
              <div style={{
                position: 'absolute', inset: 0, display: 'flex',
                flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: '#0f0f10', zIndex: 1,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '3px solid rgba(10,132,255,0.3)',
                  borderTopColor: '#0a84ff',
                  animation: 'spin 0.8s linear infinite',
                }} />
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                <p style={{ color: '#aeaeb2', fontSize: 14, marginTop: 16 }}>Loading preview...</p>
              </div>
            )}
            <iframe
              src={previewUrl}
              style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
              onLoad={() => setPreviewLoading(false)}
              title={file.original_name}
            />
          </div>
        </div>
      )}

      {/* ── Main Preview Card ── */}
      <div className="max-w-2xl mx-auto p-6 md:py-12">
        <div className="bg-[var(--bg-surface)] rounded-[32px] border border-[var(--border-subtle)] shadow-[var(--shadow-large)] overflow-hidden">
          <div className="p-8 md:p-12 flex flex-col items-center text-center">
            <div className="w-24 h-24 bg-[var(--accent)] bg-opacity-10 rounded-[28px] flex items-center justify-center mb-8 shadow-inner">
              <FileText className="text-[var(--accent)]" size={48} strokeWidth={1.5} />
            </div>
            
            <h1 className="text-[28px] md:text-[32px] font-bold tracking-tight text-[var(--text-primary)] mb-2 leading-tight">
              {file.original_name}
            </h1>
            <p className="text-[var(--text-secondary)] text-[17px] mb-8 font-medium">
              {file.department} • {file.fy_name || 'N/A'}
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full max-w-md">
              {showPreviewable ? (
                <button 
                  onClick={handlePreview}
                  className="flex items-center justify-center gap-3 bg-[var(--accent)] text-white py-4 px-6 rounded-[18px] font-bold text-[17px] hover:opacity-90 transition-all shadow-[0_8px_16px_rgba(0,113,227,0.2)]"
                >
                  <Eye size={20} /> View Document
                </button>
              ) : (
                <div className="flex items-center justify-center gap-2 bg-[var(--bg-neutral)] text-[var(--text-tertiary)] py-4 px-6 rounded-[18px] text-[14px] font-medium border border-dashed border-[var(--border-subtle)]">
                  <AlertCircle size={16} />
                  <span>No preview available</span>
                </div>
              )}
              <button 
                onClick={handleDownload}
                className="flex items-center justify-center gap-3 bg-[var(--bg-neutral)] text-[var(--text-primary)] py-4 px-6 rounded-[18px] font-bold text-[17px] hover:bg-[var(--bg-elevated)] transition-all"
              >
                <Download size={20} /> Download
              </button>
            </div>
          </div>

          <div className="border-t border-[var(--border-subtle)] bg-[var(--bg-app)] bg-opacity-50 p-8 md:p-10 grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="space-y-6">
              <InfoItem 
                icon={<Building2 size={18} className="text-[var(--text-tertiary)]" />} 
                label="Company" 
                value={file.company_name} 
              />
              <InfoItem 
                icon={<Folder size={18} className="text-[var(--text-tertiary)]" />} 
                label="Destination" 
                value={`${file.department}${file.folder ? ` / ${file.folder}` : ''}`} 
              />
            </div>
            <div className="space-y-6">
              <InfoItem 
                icon={<Calendar size={18} className="text-[var(--text-tertiary)]" />} 
                label="Upload Date" 
                value={new Date(file.upload_date).toLocaleDateString('en-US', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })} 
              />
              <InfoItem 
                icon={<Clock size={18} className="text-[var(--text-tertiary)]" />} 
                label="Size" 
                value={`${(file.size_bytes / (1024 * 1024)).toFixed(2)} MB`} 
              />
            </div>
          </div>
        </div>

        <div className="mt-12 text-center">
          <p className="text-[13px] text-[var(--text-tertiary)] font-medium">
            SmartVault Secure Infrastructure • Scan ID: {params.id}
          </p>
        </div>
      </div>
    </>
  );
}

function InfoItem({ icon, label, value }: { icon: React.ReactNode, label: string, value: string }) {
  return (
    <div className="flex items-start gap-4">
      <div className="mt-1">{icon}</div>
      <div>
        <p className="text-[12px] font-bold uppercase tracking-wider text-[var(--text-tertiary)] mb-1">{label}</p>
        <p className="text-[16px] font-semibold text-[var(--text-secondary)]">{value || 'N/A'}</p>
      </div>
    </div>
  );
}
