import { ChevronRight, FolderOpen } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDateTime, formatDuration } from '../lib/format';
import type { SessionSummary } from '../types';
import { StatusPill } from './ui';

export function coverThumbUrl(session: { coverThumbUrl?: string | null }) {
  return session.coverThumbUrl || null;
}

export function SessionRow({ session, timezone }: { session: SessionSummary; timezone: string }) {
  const cover = coverThumbUrl(session);
  const end =
    session.status === 'live'
      ? new Date().toISOString()
      : session.endedAt || session.endsAt;

  return (
    <Link className="session-row" to={`/admin/sessions/${session.id}`}>
      <div className="session-row__cover">
        {cover ? (
          <img src={cover} alt="" loading="lazy" />
        ) : (
          <span className="session-row__placeholder">
            <FolderOpen size={22} strokeWidth={1.5} />
          </span>
        )}
        {session.status === 'live' && <span className="session-row__live" />}
      </div>
      <div className="session-row__body">
        <div className="session-row__titleline">
          <h3>{session.title}</h3>
          <StatusPill status={session.status} />
        </div>
        <p className="session-row__meta">
          <span>{formatDateTime(session.startedAt, timezone)}</span>
          <span className="dot-sep">·</span>
          <span>{session.photoCount} foto</span>
          <span className="dot-sep">·</span>
          <span>{formatDuration(session.startedAt, end)}</span>
        </p>
      </div>
      <span className="session-row__arrow">
        <ChevronRight size={18} />
      </span>
    </Link>
  );
}
