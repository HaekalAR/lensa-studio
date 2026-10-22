import { ArrowLeft, QrCode } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Logo } from '../components/ui';
import { usePageTitle } from '../lib/hooks';

export function NotFoundPage() {
  usePageTitle('Halaman tidak ditemukan — Lensa');
  return (
    <div className="notfound">
      <header className="notfound__nav">
        <Logo tone="light" />
      </header>
      <div className="notfound__body">
        <span className="notfound__code">404</span>
        <span className="notfound__icon">
          <QrCode size={28} strokeWidth={1.3} />
        </span>
        <h1>Halaman ini tidak ada.</h1>
        <p>
          Mungkin tautannya salah, atau halaman ini hanya bisa dibuka lewat QR sesi dari
          fotografer.
        </p>
        <Link className="btn btn--light" to="/">
          <ArrowLeft size={16} />
          Kembali ke halaman utama
        </Link>
      </div>
    </div>
  );
}
