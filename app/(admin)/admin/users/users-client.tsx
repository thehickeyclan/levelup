'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eye, Pencil, Archive, ArchiveRestore, Trash2, Search, Gift, CheckCircle, EyeOff } from 'lucide-react';
import { hasMinPhoneDigits } from '@/lib/phone';
import { formatEST } from '@/lib/format-date';

export type AdminUserRow = {
  id: string;
  email: string;
  role: string;
  created_at: string;
  last_login_at: string | null;
  archived_at: string | null;
  first_name?: string | null;
  last_name?: string | null;
  display_name?: string | null;
  school?: string | null;
  /** For coaches: true = visible on Browse Coaches, false = hidden. null = not a coach. */
  athlete_active?: boolean | null;
  /** For parents: display names of their youth wrestlers (kids). Inactive kids include " (inactive)". */
  kids_names?: string[] | null;
  /** For parents: number of coach reviews submitted (from public.reviews). */
  review_count?: number;
  phone?: string | null;
  zip_code?: string | null;
};

type SortOption = 'email_asc' | 'email_desc' | 'role' | 'created_desc' | 'created_asc' | 'login_desc' | 'login_asc';

const ROLE_LABELS: Record<string, string> = {
  parent: 'Parent',
  coach: 'Coach',
  admin: 'Admin',
  youth_wrestler: 'Athlete',
};

