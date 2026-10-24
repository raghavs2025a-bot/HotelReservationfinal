import { Link } from 'react-router-dom';
import { ArrowRight, Award, Heart, ShieldCheck, Sparkles, Star } from 'lucide-react';
import SearchBar from '../components/SearchBar.jsx';
import RoomCard from '../components/RoomCard.jsx';
import AmenityIcon from '../components/AmenityIcon.jsx';
import { ErrorState, Loader } from '../components/feedback.jsx';
import useFetch from '../hooks/useFetch.js';
import { roomService } from '../services/index.js';
import { formatINR } from '../utils/format.js';

const HERO = 'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=2000&q=80';
const INTRO = 'https://images.unsplash.com/photo-1445019980597-93fa8acb246c?auto=format&fit=crop&w=1200&q=80';

export default function Home() {
  const featured = useFetch(() => roomService.featured(), []);
  const meta = useFetch(() => roomService.meta(), []);
  const reviews = useFetch(() => roomService.testimonials(), []);

  return (
    <>
      <section className="hero" style={{ backgroundImage: `linear-gradient(180deg, rgba(10,25,45,.72), rgba(10,25,45,.55) 55%, rgba(10,25,45,.85)), url(${HERO})` }}>
        <div className="container hero-inner">
          <p className="eyebrow">12 cities &middot; 36 hotels &middot; Since 1998</p>
          <h1>Stay somewhere <em>unforgettable</em></h1>
          <p className="hero-sub">Elegant rooms, warm hospitality and instant confirmation. Book directly with StayEase for the best available rates.</p>
          <SearchBar variant="hero" />
        </div>
      </section>

      <section className="section container intro">
        <div className="intro-text">
          <p className="eyebrow eyebrow-dark">Welcome to StayEase</p>
          <h2>A calm, considered retreat in the heart of the city</h2>
          <p>From quiet garden rooms to sweeping presidential suites, every space at StayEase is designed around rest. Our team blends traditional South Indian hospitality with the conveniences modern travellers expect, whether you are here for business, a family holiday or a long-awaited escape.</p>
          <ul className="intro-points">
            <li><Award size={20} aria-hidden="true" /> Thoughtfully designed rooms and suites</li>
            <li><ShieldCheck size={20} aria-hidden="true" /> Secure booking with free cancellation window</li>
            <li><Heart size={20} aria-hidden="true" /> Personal service from check-in to check-out</li>
          </ul>
          <Link to="/rooms" className="btn btn-primary">Explore all rooms <ArrowRight size={18} aria-hidden="true" /></Link>
        </div>
        <div className="intro-media"><img src={INTRO} alt="Resort pool at StayEase" loading="lazy" /><div className="intro-badge"><Sparkles size={18} aria-hidden="true" /> Rated 4.8 by our guests</div></div>
      </section>

      <section className="section container" id="cities">
        <div className="section-head">
          <p className="eyebrow eyebrow-dark">Destinations</p>
          <h2>Browse hotels by city</h2>
        </div>
        {meta.data && (
          <ul className="city-grid">
            {meta.data.cities.map((c) => (
              <li key={c.city}>
                <Link to={`/rooms?location=${encodeURIComponent(c.city)}`} className="city-card">
                  <strong>{c.city}</strong>
                  <span>{c.hotels} hotels &middot; {c.rooms} rooms</span>
                  <em>from {formatINR(c.min_price)} / night</em>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section section-warm">
        <div className="container">
          <div className="section-head">
            <p className="eyebrow eyebrow-dark">Featured stays</p>
            <h2>Our most-loved rooms</h2>
          </div>
          {featured.loading && <Loader label="Loading featured rooms..." />}
          {featured.error && <ErrorState message={featured.error} onRetry={featured.reload} />}
          {featured.data && (
            <div className="room-grid">{featured.data.rooms.map((r) => <RoomCard key={r.id} room={{ ...r, available: r.operational_status === 'available' }} />)}</div>
          )}
          <div className="center"><Link to="/rooms" className="btn btn-outline">View all rooms</Link></div>
        </div>
      </section>

      <section className="section container" id="amenities">
        <div className="section-head">
          <p className="eyebrow eyebrow-dark">Amenities</p>
          <h2>Everything you need, nothing you don&apos;t</h2>
        </div>
        {meta.loading && <Loader label="Loading amenities..." />}
        {meta.data && (
          <ul className="amenity-grid">
            {meta.data.amenities.map((a) => (
              <li key={a.id}><span className="amenity-icon"><AmenityIcon name={a.icon} size={22} /></span><span>{a.name}</span></li>
            ))}
          </ul>
        )}
      </section>

      <section className="section section-navy">
        <div className="container">
          <div className="section-head section-head-light">
            <p className="eyebrow">Guest stories</p>
            <h2>What our guests say</h2>
          </div>
          {reviews.loading && <Loader label="Loading reviews..." />}
          {reviews.data && (
            <div className="testimonial-grid">
              {reviews.data.testimonials.map((t) => (
                <figure key={t.id} className="testimonial">
                  <div className="stars" aria-label={`${t.rating} out of 5 stars`}>{Array.from({ length: t.rating }).map((_, i) => <Star key={i} size={16} fill="currentColor" aria-hidden="true" />)}</div>
                  <blockquote>&ldquo;{t.comment}&rdquo;</blockquote>
                  <figcaption><strong>{t.reviewer_name}</strong><span>{t.reviewer_city}</span></figcaption>
                </figure>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="section container cta">
        <h2>Ready for your next stay?</h2>
        <p>Choose your dates and reserve in minutes. Free cancellation up to 48 hours before check-in.</p>
        <Link to="/rooms" className="btn btn-gold">Check availability</Link>
      </section>
    </>
  );
}
