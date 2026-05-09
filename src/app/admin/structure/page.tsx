'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Layers, Plus, Trash2, Pencil, RefreshCw, Folder as FolderIcon } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';

type FolderItem = { id: number; name: string };
type DepartmentItem = { id: number; name: string; folders: FolderItem[] };

export default function AdminStructurePage() {
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
  const [editFolderId, setEditFolderId] = useState<number | null>(null);
  const [editFolderName, setEditFolderName] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const normalizedCompanyId = companyId ? Number(companyId) : null;
  const normalizedFyId = fyId ? Number(fyId) : null;
  const hasScope = Number.isFinite(normalizedCompanyId) && Number.isFinite(normalizedFyId);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/login');
      return;
    }
    try {
      const payload = JSON.parse(atob(t.split('.')[1]));
      if (payload.role !== 'Admin') {
        router.push('/');
        return;
      }
      setAuthorized(true);
    } catch {
      router.push('/login');
    }
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
        setSelectedDeptId((prev) => {
          if (prev && rows.some((d) => d.id === prev)) return prev;
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
    () => (selectedDeptId ? departments.find((d) => d.id === selectedDeptId) || null : null),
    [departments, selectedDeptId]
  );

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
        body: JSON.stringify({ company_id: normalizedCompanyId, fy_id: normalizedFyId, name })
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

  const startEditDept = (d: DepartmentItem) => {
    setEditDeptId(d.id);
    setEditDeptName(d.name);
  };

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
        body: JSON.stringify({ name })
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
    const ok = await confirm({
      title: 'Delete department',
      message: 'Delete this department? This will fail if files exist in it.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/departments/${deptId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
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

  const createFolder = async (e: React.FormEvent) => {
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
        body: JSON.stringify({ name })
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

  const startEditFolder = (f: FolderItem) => {
    setEditFolderId(f.id);
    setEditFolderName(f.name);
  };

  const saveEditFolder = async () => {
    if (!token || !editFolderId) return;
    const name = editFolderName.trim();
    if (!name) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/folders/${editFolderId}`), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to update folder');
      setEditFolderId(null);
      setEditFolderName('');
      await fetchStructure();
      window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
    } catch (e: any) {
      setMessage(e?.message || 'Failed to update folder');
    } finally {
      setBusy(false);
    }
  };

  const deleteFolder = async (folderId: number) => {
    if (!token) return;
    const ok = await confirm({
      title: 'Delete folder',
      message: 'Delete this folder? This will fail if files exist in it.',
      confirmText: 'Delete',
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    setMessage(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/structure/folders/${folderId}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((data as any)?.error || 'Failed to delete folder');
      await fetchStructure();
      window.dispatchEvent(new CustomEvent('smartvault:structureChanged', { detail: { companyId: normalizedCompanyId, fyId: normalizedFyId } }));
    } catch (e: any) {
      setMessage(e?.message || 'Failed to delete folder');
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
            Departments & Folders
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
            Departments & Folders
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">
            This structure is stored per <span className="font-semibold">Company</span> and <span className="font-semibold">FY</span>. Deletions are blocked if files exist.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={fetchStructure}
            className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"
          >
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
        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Departments</div>
            <div className="text-[12px] text-[var(--text-secondary)]">{departments.length}</div>
          </div>

          <form onSubmit={createDepartment} className="flex items-center gap-2 mb-4">
            <input
              value={newDeptName}
              onChange={(e) => setNewDeptName(e.target.value)}
              placeholder="New department name"
              className="flex-1 px-3 py-2 rounded-[10px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none"
              disabled={busy}
            />
            <button
              type="submit"
              disabled={busy}
              className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"
            >
              <Plus size={14} /> Add
            </button>
          </form>

          <div className="space-y-1">
            {loading ? (
              <div className="text-[13px] text-[var(--text-secondary)]">Loading…</div>
            ) : departments.length === 0 ? (
              <div className="text-[13px] text-[var(--text-secondary)]">No departments yet for this Company + FY.</div>
            ) : (
              departments.map((d) => {
                const active = d.id === selectedDeptId;
                const editing = editDeptId === d.id;
                return (
                  <div
                    key={d.id}
                    className={`rounded-[12px] border px-3 py-2 ${
                      active ? 'border-[var(--accent)] bg-[var(--accent-soft)]' : 'border-[var(--border-subtle)] bg-[var(--bg-app)]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <button
                        onClick={() => setSelectedDeptId(d.id)}
                        className="flex-1 text-left"
                      >
                        <div className="text-[14px] font-semibold text-[var(--text-primary)]">{d.name}</div>
                        <div className="text-[12px] text-[var(--text-secondary)]">{d.folders?.length || 0} folders</div>
                      </button>
                      {editing ? (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => {
                              setEditDeptId(null);
                              setEditDeptName('');
                            }}
                            className="px-2 py-1 rounded-[8px] text-[12px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                            disabled={busy}
                          >
                            Cancel
                          </button>
                          <button
                            onClick={saveEditDept}
                            className="px-2 py-1 rounded-[8px] text-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-app)]"
                            disabled={busy}
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => startEditDept(d)}
                            className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]"
                            aria-label="Edit department"
                          >
                            <Pencil size={16} />
                          </button>
                          <button
                            onClick={() => deleteDepartment(d.id)}
                            className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]"
                            aria-label="Delete department"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                    {editing && (
                      <div className="mt-2">
                        <input
                          value={editDeptName}
                          onChange={(e) => setEditDeptName(e.target.value)}
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

        <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="text-[13px] font-bold text-[var(--text-tertiary)] uppercase tracking-wider">Folders</div>
            <div className="text-[12px] text-[var(--text-secondary)]">
              {selectedDept ? selectedDept.name : 'Select a department'}
            </div>
          </div>

          {!selectedDept ? (
            <div className="text-[13px] text-[var(--text-secondary)]">Pick a department from the left to manage folders.</div>
          ) : (
            <>
              <form onSubmit={createFolder} className="flex items-center gap-2 mb-4">
                <input
                  value={newFolderName}
                  onChange={(e) => setNewFolderName(e.target.value)}
                  placeholder={`New folder inside ${selectedDept.name}`}
                  className="flex-1 px-3 py-2 rounded-[10px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] text-[14px] text-[var(--text-primary)] outline-none"
                  disabled={busy}
                />
                <button
                  type="submit"
                  disabled={busy}
                  className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"
                >
                  <Plus size={14} /> Add
                </button>
              </form>

              <div className="space-y-2">
                {(selectedDept.folders || []).length === 0 ? (
                  <div className="text-[13px] text-[var(--text-secondary)]">No folders yet.</div>
                ) : (
                  (selectedDept.folders || []).map((f) => {
                    const editing = editFolderId === f.id;
                    return (
                      <div
                        key={f.id}
                        className="rounded-[14px] border border-[var(--border-subtle)] bg-[var(--bg-app)] px-4 py-3"
                      >
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-9 h-9 rounded-[12px] bg-[var(--bg-neutral)] border border-[var(--border-subtle)] flex items-center justify-center flex-shrink-0">
                              <FolderIcon size={16} className="text-[var(--text-tertiary)]" />
                            </div>
                            <div className="min-w-0">
                              <div className="text-[14px] font-semibold text-[var(--text-primary)] truncate">
                                {editing ? 'Editing…' : f.name}
                              </div>
                              <div className="text-[12px] text-[var(--text-secondary)]">Folder</div>
                            </div>
                          </div>
                          {editing ? (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => {
                                  setEditFolderId(null);
                                  setEditFolderName('');
                                }}
                                className="px-2 py-1 rounded-[8px] text-[12px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-surface)]"
                                disabled={busy}
                              >
                                Cancel
                              </button>
                              <button
                                onClick={saveEditFolder}
                                className="px-2 py-1 rounded-[8px] text-[12px] font-semibold bg-[var(--text-primary)] text-[var(--bg-app)]"
                                disabled={busy}
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => startEditFolder(f)}
                                className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]"
                                aria-label="Edit folder"
                              >
                                <Pencil size={16} />
                              </button>
                              <button
                                onClick={() => deleteFolder(f.id)}
                                className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]"
                                aria-label="Delete folder"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          )}
                        </div>
                        {editing && (
                          <div className="mt-3">
                            <input
                              value={editFolderName}
                              onChange={(e) => setEditFolderName(e.target.value)}
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}

