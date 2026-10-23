import { useEffect, useState } from 'react';
import { Printer } from 'lucide-react';
import { Modal } from './ui';
import type { AdminPhoto } from '../types';

export function AdminStripPicker({
  open,
  photos,
  onClose,
  onConfirm,
}: {
  open: boolean;
  photos: AdminPhoto[];
  onClose: () => void;
  onConfirm: (photos: AdminPhoto[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    if (open) setSelected([]);
  }, [open]);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((item) => item !== id);
      if (current.length >= 3) return current;
      return [...current, id];
    });
  };

  const confirm = () => {
    const chosen = selected
      .map((id) => photos.find((photo) => photo.id === id))
      .filter((photo): photo is AdminPhoto => Boolean(photo));
    if (chosen.length) onConfirm(chosen);
  };

  return (
    <Modal
      open={open}
      title="Buat strip photobooth"
      description="Pilih maksimal 3 foto. Foto akan di-crop otomatis ke frame."
      onClose={onClose}
      wide
      footer={
        <>
          <button type="button" className="btn btn--ghost" onClick={onClose}>
            Batal
          </button>
          <button
            type="button"
            className="btn btn--dark"
            onClick={confirm}
            disabled={selected.length === 0}
          >
            <Printer size={16} />
            Buat strip ({selected.length}/3)
          </button>
        </>
      }
    >
      <div className="strip-picker-grid">
        {photos.map((photo) => {
          const position = selected.indexOf(photo.id);
          return (
            <button
              type="button"
              key={photo.id}
              className={`strip-picker-card ${position >= 0 ? 'is-selected' : ''}`}
              onClick={() => toggle(photo.id)}
              aria-pressed={position >= 0}
            >
              <img src={photo.thumbUrl} alt={photo.filename} loading="lazy" />
              <span className="strip-picker-card__number">
                {position >= 0 ? position + 1 : ''}
              </span>
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
