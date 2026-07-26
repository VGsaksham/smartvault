'use client';

import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Clock } from 'lucide-react';
import FileGrid from './FileGrid';
import { apiUrl } from '@/lib/api';

export default function RecentView() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const masterfolderId = searchParams.get('masterfolderId');

  const [files, setFiles] = useState<any[]>([]);
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    setLoading(true);

    const params = new URLSearchParams();
    if (masterfolderId) params.set('masterfolderId', masterfolderId);
    
    const url = apiUrl(`/api/files/recent?${params.toString()}`);

    fetch(url, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { setFiles(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));

    fetch(apiUrl('/api/files/starred'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setStarredIds(new Set(data.map((f: any) => f.id))); })
      .catch(() => {});
  }, [masterfolderId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const toggleStar = async (fileId: number) => {
    const token = localStorage.getItem('token');
    const res = await fetch(apiUrl(`/api/files/${fileId}/star`), {
      method: 'POST', headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json();
    setStarredIds(prev => {
      const next = new Set(prev);
      data.starred ? next.add(fileId) : next.delete(fileId);
      return next;
    });
  };

  return (
    <FileGrid
      title="Recent"
      subtitle="Last 30 uploaded files"
      titleIcon={<Clock className="text-[#0066cc]" size={20} />}
      files={files}
      starredIds={starredIds}
      onStarToggle={toggleStar}
      onFileClick={(file) => {
        router.push(`/?openFileId=${file.id}&masterfolderId=${file.masterfolder_id}`);
      }}
      onRefresh={fetchData}
      loading={loading}
      emptyMessage="No recent files. Upload something to get started."
    />
  );
}
