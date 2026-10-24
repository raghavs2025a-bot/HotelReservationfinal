import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, CreditCard, Hotel, Loader2, Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext.jsx';
import { useToast } from '../context/ToastContext.jsx';
import PriceBreakdown from '../components/PriceBreakdown.jsx';
import SmartImage from '../components/SmartImage.jsx';
import { Loader } from '../components/feedback.jsx';
import { bookingService } from '../services/index.js';
import { errorMessage, fieldErrors, formatDateLong } from '../utils/format.js';

export default function Checkout() {
  const { roomId } = useParams();
  const [sp] = useSearchParams();
  const { user } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const checkIn = sp.get('checkIn');
  const checkOut = sp.get('checkOut');
  const guests = Number(sp.get('guests') || 2);

  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [form, setForm] = useState({ guestName: user?.name || '', guestEmail: user?.email || '', guestPhone: user?.phone || '', specialRequests: '', paymentMethod: 'simulated_card', agree: false });
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!checkIn || !checkOut) return;
    bookingService.quote({ roomId: Number(roomId), checkIn, checkOut, guests })
      .then((r) => setQuote(r.quote))
      .catch((e) => setQuoteError(errorMessage(e)));
  }, [roomId, checkIn, checkOut, guests]);

  if (!checkIn || !checkOut) return <Navigate to={`/rooms/${roomId}`} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    const errs = {};
    if (form.guestName.trim().length < 2) errs.guestName = 'Please enter the guest name.';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.guestEmail)) errs.guestEmail = 'Enter a valid email address.';
    if (!/^\+?[0-9]{10,13}$/.test(form.guestPhone.replace(/[\s-]/g, ''))) errs.guestPhone = 'Enter a valid phone number (10-13 digits).';
    if (!form.agree) errs.agree = 'Please accept the booking terms to continue.';
    setErrors(errs);
    setFormError('');
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      const res = await bookingService.create({
        roomId: Number(roomId), checkIn, checkOut, guests,
        guestName: form.guestName, guestEmail: form.guestEmail, guestPhone: form.guestPhone,
        specialRequests: form.specialRequests, paymentMethod: form.paymentMethod,
      });
      toast.success(res.booking.status === 'confirmed' ? 'Booking confirmed!' : 'Reservation received. It will be confirmed by the hotel.');
      navigate(`/booking/confirmation/${res.booking.id}`, { replace: true });
    } catch (err) {
      setErrors(fieldErrors(err));
      setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="container section-sm">
      <Link to={`/rooms/${roomId}?checkIn=${checkIn}&checkOut=${checkOut}&guests=${guests}`} className="back-link"><ArrowLeft size={16} /> Back to room</Link>
      <h1 className="page-title">Complete your reservation</h1>
      <div className="checkout-grid">
        <form className="card form-card" onSubmit={submit} noValidate>
          <h2 className="h3">Guest details</h2>
          {formError && <p className="alert alert-error" role="alert"><AlertCircle size={18} /> {formError}</p>}
          <div className="field">
            <label htmlFor="c-name">Full name</label>
            <input id="c-name" value={form.guestName} onChange={set('guestName')} autoComplete="name" aria-invalid={Boolean(errors.guestName)} />
            {errors.guestName && <span className="field-error">{errors.guestName}</span>}
          </div>
          <div className="field-row">
            <div className="field">
              <label htmlFor="c-email">Email</label>
              <input id="c-email" type="email" value={form.guestEmail} onChange={set('guestEmail')} autoComplete="email" aria-invalid={Boolean(errors.guestEmail)} />
              {errors.guestEmail && <span className="field-error">{errors.guestEmail}</span>}
            </div>
            <div className="field">
              <label htmlFor="c-phone">Phone</label>
              <input id="c-phone" type="tel" value={form.guestPhone} onChange={set('guestPhone')} autoComplete="tel" aria-invalid={Boolean(errors.guestPhone)} />
              {errors.guestPhone && <span className="field-error">{errors.guestPhone}</span>}
            </div>
          </div>
          <div className="field">
            <label htmlFor="c-req">Special requests <span className="muted">(optional)</span></label>
            <textarea id="c-req" rows="3" maxLength="500" value={form.specialRequests} onChange={set('specialRequests')} placeholder="Early check-in, extra pillows, dietary needs..." />
          </div>

          <h2 className="h3">Payment</h2>
          <p className="alert alert-info"><Lock size={18} /> <span><strong>Development mode:</strong> no real payment gateway is connected. &ldquo;Simulated payment&rdquo; records a successful test payment; no money is charged.</span></p>
          <fieldset className="radio-cards">
            <legend className="sr-only">Payment method</legend>
            <label className={form.paymentMethod === 'simulated_card' ? 'selected' : ''}>
              <input type="radio" name="pm" value="simulated_card" checked={form.paymentMethod === 'simulated_card'} onChange={set('paymentMethod')} />
              <CreditCard size={22} aria-hidden="true" />
              <span><strong>Simulated online payment</strong><small>Booking is confirmed instantly (test payment).</small></span>
            </label>
            <label className={form.paymentMethod === 'pay_at_hotel' ? 'selected' : ''}>
              <input type="radio" name="pm" value="pay_at_hotel" checked={form.paymentMethod === 'pay_at_hotel'} onChange={set('paymentMethod')} />
              <Hotel size={22} aria-hidden="true" />
              <span><strong>Pay at hotel</strong><small>Reservation stays pending until the hotel confirms it.</small></span>
            </label>
          </fieldset>

          <label className="check">
            <input type="checkbox" checked={form.agree} onChange={(e) => setForm({ ...form, agree: e.target.checked })} />
            I agree to the cancellation policy: full refund up to 48 hours before check-in, 50% within 48 hours, none on the check-in day.
          </label>
          {errors.agree && <span className="field-error">{errors.agree}</span>}

          <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={busy || !quote || !quote.available}>
            {busy ? <><Loader2 className="spin" size={18} /> Processing...</> : 'Confirm reservation'}
          </button>
        </form>

        <aside className="card summary-card" aria-label="Booking summary">
          <h2 className="h3">Your stay</h2>
          {quoteError && <p className="alert alert-error" role="alert">{quoteError}</p>}
          {!quote && !quoteError && <Loader label="Calculating price..." />}
          {quote && (
            <>
              <SmartImage className="summary-img" src={quote.room.image_url} alt={quote.room.name} />
              <h3>{quote.room.name}</h3>
              <p className="muted">{quote.room.category}</p>
              <dl className="summary-list">
                <div><dt>Hotel</dt><dd>{quote.room.hotel_name}, {quote.room.city}</dd></div>
                <div><dt>Room number</dt><dd><strong>Room {quote.room.room_number}</strong>{quote.room.floor_no !== null && <> (floor {quote.room.floor_no})</>}</dd></div>
              </dl>
              <dl className="summary-list">
                <div><dt>Check-in</dt><dd>{formatDateLong(quote.checkIn)}</dd></div>
                <div><dt>Check-out</dt><dd>{formatDateLong(quote.checkOut)}</dd></div>
                <div><dt>Guests</dt><dd>{quote.guests}</dd></div>
              </dl>
              {!quote.available && <p className="alert alert-error" role="alert">{quote.reason}</p>}
              <PriceBreakdown quote={quote} />
              <p className="muted small">Totals are calculated by the server when you confirm.</p>
            </>
          )}
        </aside>
      </div>
    </div>
  );
}
