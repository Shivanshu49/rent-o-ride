import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import Nav from './components/Nav';
import Footer from './components/Footer';
import Toasts from './components/Toasts';
import Landing from './pages/Landing';
import Search from './pages/Search';
import VehicleDetail from './pages/VehicleDetail';
import BookingDates from './pages/BookingDates';
import BookingPay from './pages/BookingPay';
import BookingConfirm from './pages/BookingConfirm';
import OwnerDashboard from './pages/OwnerDashboard';
import RenterDashboard from './pages/RenterDashboard';

function ScrollToTop() {
  const { pathname } = useLocation();
  useEffect(() => { window.scrollTo({ top: 0, behavior: 'instant' }); }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/search" element={<Search />} />
          <Route path="/vehicle/:id" element={<VehicleDetail />} />
          <Route path="/book/:id" element={<BookingDates />} />
          <Route path="/pay" element={<BookingPay />} />
          <Route path="/confirmation" element={<BookingConfirm />} />
          <Route path="/owner" element={<OwnerDashboard />} />
          <Route path="/trips" element={<RenterDashboard />} />
          <Route path="*" element={<Landing />} />
        </Routes>
      </main>
      <Footer />
      <Toasts />
    </>
  );
}
