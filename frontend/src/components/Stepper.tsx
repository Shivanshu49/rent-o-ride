import { Check } from './Icons';

const STEPS = ['Dates', 'Payment', 'Confirmed'];

export default function Stepper({ current = 0 }) {
  return (
    <nav className="stepper" aria-label="Booking progress">
      {STEPS.map((label, i) => {
        const state = i < current ? 'step-done' : i === current ? 'step-on' : '';
        return (
          <div key={label} className="step-node" style={{ flex: i < STEPS.length - 1 ? 1 : 'none' }}>
            <div className={`step-node ${state}`}>
              <span className="step-bub">
                {i < current ? <Check size={14} sw={2.6} /> : String(i + 1).padStart(2, '0')}
              </span>
              <span className="step-lbl">{label}</span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="step-bar">{i < current && <span className="step-bar-fill" />}</div>
            )}
          </div>
        );
      })}
    </nav>
  );
}
