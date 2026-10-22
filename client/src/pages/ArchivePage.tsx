import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  FolderOpen,
  Images,
  Plus,
  Search,
  SearchX,
  WifiOff,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { coverThumbUrl } from '../components/SessionRow';
import { PageLoader, Spinner, StatusPill } from '../components/ui';
import { formatDateShort, formatDuration, formatTime } from '../lib/format';
import { usePageTitle } from '../lib/hooks';
import { useSite } from '../context/AppProviders';
import type { SessionSummary } from '../types';

const PAGE_SIZE = 24;

export function ArchivePage() {
  const { config } = useSite();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');
  const requestId = useRef(0);
  usePageTitle(`Arsip sesi — ${config.siteName}`);
  const timezone = config.timezone;

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 320);
    return () => window.clearTimeout(timer);
  }, [query]);

  const fetchPage = useCallback(
    async (offset: number, append: boolean) => {
      const id = ++requestId.current;
      if (append) setLoadingMore(true);
      else setLoading(true);
      try {
        const result = await api.listSessions({ limit: PAGE_SIZE, offset, q: search });
        if (id !== requestId.current) return;
        setSessions((current) => (append ? [...current, ...result.sessions] : result.sessions));
        setTotal(result.total);
        setError('');
      } catch (requestError) {
        if (id !== requestId.current) return;
        setError(requestError instanceof Error ? requestError.message : 'Gagal memuat arsip.');
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [search],
  );

  useEffect(() => {
    fetchPage(0, false);
  }, [fetchPage]);

  if (loading && !sessions.length) return <PageLoader label="Membuka arsip sesi" />;

  return (
    <div className="admin-page">
      <div className="page-head page-head--archive">
        <div>
          <p className="eyebrow">Arsip studio</p>
          <h1>Folder sesi</h1>
          <p className="page-head__sub">
            {total} sesi tersimpan · setiap folder tetap punya QR dan galerinya sendiri
          </p>
        </div>
        <Link className="btn btn--dark" to="/admin">
          <Plus size={17} />
          Sesi baru
        </Link>
      </div>

      <div className="archive-toolbar">
        <label className="search-field">
          <Search size={17} />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Cari judul atau catatan sesi…"
            aria-label="Cari sesi"
          />
          {query && (
            <button type="button" className="search-field__clear" onClick={() => setQuery('')}>
              Hapus
            </button>
          )}
        </label>
        <span className="archive-toolbar__count">
          <Images size={15} />
          {total} sesi
        </span>
      </div>

      {error && !sessions.length ? (
        <div className="panel-error">
          <span className="panel-error__icon">
            <WifiOff size={20} />
          </span>
          <h2>Arsip tidak bisa dimuat</h2>
          <p>{error}</p>
          <button type="button" className="btn btn--dark" onClick={() => fetchPage(0, false)}>
            Coba lagi
          </button>
        </div>
      ) : sessions.length ? (
        <>
          <div className="archive-grid">
            {sessions.map((session) => {
              const cover = coverThumbUrl(session);
              const end =
                session.status === 'live'
                  ? new Date().toISOString()
                  : session.endedAt || session.endsAt;
              return (
                <Link
                  key={session.id}
                  to={`/admin/sessions/${session.id}`}
                  className="archive-card"
                >
                  <div className="archive-card__cover">
                    {cover ? (
                      <img src={cover} alt="" loading="lazy" />
                    ) : (
                      <span className="archive-card__placeholder">
                        <FolderOpen size={30} strokeWidth={1.3} />
                      </span>
                    )}
                    <span className="archive-card__status">
                      <StatusPill status={session.status} />
                    </span>
                    <span className="archive-card__count">
                      {session.photoCount}
                      <Images size={13} />
                    </span>
                  </div>
                  <div className="archive-card__body">
                    <p className="archive-card__date">
                      {formatDateShort(session.startedAt, timezone)} ·{' '}
                      {formatTime(session.startedAt, timezone)}
                    </p>
                    <h3>{session.title}</h3>
                    <div className="archive-card__foot">
                      <span>{formatDuration(session.startedAt, end)}</span>
                      <span className="archive-card__open">
                        Buka folder <ArrowRight size={14} />
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>

          {sessions.length < total && (
            <div className="load-more">
              <button
                type="button"
                className="btn btn--ghost"
                disabled={loadingMore}
                onClick={() => fetchPage(sessions.length, true)}
              >
                {loadingMore ? <Spinner size={16} /> : <Plus size={16} />}
                {loadingMore ? 'Memuat…' : `Muat ${Math.min(PAGE_SIZE, total - sessions.length)} sesi lagi`}
              </button>
            </div>
          )}
        </>
      ) : (
        <div className="archive-empty">
          {search ? <SearchX size={30} /> : <FolderOpen size={30} />}
          <h2>{search ? 'Tidak ada sesi yang cocok' : 'Arsip masih kosong'}</h2>
          <p>
            {search
              ? `Tidak ada judul atau catatan yang mengandung “${search}”.`
              : 'Setiap sesi yang selesai akan tersimpan di sini lengkap dengan foto dan QR-nya.'}
          </p>
          {search ? (
            <button type="button" className="btn btn--ghost" onClick={() => setQuery('')}>
              Hapus pencarian
            </button>
          ) : (
            <Link className="btn btn--dark" to="/admin">
              Mulai sesi pertama
            </Link>
          )}
        </div>
      )}

      {error && sessions.length > 0 && (
        <div className="inline-error">
          <WifiOff size={15} />
          {error}
        </div>
      )}
    </div>
  );
}
