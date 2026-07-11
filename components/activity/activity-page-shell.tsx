'use client';

import { useRef, useState } from 'react';
import { Camera, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ActivityFeedPost, ActivityFeedScope } from '@/lib/activity-feed/types';
import type { ActivityScopeOption } from '@/lib/activity-feed/activity-scope-config';
import { ActivityFeedList } from '@/components/activity/activity-feed-list';
import { ActivitySharePhotoDialog } from '@/components/activity/activity-share-photo-dialog';
import { ActivityFeedScopeToggle } from '@/components/activity/activity-feed-scope-toggle';

type Props = {
  title: string;
  description: string;
  posts: ActivityFeedPost[];
  role: string;
  scope: ActivityFeedScope;
  scopeOptions: ActivityScopeOption[];
  highlightCoachHammers?: boolean;
  showShareButton?: boolean;
  emptyMessage?: string;
};

export function ActivityPageShell({
  title,
  description,
  posts,
  role,
  scope,
  scopeOptions,
  highlightCoachHammers = false,
  showShareButton = true,
  emptyMessage,
}: Props) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [initialFiles, setInitialFiles] = useState<File[]>([]);
  const [photoTakenAt, setPhotoTakenAt] = useState<Date | null>(null);

  const openGallery = () => {
    setInitialFiles([]);
    setPhotoTakenAt(null);
    setShareOpen(true);
  };

  const onCameraCapture = (picked: FileList | null) => {
    const file = picked?.[0];
    if (!file) return;
    setInitialFiles([file]);
    setPhotoTakenAt(new Date(file.lastModified));
    setShareOpen(true);
    if (cameraInputRef.current) cameraInputRef.current.value = '';
  };

  const onDialogOpenChange = (open: boolean) => {
    setShareOpen(open);
    if (!open) {
      setInitialFiles([]);
      setPhotoTakenAt(null);
    }
  };

  return (
    <div className="px-4 pt-6 max-w-lg mx-auto pb-24">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-bold text-foreground">{title}</h1>
          <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{description}</p>
        </div>
        {showShareButton ? (
          <div className="flex shrink-0 items-center gap-2">
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => onCameraCapture(e.target.files)}
            />
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="h-10 w-10 rounded-full touch-manipulation"
              aria-label="Take a photo for activity"
              onClick={() => cameraInputRef.current?.click()}
            >
              <Camera className="h-5 w-5" />
            </Button>
            <Button
              type="button"
              size="icon"
              className="h-10 w-10 rounded-full bg-accent text-black hover:bg-accent-hover touch-manipulation"
              aria-label="Share photos from gallery"
              onClick={openGallery}
            >
              <Plus className="h-5 w-5" />
            </Button>
          </div>
        ) : null}
      </div>

      <div className="mt-4">
        <ActivityFeedScopeToggle options={scopeOptions} activeScope={scope} />
      </div>

      <div className="mt-6">
        {posts.length === 0 && emptyMessage ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{emptyMessage}</p>
        ) : (
          <ActivityFeedList posts={posts} highlightCoachHammers={highlightCoachHammers} />
        )}
      </div>

      <ActivitySharePhotoDialog
        open={shareOpen}
        onOpenChange={onDialogOpenChange}
        role={role}
        initialFiles={initialFiles}
        photoTakenAt={photoTakenAt}
      />
    </div>
  );
}
