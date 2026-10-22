export type SessionStatus = 'live' | 'ended';

export interface Photo {
  id: string;
  filename: string;
  width: number | null;
  height: number | null;
  capturedAt: string | null;
  createdAt: string;
  thumbUrl: string;
  previewUrl: string;
  downloadUrl: string;
}

export interface AdminPhoto extends Photo {
  sizeBytes: number;
  mime: string;
}

export interface PublicSession {
  title: string;
  status: SessionStatus;
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  photoCount: number;
  photos: Photo[];
  serverNow: string;
  sessionUrl: string;
}

export interface AdminSession {
  id: string;
  title: string;
  note: string;
  status: SessionStatus;
  rawStatus: 'active' | 'ended';
  startedAt: string;
  endsAt: string;
  endedAt: string | null;
  endReason: 'manual' | 'auto' | 'replaced' | string | null;
  photoCount: number;
  coverPhotoId: string | null;
  coverThumbUrl: string | null;
  publicToken: string;
  publicUrl: string;
  photos: AdminPhoto[];
  serverNow: string;
}

export interface SessionSummary extends Omit<AdminSession, 'photos'> {
  photos?: never;
}

export interface UploaderStatus {
  online: boolean;
  lastSeenAt: string | null;
  agentName: string | null;
  lastUploadAt: string | null;
}

export interface SiteConfig {
  siteName: string;
  timezone: string;
  sessionDurationMinutes: number;
  version: string;
}

export interface Overview {
  activeSession: AdminSession | null;
  recentSessions: SessionSummary[];
  stats: {
    totalSessions: number;
    totalPhotos: number;
    totalBytes: number;
  };
  uploader: UploaderStatus;
  storage: {
    mode: 'local' | 'r2';
    bucket: string | null;
  };
  config: Omit<SiteConfig, 'version'>;
  serverNow: string;
}

export interface SessionListResponse {
  sessions: SessionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface AuthMe {
  authenticated: boolean;
  configured: boolean;
  siteName: string;
}
