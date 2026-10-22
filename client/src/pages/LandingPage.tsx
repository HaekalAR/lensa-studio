import { ArrowUpRight, Camera, Download, QrCode, ShieldCheck } from 'lucide-react';
import { Link } from 'react-router-dom';
import { QrGlyph, Logo, useToast } from '../components/ui';
import { useSite } from '../context/AppProviders';
import { usePageTitle } from '../lib/hooks';

export function LandingPage() {
  const { config } = useSite();
  const toast = useToast();
  usePageTitle(`${config.siteName} — Galeri sesi foto`);

  return (
    <div className="landing">
      <header className="landing__nav">
        <Logo tone="light" />
        <div className="landing__nav-actions">
          <span className="landing__privacy">
            <ShieldCheck size={15} />
            Galeri privat
          </span>
          <Link className="btn btn--outline-light btn--sm" to="/admin/login">
            Akses studio
            <ArrowUpRight size={15} />
          </Link>
        </div>
      </header>

      <main className="landing__main">
        <section className="landing__hero">
          <div className="landing__copy">
            <p className="eyebrow eyebrow--accent">Foto per sesi · langsung dari kamera</p>
            <h1>
              Foto kamu,
              <br />
              <em>sebelum kamu</em>
              <br />
              pulang.
            </h1>
            <p className="landing__lede">
              Setiap sesi punya galeri dan QR sendiri. Scan QR dari fotografer, lihat foto
              yang baru masuk, lalu unduh dalam resolusi penuh.
            </p>
            <div className="landing__note">
              <QrCode size={18} />
              <span>
                Tidak punya QR? Galeri hanya bisa dibuka lewat tautan sesi yang dibagikan
                fotografer.
              </span>
            </div>
          </div>

          <div className="landing__visual" aria-hidden="true">
            <div className="landing-card">
              <div className="landing-card__top">
                <span className="landing-card__index">SESI / 014</span>
                <span className="landing-card__live">
                  <span />
                  Live
                </span>
              </div>
              <div className="landing-card__qr">
                <QrGlyph seed="lensa-studio-session-preview" />
              </div>
              <p className="landing-card__caption">Contoh kartu sesi</p>
              <div className="landing-card__frames">
                <span className="frame frame--one" />
                <span className="frame frame--two" />
                <span className="frame frame--three" />
                <span className="landing-card__count">+ 42 foto</span>
              </div>
            </div>
            <div className="landing__stamp">
              <span>Baru</span>
              <strong>02:14</strong>
              <span>menit lalu</span>
            </div>
            <span className="landing__cross landing__cross--one">+</span>
            <span className="landing__cross landing__cross--two">+</span>
          </div>
        </section>

        <section className="landing__steps" aria-label="Cara kerja">
          <div className="landing-step">
            <span className="landing-step__num">01</span>
            <div>
              <h2>
                <Camera size={18} /> Fotografer memotret
              </h2>
              <p>Foto tersimpan ke folder laptop dan terunggah otomatis ke sesi yang aktif.</p>
            </div>
          </div>
          <div className="landing-step">
            <span className="landing-step__num">02</span>
            <div>
              <h2>
                <QrCode size={18} /> QR dibagikan
              </h2>
              <p>
                Satu QR untuk satu sesi. Masa berlaku sesi {config.sessionDurationMinutes} menit,
                galeri tetap tersimpan.
              </p>
            </div>
          </div>
          <div className="landing-step">
            <span className="landing-step__num">03</span>
            <div>
              <h2>
                <Download size={18} /> Foto bisa diunduh
              </h2>
              <p>Foto muncul otomatis di galeri dan bisa diunduh tanpa aplikasi tambahan.</p>
            </div>
          </div>
        </section>
      </main>

      <footer className="landing__footer">
        <span>
          {config.siteName} · studio foto
        </span>
        <button
          type="button"
          className="link-quiet"
          onClick={() => toast.info('Galeri hanya bisa dibuka melalui QR atau tautan sesi.')}
        >
          Tentang galeri privat
        </button>
      </footer>
    </div>
  );
}
