import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, BedDouble, CheckCircle2, Layers, Maximize2, Users } from 'lucide-react';
import SmartImage from '../components/SmartImage.jsx';
import AmenityIcon from '../components/AmenityIcon.jsx';
import PriceBreakdown from '../components/PriceBreakdown.jsx';
import { ErrorState, Loader } from '../components/feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import { bookingService, roomService } from '../services/index.js';
import { addDaysISO, errorMessage, formatDate, formatINR, nightsBetween, todayISO } from '../utils/format.js';

export default function RoomDetails() {
  const { id } = useParams();
  const [sp] = useSearchParams();
  const navigate = useNavigate();
  const { data, loading, error, reload } = useFetch(() => roomService.get(id), [id]);
  const [active, setActive] = useState(0);
  const today = todayISO();
  const [form, setForm] = useState({ checkIn: sp.get('checkIn') || '', checkOut: sp.get('checkOut') || '', guests: sp.get('guests') || '2' });
  const [quote, setQuote] = useState(null);
  const [quoteError, setQuoteError] = useState('');
  const [quoting, setQuoting] = useState(false);

  useEffect(() => { setActive(0); }, [id]);
  useEffect(() => {
    if (data && Number(form.guests) > data.room.capacity) setForm((f) => ({ ...f, guests: String(data.room.capacity) }));
  }, [data]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setQuote(null);
    setQuoteError('');
    if (!data || !form.checkIn || !form.checkOut) return undefined;
    if (nightsBetween(form.checkIn, form.checkOut) < 1) { setQuoteError('Check-out must be after check-in.'); return undefined; }
    let live = true;
    setQuoting(true);
    const t = setTimeout(() => {
      bookingService.quote({ roomId: Number(id), checkIn: form.checkIn, checkOut: form.checkOut, guests: Number(form.guests) })
        .then((r) => live && setQuote(r.quote))
        .catch((e) => live && setQuoteError(errorMessage(e)))
        .finally(() => live && setQuoting(false));
    }, 250);
    return () => { live = false; clearTimeout(t); };
  }, [data, id, form.checkIn, form.checkOut, form.guests]);

  if (loading) return <Loader label="Loading room..." />;
  if (error) return <div className="container section"><ErrorState message={error} onRetry={reload} /></div>;
  const { room, bookedRanges } = data;
  const images = room.gallery?.length ? room.gallery : [room.image_url];

  const setField = (k) => (e) => {
    const v = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === 'checkIn' && next.checkOut && next.checkOut <= v) next.checkOut = addDaysISO(v, 1);
      return next;
    });
  };

  const book = () => {
    const qs = new URLSearchParams({ checkIn: form.checkIn, checkOut: form.checkOut, guests: form.guests });
    navigate(`/book/${room.id}?${qs}`);
  };
  const canBook = quote?.available && room.available;

  return (
    <div className="container section-sm">
      <Link to="/rooms" className="back-link"><ArrowLeft size={16} /> Back to rooms</Link>
      <div className="details-grid">
        <div>
          <div className="gallery">
            <SmartImage className="gallery-main" src={images[active]} alt={`${room.name} photo ${active + 1}`} />
            {images.length > 1 && (
              <div className="gallery-thumbs">
                {images.map((src, i) => (
                  <button key={src + i} type="button" className={i === active ? 'active' : ''} onClick={() => setActive(i)} aria-label={`Show photo ${i + 1}`}><SmartImage src={src} alt="" /></button>
                ))}
              </div>
            )}
          </div>

          <div className="details-head">
            <span className="chip chip-gold">{room.category}</span>
            <h1>{room.name}</h1>
            <p className="room-hotel room-hotel-lg"><strong>{room.hotel_name}</strong>, {room.city}, {room.country} &middot; <strong>Room No. {room.room_number}</strong></p>
            <ul className="room-meta room-meta-lg">
              <li><Users size={18} aria-hidden="true" /> Up to {room.capacity} guests</li>
              <li><BedDouble size={18} aria-hidden="true" /> {room.bed_type}</li>
              {room.size_sqft && <li><Maximize2 size={18} aria-hidden="true" /> {room.size_sqft} sq ft</li>}
              {room.floor_no !== null && <li><Layers size={18} aria-hidden="true" /> Floor {room.floor_no}</li>}
            </ul>
          </div>
          <h2 className="h3">About this room</h2>
          <p className="lead">{room.description}</p>
          <h2 className="h3">Facilities</h2>
          <ul className="facility-grid">
            {room.amenities.map((a) => <li key={a.id}><AmenityIcon name={a.icon} size={20} /> {a.name}</li>)}
          </ul>
          <h2 className="h3">Booked dates for Room {room.room_number}</h2>
          {bookedRanges.length === 0 ? <p className="muted">This room currently has no upcoming reservations.</p> : (
            <ul className="booked-list">{bookedRanges.map((r, i) => <li key={i}>{formatDate(r.check_in)} &rarr; {formatDate(r.check_out)}</li>)}</ul>
          )}
        </div>

        <aside className="booking-panel" aria-label="Booking panel">
          <div className="price-head"><strong>{formatINR(room.price_per_night)}</strong><span>/ night + taxes</span></div>
          {!room.available && <p className="alert alert-warn"><AlertCircle size={18} /> This room is temporarily unavailable.</p>}
          <div className="field">
            <label htmlFor="d-in">Check-in</label>
            <input id="d-in" type="date" min={today} value={form.checkIn} onChange={setField('checkIn')} />
          </div>
          <div className="field">
            <label htmlFor="d-out">Check-out</label>
            <input id="d-out" type="date" min={form.checkIn ? addDaysISO(form.checkIn, 1) : addDaysISO(today, 1)} value={form.checkOut} onChange={setField('checkOut')} />
          </div>
          <div className="field">
            <label htmlFor="d-guests">Guests</label>
            <select id="d-guests" value={form.guests} onChange={setField('guests')}>
              {Array.from({ length: room.capacity }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
            </select>
          </div>

          {!form.checkIn || !form.checkOut ? <p className="muted small">Select your dates to see the price and availability.</p> : null}
          {quoting && <Loader inline label="Checking availability..." />}
          {quoteError && <p className="alert alert-error" role="alert"><AlertCircle size={18} /> {quoteError}</p>}
          {quote && !quoting && (
            <>
              {quote.available
                ? <p className="alert alert-success"><CheckCircle2 size={18} /> Available for your dates</p>
                : <p className="alert alert-error" role="alert"><AlertCircle size={18} /> {quote.reason}</p>}
              <PriceBreakdown quote={quote} />
            </>
          )}
          <button type="button" className="btn btn-primary btn-block" disabled={!canBook || quoting} onClick={book}>Reserve now</button>
          <p className="muted small center">You won&apos;t be charged yet. Payment in this build is simulated.</p>
        </aside>
      </div>
    </div>
  );
}