export function AdminUsersClient({ initialUsers }: { initialUsers: AdminUserRow[] }) {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUserRow[]>(initialUsers);
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('created_desc');
  const [includeArchived, setIncludeArchived] = useState(false);
  const [search, setSearch] = useState('');
  const [editUser, setEditUser] = useState<AdminUserRow | null>(null);
  const [editRole, setEditRole] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editZip, setEditZip] = useState('');
  const [deleteUser, setDeleteUser] = useState<AdminUserRow | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [grantingId, setGrantingId] = useState<string | null>(null);
  const [activatingId, setActivatingId] = useState<string | null>(null);

  const filteredAndSorted = useMemo(() => {
    let list = users.filter((u) => {
      if (!includeArchived && u.archived_at) return false;
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (search.trim()) {
        const q = search.toLowerCase().trim();
        const matchEmail = u.email.toLowerCase().includes(q);
        const matchName = u.display_name?.toLowerCase().includes(q);
        const matchLast = (u.last_name ?? '').toLowerCase().includes(q);
        const matchFirst = (u.first_name ?? '').toLowerCase().includes(q);
        const matchId = u.id.toLowerCase().includes(q.toLowerCase());
        if (!matchEmail && !matchName && !matchLast && !matchFirst && !matchId) return false;
      }
      return true;
    });
    const cmp = (a: AdminUserRow, b: AdminUserRow) => {
      switch (sortBy) {
        case 'email_asc':
          return a.email.localeCompare(b.email);
        case 'email_desc':
          return b.email.localeCompare(a.email);
        case 'role':
          return a.role.localeCompare(b.role) || a.email.localeCompare(b.email);
        case 'created_desc':
          return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
        case 'created_asc':
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        case 'login_desc': {
          const ta = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
          const tb = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
          return tb - ta;
        }
        case 'login_asc': {
          const ta = a.last_login_at ? new Date(a.last_login_at).getTime() : 0;
          const tb = b.last_login_at ? new Date(b.last_login_at).getTime() : 0;
          return ta - tb;
        }
        default:
          return 0;
      }
    };
    list.sort(cmp);
    return list;
  }, [users, roleFilter, sortBy, includeArchived, search]);

  const handleGrantEarlyAdopter = async (u: AdminUserRow) => {
    if (u.role !== 'parent') return;
    setGrantingId(u.id);
    setError(null);
    try {
      const res = await fetch('/api/admin/grant-early-adopter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent_id: u.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to grant');
        return;
      }
      router.refresh();
    } catch {
      setError('Request failed');
    } finally {
      setGrantingId(null);
    }
  };

  const handleArchive = async (u: AdminUserRow, archive: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ archived_at: archive ? new Date().toISOString() : null }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to update');
        return;
      }
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, archived_at: archive ? new Date().toISOString() : null } : x))
      );
      setEditUser(null);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const coachPhoneRequired = editRole === 'coach';
  const coachPhoneValid = !coachPhoneRequired || hasMinPhoneDigits(editPhone);

  const handleSaveEdit = async () => {
    if (!editUser || editRole === '') return;
    if (editRole === 'coach' && !hasMinPhoneDigits(editPhone)) {
      setError('Coaches must have a cell phone on file (at least 10 digits).');
      return;
    }
    const roleDirty = editRole !== editUser.role;
    const phoneDirty = (editPhone.trim() || '') !== (editUser.phone ?? '').trim();
    const zipDirty = (editZip.trim() || '') !== (editUser.zip_code ?? '').trim();
    if (!roleDirty && !phoneDirty && !zipDirty) {
      setEditUser(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (roleDirty) payload.role = editRole;
      if (phoneDirty) payload.phone = editPhone.trim() === '' ? null : editPhone.trim();
      if (zipDirty) payload.zipCode = editZip.trim() === '' ? null : editZip.trim();
      const res = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to update');
        return;
      }
      setUsers((prev) =>
        prev.map((x) =>
          x.id === editUser.id
            ? {
                ...x,
                role: typeof data.role === 'string' ? data.role : editRole,
                phone: data.phone ?? (phoneDirty ? (editPhone.trim() === '' ? null : editPhone.trim()) : x.phone),
                zip_code:
                  data.zip_code ??
                  (zipDirty ? (editZip.trim() === '' ? null : editZip.trim()) : x.zip_code),
              }
            : x
        )
      );
      setEditUser(null);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteUser) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Failed to delete');
        return;
      }
      setUsers((prev) => prev.filter((x) => x.id !== deleteUser.id));
      setDeleteUser(null);
    } catch {
      setError('Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const viewProfileUrl = (u: AdminUserRow) => {
    if (u.role === 'coach') return `/athlete/${u.id}`;
    if (u.role === 'parent') return `/admin/users/${u.id}`;
    return null;
  };

  const handleSetCoachActive = async (u: AdminUserRow, active: boolean) => {
    if (u.role !== 'coach') return;
    setActivatingId(u.id);
    setError(null);
    try {
      const res = await fetch(`/api/admin/athletes/${u.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || (active ? 'Failed to activate' : 'Failed to hide'));
        return;
      }
      setUsers((prev) =>
        prev.map((x) => (x.id === u.id ? { ...x, athlete_active: active } : x))
      );
      router.refresh();
    } catch {
      setError('Request failed');
    } finally {
      setActivatingId(null);
    }
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md bg-destructive/10 text-destructive px-4 py-2 text-sm">
          {error}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>All users</CardTitle>
          <CardDescription>
            Sort and filter between athletes (coaches), parents, and admins. View profiles, edit role, archive, or delete.
          </CardDescription>
          <div className="flex flex-wrap gap-4 pt-4">
            <Select value={roleFilter} onValueChange={setRoleFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Role" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                <SelectItem value="coach">Coaches</SelectItem>
                <SelectItem value="parent">Parents</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="youth_wrestler">Athlete</SelectItem>
              </SelectContent>
            </Select>
            <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortOption)}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="created_desc">Newest first</SelectItem>
                <SelectItem value="created_asc">Oldest first</SelectItem>
                <SelectItem value="email_asc">Email A–Z</SelectItem>
                <SelectItem value="email_desc">Email Z–A</SelectItem>
                <SelectItem value="role">Role</SelectItem>
                <SelectItem value="login_desc">Last login (recent)</SelectItem>
                <SelectItem value="login_asc">Last login (oldest)</SelectItem>
              </SelectContent>
            </Select>
            <div className="relative flex-1 min-w-[200px] max-w-xs">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search email, name, or user id…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="rounded border-input"
              />
              Include archived
            </label>
            <span className="text-sm text-muted-foreground self-center">
              {filteredAndSorted.length} user{filteredAndSorted.length !== 1 ? 's' : ''}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 font-medium">Profile / Name</th>
                  <th className="text-left py-2 font-medium">Last name</th>
                  <th className="text-left py-2 font-medium">Email</th>
                  <th className="text-left py-2 font-medium w-[7rem] font-normal text-muted-foreground">User ID</th>
                  <th className="text-left py-2 font-medium">Role</th>
                  <th className="text-left py-2 font-medium">Kids / activity</th>
                  <th className="text-left py-2 font-medium">Created</th>
                  <th className="text-left py-2 font-medium">Last login</th>
                  <th className="text-left py-2 font-medium">Status</th>
                  <th className="text-right py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAndSorted.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-muted-foreground">
                      No users match filters.
                    </td>
                  </tr>
                ) : (
                  filteredAndSorted.map((u) => (
                    <tr key={u.id} className={`border-b last:border-0 ${u.archived_at ? 'opacity-60' : ''}`}>
                      <td className="py-2">
                        <Link
                          href={`/admin/users/${u.id}`}
                          className="group block rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {u.display_name ? (
                            <span className="font-medium group-hover:underline">{u.display_name}</span>
                          ) : (
                            <span className="text-muted-foreground group-hover:underline">View profile</span>
                          )}
                          {u.school && (
                            <span className="block text-xs text-muted-foreground">{u.school}</span>
                          )}
                        </Link>
                      </td>
                      <td className="py-2 text-muted-foreground">{u.last_name?.trim() || '—'}</td>
                      <td className="py-2">
                        <Link href={`/admin/users/${u.id}`} className="text-accent hover:underline block">
                          {u.email}
                        </Link>
                        <a href={`mailto:${u.email}`} className="text-xs text-muted-foreground hover:underline">
                          Email
                        </a>
                      </td>
                      <td className="py-2">
                        <code
                          className="text-[10px] text-muted-foreground break-all cursor-help"
                          title={u.id}
                        >
                          {u.id.slice(0, 8)}…
                        </code>
                      </td>
                      <td className="py-2">
                        <Badge variant="outline">{ROLE_LABELS[u.role] ?? u.role}</Badge>
                      </td>
                      <td className="py-2 max-w-[220px]">
                        <div className="text-xs text-muted-foreground space-y-1">
                          {u.role === 'parent' ? (
                            <>
                              {u.kids_names?.length ? (
                                <span>{u.kids_names.join(', ')}</span>
                              ) : (
                                <span className="italic">No wrestlers on file</span>
                              )}
                              {(u.review_count ?? 0) > 0 && (
                                <span className="block text-foreground/90">
                                  {u.review_count} coach review{u.review_count === 1 ? '' : 's'} (
                                  <Link href="/admin/reviews" className="text-accent hover:underline">
                                    see admin reviews
                                  </Link>
                                  )
                                </span>
                              )}
                            </>
                          ) : u.kids_names?.length ? (
                            <span>{u.kids_names.join(', ')}</span>
                          ) : (
                            <span>—</span>
                          )}
                        </div>
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {formatEST(new Date(u.created_at), 'MMM d, yyyy')}
                      </td>
                      <td className="py-2 text-muted-foreground">
                        {u.last_login_at
                          ? formatEST(new Date(u.last_login_at), 'MMM d, yyyy h:mm a')
                          : '—'}
                      </td>
                      <td className="py-2">
                        {u.archived_at ? (
                          <Badge variant="secondary">Archived</Badge>
                        ) : (
                          <span className="text-muted-foreground">Active</span>
                        )}
                        {u.role === 'coach' && u.athlete_active !== undefined && (
                          <div className="mt-1">
                            {u.athlete_active ? (
                              <Badge variant="outline" className="text-xs font-normal">Visible on Browse</Badge>
                            ) : (
                              <Badge variant="secondary" className="text-xs font-normal">Hidden from Browse</Badge>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="py-2 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {viewProfileUrl(u) && (
                            <>
                              <Link href={viewProfileUrl(u)!}>
                                <Button variant="ghost" size="sm" className="h-8">
                                  <Eye className="h-4 w-4 mr-1" />
                                  View profile
                                </Button>
                              </Link>
                              {u.role === 'coach' && (
                                <>
                                  <Link href={`/admin?tab=athletes&edit=${u.id}`}>
                                    <Button variant="ghost" size="sm" className="h-8">
                                      <Pencil className="h-4 w-4 mr-1" />
                                      Edit profile
                                    </Button>
                                  </Link>
                                  {u.athlete_active ? (
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      className="h-8"
                                      onClick={() => handleSetCoachActive(u, false)}
                                      disabled={loading || activatingId === u.id}
                                      title="Hide from Browse (parents won’t see this coach)"
                                    >
                                      {activatingId === u.id ? '…' : (
                                        <>
                                          <EyeOff className="h-4 w-4 mr-1" />
                                          Hide from Browse
                                        </>
                                      )}
                                    </Button>
                                  ) : (
                                    <Button
                                      variant="default"
                                      size="sm"
                                      className="h-8"
                                      onClick={() => handleSetCoachActive(u, true)}
                                      disabled={loading || activatingId === u.id}
                                      title="Make coach visible to parents"
                                    >
                                      {activatingId === u.id ? '…' : (
                                        <>
                                          <CheckCircle className="h-4 w-4 mr-1" />
                                          Activate
                                        </>
                                      )}
                                    </Button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                          {u.role === 'parent' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => handleGrantEarlyAdopter(u)}
                              disabled={loading || grantingId === u.id}
                              title="Grant legacy early_adopter_entitlements rows (admin ops; not used by current book-a-coach UI)"
                            >
                              {grantingId === u.id ? (
                                'Granting…'
                              ) : (
                                <>
                                  <Gift className="h-4 w-4 mr-1" />
                                  Grant early adopter
                                </>
                              )}
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8"
                            onClick={() => {
                              setEditUser(u);
                              setEditRole(u.role);
                              setEditPhone(u.phone ?? '');
                              setEditZip(u.zip_code ?? '');
                              setError(null);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-1" />
                            Edit user
                          </Button>
                          {u.archived_at ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => handleArchive(u, false)}
                              disabled={loading}
                            >
                              <ArchiveRestore className="h-4 w-4 mr-1" />
                              Unarchive
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8"
                              onClick={() => handleArchive(u, true)}
                              disabled={loading}
                            >
                              <Archive className="h-4 w-4 mr-1" />
                              Archive
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 text-destructive hover:text-destructive"
                            onClick={() => {
                              setDeleteUser(u);
                              setError(null);
                            }}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Edit modal */}
      <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit user</DialogTitle>
            <DialogDescription>
              {editUser?.display_name && <span className="font-medium">{editUser.display_name}</span>}
              {editUser?.display_name && editUser?.email && ' · '}
              {editUser?.email}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Role</label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="parent">Parent</SelectItem>
                  <SelectItem value="coach">Coach</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="youth_wrestler">Athlete</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block" htmlFor="admin-user-phone">
                Cell phone
              </label>
              <Input
                id="admin-user-phone"
                type="tel"
                autoComplete="tel"
                placeholder="10+ digits"
                value={editPhone}
                onChange={(e) => setEditPhone(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">
                {coachPhoneRequired
                  ? 'Required for coaches — used for booking alerts and ops texts.'
                  : 'Required for SMS and alerts. Cannot be cleared once set.'}
              </p>
              {coachPhoneRequired && !coachPhoneValid && editPhone.trim() !== '' && (
                <p className="text-xs text-destructive mt-1">Enter at least 10 digits.</p>
              )}
              {coachPhoneRequired && editPhone.trim() === '' && (
                <p className="text-xs text-destructive mt-1">Cell phone is required for coaches.</p>
              )}
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block" htmlFor="admin-user-zip">
                Home ZIP
              </label>
              <Input
                id="admin-user-zip"
                autoComplete="postal-code"
                placeholder="e.g. 27607 or 27607-1234"
                value={editZip}
                onChange={(e) => setEditZip(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">U.S. 5-digit or ZIP+4. Leave blank to clear.</p>
            </div>
            {editUser?.archived_at && (
              <Button
                variant="outline"
                onClick={() => editUser && handleArchive(editUser, false)}
                disabled={loading}
              >
                <ArchiveRestore className="h-4 w-4 mr-2" />
                Unarchive user
              </Button>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
            <Button
              onClick={() => void handleSaveEdit()}
              disabled={
                loading ||
                !coachPhoneValid ||
                (!!editUser &&
                  editRole === editUser.role &&
                  (editPhone.trim() || '') === (editUser.phone ?? '').trim() &&
                  (editZip.trim() || '') === (editUser.zip_code ?? '').trim())
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <Dialog open={!!deleteUser} onOpenChange={(open) => !open && setDeleteUser(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete user</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2">
                <p>
                  Permanently delete <strong>{deleteUser?.email}</strong>
                  {deleteUser?.display_name && (
                    <> ({deleteUser.display_name})</>
                  )}?
                </p>
                <p className="text-sm text-muted-foreground">
                  This removes their user record and signs them out. Auth account is also deleted. Related data (sessions, bookings, etc.) may be affected by your database rules. This cannot be undone.
                </p>
                {deleteUser?.last_login_at && (
                  <p className="text-sm text-muted-foreground">
                    Last login: {formatEST(new Date(deleteUser.last_login_at), 'MMM d, yyyy h:mm a')}
                  </p>
                )}
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteUser(null)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={loading}>
              Delete user
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
