'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Mail,
  Phone,
  School,
  Shield,
  DollarSign,
  User,
  Calendar,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface CoachApplication {
  id: string;
  first_name: string;
  last_name: string;
  school: string;
  coach_type: string;
  bio: string;
  weight_class: string | null;
  status: string;
  active: boolean;
  safesport_certified: boolean;
  safesport_expiry: string | null;
  usa_wrestling_certified: boolean;
  usa_wrestling_expiry: string | null;
  background_check: boolean;
  background_check_date: string | null;
  payout_method: string;
  venmo_handle: string | null;
  zelle_contact: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  tshirt_size: string | null;
  date_of_birth: string | null;
  agreement_signed_at: string | null;
  admin_notes: string | null;
  rejected_reason: string | null;
  created_at: string;
  users: {
    email: string;
    phone: string | null;
  };
}

interface Props {
  applications: CoachApplication[];
}

export function CoachApplicationsClient({ applications }: Props) {
  const router = useRouter();
  const [selectedApp, setSelectedApp] = useState<CoachApplication | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);

  const pendingApps = applications.filter(a => a.status === 'pending');
  const activeApps = applications.filter(a => a.status === 'active');
  const rejectedApps = applications.filter(a => a.status === 'rejected');

  const handleApprove = async (app: CoachApplication) => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/coach-applications/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: app.id, adminNotes }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to approve');
        return;
      }

      router.refresh();
      setSelectedApp(null);
      setAdminNotes('');
    } catch (err) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async (app: CoachApplication) => {
    if (!rejectReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/admin/coach-applications/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ coachId: app.id, reason: rejectReason, adminNotes }),
      });

      if (!response.ok) {
        const data = await response.json();
        alert(data.error || 'Failed to reject');
        return;
      }

      router.refresh();
      setSelectedApp(null);
      setShowRejectDialog(false);
      setRejectReason('');
      setAdminNotes('');
    } catch (err) {
      alert('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const renderApplicationCard = (app: CoachApplication, showActions: boolean = false) => (
    <Card
      key={app.id}
      className={`cursor-pointer transition-all hover:border-accent ${
        selectedApp?.id === app.id ? 'border-accent ring-1 ring-accent' : ''
      }`}
      onClick={() => {
        setSelectedApp(app);
        setAdminNotes(app.admin_notes || '');
      }}
    >
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-lg">
              {app.first_name} {app.last_name}
            </CardTitle>
            <CardDescription className="flex items-center gap-2">
              <School className="h-3 w-3" />
              {app.school}
              {app.coach_type === 'ncaa_athlete' ? <Badge variant="secondary" className="text-xs">Active college</Badge> : null}
              {app.coach_type === 'former_college_athlete' ? <Badge variant="secondary" className="text-xs">Former college</Badge> : null}
            </CardDescription>
          </div>
          <Badge
            variant={
              app.status === 'pending' ? 'outline' :
              app.status === 'active' ? 'default' : 'destructive'
            }
          >
            {app.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Mail className="h-3 w-3" />
            {app.users.email}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDistanceToNow(new Date(app.created_at), { addSuffix: true })}
          </span>
        </div>
        {!app.safesport_certified && (
          <div className="mt-2 flex items-center gap-1 text-xs text-amber-500">
            <AlertCircle className="h-3 w-3" />
            No SafeSport certification
          </div>
        )}
      </CardContent>
    </Card>
  );

  const renderDetailPanel = () => {
    if (!selectedApp) {
      return (
        <div className="flex items-center justify-center h-full text-muted-foreground">
          Select an application to view details
        </div>
      );
    }

    const app = selectedApp;

    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-xl font-serif font-bold">
            {app.first_name} {app.last_name}
          </h2>
          <p className="text-muted-foreground">{app.school}</p>
        </div>

        {/* Contact Info */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <User className="h-4 w-4" /> Contact Information
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <span className="text-muted-foreground">Email:</span>
              <p>{app.users.email}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Phone:</span>
              <p>{app.users.phone || 'Not provided'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Date of Birth:</span>
              <p>{app.date_of_birth || 'Not provided'}</p>
            </div>
            <div>
              <span className="text-muted-foreground">Coach Type:</span>
              <p>{app.coach_type === 'ncaa_athlete' ? 'Active College Athlete' : app.coach_type === 'former_college_athlete' ? 'Former College Athlete' : 'Club/HS Coach'}</p>
            </div>
          </div>
        </div>

        {/* Bio */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Bio</h3>
          <p className="text-sm text-muted-foreground bg-muted/50 p-3 rounded-lg">
            {app.bio || 'No bio provided'}
          </p>
        </div>

        {/* Safety Certifications */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Shield className="h-4 w-4" /> Safety Certifications
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              {app.safesport_certified ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>SafeSport</span>
              {app.safesport_expiry && (
                <span className="text-xs text-muted-foreground">
                  (expires {app.safesport_expiry})
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {app.usa_wrestling_certified ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>USA Wrestling</span>
              {app.usa_wrestling_expiry ? <span className="text-xs text-muted-foreground">(expires {app.usa_wrestling_expiry})</span> : null}
            </div>
            <div className="flex items-center gap-2">
              {app.background_check ? (
                <CheckCircle2 className="h-4 w-4 text-green-500" />
              ) : (
                <XCircle className="h-4 w-4 text-red-500" />
              )}
              <span>Background Check</span>
              {app.background_check_date && (
                <span className="text-xs text-muted-foreground">
                  ({app.background_check_date})
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Payout Info */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Payout Information
          </h3>
          <div className="text-sm">
            <span className="text-muted-foreground">Method:</span>{' '}
            {app.payout_method === 'venmo' ? 'Venmo' : 'Zelle'}
            <br />
            <span className="text-muted-foreground">Contact:</span>{' '}
            {app.venmo_handle || app.zelle_contact || 'Not provided'}
          </div>
        </div>

        {/* Emergency Contact */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Phone className="h-4 w-4" /> Emergency Contact
          </h3>
          <div className="text-sm">
            <p>{app.emergency_contact_name || 'Not provided'}</p>
            <p className="text-muted-foreground">
              {app.emergency_contact_phone} ({app.emergency_contact_relationship})
            </p>
          </div>
        </div>

        {/* Agreement */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Agreement
          </h3>
          <div className="text-sm">
            {app.agreement_signed_at ? (
              <p className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="h-4 w-4" />
                Signed {formatDistanceToNow(new Date(app.agreement_signed_at), { addSuffix: true })}
              </p>
            ) : (
              <p className="text-red-500">Not signed</p>
            )}
          </div>
        </div>

        {/* Admin Notes */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold">Admin Notes</h3>
          <Textarea
            placeholder="Add internal notes about this application..."
            value={adminNotes}
            onChange={(e) => setAdminNotes(e.target.value)}
            className="min-h-[80px]"
          />
        </div>

        {/* Actions */}
        {app.status === 'pending' && (
          <div className="flex gap-3 pt-4 border-t">
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700"
              onClick={() => handleApprove(app)}
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
              Approve
            </Button>
            <Button
              variant="destructive"
              className="flex-1"
              onClick={() => setShowRejectDialog(true)}
              disabled={loading}
            >
              <XCircle className="h-4 w-4 mr-2" />
              Reject
            </Button>
          </div>
        )}

        {app.status === 'rejected' && app.rejected_reason && (
          <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
            <p className="text-sm font-medium text-destructive">Rejection Reason:</p>
            <p className="text-sm text-muted-foreground">{app.rejected_reason}</p>
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingApps.length > 0 && (
              <span className="ml-2 px-2 py-0.5 text-xs bg-accent text-black rounded-full">
                {pendingApps.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active">Active ({activeApps.length})</TabsTrigger>
          <TabsTrigger value="rejected">Rejected ({rejectedApps.length})</TabsTrigger>
        </TabsList>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Application List */}
          <div className="lg:col-span-1 space-y-3 max-h-[600px] overflow-y-auto">
            <TabsContent value="pending" className="mt-0 space-y-3">
              {pendingApps.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">No pending applications</p>
              ) : (
                pendingApps.map(app => renderApplicationCard(app, true))
              )}
            </TabsContent>
            <TabsContent value="active" className="mt-0 space-y-3">
              {activeApps.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">No active coaches</p>
              ) : (
                activeApps.map(app => renderApplicationCard(app))
              )}
            </TabsContent>
            <TabsContent value="rejected" className="mt-0 space-y-3">
              {rejectedApps.length === 0 ? (
                <p className="text-sm text-muted-foreground p-4 text-center">No rejected applications</p>
              ) : (
                rejectedApps.map(app => renderApplicationCard(app))
              )}
            </TabsContent>
          </div>

          {/* Detail Panel */}
          <Card className="lg:col-span-2">
            <CardContent className="p-6 min-h-[400px]">
              {renderDetailPanel()}
            </CardContent>
          </Card>
        </div>
      </Tabs>

      {/* Reject Dialog */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Application</DialogTitle>
            <DialogDescription>
              Please provide a reason for rejecting this application. This will be shown to the applicant.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="min-h-[100px]"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRejectDialog(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => selectedApp && handleReject(selectedApp)}
              disabled={loading || !rejectReason.trim()}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Application
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
