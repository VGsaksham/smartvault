'use client';

import { useState, useEffect, useCallback } from 'react';
import { Star } from 'lucide-react';
import FileGrid from './FileGrid';
import { apiUrl } from '@/lib/api';

export default function StarredView() {
  const [files, setFiles] = useState<any[]>([]);
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchStarred = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);
    fetch(apiUrl('/api/files/starred'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        if (Array.isArray(data)) {
          setFiles(data);
          setStarredIds(new Set(data.map((f: any) => f.id)));
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));
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

  return (
    <FileGrid
      title="Starred"
      subtitle={`${files.length} file${files.length !== 1 ? 's' : ''} starred across all FYs`}
      titleIcon={<Star className="text-[#ffcc00] fill-[#ffcc00]" size={20} />}
      files={files}
      starredIds={starredIds}
      onStarToggle={toggleStar}
      onFileClick={() => {}}
      onRefresh={fetchStarred}
      loading={loading}
      emptyMessage="No starred files yet. Click the ⭐ on any file card to star it."
    />
  );
}
