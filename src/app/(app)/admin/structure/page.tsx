'use client';

import { useCallback, useEffect, useMemo, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Plus, Trash2, Pencil, RefreshCw, Folder as FolderIcon, FolderOpen, ChevronRight, ChevronDown } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';

type FolderNode = { id: number; name: string; parent_folder_id: number | null; children?: FolderNode[] };
type DepartmentItem = { id: number; name: string; folders: FolderNode[] };

function buildTree(flat: FolderNode[], parentId: number | null = null): FolderNode[] {
  return flat
    .filter(f => (f.parent_folder_id ?? null) === parentId)
    .map(f => ({ ...f, children: buildTree(flat, f.id) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

interface FolderTreeNodeProps {
  node: FolderNode;
  depth: number;
  token: string;
  busy: boolean;
  onBusy: (b: boolean) => void;
  onMessage: (m: string | null) => void;
  onRefresh: () => void;
  confirm: any;
}

function FolderTreeNode({ node, depth, token, busy, onBusy, onMessage, onRefresh, confirm }: FolderTreeNodeProps) {
  const [expanded, setExpanded] = useState(depth < 2);
  const [showAddChild, setShowAddChild] = useState(false);
  const [childName, setChildName] = useState('');
  const [editing, setEditing] = useState(false);
  const [editName, setEditName] = useState(node.name);
  const hasChildren = (node.children?.length ?? 0) > 0;

  const createSubfolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = childName.trim();
    if (!name) return;
    onBusy(true);
    onMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/folders/${node.id}/subfolders`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create subfolder');
      setChildName('');
      setShowAddChild(false);
      setExpanded(true);
      onRefresh();
    } catch (e: any) {
      onMessage(e?.message || 'Failed to create subfolder');
    } finally {
      onBusy(false);
    }
  };

  const saveEdit = async () => {
    const name = editName.trim();
    if (!name) return;
    onBusy(true);
    onMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/folders/${node.id}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to update folder');
      setEditing(false);
      onRefresh();
    } catch (e: any) {
      onMessage(e?.message || 'Failed to update folder');
    } finally {
      onBusy(false);
    }
  };

  const deleteFolder = async () => {
    const ok = await confirm({
      title: 'Delete folder',
      message: 'Delete this folder and all its subfolders? This will fail if files exist inside.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    onBusy(true);
    onMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/folders/${node.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to delete folder');
      onRefresh();
    } catch (e: any) {
      onMessage(e?.message || 'Failed to delete folder');
    } finally {
      onBusy(false);
    }
  };

  return (
    <div className={`${depth > 0 ? 'ml-5 border-l border-[var(--border-subtle)] pl-3' : ''}`}>
      <div className="rounded-[12px] border border-[var(--border-subtle)] bg-[var(--bg-app)] px-3 py-2 mb-1">
        <div className="flex items-center gap-2">
          {/* Expand toggle */}
          <button
            onClick={() => setExpanded(v => !v)}
            className="p-0.5 rounded text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] transition-colors"
          >
            {hasChildren || showAddChild
              ? (expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />)
              : <span className="w-4 inline-block" />}
          </button>
          {/* Folder icon */}
          <div className="w-7 h-7 rounded-[8px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] flex items-center justify-center shrink-0">
            {expanded && hasChildren ? (
              <FolderOpen size={14} className="text-[var(--accent)]" />
            ) : (
              <FolderIcon size={14} className="text-[var(--text-tertiary)]" />
            )}
          </div>
          {/* Name / edit input */}
          {editing ? (
            <input
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') { setEditing(false); setEditName(node.name); }}}
              className="flex-1 px-2 py-1 rounded-[8px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              disabled={busy}
              autoFocus
            />
          ) : (
            <span className="flex-1 text-[13px] font-semibold text-[var(--text-primary)] truncate">{node.name}</span>
          )}
          {/* Action buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button onClick={() => { setEditing(false); setEditName(node.name); }} disabled={busy}
                  className="px-2 py-1 rounded-[6px] text-[11px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                  Cancel
                </button>
                <button onClick={saveEdit} disabled={busy}
                  className="px-2 py-1 rounded-[6px] text-[11px] font-semibold bg-[var(--text-primary)] text-[var(--bg-app)]">
                  Save
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => { setShowAddChild(v => !v); setExpanded(true); }}
                  title="Add subfolder"
                  className="p-1.5 rounded-[6px] hover:bg-[var(--bg-neutral)] text-[var(--text-tertiary)] hover:text-[var(--accent)] transition-colors"
                >
                  <Plus size={13} />
                </button>
                <button onClick={() => { setEditing(true); setEditName(node.name); }}
                  className="p-1.5 rounded-[6px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)] transition-colors" title="Rename">
                  <Pencil size={13} />
                </button>
                <button onClick={deleteFolder}
                  className="p-1.5 rounded-[6px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52] transition-colors" title="Delete">
                  <Trash2 size={13} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Add subfolder input */}
        {showAddChild && expanded && (
          <form onSubmit={createSubfolder} className="flex items-center gap-2 mt-2 ml-9">
            <input
              value={childName}
              onChange={e => setChildName(e.target.value)}
              placeholder={`Subfolder inside "${node.name}"`}
              className="flex-1 px-2 py-1.5 rounded-[8px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[13px] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
              disabled={busy}
              autoFocus
            />
            <button type="submit" disabled={busy || !childName.trim()}
              className="px-2 py-1.5 rounded-[8px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] font-bold flex items-center gap-1 disabled:opacity-50">
              <Plus size={12} /> Add
            </button>
            <button type="button" onClick={() => setShowAddChild(false)}
              className="px-2 py-1.5 rounded-[8px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[12px] text-[var(--text-secondary)]">
              Cancel
            </button>
          </form>
        )}
      </div>

      {/* Recursively render children */}
      {expanded && (node.children?.length ?? 0) > 0 && (
        <div className="mt-0.5">
          {node.children!.map(child => (
            <FolderTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              token={token}
              busy={busy}
              onBusy={onBusy}
              onMessage={onMessage}
              onRefresh={onRefresh}
              confirm={confirm}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function AdminStructureContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const companyId = searchParams.get('companyId');
  const fyId = searchParams.get('fyId');
  const confirm = useConfirm();

  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const [departments, setDepartments] = useState<DepartmentItem[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  const [newDeptName, setNewDeptName] = useState('');
  const [editDeptId, setEditDeptId] = useState<number | null>(null);
  const [editDeptName, setEditDeptName] = useState('');

  const [newFolderName, setNewFolderName] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const normalizedCompanyId = companyId ? Number(companyId) : null;
  const normalizedFyId = fyId ? Number(fyId) : null;
  const hasScope = Number.isFinite(normalizedCompanyId) && Number.isFinite(normalizedFyId);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) { router.push('/login'); return; }
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.role !== 'Admin') { router.push('/'); return; }
      setAuthorized(true);
    } catch { router.push('/login'); }
  }, [router]);

  const fetchStructure = useCallback(async () => {
    if (!token || !hasScope) return;
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(
        apiUrl(`/api/admin/structure?companyId=${normalizedCompanyId}&fyId=${normalizedFyId}`),
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to load structure');
      const rows: DepartmentItem[] = Array.isArray(data?.departments) ? data.departments : [];
      setDepartments(rows);
      if (rows.length > 0) {
        setSelectedDeptId(prev => {
          if (prev && rows.some(d => d.id === prev)) return prev;
          return rows[0].id;
        });
      } else {
        setSelectedDeptId(null);
      }
    } catch (e: any) {
      setMessage(e?.message || 'Failed to load structure');
      setDepartments([]);
      setSelectedDeptId(null);
    } finally {
      setLoading(false);
    }
  }, [token, hasScope, normalizedCompanyId, normalizedFyId]);

  useEffect(() => {
    if (!authorized) return;
    if (!hasScope) return;
    fetchStructure();
  }, [authorized, hasScope, fetchStructure]);

  const selectedDept = useMemo(
    () => (selectedDeptId ? departments.find(d => d.id === selectedDeptId) || null : null),
    [departments, selectedDeptId]
  );

  // Build tree for selected dept
  const folderTree = useMemo(() => {
    if (!selectedDept) return [];
    return buildTree(selectedDept.folders || []);
  }, [selectedDept]);

  const createDepartment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !hasScope) return;
    const name = newDeptName.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl('/api/admin/structure/departments'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ company_id: normalizedCompanyId, fy_id: normalizedFyId, name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create department');
      setNewDeptName('');
      await fetchStructure();
      window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
      if (data?.department?.id) setSelectedDeptId(Number(data.department.id));
    } catch (e: any) {
      setMessage(e?.message || 'Failed to create department');
    } finally {
      setBusy(false);
    }
  };

  const startEditDept = (d: DepartmentItem) => { setEditDeptId(d.id); setEditDeptName(d.name); };

  const saveEditDept = async () => {
    if (!token || !editDeptId) return;
    const name = editDeptName.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/departments/${editDeptId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to update department');
      setEditDeptId(null);
      setEditDeptName('');
      await fetchStructure();
    } catch (e: any) {
      setMessage(e?.message || 'Failed to update department');
    } finally {
      setBusy(false);
    }
  };

  const deleteDepartment = async (deptId: number) => {
    if (!token) return;
    const ok = await confirm({ title: 'Delete department', message: 'Delete this department? This will fail if files exist in it.', confirmText: 'Delete', destructive: true });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/departments/${deptId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to delete department');
      await fetchStructure();
      window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
    } catch (e: any) {
      setMessage(e?.message || 'Failed to delete department');
    } finally {
      setBusy(false);
    }
  };

  const createRootFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !selectedDeptId) return;
    const name = newFolderName.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/departments/${selectedDeptId}/folders`), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Failed to create folder');
      setNewFolderName('');
      await fetchStructure();
      window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
    } catch (e: any) {
      setMessage(e?.message || 'Failed to create folder');
    } finally {
      setBusy(false);
    }
  };

  if (!authorized) return null;

  if (!hasScope) {
    return (
      <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen">
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5">
          <div className="flex items-center gap-2 text-[var(--text-primary)] font-semibold">
            <Layers size={18} className="text-[var(--accent)]" />
            Departments &amp; Folders
          </div>
          <p className="text-[13px] text-[var(--text-secondary)] mt-2">
            Select a <span className="font-semibold">Company</span> and <span className="font-semibold">FY</span> from the top bar to manage the structure.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Layers size={18} className="text-[var(--accent)]" />
            Departments &amp; Folders
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            Folders support infinite nesting — click the <Plus size={11} className="inline" /> button inside any folder to add a subfolder.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchStructure}
            className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2">
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      {message && (
        <div className="bg-[rgba(255,149,0,0.08)] border border-[rgba(255,149,0,0.25)] rounded-[14px] px-4 py-3 text-[13px] text-[var(--text-primary)]">
          {message}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-5">
        {/* Departments panel */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Departments</div>
            <div className="text-[12px] text-[var(--text-secondary)]">{departments.length}</div>
          </div>

          <form onSubmit={createDepartment} className="flex items-center gap-2 mb-4">
            <input
              value={newDeptName}
              onChange={e => setNewDeptName(e.target.value)}
              placeholder="New department name"
              className="flex-1 px-3 py-2 rounded-[10px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none"
              disabled={busy}
            />
            <button type="submit" disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60">
              <Plus size={14} /> Add
            </button>
          </form>

          <div className="space-y-1">
            {loading ? (
              <div className="text-[13px] text-[var(--text-secondary)]">Loading…</div>
            ) : departments.length === 0 ? (
              <div className="text-[13px] text-[var(--text-secondary)]">No departments yet for this Company + FY.</div>
            ) : (
              departments.map(d => {
                const active = d.id === selectedDeptId;
                const editing = editDeptId === d.id;
                return (
                  <div key={d.id}
                    className={`rounded-[12px] border px-3 py-2 ${active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-app)]'}`}>
                    <div className="flex items-center justify-between gap-2">
                      <button onClick={() => setSelectedDeptId(d.id)} className="flex-1 text-left">
                        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{d.name}</div>
                        <div className="text-[12px] text-[var(--text-secondary)]">{d.folders?.length || 0} folders</div>
                      </button>
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <button onClick={() => { setEditDeptId(null); setEditDeptName(''); }} disabled={busy}
                            className="px-2 py-1 rounded-[8px] text-[12px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)]">
                            Cancel
                          </button>
                          <button onClick={saveEditDept} disabled={busy}
                            className="px-2 py-1 rounded-[8px] text-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-app)]">
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button onClick={() => startEditDept(d)}
                            className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]">
                            <Pencil size={16} />
                          </button>
                          <button onClick={() => deleteDepartment(d.id)}
                            className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]">
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editing && (
                      <div className="mt-2">
                        <input
                          value={editDeptName}
                          onChange={e => setEditDeptName(e.target.value)}
                          className="w-full px-3 py-2 rounded-[10px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none"
                          disabled={busy}
                        />
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Folders panel */}
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Folder Tree</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {selectedDept ? selectedDept.name : 'Select a department'}
            </div>
          </div>

          {!selectedDept ? (
            <div className="text-[13px] text-[var(--text-secondary)]">Pick a department from the left to manage folders.</div>
          ) : (
            <>
              {/* Add root folder */}
              <form onSubmit={createRootFolder} className="flex items-center gap-2 mb-5">
                <input
                  value={newFolderName}
                  onChange={e => setNewFolderName(e.target.value)}
                  placeholder={`New root folder inside ${selectedDept.name}`}
                  className="flex-1 px-3 py-2 rounded-[10px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none"
                  disabled={busy}
                />
                <button type="submit" disabled={busy}
                  className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60">
                  <Plus size={14} /> Add
                </button>
              </form>

              <div className="text-[11px] font-semibold text-[var(--text-tertiary)] uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <FolderIcon size={12} /> Folder Hierarchy — click <Plus size={10} className="inline mx-0.5" /> to add subfolders
              </div>

              {folderTree.length === 0 ? (
                <div className="text-[13px] text-[var(--text-secondary)] border-2 border-dashed border-[var(--border-subtle)] rounded-[12px] p-6 text-center">
                  No folders yet. Create your first root folder above.
                </div>
              ) : (
                <div className="space-y-1">
                  {folderTree.map(node => (
                    <FolderTreeNode
                      key={node.id}
                      node={node}
                      depth={0}
                      token={token || ''}
                      busy={busy}
                      onBusy={setBusy}
                      onMessage={setMessage}
                      onRefresh={async () => {
                        await fetchStructure();
                        window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
                      }}
                      confirm={confirm}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function AdminStructurePage() {
  return (
    <Suspense fallback={<div className="p-8">Loading...</div>}>
      <AdminStructureContent />
    </Suspense>
  );
}
