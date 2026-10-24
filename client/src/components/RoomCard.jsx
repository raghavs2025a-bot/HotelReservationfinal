import { Link } from 'react-router-dom';
import { BedDouble, MapPin, Maximize2, Users } from 'lucide-react';
import SmartImage from './SmartImage.jsx';
import AmenityIcon from './AmenityIcon.jsx';
import { formatINR } from '../utils/format.js';

export default function RoomCard({ room, search }) {
  const qs = new URLSearchParams();
  if (search?.checkIn) qs.set('checkIn', search.checkIn);
  if (search?.checkOut) qs.set('checkOut', search.checkOut);
  if (search?.guests) qs.set('guests', search.guests);
  const to = `/rooms/${room.id}${qs.toString() ? `?${qs}` : ''}`;
  const available = room.available !== false;

  return (
    <article className={`room-card ${available ? '' : 'room-card-unavailable'}`}>
      <Link to={to} className="room-card-media" aria-label={`View ${room.name}`}>
        <SmartImage src={room.image_url} alt={room.name} />
        <span className="chip chip-gold">{room.category}</span>
        <span className="chip chip-dark room-card-no">Room {room.room_number}</span>
        {!available && <span className="chip chip-dark room-card-sold">{room.operational_status === 'maintenance' ? 'Unavailable' : 'Booked for your dates'}</span>}
      </Link>
      <div className="room-card-body">
        <h3><Link to={to}>{room.name}</Link></h3>
        <p className="room-hotel"><MapPin size={14} aria-hidden="true" /> <strong>{room.hotel_name}</strong>, {room.city} &middot; Room {room.room_number}, floor {room.floor_no}</p>
        <ul className="room-meta">
          <li><Users size={15} aria-hidden="true" /> Up to {room.capacity} guests</li>
          <li><BedDouble size={15} aria-hidden="true" /> {room.bed_type}</li>
          {room.size_sqft && <li><Maximize2 size={15} aria-hidden="true" /> {room.size_sqft} sq ft</li>}
        </ul>
        <p className="room-desc">{room.description}</p>
        <ul className="amenity-row">
          {room.amenities?.slice(0, 5).map((a) => (
            <li key={a.id} title={a.name}><AmenityIcon name={a.icon} /><span>{a.name}</span></li>
          ))}
        </ul>
        <div className="room-card-foot">
          <div className="price"><strong>{formatINR(room.price_per_night)}</strong><span>/ night + taxes</span></div>
          <Link to={to} className={`btn ${available ? 'btn-primary' : 'btn-outline'} btn-sm`}>{available ? 'View & Book' : 'View details'}</Link>
        </div>
      </div>
    </article>
  );
}
