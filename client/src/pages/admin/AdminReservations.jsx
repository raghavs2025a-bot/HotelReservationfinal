import { useState } from 'react';
import { Check, Eye, LogIn, LogOut, Search, X } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import { EmptyState, ErrorState, Loader } from '../../components/feedback.jsx';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useToast } from '../../context/ToastContext.jsx';
import { adminService } from '../../services/index.js';
import { PAYMENT_METHOD_LABELS, errorMessage, formatDate, formatDateTime, formatINRPrecise } from '../../utils/format.js';

export default function AdminReservations() {
  const toast = useToast();
  const [f, setF] = useState({ search: '', status: '', stay: '', from: '', to: '' });
  const dSearch = useDebounce(f.search);
  const { data, loading, error, reload } = useFetch(
    () => adminService.bookings({ search: dSearch || undefined, status: f.status || undefined, stay: f.stay || undefined, from: f.from || undefined, to: f.to || undefined }),
    [dSearch, f.status, f.stay, f.from, f.to]
  );
  const [view, setView] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const [reason, setReason] = useState('');
  const [busyId, setBusyId] = useState(null);

  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const run = async (id, fn, okMsg) => {
    setBusyId(id);
    try {
      const res = await fn();
      toast.success(res.message || okMsg);
      setView((v) => (v && v.id === id ? res.booking : v));
      reload();
      return true;
    } catch (err) {
      toast.error(errorMessage(err));
      return false;
    } finally { setBusyId(null); }
  };

  const confirm = (b) => run(b.id, () => adminService.setBookingStatus(b.id, 'confirmed'));
  const stay = (b, s) => run(b.id, () => adminService.setStayStatus(b.id, s));
  const doCancel = async () => {
    const ok = await run(cancelTarget.id, () => adminService.setBookingStatus(cancelTarget.id, 'cancelled', reason));
    if (ok) { setCancelTarget(null); setReason(''); }
  };

  const Actions = ({ b }) => (
    <div className="actions">
      {b.status === 'pending' && <button type="button" className="btn btn-success btn-sm" disabled={busyId === b.id} onClick={() => confirm(b)}><Check size={14} /> Confirm</button>}
      {b.status === 'confirmed' && b.stay_status === 'not_arrived' && <button type="button" className="btn btn-outline btn-sm" disabled={busyId === b.id} onClick={() => stay(b, 'checked_in')}><LogIn size={14} /> Check-in</button>}
      {b.stay_status === 'checked_in' && <button type="button" className="btn btn-outline btn-sm" disabled={busyId === b.id} onClick={() => stay(b, 'checked_out')}><LogOut size={14} /> Check-out</button>}
      {['pending', 'confirmed'].includes(b.status) && b.stay_status === 'not_arrived' && <button type="button" className="btn btn-danger-outline btn-sm" disabled={busyId === b.id} onClick={() => setCancelTarget(b)}><X size={14} /> Cancel</button>}
    </div>
  );

  return (
    <>
      <div className="admin-head"><h1>Reservations</h1><p className="muted">Search, confirm, cancel and update check-in / check-out status.</p></div>
      <div className="toolbar toolbar-wrap">
        <div className="search-input"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Reference, guest, email or room" value={f.search} onChange={set('search')} aria-label="Search reservations" /></div>
        <select value={f.status} onChange={set('status')} aria-label="Booking status"><option value="">All statuses</option><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select>
        <select value={f.stay} onChange={set('stay')} aria-label="Stay status"><option value="">Any stay status</option><option value="not_arrived">Not arrived</option><option value="checked_in">Checked in</option><option value="checked_out">Checked out</option></select>
        <label className="inline-field">Stay from <input type="date" value={f.from} onChange={set('from')} /></label>
        <label className="inline-field">to <input type="date" value={f.to} onChange={set('to')} /></label>
        {(f.search || f.status || f.stay || f.from || f.to) && <button type="button" className="link-btn" onClick={() => setF({ search: '', status: '', stay: '', from: '', to: '' })}>Clear</button>}
      </div>

      {loading && <Loader label="Loading reservations..." />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && data.bookings.length === 0 && <EmptyState title="No reservations found" message="Try changing the search or filters." />}
      {data && data.bookings.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Reference</th><th>Guest</th><th>Room</th><th>Stay</th><th>Total</th><th>Status</th><th>Payment</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {data.bookings.map((b) => (
                <tr key={b.id}>
                  <td data-label="Reference"><strong>{b.reference}</strong></td>
                  <td data-label="Guest">{b.guest_name}<small>{b.guest_email}</small></td>
                  <td data-label="Room">Room {b.room_number}<small>{b.hotel_name}, {b.hotel_city}</small></td>
                  <td data-label="Stay">{formatDate(b.check_in)} &rarr; {formatDate(b.check_out)}<small>{b.nights} nights</small></td>
                  <td data-label="Total">{formatINRPrecise(b.total_amount)}</td>
                  <td data-label="Status"><div className="badge-stack"><StatusBadge status={b.status} />{b.status !== 'cancelled' && <StatusBadge status={b.stay_status} />}</div></td>
                  <td data-label="Payment"><StatusBadge status={b.payment_status} /></td>
                  <td><div className="actions"><button type="button" className="btn btn-outline btn-sm" onClick={() => setView(b)}><Eye size={14} /> View</button><Actions b={b} /></div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view && (
        <Modal wide title={`Reservation ${view.reference}`} onClose={() => setView(null)} footer={<Actions b={view} />}>
          <dl className="detail-grid">
            <div><dt>Guest</dt><dd>{view.guest_name}</dd></div>
            <div><dt>Email</dt><dd>{view.guest_email}</dd></div>
            <div><dt>Phone</dt><dd>{view.guest_phone}</dd></div>
            <div><dt>Account</dt><dd>{view.customer_name}</dd></div>
            <div><dt>Hotel</dt><dd>{view.hotel_name}, {view.hotel_city}</dd></div>
            <div><dt>Room</dt><dd>Room {view.room_number} &middot; {view.room_name} &middot; {view.category}</dd></div>
            <div><dt>Guests</dt><dd>{view.guests}</dd></div>
            <div><dt>Check-in</dt><dd>{formatDate(view.check_in)}</dd></div>
            <div><dt>Check-out</dt><dd>{formatDate(view.check_out)}</dd></div>
            <div><dt>Booking status</dt><dd><StatusBadge status={view.status} /></dd></div>
            <div><dt>Stay status</dt><dd><StatusBadge status={view.stay_status} /></dd></div>
            <div><dt>Room charges</dt><dd>{formatINRPrecise(view.room_charges)}</dd></div>
            <div><dt>Taxes + fees</dt><dd>{formatINRPrecise(view.tax_amount + view.service_fee)}</dd></div>
            <div><dt>Total</dt><dd><strong>{formatINRPrecise(view.total_amount)}</strong></dd></div>
            <div><dt>Payment</dt><dd>{PAYMENT_METHOD_LABELS[view.payment_method]} &middot; <StatusBadge status={view.payment_status} /></dd></div>
            {view.refund_amount > 0 && <div><dt>Refunded</dt><dd>{formatINRPrecise(view.refund_amount)}</dd></div>}
            {view.special_requests && <div className="span-2"><dt>Special requests</dt><dd>{view.special_requests}</dd></div>}
            {view.cancellation_reason && <div className="span-2"><dt>Cancellation</dt><dd>{view.cancellation_reason} ({formatDateTime(view.cancelled_at)})</dd></div>}
            <div><dt>Created</dt><dd>{formatDateTime(view.created_at)}</dd></div>
          </dl>
        </Modal>
      )}

      {cancelTarget && (
        <Modal title="Cancel reservation" onClose={() => busyId === null && setCancelTarget(null)}
          footer={<>
            <button type="button" className="btn btn-outline" onClick={() => setCancelTarget(null)}>Keep</button>
            <button type="button" className="btn btn-danger" onClick={doCancel} disabled={busyId === cancelTarget.id}>Cancel reservation</button>
          </>}>
          <p>Cancel <strong>{cancelTarget.reference}</strong> for {cancelTarget.guest_name}? Hotel-initiated cancellations are refunded in full.</p>
          <div className="field"><label htmlFor="ar-reason">Reason (optional)</label><textarea id="ar-reason" rows="3" maxLength="200" value={reason} onChange={(e) => setReason(e.target.value)} /></div>
        </Modal>
      )}
    </>
  );
}
