import { forwardRef } from 'react';
import { QRCodeSVG } from 'qrcode.react';

export const QrCodeSvg = forwardRef<
  SVGSVGElement,
  { value: string; className?: string }
>(function QrCodeSvg({ value, className }, ref) {
  return (
    <QRCodeSVG
      ref={ref}
      value={value}
      size={320}
      level="M"
      marginSize={2}
      bgColor="#ffffff"
      fgColor="#16130f"
      className={className}
      title="QR sesi"
    />
  );
});

export function downloadQrSvg(svg: SVGSVGElement | null, filename: string) {
  if (!svg) return;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', '640');
  clone.setAttribute('height', '640');
  const blob = new Blob([new XMLSerializer().serializeToString(clone)], {
    type: 'image/svg+xml;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
