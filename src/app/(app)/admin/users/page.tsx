'use client';
import { useState, useEffect, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { UserPlus, Trash2, RefreshCw, X, Copy } from 'lucide-react';
import { apiUrl } from '@/lib/api';
import { CustomSelect } from '@/components/ui/Select';

type User = {
  id: number; username: string; email: string;
  role: 'Admin'|'Manager'|'Staff'|'Guest'; department: string;
  allowed_departments: string[]|null;
  company_access?: CompanyAccess[];
  folder_access?: { company_id: number; department: string; folder_path: string; is_exclusion: boolean }[];
  dept_upload_permissions?: Record<string, boolean>|null;
  can_bulk_move: boolean; can_bulk_copy: boolean; can_bulk_delete: boolean;
  can_bulk_rename: boolean; can_bulk_download: boolean;
  can_upload_to_allowed: boolean;
  created_at: string;
  status: 'Active' | 'Suspended';
  last_ip_address?: string;
};

type Company = { id: number; name: string };
type CompanyAccess = {
  company_id: number;
  company_name?: string;
  department: string;
  can_upload: boolean;
  is_primary?: boolean;
};

// Admin role is reserved (not assignable via UI)
const ROLES = ['Manager','Staff','Guest'] as const;
// Departments should be dynamic (per selected Company + FY).
// Keep this empty to avoid hardcoding.
const DEFAULT_DEPTS: string[] = [];

const roleMeta: Record<string, { bg: string; text: string; dot: string }> = {
  Admin:   { bg: 'rgba(139, 92, 246, 0.12)', text: 'var(--accent)', dot: '#8b5cf6' },
  Manager: { bg: 'var(--accent-soft)', text: 'var(--accent)', dot: 'var(--accent)' },
  Staff:   { bg: 'var(--bg-neutral)', text: 'var(--text-secondary)', dot: 'var(--text-tertiary)' },
  Guest:   { bg: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', dot: '#f59e0b' },
};

const emptyForm = { username:'', email:'', password:'', role:'Staff', department:'', primary_company_id:'' };

import { Suspense } from 'react';

function UsersPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [alert, setAlert] = useState<{title:string;message:string;isError:boolean}|null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isNewUserOpen, setIsNewUserOpen] = useState(false);
  const [form, setForm] = useState({...emptyForm});
  const [submitting, setSubmitting] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [departments, setDepartments] = useState<string[]>(DEFAULT_DEPTS);
  const [createCompanyAccess, setCreateCompanyAccess] = useState<CompanyAccess[]>([]);
  const [createCompanyPrompt, setCreateCompanyPrompt] = useState<{
    company_id: number;
    company_name: string;
    department: string;
  }|null>(null);
  const [selectedUser, setSelectedUser] = useState<User|null>(null);
  const [detailRole, setDetailRole] = useState<User['role']>('Staff');
  const [detailStatus, setDetailStatus] = useState<User['status']>('Active');
  const [detailPermData, setDetailPermData] = useState<any>(null);
  const [accessPrompt, setAccessPrompt] = useState<{
    type: 'department' | 'company';
    label: string;
    department?: string;
    companyId?: number;
  } | null>(null);
  const [companyDeptPrompt, setCompanyDeptPrompt] = useState<{
    companyId: number;
    companyName: string;
  } | null>(null);
  const [companyFolderPrompt, setCompanyFolderPrompt] = useState<{
    companyId: number;
    companyName: string;
  } | null>(null);
  const [companyFolderOptions, setCompanyFolderOptions] = useState<Record<string, string[]>>({});
  const [newRuleForm, setNewRuleForm] = useState<{department: string; folderPath: string; type: 'allow'|'deny'}>({department: '', folderPath: '', type: 'allow'});
  const [companyDeptOptions, setCompanyDeptOptions] = useState<Record<number, string[]>>({});
  const [savingDetail, setSavingDetail] = useState(false);
  const [confirmUI, setConfirmUI] = useState<{
    title: string;
    message: string;
    confirmText?: string;
    destructive?: boolean;
    onConfirm: () => void | Promise<void>;
  } | null>(null);

  const [newFolderRule, setNewFolderRule] = useState<{ companyId: number | ''; department: string; folderPath: string; isExclusion: boolean }>({ companyId: '', department: '', folderPath: '', isExclusion: false });

  const addFolderRule = (companyId: number) => {
    if (!companyId || !newRuleForm.department || !newRuleForm.folderPath) return;
    
    // Determine exclusion based on current access
    const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === companyId);
    const hasFullDeptAccess = Boolean(companyRows.find((x: CompanyAccess) => x.department === newRuleForm.department));
    const isExclusion = hasFullDeptAccess;

    setDetailPermData((p: any) => ({
      ...p,
      folder_access: [
        ...(p?.folder_access || []),
        { company_id: companyId, department: newRuleForm.department, folder_path: newRuleForm.folderPath, is_exclusion: isExclusion }
      ]
    }));
    setNewRuleForm({ ...newRuleForm, folderPath: '' });
  };

  const removeFolderRule = (idx: number) => {
    setDetailPermData((p: any) => ({
      ...p,
      folder_access: (p?.folder_access || []).filter((_: any, i: number) => i !== idx)
    }));
  };

  const fetchCompanyFolders = async (cid: number, dept: string) => {
    if (!token || !cid || !dept) return;
    const key = `${cid}_${dept}`;
    if (companyFolderOptions[key]) return;
    try {
      const res = await fetch(apiUrl(`/api/admin/folders?companyId=${cid}&department=${encodeURIComponent(dept)}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setCompanyFolderOptions(prev => ({ ...prev, [key]: Array.isArray(data) ? data : [] }));
    } catch {}
  };

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const companyId = searchParams.get('companyId');
  const fyId = searchParams.get('fyId');

  const getDefaultDepartment = () => {
    const primaryCompanyAccess = (detailPermData?.company_access || []).find((x: CompanyAccess) => Boolean(x?.is_primary));
    return String(primaryCompanyAccess?.department || selectedUser?.department || departments[0] || '').trim();
  };

  const fetchCompanyDepartments = useCallback(async (targetCompanyId: number, force = false) => {
    if (!token) return [];
    if (!force && companyDeptOptions[targetCompanyId]) return companyDeptOptions[targetCompanyId];
    try {
      const fyRes = await fetch(apiUrl(`/api/financial-years?companyId=${targetCompanyId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const fyData = fyRes.ok ? await fyRes.json() : [];
      const fyRows = Array.isArray(fyData) ? fyData : [];
      let targetFyId = Number(fyRows.find((x: any) => Number(x?.id) === Number(fyId))?.id || 0) || null;
      if (!targetFyId) {
        const active = fyRows.find((x: any) => x?.status === 'Active');
        targetFyId = Number(active?.id || fyRows[0]?.id || 0) || null;
      }
      if (!targetFyId) return [];
      const res = await fetch(apiUrl(`/api/admin/structure?companyId=${targetCompanyId}&fyId=${targetFyId}`), {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json().catch(() => ({}));
      const names = Array.isArray(data?.departments)
        ? data.departments.map((d: any) => String(d?.name || '').trim()).filter(Boolean)
        : [];
      setCompanyDeptOptions((prev) => ({ ...prev, [targetCompanyId]: names }));
      return names;
    } catch {
      return [];
    }
  }, [token, fyId, companyDeptOptions]);

  useEffect(() => {
    const t = localStorage.getItem('token');
    if (!t) { router.push('/'); return; }
    try {
      const p = JSON.parse(atob(t.split('.')[1]));
      if (p.role !== 'Admin') router.push('/');
      else setIsAuthorized(true);
    } catch { router.push('/'); }
  }, [router]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (fyId) params.set('fyId', fyId);
      const endpoint = params.toString() ? `/api/users?${params.toString()}` : '/api/users';
      const res = await fetch(apiUrl(endpoint), { headers: { Authorization: `Bearer ${token}` } });
      setIsAdmin(res.status !== 403);
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setUsers([]);
        return setAlert({ title: 'Error', message: data?.error || 'Failed to load users.', isError: true });
      }
      if (!Array.isArray(data)) {
        setUsers([]);
        return setAlert({ title: 'Error', message: 'Users API returned invalid data.', isError: true });
      }
      setUsers(data);
    } catch {
      setUsers([]);
      setAlert({ title: 'Error', message: 'Failed to load users.', isError: true });
    } finally { setLoading(false); }
  }, [token, companyId, fyId]);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const visibleUsers = users.filter((u) => String(u?.username || '').trim().toLowerCase() !== 'superadmin');

  const fetchMeta = useCallback(async () => {
    if (!token) return;
    try {
      const params = new URLSearchParams();
      if (companyId) params.set('companyId', companyId);
      if (fyId) params.set('fyId', fyId);
      const [companyRes, searchOptionsRes] = await Promise.all([
        fetch(apiUrl('/api/companies'), { headers: { Authorization: `Bearer ${token}` } }),
        fetch(apiUrl(`/api/search/options${params.toString() ? `?${params.toString()}` : ''}`), { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (companyRes.ok) {
        const c = await companyRes.json();
        setCompanies(Array.isArray(c) ? c : []);
      }
      if (searchOptionsRes.ok) {
        const s = await searchOptionsRes.json();
        const depts = Array.isArray(s?.departments) ? s.departments.map((d: string) => String(d).trim()).filter(Boolean) : [];
        const merged = Array.from(new Set([...DEFAULT_DEPTS, ...depts]));
        setDepartments(merged);
        // Auto-initialize form.department to first option so user doesn't need to interact with dropdown
        if (merged.length > 0) {
          setForm(prev => prev.department ? prev : { ...prev, department: merged[0] });
        }
      }
    } catch {
      // keep defaults
    }
  }, [token, companyId, fyId]);

  useEffect(() => { fetchMeta(); }, [fetchMeta]);

  const openUserDetails = (user: User) => {
    setSelectedUser(user);
    setDetailRole(user.role);
    setDetailStatus(user.status || 'Active');
    const allowed = new Set(user.allowed_departments || []);
    if (user.department) allowed.add(user.department);
    setDetailPermData({
      allowed_departments: Array.from(allowed),
      company_access: user.company_access || [],
      dept_upload_permissions: user.dept_upload_permissions || {},
      can_bulk_move: user.can_bulk_move ?? true,
      can_bulk_copy: user.can_bulk_copy ?? true,
      can_bulk_delete: user.can_bulk_delete ?? false,
      can_bulk_rename: user.can_bulk_rename ?? true,
      can_bulk_download: user.can_bulk_download ?? true,
      can_upload_to_allowed: user.can_upload_to_allowed ?? false,
      folder_access: user.folder_access || [],
    });
    setAccessPrompt(null);
    setCompanyDeptPrompt(null);
  };

  const saveUserDetails = async () => {
    if (!selectedUser || !detailPermData) return;
    const normalizedCompanyAccess = (detailPermData?.company_access || [])
      .filter((x: CompanyAccess) => Number.isFinite(x.company_id));
    
    if (normalizedCompanyAccess.length === 0) {
      return setAlert({ title: 'Validation Error', message: 'You must assign the user to at least one company.', isError: true });
    }

    setSavingDetail(true);
    try {
      const roleDepartment = String(selectedUser.department || getDefaultDepartment() || '').trim();
      const roleRes = await fetch(apiUrl(`/api/users/${selectedUser.id}/role`), {
        method:'PUT',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify({ role: detailRole, department: roleDepartment })
      });
      const roleData = await roleRes.json().catch(() => ({}));
      if (!roleRes.ok) {
        setSavingDetail(false);
        return setAlert({ title:'Failed', message: roleData.error || 'Failed to update role/department', isError:true });
      }

      if (detailStatus !== selectedUser.status) {
        const statusRes = await fetch(apiUrl(`/api/admin/users/${selectedUser.id}/status`), {
          method:'POST',
          headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
          body: JSON.stringify({ status: detailStatus })
        });
        const statusData = await statusRes.json().catch(() => ({}));
        if (!statusRes.ok) {
          setSavingDetail(false);
          return setAlert({ title:'Failed', message: statusData.error || 'Failed to update status', isError:true });
        }
      }

      // Normalized array is already defined at the start of the function
      const mergedAllowedDepartments = Array.from(
        new Set([
          ...Object.keys(detailPermData?.dept_upload_permissions || {}),
          ...normalizedCompanyAccess.map((x: any) => String(x.department || '').trim()),
          ...(detailPermData?.folder_access || []).map((x: any) => String(x.department || '').trim()),
        ].map((d) => String(d || '').trim()).filter(Boolean))
      );

      const permissionBody = {
        ...detailPermData,
        allowed_departments: mergedAllowedDepartments,
        company_access: normalizedCompanyAccess,
        folder_access: detailPermData?.folder_access || [],
        preference_updates: {
          department_upload_permissions: detailPermData?.dept_upload_permissions || {}
        }
      };
      const permRes = await fetch(apiUrl(`/api/users/${selectedUser.id}/permissions`), {
        method:'PATCH',
        headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
        body: JSON.stringify(permissionBody)
      });
      const permData = await permRes.json().catch(() => ({}));
      if (!permRes.ok) {
        setSavingDetail(false);
        return setAlert({ title:'Failed', message: permData.error || 'Failed to update permissions', isError:true });
      }

      await fetchUsers();
      setSelectedUser(null);
      setAlert({ title:'Saved', message:'User updated.', isError:false });
    } finally {
      setSavingDetail(false);
    }
  };

  const handleDelete = async (user: User) => {
    setConfirmUI({
      title: 'Delete user',
      message: `Delete "${user.username}"? This cannot be undone.`,
      confirmText: 'Delete',
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(apiUrl(`/api/users/${user.id}`), { method:'DELETE', headers:{Authorization:`Bearer ${token}`} });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setAlert({ title:'Error', message: data?.error || 'Failed to delete user', isError:true });
        setUsers(prev => prev.filter(u => u.id !== user.id));
        setSelectedUser(null);
        setAlert({ title:'Deleted', message:`${user.username} removed.`, isError:false });
      }
    });
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true);
    const primaryCompanyId = Number((form as any).primary_company_id);
    const primaryDepartment = String((form as any).department || '').trim() || departments[0] || '';
    const isFolderOnly = Boolean((form as any).folder_path);
    const mergedAccess: CompanyAccess[] = [
      {
        company_id: primaryCompanyId,
        company_name: companies.find((c) => c.id === primaryCompanyId)?.name,
        department: isFolderOnly ? '' : primaryDepartment,
        can_upload: true,
        is_primary: true,
      },
      ...createCompanyAccess
        .filter((a) => Number(a.company_id) !== primaryCompanyId || a.department !== primaryDepartment)
        .map((a) => ({ ...a, is_primary: false })),
    ];
    const payload = {
      ...form,
      primary_company_id: primaryCompanyId,
      company_access: mergedAccess,
      folder_access: (form as any).folder_path ? [{
        company_id: primaryCompanyId,
        department: primaryDepartment,
        folder_path: (form as any).folder_path,
        is_exclusion: false
      }] : []
    };
    const res = await fetch(apiUrl('/api/auth/register'), {
      method:'POST', headers:{'Content-Type':'application/json', Authorization:`Bearer ${token}`},
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) return setAlert({ title:'Error', message: data.error, isError:true });
    setForm({...emptyForm});
    setCreateCompanyAccess([]);
    setIsNewUserOpen(false);
    fetchUsers();
    setAlert({ title:'Done', message:`${form.username} added.`, isError:false });
  };

  const promptCreateCompanyAccess = (companyIdValue: string) => {
    const company_id = Number(companyIdValue);
    if (!Number.isFinite(company_id)) return;
    const company = companies.find((c) => c.id === company_id);
    setCreateCompanyPrompt({
      company_id,
      company_name: company?.name || `Company ${company_id}`,
      department: String((form as any).department || departments[0] || '').trim(),
    });
  };

  const applyCreateCompanyAccess = (canUpload: boolean) => {
    if (!createCompanyPrompt) return;
    setCreateCompanyAccess((prev) => {
      const next = [...prev];
      const idx = next.findIndex((x) => x.company_id === createCompanyPrompt.company_id && x.department === createCompanyPrompt.department);
      const payload: CompanyAccess = {
        company_id: createCompanyPrompt.company_id,
        company_name: createCompanyPrompt.company_name,
        department: createCompanyPrompt.department,
        can_upload: canUpload,
        is_primary: false,
      };
      if (idx >= 0) next[idx] = payload;
      else next.push(payload);
      return next;
    });
    setCreateCompanyPrompt(null);
  };

  const handleStatusToggle = async (user: User) => {
    const newStatus = user.status === 'Active' ? 'Suspended' : 'Active';
    setConfirmUI({
      title: 'Change status',
      message: `Change ${user.username}'s status to ${newStatus}?`,
      confirmText: 'Confirm',
      destructive: newStatus === 'Suspended',
      onConfirm: async () => {
        const res = await fetch(apiUrl(`/api/admin/users/${user.id}/status`), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: newStatus })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setAlert({ title: 'Error', message: data?.error || 'Failed to update status', isError: true });
        setUsers(prev => prev.map(u => u.id === user.id ? { ...u, status: newStatus } : u));
        setAlert({ title: 'Status Updated', message: `${user.username} is now ${newStatus}.`, isError: false });
      }
    });
  };

  const handleForceLogout = async (user: User) => {
    setConfirmUI({
      title: 'Force logout',
      message: `Force logout ${user.username}? This will invalidate all active sessions.`,
      confirmText: 'Logout',
      destructive: true,
      onConfirm: async () => {
        const res = await fetch(apiUrl(`/api/admin/users/${user.id}/logout`), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return setAlert({ title: 'Error', message: data?.error || 'Failed to force logout', isError: true });
        setAlert({ title: 'Logged Out', message: `${user.username} has been forcibly logged out.`, isError: false });
      }
    });
  };

  const setDetailDepartmentUpload = (dept: string, canUpload: boolean) => {
    setDetailPermData((p: any) => {
      const allowed = Array.isArray(p?.allowed_departments) ? p.allowed_departments : [];
      const allowedNext = allowed.includes(dept) ? allowed : [...allowed, dept];
      return {
        ...p,
        allowed_departments: allowedNext,
        dept_upload_permissions: {
          ...(p?.dept_upload_permissions || {}),
          [dept]: canUpload,
        },
      };
    });
  };

  const removeDetailDepartment = (dept: string) => {
    setDetailPermData((p: any) => {
      const nextUpload = { ...(p?.dept_upload_permissions || {}) };
      delete nextUpload[dept];
      return {
        ...p,
        allowed_departments: (p?.allowed_departments || []).filter((d: string) => d !== dept),
        company_access: (p?.company_access || []).filter((x: any) => x.department !== dept),
        folder_access: (p?.folder_access || []).filter((x: any) => x.department !== dept),
        dept_upload_permissions: nextUpload,
      };
    });
  };

  const toggleCompanyAccess = (companyId: number, checked: boolean) => {
    const company = companies.find((c) => c.id === companyId);
    setDetailPermData((p: any) => {
      const current = Array.isArray(p?.company_access) ? [...p.company_access] : [];
      if (!checked) {
        const next = current.filter((x: CompanyAccess) => Number(x.company_id) !== companyId);
        if (next.length > 0 && !next.some((x: CompanyAccess) => x.is_primary)) next[0].is_primary = true;
        return { ...p, company_access: next };
      }
      if (current.some((x: CompanyAccess) => Number(x.company_id) === companyId)) return p;
      const payload: CompanyAccess = {
        company_id: companyId,
        company_name: company?.name || `Company ${companyId}`,
        department: getDefaultDepartment(),
        can_upload: false,
        is_primary: current.length === 0,
      };
      return { ...p, company_access: [...current, payload] };
    });
  };

  const setCompanyUploadMode = (companyId: number, canUpload: boolean) => {
    setDetailPermData((p: any) => {
      const next = (Array.isArray(p?.company_access) ? [...p.company_access] : []).map((x: CompanyAccess) => (
        Number(x.company_id) === companyId ? { ...x, can_upload: canUpload } : x
      ));
      return { ...p, company_access: next };
    });
  };

  const toggleCompanyDepartment = (companyId: number, dept: string, checked: boolean) => {
    setDetailPermData((p: any) => {
      const current: CompanyAccess[] = Array.isArray(p?.company_access) ? [...p.company_access] : [];
      const companyName = companies.find((c) => c.id === companyId)?.name || `Company ${companyId}`;
      const idx = current.findIndex((x) => Number(x.company_id) === companyId && x.department === dept);

      if (!checked) {
        if (idx === -1) return p;
        const next = current.filter((_, i) => i !== idx);
        const companyRowsAfter = next.filter((x) => Number(x.company_id) === companyId);
        if (companyRowsAfter.length === 0) {
           next.push({
             company_id: companyId,
             company_name: companyName,
             department: '',
             can_upload: false,
             is_primary: next.length === 0
           });
        }
        if (next.length > 0 && !next.some((x) => x.is_primary)) next[0].is_primary = true;
        return { ...p, company_access: next };
      }

      if (idx !== -1) return p;
      const companyRows = current.filter((x) => Number(x.company_id) === companyId);
      const companyReadOnly = companyRows.length > 0 ? !companyRows.some((x) => Boolean(x.can_upload)) : true;
      const payload: CompanyAccess = {
        company_id: companyId,
        company_name: companyName,
        department: dept,
        can_upload: companyReadOnly ? false : true,
        is_primary: current.length === 0,
      };
      return { ...p, company_access: [...current, payload] };
    });
  };

  const setCompanyDepartmentMode = (companyId: number, dept: string, canUpload: boolean) => {
    setDetailPermData((p: any) => {
      const current: CompanyAccess[] = Array.isArray(p?.company_access) ? [...p.company_access] : [];
      const companyRows = current.filter((x) => Number(x.company_id) === companyId);
      const companyReadOnly = companyRows.length > 0 && !companyRows.some((x) => Boolean(x.can_upload));
      if (companyReadOnly && canUpload) return p;
      const next = current.map((x) => (
        Number(x.company_id) === companyId && x.department === dept ? { ...x, can_upload: canUpload } : x
      ));
      return { ...p, company_access: next };
    });
  };

  if (!isAuthorized) return null;

  const bulkOps = [
    { key: 'can_bulk_move',     label: 'Move',     danger: false },
    { key: 'can_bulk_copy',     label: 'Copy',     danger: false },
    { key: 'can_bulk_rename',   label: 'Rename',   danger: false },
    { key: 'can_bulk_download', label: 'Download', danger: false },
  ];

  return (
    <div className="w-full min-h-full bg-[var(--bg-app)] p-4 sm:p-6 md:p-8 max-w-[1320px] mx-auto flex flex-col gap-5 md:gap-6">

      {/* Top confirmation popup (replaces browser confirm) */}
      {confirmUI && (
        <div className="fixed top-3 left-0 right-0 z-[90] px-3 sm:px-4">
          <div className="max-w-[560px] mx-auto rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-medium)] overflow-hidden">
            <div className="px-5 py-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-[var(--text-primary)]">{confirmUI.title}</p>
                <p className="text-[13px] text-[var(--text-secondary)] mt-1">{confirmUI.message}</p>
              </div>
              <button
                onClick={() => setConfirmUI(null)}
                className="w-9 h-9 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-neutral)] flex items-center justify-center shrink-0"
                aria-label="Close"
              >
                <X size={14} />
              </button>
            </div>
            <div className="px-5 pb-4 flex items-center justify-end gap-2">
              <button
                onClick={() => setConfirmUI(null)}
                className="px-4 py-2 rounded-[12px] text-[13px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-neutral)] text-[var(--text-secondary)]"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  const action = confirmUI.onConfirm;
                  setConfirmUI(null);
                  await action();
                }}
                className={`px-4 py-2 rounded-[12px] text-[13px] font-semibold ${
                  confirmUI.destructive
                    ? 'bg-[#ff3b30]/12 text-[#ff3b30] border border-[#ff3b30]/25'
                    : 'bg-[var(--text-primary)] text-[var(--bg-app)]'
                }`}
              >
                {confirmUI.confirmText || 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[32px] font-semibold tracking-[-0.45px] text-[var(--text-primary)] leading-tight">Users &amp; Roles</h1>
          <p className="text-[14px] text-[var(--text-secondary)] mt-1">Create users, assign roles, and manage company/department access.</p>
        </div>
        <div className="flex gap-2 overflow-x-auto no-scrollbar w-full sm:w-auto">
          <Link href="/admin/duplicates" className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-all">
            <Copy size={13}/> Duplicate Report
          </Link>
          <button onClick={fetchUsers} className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] bg-[var(--bg-surface)] border border-[var(--border-subtle)] text-[13px] font-semibold text-[var(--text-secondary)] hover:bg-[var(--bg-neutral)] transition-all">
            <RefreshCw size={13}/> Refresh
          </button>
          <button onClick={() => setIsNewUserOpen(true)} className="flex items-center gap-1.5 px-4 py-2.5 rounded-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[13px] font-bold hover:opacity-90 transition-opacity shadow-sm">
            <UserPlus size={13}/> New User
          </button>
        </div>
      </div>

      {/* Compact Cards */}
      <div className="bg-[var(--bg-surface)] rounded-[20px] border border-[var(--border-subtle)] shadow-[var(--shadow-subtle)] p-4 sm:p-5">
        {loading ? (
          <div className="flex items-center justify-center py-24">
            <div className="w-7 h-7 border-2 border-[var(--border-subtle)] border-t-[var(--accent)] rounded-full animate-spin"/>
          </div>
        ) : visibleUsers.length === 0 ? (
          <p className="py-20 text-center text-[14px] text-[rgba(0,0,0,0.32)]">No users found.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {visibleUsers.map((user) => (
              <button
                key={user.id}
                onClick={() => openUserDetails(user)}
                className="text-left p-5 rounded-[18px] border border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 hover:bg-[var(--bg-neutral)]/35 hover:border-[var(--border-default)] transition-all shadow-[0_6px_20px_rgba(0,0,0,0.05)]"
              >
                <div className="flex items-center gap-4">
                  <div className="w-11 h-11 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center text-[15px] font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                    {user.username[0].toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <div className="text-[18px] font-semibold tracking-[-0.2px] text-[var(--text-primary)] truncate">{user.username}</div>
                    <div className="text-[14px] text-[var(--text-tertiary)] truncate">{user.email}</div>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-2.5 flex-wrap">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">
                    {user.role}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-medium border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-tertiary)]">
                    {user.department || 'No dept'}
                  </span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium border ${user.status === 'Suspended' ? 'border-[#ff3b30]/30 text-[#ff3b30] bg-[#ff3b30]/10' : 'border-[#34c759]/25 text-[#34c759] bg-[#34c759]/10'}`}>
                    {user.status}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* User Detail Popup */}
      {selectedUser && (
        <div className="fixed inset-0 z-[62] flex items-center justify-center bg-black/50 backdrop-blur-[2px] p-3 sm:p-4">
          <div className="relative bg-[var(--bg-surface)] rounded-[24px] shadow-[var(--shadow-medium)] w-full max-w-[900px] border border-[var(--border-subtle)] overflow-hidden max-h-[92vh] flex flex-col">
            <div className="px-8 py-6 border-b border-[var(--border-subtle)] flex items-start justify-between bg-[var(--bg-elevated)]/40">
              <div className="min-w-0">
                <h3 className="text-[30px] leading-tight font-semibold tracking-[-0.35px] text-[var(--text-primary)] truncate">{selectedUser.username}</h3>
                <p className="text-[15px] mt-1 text-[var(--text-secondary)] truncate">{selectedUser.email}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] text-[var(--text-secondary)]">{detailRole}</span>
                  <span className={`px-2.5 py-1 rounded-full text-[11px] border ${detailStatus === 'Suspended' ? 'border-[#ff3b30]/30 text-[#ff3b30] bg-[#ff3b30]/10' : 'border-[#34c759]/25 text-[#34c759] bg-[#34c759]/10'}`}>{detailStatus}</span>
                </div>
              </div>
              <button onClick={() => setSelectedUser(null)} className="w-10 h-10 rounded-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-colors shrink-0">
                <X size={16}/>
              </button>
            </div>

            <div className="overflow-y-auto">
            <div className="px-8 py-6 grid grid-cols-1 sm:grid-cols-2 gap-5">
              <div className="space-y-2 z-40">
                <label className="block text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Role</label>
                <CustomSelect
                  value={detailRole}
                  onChange={(val) => setDetailRole(val as User['role'])}
                  options={[
                    ...(detailRole === 'Admin' ? [{ label: 'Admin', value: 'Admin' }] : []),
                    ...ROLES.map(r => ({ label: r, value: r }))
                  ]}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <label className="block text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Status</label>
                <div className="flex gap-2">
                  <button onClick={() => setDetailStatus('Active')} className={`px-4 py-2.5 rounded-[12px] text-[14px] font-semibold border ${detailStatus === 'Active' ? 'bg-[#34c759]/12 text-[#34c759] border-[#34c759]/35' : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]'}`}>Active</button>
                  <button onClick={() => setDetailStatus('Suspended')} className={`px-4 py-2.5 rounded-[12px] text-[14px] font-semibold border ${detailStatus === 'Suspended' ? 'bg-[#ff3b30]/12 text-[#ff3b30] border-[#ff3b30]/35' : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]'}`}>Suspended</button>
                </div>
              </div>
            </div>

            <div className="px-8 pb-4">
              <div className="rounded-[16px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-elevated)]/30">
                <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-3">Company Access</p>
                <p className="text-[12px] text-[var(--text-tertiary)] mb-3">Select company first, then choose departments inside it.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {companies.map((company) => {
                    const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === company.id);
                    const enabled = companyRows.length > 0;
                    const canUpload = companyRows.some((x: CompanyAccess) => Boolean(x.can_upload));
                    return (
                      <div key={company.id} className="border border-[var(--border-subtle)] rounded-[12px] p-3 bg-[var(--bg-surface)]">
                        <div className="flex items-center justify-between">
                          <span className="text-[14px] font-semibold">{company.name}</span>
                          <input type="checkbox" checked={enabled} onChange={(e) => toggleCompanyAccess(company.id, e.target.checked)} />
                        </div>
                        {enabled && (
                          <div className="mt-2 flex items-center justify-between gap-2">
                            <span className="text-[12px] text-[var(--text-secondary)]">{canUpload ? 'Write' : 'Read'}</span>
                            <div className="flex items-center gap-1.5">
                              <button onClick={() => setAccessPrompt({ type: 'company', label: company.name, companyId: company.id })} className="px-2.5 py-1.5 rounded-[8px] text-[11px] border bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]">
                                Mode
                              </button>
                              <button
                                disabled={!enabled}
                                onClick={async () => {
                                  await fetchCompanyDepartments(company.id, true);
                                  setCompanyDeptPrompt({ companyId: company.id, companyName: company.name });
                                }}
                                className="px-2.5 py-1.5 rounded-[8px] text-[11px] border bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)] disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                Departments
                              </button>
                              <button
                                disabled={!enabled}
                                onClick={async () => {
                                  await fetchCompanyDepartments(company.id, true);
                                  setCompanyFolderPrompt({ companyId: company.id, companyName: company.name });
                                }}
                                className="px-2.5 py-1.5 rounded-[8px] text-[11px] border bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)] disabled:opacity-45 disabled:cursor-not-allowed"
                              >
                                Folders
                              </button>
                            </div>
                          </div>
                        )}
                        {!enabled && (
                          <p className="text-[11px] text-[var(--text-tertiary)] mt-2">Enable company to configure departments.</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Folder rules block removed */}

            <div className="px-8 pb-5">
              <div className="rounded-[16px] border border-[var(--border-subtle)] p-4 bg-[var(--bg-elevated)]/30">
                <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-3">Bulk Permissions</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {bulkOps.map(({ key, label, danger }) => {
                    const on = Boolean(detailPermData?.[key]);
                    return (
                      <button
                        key={key}
                        onClick={() => setDetailPermData((p: any) => ({ ...p, [key]: !p[key] }))}
                        className={`px-3 py-2.5 rounded-[12px] text-[12px] font-semibold border ${
                          on
                            ? danger
                              ? 'bg-[#ff5b52]/10 text-[#ff5b52] border-[#ff5b52]/35'
                              : 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                            : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="px-8 pb-5 flex items-center gap-2">
              <button onClick={() => handleForceLogout(selectedUser)} className="px-3.5 py-2.5 rounded-[12px] text-[13px] font-semibold bg-[#ff9500]/10 text-[#ff9500] border border-[#ff9500]/20">
                Force Logout
              </button>
              <button onClick={() => handleDelete(selectedUser)} className="px-3.5 py-2.5 rounded-[12px] text-[13px] font-semibold bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20">
                Delete
              </button>
            </div>

            <div className="px-8 py-5 border-t border-[var(--border-subtle)] bg-[var(--bg-elevated)]/35 flex gap-3">
              <button onClick={() => setSelectedUser(null)} className="flex-1 py-3 rounded-[12px] bg-[var(--bg-neutral)] text-[15px] font-semibold text-[var(--text-secondary)] border border-[var(--border-subtle)]">Close</button>
              <button onClick={saveUserDetails} disabled={savingDetail} className="flex-1 py-3 rounded-[12px] bg-[var(--text-primary)] text-[15px] font-semibold text-[var(--bg-app)] disabled:opacity-60 shadow-sm">
                {savingDetail ? 'Saving...' : 'Save User'}
              </button>
            </div>
            </div>

            {accessPrompt && !companyDeptPrompt && (
              <div className="absolute inset-0 bg-black/35 flex items-center justify-center p-4">
                <div className="w-full max-w-[320px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-medium)] p-4">
                  <p className="text-[15px] font-semibold text-[var(--text-primary)]">{accessPrompt.label}</p>
                  <p className="text-[12px] text-[var(--text-secondary)] mt-1">Choose permission mode</p>
                  <div className="grid grid-cols-2 gap-2 mt-4">
                    <button
                      onClick={() => {
                        if (accessPrompt.type === 'department' && accessPrompt.department) setDetailDepartmentUpload(accessPrompt.department, false);
                        if (accessPrompt.type === 'company' && accessPrompt.companyId) {
                          if (accessPrompt.department) setCompanyDepartmentMode(accessPrompt.companyId, accessPrompt.department, false);
                          else setCompanyUploadMode(accessPrompt.companyId, false);
                        }
                        setAccessPrompt(null);
                      }}
                      className="py-2.5 rounded-[10px] text-[13px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-neutral)] text-[var(--text-secondary)]"
                    >
                      Read
                    </button>
                    <button
                      onClick={() => {
                        if (accessPrompt.type === 'department' && accessPrompt.department) setDetailDepartmentUpload(accessPrompt.department, true);
                        if (accessPrompt.type === 'company' && accessPrompt.companyId) {
                          if (accessPrompt.department) setCompanyDepartmentMode(accessPrompt.companyId, accessPrompt.department, true);
                          else setCompanyUploadMode(accessPrompt.companyId, true);
                        }
                        setAccessPrompt(null);
                      }}
                      className="py-2.5 rounded-[10px] text-[13px] font-semibold border border-[var(--accent)]/35 bg-[var(--accent-soft)] text-[var(--accent)]"
                    >
                      Write
                    </button>
                  </div>
                  <button onClick={() => setAccessPrompt(null)} className="w-full mt-3 py-2 rounded-[10px] text-[12px] text-[var(--text-tertiary)]">Cancel</button>
                </div>
              </div>
            )}

            {companyDeptPrompt && (
              <div className="absolute inset-0 bg-black/35 flex items-center justify-center p-4">
                <div className="w-full max-w-[560px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-medium)] p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-[16px] font-semibold text-[var(--text-primary)]">{companyDeptPrompt.companyName}</p>
                      <p className="text-[12px] text-[var(--text-secondary)]">Select department access for this company</p>
                    </div>
                    <button onClick={() => setCompanyDeptPrompt(null)} className="w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-neutral)] flex items-center justify-center">
                      <X size={13} />
                    </button>
                  </div>
                  <div className="max-h-[52vh] overflow-y-auto pr-1 grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {(companyDeptOptions[companyDeptPrompt.companyId] || []).map((dept) => {
                      const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === companyDeptPrompt.companyId);
                      const companyReadOnly = companyRows.length > 0 && !companyRows.some((x: CompanyAccess) => Boolean(x.can_upload));
                      const row = companyRows.find((x: CompanyAccess) => x.department === dept);
                      const enabled = Boolean(row);
                      const deptCanUpload = Boolean(row?.can_upload);
                      return (
                        <div key={dept} className="border border-[var(--border-subtle)] rounded-[12px] p-3 bg-[var(--bg-elevated)]/25">
                          <div className="flex items-center justify-between">
                            <span className="text-[14px] font-semibold text-[var(--text-primary)]">{dept}</span>
                            <input
                              type="checkbox"
                              checked={enabled}
                              onChange={(e) => toggleCompanyDepartment(companyDeptPrompt.companyId, dept, e.target.checked)}
                            />
                          </div>
                          {enabled && (
                            <div className="mt-2 flex items-center justify-between">
                              <span className="text-[12px] text-[var(--text-secondary)]">{deptCanUpload ? 'Write' : 'Read'}</span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  onClick={() => setCompanyDepartmentMode(companyDeptPrompt.companyId, dept, false)}
                                  className={`px-2.5 py-1.5 rounded-[8px] text-[11px] border ${
                                    !deptCanUpload
                                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                                      : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                                  }`}
                                >
                                  Read
                                </button>
                                <button
                                  onClick={() => setCompanyDepartmentMode(companyDeptPrompt.companyId, dept, true)}
                                  className={`px-2.5 py-1.5 rounded-[8px] text-[11px] border disabled:opacity-45 disabled:cursor-not-allowed ${
                                    deptCanUpload
                                      ? 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent)]/35'
                                      : 'bg-[var(--bg-neutral)] text-[var(--text-secondary)] border-[var(--border-subtle)]'
                                  }`}
                                >
                                  Write
                                </button>
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                    {(companyDeptOptions[companyDeptPrompt.companyId] || []).length === 0 && (
                      <div className="sm:col-span-2 text-[12px] text-[var(--text-tertiary)] border border-[var(--border-subtle)] rounded-[12px] p-3 bg-[var(--bg-elevated)]/25">
                        No departments found for this company/FY. Create them in Admin → Departments &amp; Folders.
                      </div>
                    )}
                  </div>
                  <button onClick={() => setCompanyDeptPrompt(null)} className="w-full mt-3 py-2.5 rounded-[10px] text-[13px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-neutral)] text-[var(--text-secondary)]">Done</button>
                </div>
              </div>
            )}

            {companyFolderPrompt && (
              <div className="absolute inset-0 bg-black/35 flex items-center justify-center p-4 z-50">
                <div className="w-full max-w-[600px] rounded-[16px] border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-[var(--shadow-medium)] p-4 flex flex-col max-h-[90vh]">
                  <div className="flex items-center justify-between mb-3 shrink-0">
                    <div>
                      <p className="text-[16px] font-semibold text-[var(--text-primary)]">{companyFolderPrompt.companyName}</p>
                      <p className="text-[12px] text-[var(--text-secondary)]">Manage folder access for this company</p>
                    </div>
                    <button onClick={() => setCompanyFolderPrompt(null)} className="w-8 h-8 rounded-full border border-[var(--border-subtle)] bg-[var(--bg-neutral)] flex items-center justify-center">
                      <X size={13} />
                    </button>
                  </div>

                  <div className="flex-1 overflow-y-auto min-h-0 pr-1 space-y-4">
                    {/* Active Folder Rules */}
                    <div>
                      <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em] mb-2">Active Folder Rules</p>
                      <div className="space-y-2">
                        {(detailPermData?.folder_access || []).filter((fa: any) => fa.company_id === companyFolderPrompt.companyId).map((fa: any, idx: number) => {
                           // Find real index in the global array to remove it correctly
                           const realIdx = detailPermData.folder_access.findIndex((x: any) => x === fa);
                           return (
                             <div key={idx} className="flex items-center justify-between bg-[var(--bg-elevated)]/30 border border-[var(--border-subtle)] rounded-[10px] p-2.5">
                               <div className="flex items-center gap-2">
                                 <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${fa.is_exclusion ? 'bg-[#ff3b30]/10 text-[#ff3b30]' : 'bg-[#34c759]/10 text-[#34c759]'}`}>
                                   {fa.is_exclusion ? 'EXCLUDE' : 'INCLUDE'}
                                 </span>
                                 <span className="text-[13px] font-medium text-[var(--text-primary)]">{fa.department} › <span className="font-bold">{fa.folder_path}</span></span>
                               </div>
                               <button onClick={() => removeFolderRule(realIdx)} className="text-[var(--text-tertiary)] hover:text-[#ff3b30] p-1">
                                 <X size={14} />
                               </button>
                             </div>
                           );
                        })}
                        {!(detailPermData?.folder_access || []).some((fa: any) => fa.company_id === companyFolderPrompt.companyId) && (
                          <p className="text-[13px] text-[var(--text-tertiary)] italic">No folder rules active for this company.</p>
                        )}
                      </div>
                    </div>

                    {/* Add New Rule Form */}
                    <div className="bg-[var(--bg-neutral)]/50 border border-[var(--border-subtle)] rounded-[12px] p-3 flex flex-col gap-3">
                      <p className="text-[12px] font-bold text-[var(--text-tertiary)] uppercase tracking-[0.08em]">Add New Rule</p>
                      
                      <div className="flex flex-col sm:flex-row items-end gap-2">
                        <div className="flex-1 w-full">
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Department</label>
                          <CustomSelect 
                            value={newRuleForm.department} 
                            onChange={(val) => {
                              const dept = val;
                              const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === companyFolderPrompt.companyId);
                              const hasFullDeptAccess = Boolean(companyRows.find((x: CompanyAccess) => x.department === dept));
                              
                              setNewRuleForm({ 
                                ...newRuleForm, 
                                department: dept, 
                                folderPath: '',
                                type: hasFullDeptAccess ? 'deny' : 'allow'
                              });
                              if (dept) fetchCompanyFolders(companyFolderPrompt.companyId, dept);
                            }}
                            options={(companyDeptOptions[companyFolderPrompt.companyId] || []).map(d => ({ label: d, value: d }))}
                            placeholder="Select Dept"
                          />
                        </div>

                        <div className="flex-1 w-full">
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Folder</label>
                          <CustomSelect 
                            value={newRuleForm.folderPath}
                            onChange={(val) => setNewRuleForm({...newRuleForm, folderPath: val})}
                            disabled={!newRuleForm.department}
                            options={(companyFolderOptions[`${companyFolderPrompt.companyId}_${newRuleForm.department}`] || []).map(f => ({ label: f, value: f }))}
                            placeholder="Select Folder"
                          />
                        </div>

                        <div className="flex-1 w-full sm:w-auto min-w-[100px]">
                          <label className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1">Rule Type</label>
                          {(() => {
                             const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === companyFolderPrompt.companyId);
                             const hasFullDeptAccess = Boolean(companyRows.find((x: CompanyAccess) => x.department === newRuleForm.department));
                             
                             return (
                               <div className="w-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] px-4 text-[14px] text-[var(--text-tertiary)] flex items-center h-[42px] cursor-not-allowed">
                                 {newRuleForm.department ? (hasFullDeptAccess ? 'Exclude' : 'Include') : '-'}
                               </div>
                             );
                          })()}
                        </div>

                        <button 
                          onClick={() => addFolderRule(companyFolderPrompt.companyId)}
                          disabled={!newRuleForm.department || !newRuleForm.folderPath}
                          className="w-full sm:w-auto px-3 py-1.5 rounded-[8px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[12px] font-semibold disabled:opacity-50"
                        >
                          Add
                        </button>
                      </div>
                      
                      {(() => {
                         if (!newRuleForm.department) return null;
                         const companyRows: CompanyAccess[] = (detailPermData?.company_access || []).filter((x: CompanyAccess) => Number(x.company_id) === companyFolderPrompt.companyId);
                         const hasFullDeptAccess = Boolean(companyRows.find((x: CompanyAccess) => x.department === newRuleForm.department));
                         if (hasFullDeptAccess) {
                           return <p className="text-[11px] text-[var(--text-secondary)]">The user has full access to this department. You can only select folders to exclude from their view.</p>;
                         }
                         return <p className="text-[11px] text-[var(--text-secondary)]">The user does NOT have full access to this department. You can select folders to explicitly include for them.</p>;
                      })()}
                    </div>
                  </div>

                  <button onClick={() => setCompanyFolderPrompt(null)} className="w-full mt-3 py-2.5 rounded-[10px] text-[13px] font-semibold border border-[var(--border-subtle)] bg-[var(--bg-neutral)] text-[var(--text-secondary)] shrink-0">Done</button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}


      {/* ── New User Modal ── */}
      {isNewUserOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="bg-[var(--bg-surface)] rounded-[20px] shadow-[var(--shadow-medium)] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between px-7 pt-7 pb-5 border-b border-[var(--border-subtle)]">
              <div>
                <h2 className="text-[18px] font-bold text-[var(--text-primary)]">New User</h2>
                <p className="text-[13px] text-[var(--text-secondary)] mt-0.5">Add a team member to SmartVault.</p>
              </div>
              <button onClick={() => { setIsNewUserOpen(false); setForm({...emptyForm}); }} className="w-8 h-8 rounded-full bg-[var(--bg-neutral)] flex items-center justify-center hover:bg-[var(--bg-elevated)] transition-all text-[var(--text-tertiary)] border border-[var(--border-subtle)]">
                <X size={14}/>
              </button>
            </div>
            <form onSubmit={handleCreate} className="px-7 py-5 flex flex-col gap-4">
              {[{label:'Username',key:'username',type:'text',ph:'john.doe'},{label:'Email',key:'email',type:'email',ph:'john@company.com'},{label:'Password',key:'password',type:'password',ph:'Min 8 characters'}].map(f => (
                <div key={f.key}>
                  <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">{f.label}</label>
                  <input required type={f.type} value={(form as any)[f.key]} onChange={e => setForm(p => ({...p, [f.key]: e.target.value}))} placeholder={f.ph}
                    className="w-full bg-[var(--bg-neutral)] border border-[var(--border-subtle)] rounded-[10px] py-2.5 px-4 text-[14px] text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)]/50 focus:outline-none focus:border-[var(--accent)] focus:bg-[var(--bg-surface)] transition-all"/>
                </div>
              ))}
              <div>
                <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Company</label>
                <CustomSelect
                  value={(form as any).primary_company_id}
                  onChange={async (val) => {
                    setForm(p => ({...p, primary_company_id: val}));
                    const cid = Number(val);
                    if (cid) {
                      const depts = await fetchCompanyDepartments(cid);
                      if (depts && depts.length > 0) {
                        setForm(p => ({...p, department: depts[0]}));
                      } else {
                        setForm(p => ({...p, department: ''}));
                      }
                    }
                  }}
                  options={[
                    { label: 'Select company', value: '' },
                    ...companies.map(c => ({ label: c.name, value: c.id.toString() }))
                  ]}
                  placeholder="Select company"
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 z-40">
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Department</label>
                  <CustomSelect 
                    value={(form as any).department} 
                    onChange={val => {
                        setForm(p => ({...p, department: val, folder_path: ''})); 
                        if (val && (form as any).primary_company_id) fetchCompanyFolders(Number((form as any).primary_company_id), val);
                    }}
                    options={(((form as any).primary_company_id && companyDeptOptions[Number((form as any).primary_company_id)]) 
                      ? companyDeptOptions[Number((form as any).primary_company_id)]
                      : departments).map(o => ({ label: o, value: o }))
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Folder (Optional)</label>
                  <CustomSelect 
                    value={(form as any).folder_path || ''} 
                    onChange={val => setForm(p => ({...p, folder_path: val}))}
                    options={((form as any).primary_company_id && (form as any).department) 
                      ? (companyFolderOptions[`${(form as any).primary_company_id}_${(form as any).department}`] || []).map(f => ({ label: f, value: f })) 
                      : []
                    }
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Role</label>
                  <CustomSelect 
                    value={(form as any).role} 
                    onChange={val => setForm(p => ({...p, role: val}))}
                    options={ROLES.map(o => ({ label: o, value: o }))}
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="button" onClick={() => { setIsNewUserOpen(false); setForm({...emptyForm}); setCreateCompanyAccess([]); }} className="flex-1 py-2.5 rounded-[10px] bg-[var(--bg-neutral)] text-[14px] font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] transition-all border border-[var(--border-subtle)]">Cancel</button>
                <button type="submit" disabled={submitting} className="flex-1 py-2.5 rounded-[10px] bg-[var(--text-primary)] text-[14px] font-bold text-[var(--bg-app)] hover:opacity-90 transition-opacity disabled:opacity-50">
                  {submitting ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {createCompanyPrompt && (
        <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="bg-[var(--bg-surface)] rounded-[16px] shadow-[var(--shadow-medium)] w-full max-w-[420px] border border-[var(--border-subtle)] p-6">
            <h3 className="text-[17px] font-bold text-[var(--text-primary)]">Add Company Access</h3>
            <p className="text-[13px] text-[var(--text-secondary)] mt-2">
              {createCompanyPrompt.company_name}: pick department + access mode.
            </p>
            <div className="mt-3">
              <label className="block text-[11px] font-bold text-[var(--text-tertiary)] uppercase tracking-widest mb-1.5">Department</label>
              <CustomSelect
                value={createCompanyPrompt.department}
                onChange={(val) => setCreateCompanyPrompt((p) => p ? { ...p, department: val } : p)}
                options={departments.map(d => ({ label: d, value: d }))}
                placeholder="-- Select Default Dept --"
              />
            </div>
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => applyCreateCompanyAccess(false)} className="flex-1 py-2.5 rounded-[10px] bg-[var(--bg-neutral)] text-[14px] font-bold text-[var(--text-secondary)] border border-[var(--border-subtle)]">
                Read Only
              </button>
              <button type="button" onClick={() => applyCreateCompanyAccess(true)} className="flex-1 py-2.5 rounded-[10px] bg-[var(--text-primary)] text-[14px] font-bold text-[var(--bg-app)]">
                Allow Upload
              </button>
            </div>
            <button type="button" onClick={() => setCreateCompanyPrompt(null)} className="mt-2 w-full py-2 rounded-[10px] text-[12px] text-[var(--text-tertiary)]">Cancel</button>
          </div>
        </div>
      )}

      {/* Alert */}
      {alert && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 backdrop-blur-[2px] p-4">
          <div className="bg-[var(--bg-surface)] rounded-[18px] shadow-[var(--shadow-medium)] w-full max-w-[360px] p-8 flex flex-col items-center text-center animate-in zoom-in-95 duration-200 border border-[var(--border-subtle)]">
            <h3 className={`text-[18px] font-bold mb-2 ${alert.isError?'text-[#ff5b52]':'text-[var(--text-primary)]'}`}>{alert.title}</h3>
            <p className="text-[14px] text-[var(--text-secondary)] mb-6 font-medium leading-relaxed">{alert.message}</p>
            <button onClick={() => setAlert(null)} className="w-full py-3 rounded-[12px] bg-[var(--text-primary)] text-[var(--bg-app)] text-[14px] font-bold hover:opacity-90 transition-opacity">Dismiss</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function UsersPage() {
  return (
    <Suspense fallback={<div className="p-8">Loading users...</div>}>
      <UsersPageContent />
    </Suspense>
  );
}
