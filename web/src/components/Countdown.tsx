import type { TimestampLike } from '@vault/shared';
import { useEffect, useState } from 'react';
import { formatCountdown } from '../lib/format';

export default function Countdown({ lockAt }: { lockAt: TimestampLike }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const remaining = lockAt.toMillis() - now;
  return <span>{formatCountdown(remaining)}</span>;
}
