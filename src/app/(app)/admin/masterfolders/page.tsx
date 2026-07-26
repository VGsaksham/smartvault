'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { Building2, Pencil, Trash2, Plus, RefreshCw, Save, X } from 'lucide-react';

type Masterfolder = {
  id: number;
  name: string;
};

export default function MasterfoldersAdminPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [authorized, setAuthorized] = useState(false);
  const [masterfolders, setMasterfolders] = useState<Masterfolder[]>([]);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  
  const [formName, setFormName] = useState('');
  
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    if (!token) {
      router.push('/login');
      return;
    }
    try {
      const p = JSON.parse(atob(token.split('.')[1]));
      if (p.role !== 'Admin') {
        router.push('/');
        return;
      }
      setAuthorized(true);
    } catch {
      router.push('/login');
    }
  }, [router, token]);

  const loadMasterfolders = async () => {
    if (!token) return;
    try {
      const res = await fetch(apiUrl('/api/masterfolders'), { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      setMasterfolders(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => { 
    if (authorized) loadMasterfolders(); 
  }, [authorized]);

  const createMasterfolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token || !formName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl('/api/masterfolders'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: formName.trim() })
      });
      const data = await res.json();
      if (!res.ok) { 
        setAlert(data.error || 'Failed to create masterfolder'); 
      } else {
        setFormName('');
        await loadMasterfolders();
      }
    } catch (err) {
      setAlert('Network error occurred.');
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (m: Masterfolder) => {
    setEditingId(m.id);
    setEditName(m.name);
  };

  const saveEdit = async () => {
    if (!token || !editingId || !editName.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/masterfolders/${editingId}`), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: editName.trim() })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { 
        setAlert(data.error || 'Failed to update masterfolder'); 
      } else {
        setEditingId(null);
        await loadMasterfolders();
      }
    } catch (err) {
      setAlert('Network error occurred.');
    } finally {
      setBusy(false);
    }
  };

  const deleteMasterfolder = async (m: Masterfolder) => {
    if (!token) return;
    const ok = await confirm({
      title: 'Delete Masterfolder',
      message: `Delete "${m.name}"? This action cannot be undone.`,
      confirmText: 'Delete',
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(apiUrl(`/api/masterfolders/${m.id}`), {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { 
        setAlert(data.error || 'Failed to delete masterfolder'); 
      } else {
        await loadMasterfolders();
      }
    } catch (err) {
      setAlert('Network error occurred.');
    } finally {
      setBusy(false);
    }
  };

  if (!authorized) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[800px] mx-auto min-h-screen space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Building2 size={18} className="text-[var(--accent)]" /> Masterfolders
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Create, edit and delete masterfolders.</p>
        </div>
        <button
          onClick={async () => { setAlert(null); await loadMasterfolders(); }}
          className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"
          disabled={busy}
        >
          <RefreshCw size={14} /> Refresh
        </button>
      </div>

      {alert && (
        <div className="px-4 py-3 rounded-[14px] border border-[#ff5b5240] bg-[#ff5b5212] text-[#ff5b52] text-[13px] flex justify-between items-start gap-3">
          <span>{alert}</span>
          <button onClick={() => setAlert(null)} className="font-bold">✕</button>
        </div>
      )}

      <form onSubmit={createMasterfolder} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 sm:p-6 flex flex-col gap-3 shadow-sm">
        <h2 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
          <Plus size={16} className="text-[var(--accent)]" /> Create Masterfolder
        </h2>
        <div className="flex flex-col sm:flex-row gap-3">
          <input 
            required 
            value={formName} 
            onChange={e => setFormName(e.target.value)} 
            placeholder="Masterfolder Name" 
            className="flex-1 bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" 
          />
          <button disabled={busy} className="py-2.5 px-6 rounded-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[14px] font-bold disabled:opacity-60 whitespace-nowrap">
            Create
          </button>
        </div>
      </form>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-wider">All Masterfolders</h3>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {masterfolders.map(m => {
            const editing = editingId === m.id;
            return (
              <div key={m.id} className="bg-[var(--bg-app)] px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">{m.name}</p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => startEdit(m)} className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]" aria-label="Edit Masterfolder"><Pencil size={16} /></button>
                    <button onClick={() => deleteMasterfolder(m)} className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]" aria-label="Delete Masterfolder"><Trash2 size={16} /></button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-2 w-full">
                    <div className="flex flex-col sm:flex-row gap-2">
                      <input 
                        value={editName} 
                        onChange={e => setEditName(e.target.value)} 
                        className="flex-1 bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" 
                        placeholder="Masterfolder Name"
                      />
                      <div className="flex items-center gap-2">
                        <button onClick={() => setEditingId(null)} className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"><X size={14} /> Cancel</button>
                        <button disabled={busy} onClick={saveEdit} className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"><Save size={14} /> Save</button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {masterfolders.length === 0 && (
            <div className="px-5 py-10 text-[13px] text-[var(--text-tertiary)]">No masterfolders yet. Create your first masterfolder above.</div>
          )}
        </div>
      </div>
    </div>
  );
}
