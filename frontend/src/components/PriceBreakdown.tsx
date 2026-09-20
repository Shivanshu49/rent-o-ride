import { Info, Sparkle, Trend } from './Icons';
import { inr } from '../lib/pricing';
import type { Quote, Vehicle } from '../types';

/**
 * The fare, itemised. The demand multiplier and the advance-booking discount
 * are always shown as their own lines — surge is never folded into the total.
 */
export default function PriceBreakdown({
  vehicle,
  q,
  showDeposit = true,
}: {
  vehicle: Vehicle;
  q: Quote;
  showDeposit?: boolean;
}) {
  return (
    <div>
      <div className="price-line">
        <span className="price-line-k">
          {inr(vehicle.daily)} × {q.nights} {q.nights === 1 ? 'day' : 'days'}
        </span>
        <span className="price-line-v">{inr(q.base)}</span>
      </div>

      {q.surge > 0 && (
        <div className="price-line">
          <span className="price-line-k">
            <Trend size={14} style={{ color: 'var(--warn)' }} />
            {q.demand.label}
            <span className="badge badge-demand">{q.demand.mult}x</span>
          </span>
          <span className="price-line-v">+{inr(q.surge)}</span>
        </div>
      )}

      {q.discount > 0 && (
        <div className="price-line price-line-neg">
          <span className="price-line-k">
            <Sparkle size={14} style={{ color: 'var(--good)' }} />
            {q.advance.label}
          </span>
          <span className="price-line-v">−{inr(q.discount)}</span>
        </div>
      )}

      <div className="price-line">
        <span className="price-line-k">Platform fee</span>
        <span className="price-line-v">{inr(q.fee)}</span>
      </div>
      <div className="price-line">
        <span className="price-line-k">GST at 18%</span>
        <span className="price-line-v">{inr(q.gst)}</span>
      </div>

      <div className="price-total">
        <div>
          <div style={{ fontWeight: 700, fontSize: 14.5 }}>Total payable</div>
          <div className="tiny">for {q.nights} {q.nights === 1 ? 'day' : 'days'}</div>
        </div>
        <span className="price-total-v">{inr(q.total)}</span>
      </div>

      {showDeposit && (
        <div className="deposit-note" style={{ marginTop: 14 }}>
          <Info size={15} style={{ flex: 'none', marginTop: 1 }} />
          <span>
            A refundable deposit of <b>{inr(q.deposit)}</b> is blocked at pickup and released
            within 48 hours of return.
          </span>
        </div>
      )}
    </div>
  );
}
