'use client';

import { useState, useEffect, useMemo, useRef } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { FileText, Image as ImageIcon, FileArchive, File as FileIcon, Search, CloudUpload, Trash2, Folder, HardDrive, Shield, FolderInput, Copy, Edit2, Tag, Calendar, Download, QrCode, Undo2, Star, CheckSquare, MousePointer2, LayoutGrid, List as ListIcon, MoreVertical, Moon, Sun, Music, Video, Printer, Plus, AlertCircle, UploadCloud } from 'lucide-react';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import DepartmentDashboard from './DepartmentDashboard';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { CustomSelect } from '@/components/ui/Select';

type StructureDepartment = { name: string; folders: { id: number; name: string; parent_folder_id: number | null }[] };
type UploadQueueItem = { id: string; file: File; targetFolder?: string; proposedName: string; proposedFolder?: string };

function escapeCsv(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function parseCsvTable(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length === 0) return { headers: [], rows: [] };
  const rows = lines.map((line) => {
    const cols: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (ch === ',' && !inQuotes) {
        cols.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    cols.push(current.trim());
    return cols.map((c) => c.replace(/^"(.*)"$/, '$1'));
  });
  const headers = (rows[0] || []).map((h) => h.replace(/^\uFEFF/, '').trim().toLowerCase());
  return { headers, rows: rows.slice(1) };
}

function getCsvCell(headers: string[], cols: string[], key: string): string {
  const idx = headers.indexOf(key.toLowerCase());
  if (idx < 0) return '';
  return String(cols[idx] || '').replace(/^\uFEFF/, '').trim();
}

export default function MainDashboard() {
  const [files, setFiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadText, setUploadText] = useState("");
  const [uploadDept, setUploadDept] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [uploadCustomTag, setUploadCustomTag] = useState("");
  const [uploadFolder, setUploadFolder] = useState("");
  const [uploadQueue, setUploadQueue] = useState<UploadQueueItem[]>([]);
  const [uploadCsvInputKey, setUploadCsvInputKey] = useState(0);
  
  // File Viewer State
  const [selectedFile, setSelectedFile] = useState<any | null>(null);
  
  // Custom Modal States
  const [fileToDelete, setFileToDelete] = useState<any | null>(null);
  const [deleteReason, setDeleteReason] = useState("");
  const [alertConfig, setAlertConfig] = useState<{title: string, message: string, isError: boolean} | null>(null);
  
  // Bulk Selection State
  const [selectedFileIds, setSelectedFileIds] = useState<number[]>([]);
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const [showBulkMoveModal, setShowBulkMoveModal] = useState(false);
  const [bulkMoveDept, setBulkMoveDept] = useState("");
  const [bulkMoveFolder, setBulkMoveFolder] = useState("");
  const [showBulkCopyModal, setShowBulkCopyModal] = useState(false);
  const [bulkCopyDept, setBulkCopyDept] = useState("");
  const [bulkCopyFolder, setBulkCopyFolder] = useState("");

  const [showRenameModal, setShowRenameModal] = useState(false);
  const [renamePrefix, setRenamePrefix] = useState("");
  const [renameSuffix, setRenameSuffix] = useState("");
  const [renameText, setRenameText] = useState("");
  const [renameSequenceStart, setRenameSequenceStart] = useState<number | "">("");
  const [renameCsvOverrides, setRenameCsvOverrides] = useState<Record<number, string>>({});
  const [renameFolderOverrides, setRenameFolderOverrides] = useState<Record<number, string | null>>({});
  const [renameCsvInputKey, setRenameCsvInputKey] = useState(0);

  const [showTagModal, setShowTagModal] = useState(false);
  const [tagInput, setTagInput] = useState("");

  const [toastMessage, setToastMessage] = useState<{message: string, timestamp: number, undoAction?: string, undoPayload?: any, undoFileIds?: number[]} | null>(null);
  const [isBulkProcessing, setIsBulkProcessing] = useState(false);
  
  const [showAliasModal, setShowAliasModal] = useState(false);
  const [aliasTarget, setAliasTarget] = useState<'files'|'folders'>('files');
  const [aliasChanges, setAliasChanges] = useState<Array<{id: number, oldName: string, alias: string}>>([]);
  const [aliasUploading, setAliasUploading] = useState(false);

  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [highlightedFileId, setHighlightedFileId] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<{ visible: boolean, x: number, y: number, file: any | null }>({ visible: false, x: 0, y: 0, file: null });

  // Preview State
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const codeRef = useRef<HTMLElement>(null);

  const [isDarkMode, setIsDarkMode] = useState(false);
  
  useEffect(() => {
    const savedTheme = localStorage.getItem('smartvault-theme');
    if (savedTheme === 'dark') {
      setIsDarkMode(true);
      document.documentElement.classList.add('dark');
    }
  }, []);
  
  const toggleDarkMode = () => {
    const next = !isDarkMode;
    setIsDarkMode(next);
    const theme = next ? 'dark' : 'light';
    localStorage.setItem('smartvault-theme', theme);
    try {
      const storedUser = localStorage.getItem('user');
      if (storedUser) {
        const user = JSON.parse(storedUser);
        user.theme_preference = theme;
        localStorage.setItem('user', JSON.stringify(user));
      }
    } catch(e) {}
    
    if (next) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    // Persist to server
    const token = localStorage.getItem('token');
    if (token && userId) {
      fetch(apiUrl(`/api/users/${userId}/preferences`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ theme_preference: theme })
      })
        .catch(() =>
          fetch(apiUrl(`/api/users/${userId}/theme`), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
            body: JSON.stringify({ theme_preference: theme })
          }).catch(() => {})
        );
    }
  };

  // Starred State
  const [starredIds, setStarredIds] = useState<Set<number>>(new Set());
  
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const activeFilter = searchParams.get('type') || 'All';
  const activeDepartment = searchParams.get('dept') || 'All files';
  const isUploadModalOpen = searchParams.get('upload') === 'true';
  const companyId = searchParams.get('companyId');
  const fyId = searchParams.get('fyId');
  const rawSearchScope = searchParams.get('scope') || 'fy';
  const searchScope = (rawSearchScope === 'all' || rawSearchScope === 'company') ? 'fy' : rawSearchScope;
  const searchParamsKey = searchParams.toString();
  const focusFileIdParam = searchParams.get('focusFileId');
  const openFileIdParam = searchParams.get('openFileId');
  const folderParam = searchParams.get('folder');
  
  const [activeFolder, setActiveFolder] = useState<string | null>(folderParam || null);

  useEffect(() => {
    setActiveFolder(folderParam || null);
  }, [folderParam, activeDepartment]);


  useEffect(() => {
    if (isUploadModalOpen) {
      if (activeDepartment && activeDepartment !== 'All files') {
        setUploadDept(activeDepartment);
      } else {
        setUploadDept("");
      }
      if (activeFolder) {
        setUploadFolder(activeFolder);
      } else {
        setUploadFolder("");
      }
    }
  }, [isUploadModalOpen, activeDepartment, activeFolder]);

  const closeUploadModal = () => {
    const params = new URLSearchParams(searchParams);
    params.delete('upload');
    router.replace(`${pathname}?${params.toString()}`);
    setUploadQueue([]);
    setUploadCsvInputKey((k) => k + 1);
  };



  const [qrFile, setQrFile] = useState<any | null>(null);
  const [bulkQrFiles, setBulkQrFiles] = useState<any[] | null>(null);

  const printQrCode = () => {
    window.print();
  };

  const fetchFiles = (cId?: string | null, fId?: string | null) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    
    const c = cId ?? companyId;
    const f = fId ?? fyId;

    if (!c || !f) {
      console.log("[MainDashboard] Skipping fetch: companyId or fyId missing", { c, f });
      setLoading(false);
      return;
    }

    console.log(`[MainDashboard] Fetching files for Company:${c}, FY:${f}`);

    let url: string;
    if (searchQuery) {
      url = apiUrl(`/api/files/search?q=${encodeURIComponent(searchQuery)}&scope=${searchScope}`);
      if (c) url += `&companyId=${c}`;
      if (f) url += `&fyId=${f}`;
      if (searchScope === 'dept' && activeDepartment && activeDepartment !== 'All files') {
        url += `&departments=${encodeURIComponent(activeDepartment)}`;
      }
      if (searchScope === 'folder' && activeFolder) {
        url += `&folder=${encodeURIComponent(activeFolder)}`;
      }
      const passthroughKeys = [
        'fileType', 'matchCase', 'exact', 'from', 'to', 'year', 'month', 'day',
        'departments', 'companies', 'financialYears', 'uploadedBy', 'hddLocation',
        'tags', 'extension', 'textInside'
      ];
      for (const key of passthroughKeys) {
        const value = searchParams.get(key);
        if (value) url += `&${key}=${encodeURIComponent(value)}`;
      }
    } else {
      url = apiUrl(`/api/files?companyId=${c}&fyId=${f}`);
    }

    fetch(url, {
      headers: { 'Authorization': `Bearer ${token}` }
    })
      .then(async (res) => {
        console.log(`[MainDashboard] API Response Status: ${res.status}`);
        if (res.status === 401 || res.status === 403) {
          localStorage.removeItem('token');
          window.location.href = '/login';
          return;
        }
        const data = await res.json();
        if (!res.ok) {
          console.error("[MainDashboard] API Error:", data);
          setFiles([]);
          setError(data.error || "Failed to load files");
        } else {
          console.log(`[MainDashboard] Successfully loaded ${Array.isArray(data) ? data.length : 0} files`);
          setFiles(Array.isArray(data) ? data : []);
          setError(null);
        }
        setLoading(false);
        
        // Also load starred IDs
        fetch(apiUrl('/api/files/starred'), { headers: { 'Authorization': `Bearer ${token}` } })
          .then(async r => {
            if (r.ok) {
              const s = await r.json();
              if (Array.isArray(s)) {
                setStarredIds(new Set(s.map((f: any) => f.id)));
              }
            }
          })
          .catch(() => {});
      })
      .catch((err) => {
        console.error("[MainDashboard] Fetch exception:", err);
        setError("Network error: Could not connect to API server");
        setLoading(false);
      });
  };

  const toggleStar = async (fileId: number) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(apiUrl(`/api/files/${fileId}/star`), {
        method: 'POST', headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setStarredIds(prev => {
        const next = new Set(prev);
        data.starred ? next.add(fileId) : next.delete(fileId);
        return next;
      });
    } catch (e) { console.error('Star toggle failed', e); }
  };

  const [userRole, setUserRole] = useState<string | null>(null);
  const [userDept, setUserDept] = useState<string | null>(null);
  const [userAllowedDepts, setUserAllowedDepts] = useState<string[]>([]);
  const [userId, setUserId] = useState<number | null>(null);
  const [storageOverview, setStorageOverview] = useState<any | null>(null);
  const [structureDepartments, setStructureDepartments] = useState<StructureDepartment[]>([]);
  const confirm = useConfirm();

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUser = localStorage.getItem('user');
    if (!token) {
      window.location.href = '/login';
    } else {
      try {
        const payload = JSON.parse(atob(token.split('.')[1]));
        const parsedUser = storedUser ? JSON.parse(storedUser) : null;
        setUserRole(payload.role);
        setUserDept(payload.department);
        setUserAllowedDepts(parsedUser?.allowed_departments || payload.allowed_departments || []);
        setUserId(parsedUser?.id || payload.id);
      } catch (e) {
        console.error('Invalid token payload');
      }
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !companyId || !fyId) return;
    const params = new URLSearchParams({ companyId, fyId });
    fetch(apiUrl(`/api/structure?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return [];
        return Array.isArray((data as any)?.departments) ? (data as any).departments : [];
      })
      .then((rows: StructureDepartment[]) => setStructureDepartments(rows))
      .catch(() => setStructureDepartments([]));
  }, [companyId, fyId]);

  useEffect(() => {
    const handler = (ev: any) => {
      const token = localStorage.getItem('token');
      if (!token || !companyId || !fyId) return;
      const detailCompany = ev?.detail?.companyId;
      const detailFy = ev?.detail?.fyId;
      if (Number(detailCompany) !== Number(companyId) || Number(detailFy) !== Number(fyId)) return;
      const params = new URLSearchParams({ companyId, fyId });
      fetch(apiUrl(`/api/structure?${params.toString()}`), {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(async (res) => {
          const data = await res.json().catch(() => ({}));
          if (!res.ok) return [];
          return Array.isArray((data as any)?.departments) ? (data as any).departments : [];
        })
        .then((rows: StructureDepartment[]) => setStructureDepartments(rows))
        .catch(() => {});
    };
    window.addEventListener('smartvault:structureChanged', handler as any);
    return () => window.removeEventListener('smartvault:structureChanged', handler as any);
  }, [companyId, fyId]);

  const { deptFoldersMap, folderAliasMap } = useMemo(() => {
    const map: Record<string, string[]> = {};
    const aliasMap: Record<string, string> = {};
    for (const d of structureDepartments) {
      const name = String((d as any)?.name || '').trim();
      if (!name) continue;
      const folders: any[] = Array.isArray((d as any)?.folders) ? (d as any).folders : [];
      const folderById = new Map<number, any>(folders.map((f: any) => [f.id, f]));
      
      const getPath = (id: number, visited = new Set<number>()): string => {
        if (visited.has(id)) return '';
        visited.add(id);
        const f = folderById.get(id);
        if (!f) return '';
        if (!f.parent_folder_id) return String(f.name || '');
        const parentPath = getPath(f.parent_folder_id, visited);
        return parentPath ? `${parentPath}/${f.name}` : String(f.name || '');
      };

      const getAliasPath = (id: number, visited = new Set<number>()): string => {
        if (visited.has(id)) return '';
        visited.add(id);
        const f = folderById.get(id);
        if (!f) return '';
        const namePart = f.user_alias || f.name || '';
        if (!f.parent_folder_id) return String(namePart);
        const parentPath = getAliasPath(f.parent_folder_id, visited);
        return parentPath ? `${parentPath}/${namePart}` : String(namePart);
      };
      
      const paths: string[] = [];
      for (const f of folders) {
        if (typeof f === 'string') {
          paths.push(f);
        } else {
          const original = getPath(f.id);
          const alias = getAliasPath(f.id);
          paths.push(original);
          if (original && alias && original !== alias) {
             aliasMap[`${name}::${original}`] = alias;
          }
        }
      }
      map[name] = paths.filter(Boolean);
    }
    return { deptFoldersMap: map, folderAliasMap: aliasMap };
  }, [structureDepartments]);

  const deptList = useMemo(() => {
    const fromStructure = structureDepartments.map((d) => String((d as any)?.name || '')).filter(Boolean);
    return fromStructure;
  }, [structureDepartments, files]);

  // If the URL has a department that doesn't exist in the managed structure, reset to "All files"
  useEffect(() => {
    if (!companyId || !fyId) return;
    if (structureDepartments.length === 0) return;
    if (!activeDepartment || activeDepartment === 'All files') return;
    const allowed = new Set(deptList);
    if (allowed.has(activeDepartment)) return;
    const params = new URLSearchParams(searchParams);
    params.delete('dept');
    params.delete('folder');
    setActiveFolder(null);
    router.replace(`${pathname}?${params.toString()}`);
  }, [companyId, fyId, structureDepartments.length, activeDepartment, deptList, pathname, router, searchParams]);


  useEffect(() => {
    if (companyId && fyId) {
      fetchFiles(companyId, fyId);
    }
  }, [companyId, fyId, searchQuery, searchScope, searchParamsKey]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token || !companyId || !fyId) return;
    const params = new URLSearchParams({ companyId, fyId });
    fetch(apiUrl(`/api/storage/overview?${params.toString()}`), {
      headers: { Authorization: `Bearer ${token}` }
    })
      .then(async (res) => {
        if (!res.ok) return null;
        return res.json();
      })
      .then((data) => setStorageOverview(data))
      .catch(() => setStorageOverview(null));
  }, [companyId, fyId]);

  const requiredDown = Array.isArray(storageOverview?.storage_devices)
    ? storageOverview.storage_devices.filter((d: any) => d?.required && d?.unavailable)
    : [];
  const mediaDown = requiredDown.some((d: any) => String(d?.path || '') === String(storageOverview?.storage_devices?.find((x: any) => x?.label?.toLowerCase?.().includes('hdd-01') || x?.label?.toLowerCase?.().includes('media'))?.path || '')) ||
    requiredDown.some((d: any) => String(d?.label || '').toLowerCase().includes('hdd-01')) ||
    requiredDown.some((d: any) => String(d?.label || '').toLowerCase().includes('media'));

  // Global pointer up to stop drag-selecting
  useEffect(() => {
    const stopDrag = () => setIsDragSelecting(false);
    window.addEventListener('pointerup', stopDrag);
    return () => window.removeEventListener('pointerup', stopDrag);
  }, []);

  useEffect(() => {
    const handleClick = () => setContextMenu({ ...contextMenu, visible: false });
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, [contextMenu]);

  const handleContextMenu = (e: React.MouseEvent, file: any) => {
    e.preventDefault();
    if (!selectedFileIds.includes(file.id)) {
      setSelectedFileIds([file.id]);
    }
    setContextMenu({
      visible: true,
      x: e.clientX,
      y: e.clientY,
      file: file
    });
  };

  // File type helpers

  const CODE_EXTS = ['js','ts','tsx','jsx','py','sh','bash','json','yaml','yml','xml','html','css','scss','md','txt','log','env','ini','toml','csv'];
  const isCodeFile = (name: string) => CODE_EXTS.includes((name.split('.').pop() || '').toLowerCase());

  // Build preview URL / text content based on selected file
  useEffect(() => {
    let url: string | null = null;
    setTextContent(null);
    setPreviewUrl(null);

    if (!selectedFile) return;

    const mime = selectedFile.mime_type || '';
    const name = selectedFile.original_name || '';
    const token = localStorage.getItem('token');
    if (!token) return;

    const parseAccessError = async (response: Response) => {
      try {
        const body = await response.json();
        return body?.error || 'You do not have permission to open this file.';
      } catch {
        return 'You do not have permission to open this file.';
      }
    };

    const fetchPreviewWithFallback = async () => {
      const headerResponse = await fetch(apiUrl(`/api/preview/${selectedFile.id}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (headerResponse.ok) return headerResponse;

      // Backward compatibility for backends still reading token from query.
      if (headerResponse.status === 401 || headerResponse.status === 403) {
        const tokenResponse = await fetch(
          apiUrl(`/api/preview/${selectedFile.id}?token=${encodeURIComponent(token)}`)
        );
        if (tokenResponse.ok) return tokenResponse;
      }
      return headerResponse;
    };

    const handleProtectedResponse = async (response: Response) => {
      if (response.ok) return response;
      if (response.status === 401 || response.status === 403) {
        const errorText = await parseAccessError(response);
        setSelectedFile(null);
        setAlertConfig({ title: 'Access denied', message: errorText, isError: true });
        return null;
      }
      setAlertConfig({ title: 'Preview failed', message: 'Could not open this file preview.', isError: true });
      return null;
    };

    if (isCodeFile(name) || mime.includes('text')) {
      fetchPreviewWithFallback()
        .then(handleProtectedResponse)
        .then(r => (r ? r.text() : null))
        .then(text => { if (text !== null) setTextContent(text); })
        .catch(err => console.error('Text preview failed:', err));
    } else if (
      mime.includes('image') ||
      mime.includes('video') ||
      mime.includes('audio') ||
      mime.includes('pdf') ||
      name.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/i)
    ) {
      fetchPreviewWithFallback()
        .then(handleProtectedResponse)
        .then(r => (r ? r.blob() : null))
        .then(blob => {
          if (!blob) return;
          url = URL.createObjectURL(blob);
          setPreviewUrl(url);
        })
        .catch(err => console.error('Binary preview failed:', err));
    }

    return () => { if (url) URL.revokeObjectURL(url); };
  }, [selectedFile]);

  // Syntax highlight code after text loads
  useEffect(() => {
    if (textContent && codeRef.current) {
      import('highlight.js').then(hljs => {
        import('highlight.js/styles/github.css' as any).catch(() => {});
        const ext = (selectedFile?.original_name?.split('.').pop() || 'text').toLowerCase();
        try {
          const result = hljs.default.highlight(textContent, { language: ext, ignoreIllegals: true });
          if (codeRef.current) codeRef.current.innerHTML = result.value;
        } catch {
          if (codeRef.current) codeRef.current.textContent = textContent;
        }
      });
    }
  }, [textContent, selectedFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    if (e.dataTransfer.items) {
      const items = Array.from(e.dataTransfer.items)
        .map(item => item.webkitGetAsEntry())
        .filter(Boolean);

      const fileEntries: { file: File, relPath: string }[] = [];

      const traverseFileTree = async (item: any, path: string = '') => {
        if (!item) return;
        if (item.isFile) {
          return new Promise<void>((resolve) => {
            item.file((file: File) => {
              fileEntries.push({ file, relPath: path + file.name });
              resolve();
            });
          });
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const readEntriesPromise = () => new Promise<any[]>((resolve) => {
            dirReader.readEntries((entries: any[]) => resolve(entries));
          });
          
          let allEntries: any[] = [];
          let read = await readEntriesPromise();
          while(read.length > 0) {
            allEntries = allEntries.concat(read);
            read = await readEntriesPromise();
          }
          for (const entry of allEntries) {
            await traverseFileTree(entry, path + item.name + '/');
          }
        }
      };

      for (const item of items) {
        await traverseFileTree(item);
      }

      if (fileEntries.length > 0) {
        const fileList = fileEntries.map(entry => {
          const parts = entry.relPath.split('/');
          let targetFolder = uploadFolder || '';
          if (parts.length > 1) {
            const relDir = parts.slice(0, -1).join('/');
            targetFolder = uploadFolder ? `${uploadFolder}/${relDir}` : relDir;
          }
          return { file: entry.file, targetFolder: targetFolder || undefined };
        });
        queueUploads(fileList);
      }
    } else if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const fileList = Array.from(e.dataTransfer.files).map(file => ({ file, targetFolder: uploadFolder || undefined }));
      queueUploads(fileList);
    }
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const fileList = Array.from(e.target.files).map(file => ({ file, targetFolder: uploadFolder || undefined }));
      queueUploads(fileList);
    }
  };

  const queueUploads = (fileList: { file: File, targetFolder?: string }[]) => {
    if (fileList.length === 0) return;
    const queued = fileList.map(({ file, targetFolder }) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      targetFolder,
      proposedName: file.name,
      proposedFolder: targetFolder || ''
    }));
    setUploadQueue((prev) => [...prev, ...queued]);
  };

  const applyUploadCsv = async (file: File) => {
    try {
      const text = await file.text();
      const { headers, rows } = parseCsvTable(text);
      if (rows.length === 0) {
        setAlertConfig({ title: 'Invalid CSV', message: 'CSV is empty.', isError: true });
        return;
      }
      let updated = 0;
      setUploadQueue((prev) =>
        prev.map((item) => {
          const row = rows.find((cols) => {
            const rowId = getCsvCell(headers, cols, 'row_id');
            if (rowId) return rowId === item.id;
            const prevName = getCsvCell(headers, cols, 'prev_name');
            const prevPath = getCsvCell(headers, cols, 'prev_path');
            if (!prevName) return false;
            if (prevPath) return prevName === item.file.name && prevPath === String(item.targetFolder || '');
            return prevName === item.file.name;
          });
          if (!row) return item;
          const nextName = getCsvCell(headers, row, 'new_name') || item.proposedName;
          const nextPathRaw = getCsvCell(headers, row, 'new_path');
          const nextFolder = nextPathRaw === '' ? '' : nextPathRaw;
          updated++;
          return { ...item, proposedName: nextName, proposedFolder: nextFolder };
        })
      );
      setAlertConfig({ title: 'CSV Applied', message: `Updated ${updated} queued row(s).`, isError: false });
    } catch {
      setAlertConfig({ title: 'CSV Error', message: 'Failed to read CSV file.', isError: true });
    } finally {
      setUploadCsvInputKey((k) => k + 1);
    }
  };

  const downloadUploadCsvTemplate = () => {
    const header = 'row_id,prev_name,prev_path,new_name,new_path';
    const lines = uploadQueue.map((item) =>
      [
        escapeCsv(item.id),
        escapeCsv(item.file.name),
        escapeCsv(item.targetFolder || ''),
        escapeCsv(item.proposedName),
        escapeCsv(item.proposedFolder || '')
      ].join(',')
    );
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'upload_file_names_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const uploadFiles = async (fileList: UploadQueueItem[]) => {
    if (uploading || fileList.length === 0) return;
    if (!uploadDept || uploadDept === "Select Department" || uploadDept === "") {
      setAlertConfig({ title: 'Missing Department', message: 'Please select a department before uploading.', isError: true });
      return;
    }
    
    setUploading(true);
    let successCount = 0;
    const failures: string[] = [];

    for (let i = 0; i < fileList.length; i++) {
      const { file, targetFolder, proposedName, proposedFolder } = fileList[i];
      setUploadProgress(0);
      setUploadText(`Uploading ${proposedName} (${i + 1} of ${fileList.length})...`);
      
      const formData = new FormData();
      const uploadFile = proposedName !== file.name ? new File([file], proposedName, { type: file.type, lastModified: file.lastModified }) : file;
      formData.append('document', uploadFile);
      formData.append('department', uploadDept);
      if (companyId) formData.append('companyId', companyId);
      if (fyId) formData.append('fyId', fyId);
      if (uploadCustomTag) formData.append('customTag', uploadCustomTag);
      const finalFolder = proposedFolder ?? targetFolder;
      if (finalFolder) formData.append('folder', finalFolder);

      try {
        const token = localStorage.getItem('token');
        await axios.post(apiUrl('/api/upload'), formData, {
          headers: { 'Authorization': `Bearer ${token}` },
          onUploadProgress: (progressEvent) => {
            if (progressEvent.total) {
              setUploadProgress(Math.round((progressEvent.loaded * 100) / progressEvent.total));
            }
          }
        });
        successCount++;
      } catch (error: any) {
        console.error(`Upload error for ${file.name}:`, error);
        const errMsg = error.response?.data?.error || `Failed (status ${error.response?.status || 'Unknown'})`;
        failures.push(`${file.name}: ${errMsg}`);
        // Continue uploading remaining files — do NOT return or abort here
      }
    }

    setUploadProgress(100);
    if (failures.length === 0) {
      setUploadText(`Uploaded ${successCount} file(s) successfully! ✅`);
    } else {
      setUploadText(`${successCount} uploaded, ${failures.length} failed.`);
      setAlertConfig({
        title: `${failures.length} file(s) failed to upload`,
        message: failures.slice(0, 5).join('\n') + (failures.length > 5 ? `\n…and ${failures.length - 5} more` : ''),
        isError: true
      });
    }
    fetchFiles();
    setTimeout(() => {
      setUploading(false);
      setUploadQueue([]);
      closeUploadModal();
    }, 2000);
  };

  const handleHardDownload = async (file: any) => {
    try {
      const token = localStorage.getItem('token');
      const safeFilename = file.minio_filename.split('/').map(encodeURIComponent).join('/');
      const res = await fetch(apiUrl(`/api/download/${safeFilename}`), {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.original_name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Download failed:", err);
      setAlertConfig({ title: 'Download Error', message: 'Failed to download the file.', isError: true });
    }
  };

  const confirmDelete = async (file: any) => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(apiUrl(`/api/files/${file.id}`), { 
        method: 'DELETE',
        headers: { 
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ reason: deleteReason })
      });
      if (res.ok) {
        setFiles((prev) => prev.filter((f) => f.id !== file.id));
        if (selectedFile?.id === file.id) {
          setSelectedFile(null);
        }
        setFileToDelete(null);
        setDeleteReason("");
      } else {
        const errorData = await res.json();
        setFileToDelete(null);
        setDeleteReason("");
        setAlertConfig({ 
          title: 'Delete Failed', 
          message: errorData.error || 'Failed to delete the file.', 
          isError: true 
        });
      }
    } catch (err) {
      console.error('Delete error:', err);
      setFileToDelete(null);
      setDeleteReason("");
      setAlertConfig({ title: 'Delete Error', message: 'An error occurred while deleting the file.', isError: true });
    }
  };

  const toggleFileSelection = (id: number) => {
    setSelectedFileIds(prev => 
      prev.includes(id) ? prev.filter(fid => fid !== id) : [...prev, id]
    );
  };

  const handleBulkAction = async (action: string, payload: any = {}, undoData?: { action: string, payload: any, fileIds: number[] }, specificIds?: number[]) => {
    setIsBulkProcessing(true);
    const targetIds = specificIds || selectedFileIds;
    try {
      const token = localStorage.getItem('token');
      const res = await axios.post(apiUrl('/api/files/bulk'), {
        fileIds: targetIds,
        action,
        payload
      }, { headers: { 'Authorization': `Bearer ${token}` } });
      
      if (undoData) {
         if (action === 'COPY' && res.data.createdIds) {
             undoData.fileIds = res.data.createdIds;
         }
         setToastMessage({ message: res.data.message, timestamp: Date.now(), undoAction: undoData.action, undoPayload: undoData.payload, undoFileIds: undoData.fileIds });
      } else if (specificIds) {
         setToastMessage({ message: "Action Undone Successfully", timestamp: Date.now() });
      } else {
         setToastMessage({ message: res.data.message, timestamp: Date.now() });
      }
      setTimeout(() => setToastMessage(null), 5 * 60 * 1000); // Hide after 5m
      
      setSelectedFileIds([]);
      setShowBulkMoveModal(false);
      setShowBulkCopyModal(false);
      setShowRenameModal(false);
      setShowTagModal(false);
      fetchFiles();
    } catch (error: any) {
      setAlertConfig({ title: `Bulk ${action} Failed`, message: error.response?.data?.error || 'An error occurred', isError: true });
    } finally {
      setIsBulkProcessing(false);
    }
  };

  const handleUndo = () => {
    if (toastMessage?.undoAction && toastMessage?.undoFileIds) {
      handleBulkAction(toastMessage.undoAction, toastMessage.undoPayload, undefined, toastMessage.undoFileIds);
      setToastMessage(null);
    }
  };

  const handleBulkDelete = async () => {
    const ok = await confirm({
      title: 'Delete files',
      message: `Permanently delete ${selectedFileIds.length} file${selectedFileIds.length > 1 ? 's' : ''}?`,
      confirmText: 'Delete',
      destructive: true
    });
    if (!ok) return;
    handleBulkAction('DELETE');
  };

  const handleBulkMove = () => {
    const departmentsMap: Record<number, string> = {};
    selectedFileIds.forEach(id => {
      const file = files.find(f => f.id === id);
      if (file) departmentsMap[id] = file.department;
    });
    handleBulkAction('MOVE', { targetDepartment: bulkMoveDept, targetFolder: bulkMoveFolder || null }, { action: 'MOVE', payload: { departmentsMap }, fileIds: selectedFileIds });
  };

  const handleBulkCopy = () => {
    handleBulkAction(
      'COPY',
      {
        targetDepartment: bulkCopyDept,
        target_department: bulkCopyDept,
        destinationDepartment: bulkCopyDept,
        targetFolder: bulkCopyFolder || null,
        target_folder: bulkCopyFolder || null,
        destinationFolder: bulkCopyFolder || null
      },
      { action: 'DELETE_COPIES', payload: {}, fileIds: [] }
    );
  };

  const handleBulkRename = () => {
    const renames: Record<number, string> = {};
    const folders: Record<number, string | null> = {};
    const oldNamesMap: Record<number, string> = {};
    selectedFileIds.forEach((id, index) => {
      const file = files.find(f => f.id === id);
      if (file) {
        oldNamesMap[id] = file.original_name;
        if (Object.prototype.hasOwnProperty.call(renameFolderOverrides, id)) {
          folders[id] = renameFolderOverrides[id];
        }
        if (renameCsvOverrides[id]) {
          renames[id] = renameCsvOverrides[id];
          return;
        }
        const dotIndex = file.original_name.lastIndexOf('.');
        const hasExtension = dotIndex > 0;
        const baseName = hasExtension ? file.original_name.slice(0, dotIndex) : file.original_name;
        const extension = hasExtension ? file.original_name.slice(dotIndex + 1) : '';
        const base = renameText.trim() || baseName;
        const seq = renameSequenceStart !== "" ? String(Number(renameSequenceStart) + index).padStart(2, '0') : "";
        const seqPart = seq ? `-${seq}` : "";
        const nextName = `${renamePrefix}${base}${renameSuffix}${seqPart}`;
        renames[id] = extension ? `${nextName}.${extension}` : nextName;
      }
    });
    handleBulkAction(
      'RENAME',
      { renames, renameMap: renames, names: renames, folders, folderMap: folders, paths: folders },
      { action: 'RENAME', payload: { renames: oldNamesMap }, fileIds: selectedFileIds }
    );
  };

  useEffect(() => {
    if (!showRenameModal) {
      setRenameCsvOverrides({});
      setRenameFolderOverrides({});
      setRenameCsvInputKey((k) => k + 1);
    }
  }, [showRenameModal]);

  const downloadRenameCsvTemplate = () => {
    const header = 'file_id,prev_name,prev_path,new_name,new_path';
    const lines = selectedFileIds
      .map((id, index) => {
        const file = files.find((f) => f.id === id);
        if (!file) return null;
        const dotIndex = file.original_name.lastIndexOf('.');
        const hasExtension = dotIndex > 0;
        const originalBase = hasExtension ? file.original_name.slice(0, dotIndex) : file.original_name;
        const ext = hasExtension ? file.original_name.slice(dotIndex + 1) : '';
        const base = renameText.trim() || originalBase;
        const seq = renameSequenceStart !== "" ? String(Number(renameSequenceStart) + index).padStart(2, '0') : "";
        const seqPart = seq ? `-${seq}` : "";
        const renamed = `${renamePrefix}${base}${renameSuffix}${seqPart}`;
        const suggested = ext ? `${renamed}.${ext}` : renamed;
        return [
          escapeCsv(String(id)),
          escapeCsv(file.original_name),
          escapeCsv(file.folder || ''),
          escapeCsv(renameCsvOverrides[id] || suggested),
          escapeCsv(String(renameFolderOverrides[id] ?? file.folder ?? ''))
        ].join(',');
      })
      .filter(Boolean) as string[];
    const csv = [header, ...lines].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bulk_rename_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const applyRenameCsv = async (file: File) => {
    try {
      const text = await file.text();
      const { headers, rows } = parseCsvTable(text);
      if (rows.length === 0) {
        setAlertConfig({ title: 'Invalid CSV', message: 'CSV is empty.', isError: true });
        return;
      }
      const overrides: Record<number, string> = {};
      const folderOverrides: Record<number, string | null> = {};
      rows.forEach((cols) => {
        const fileId = Number(getCsvCell(headers, cols, 'file_id'));
        let target = files.find((f) => selectedFileIds.includes(f.id) && f.id === fileId);
        if (!target) {
          const prevName = getCsvCell(headers, cols, 'prev_name');
          const prevPath = getCsvCell(headers, cols, 'prev_path');
          target = files.find((f) =>
            selectedFileIds.includes(f.id) &&
            f.original_name === prevName &&
            (prevPath ? String(f.folder || '') === prevPath : true)
          );
        }
        if (!target) return;
        const nextName = getCsvCell(headers, cols, 'new_name');
        const nextPath = getCsvCell(headers, cols, 'new_path');
        if (nextName) overrides[target.id] = nextName;
        if (nextPath !== '') {
          folderOverrides[target.id] = nextPath;
        } else if (headers.includes('new_path')) {
          folderOverrides[target.id] = null;
        }
      });
      setRenameCsvOverrides(overrides);
      setRenameFolderOverrides(folderOverrides);
      const changed = new Set([...Object.keys(overrides), ...Object.keys(folderOverrides)]).size;
      setAlertConfig({ title: 'CSV Applied', message: `Loaded ${changed} override row(s).`, isError: false });
    } catch {
      setAlertConfig({ title: 'CSV Error', message: 'Failed to read CSV file.', isError: true });
    } finally {
      setRenameCsvInputKey((k) => k + 1);
    }
  };

  const handleBulkDownload = () => {
    const token = localStorage.getItem('token');
    const url = apiUrl(`/api/files/bulk/download?ids=${selectedFileIds.join(',')}`);
    
    fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
      .then(res => {
        if (!res.ok) throw new Error("Download failed");
        return res.blob();
      }).then(blob => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `smartvault_bulk_${selectedFileIds.length}_files.zip`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setToastMessage({ message: `Downloaded ${selectedFileIds.length} files successfully.`, timestamp: Date.now() });
        setTimeout(() => setToastMessage(null), 5 * 60 * 1000);
        setSelectedFileIds([]);
      }).catch(err => {
        console.error(err);
        setAlertConfig({ title: 'Download Error', message: 'Failed to download zip.', isError: true });
      });
  };

  const getFileIcon = (mimeType: string, iconSize: number = 24) => {
    if (!mimeType) return <FileIcon size={iconSize} className="text-[rgba(0,0,0,0.48)]" />;
    if (mimeType.includes('image')) return <ImageIcon size={iconSize} className="text-[#0066cc]" />;
    if (mimeType.includes('pdf') || mimeType.includes('document') || mimeType.includes('text') || mimeType.includes('sheet') || mimeType.includes('word')) return <FileText size={iconSize} className="text-[#0066cc]" />;
    if (mimeType.includes('zip') || mimeType.includes('compressed')) return <FileArchive size={iconSize} className="text-[rgba(0,0,0,0.8)]" />;
    return <FileIcon size={iconSize} className="text-[rgba(0,0,0,0.48)]" />;
  };

  const formatBytes = (bytes: number) => {
    if (!bytes || bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const { totalStorage, totalFiles, mediaCount, docCount, departmentStats } = useMemo(() => {
    let storage = 0;
    let media = 0;
    let docs = 0;
    const depts: Record<string, { count: number, storage: number }> = {};

    if (Array.isArray(files)) {
      files.forEach(f => {
        const size = Number(f.size_bytes) || 0;
        storage += size;
        
        const mime = (f.mime_type || '').toLowerCase();
        if (mime.includes('video') || mime.includes('audio')) {
          media++;
        } else {
          docs++;
        }

        const d = f.department || 'Uncategorized';
        if (!depts[d]) depts[d] = { count: 0, storage: 0 };
        depts[d].count++;
        depts[d].storage += size;
      });
    }

    const deptArray = Object.keys(depts).map(key => ({
      name: key,
      count: depts[key].count,
      storageFormatted: formatBytes(depts[key].storage),
      // No hardcoded department names — stable color by name hash.
      color: (() => {
        const palette = ['bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500', 'bg-orange-500', 'bg-indigo-500', 'bg-teal-500'];
        const s = String(key || '');
        let h = 0;
        for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        return palette[h % palette.length] || 'bg-gray-500';
      })()
    }));

    return {
      totalStorage: formatBytes(storage),
      totalFiles: Array.isArray(files) ? files.length : 0,
      mediaCount: media,
      docCount: docs,
      departmentStats: deptArray
    };
  }, [files]);

  // Dynamic folders calculation — shows only direct children at current navigation level
  const dynamicFolders = useMemo(() => {
    if (activeDepartment === 'All files') return [];
    // Collect all known full paths (from structure + from actual file data)
    const allPaths = new Set<string>(deptFoldersMap[activeDepartment] || []);
    if (Array.isArray(files)) {
      files.forEach(f => {
        if (f.department === activeDepartment && f.folder && f.folder !== 'null' && f.folder !== 'undefined') {
          // Add every ancestor segment of the file's folder path
          const parts = String(f.folder).split('/');
          for (let i = 1; i <= parts.length; i++) {
            allPaths.add(parts.slice(0, i).join('/'));
          }
        }
      });
    }
    if (!activeFolder) {
      // At root: show only top-level folders (no '/' in path)
      return Array.from(allPaths).filter(p => !p.includes('/')).sort((a, b) => a.localeCompare(b));
    } else {
      // Inside a folder: show only direct children (prefix matches and exactly one more segment)
      const prefix = activeFolder + '/';
      return Array.from(allPaths)
        .filter(p => p.startsWith(prefix) && !p.slice(prefix.length).includes('/'))
        .sort((a, b) => a.localeCompare(b));
    }
  }, [files, activeDepartment, activeFolder, deptFoldersMap]);

  // Active subfolder within the dept view (Moved to top of component)

  const filteredFiles = Array.isArray(files) ? files.filter((file) => {
    const matchesSearch = (file.original_name || '').toLowerCase().includes(searchQuery.toLowerCase());
    let matchesType = true;
    const mime = (file.mime_type || '').toLowerCase();
    if (activeFilter === 'Images') matchesType = mime.includes('image');
    else if (activeFilter === 'Documents') matchesType = mime.includes('pdf') || mime.includes('document') || mime.includes('text') || mime.includes('sheet') || mime.includes('word');
    else if (activeFilter === 'Videos') matchesType = mime.includes('video');
    const matchesDept = activeDepartment === 'All files' || file.department === activeDepartment;
    let matchesFolder = true;
    const isValidFolder = (f: string) => f && f !== 'null' && f !== 'undefined' && f !== '';
    
    if (activeDepartment !== 'All files') {
      if (activeFolder) {
        matchesFolder = file.folder === activeFolder;
      } else {
        // Show files that have NO folder
        matchesFolder = !isValidFolder(file.folder);
      }
    }
    return matchesSearch && matchesType && matchesDept && matchesFolder;
  }) : [];

  const goToSearchLocation = (file: any, segment: 'company' | 'fy' | 'dept' | 'folder' | 'open') => {
    const params = new URLSearchParams(searchParams);
    if (file.company_id) params.set('companyId', String(file.company_id));
    if (file.fy_id) params.set('fyId', String(file.fy_id));
    if (file.department) params.set('dept', file.department);

    if (segment === 'company') {
      params.set('dept', 'All files');
      setActiveFolder(null);
      params.delete('folder');
    } else if (segment === 'fy' || segment === 'dept' || segment === 'open') {
      setActiveFolder(file.folder || null);
      if (file.folder) params.set('folder', file.folder);
      else params.delete('folder');
    } else if (segment === 'folder') {
      setActiveFolder(file.folder || null);
      if (file.folder) params.set('folder', file.folder);
    }

    params.delete('q');
    params.delete('scope');
    router.push(`${pathname}?${params.toString()}`);
  };

  const renderSearchPath = (file: any) => {
    if (!searchQuery) return null;
    const segments = [
      { key: 'company', label: file.company_name || `Company ${file.company_id || '-'}` },
      { key: 'fy', label: file.fy_name || `FY ${file.fy_id || '-'}` },
      { key: 'dept', label: file.department || 'Department' },
      ...(file.folder ? [{ key: 'folder', label: file.folder }] : []),
      { key: 'file', label: file.user_alias || file.custom_name || file.auto_name || file.original_name || 'File' }
    ] as const;

    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[var(--text-tertiary)]">
        {segments.map((segment, idx) => (
          <div key={`${file.id}-${segment.key}-${idx}`} className="flex items-center gap-1">
            {segment.key !== 'file' ? (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  goToSearchLocation(file, segment.key as 'company' | 'fy' | 'dept' | 'folder');
                }}
                className="underline-offset-2 hover:underline hover:text-[var(--accent)] transition-colors"
              >
                {segment.label}
              </button>
            ) : (
              <span className="font-medium text-[var(--text-secondary)]">{segment.label}</span>
            )}
            {idx < segments.length - 1 && <span>›</span>}
          </div>
        ))}
      </div>
    );
  };

  useEffect(() => {
    if (!focusFileIdParam) return;
    const id = Number(focusFileIdParam);
    if (!id || Number.isNaN(id)) return;
    const el = document.getElementById(`file-card-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightedFileId(id);
    const t = window.setTimeout(() => setHighlightedFileId(null), 2200);
    return () => window.clearTimeout(t);
  }, [focusFileIdParam, filteredFiles.length, viewMode]);

  useEffect(() => {
    if (!openFileIdParam) return;
    const id = Number(openFileIdParam);
    if (!id || Number.isNaN(id)) return;
    const file = files.find((f) => f.id === id);
    if (file) setSelectedFile(file);
  }, [openFileIdParam, files]);

  if (loading) {
    return <div className="p-8 text-[rgba(0,0,0,0.48)] text-[17px] font-normal tracking-[-0.374px]">Loading vault data...</div>;
  }

  const filters = ['All', 'Images', 'Documents', 'Videos'];

  const renderOverview = () => {
    return (
      <div className="w-full flex flex-col gap-6 md:gap-8">
        
        {/* Header Context Board */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-6">
          <div>
            <h2 className="text-[26px] sm:text-[32px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] mb-1">Company Vault Overview</h2>
            <p className="text-[15px] font-normal tracking-[-0.24px] text-[var(--text-secondary)]">
              {companyId && fyId ? `Showing files for selected Company & Financial Year` : 'Loading context...'}
            </p>
          </div>
          <div className="flex flex-col md:items-end">
            <span className="text-[14px] font-medium tracking-[-0.224px] text-[var(--text-primary)] opacity-80">{totalFiles} files in this FY</span>
            <span className="text-[13px] font-normal tracking-[-0.12px] text-[var(--text-tertiary)] flex items-center gap-2 mt-1">
              <HardDrive size={14} /> Storage: {totalStorage}
            </span>
          </div>
        </div>

        {/* Hero Stats Row */}
        <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[16px] md:rounded-[18px] p-4 md:p-[24px] flex flex-col justify-between shadow-[var(--shadow-subtle)]">
            <span className="text-[14px] font-medium tracking-[-0.224px] text-[var(--text-secondary)] mb-2">Total files</span>
            <span className="text-[28px] sm:text-[36px] font-semibold text-[var(--text-primary)] tracking-[-0.004em]">{totalFiles}</span>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[16px] md:rounded-[18px] p-4 md:p-[24px] flex flex-col justify-between shadow-[var(--shadow-subtle)]">
            <span className="text-[14px] font-medium tracking-[-0.224px] text-[var(--text-secondary)] mb-2">Video/Audio</span>
            <span className="text-[28px] sm:text-[36px] font-semibold text-[var(--text-primary)] tracking-[-0.004em]">{mediaCount}</span>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[16px] md:rounded-[18px] p-4 md:p-[24px] flex flex-col justify-between shadow-[var(--shadow-subtle)]">
            <span className="text-[14px] font-medium tracking-[-0.224px] text-[var(--text-secondary)] mb-2">Documents</span>
            <span className="text-[28px] sm:text-[36px] font-semibold text-[var(--text-primary)] tracking-[-0.004em]">{docCount}</span>
          </div>
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[16px] md:rounded-[18px] p-4 md:p-[24px] flex flex-col justify-between shadow-[var(--shadow-subtle)]">
            <span className="text-[14px] font-medium tracking-[-0.224px] text-[var(--text-secondary)] mb-2">Storage used</span>
            <span className="text-[28px] sm:text-[36px] font-semibold text-[var(--text-primary)] tracking-[-0.004em] break-words">{totalStorage}</span>
          </div>
        </div>

        {/* Live Storage Banner */}
        <div className="w-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[18px] p-4 md:p-5 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-[#34c759] opacity-60 animate-pulse shrink-0"></div>
            <span className="text-[14px] font-semibold tracking-[-0.24px] text-[var(--text-primary)]">
              Storage status for selected company/FY
            </span>
          </div>
          {Array.isArray(storageOverview?.storage_devices) && storageOverview.storage_devices.length > 0 ? (
            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 gap-2">
              {storageOverview.storage_devices.slice(0, 6).map((d: any, idx: number) => (
                <div key={`${d.path}-${idx}`} className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-[var(--text-primary)]">{d.label}</span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">{d.used_percent == null ? 'N/A' : `${d.used_percent}%`}</span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-full bg-[var(--bg-neutral)] overflow-hidden">
                    <div className="h-full bg-[var(--accent)]" style={{ width: `${Math.max(0, Math.min(100, Number(d.used_percent || 0)))}%` }} />
                  </div>
                  <div className="mt-2 text-[11px] text-[var(--text-secondary)]">
                    {d.unavailable ? 'Path unavailable' : `${formatBytes(d.used_bytes)} / ${formatBytes(d.total_bytes)}`}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <span className="text-[13px] text-[var(--text-secondary)]">Storage telemetry unavailable.</span>
          )}

          {requiredDown.length > 0 && (
            <div className="rounded-[14px] border border-[#ff3b30]/25 bg-[#ff3b30]/10 p-3 text-[13px] text-[#ff5b52]">
              <span className="font-semibold">Storage warning:</span> Required drive(s) missing — {requiredDown.map((d: any) => d.label).join(', ')}. Upload/stream operations may be unavailable until re-mounted.
            </div>
          )}
        </div>

        {/* Department Folders Grid */}
        <div>
          <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] mb-6">Department Archives</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
            {departmentStats
              .filter(dept => userRole === 'Admin' || dept.name === userDept || userAllowedDepts.includes(dept.name))
              .map((dept) => (
              <button 
                key={dept.name}
                onClick={() => {
                  const params = new URLSearchParams(searchParams);
                  params.set('dept', dept.name);
                  params.delete('upload');
                  router.push(`${pathname}?${params.toString()}`);
                }}
                className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 md:p-[28px] flex items-start gap-4 md:gap-5 md:hover:scale-[1.01] hover:bg-[var(--bg-elevated)] hover:shadow-[var(--shadow-medium)] transition-all text-left group cursor-pointer"
              >
                <div className="w-[52px] h-[52px] rounded-[12px] bg-[var(--bg-neutral)] flex items-center justify-center shrink-0 group-hover:bg-[var(--bg-elevated)] transition-colors">
                  <Folder className="text-black dark:text-zinc-500" size={26} />
                </div>
                <div className="flex flex-col flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[17px] font-semibold tracking-[-0.374px] text-[var(--text-primary)]">{dept.name}</span>
                    <div className={`w-2 h-2 rounded-full ${dept.color} opacity-80`}></div>
                  </div>
                  <span className="text-[14px] font-normal tracking-[-0.224px] text-[var(--text-secondary)] mt-1">{dept.count} files • {dept.storageFormatted}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-[1440px] mx-auto p-4 sm:p-6 md:p-10 w-full flex flex-col gap-6 md:gap-8 pb-28">

      {activeDepartment === 'All files' ? (
        renderOverview()
      ) : (
        <>
          {/* Header Area */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 mb-4 md:mb-6">
            <h1 className="text-[30px] sm:text-[40px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] leading-[1.1] break-words">
              {activeDepartment}
            </h1>

            <div className="flex items-center gap-2">
              <button 
                onClick={() => setShowAliasModal(true)}
                title="Manage My Names (CSV)"
                className="w-[36px] h-[36px] rounded-[12px] bg-[var(--bg-neutral)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--accent)] transition-all border border-[var(--border-subtle)] flex items-center justify-center shrink-0"
              >
                <Edit2 size={16} />
              </button>
              <button 
                onClick={toggleDarkMode}
                className="p-2 rounded-[12px] bg-[var(--bg-neutral)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] transition-all border border-[var(--border-subtle)]"
              >
                {isDarkMode ? <Sun size={20} /> : <Moon size={20} />}
              </button>

              
              <div className="flex items-center bg-[var(--bg-neutral)] rounded-[10px] p-1 ml-2 border border-[var(--border-subtle)]">
                <button onClick={() => setViewMode('grid')} className={`p-1.5 rounded-[7px] transition-all ${viewMode === 'grid' ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                  <LayoutGrid size={16} />
                </button>
                <button onClick={() => setViewMode('list')} className={`p-1.5 rounded-[7px] transition-all ${viewMode === 'list' ? 'bg-[var(--bg-surface)] shadow-sm text-[var(--accent)]' : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'}`}>
                  <ListIcon size={16} />
                </button>
              </div>
            </div>
          </div>

          {/* Department Dashboard Widgets */}
          {!activeFolder && <DepartmentDashboard department={activeDepartment} companyId={companyId} fyId={fyId} />}

          {/* Sub-Folder Grid */}
          {activeDepartment !== 'All files' && (
            <div>
              {/* Multi-level breadcrumb */}
              <div className="flex items-center flex-wrap gap-1.5 mb-4">
                <button
                  onClick={() => {
                    const params = new URLSearchParams(searchParams);
                    params.delete('folder');
                    setActiveFolder(null);
                    router.replace(`${pathname}?${params.toString()}`);
                  }}
                  className={`text-[15px] font-bold tracking-[-0.374px] transition-colors ${
                    !activeFolder ? 'text-[var(--text-primary)]' : 'text-[var(--accent)] hover:opacity-80'
                  }`}
                >
                  {activeDepartment}
                </button>
                {activeFolder && activeFolder.split('/').map((seg, idx, arr) => {
                  const segPath = arr.slice(0, idx + 1).join('/');
                  const isLast = idx === arr.length - 1;
                  return (
                    <span key={segPath} className="flex items-center gap-1.5">
                      <span className="text-[var(--text-tertiary)] opacity-40 font-normal">/</span>
                      {isLast ? (
                        <span className="text-[15px] font-bold text-[var(--text-primary)] tracking-[-0.374px]">{seg}</span>
                      ) : (
                        <button
                          onClick={() => {
                            const params = new URLSearchParams(searchParams);
                            params.set('folder', segPath);
                            setActiveFolder(segPath);
                            router.replace(`${pathname}?${params.toString()}`);
                          }}
                          className="text-[15px] font-bold text-[var(--accent)] hover:opacity-80 transition-opacity tracking-[-0.374px]"
                        >
                          {folderAliasMap[`${activeDepartment}::${segPath}`]?.split('/').pop() || seg}
                        </button>
                      )}
                    </span>
                  );
                })}
                {activeFolder && (
                  <button
                    onClick={() => {
                      // Go up one level
                      const parts = activeFolder.split('/');
                      const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null;
                      const params = new URLSearchParams(searchParams);
                      if (parentPath) {
                        params.set('folder', parentPath);
                        setActiveFolder(parentPath);
                      } else {
                        params.delete('folder');
                        setActiveFolder(null);
                      }
                      router.replace(`${pathname}?${params.toString()}`);
                    }}
                    className="ml-2 text-[12px] font-bold text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors uppercase tracking-wider"
                  >
                    ← Back
                  </button>
                )}
              </div>

              {/* Folder cards: show subfolders of current level */}
              {dynamicFolders.length > 0 && (
                <div className="grid grid-cols-1 min-[420px]:grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
                  {dynamicFolders.map(folderPath => {
                    const folderName = folderAliasMap[`${activeDepartment}::${folderPath}`]?.split('/').pop() || folderPath.split('/').pop() || folderPath;
                    // Count files at this exact path AND files in any sub-path
                    const folderCount = Array.isArray(files)
                      ? files.filter(f =>
                          f.department === activeDepartment &&
                          (f.folder === folderPath || String(f.folder || '').startsWith(folderPath + '/'))
                        ).length
                      : 0;
                    const directFileCount = Array.isArray(files)
                      ? files.filter(f => f.department === activeDepartment && f.folder === folderPath).length
                      : 0;
                    return (
                      <div
                        key={folderPath}
                        onClick={() => {
                          const params = new URLSearchParams(searchParams);
                          params.set('folder', folderPath);
                          setActiveFolder(folderPath);
                          router.replace(`${pathname}?${params.toString()}`);
                        }}
                        className="group bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[14px] p-4 flex flex-col items-start gap-3 hover:border-[var(--accent)] hover:shadow-[var(--shadow-medium)] transition-all text-left cursor-pointer"
                      >
                        <div className="w-full flex justify-between items-start">
                          <div className="w-10 h-10 rounded-[10px] bg-[var(--bg-neutral)] flex items-center justify-center group-hover:bg-[var(--bg-elevated)] transition-colors">
                            <Folder size={20} className="text-black dark:text-zinc-500 opacity-80" />
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setQrFile({
                                isFolder: true,
                                original_name: folderPath,
                                department: activeDepartment,
                                id: `?dept=${encodeURIComponent(activeDepartment)}&folder=${encodeURIComponent(folderPath)}`
                              });
                            }}
                            className="p-1.5 rounded-md text-[var(--text-tertiary)] hover:text-[var(--accent)] hover:bg-[var(--bg-neutral)] transition-colors"
                            title="Share Folder QR"
                          >
                            <QrCode size={16} />
                          </button>
                        </div>
                        <div>
                          <p className="text-[14px] font-semibold text-[var(--text-primary)] leading-tight">{folderName}</p>
                          <p className="text-[12px] text-[var(--text-secondary)] mt-0.5">
                            {directFileCount} file{directFileCount !== 1 ? 's' : ''}
                            {folderCount > directFileCount && ` · ${folderCount - directFileCount} in subfolders`}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

      {!Array.isArray(files) ? (
        <div className="text-[17px] font-normal tracking-[-0.374px] text-[#e30000]">
          Error loading files from database: {(files as any)?.error || "Unknown error"}
        </div>
      ) : userRole !== 'Admin' && activeDepartment !== 'All files' && activeDepartment !== userDept && !userAllowedDepts.includes(activeDepartment) ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-surface)] rounded-[18px] border border-[var(--border-subtle)]">
          <div className="w-12 h-12 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center mb-4">
            <Shield className="text-[#ff3b30]" size={24} />
          </div>
          <h3 className="text-[20px] font-semibold text-[var(--text-primary)] tracking-[-0.374px] mb-2">Access Restricted</h3>
          <p className="text-[15px] font-normal tracking-[-0.24px] text-[var(--text-secondary)] max-w-[300px]">
            You don't have permission to view files in the {activeDepartment} department.
          </p>
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center p-12 text-center bg-[var(--bg-surface)] rounded-[18px] border border-red-200 shadow-sm">
          <AlertCircle className="text-red-500 mb-4" size={32} />
          <h3 className="text-[18px] font-semibold text-[var(--text-primary)] mb-2">Failed to load files</h3>
          <p className="text-[14px] text-[var(--text-secondary)] mb-6 max-w-md">{error}</p>
          <button onClick={() => fetchFiles()} className="px-5 py-2.5 bg-[var(--accent)] text-white rounded-[12px] font-semibold text-[14px] hover:opacity-90 transition-all">
            Try Again
          </button>
        </div>
      ) : filteredFiles.length === 0 ? (
        <div className="text-[15px] sm:text-[17px] font-normal tracking-[-0.374px] text-[rgba(0,0,0,0.48)] py-12 px-4 flex flex-col items-center justify-center text-center border-2 border-dashed border-[var(--border-subtle)] rounded-[22px]">
          <Folder size={48} className="opacity-10 mb-4" />
          <p>
            {files.length === 0 ? 'No files uploaded yet. Click "New Upload" in the top bar to get started!' : 'No files match your search criteria.'}
          </p>
        </div>
      ) : (
        <>
          {viewMode === 'list' ? (
            <div className="flex flex-col border border-[var(--border-subtle)] rounded-[18px] bg-[var(--bg-surface)] overflow-hidden">
              <div className="hidden sm:flex items-center px-4 md:px-6 py-3 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)]">
                <div className="w-10"></div>
                <div className="flex-1 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider">Name</div>
                <div className="w-32 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider hidden sm:block">Size</div>
                <div className="w-32 text-[12px] font-semibold text-[var(--text-secondary)] uppercase tracking-wider hidden md:block">Date</div>
              </div>
              {filteredFiles.map((file) => (
                <div 
                  key={file.id} 
                  id={`file-card-${file.id}`}
                  onClick={() => toggleFileSelection(file.id)}
                  onDoubleClick={() => setSelectedFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className={`flex items-center px-4 md:px-6 py-4 hover:bg-[var(--bg-neutral)] transition-colors border-b border-[rgba(0,0,0,0.04)] last:border-0 cursor-pointer ${selectedFileIds.includes(file.id) ? 'bg-[var(--accent-soft)]' : ''} ${highlightedFileId === file.id ? 'bg-[var(--accent-soft)] ring-1 ring-[var(--accent)] ring-inset' : ''}`}
                >
                  <div className="w-10 flex items-center">
                    <div className={`w-5 h-5 rounded-[6px] border flex items-center justify-center transition-colors ${selectedFileIds.includes(file.id) ? 'bg-[#007AFF] border-[#007AFF]' : 'border-[rgba(0,0,0,0.15)] bg-white'}`}>
                      {selectedFileIds.includes(file.id) && (
                        <span className="text-white text-[11px] font-bold">{selectedFileIds.indexOf(file.id) + 1}</span>
                      )}
                    </div>
                  </div>
                  <div className="flex-1 flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-[8px] bg-[#f5f5f7] flex items-center justify-center shrink-0">
                      {getFileIcon(file.mime_type, 16)}
                    </div>
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[15px] font-medium text-[#1d1d1f] truncate">
                          {file.user_alias || file.custom_name || file.auto_name || file.original_name}
                        </span>
                        {searchQuery && (
                          <>
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${file.fy_status === 'Active' ? 'text-[#34c759] border-[#34c75940] bg-[#34c75910]' : 'text-[var(--text-secondary)] border-[var(--border-subtle)] bg-[var(--bg-neutral)]'}`}>
                              {file.fy_status === 'Active' ? 'Current' : (file.fy_status || 'FY')}
                            </span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                goToSearchLocation(file, 'open');
                              }}
                              className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                            >
                              Open folder
                            </button>
                          </>
                        )}
                      </div>
                      {renderSearchPath(file)}
                    </div>
                    {starredIds.has(file.id) && <Star size={14} className="text-[#ffcc00] fill-[#ffcc00] shrink-0" />}
                  </div>
                  <div className="w-32 text-[13px] text-[var(--text-secondary)] hidden sm:block">
                    {file.size_bytes ? (file.size_bytes / 1024).toFixed(2) + ' KB' : 'Unknown'}
                  </div>
                  <div className="w-32 text-[13px] text-[var(--text-secondary)] hidden md:block">
                    {file.upload_date ? new Date(file.upload_date).toLocaleDateString() : 'Just now'}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 md:gap-6">
              {filteredFiles.map((file) => (
                <div 
                  key={file.id} 
                  id={`file-card-${file.id}`}
                  onClick={() => toggleFileSelection(file.id)}
                  onDoubleClick={() => setSelectedFile(file)}
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  className={`bg-[var(--bg-surface)] rounded-[18px] border ${selectedFileIds.includes(file.id) ? 'border-[var(--accent)] shadow-[0_0_0_1px_var(--accent)_inset] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)]'} ${highlightedFileId === file.id ? 'ring-2 ring-[var(--accent)]' : ''} p-5 md:p-[28px] flex flex-col gap-4 transition-all md:hover:scale-[1.02] hover:shadow-[var(--shadow-medium)] cursor-pointer relative select-none`}
                >
                  <div className="absolute top-4 right-4 z-10">
                    <button onClick={(e) => { e.stopPropagation(); toggleStar(file.id); }}>
                      <Star
                        size={18}
                        className={`transition-colors ${starredIds.has(file.id) ? 'text-[#ffcc00] fill-[#ffcc00]' : 'text-[rgba(0,0,0,0.15)] hover:text-[#ffcc00] hover:fill-[#ffcc00]'}`}
                      />
                    </button>
                  </div>

                  <div className="w-[48px] h-[48px] rounded-[11px] bg-[#f5f5f7] flex items-center justify-center mb-2">
                    {getFileIcon(file.mime_type)}
                  </div>

                  <div className="flex flex-col flex-1">
                    <span className="text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f] line-clamp-2 leading-[1.24] mb-2 break-words">
                      {file.user_alias || file.custom_name || file.auto_name || file.original_name || 'Unknown File'}
                    </span>
                    {searchQuery && (
                      <div className="flex items-center gap-1.5 mb-2">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${file.fy_status === 'Active' ? 'text-[#34c759] border-[#34c75940] bg-[#34c75910]' : 'text-[var(--text-secondary)] border-[var(--border-subtle)] bg-[var(--bg-neutral)]'}`}>
                          {file.fy_status === 'Active' ? 'Current' : (file.fy_status || 'FY')}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            goToSearchLocation(file, 'open');
                          }}
                          className="text-[10px] px-1.5 py-0.5 rounded-full border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent)] hover:border-[var(--accent)] transition-colors"
                        >
                          Open folder
                        </button>
                      </div>
                    )}
                    {renderSearchPath(file)}
                    
                    <div className="mt-auto pt-4 flex flex-col gap-1 border-t border-[rgba(0,0,0,0.04)]">
                      {file.tags && file.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {file.tags.slice(0, 3).map((tag: string, i: number) => (
                            <span key={i} className="bg-[#f5f5f7] text-[#1d1d1f] text-[11px] px-2 py-0.5 rounded-[4px] font-medium tracking-[-0.1px]">{tag}</span>
                          ))}
                          {file.tags.length > 3 && <span className="bg-[#f5f5f7] text-[rgba(0,0,0,0.48)] text-[11px] px-2 py-0.5 rounded-[4px] font-medium tracking-[-0.1px]">+{file.tags.length - 3}</span>}
                        </div>
                      )}
                      <span className="text-[14px] font-normal tracking-[-0.224px] text-[rgba(0,0,0,0.8)]">
                        {file.size_bytes ? (file.size_bytes / 1024).toFixed(2) + ' KB' : 'Unknown size'}
                      </span>
                      <span className="text-[12px] font-normal tracking-[-0.12px] text-[rgba(0,0,0,0.48)]">
                        Uploaded: {file.upload_date ? new Date(file.upload_date).toLocaleDateString() : 'Just now'}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </>
  )}

      {/* File Viewer Modal Overlay */}
      {selectedFile && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(0,0,0,0.5)] backdrop-blur-md p-0 md:p-10 animate-in fade-in duration-200"
          onClick={() => setSelectedFile(null)}
        >
          <div 
            className="bg-[var(--bg-surface)] rounded-none md:rounded-[20px] shadow-[rgba(0,0,0,0.35)_0px_20px_60px] w-full max-w-5xl h-full md:max-h-[85vh] flex flex-col overflow-hidden animate-in zoom-in-95 duration-200 relative border border-[var(--border-subtle)]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] shrink-0">
              <h3 className="text-[15px] sm:text-[17px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] truncate pr-1 sm:pr-4 min-w-0">
                {selectedFile.original_name}
              </h3>
              
              <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
                <button
                  onClick={() => setFileToDelete(selectedFile)}
                  className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-[#ff3b3018] text-[var(--text-secondary)] hover:text-[#ff5b52] transition-colors"
                  title="Delete file"
                >
                  <Trash2 size={16} />
                </button>
                <button
                  onClick={() => handleHardDownload(selectedFile)}
                  className="hidden sm:block bg-[var(--accent)] text-white text-[14px] px-[15px] py-[6px] rounded-[980px] active:scale-[0.95] transition-transform font-medium tracking-[-0.224px] hover:opacity-90"
                >
                  Download File
                </button>
                <button 
                  onClick={() => setSelectedFile(null)}
                  className="w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors font-medium"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Viewer Content Area */}
            <div className="flex-1 overflow-auto bg-[var(--bg-app)] flex items-center justify-center p-3 sm:p-6">
              {selectedFile.mime_type?.includes('image') ? (
                previewUrl ? (
                  <img 
                    src={previewUrl} 
                    alt={selectedFile.original_name}
                    className="max-w-full max-h-full object-contain rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] cursor-zoom-in"
                  />
                ) : (
                  <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
                )
              ) : selectedFile.mime_type?.includes('video') ? (
                previewUrl ? (
                  <video
                    src={previewUrl}
                    controls
                    autoPlay={false}
                    className="max-w-full max-h-full rounded-[8px] shadow-[0_8px_32px_rgba(0,0,0,0.12)] no-invert"
                    style={{ maxHeight: '100%' }}
                  >
                    Your browser does not support video playback.
                  </video>
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
                    <span className="text-[13px] text-[rgba(0,0,0,0.48)]">Loading video...</span>
                  </div>
                )
              ) : selectedFile.mime_type?.includes('audio') ? (
                <div className="flex flex-col items-center justify-center gap-6 w-full max-w-lg">
                  <div className="w-24 h-24 rounded-full bg-[#ffffff] flex items-center justify-center shadow-[0_4px_20px_rgba(0,102,204,0.15)] border border-[rgba(0,0,0,0.04)]">
                    <Music size={40} className="text-[#0066cc]" />
                  </div>
                  <p className="text-[17px] font-semibold text-[#1d1d1f] tracking-[-0.374px] text-center max-w-xs truncate">
                    {selectedFile.user_alias || selectedFile.custom_name || selectedFile.auto_name || selectedFile.original_name}
                  </p>
                  {previewUrl ? (
                    <audio src={previewUrl} controls className="w-full no-invert" style={{ accentColor: '#0066cc' }}>
                      Your browser does not support audio playback.
                    </audio>
                  ) : (
                    <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
                  )}
                </div>
              ) : selectedFile.mime_type?.includes('pdf') || selectedFile.original_name?.match(/\.(doc|docx|xls|xlsx|ppt|pptx|odt|ods|odp)$/i) ? (
                previewUrl ? (
                  <iframe
                    src={previewUrl}
                    title={selectedFile.original_name}
                    className="w-full h-full rounded-[8px] border border-[rgba(0,0,0,0.08)] bg-[#ffffff] no-invert"
                    style={{ minHeight: '100%' }}
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
                    <span className="text-[13px] text-[rgba(0,0,0,0.48)]">Converting to PDF...</span>
                  </div>
                )
              ) : textContent !== null ? (
                <div className="w-full h-full overflow-auto bg-[#ffffff] rounded-[8px] border border-[rgba(0,0,0,0.08)] no-invert" style={{ minHeight: '100%' }}>
                  <div className="flex items-center justify-between px-4 py-2 bg-[#f5f5f7] border-b border-[rgba(0,0,0,0.06)]">
                    <span className="text-[12px] font-mono text-[rgba(0,0,0,0.48)]">{selectedFile.original_name}</span>
                    <span className="text-[11px] text-[rgba(0,0,0,0.32)]">{textContent.split('\n').length} lines</span>
                  </div>
                  <pre className="p-4 overflow-auto text-[13px] leading-[1.6] m-0" style={{ fontFamily: '"SF Mono", "Fira Code", monospace' }}>
                    <code ref={codeRef} className={`language-${selectedFile.original_name?.split('.').pop()?.toLowerCase() || 'text'}`}>
                      {textContent}
                    </code>
                  </pre>
                </div>
              ) : isCodeFile(selectedFile.original_name) || selectedFile.mime_type?.includes('text') ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-[3px] border-[rgba(0,0,0,0.08)] border-t-[#0066cc] rounded-full animate-spin"></div>
                  <span className="text-[13px] text-[rgba(0,0,0,0.48)]">Loading file...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center text-center max-w-sm">
                  <div className="w-16 h-16 rounded-full bg-[#ffffff] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] border border-[rgba(0,0,0,0.04)] mb-4">
                    {getFileIcon(selectedFile.mime_type)}
                  </div>
                  <p className="text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-2">
                    Preview not available
                  </p>
                  <p className="text-[15px] font-normal tracking-[-0.24px] text-[rgba(0,0,0,0.48)] mb-6">
                    This file type cannot be previewed in the browser. Download it to view its contents.
                  </p>
                  <button
                    onClick={() => handleHardDownload(selectedFile)}
                    className="bg-[#0066cc] text-[#ffffff] text-[17px] px-[22px] py-[11px] rounded-[980px] active:scale-[0.95] transition-transform font-medium"
                  >
                    Download Now
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Custom Alert Modal */}
      {alertConfig && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[rgba(0,0,0,0.5)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] shadow-[rgba(0,0,0,0.3)_0px_20px_40px] w-full max-w-[400px] p-6 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <h3 className={`text-[20px] font-semibold tracking-[-0.374px] mb-2 ${alertConfig.isError ? 'text-[#ff5b52]' : 'text-[var(--text-primary)]'}`}>
              {alertConfig.title}
            </h3>
            <p className="text-[15px] font-normal tracking-[-0.24px] text-[var(--text-secondary)] mb-6">
              {alertConfig.message}
            </p>
            <button 
              onClick={() => setAlertConfig(null)}
              className="w-full bg-[var(--accent)] text-white text-[17px] font-medium py-[11px] rounded-[11px] hover:opacity-90 transition-all active:scale-95"
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.5)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] shadow-[rgba(0,0,0,0.3)_0px_20px_40px] w-full max-w-[400px] p-6 relative flex flex-col items-center text-center animate-in zoom-in-95 duration-200">
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] mb-2">
              Delete Document
            </h3>
            <p className="text-[15px] font-normal tracking-[-0.24px] text-[var(--text-secondary)] mb-4">
              Are you sure you want to permanently delete "{fileToDelete.original_name}"? This action cannot be undone.
            </p>
            <div className="w-full mb-5">
              <label className="block text-left text-[13px] font-medium text-[var(--text-secondary)] mb-1.5">Reason for deletion (required)</label>
              <textarea
                value={deleteReason}
                onChange={(e) => setDeleteReason(e.target.value)}
                placeholder="e.g. Duplicate file, uploaded by mistake, compliance requirement..."
                className="w-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[11px] px-3 py-2.5 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-2 focus:outline-[#ff5b52] resize-none h-[72px]"
              />
            </div>
            <div className="flex w-full gap-3">
              <button 
                onClick={() => { setFileToDelete(null); setDeleteReason(""); }}
                className="flex-1 bg-[var(--bg-neutral)] text-[var(--text-primary)] text-[17px] font-medium py-[11px] rounded-[11px] hover:bg-[var(--bg-elevated)] transition-colors"
              >
                Cancel
              </button>
              <button 
                onClick={() => confirmDelete(fileToDelete)}
                disabled={deleteReason.trim().length === 0}
                className="flex-1 bg-[#ff5b52] text-white text-[17px] font-medium py-[11px] rounded-[11px] hover:bg-[#e6352b] transition-colors active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Upload Modal Overlay */}
      {isUploadModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[20px] md:rounded-[24px] shadow-[rgba(0,0,0,0.22)_0px_20px_40px] w-full max-w-lg max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-8 relative flex flex-col animate-in zoom-in-95 duration-200">
            <button 
              onClick={closeUploadModal}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[#f5f5f7] flex items-center justify-center hover:bg-[#e8e8ed] text-[rgba(0,0,0,0.48)] hover:text-[#1d1d1f] transition-colors"
            >
              ✕
            </button>
            <h2 className="text-[22px] sm:text-[24px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-5 sm:mb-6">
              Upload Document
            </h2>

            {mediaDown && (
              <div className="mb-5 rounded-[14px] border border-[#ff3b30]/25 bg-[#ff3b30]/10 p-3 text-[13px] text-[#ff5b52]">
                Media drive is not mounted. Uploads for video/audio (local storage) are disabled until the disk is re-connected.
              </div>
            )}

            {/* Department Selection */}
            <div className="mb-6">
              <label className="block text-[14px] font-semibold text-[rgba(0,0,0,0.8)] tracking-[-0.224px] mb-2">
                Assign to Department
              </label>
              {deptList.length === 0 && (
                <div className="mb-3 bg-[#ff950015] border border-[#ff950030] rounded-[12px] px-3 py-2 text-[13px] text-[#a15c00]">
                  No departments are set for this Company + FY yet. Create them in <span className="font-semibold">Admin → Departments &amp; Folders</span>.
                </div>
              )}
              <div className="relative z-50">
                <CustomSelect
                  value={uploadDept}
                  onChange={(val) => {
                    setUploadDept(String(val));
                    setUploadFolder("");
                  }}
                  options={[
                    { label: 'Select Department', value: '' },
                    ...deptList.map(dept => ({ label: dept, value: dept }))
                  ]}
                  placeholder="Select Department"
                />
              </div>
            </div>

            {/* Custom Tag Input */}
            <div className="mb-4">
              <label className="block text-[14px] font-semibold text-[rgba(0,0,0,0.8)] tracking-[-0.224px] mb-2">
                Custom Tag (Optional)
              </label>
              <input 
                type="text"
                placeholder="e.g. Q1Invoice, EmployeeContract"
                value={uploadCustomTag}
                onChange={(e) => setUploadCustomTag(e.target.value)}
                className="w-full bg-[#f5f5f7] rounded-[11px] px-4 py-[10px] text-[15px] border border-transparent focus:border-[#007AFF] focus:bg-white outline-none transition-all"
              />
            </div>

            {/* Folder Selector — improved UI */}
            {uploadDept && (
              <div className="mb-6">
                <label className="block text-[14px] font-semibold text-[rgba(0,0,0,0.8)] tracking-[-0.224px] mb-2">
                  Destination Folder <span className="text-[rgba(0,0,0,0.32)] font-normal">(optional)</span>
                </label>
                
                <div className="relative z-40 mb-3">
                  <CustomSelect
                    value={uploadFolder}
                    onChange={(val) => setUploadFolder(String(val))}
                    options={[
                      { label: "No folder (Root)", value: "" },
                      ...(() => {
                        const allPaths = Array.from(new Set([
                          ...(deptFoldersMap[uploadDept] || []),
                          ...files.filter(f => f.department === uploadDept && f.folder && f.folder !== 'null' && f.folder !== 'undefined').map((f: any) => f.folder)
                        ])).sort();
                        return allPaths.map(f => {
                          const depth = f.split('/').length - 1;
                          const indent = '\u00A0\u00A0\u00A0\u00A0'.repeat(depth);
                          return {
                            label: `${indent}${depth > 0 ? '└ ' : ''}${f.split('/').pop()}`,
                            value: f
                          };
                        });
                      })()
                    ]}
                  />
                </div>

                <div className="flex items-center gap-2 mb-3">
                  <div className="h-[1px] flex-1 bg-[rgba(0,0,0,0.08)]"></div>
                  <span className="text-[12px] text-[rgba(0,0,0,0.32)] font-medium uppercase tracking-wider">OR</span>
                  <div className="h-[1px] flex-1 bg-[rgba(0,0,0,0.08)]"></div>
                </div>

                <input
                  type="text"
                  placeholder="Create a new folder path (e.g. Reports/2024/Q1)"
                  value={uploadFolder}
                  onChange={(e) => setUploadFolder(e.target.value)}
                  className="w-full bg-[#f5f5f7] border border-transparent rounded-[11px] px-[16px] py-[10px] text-[15px] text-[#1d1d1f] placeholder:text-[#86868b] outline-none focus:border-[#007AFF] focus:bg-white transition-all"
                />
              </div>
            )}

            {/* Upload Zone: Single combined area */}
            <div className="flex items-center justify-between mb-3">
              <div className="flex flex-col gap-1 text-[12px] text-[rgba(0,0,0,0.48)]">
                <span>CSV columns: `row_id,prev_name,prev_path,new_name,new_path` (do not change `row_id`).</span>
                <span className="text-[#cc7700] font-medium flex items-center gap-1">
                  <AlertCircle size={12} />
                  Warning: Only edit new_name and new_path columns.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={uploadQueue.length === 0}
                  onClick={downloadUploadCsvTemplate}
                  className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] disabled:opacity-40"
                >
                  CSV
                </button>
                <label className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] cursor-pointer">
                  ⭱
                  <input
                    key={uploadCsvInputKey}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const csv = e.target.files?.[0];
                      if (csv) applyUploadCsv(csv);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-2 mb-3">
              <label className={`flex-1 flex flex-col items-center justify-center py-10 px-4 border-[3px] border-dashed rounded-[16px] transition-colors cursor-pointer ${
                uploading ? 'bg-[#f5f5f7] border-[rgba(0,0,0,0.08)] opacity-60 cursor-wait'
                : isDragging ? 'bg-[#e8f2ff] border-[#0071e3]'
                : 'bg-[#fafafc] border-[#d2d2d7] hover:bg-[#f5f5f7]'
              }`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
              >
                <input
                  type="file"
                  multiple
                  className="sr-only"
                  onChange={handleFileInput}
                  disabled={uploading || mediaDown}
                />
                {uploading ? (
                  <div className="w-full flex flex-col items-center">
                    <p className="text-[13px] font-medium tracking-[-0.08px] text-[#1d1d1f] mb-3">
                      {uploadText} {uploadProgress > 0 && uploadProgress < 100 ? `${uploadProgress}%` : ''}
                    </p>
                    <div className="w-full max-w-[240px] h-[6px] bg-[rgba(0,0,0,0.06)] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-[#007AFF] transition-all duration-300 ease-out rounded-full"
                        style={{ width: `${uploadProgress}%` }}
                      />
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="w-14 h-14 rounded-full bg-[#ffffff] flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.04)] mb-4 border border-[rgba(0,0,0,0.04)]">
                      <CloudUpload className="text-[#0071e3]" size={28} strokeWidth={2} />
                    </div>
                    <p className="text-[17px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-1">
                      Drag & Drop files or folders here
                    </p>
                    <p className="text-[15px] font-normal tracking-[-0.24px] text-[rgba(0,0,0,0.48)]">
                      or click to browse files
                    </p>
                  </>
                )}
              </label>
            </div>

            {uploadQueue.length > 0 && (
              <div className="mt-3">
                <h4 className="text-[13px] font-semibold text-[#1d1d1f] mb-2">Upload Confirmation ({uploadQueue.length})</h4>
                <div className="max-h-[220px] overflow-y-auto rounded-[12px] border border-[rgba(0,0,0,0.08)] bg-[#fafafc]">
                  {uploadQueue.slice(0, 20).map((item) => (
                    <div key={item.id} className="px-3 py-2 text-[12px] border-b border-[rgba(0,0,0,0.05)] last:border-b-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="truncate flex-1 text-[rgba(0,0,0,0.6)]">{item.file.name}</span>
                        <span className="text-[rgba(0,0,0,0.32)]">→</span>
                        <input
                          value={item.proposedName}
                          onChange={(e) =>
                            setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, proposedName: e.target.value } : p))
                          }
                          className="flex-1 bg-white rounded-[8px] px-2 py-1 border border-[rgba(0,0,0,0.12)] outline-none focus:border-[#007AFF]"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[rgba(0,0,0,0.45)] w-[70px] shrink-0">Path</span>
                        <input
                          value={item.proposedFolder || ''}
                          onChange={(e) =>
                            setUploadQueue((prev) => prev.map((p) => p.id === item.id ? { ...p, proposedFolder: e.target.value } : p))
                          }
                          placeholder="Root (empty)"
                          className="flex-1 bg-white rounded-[8px] px-2 py-1 border border-[rgba(0,0,0,0.12)] outline-none focus:border-[#007AFF]"
                        />
                      </div>
                    </div>
                  ))}
                </div>
                {uploadQueue.length > 20 && (
                  <div className="mt-1 text-[11px] text-[rgba(0,0,0,0.42)]">Showing first 20 rows. All queued files will be uploaded.</div>
                )}
                <div className="mt-3 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setUploadQueue([])}
                    className="px-4 py-2 rounded-[10px] text-[13px] bg-[#f5f5f7] hover:bg-[#e8e8ed]"
                  >
                    Clear
                  </button>
                  <button
                    type="button"
                    disabled={uploading || uploadQueue.length === 0}
                    onClick={() => uploadFiles(uploadQueue)}
                    className="px-4 py-2 rounded-[10px] text-[13px] bg-[#007AFF] text-white hover:bg-[#0066cc] disabled:opacity-50"
                  >
                    {uploading ? 'Uploading...' : `Confirm Upload (${uploadQueue.length})`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bulk Action Bar */}
      {selectedFileIds.length > 0 && (
        <div className="fixed bottom-3 sm:bottom-8 left-1/2 -translate-x-1/2 z-[55] animate-in slide-in-from-bottom-8 fade-in duration-300 w-[calc(100vw-1rem)] sm:w-max sm:max-w-[90vw]">
          <div className="bg-[var(--bg-surface)]/95 backdrop-blur-xl border border-[var(--border-default)] shadow-[0_8px_30px_rgba(0,0,0,0.22)] rounded-[18px] sm:rounded-[980px] px-3 sm:px-6 py-3 flex items-center gap-3 md:gap-6 overflow-x-auto hide-scrollbar">
            <span className="text-[14px] font-medium tracking-[-0.12px] text-[var(--text-primary)] whitespace-nowrap shrink-0">
              {selectedFileIds.length} item{selectedFileIds.length > 1 ? 's' : ''} selected
            </span>
            <div className="w-[1px] h-4 bg-[var(--border-default)] shrink-0"></div>
            
            <div className="flex gap-1.5 shrink-0">
              {userRole !== 'Staff' && (
                <button onClick={() => setShowBulkMoveModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                  <FolderInput size={15} /> Move
                </button>
              )}
              <button onClick={() => setShowRenameModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                <Edit2 size={15} /> Rename
              </button>
              <button onClick={() => { setBulkCopyDept(activeDepartment !== 'All files' ? activeDepartment : ''); setBulkCopyFolder(''); setShowBulkCopyModal(true); }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                <Copy size={15} /> Copy to...</button>
              <button onClick={() => setShowTagModal(true)} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                <Tag size={15} /> Tag
              </button>
              {userRole !== 'Guest' && (
                <button onClick={handleBulkDownload} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                  <Download size={15} /> ZIP
                </button>
              )}
              <button onClick={() => {
                const selected = Array.isArray(files) ? files.filter(f => selectedFileIds.includes(f.id)) : [];
                setBulkQrFiles(selected);
              }} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--text-primary)] hover:bg-[var(--bg-neutral)] transition-colors">
                <QrCode size={15} /> QR
              </button>
              {userRole === 'Admin' && (
                <button onClick={handleBulkDelete} className="flex items-center gap-1.5 px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[#ff5b52] hover:bg-[#ff3b3015] transition-colors ml-1 border border-transparent hover:border-[#ff5b52]">
                  <Trash2 size={15} /> Delete
                </button>
              )}
            </div>

            <button onClick={() => setSelectedFileIds([])} className="ml-2 w-7 h-7 shrink-0 flex items-center justify-center rounded-full bg-[var(--bg-neutral)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] transition-colors">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Bulk Move Modal */}
      {showBulkMoveModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[20px] sm:rounded-[24px] shadow-[rgba(0,0,0,0.22)_0px_20px_40px] w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-8 relative flex flex-col animate-in zoom-in-95 duration-200">
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-1">Move {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''}</h3>
            <p className="text-[14px] text-[rgba(0,0,0,0.48)] mb-5">Select destination department and folder.</p>
            
            <label className="text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.05em] mb-2 block">Department</label>
            <div className="flex flex-col gap-1.5 mb-5">
              {deptList.map(dept => (
                <button
                  key={dept}
                  onClick={() => { setBulkMoveDept(dept); setBulkMoveFolder(''); }}
                  className={`px-4 py-2 text-left rounded-[11px] text-[15px] font-medium transition-colors ${bulkMoveDept === dept ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}
                >
                  {dept}
                </button>
              ))}
            </div>

            {bulkMoveDept && (
              <>
                <label className="text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.05em] mb-2 block">Folder <span className="normal-case font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button onClick={() => setBulkMoveFolder('')} className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${bulkMoveFolder === '' ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}>No folder</button>
                  {Array.from(new Set([...(deptFoldersMap[bulkMoveDept] || []), ...dynamicFolders])).filter(Boolean).map(f => (
                    <button key={f} onClick={() => setBulkMoveFolder(f)} className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${bulkMoveFolder === f ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}>{f}</button>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowBulkMoveModal(false)} className="flex-1 bg-[#f5f5f7] text-[#1d1d1f] text-[15px] font-medium py-[10px] rounded-[11px] hover:bg-[#e8e8ed] transition-colors">Cancel</button>
              <button disabled={isBulkProcessing || !bulkMoveDept} onClick={handleBulkMove} className="flex-1 bg-[#007AFF] text-[#ffffff] text-[15px] font-medium py-[10px] rounded-[11px] hover:bg-[#0066cc] transition-colors disabled:opacity-50">
                {isBulkProcessing ? 'Moving...' : 'Move Here'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Copy Modal */}
      {showBulkCopyModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[20px] sm:rounded-[24px] shadow-[rgba(0,0,0,0.22)_0px_20px_40px] w-full max-w-sm max-h-[calc(100dvh-2rem)] overflow-y-auto p-5 sm:p-8 relative flex flex-col animate-in zoom-in-95 duration-200">
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-1">Copy {selectedFileIds.length} file{selectedFileIds.length > 1 ? 's' : ''}</h3>
            <p className="text-[14px] text-[rgba(0,0,0,0.48)] mb-5">Select destination — a copy will be created there.</p>
            
            <label className="text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.05em] mb-2 block">Department</label>
            <div className="flex flex-col gap-1.5 mb-5">
              {deptList.map(dept => (
                <button
                  key={dept}
                  onClick={() => { setBulkCopyDept(dept); setBulkCopyFolder(''); }}
                  className={`px-4 py-2 text-left rounded-[11px] text-[15px] font-medium transition-colors ${bulkCopyDept === dept ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}
                >
                  {dept}
                </button>
              ))}
            </div>

            {bulkCopyDept && (
              <>
                <label className="text-[12px] font-semibold text-[rgba(0,0,0,0.48)] uppercase tracking-[0.05em] mb-2 block">Folder <span className="normal-case font-normal">(optional)</span></label>
                <div className="flex flex-wrap gap-2 mb-5">
                  <button onClick={() => setBulkCopyFolder('')} className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${bulkCopyFolder === '' ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}>No folder</button>
                  {Array.from(new Set([...(deptFoldersMap[bulkCopyDept] || []), ...dynamicFolders])).filter(Boolean).map(f => (
                    <button key={f} onClick={() => setBulkCopyFolder(f)} className={`px-3 py-1.5 rounded-[8px] text-[13px] font-medium transition-colors ${bulkCopyFolder === f ? 'bg-[#007AFF] text-white' : 'bg-[#f5f5f7] text-[#1d1d1f] hover:bg-[#e8e8ed]'}`}>{f}</button>
                  ))}
                </div>
              </>
            )}

            <div className="flex gap-3">
              <button onClick={() => setShowBulkCopyModal(false)} className="flex-1 bg-[#f5f5f7] text-[#1d1d1f] text-[15px] font-medium py-[10px] rounded-[11px] hover:bg-[#e8e8ed] transition-colors">Cancel</button>
              <button disabled={isBulkProcessing || !bulkCopyDept} onClick={handleBulkCopy} className="flex-1 bg-[#007AFF] text-[#ffffff] text-[15px] font-medium py-[10px] rounded-[11px] hover:bg-[#0066cc] transition-colors disabled:opacity-50">
                {isBulkProcessing ? 'Copying...' : 'Copy Here'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-3 left-3 right-3 sm:left-auto sm:right-8 sm:bottom-8 z-[100] animate-in slide-in-from-bottom-8 fade-in duration-300">
          <div className="bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-subtle)] shadow-[var(--shadow-medium)] rounded-[14px] px-4 sm:px-5 py-4 flex items-center gap-3 sm:gap-4">
            <div className="flex flex-col min-w-0">
              <span className="text-[14px] font-semibold tracking-[-0.12px] text-[var(--text-primary)]">Action Completed</span>
              <span className="text-[13px] text-[var(--text-secondary)] truncate">{toastMessage.message}</span>
            </div>
            {toastMessage.undoAction && (
              <button 
                onClick={handleUndo}
                className="flex items-center gap-1.5 bg-[var(--bg-neutral)] hover:bg-[var(--bg-elevated)] px-3 py-1.5 rounded-[8px] text-[13px] font-medium text-[var(--accent)] transition-colors sm:ml-4 shrink-0"
              >
                <Undo2 size={14} /> Undo
              </button>
            )}
            <button 
              onClick={() => setToastMessage(null)}
              className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-[var(--bg-neutral)] text-[var(--text-tertiary)] transition-colors ml-auto sm:ml-1 shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Rename Preview Modal */}
      {showRenameModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[rgba(0,0,0,0.4)] backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="bg-[#ffffff] rounded-[20px] sm:rounded-[24px] shadow-[rgba(0,0,0,0.22)_0px_20px_40px] w-full max-w-2xl flex flex-col max-h-[calc(100dvh-2rem)] sm:max-h-[85vh] animate-in zoom-in-95 duration-200">
            <div className="px-5 sm:px-8 pt-5 sm:pt-8 pb-4">
              <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[#1d1d1f] mb-1">Rename {selectedFileIds.length} files</h3>
              <p className="text-[14px] text-[rgba(0,0,0,0.48)]">Set a naming pattern or base text to apply to all selected files.</p>
            </div>
            
            <div className="px-5 sm:px-8 pb-5 sm:pb-6 flex flex-col sm:flex-row gap-3 sm:gap-4 border-b border-[rgba(0,0,0,0.04)]">
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[rgba(0,0,0,0.48)] mb-1 block">Prefix</label>
                <input value={renamePrefix} onChange={e => setRenamePrefix(e.target.value)} className="w-full bg-[#f5f5f7] rounded-[11px] px-3 py-2 text-[14px] border border-transparent focus:border-[#007AFF] focus:bg-white outline-none transition-all" placeholder="e.g. [DEPT]-" />
              </div>
              <div className="flex-2 sm:w-[35%]">
                <label className="text-[12px] font-medium text-[rgba(0,0,0,0.48)] mb-1 block">Base Text</label>
                <input value={renameText} onChange={e => setRenameText(e.target.value)} className="w-full bg-[#f5f5f7] rounded-[11px] px-3 py-2 text-[14px] border border-transparent focus:border-[#007AFF] focus:bg-white outline-none transition-all" placeholder="Original Name" />
              </div>
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[rgba(0,0,0,0.48)] mb-1 block">Suffix</label>
                <input value={renameSuffix} onChange={e => setRenameSuffix(e.target.value)} className="w-full bg-[#f5f5f7] rounded-[11px] px-3 py-2 text-[14px] border border-transparent focus:border-[#007AFF] focus:bg-white outline-none transition-all" placeholder="e.g. -v2" />
              </div>
              <div className="flex-1">
                <label className="text-[12px] font-medium text-[rgba(0,0,0,0.48)] mb-1 block">Seq Start</label>
                <input type="number" value={renameSequenceStart} onChange={e => setRenameSequenceStart(e.target.value ? parseInt(e.target.value) : "")} className="w-full bg-[#f5f5f7] rounded-[11px] px-3 py-2 text-[14px] border border-transparent focus:border-[#007AFF] focus:bg-white outline-none transition-all" placeholder="e.g. 1" />
              </div>
            </div>

            <div className="px-5 sm:px-8 py-3 border-b border-[rgba(0,0,0,0.04)] flex items-center justify-between gap-3">
              <div className="flex flex-col gap-1 text-[12px] text-[rgba(0,0,0,0.48)]">
                <span>CSV columns: `file_id,prev_name,prev_path,new_name,new_path`</span>
                <span className="text-[#cc7700] font-medium flex items-center gap-1">
                  <AlertCircle size={12} />
                  Warning: Only edit new_name and new_path columns.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={downloadRenameCsvTemplate} className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed]">CSV</button>
                <label className="px-3 py-1.5 rounded-[8px] text-[12px] font-medium bg-[#f5f5f7] hover:bg-[#e8e8ed] cursor-pointer">
                  ⭱
                  <input
                    key={renameCsvInputKey}
                    type="file"
                    accept=".csv,text/csv"
                    className="sr-only"
                    onChange={(e) => {
                      const csv = e.target.files?.[0];
                      if (csv) applyRenameCsv(csv);
                    }}
                  />
                </label>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 sm:px-8 py-4 bg-[var(--bg-elevated)]">
              <h4 className="text-[13px] font-semibold text-[var(--text-primary)] mb-3">Preview Changes</h4>
              <div className="flex flex-col gap-2">
                {selectedFileIds.slice(0, 10).map((id, index) => {
                  const file = files.find(f => f.id === id);
                  if (!file) return null;
                  const dotIndex = file.original_name.lastIndexOf('.');
                  const hasExtension = dotIndex > 0;
                  const originalBase = hasExtension ? file.original_name.slice(0, dotIndex) : file.original_name;
                  const ext = hasExtension ? file.original_name.slice(dotIndex + 1) : '';
                  const base = renameText.trim() || originalBase;
                  const seq = renameSequenceStart !== "" ? String(Number(renameSequenceStart) + index).padStart(2, '0') : "";
                  const seqPart = seq ? `-${seq}` : "";
                  const renamed = `${renamePrefix}${base}${renameSuffix}${seqPart}`;
                  const generatedName = ext ? `${renamed}.${ext}` : renamed;
                  const newName = renameCsvOverrides[id] || generatedName;
                  return (
                    <div key={id} className="flex flex-col gap-1 text-[13px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[8px] px-3 py-2">
                      <div className="text-[11px] text-[var(--text-tertiary)]">#{id} | path: {String(file.folder || '') || 'Root'}</div>
                      {Object.prototype.hasOwnProperty.call(renameFolderOverrides, id) && (
                        <div className="text-[11px] text-[var(--text-tertiary)]">new path: {renameFolderOverrides[id] || 'Root'}</div>
                      )}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-0">
                      <span className="text-[var(--text-secondary)] truncate flex-1">{file.original_name}</span>
                      <span className="hidden sm:inline mx-3 text-[var(--text-tertiary)] opacity-30">→</span>
                      <span className="text-[var(--text-primary)] font-medium truncate flex-1">{newName}</span>
                      </div>
                    </div>
                  );
                })}
                {selectedFileIds.length > 10 && (
                  <div className="text-center text-[12px] text-[var(--text-tertiary)] mt-2">...and {selectedFileIds.length - 10} more</div>
                )}
              </div>
            </div>

            <div className="p-5 sm:p-6 border-t border-[var(--border-subtle)] flex justify-end gap-3 bg-[var(--bg-surface)] rounded-b-[20px] sm:rounded-b-[24px]">
              <button onClick={() => setShowRenameModal(false)} className="px-5 py-2 rounded-[11px] text-[14px] font-medium bg-[var(--bg-neutral)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
              <button disabled={isBulkProcessing} onClick={handleBulkRename} className="px-5 py-2 rounded-[11px] text-[14px] font-medium bg-[var(--accent)] text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                {isBulkProcessing ? 'Processing...' : 'Apply Rename'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tag Modal */}
      {showTagModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200">
          <div className="bg-[var(--bg-surface)] rounded-[20px] sm:rounded-[24px] shadow-[var(--shadow-medium)] w-full max-w-sm p-5 sm:p-8 relative flex flex-col animate-in zoom-in-95 duration-200">
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] mb-2">Tag {selectedFileIds.length} files</h3>
            <p className="text-[14px] text-[var(--text-secondary)] mb-6">Enter tags separated by commas.</p>
            
            <input 
              value={tagInput}
              onChange={e => setTagInput(e.target.value)}
              placeholder="Confidential, Urgent, Q3"
              className="w-full bg-[var(--bg-neutral)] rounded-[11px] px-4 py-3 text-[15px] border border-transparent focus:border-[var(--accent)] focus:bg-[var(--bg-surface)] outline-none transition-all mb-6 text-[var(--text-primary)]"
            />

            <div className="flex gap-3">
              <button onClick={() => setShowTagModal(false)} className="flex-1 bg-[var(--bg-neutral)] text-[var(--text-secondary)] text-[15px] font-medium py-[10px] rounded-[11px] hover:bg-[var(--bg-elevated)] transition-colors">Cancel</button>
              <button disabled={isBulkProcessing} onClick={() => {
                const tagsMap: Record<number, any> = {};
                selectedFileIds.forEach(id => {
                  const file = files.find(f => f.id === id);
                  if (file) tagsMap[id] = file.tags || [];
                });
                handleBulkAction('TAG', { tags: tagInput.split(',').map(t => t.trim()).filter(Boolean) }, { action: 'TAG', payload: { tagsMap }, fileIds: selectedFileIds });
              }} className="flex-1 bg-[var(--accent)] text-white text-[15px] font-medium py-[10px] rounded-[11px] hover:opacity-90 transition-opacity disabled:opacity-50">
                {isBulkProcessing ? 'Processing...' : 'Apply Tags'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Custom Context Menu */}
      {contextMenu.visible && contextMenu.file && (
        <div 
          className="fixed z-[150] bg-[var(--bg-surface)]/90 backdrop-blur-xl border border-[var(--border-subtle)] shadow-[var(--shadow-medium)] rounded-[14px] py-2 w-48 animate-in fade-in zoom-in-95 duration-100"
          style={{ top: Math.min(contextMenu.y, window.innerHeight - 200), left: Math.min(contextMenu.x, window.innerWidth - 200) }}
          onClick={(e) => e.stopPropagation()}
        >
          <button onClick={() => { setSelectedFile(contextMenu.file); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Open Preview</button>
          <div className="h-[1px] bg-[var(--border-subtle)] my-1"></div>
          <button onClick={() => { setShowBulkMoveModal(true); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Move...</button>
          <button onClick={() => { setShowRenameModal(true); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Rename...</button>
          <button onClick={() => { setShowTagModal(true); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Tags...</button>
          <button onClick={() => { setQrFile(contextMenu.file); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Share QR...</button>
          <button onClick={() => { handleHardDownload(contextMenu.file); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[var(--accent)] hover:text-white text-[14px] text-[var(--text-primary)] transition-colors">Download</button>
          <div className="h-[1px] bg-[var(--border-subtle)] my-1"></div>
          {userRole === 'Admin' && (
             <button onClick={() => { setFileToDelete(contextMenu.file); setContextMenu({ ...contextMenu, visible: false }); }} className="w-full text-left px-4 py-2 hover:bg-[#ff5b52] hover:text-white text-[14px] text-[#ff5b52] transition-colors">Delete</button>
          )}
        </div>
      )}

      {/* Single QR Code Modal */}
      {qrFile && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4 animate-in fade-in duration-200 print:bg-white print:p-0 print:block">
          <div className="bg-[var(--bg-surface)] rounded-[24px] shadow-[var(--shadow-medium)] w-full max-w-sm p-8 relative flex flex-col items-center animate-in zoom-in-95 duration-200 print:shadow-none print:max-w-full">
            <button 
              onClick={() => setQrFile(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors print:hidden"
            >
              ✕
            </button>
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[var(--text-primary)] mb-6 print:hidden">Share QR Code</h3>
            
            <div className="bg-white p-6 rounded-[16px] border border-gray-200 flex flex-col items-center justify-center mb-6 shadow-sm">
              <QRCodeSVG 
                value={`${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${qrFile.id}`} 
                size={180} 
                level={"H"} 
                includeMargin={true}
              />
              <div className="mt-4 text-center w-full max-w-[180px]">
                <p className="text-[14px] font-bold text-gray-900 truncate tracking-tight">{qrFile.original_name}</p>
                <p className="text-[11px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">{qrFile.department}</p>
                <p className="text-[11px] text-gray-400 mt-0.5">{qrFile.fy_name || 'Current FY'} • {new Date(qrFile.upload_date || Date.now()).toLocaleDateString()}</p>
              </div>
            </div>

            <button onClick={printQrCode} className="w-full flex items-center justify-center gap-2 bg-[var(--bg-neutral)] text-[var(--text-primary)] text-[15px] font-medium py-[12px] rounded-[11px] hover:bg-[var(--bg-elevated)] transition-colors print:hidden">
              <Printer size={16} /> Print Label
            </button>
          </div>
        </div>
      )}

      {/* Bulk QR Code Modal */}
      {bulkQrFiles && (
        <div className="fixed inset-0 z-[200] flex flex-col bg-[var(--bg-surface)] p-0 animate-in fade-in duration-200 overflow-hidden print:bg-white print:h-auto print:overflow-visible">
          <div className="flex items-center justify-between px-8 py-4 border-b border-[var(--border-subtle)] bg-[var(--bg-elevated)] print:hidden">
            <h3 className="text-[20px] font-semibold tracking-[-0.374px] text-[var(--text-primary)]">Bulk QR Labels ({bulkQrFiles.length})</h3>
            <div className="flex items-center gap-3">
              <button onClick={printQrCode} className="flex items-center gap-2 bg-[var(--accent)] text-white text-[15px] font-medium py-[8px] px-4 rounded-[11px] hover:opacity-90 transition-opacity">
                <Printer size={16} /> Print All Labels
              </button>
              <button onClick={() => setBulkQrFiles(null)} className="w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center hover:bg-[var(--border-subtle)] text-[var(--text-secondary)] transition-colors">
                ✕
              </button>
            </div>
          </div>
          
          <div className="flex-1 overflow-auto p-8 bg-[var(--bg-app)] print:p-0 print:bg-white">
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6 print:grid-cols-3 print:gap-4">
              {bulkQrFiles.map((file) => (
                <div key={file.id} className="bg-white p-4 rounded-[16px] border border-gray-200 flex flex-col items-center justify-center shadow-sm break-inside-avoid">
                  <QRCodeSVG 
                    value={`${typeof window !== 'undefined' ? window.location.origin : ''}/preview/${file.id}`} 
                    size={120} 
                    level={"H"} 
                    includeMargin={true}
                  />
                  <div className="mt-3 text-center w-full max-w-[120px]">
                    <p className="text-[12px] font-bold text-gray-900 truncate tracking-tight">{file.original_name}</p>
                    <p className="text-[10px] text-gray-500 mt-1 uppercase tracking-wider font-semibold">{file.department}</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">{file.fy_name || 'Current FY'}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Alias Modal */}
      {showAliasModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-[var(--bg-surface)] rounded-[24px] max-w-[500px] w-full p-6 shadow-2xl relative flex flex-col max-h-[85vh]">
            <h2 className="text-[20px] font-bold text-[var(--text-primary)] mb-2">Manage My Names</h2>
            <p className="text-[13px] text-[var(--text-secondary)] mb-4">
              Download the CSV, set your custom names in the <strong>"My Name"</strong> column, and upload it back.
            </p>
            <div className="bg-[#ff950015] border border-[#ff950030] rounded-[12px] p-3 mb-4 shrink-0">
              <p className="text-[12px] font-medium text-[#cc7700] flex items-start gap-2">
                <AlertCircle size={16} className="shrink-0 mt-0.5" />
                <span><strong>Warning:</strong> Only edit the "My Name" column. Modifying other columns will cause the import to fail.</span>
              </p>
            </div>
            
            <div className="flex gap-2 mb-4 shrink-0">
              <button 
                onClick={() => { setAliasTarget('files'); setAliasChanges([]); }}
                className={`flex-1 py-2 text-[13px] font-bold rounded-[10px] transition-colors ${aliasTarget === 'files' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)]'}`}
              >Files</button>
              <button 
                onClick={() => { setAliasTarget('folders'); setAliasChanges([]); }}
                className={`flex-1 py-2 text-[13px] font-bold rounded-[10px] transition-colors ${aliasTarget === 'folders' ? 'bg-[var(--accent)] text-white' : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)]'}`}
              >Folders</button>
            </div>

            {aliasChanges.length > 0 ? (
              <div className="flex-1 overflow-y-auto mb-4 bg-[var(--bg-elevated)] rounded-[12px] p-3 border border-[var(--border-subtle)]">
                <h4 className="text-[13px] font-semibold text-[var(--text-primary)] mb-2">Preview Changes ({aliasChanges.length})</h4>
                <div className="flex flex-col gap-2">
                  {aliasChanges.map((change, i) => (
                    <div key={i} className="flex flex-col text-[12px] bg-[var(--bg-surface)] p-2 rounded-[8px] border border-[var(--border-subtle)]">
                      <span className="text-[var(--text-secondary)] truncate">Old: {change.oldName}</span>
                      <span className="text-[var(--accent)] font-medium truncate">New: {change.alias || '(Removed)'}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3 shrink-0">
                <button 
                  onClick={() => {
                    const token = localStorage.getItem('token');
                    fetch(apiUrl(`/api/export/user-aliases/export/${aliasTarget}?department=${encodeURIComponent(activeDepartment)}&companyId=${companyId}&fyId=${fyId}`), { headers: { 'Authorization': `Bearer ${token}` } })
                      .then(res => res.blob())
                      .then(blob => {
                        const url = window.URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `my_${aliasTarget}_names_${activeDepartment}.csv`;
                        a.click();
                      });
                  }}
                  className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] bg-[var(--bg-neutral)] text-[var(--text-primary)] font-semibold text-[14px] hover:bg-[var(--bg-elevated)] transition-colors border border-[var(--border-subtle)]"
                >
                  <Download size={18} /> Download CSV
                </button>

                <label className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] bg-[var(--accent)] text-white font-semibold text-[14px] hover:brightness-110 transition-colors cursor-pointer text-center">
                  <UploadCloud size={18} /> Upload CSV
                  <input 
                    type="file" 
                    accept=".csv" 
                    className="hidden" 
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      e.target.value = '';
                      const reader = new FileReader();
                      reader.onload = (evt) => {
                        const text = evt.target?.result as string;
                        if (!text) return;
                        const { headers, rows } = parseCsvTable(text);
                        const idIdx = headers.indexOf(aliasTarget === 'files' ? 'file id' : 'folder id');
                        const oldIdx = headers.indexOf(aliasTarget === 'files' ? 'original name' : 'folder path');
                        const myNameIdx = headers.indexOf('my name');
                        
                        if (idIdx < 0 || myNameIdx < 0) {
                          alert(`Invalid CSV format. Could not find ID or 'My Name' column.`);
                          return;
                        }
                        
                        const changes = [];
                        for (const row of rows) {
                           const idStr = row[idIdx];
                           if (!idStr) continue;
                           const id = parseInt(idStr, 10);
                           if (isNaN(id)) continue;
                           const oldName = oldIdx >= 0 ? row[oldIdx] : 'Unknown';
                           const alias = row[myNameIdx] || '';
                           changes.push({ id, oldName, alias });
                        }
                        if (changes.length > 0) {
                           setAliasChanges(changes);
                        } else {
                           alert('No changes found in CSV.');
                        }
                      };
                      reader.readAsText(file);
                    }} 
                  />
                </label>
              </div>
            )}
            
            {aliasChanges.length > 0 && (
              <button 
                disabled={aliasUploading}
                onClick={() => {
                  setAliasUploading(true);
                  const token = localStorage.getItem('token');
                  fetch(apiUrl(`/api/export/user-aliases/import/${aliasTarget}`), {
                    method: 'POST',
                    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ changes: aliasChanges })
                  }).then(res => {
                    if (!res.ok) throw new Error('Upload failed');
                    setAliasUploading(false);
                    setShowAliasModal(false);
                    setAliasChanges([]);
                    window.dispatchEvent(new Event('smartvault:structureChanged'));
                    fetchFiles();
                  }).catch(() => {
                    alert('Failed to upload aliases');
                    setAliasUploading(false);
                  });
                }}
                className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] bg-[var(--accent)] text-white font-semibold text-[14px] hover:brightness-110 transition-colors disabled:opacity-50 shrink-0"
              >
                {aliasUploading ? 'Saving...' : 'Confirm & Save Changes'}
              </button>
            )}

            <button 
              onClick={() => { setShowAliasModal(false); setAliasChanges([]); }}
              className="mt-4 w-full py-2 text-[13px] font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors shrink-0"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
