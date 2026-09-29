import { COPY } from '../../lib/copy';
import Icon from '../Icon';

/**
 * Marks the Bookholder ("key holder"). `row` renders a labelled card row for
 * Home; `inline` is the compact key + name used in headers and lists.
 */
export default function KeyBadge({ name, variant = 'inline' }: { name: string; variant?: 'inline' | 'row' }) {
  if (variant === 'row') {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-vault-line bg-vault-panel px-3 py-2.5 text-sm">
        <span className="text-vault-gold-soft/60">{COPY.bookholderTitle}</span>
        <span className="flex items-center gap-1.5 text-vault-gold">
          <Icon name="key" className="h-4 w-4" />
          {name}
        </span>
      </div>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-vault-gold" title={`${COPY.bookholderTitle}: ${name}`}>
      <Icon name="key" className="h-3.5 w-3.5" />
      {name}
    </span>
  );
}
