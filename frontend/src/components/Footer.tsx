import { Link } from 'react-router-dom';

const COLS: readonly { h: string; links: readonly (readonly [label: string, to: string])[] }[] = [
  { h: 'Rent', links: [['Cars', '/search?type=car'], ['Bikes', '/search?type=bike'],
      ['Scooters', '/search?type=scooter'], ['Bicycles', '/search?type=bicycle']] },
  { h: 'Earn', links: [['List your vehicle', '/owner'], ['Owner dashboard', '/owner'],
      ['Pricing guide', '/owner'], ['Insurance cover', '/owner']] },
  { h: 'Company', links: [['How it works', '/#how'], ['Safety', '/'], ['Support', '/'], ['Careers', '/']] },
];

export default function Footer() {
  return (
    <footer className="footer">
      <div className="wrap-wide">
        <div className="footer-grid">
          <div>
            <div className="logo" style={{ marginBottom: 14 }}>
              <span className="logo-mark">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M4 16h16" stroke="#F4C430" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="7.5" cy="16" r="2.6" stroke="#F4C430" strokeWidth="2" />
                  <circle cx="16.5" cy="16" r="2.6" stroke="#F4C430" strokeWidth="2" />
                  <path d="M5.5 11.5L7.5 6h9l2.5 5.5" stroke="#37C2C8" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                </svg>
              </span>
              <span className="logo-word" style={{ color: '#fff' }}>Rent<em>Any</em></span>
            </div>
            <p style={{ fontSize: 13.5, maxWidth: 300, lineHeight: 1.6 }}>
              Rent a car, bike, scooter or bicycle from someone on your street.
              Live across Delhi, Noida and Gurgaon.
            </p>
          </div>
          {COLS.map((col) => (
            <div key={col.h}>
              <h5>{col.h}</h5>
              {col.links.map(([label, to]) => (
                <Link key={`${label}${to}`} to={to} className="footer-link">{label}</Link>
              ))}
            </div>
          ))}
        </div>
        <div className="footer-bar">
          <span>© 2026 RentAny Mobility Pvt. Ltd. · Prototype build</span>
          <span className="mono" style={{ color: '#6E8894' }}>Made in Delhi NCR</span>
        </div>
      </div>
    </footer>
  );
}
