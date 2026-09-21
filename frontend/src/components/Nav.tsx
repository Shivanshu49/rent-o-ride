import { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ChevD, Menu, Pin, X } from './Icons';
import { CITIES } from '../data/seed';
import { useAuth } from '../lib/auth';
import { useStore } from '../state/store';

const LINKS = [
  { to: '/search', label: 'Browse vehicles' },
  { to: '/owner', label: 'Owner dashboard' },
  { to: '/trips', label: 'My trips' },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);
  const { city, setCity } = useStore();
  const { actor, loading } = useAuth();
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 6);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => { setOpen(false); setCityOpen(false); }, [pathname]);

  return (
    <>
      <header className={`nav ${scrolled ? 'nav-scrolled' : ''}`}>
        <div className="wrap-wide nav-inner">
          <Link to="/" className="logo" aria-label="RentAny home">
            <span className="logo-mark">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 16h16" stroke="#F4C430" strokeWidth="2" strokeLinecap="round" />
                <circle cx="7.5" cy="16" r="2.6" stroke="#F4C430" strokeWidth="2" />
                <circle cx="16.5" cy="16" r="2.6" stroke="#F4C430" strokeWidth="2" />
                <path d="M5.5 11.5L7.5 6h9l2.5 5.5" stroke="#37C2C8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </svg>
            </span>
            <span className="logo-word">Rent<em>Any</em></span>
          </Link>

          <nav className="nav-links" aria-label="Main">
            {LINKS.map((l) => (
              <NavLink key={l.to} to={l.to}
                className={({ isActive }) => `nav-link ${isActive ? 'nav-link-on' : ''}`}>
                {l.label}
              </NavLink>
            ))}
          </nav>

          <span className="spacer" />

          <div style={{ position: 'relative' }}>
            <button className="nav-city" onClick={() => setCityOpen((o) => !o)} aria-expanded={cityOpen}>
              <Pin size={15} />
              <span>{city}</span>
              <ChevD size={13} style={{ color: 'var(--muted-2)' }} />
            </button>
            {cityOpen && (
              <div className="card" style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                minWidth: 168, padding: 6, boxShadow: 'var(--sh-3)', zIndex: 70 }}>
                {CITIES.map((c) => (
                  <button key={c} className="btn btn-quiet btn-block" style={{ justifyContent: 'flex-start' }}
                    onClick={() => { setCity(c); setCityOpen(false); }}>
                    <Pin size={14} style={{ color: c === city ? 'var(--surf)' : 'var(--muted-2)' }} />
                    {c}
                  </button>
                ))}
              </div>
            )}
          </div>

          {loading ? (
            <span className="avatar" aria-hidden="true" />
          ) : actor ? (
            <Link to="/login" className="avatar" title={`Signed in · ${actor.role.toLowerCase()}`}>
              {actor.role[0]}
            </Link>
          ) : (
            <Link to="/login" className="btn btn-quiet">Sign in</Link>
          )}

          <button className="btn btn-quiet nav-burger" onClick={() => setOpen((o) => !o)}
            aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open}>
            {open ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </header>

      {open && (
        <div className="drawer">
          {LINKS.map((l) => (
            <Link key={l.to} to={l.to} className="drawer-link">
              {l.label}
              <ChevD size={18} style={{ transform: 'rotate(-90deg)', color: 'var(--muted-2)' }} />
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
