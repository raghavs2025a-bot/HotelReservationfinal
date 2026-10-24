import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarX2, Loader2 } from 'lucide-react';
import StatusBadge from '../components/StatusBadge.jsx';
import Modal from '../components/Modal.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { EmptyState, ErrorState, Loader } from '../components/feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import { useToast } from '../context/ToastContext.jsx';
import { bookingService } from '../services/index.js';
import { bookingBucket, errorMessage, formatDate, formatINRPrecise } from '../utils/format.js';

const TABS = [['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']];

export default function MyBookings() {
  const toast = useToast();
  const { data, loading, error, reload } = useFetch(() => bookingService.mine(), []);
  const [tab, setTab] = useState('upcoming');
  const [target, setTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const groups = useMemo(() => {
    const g = { upcoming: [], completed: [], cancelled: [] };
    (data?.bookings || []).forEach((b) => g[bookingBucket(b)].push(b));
    g.upcoming.sort((a, b) => a.check_in.localeCompare(b.check_in));
    return g;
  }, [data]);

  const confirmCancel = async () => {
    setBusy(true);
    try {
      await bookingService.cancel(target.id, reason);
      toast.success('Reservation cancelled.');
      setTarget(null);
      setReason('');
      reload();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const list = groups[tab];
  const refundAmount = target ? (target.payment_status === 'success' ? (target.payment_amount * target.refund_percent) / 100 : 0) : 0;

  return (
    <div className="container section-sm">
      <h1 className="page-title">My bookings</h1>
      <div className="tabs" role="tablist">
        {TABS.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>{label} <span>{groups[key].length}</span></button>
        ))}
      </div>
      {loading && <Loader label="Loading your bookings..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {!loading && !error && list.length === 0 && (
        <EmptyState icon={CalendarX2} title={`No ${tab} bookings`} message={tab === 'upcoming' ? 'Ready for your next getaway?' : 'Nothing to show here yet.'}
          action={tab === 'upcoming' ? <Link to="/rooms" className="btn btn-primary">Browse rooms</Link> : null} />
      )}
      <div className="booking-list">
        {list.map((b) => (
          <article className="booking-card" key={b.id}>
            <SmartImage src={b.room_image} alt={b.room_name} />
            <div className="booking-info">
              <div className="booking-top"><h3>{b.room_name}</h3><StatusBadge status={b.status} /></div>
              <p className="muted">Ref <strong>{b.reference}</strong> &middot; {b.category}</p>
              <p><strong>Room {b.room_number}</strong> &middot; {b.hotel_name}, {b.hotel_city}</p>
              <p>{formatDate(b.check_in)} &rarr; {formatDate(b.check_out)} &middot; {b.nights} {b.nights === 1 ? 'night' : 'nights'} &middot; {b.guests} {b.guests === 1 ? 'guest' : 'guests'}</p>
              <p><strong>{formatINRPrecise(b.total_amount)}</strong> &middot; Payment: <StatusBadge status={b.payment_status} />
                {b.status === 'cancelled' && b.refund_amount > 0 && <span className="muted"> &middot; Refunded {formatINRPrecise(b.refund_amount)}</span>}</p>
              {b.status === 'cancelled' && b.cancellation_reason && <p className="muted small">{b.cancellation_reason}</p>}
            </div>
            <div className="booking-actions">
              <Link to={`/booking/confirmation/${b.id}`} className="btn btn-outline btn-sm">View details</Link>
              {b.can_cancel && <button type="button" className="btn btn-danger-outline btn-sm" onClick={() => setTarget(b)}>Cancel</button>}
            </div>
          </article>
        ))}
      </div>

      {target && (
        <Modal title="Cancel reservation" onClose={() => !busy && setTarget(null)}
          footer={<>
            <button type="button" className="btn btn-outline" onClick={() => setTarget(null)} disabled={busy}>Keep booking</button>
            <button type="button" className="btn btn-danger" onClick={confirmCancel} disabled={busy}>{busy ? <Loader2 className="spin" size={16} /> : null} Cancel reservation</button>
          </>}>
          <p>Cancel <strong>Room {target.room_number}</strong> at {target.hotel_name}, {target.hotel_city} ({formatDate(target.check_in)} &rarr; {formatDate(target.check_out)})?</p>
          <p className="alert alert-info">{target.cancel_note}{target.payment_status === 'success' && <> You will be refunded <strong>{formatINRPrecise(refundAmount)}</strong>.</>}</p>
          <div className="field">
            <label htmlFor="cr">Reason (optional)</label>
            <textarea id="cr" rows="3" maxLength="200" value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
        </Modal>
      )}
    </div>
  );
}
