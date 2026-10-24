import { Link, useParams } from 'react-router-dom';
import { CalendarCheck, CheckCircle2, Clock, Printer } from 'lucide-react';
import StatusBadge from '../components/StatusBadge.jsx';
import PriceBreakdown from '../components/PriceBreakdown.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { ErrorState, Loader } from '../components/feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import { bookingService } from '../services/index.js';
import { PAYMENT_METHOD_LABELS, formatDateLong, formatINRPrecise } from '../utils/format.js';

export function bookingToQuote(b) {
  return { pricePerNight: b.price_per_night, nights: b.nights, roomCharges: b.room_charges, taxAmount: b.tax_amount, serviceFee: b.service_fee, totalAmount: b.total_amount,
    taxRate: b.room_charges ? Math.round((b.tax_amount / b.room_charges) * 100) : 0, serviceFeeRate: b.room_charges ? Math.round((b.service_fee / b.room_charges) * 100) : 0 };
}

export default function BookingConfirmation() {
  const { id } = useParams();
  const { data, loading, error, reload } = useFetch(() => bookingService.get(id), [id]);

  if (loading) return <Loader label="Loading your reservation..." />;
  if (error) return <div className="container section"><ErrorState message={error} onRetry={reload} /></div>;
  const b = data.booking;
  const confirmed = b.status === 'confirmed';

  return (
    <div className="container section-sm confirmation">
      <div className={`confirm-hero ${confirmed ? '' : 'pending'}`}>
        {confirmed ? <CheckCircle2 size={56} aria-hidden="true" /> : <Clock size={56} aria-hidden="true" />}
        <h1>{confirmed ? 'Your booking is confirmed' : 'Reservation received'}</h1>
        <p>{confirmed ? 'A confirmation has been saved to your account.' : 'Your reservation is pending. The hotel will confirm it shortly.'}</p>
        <div className="reference"><span>Booking reference</span><strong>{b.reference}</strong></div>
        <div className="reference room-booked"><span>Room booked</span><strong>Room {b.room_number}</strong><span>{b.hotel_name}, {b.hotel_city}{b.floor_no !== null && b.floor_no !== undefined ? ` · Floor ${b.floor_no}` : ''}</span></div>
      </div>

      <div className="confirm-grid">
        <section className="card">
          <SmartImage className="summary-img" src={b.room_image} alt={b.room_name} />
          <h2 className="h3">{b.room_name} <small className="muted">#{b.room_number}</small></h2>
          <p className="muted">{b.category}</p>
          <dl className="summary-list">
            <div><dt>Hotel</dt><dd>{b.hotel_name}</dd></div>
            <div><dt>City</dt><dd>{b.hotel_city}, {b.hotel_country}{b.hotel_address && <small className="muted"> &middot; {b.hotel_address}</small>}</dd></div>
            <div><dt>Room number</dt><dd><strong>Room {b.room_number}</strong>{b.floor_no !== null && b.floor_no !== undefined && <> &middot; Floor {b.floor_no}</>}</dd></div>
            <div><dt>Check-in</dt><dd>{formatDateLong(b.check_in)} (from 2:00 PM)</dd></div>
            <div><dt>Check-out</dt><dd>{formatDateLong(b.check_out)} (by 12:00 PM)</dd></div>
            <div><dt>Nights</dt><dd>{b.nights}</dd></div>
            <div><dt>Guests</dt><dd>{b.guests}</dd></div>
            <div><dt>Guest</dt><dd>{b.guest_name}</dd></div>
            <div><dt>Contact</dt><dd>{b.guest_email} &middot; {b.guest_phone}</dd></div>
            {b.special_requests && <div><dt>Requests</dt><dd>{b.special_requests}</dd></div>}
            <div><dt>Status</dt><dd><StatusBadge status={b.status} /></dd></div>
          </dl>
        </section>
        <section className="card">
          <h2 className="h3">Payment summary</h2>
          <PriceBreakdown quote={bookingToQuote(b)} />
          <dl className="summary-list">
            <div><dt>Method</dt><dd>{PAYMENT_METHOD_LABELS[b.payment_method]}</dd></div>
            <div><dt>Payment status</dt><dd><StatusBadge status={b.payment_status} /></dd></div>
            {b.transaction_ref && <div><dt>Transaction</dt><dd>{b.transaction_ref} <small className="muted">(simulated)</small></dd></div>}
            {b.payment_method === 'pay_at_hotel' && <div><dt>Amount due</dt><dd>{formatINRPrecise(b.total_amount)} at check-out</dd></div>}
          </dl>
          <p className="alert alert-info small">{b.cancel_note}</p>
          <div className="btn-row no-print">
            <Link to="/my-bookings" className="btn btn-primary"><CalendarCheck size={18} /> My bookings</Link>
            <button type="button" className="btn btn-outline" onClick={() => window.print()}><Printer size={18} /> Print</button>
          </div>
        </section>
      </div>
    </div>
  );
}
