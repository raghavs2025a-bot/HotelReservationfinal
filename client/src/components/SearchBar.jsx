import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { roomService } from '../services/index.js';
import { addDaysISO, todayISO } from '../utils/format.js';

export default function SearchBar({ initial = {}, variant = 'hero', onSearch }) {
  const navigate = useNavigate();
  const [types, setTypes] = useState([]);
  const [cities, setCities] = useState([]);
  const [form, setForm] = useState({
    checkIn: initial.checkIn || '',
    checkOut: initial.checkOut || '',
    guests: initial.guests || '2',
    category: initial.category || '',
    location: initial.location || '',
  });
  const [error, setError] = useState('');
  const today = todayISO();

  useEffect(() => {
    roomService.meta().then((r) => { setTypes(r.types); setCities(r.cities || []); }).catch(() => { setTypes([]); setCities([]); });
  }, []);

  useEffect(() => {
    setForm((f) => ({ ...f, checkIn: initial.checkIn || '', checkOut: initial.checkOut || '', guests: initial.guests || f.guests, category: initial.category || '', location: initial.location || '' }));
  }, [initial.checkIn, initial.checkOut, initial.guests, initial.category, initial.location]);

  const set = (k) => (e) => {
    const value = e.target.value;
    setForm((f) => {
      const next = { ...f, [k]: value };
      if (k === 'checkIn' && next.checkOut && next.checkOut <= value) next.checkOut = addDaysISO(value, 1);
      return next;
    });
  };

  const submit = (e) => {
    e.preventDefault();
    if ((form.checkIn && !form.checkOut) || (!form.checkIn && form.checkOut)) return setError('Please choose both check-in and check-out dates.');
    if (form.checkIn && form.checkIn < today) return setError('Check-in date cannot be in the past.');
    if (form.checkIn && form.checkOut <= form.checkIn) return setError('Check-out must be after check-in.');
    setError('');
    const qs = new URLSearchParams();
    Object.entries(form).forEach(([k, v]) => v && qs.set(k, v));
    if (onSearch) onSearch(form);
    else navigate(`/rooms?${qs.toString()}`);
  };

  return (
    <form className={`search-bar search-bar-${variant}`} onSubmit={submit} noValidate>
      <div className="field">
        <label htmlFor="sb-city">City</label>
        <select id="sb-city" value={form.location} onChange={set('location')}>
          <option value="">All cities</option>
          {cities.map((c) => <option key={c.city} value={c.city}>{c.city}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sb-in">Check-in</label>
        <input id="sb-in" type="date" min={today} value={form.checkIn} onChange={set('checkIn')} />
      </div>
      <div className="field">
        <label htmlFor="sb-out">Check-out</label>
        <input id="sb-out" type="date" min={form.checkIn ? addDaysISO(form.checkIn, 1) : addDaysISO(today, 1)} value={form.checkOut} onChange={set('checkOut')} />
      </div>
      <div className="field">
        <label htmlFor="sb-guests">Guests</label>
        <select id="sb-guests" value={form.guests} onChange={set('guests')}>
          {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n} {n === 1 ? 'guest' : 'guests'}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="sb-cat">Room category</label>
        <select id="sb-cat" value={form.category} onChange={set('category')}>
          <option value="">All categories</option>
          {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      </div>
      <button type="submit" className="btn btn-gold search-btn"><Search size={18} aria-hidden="true" /> Search rooms</button>
      {error && <p className="field-error search-error" role="alert">{error}</p>}
    </form>
  );
}
