"use client";

import React, { useEffect, useState, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { 
  Folder, 
  Download, 
  Eye, 
  ArrowLeft,
  FileText
} from 'lucide-react';

function FolderPreviewPageInner() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const dept = searchParams.get('dept');
  const folder = searchParams.get('folder');

  useEffect(() => {
    const fetchFolder = async () => {
      try {
        if (!dept) {
          setError("Invalid folder link.");
          setLoading(false);
          return;
        }

        const res = await fetch(apiUrl(`/api/public/folder?dept=${encodeURIComponent(dept)}${folder ? `&folder=${encodeURIComponent(folder)}` : ''}`));;

        if (!res.ok) {
          setError("Folder not found or has been removed.");
          return;
        }

        const json = await res.json();
        setData(json);
      } catch (err) {
        setError("Failed to load folder details.");
      } finally {
        setLoading(false);
      }
    };

    fetchFolder();
  }, [dept, folder]);

  const handlePreviewFile = (fileId: number) => {
    window.open(apiUrl(`/api/public/preview/${fileId}`), '_blank');
  };

  const handleDownloadFile = (minioFilename: string) => {
    window.open(apiUrl(`/api/public/download/${minioFilename}`), '_blank');
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin"></div>
        <p className="mt-4 text-[var(--text-secondary)] font-medium">Fetching folder contents...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] p-6 text-center">
        <div className="w-20 h-20 bg-red-50 dark:bg-red-900/10 rounded-full flex items-center justify-center mb-6">
          <Folder className="text-red-500" size={40} />
        </div>
        <h1 className="text-[24px] font-bold text-[var(--text-primary)] mb-2">Folder Unavailable</h1>
        <p className="text-[var(--text-secondary)] max-w-xs mb-8">{error}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 md:py-12 animate-in fade-in slide-in-from-bottom-4 duration-500">

      <div className="bg-[var(--bg-surface)] rounded-[32px] border border-[var(--border-subtle)] shadow-[var(--shadow-large)] overflow-hidden">
        <div className="p-8 border-b border-[var(--border-subtle)] bg-[var(--bg-app)] flex items-center gap-6">
          <div className="w-16 h-16 bg-[var(--accent)] bg-opacity-10 rounded-[20px] flex items-center justify-center shadow-inner">
            <Folder className="text-[var(--accent)]" size={32} strokeWidth={1.5} />
          </div>
          <div>
            <h1 className="text-[24px] md:text-[28px] font-bold tracking-tight text-[var(--text-primary)] mb-1">
              {data.folder === 'null' || !data.folder ? 'Root' : data.folder.split('/').pop()}
            </h1>
            <p className="text-[var(--text-secondary)] text-[15px] font-medium">
              {data.department}
            </p>
          </div>
        </div>

        <div className="p-6">
          <h2 className="text-[16px] font-semibold text-[var(--text-primary)] mb-4 px-2">Files ({data.files?.length || 0})</h2>
          
          {data.files?.length === 0 ? (
            <div className="text-center py-12 text-[var(--text-tertiary)]">
              This folder is empty.
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {data.files.map((f: any) => (
                <div key={f.id} className="bg-[var(--bg-app)] border border-[var(--border-subtle)] rounded-[16px] p-4 flex flex-col gap-4">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-[12px] bg-[var(--bg-neutral)] flex items-center justify-center flex-shrink-0">
                      <FileText size={20} className="text-[var(--text-secondary)]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[14px] font-bold text-[var(--text-primary)] truncate">{f.original_name}</p>
                      <p className="text-[12px] text-[var(--text-tertiary)] mt-0.5">
                        {(f.size_bytes / (1024 * 1024)).toFixed(2)} MB • {new Date(f.upload_date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-auto">
                    <button 
                      onClick={() => handlePreviewFile(f.id)}
                      className="flex items-center justify-center gap-2 bg-[var(--bg-neutral)] text-[var(--text-primary)] py-2 rounded-[10px] text-[13px] font-bold hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <Eye size={16} /> View
                    </button>
                    <button 
                      onClick={() => handleDownloadFile(f.minio_filename)}
                      className="flex items-center justify-center gap-2 bg-[var(--bg-neutral)] text-[var(--text-primary)] py-2 rounded-[10px] text-[13px] font-bold hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <Download size={16} /> Save
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-12 text-center">
        <p className="text-[13px] text-[var(--text-tertiary)] font-medium">
          SmartVault Secure Infrastructure • Public Folder Link
        </p>
      </div>
    </div>
  );
}
export default function FolderPreviewPage() {
  return (
    <Suspense
      fallback={
        <div className="flex flex-col items-center justify-center min-h-[60vh]">
          <div className="w-12 h-12 border-4 border-[var(--accent)] border-t-transparent rounded-full animate-spin" />
          <p className="mt-4 text-[var(--text-secondary)] font-medium">
            Loading preview…
          </p>
        </div>
      }
    >
      <FolderPreviewPageInner />
    </Suspense>
  );
}