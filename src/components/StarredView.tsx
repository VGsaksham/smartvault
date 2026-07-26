'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star, Folder } from 'lucide-react';
import { useRouter } from 'next/navigation';
import FileGrid from './FileGrid';
import { apiUrl } from '@/lib/api';

export default function StarredView() {
  const router = useRouter();
  const [files, setFiles] = useState<any[]>([]);
  const [folders, setFolders] = useState<any[]>([]);
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchStarred = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    Promise.all([
      fetch(apiUrl('/api/files/starred'), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json()),
      fetch(apiUrl('/api/folders/starred'), { headers: { Authorization: `Bearer ${token}` } }).then(r => r.json())
    ]).then(([filesData, foldersData]) => {
      if (Array.isArray(filesData)) {
        setFiles(filesData);
        setStarredIds(new Set(filesData.map((f: any) => f.id)));
      }
      if (Array.isArray(foldersData)) {
        setFolders(foldersData);
      }
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStarred(); }, [fetchStarred]);

  const toggleStar = async (fileId: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/files/${fileId}/star`), {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.starred) {
      setFiles(prev => prev.filter(f => f.id !== fileId));
      setStarredIds(prev => { const next = new Set(prev); next.delete(fileId); return next; });
    }
  };

  const toggleFolderStar = async (folderId: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/folders/${folderId}/star`), {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    if (!data.starred) {
      setFolders(prev => prev.filter(f => f.id !== folderId));
    }
  };

  return (
    <div className="flex flex-col w-full">
      {folders.length > 0 && (
        <div className="max-w-[1440px] mx-auto p-4 sm:p-6 md:p-10 w-full mb-[-2rem]">
          <div className="flex items-center gap-3 mb-6 border-b border-[rgba(0,0,0,0.08)] pb-5 md:pb-6">
            <div className="w-10 h-10 rounded-[12px] bg-[#f5f5f7] flex items-center justify-center shrink-0">
              <Folder size={20} className="text-[#007AFF]" />
            </div>
            <div>
              <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">Starred Folders</h1>
              <p className="text-[14px] text-[rgba(0,0,0,0.48)] tracking-[-0.224px]">{folders.length} folder{folders.length !== 1 ? 's' : ''} starred</p>
            </div>
          </div>
          <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
            {folders.map(folder => (
              <div
                key={folder.id}
                onClick={() => router.push(`/?category=${encodeURIComponent(folder.category_name)}&folder=${encodeURIComponent(folder.path)}`)}
                className="group bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[14px] p-4 flex flex-col items-start gap-3 hover:border-[var(--accent)] hover:shadow-[var(--shadow-medium)] transition-all text-left cursor-pointer relative"
              >
                <div className="w-full flex justify-between items-start">
                  <div className="w-10 h-10 rounded-[10px] bg-[var(--bg-neutral)] flex items-center justify-center group-hover:bg-[var(--bg-elevated)] transition-colors">
                    <Folder size={20} className="text-black dark:text-zinc-500 opacity-80" />
                  </div>
                  <button 
                    onClick={(e) => { e.stopPropagation(); toggleFolderStar(folder.id); }}
                    className="z-10 mt-1 mr-1 flex-shrink-0"
                    title="Unstar Folder"
                  >
                    <Star size={18} className="transition-all duration-200 hover:scale-110 active:scale-[1.4] text-[#ffcc00] fill-[#ffcc00] star-anim-active" />
                  </button>
                </div>
                <div className="w-full">
                  <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight truncate" title={folder.path.split('/').pop()}>{folder.path.split('/').pop()}</p>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-0.5 truncate" title={`${folder.category_name} / ${folder.path}`}>{folder.category_name} / {folder.path}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <FileGrid
        title="Starred Files"
        subtitle={`${files.length} file${files.length !== 1 ? 's' : ''} starred`}
        titleIcon={<Star className="text-[#ffcc00] fill-[#ffcc00]" size={20} />}
        files={files}
        starredIds={starredIds}
        onStarToggle={toggleStar}
        onFileClick={(file) => {
          router.push(`/?openFileId=${file.id}&masterfolderId=${file.masterfolder_id}`);
        }}
        onRefresh={fetchStarred}
        loading={loading}
        emptyMessage="No starred files yet. Click the ⭐ on any file card to star it."
      />
    </div>
  );
}
