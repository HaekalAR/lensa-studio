import { useEffect, useMemo, useState } from 'react';

export function useCountdown(endsAt: string | null | undefined, serverNow?: string | null) {
  const offset = useMemo(() => {
    if (!serverNow) return 0;
    const parsed = new Date(serverNow).getTime();
    return Number.isNaN(parsed) ? 0 : parsed - Date.now();
  }, [serverNow]);

  const end = useMemo(() => {
    if (!endsAt) return 0;
    const parsed = new Date(endsAt).getTime();
    return Number.isNaN(parsed) ? 0 : parsed;
  }, [endsAt]);

  const [remaining, setRemaining] = useState(() => Math.max(0, end - (Date.now() + offset)));

  useEffect(() => {
    const tick = () => setRemaining(Math.max(0, end - (Date.now() + offset)));
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [end, offset]);

  return {
    remaining,
    expired: remaining <= 0,
  };
}

export function usePageTitle(title: string) {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
