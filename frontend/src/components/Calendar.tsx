import { useState } from 'react';
import { ChevL, ChevR } from './Icons';
import {
  bookedKeys, diffDays, DOW, isoKey, monthMatrix, monthName,
  rangeHasConflict, sameDay, startOfDay, today,
} from '../lib/dates';
import type { Vehicle } from '../types';

/**
 * Availability calendar. Booked days are hatched and unselectable, which is how
 * the prototype demonstrates that a vehicle can never be double-booked.
 *
 * mode="view"  read-only availability
 * mode="range" pick a start and end date
 */
export interface CalendarRange {
  start: Date | null;
  end: Date | null;
  conflict?: boolean;
}

export default function Calendar({
  vehicle,
  mode = 'view',
  start = null,
  end = null,
  onChange,
}: {
  vehicle: Vehicle;
  mode?: 'view' | 'range';
  start?: Date | null;
  end?: Date | null;
  onChange?: (range: CalendarRange) => void;
}) {
  const [cursor, setCursor] = useState(() => startOfDay(start ?? today()));
  const blocked = bookedKeys(vehicle);
  const t0 = today();
  const days = monthMatrix(cursor);
  const month = cursor.getMonth();
  const atFirstMonth = cursor.getFullYear() === t0.getFullYear() && month === t0.getMonth();

  function pick(day: Date): void {
    if (mode !== 'range') return;
    // Starting fresh, or restarting because a range is already complete.
    if (!start || end) { onChange?.({ start: day, end: null }); return; }
    if (diffDays(start, day) < 0) { onChange?.({ start: day, end: null }); return; }
    if (rangeHasConflict(start, day, blocked)) {
      onChange?.({ start: day, end: null, conflict: true });
      return;
    }
    onChange?.({ start, end: day });
  }

  return (
    <div className="cal">
      <div className="cal-head">
        <div className="cal-month">{monthName(cursor)}</div>
        <div className="row row-gap-8">
          <button className="cal-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), month - 1, 1))}
            disabled={atFirstMonth} aria-label="Previous month"><ChevL size={15} /></button>
          <button className="cal-nav" onClick={() => setCursor(new Date(cursor.getFullYear(), month + 1, 1))}
            aria-label="Next month"><ChevR size={15} /></button>
        </div>
      </div>

      <div className="cal-dow" aria-hidden="true">
        {DOW.map((d, i) => <span key={i}>{d}</span>)}
      </div>

      <div className="cal-grid">
        {days.map((day) => {
          const inMonth = day.getMonth() === month;
          const past = diffDays(t0, day) < 0;
          const booked = blocked.has(isoKey(day));
          const isStart = sameDay(day, start);
          const isEnd = sameDay(day, end);
          const inRange = start && end && diffDays(start, day) > 0 && diffDays(day, end) > 0;
          const disabled = past || booked || !inMonth;

          const cls = ['cal-day',
            past && 'cal-day-past',
            booked && !past && 'cal-day-booked',
            (isStart || isEnd) && 'cal-day-sel',
            isStart && end && 'cal-day-edge-l',
            isEnd && 'cal-day-edge-r',
            inRange && 'cal-day-range',
            sameDay(day, t0) && 'cal-day-today',
          ].filter(Boolean).join(' ');

          return (
            <button key={isoKey(day)} type="button" className={cls} disabled={disabled}
              onClick={() => pick(day)}
              style={!inMonth ? { visibility: 'hidden' } : undefined}
              aria-label={`${day.getDate()} ${monthName(cursor)}${booked ? ' — already booked' : ''}`}
              title={booked ? 'Already booked' : undefined}>
              {day.getDate()}
            </button>
          );
        })}
      </div>

      <div className="cal-key">
        <span className="cal-key-item">
          <i className="cal-key-sw" style={{ background: 'var(--card)' }} />Available
        </span>
        <span className="cal-key-item">
          <i className="cal-key-sw" style={{ background: 'repeating-linear-gradient(-45deg,#F0F3F4 0 4px,#E4E9EB 4px 8px)' }} />Booked
        </span>
        <span className="cal-key-item">
          <i className="cal-key-sw" style={{ background: 'var(--marine)', borderColor: 'var(--marine)' }} />Your dates
        </span>
      </div>
    </div>
  );
}

