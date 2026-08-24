import { useEffect, useRef } from 'react';

export function useAutoScroll(enabled, intervalMs = 10000) {
  const containerRef = useRef(null);

  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      if (containerRef.current) {
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        if (scrollTop + clientHeight >= scrollHeight - 5) {
          containerRef.current.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          containerRef.current.scrollBy({ top: 200, behavior: 'smooth' });
        }
      }
    }, intervalMs);

    return () => clearInterval(interval);
  }, [enabled, intervalMs]);

  return containerRef;
}
