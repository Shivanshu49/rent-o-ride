import { Check, Info } from './Icons';
import { useStore } from '../state/store';

export default function Toasts() {
  const { toasts } = useStore();
  if (!toasts.length) return null;
  return (
    <div className="toast-layer" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          {t.icon === 'info'
            ? <Info size={16} style={{ color: 'var(--surf-l)' }} />
            : <Check size={16} style={{ color: '#5FD3A2' }} />}
          {t.text}
        </div>
      ))}
    </div>
  );
}
