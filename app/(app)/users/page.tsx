'use client';

import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import { useAuth } from '@/components/auth/AuthProvider';
import Image from 'next/image';
import { logAudit } from '@/lib/audit';
import { PageHeader } from '@/components/shared/PageHeader';
import { EmptyState } from '@/components/shared/EmptyState';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { ROLE_LABELS, ROLE_DESCRIPTIONS, ALL_ROLES } from '@/lib/permissions';
import { initials, formatDateTime } from '@/lib/format';
import type { Profile, Role, Branch, Department } from '@/lib/types';
import { UserPlus, Search, ShieldCheck, Loader2, UserCog, Stamp, Upload, X, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const ROLES: Role[] = ALL_ROLES;

export default function UsersPage() {
  const { profile: me } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [projectList, setProjectList] = useState<{ id: string; name: string }[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [form, setForm] = useState({ email: '', password: '', full_name: '', role: 'accountant' as Role, branch_id: '', department_id: '', project_id: '', phone: '', designation: '' });
  const [assignedRoles, setAssignedRoles] = useState<Role[]>(['accountant']);
  const [assignedProjectIds, setAssignedProjectIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [sigTarget, setSigTarget] = useState<Profile | null>(null);
  const [sigOpen, setSigOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Profile | null>(null);
  const [deleting, setDeleting] = useState(false);

  const isSuperAdmin = me?.role === 'super_admin';

  const load = useCallback(async () => {
    setLoading(true);
    const [uRes, bRes, pRes, dRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('branches').select('*').order('name'),
      supabase.from('projects').select('id, name').order('name'),
      supabase.from('departments').select('*').order('name'),
    ]);
    if (uRes.error) toast.error(`Could not load users: ${uRes.error.message}`);
    const profiles = (uRes.data ?? []) as Profile[];
    const userIds = profiles.map((u) => u.id);
    let rolesByUser = new Map<string, Role[]>();
    if (userIds.length > 0) {
      const { data: roleRows, error: rolesError } = await supabase
        .from('user_roles').select('user_id, role').in('user_id', userIds);
      if (rolesError) {
        console.warn('Multi-role table is unavailable; using primary profile roles.', rolesError.message);
      } else {
        rolesByUser = new Map<string, Role[]>();
        for (const row of (roleRows ?? []) as { user_id: string; role: Role }[]) {
          rolesByUser.set(row.user_id, [...(rolesByUser.get(row.user_id) ?? []), row.role]);
        }
      }
    }
    setUsers(profiles.map((u) => ({ ...u, roles: rolesByUser.get(u.id)?.length ? rolesByUser.get(u.id) : [u.role] })));
    setBranches(bRes.data as Branch[] ?? []);
    setProjectList(pRes.data ?? []);
    setDepartments(dRes.data as Department[] ?? []);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return u.email.toLowerCase().includes(q) || u.full_name.toLowerCase().includes(q) || u.role.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setEditTarget(null);
    setForm({ email: '', password: '', full_name: '', role: 'accountant', branch_id: '', department_id: '', project_id: '', phone: '', designation: '' });
    setAssignedProjectIds([]);
    setAssignedRoles(['accountant']);
    setDialogOpen(true);
  };
  const openEdit = async (u: Profile) => {
    setEditTarget(u);
    setForm({ email: u.email, password: '', full_name: u.full_name, role: u.role, branch_id: u.branch_id ?? '', department_id: u.department_id ?? '', project_id: u.project_id ?? '', phone: u.phone ?? '', designation: u.designation ?? '' });
    const { data: urs, error: rolesError } = await supabase.from('user_roles').select('role').eq('user_id', u.id);
    const roles = (urs ?? []).map((r: { role: string }) => r.role as Role).filter((r): r is Role => ROLES.includes(r));
    if (rolesError && !isMissingRolesTable(rolesError.message)) console.warn('Could not load assigned roles:', rolesError.message);
    setAssignedRoles(roles.length > 0 ? roles : [u.role]);
    const { data: ups } = await supabase.from('user_projects').select('project_id').eq('user_id', u.id);
    setAssignedProjectIds((ups ?? []).map((r: { project_id: string }) => r.project_id));
    setDialogOpen(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editTarget) {
        const emailChanged = isSuperAdmin && form.email.trim().toLowerCase() !== editTarget.email;
        const nameChanged = form.full_name.trim() !== editTarget.full_name;

        // If super_admin changed email or reset password, update auth.users via edge function
        if (isSuperAdmin && (emailChanged || form.password)) {
          const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`;
          const { data: session } = await supabase.auth.getSession();
          const res = await fetch(apiUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.session?.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
            },
            body: JSON.stringify({
              action: 'update',
              user_id: editTarget.id,
              email: emailChanged ? form.email.trim() : undefined,
              password: form.password || undefined,
            }),
          });
          const result = await res.json();
          if (!res.ok) throw new Error(result.error || 'Failed to update user account');
        }

        const { error } = await supabase.from('profiles').update({
          full_name: form.full_name, role: assignedRoles[0] ?? form.role,
          branch_id: form.branch_id || null, department_id: form.department_id || null,
          project_id: assignedProjectIds[0] || null,
          phone: form.phone, designation: form.designation || null, is_active: editTarget.is_active,
          ...(isSuperAdmin && emailChanged ? { email: form.email.trim().toLowerCase() } : {}),
        }).eq('id', editTarget.id);
        if (error) throw error;

        await syncUserRoles(editTarget.id, assignedRoles);
        await syncUserProjects(editTarget.id, assignedProjectIds);
        await logAudit({ action: 'update', table_name: 'profiles', record_id: editTarget.id, new_values: { roles: assignedRoles, full_name: form.full_name, email: form.email } });
        toast.success('User updated');
      } else {
        if (!form.email || !form.password || !form.full_name) { toast.error('Email, password and name are required'); setSaving(false); return; }
        if (form.password.length < 8) { toast.error('Password must be at least 8 characters'); setSaving(false); return; }
        const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`;
        const { data: session } = await supabase.auth.getSession();
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.session?.access_token}`,
            apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
          },
          body: JSON.stringify({ ...form, role: assignedRoles[0] ?? form.role, roles: assignedRoles }),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to create user');

        await syncUserRoles(result.id, assignedRoles);
        await syncUserProjects(result.id, assignedProjectIds);

        await logAudit({ action: 'create_user', table_name: 'profiles', record_id: result.id, new_values: { email: form.email, roles: assignedRoles } });
        toast.success('User created');
      }
      setDialogOpen(false);
      load();
    } catch (e) { toast.error((e as Error).message); } finally { setSaving(false); }
  };

  const isMissingRolesTable = (message: string) => message.includes('user_roles') || message.includes('schema cache');

  const syncUserRoles = async (userId: string, roles: Role[]) => {
    const { error: deleteError } = await supabase.from('user_roles').delete().eq('user_id', userId);
    if (deleteError && !isMissingRolesTable(deleteError.message)) throw deleteError;
    if (roles.length > 0 && !deleteError) {
      const { error } = await supabase.from('user_roles').insert(roles.map((role) => ({ user_id: userId, role })));
      if (error && !isMissingRolesTable(error.message)) throw error;
    }
  };

  const syncUserProjects = async (userId: string, projectIds: string[]) => {
    const { data: existing } = await supabase.from('user_projects').select('project_id').eq('user_id', userId);
    const existingIds = (existing ?? []).map((r: { project_id: string }) => r.project_id);
    const toAdd = projectIds.filter((id) => !existingIds.includes(id));
    const toRemove = existingIds.filter((id) => !projectIds.includes(id));
    if (toAdd.length > 0) {
      await supabase.from('user_projects').insert(toAdd.map((project_id) => ({ user_id: userId, project_id })));
    }
    if (toRemove.length > 0) {
      await supabase.from('user_projects').delete().eq('user_id', userId).in('project_id', toRemove);
    }
  };

  const toggleActive = async (u: Profile) => {
    const { error } = await supabase.from('profiles').update({ is_active: !u.is_active }).eq('id', u.id);
    if (error) { toast.error(error.message); return; }
    await logAudit({ action: u.is_active ? 'deactivate_user' : 'activate_user', table_name: 'profiles', record_id: u.id });
    toast.success(`User ${u.is_active ? 'deactivated' : 'activated'}`);
    load();
  };

  const deleteUser = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const apiUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/manage-user`;
      const { data: session } = await supabase.auth.getSession();
      const res = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session?.access_token}`,
          apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
        },
        body: JSON.stringify({ action: 'delete', user_id: deleteTarget.id }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Failed to delete user');
      await logAudit({ action: 'delete_user', table_name: 'profiles', record_id: deleteTarget.id, new_values: { email: deleteTarget.email } });
      toast.success('User deleted');
      setDeleteTarget(null);
      load();
    } catch (e) { toast.error((e as Error).message); } finally { setDeleting(false); }
  };

  const openSignDialog = (u: Profile) => { setSigTarget(u); setSigOpen(true); };

  const ALLOWED_UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];

  const uploadFile = async (file: File, field: 'signature_url' | 'seal_url') => {
    if (!sigTarget) return;
    if (file.size > 2 * 1024 * 1024) { toast.error('File must be under 2MB'); return; }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) { toast.error('Only PNG, JPEG, GIF and WebP files are allowed'); return; }
    setUploading(true);
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/jpeg' ? 'jpg' : file.type === 'image/gif' ? 'gif' : 'webp';
      const path = `${sigTarget.id}/${field}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from('user-assets')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from('user-assets').getPublicUrl(path);
      const { error: dbErr } = await supabase
        .from('profiles')
        .update({ [field]: pub.publicUrl })
        .eq('id', sigTarget.id);
      if (dbErr) throw dbErr;
      await logAudit({ action: 'update', table_name: 'profiles', record_id: sigTarget.id, new_values: { [field]: pub.publicUrl } });
      toast.success(`${field === 'signature_url' ? 'Signature' : 'Seal'} uploaded`);
      setSigTarget({ ...sigTarget, [field]: pub.publicUrl });
      load();
    } catch (e) { toast.error((e as Error).message); } finally { setUploading(false); }
  };

  const removeFile = async (field: 'signature_url' | 'seal_url') => {
    if (!sigTarget) return;
    const ext = 'png';
    const path = `${sigTarget.id}/${field}.${ext}`;
    await supabase.storage.from('user-assets').remove([path]);
    const { error } = await supabase.from('profiles').update({ [field]: null }).eq('id', sigTarget.id);
    if (error) { toast.error(error.message); return; }
    setSigTarget({ ...sigTarget, [field]: null });
    toast.success(`${field === 'signature_url' ? 'Signature' : 'Seal'} removed`);
    load();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="User Management"
        description="Create and manage staff accounts, roles and permissions"
        actions={<Button onClick={openAdd}><UserPlus className="mr-2 h-4 w-4" /> Add User</Button>}
      />

      {/* Role legend */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {ROLES.map((r) => (
          <div key={r} className="flex items-start gap-2 rounded-lg border border-border bg-card p-3">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <div className="min-w-0">
              <p className="text-sm font-medium">{ROLE_LABELS[r]}</p>
              <p className="text-xs text-muted-foreground">{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Search by name, email or role..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <EmptyState icon={UserCog} title="No users found" description="Adjust your search or add a new user." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">User</th>
                  <th className="px-3 py-2.5 font-medium">Role</th>
                  <th className="px-3 py-2.5 font-medium">Last Login</th>
                  <th className="px-3 py-2.5 text-center font-medium">Status</th>
                  <th className="px-3 py-2.5 text-right font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-muted/30">
                    <td className="px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8"><AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials(u.full_name)}</AvatarFallback></Avatar>
                        <div className="min-w-0"><p className="truncate text-sm font-medium">{u.full_name}</p><p className="truncate text-xs text-muted-foreground">{u.email}</p></div>
                      </div>
                    </td>
                    <td className="px-3 py-2.5"><div className="flex flex-wrap gap-1">{(u.roles?.length ? u.roles : [u.role]).map((r) => <Badge key={r} variant={r === 'super_admin' ? 'default' : 'secondary'} className="text-[10px]">{ROLE_LABELS[r]}</Badge>)}</div></td>
                    <td className="px-3 py-2.5 text-xs text-muted-foreground">{formatDateTime(u.last_login_at)}</td>
                    <td className="px-3 py-2.5 text-center"><Badge variant={u.is_active ? 'success' : 'destructive'} className="text-[10px]">{u.is_active ? 'Active' : 'Inactive'}</Badge></td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center justify-end gap-1">
                        {u.id !== me?.id && (
                          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toggleActive(u)}>{u.is_active ? 'Deactivate' : 'Activate'}</Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openSignDialog(u)} title="Signature & Seal"><Stamp className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(u)} title="Edit"><UserCog className="h-3.5 w-3.5" /></Button>
                        {isSuperAdmin && u.id !== me?.id && (
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:bg-destructive/10" onClick={() => setDeleteTarget(u)} title="Delete"><Trash2 className="h-3.5 w-3.5" /></Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[calc(100vh-2rem)] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editTarget ? 'Edit User' : 'Add New User'}</DialogTitle>
            <DialogDescription>{editTarget ? 'Update role and assignment.' : 'Create a new staff account.'}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-1">
            <div className="space-y-1.5"><Label>Full Name</Label><Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} disabled={!!editTarget && !isSuperAdmin} /></div>
            <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!editTarget && !isSuperAdmin} /></div>
            {!editTarget && <div className="space-y-1.5"><Label>Password</Label><Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Min 6 characters" /></div>}
            {editTarget && isSuperAdmin && (
              <div className="space-y-1.5">
                <Label>Reset Password</Label>
                <Input type="password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} placeholder="Leave blank to keep current password" />
                <p className="text-xs text-muted-foreground">Enter a new password only if you want to reset it.</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label>Roles</Label>
                <div className="max-h-28 overflow-y-auto rounded-md border-border p-1">
                  {ROLES.map((r) => (
                    <label key={r} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 hover:bg-muted/30">
                      <Checkbox checked={assignedRoles.includes(r)} onCheckedChange={(checked) => {
                        setAssignedRoles((prev) => checked ? [...new Set([...prev, r])] : prev.filter((role) => role !== r));
                      }} />
                      <span className="text-sm">{ROLE_LABELS[r]}</span>
                    </label>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground">Select one or more roles; the first is primary.</p>
              </div>
              <div className="space-y-1.5"><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            </div>
            <div className="space-y-1.5"><Label>Designation</Label><Input value={form.designation} onChange={(e) => setForm({ ...form, designation: e.target.value })} placeholder="e.g. Deputy Executive Director" /></div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5"><Label>Branch</Label>
                <Select value={form.branch_id || 'none'} onValueChange={(v) => setForm({ ...form, branch_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Any</SelectItem>{branches.map((b) => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Department</Label>
                <Select value={form.department_id || 'none'} onValueChange={(v) => setForm({ ...form, department_id: v === 'none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Any" /></SelectTrigger>
                  <SelectContent><SelectItem value="none">Any</SelectItem>{departments.map((d) => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Assigned Projects</Label>
                <div className="max-h-40 overflow-y-auto rounded-md border border-border p-2">
                  {projectList.length === 0 ? (
                    <p className="text-xs text-muted-foreground p-2">No projects available</p>
                  ) : (
                    projectList.map((p) => (
                      <label key={p.id} className="flex items-center gap-2 py-1 cursor-pointer hover:bg-muted/30 rounded px-1">
                        <Checkbox
                          checked={assignedProjectIds.includes(p.id)}
                          onCheckedChange={(checked) => {
                            if (checked) {
                              setAssignedProjectIds((prev) => [...prev, p.id]);
                            } else {
                              setAssignedProjectIds((prev) => prev.filter((id) => id !== p.id));
                            }
                          }}
                        />
                        <span className="text-sm">{p.name}</span>
                      </label>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Select projects; the first is default.</p>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Saving...' : editTarget ? 'Update' : 'Create User'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signature & Seal dialog */}
      <Dialog open={sigOpen} onOpenChange={setSigOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Stamp className="h-4 w-4" /> Signature & Seal</DialogTitle>
            <DialogDescription>
              Upload signature and seal for {sigTarget?.full_name} ({sigTarget && ROLE_LABELS[sigTarget.role]}). These appear on printed vouchers.
            </DialogDescription>
          </DialogHeader>
          {sigTarget && (
            <div className="space-y-4">
              {/* Signature */}
              <div className="space-y-2">
                <Label>Signature</Label>
                <div className="flex items-center gap-3">
                  {sigTarget.signature_url ? (
                    <div className="relative h-16 w-32"><Image src={sigTarget.signature_url} alt="Signature" fill className="rounded border border-border object-contain" /></div>
                  ) : (
                    <div className="flex h-16 w-32 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">No signature</div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label>
                      <Input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'signature_url'); }} />
                      <span className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Upload className="h-3 w-3" /> Upload</span>
                    </label>
                    {sigTarget.signature_url && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeFile('signature_url')}><X className="mr-1 h-3 w-3" /> Remove</Button>
                    )}
                  </div>
                </div>
              </div>

              {/* Seal */}
              <div className="space-y-2">
                <Label>Seal / Stamp</Label>
                <div className="flex items-center gap-3">
                  {sigTarget.seal_url ? (
                    <div className="relative h-20 w-20"><Image src={sigTarget.seal_url} alt="Seal" fill className="rounded border border-border object-contain" /></div>
                  ) : (
                    <div className="flex h-20 w-20 items-center justify-center rounded border border-dashed border-border text-xs text-muted-foreground">No seal</div>
                  )}
                  <div className="flex flex-col gap-1">
                    <label>
                      <Input type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, 'seal_url'); }} />
                      <span className="inline-flex cursor-pointer items-center gap-1 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"><Upload className="h-3 w-3" /> Upload</span>
                    </label>
                    {sigTarget.seal_url && (
                      <Button variant="ghost" size="sm" className="h-6 text-xs text-destructive" onClick={() => removeFile('seal_url')}><X className="mr-1 h-3 w-3" /> Remove</Button>
                    )}
                  </div>
                </div>
              </div>

              {uploading && <div className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Uploading...</div>}
              <p className="text-xs text-muted-foreground">Tip: Use a transparent PNG for best results. Max 2MB.</p>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSigOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user account?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete <strong>{deleteTarget?.full_name}</strong> ({deleteTarget?.email}) and remove their access. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteUser} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
