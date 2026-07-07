'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiUrl } from '@/lib/api';
import { useConfirm } from '@/components/ConfirmProvider';
import { Building2, CalendarRange, Pencil, Trash2, Plus, RefreshCw, Save, X } from 'lucide-react';
import { CustomSelect } from '@/components/ui/Select';

type Company = {
  id: number;
  name: string;
  type: 'Parent' | 'Subsidiary' | 'Division/Branch' | 'Independent';
  parent_company_id: number | null;
  storage_quota_gb?: number;
};

type FinancialYear = {
  id: number;
  company_id: number;
  name: string;
  start_date: string;
  end_date: string;
  status: 'Active' | 'Planned' | 'Archived' | 'Locked';
};

const COMPANY_TYPES = ['Parent', 'Subsidiary', 'Division/Branch', 'Independent'] as const;

export default function CompaniesAdminPage() {
  const router = useRouter();
  const confirm = useConfirm();
  const [authorized, setAuthorized] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [financialYears, setFinancialYears] = useState<FinancialYear[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [formCompany, setFormCompany] = useState({ name: '', type: 'Independent', parent_company_id: '', storage_quota_gb: 5 });
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [editCompany, setEditCompany] = useState({ name: '', type: 'Independent', parent_company_id: '', storage_quota_gb: 5 });
  const [editingFyId, setEditingFyId] = useState<number | null>(null);
  const [editFy, setEditFy] = useState({ startYear: new Date().getFullYear(), status: 'Planned' });
  const [fyAutoSync, setFyAutoSync] = useState<boolean | null>(null);
  const [fyToggleBusy, setFyToggleBusy] = useState(false);
  const [formFy, setFormFy] = useState({ company_id: '', startYear: new Date().getFullYear() });

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) {
      router.push('/login');
      return;
    }
    try {
      const p = JSON.parse(atob(t.split('.')[1]));
      if (p.role !== 'Admin') {
        router.push('/');
        return;
      }
      setAuthorized(true);
    } catch {
      router.push('/login');
    }
  }, [router]);

  const loadCompanies = async () => {
    if (!token) return;
    const res = await fetch(apiUrl('/api/companies'), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    const rows: Company[] = Array.isArray(data) ? data : [];
    setCompanies(rows);
    if (!selectedCompanyId && rows[0]) setSelectedCompanyId(rows[0].id);
  };

  const loadFYs = async (companyId: number) => {
    if (!token) return;
    const res = await fetch(apiUrl(`/api/financial-years?companyId=${companyId}`), { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setFinancialYears(Array.isArray(data) ? data : []);
  };

  useEffect(() => { if (authorized) loadCompanies(); }, [authorized]);
  useEffect(() => { if (selectedCompanyId) loadFYs(selectedCompanyId); }, [selectedCompanyId]);

  // Load FY auto-sync setting
  useEffect(() => {
    if (!authorized || !token) return;
    fetch(apiUrl('/api/admin/fy-auto-sync'), { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(d => setFyAutoSync(d.enabled ?? true))
      .catch(() => setFyAutoSync(true));
  }, [authorized]);

  const toggleFyAutoSync = async () => {
    if (!token) return;
    setFyToggleBusy(true);
    const res = await fetch(apiUrl('/api/admin/fy-auto-sync'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ enabled: !fyAutoSync }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setFyAutoSync(data.enabled);
    else setAlert((data as any).error || 'Failed to update setting');
    setFyToggleBusy(false);
  };
  const selectedCompany = useMemo(() => companies.find(c => c.id === selectedCompanyId) || null, [companies, selectedCompanyId]);

  const companyTypeOptions = useMemo(() => COMPANY_TYPES.map(t => ({ label: t, value: t })), []);
  const parentCompanyOptions = useMemo(() => [
    { label: 'No parent (standalone)', value: '' },
    ...companies.map(c => ({ label: c.name, value: String(c.id) }))
  ], [companies]);
  const companyOptions = useMemo(() => [
    { label: 'Select Company', value: '' },
    ...companies.map(c => ({ label: c.name, value: String(c.id) }))
  ], [companies]);
  const fyYearOptions = useMemo(() => Array.from({ length: 60 }, (_, i) => {
    const year = new Date().getFullYear() + 10 - i;
    return { label: `FY ${year}-${String(year + 1).slice(-2)}`, value: String(year) };
  }), []);
  const fyStatusOptions = useMemo(() => ['Planned', 'Active', 'Archived', 'Locked'].map(s => ({ label: s, value: s })), []);

  const createCompany = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const res = await fetch(apiUrl('/api/companies'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: formCompany.name,
        type: formCompany.type,
        parent_company_id: formCompany.parent_company_id ? Number(formCompany.parent_company_id) : null,
        storage_quota_gb: Number(formCompany.storage_quota_gb),
      })
    });
    const data = await res.json();
    if (!res.ok) { setBusy(false); return setAlert(data.error || 'Failed to create company'); }
    setFormCompany({ name: '', type: 'Independent', parent_company_id: '', storage_quota_gb: 5 });
    await loadCompanies();
    setBusy(false);
  };

  const createFy = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setBusy(true);
    const startYear = Number(formFy.startYear);
    const endYear = startYear + 1;
    const res = await fetch(apiUrl('/api/financial-years'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        company_id: Number(formFy.company_id),
        name: `FY ${startYear}-${String(endYear).slice(-2)}`,
        start_date: `${startYear}-04-01`,
        end_date: `${endYear}-03-31`,
        status: 'Archived' // Manual creations usually default to Archived/Planned so they don't auto-activate
      })
    });
    const data = await res.json();
    if (!res.ok) { setBusy(false); return setAlert(data.error || 'Failed to create financial year'); }
    setFormFy({ company_id: formFy.company_id, startYear: new Date().getFullYear() }); // keep company selected
    if (selectedCompanyId === Number(formFy.company_id)) await loadFYs(selectedCompanyId);
    setBusy(false);
  };

  const startEditCompany = (c: Company) => {
    setEditingCompanyId(c.id);
    setEditCompany({
      name: c.name,
      type: c.type,
      parent_company_id: c.parent_company_id ? String(c.parent_company_id) : '',
      storage_quota_gb: c.storage_quota_gb || 5
    });
  };

  const saveCompany = async () => {
    if (!token || !editingCompanyId) return;
    setBusy(true);
    const res = await fetch(apiUrl(`/api/companies/${editingCompanyId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: editCompany.name,
        type: editCompany.type,
        parent_company_id: editCompany.parent_company_id ? Number(editCompany.parent_company_id) : null,
        storage_quota_gb: Number(editCompany.storage_quota_gb),
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setAlert((data as any)?.error || 'Failed to update company'); }
    setEditingCompanyId(null);
    await loadCompanies();
    setBusy(false);
  };

  const deleteCompany = async (c: Company) => {
    if (!token) return;
    const ok = await confirm({
      title: 'Delete company',
      message: `Delete "${c.name}"? This will be blocked if it has FYs or files.`,
      confirmText: 'Delete',
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(apiUrl(`/api/companies/${c.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setAlert((data as any)?.error || 'Failed to delete company'); }
    if (selectedCompanyId === c.id) setSelectedCompanyId(null);
    await loadCompanies();
    setBusy(false);
  };

  const startEditFy = (fy: FinancialYear) => {
    setEditingFyId(fy.id);
    setEditFy({
      startYear: fy.start_date ? Number(fy.start_date.substring(0, 4)) : new Date().getFullYear(),
      status: fy.status
    });
  };

  const saveFy = async () => {
    if (!token || !editingFyId) return;
    setBusy(true);
    const startYear = Number(editFy.startYear);
    const endYear = startYear + 1;
    const res = await fetch(apiUrl(`/api/financial-years/${editingFyId}`), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        name: `FY ${startYear}-${String(endYear).slice(-2)}`,
        start_date: `${startYear}-04-01`,
        end_date: `${endYear}-03-31`,
        status: editFy.status
      })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setAlert((data as any)?.error || 'Failed to update financial year'); }
    setEditingFyId(null);
    if (selectedCompanyId) await loadFYs(selectedCompanyId);
    setBusy(false);
  };

  const deleteFy = async (fy: FinancialYear) => {
    if (!token) return;
    const ok = await confirm({
      title: 'Delete financial year',
      message: `Delete "${fy.name}"? This will be blocked if files exist under this FY.`,
      confirmText: 'Delete',
      destructive: true
    });
    if (!ok) return;
    setBusy(true);
    const res = await fetch(apiUrl(`/api/financial-years/${fy.id}`), {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { setBusy(false); return setAlert((data as any)?.error || 'Failed to delete financial year'); }
    if (selectedCompanyId) await loadFYs(selectedCompanyId);
    setBusy(false);
  };

  if (!authorized) return null;

  return (
    <div className="p-4 sm:p-6 md:p-8 max-w-[1200px] mx-auto min-h-screen space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-[30px] font-bold tracking-tight text-[var(--text-primary)] flex items-center gap-2">
            <Building2 size={18} className="text-[var(--accent)]" /> Companies & Financial Years
          </h1>
          <p className="text-[13px] text-[var(--text-secondary)] mt-1">Create, edit and delete company structure and FYs.</p>
        </div>
        <button
          onClick={async () => { setAlert(null); await loadCompanies(); if (selectedCompanyId) await loadFYs(selectedCompanyId); }}
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <form onSubmit={createCompany} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 sm:p-6 flex flex-col gap-3 shadow-sm">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2"><Plus size={16} className="text-[var(--accent)]" /> Create Company</h2>
          <input required value={formCompany.name} onChange={e => setFormCompany(p => ({ ...p, name: e.target.value }))} placeholder="Company Name" className="bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" />
          <CustomSelect value={formCompany.type} onChange={v => setFormCompany(p => ({ ...p, type: v as any }))} options={companyTypeOptions} />
          <CustomSelect value={formCompany.parent_company_id} onChange={v => setFormCompany(p => ({ ...p, parent_company_id: v }))} options={parentCompanyOptions} />
          <input type="number" min={1} value={formCompany.storage_quota_gb} onChange={e => setFormCompany(p => ({ ...p, storage_quota_gb: Number(e.target.value) }))} placeholder="Storage Quota GB" className="bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" />
          <button disabled={busy} className="mt-1 py-2.5 rounded-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[14px] font-bold disabled:opacity-60">Create Company</button>
        </form>

        <form onSubmit={createFy} className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 sm:p-6 flex flex-col gap-3 shadow-sm">
          <h2 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2"><Plus size={16} className="text-[var(--accent)]" /> Create Financial Year</h2>
          <CustomSelect value={formFy.company_id} onChange={v => setFormFy(p => ({ ...p, company_id: v }))} options={companyOptions} />
          <div className="flex flex-col gap-1">
            <label className="text-[12px] text-[var(--text-secondary)] font-semibold px-1">Select Financial Year</label>
            <CustomSelect value={String(formFy.startYear)} onChange={v => setFormFy(p => ({ ...p, startYear: Number(v) }))} options={fyYearOptions} />
            {formFy.startYear > (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) && (
              <span className="text-[12px] text-[#ff9500] font-semibold px-1">⚠️ This financial year is in the future.</span>
            )}
          </div>
          <div className="px-3 py-2 bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] text-[13px] text-[var(--text-secondary)] flex flex-col gap-1">
            <p><strong>Start Date:</strong> April 1, {formFy.startYear}</p>
            <p><strong>End Date:</strong> March 31, {formFy.startYear + 1}</p>
          </div>
          <button disabled={busy} className="mt-1 py-2.5 rounded-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[14px] font-bold disabled:opacity-60">Create Financial Year</button>
        </form>
      </div>


      {/* FY Auto-Sync Toggle */}
      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] p-5 sm:p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-sm">
        <div>
          <h2 className="text-[15px] font-bold text-[var(--text-primary)] flex items-center gap-2">
            <CalendarRange size={16} className="text-[var(--accent)]" /> Financial Year Auto-Sync
          </h2>
          <p className="text-[12px] text-[var(--text-secondary)] mt-1">
            When enabled, the system automatically detects the current Indian FY (Apr 1 → Mar 31) and creates/activates it for all companies at startup and every night at 2:00 AM. Past FYs are archived automatically.
          </p>
        </div>
        <button
          onClick={toggleFyAutoSync}
          disabled={fyToggleBusy || fyAutoSync === null}
          className={`flex-shrink-0 flex items-center gap-3 px-4 py-2.5 rounded-[12px] text-[13px] font-bold transition-all border ${
            fyAutoSync
              ? 'bg-[#34c75910] border-[#34c75940] text-[#34c759] hover:bg-[#34c75920]'
              : 'bg-[var(--bg-neutral)] border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]'
          } disabled:opacity-50`}
        >
          <span className={`w-2 h-2 rounded-full ${fyAutoSync ? 'bg-[#34c759]' : 'bg-[var(--text-tertiary)]'}`} />
          {fyToggleBusy ? 'Saving...' : fyAutoSync ? 'Auto-Sync ON' : 'Auto-Sync OFF'}
        </button>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Companies</h3>
          {selectedCompany && <span className="text-[12px] text-[var(--text-tertiary)]">Selected: <span className="font-semibold">{selectedCompany.name}</span></span>}
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {companies.map(c => {
            const selected = selectedCompanyId === c.id;
            const editing = editingCompanyId === c.id;
            return (
              <div key={c.id} className={`${selected ? 'bg-[var(--accent-soft)]' : 'bg-[var(--bg-app)]'} px-5 py-4 flex items-start justify-between gap-3`}>
                <button onClick={() => setSelectedCompanyId(c.id)} className="text-left flex-1">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">{c.name}</p>
                  <p className="text-[12px] text-[var(--text-tertiary)]">{c.type}{c.parent_company_id ? ` • Parent: ${c.parent_company_id}` : ''}</p>
                </button>
                <div className="flex items-center gap-2">
                  <span className="text-[12px] text-[var(--text-secondary)] px-2 py-1 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-neutral)]">{c.storage_quota_gb || 5} GB</span>
                  <button onClick={() => startEditCompany(c)} className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]" aria-label="Edit company"><Pencil size={16} /></button>
                  <button onClick={() => deleteCompany(c)} className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]" aria-label="Delete company"><Trash2 size={16} /></button>
                </div>
                {editing && (
                  <div className="w-full mt-3 col-span-full">
                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={editCompany.name} onChange={e => setEditCompany(p => ({ ...p, name: e.target.value }))} className="bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" />
                      <CustomSelect value={editCompany.type} onChange={v => setEditCompany(p => ({ ...p, type: v as any }))} options={companyTypeOptions} />
                      <CustomSelect value={editCompany.parent_company_id} onChange={v => setEditCompany(p => ({ ...p, parent_company_id: v }))} options={[
                        { label: 'No parent', value: '' },
                        ...companies.filter(x => x.id !== c.id).map(x => ({ label: x.name, value: String(x.id) }))
                      ]} />
                      <input type="number" min={1} value={editCompany.storage_quota_gb} onChange={e => setEditCompany(p => ({ ...p, storage_quota_gb: Number(e.target.value) }))} className="bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-3 py-2 text-[14px]" />
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-2">
                      <button onClick={() => setEditingCompanyId(null)} className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"><X size={14} /> Cancel</button>
                      <button disabled={busy} onClick={saveCompany} className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"><Save size={14} /> Save</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {companies.length === 0 && (
            <div className="px-5 py-10 text-[13px] text-[var(--text-tertiary)]">No companies yet. Create your first company above.</div>
          )}
        </div>
      </div>

      <div className="bg-[var(--bg-surface)] border border-[var(--border-subtle)] rounded-[18px] overflow-hidden shadow-sm">
        <div className="px-5 py-4 border-b border-[var(--border-subtle)] flex items-center justify-between gap-3">
          <h3 className="text-[14px] font-bold text-[var(--text-primary)] uppercase tracking-wider">Financial Years</h3>
          <span className="text-[12px] text-[var(--text-tertiary)]">{selectedCompany?.name || 'No company selected'}</span>
        </div>
        <div className="divide-y divide-[var(--border-subtle)]">
          {financialYears.map(fy => {
            const editing = editingFyId === fy.id;
            return (
              <div key={fy.id} className="px-5 py-4 bg-[var(--bg-app)]">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-[var(--text-primary)] truncate">{fy.name}</p>
                    <p className="text-[12px] text-[var(--text-tertiary)]">{String(fy.start_date).slice(0, 10)} → {String(fy.end_date).slice(0, 10)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[11px] px-2 py-0.5 rounded-full border ${
                      fy.status === 'Active'
                        ? 'text-[#34c759] border-[#34c75940] bg-[#34c75910]'
                        : fy.status === 'Locked'
                          ? 'text-[#ff9500] border-[#ff950040] bg-[#ff950010]'
                          : 'text-[var(--text-secondary)] border-[var(--border-subtle)] bg-[var(--bg-neutral)]'
                    }`}>
                      {fy.status === 'Active' ? 'Current' : fy.status}
                    </span>
                    <button onClick={() => startEditFy(fy)} className="p-2 rounded-[10px] hover:bg-[var(--bg-neutral)] text-[var(--text-secondary)]" aria-label="Edit FY"><Pencil size={16} /></button>
                    <button onClick={() => deleteFy(fy)} className="p-2 rounded-[10px] hover:bg-[rgba(255,59,48,0.08)] text-[#ff5b52]" aria-label="Delete FY"><Trash2 size={16} /></button>
                  </div>
                </div>
                {editing && (
                  <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <CustomSelect value={String(editFy.startYear)} onChange={v => setEditFy(p => ({ ...p, startYear: Number(v) }))} options={fyYearOptions} />
                    <CustomSelect value={editFy.status} onChange={v => setEditFy(p => ({ ...p, status: v as any }))} options={fyStatusOptions} />
                    <div className="sm:col-span-2 px-3 py-2 bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] text-[13px] text-[var(--text-secondary)] flex justify-between">
                      <span><strong>Start:</strong> Apr 1, {editFy.startYear}</span>
                      <span><strong>End:</strong> Mar 31, {editFy.startYear + 1}</span>
                    </div>
                    {editFy.startYear > (new Date().getMonth() >= 3 ? new Date().getFullYear() : new Date().getFullYear() - 1) && (
                      <div className="sm:col-span-2 text-[12px] text-[#ff9500] font-semibold px-1">⚠️ This financial year is in the future.</div>
                    )}
                    <div className="sm:col-span-2 flex items-center justify-end gap-2">
                      <button onClick={() => setEditingFyId(null)} className="px-3 py-2 rounded-[10px] border border-[var(--border-subtle)] bg-[var(--bg-app)] text-[13px] font-semibold text-[var(--text-secondary)] flex items-center gap-2"><X size={14} /> Cancel</button>
                      <button disabled={busy} onClick={saveFy} className="px-3 py-2 rounded-[10px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold flex items-center gap-2 disabled:opacity-60"><Save size={14} /> Save</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {financialYears.length === 0 && (
            <div className="px-5 py-10 text-[13px] text-[var(--text-tertiary)]">No financial years for this company.</div>
          )}
        </div>
      </div>
    </div>
  );
}
