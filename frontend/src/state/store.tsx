import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { INITIAL_STATUS, RENTER_BOOKINGS } from '../data/seed';
import type { BookingDraft, MadeBooking, Toast, VehicleStatus } from '../types';

interface Store {
  city: string;
  setCity: (city: string) => void;
  /** The booking being assembled across the dates -> pay -> confirm flow. */
  draft: BookingDraft | null;
  setDraft: (draft: BookingDraft | null) => void;
  /** Bookings created during this session, newest first. */
  madeBookings: readonly MadeBooking[];
  addBooking: (booking: MadeBooking) => void;
  statuses: Readonly<Record<string, VehicleStatus>>;
  setStatus: (vehicleId: string, status: VehicleStatus) => void;
  ratings: Readonly<Record<string, number>>;
  rate: (bookingId: string, stars: number) => void;
  toasts: readonly Toast[];
  toast: (text: string, icon?: string) => void;
}

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [city, setCity] = useState('Delhi');
  const [draft, setDraft] = useState<BookingDraft | null>(null);
  const [madeBookings, setMadeBookings] = useState<readonly MadeBooking[]>([]);
  const [statuses, setStatuses] = useState<Readonly<Record<string, VehicleStatus>>>(INITIAL_STATUS);
  const [ratings, setRatings] = useState<Readonly<Record<string, number>>>(() =>
    Object.fromEntries(RENTER_BOOKINGS.map((b) => [b.id, b.rated])),
  );
  const [toasts, setToasts] = useState<readonly Toast[]>([]);
  const seq = useRef(0);

  const toast = useCallback((text: string, icon = 'check') => {
    const id = ++seq.current;
    setToasts((t) => [...t, { id, text, icon }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 2800);
  }, []);

  const setStatus = useCallback((vehicleId: string, status: VehicleStatus) => {
    setStatuses((s) => ({ ...s, [vehicleId]: status }));
  }, []);

  const rate = useCallback((bookingId: string, stars: number) => {
    setRatings((r) => ({ ...r, [bookingId]: stars }));
  }, []);

  const addBooking = useCallback((booking: MadeBooking) => {
    setMadeBookings((b) => [booking, ...b]);
  }, []);

  const value = useMemo<Store>(
    () => ({
      city, setCity, draft, setDraft, madeBookings, addBooking,
      statuses, setStatus, ratings, rate, toasts, toast,
    }),
    [city, draft, madeBookings, addBooking, statuses, setStatus, ratings, rate, toasts, toast],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const v = useContext(Ctx);
  if (!v) throw new Error('useStore must be used inside <StoreProvider>');
  return v;
}
