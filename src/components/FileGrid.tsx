'use client';

import { useState, useEffect, useCallback } from 'react';
import { FileText, Image as ImageIcon, FileArchive, File as FileIcon, Star, Calendar, MousePointer2 } from 'lucide-react';

const getFileIcon = (mimeType: string) => {
  if (!mimeType) return <FileIcon size={24} className="text-[rgba(0,0,0,0.48)]" />;
  if (mimeType.includes('image')) return <ImageIcon size={24} className="text-[#0066cc]" />;
  if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('sheet') || mimeType.includes('word'))
    return <FileText size={24} className="text-[#0066cc]" />;
  if (mimeType.includes('zip') || mimeType.includes('compressed'))
    return <FileArchive size={24} className="text-[rgba(0,0,0,0.8)]" />;
  return <FileIcon size={24} className="text-[rgba(0,0,0,0.48)]" />;
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 Bytes';
  const k = 1024, sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

interface FileGridProps {
  title: string;
  subtitle?: string;
  titleIcon: React.ReactNode;
  files: any[];
  starredIds: Set<number>;
  onStarToggle: (id: number) => void;
  onFileClick: (file: any) => void;
  onRefresh: () => void;
  loading?: boolean;
  emptyMessage: string;
}

export default function FileGrid({
  title, subtitle, titleIcon, files, starredIds, onStarToggle, onFileClick, onRefresh, loading, emptyMessage
}: FileGridProps) {
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [isDragSelecting, setIsDragSelecting] = useState(false);

  const toggleSelect = (id: number) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  useEffect(() => {
    const stopDrag = () => setIsDragSelecting(false);
    window.addEventListener('pointerup', stopDrag);
    return () => window.removeEventListener('pointerup', stopDrag);
  }, []);

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 md:p-10 w-full flex flex-col gap-6 md:gap-8 pb-24">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[rgba(0,0,0,0.08)] pb-5 md:pb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-[12px] bg-[#f5f5f7] flex items-center justify-center shrink-0">
            {titleIcon}
          </div>
          <div>
            <h1 className="text-[26px] sm:text-[32px] font-semibold tracking-[-0.374px] text-[#1d1d1f]">{title}</h1>
            {subtitle && <p className="text-[14px] text-[rgba(0,0,0,0.48)] tracking-[-0.224px]">{subtitle}</p>}
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 sm:mx-0 sm:px-0">
          <button
            onClick={() => {
              if (isSelectMode) {
                if (selectedIds.length === files.length) setSelectedIds([]);
                else setSelectedIds(files.map(f => f.id));
              } else {
                setIsSelectMode(true);
              }
            }}
            className={`text-[14px] px-[14px] py-[6px] rounded-[11px] border-[3px] transition-colors active:scale-95 flex items-center gap-1.5 ${
              isSelectMode
                ? 'bg-[#007AFF] text-white border-[#007AFF] hover:bg-[#0066cc]'
                : 'bg-[#fafafc] text-[rgba(0,0,0,0.8)] border-[rgba(0,0,0,0.04)] hover:border-[#0071e3]'
            }`}
          >
            <MousePointer2 size={14} />
            {isSelectMode ? (selectedIds.length === files.length ? 'Deselect All' : 'Select All') : 'Select'}
          </button>
          {isSelectMode && (
            <button
              onClick={() => { setIsSelectMode(false); setSelectedIds([]); }}
              className="bg-[#f5f5f7] text-[rgba(0,0,0,0.8)] text-[14px] px-[14px] py-[6px] rounded-[11px] border-[3px] border-[rgba(0,0,0,0.04)] hover:border-[#ff3b30] hover:text-[#ff3b30] transition-colors active:scale-95"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onRefresh}
            className="bg-[#fafafc] text-[rgba(0,0,0,0.8)] text-[14px] px-[14px] py-[6px] rounded-[11px] border-[3px] border-[rgba(0,0,0,0.04)] hover:border-[#0071e3] transition-colors active:scale-95"
          >
            Refresh
          </button>
        </div>
      </div>

      {/* Selection count bar */}
      {isSelectMode && selectedIds.length > 0 && (
        <div className="bg-[#007AFF] text-white text-[14px] font-medium px-4 py-2.5 rounded-[11px] flex items-center justify-between animate-in fade-in duration-200">
          <span>{selectedIds.length} file{selectedIds.length !== 1 ? 's' : ''} selected</span>
          <button onClick={() => setSelectedIds([])} className="text-white/70 hover:text-white text-[12px]">Clear</button>
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <p className="text-[rgba(0,0,0,0.48)] text-[17px]">Loading...</p>
      ) : files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 rounded-full bg-[#f5f5f7] flex items-center justify-center mb-4">
            <Star className="text-[rgba(0,0,0,0.24)]" size={28} />
          </div>
          <p className="text-[17px] font-normal text-[rgba(0,0,0,0.48)] tracking-[-0.24px]">{emptyMessage}</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
          {files.map((file) => (
            <div
              key={file.id}
              onClick={() => { if (isSelectMode) toggleSelect(file.id); else onFileClick(file); }}
              onPointerDown={(e) => {
                if (isSelectMode) { e.preventDefault(); setIsDragSelecting(true); if (!selectedIds.includes(file.id)) toggleSelect(file.id); }
              }}
              onPointerEnter={() => {
                if (isDragSelecting && isSelectMode && !selectedIds.includes(file.id)) toggleSelect(file.id);
              }}
              className={`bg-[#ffffff] rounded-[18px] border p-5 md:p-[24px] flex flex-col gap-3 transition-all md:hover:scale-[1.02] hover:shadow-[rgba(0,0,0,0.22)_3px_5px_30px_0px] cursor-pointer relative select-none ${
                selectedIds.includes(file.id)
                  ? 'border-[#007AFF] shadow-[0_0_0_1px_#007AFF_inset] bg-[#f0f7ff]'
                  : 'border-[rgba(0,0,0,0.08)]'
              }`}
            >
              {/* Top-right control: checkbox in select mode, star otherwise */}
              <div
                className="absolute top-4 right-4 z-10"
                onClick={(e) => { e.stopPropagation(); if (isSelectMode) toggleSelect(file.id); else onStarToggle(file.id); }}
                onPointerDown={(e) => { if (isSelectMode) { e.preventDefault(); setIsDragSelecting(true); if (!selectedIds.includes(file.id)) toggleSelect(file.id); } }}
                onPointerEnter={() => { if (isDragSelecting && isSelectMode && !selectedIds.includes(file.id)) toggleSelect(file.id); }}
              >
                {isSelectMode ? (
                  <div className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-colors ${selectedIds.includes(file.id) ? 'bg-[#007AFF] border-[#007AFF]' : 'border-[rgba(0,0,0,0.15)] bg-white hover:border-[#007AFF]'}`}>
                    {selectedIds.includes(file.id) && (
                      <span className="text-white text-[11px] font-bold">{selectedIds.indexOf(file.id) + 1}</span>
                    )}
                  </div>
                ) : (
                  <Star
                    size={18}
                    className={`transition-all duration-200 hover:scale-110 active:scale-[1.4] ${starredIds.has(file.id) ? 'text-[#ffcc00] fill-[#ffcc00] star-anim-active' : 'text-[rgba(0,0,0,0.15)] hover:text-[#ffcc00] hover:fill-[#ffcc00]'}`}
                  />
                )}
              </div>

              {/* Icon */}
              <div className="w-[44px] h-[44px] rounded-[10px] bg-[#f5f5f7] flex items-center justify-center">
                {getFileIcon(file.mime_type)}
              </div>

              {/* Name */}
              <span className="text-[15px] font-semibold tracking-[-0.24px] text-[#1d1d1f] line-clamp-2 leading-[1.3] break-words pr-6">
                {file.original_name}
              </span>

              {/* Meta */}
              <div className="mt-auto flex flex-col gap-1 pt-3 border-t border-[rgba(0,0,0,0.04)]">
                {file.fy_name && (
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full self-start ${file.fy_status === 'Active' ? 'bg-[#e8faf0] text-[#34c759]' : 'bg-[#f5f5f7] text-[rgba(0,0,0,0.4)]'}`}>
                    {file.fy_name}
                  </span>
                )}
                {file.tags && file.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {file.tags.slice(0, 2).map((tag: string, i: number) => (
                      <span key={i} className="bg-[#f5f5f7] text-[#1d1d1f] text-[11px] px-2 py-0.5 rounded-[4px] font-medium">{tag}</span>
                    ))}
                  </div>
                )}
                {file.expiry_date && (
                  <span className="text-[12px] font-medium text-[#ff3b30] flex items-center gap-1">
                    <Calendar size={11} /> {new Date(file.expiry_date).toLocaleDateString()}
                  </span>
                )}
                <span className="text-[13px] text-[rgba(0,0,0,0.48)]">{file.category} · {formatBytes(Number(file.size_bytes))}</span>
                <span className="text-[12px] text-[rgba(0,0,0,0.32)]">{file.upload_date ? new Date(file.upload_date).toLocaleDateString() : ''}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
