import { useEffect, useState } from 'react';
import { Edit3, Loader2, Plus, Power, Search } from 'lucide-react';
import Modal from '../../components/Modal.jsx';
import StatusBadge from '../../components/StatusBadge.jsx';
import SmartImage from '../../components/SmartImage.jsx';
import { EmptyState, ErrorState, Loader } from '../../components/feedback.jsx';
import useFetch from '../../hooks/useFetch.js';
import useDebounce from '../../hooks/useDebounce.js';
import { useToast } from '../../context/ToastContext.jsx';
import { adminService } from '../../services/index.js';
import { errorMessage, fieldErrors, formatINR } from '../../utils/format.js';

const EMPTY = { hotelId: '', roomNumber: '', name: '', roomTypeId: '', description: '', pricePerNight: '', capacity: 2, bedType: '', sizeSqft: '', floorNo: '', imageUrl: '', gallery: '', operationalStatus: 'available', isFeatured: false, isActive: true, amenityIds: [] };

export default function AdminRooms() {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const dSearch = useDebounce(search);
  const rooms = useFetch(() => adminService.rooms({ search: dSearch || undefined, type: type || undefined, status: status || undefined }), [dSearch, type, status]);
  const types = useFetch(() => adminService.roomTypes(), []);
  const hotels = useFetch(() => adminService.hotels(), []);
  const amenities = useFetch(() => adminService.amenities(), []);
  const [editing, setEditing] = useState(null); // null | 'new' | room
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!editing) return;
    if (editing === 'new') { setForm(EMPTY); } else {
      const r = editing;
      setForm({
        hotelId: r.hotel_id, roomNumber: r.room_number, name: r.name, roomTypeId: r.room_type_id, description: r.description || '', pricePerNight: r.price_per_night, capacity: r.capacity,
        bedType: r.bed_type, sizeSqft: r.size_sqft ?? '', floorNo: r.floor_no ?? '', imageUrl: r.image_url || '', gallery: (r.gallery || []).filter((g) => g !== r.image_url).join('\n'),
        operationalStatus: r.operational_status, isFeatured: Boolean(r.is_featured), isActive: Boolean(r.is_active), amenityIds: r.amenities.map((a) => a.id),
      });
    }
    setErrors({});
  }, [editing]);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value });
  const toggleAmenity = (id) => setForm((f) => ({ ...f, amenityIds: f.amenityIds.includes(id) ? f.amenityIds.filter((x) => x !== id) : [...f.amenityIds, id] }));

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setErrors({});
    try {
      const body = { ...form, hotelId: Number(form.hotelId), roomTypeId: Number(form.roomTypeId), gallery: form.gallery.split('\n') };
      if (editing === 'new') await adminService.createRoom(body); else await adminService.updateRoom(editing.id, body);
      toast.success(editing === 'new' ? 'Room created.' : 'Room updated.');
      setEditing(null);
      rooms.reload();
    } catch (err) {
      setErrors(fieldErrors(err));
      toast.error(errorMessage(err));
    } finally { setBusy(false); }
  };

  const toggleActive = async (r) => {
    try {
      const res = await adminService.setRoomActive(r.id, !r.is_active);
      toast.success(res.message);
      rooms.reload();
    } catch (err) { toast.error(errorMessage(err)); }
  };

  const err = (k) => errors[k] && <span className="field-error">{errors[k]}</span>;

  return (
    <>
      <div className="admin-head row-between">
        <div><h1>Rooms</h1><p className="muted">Create, edit and manage room inventory, pricing and availability.</p></div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}><Plus size={18} /> Add room</button>
      </div>

      <div className="toolbar">
        <div className="search-input"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search name or room number" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search rooms" /></div>
        <select value={type} onChange={(e) => setType(e.target.value)} aria-label="Filter by room type"><option value="">All types</option>{types.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filter by status">
          <option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="maintenance">Maintenance</option><option value="occupied">Occupied</option>
        </select>
      </div>

      {rooms.loading && <Loader label="Loading rooms..." />}
      {rooms.error && <ErrorState message={rooms.error} onRetry={rooms.reload} />}
      {rooms.data && rooms.data.rooms.length === 0 && <EmptyState title="No rooms found" message="Adjust your filters or add a new room." />}
      {rooms.data && rooms.data.rooms.length > 0 && (
        <div className="panel table-wrap">
          <table className="table">
            <thead><tr><th>Room</th><th>Type</th><th>Price / night</th><th>Capacity</th><th>Status</th><th>Bookings</th><th aria-label="Actions" /></tr></thead>
            <tbody>
              {rooms.data.rooms.map((r) => (
                <tr key={r.id} className={r.is_active ? '' : 'row-muted'}>
                  <td data-label="Room"><div className="cell-room"><SmartImage src={r.image_url} alt="" /><div><strong>{r.name}</strong><small>Room {r.room_number} &middot; {r.hotel_name}, {r.city}</small></div></div></td>
                  <td data-label="Type">{r.category}</td>
                  <td data-label="Price">{formatINR(r.price_per_night)}</td>
                  <td data-label="Capacity">{r.capacity}</td>
                  <td data-label="Status">
                    <div className="badge-stack">
                      <StatusBadge status={r.is_active ? 'active' : 'inactive'} />
                      {r.operational_status === 'maintenance' && <StatusBadge status="maintenance" />}
                      {r.occupied && <StatusBadge status="occupied" />}
                    </div>
                  </td>
                  <td data-label="Bookings">{r.bookings_count}</td>
                  <td className="actions">
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setEditing(r)}><Edit3 size={14} /> Edit</button>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleActive(r)}><Power size={14} /> {r.is_active ? 'Deactivate' : 'Activate'}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <Modal wide title={editing === 'new' ? 'Add room' : `Edit room ${editing.room_number} (${editing.hotel_name}, ${editing.city})`} onClose={() => !busy && setEditing(null)}
          footer={<>
            <button type="button" className="btn btn-outline" onClick={() => setEditing(null)} disabled={busy}>Cancel</button>
            <button type="submit" form="room-form" className="btn btn-primary" disabled={busy}>{busy && <Loader2 className="spin" size={16} />} Save room</button>
          </>}>
          <form id="room-form" onSubmit={save} noValidate className="form-grid">
            <div className="field span-2"><label htmlFor="rf-hotel">Hotel</label>
              <select id="rf-hotel" value={form.hotelId} onChange={set('hotelId')}><option value="">Select hotel</option>{hotels.data?.hotels.map((h) => <option key={h.id} value={h.id}>{h.city} - {h.name}</option>)}</select>{err('hotelId')}</div>
            <div className="field"><label htmlFor="rf-no">Room number</label><input id="rf-no" value={form.roomNumber} onChange={set('roomNumber')} />{err('roomNumber')}</div>
            <div className="field"><label htmlFor="rf-name">Name</label><input id="rf-name" value={form.name} onChange={set('name')} />{err('name')}</div>
            <div className="field"><label htmlFor="rf-type">Room type</label>
              <select id="rf-type" value={form.roomTypeId} onChange={set('roomTypeId')}><option value="">Select type</option>{types.data?.types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select>{err('roomTypeId')}</div>
            <div className="field"><label htmlFor="rf-price">Price per night (INR)</label><input id="rf-price" type="number" min="1" step="0.01" value={form.pricePerNight} onChange={set('pricePerNight')} />{err('pricePerNight')}</div>
            <div className="field"><label htmlFor="rf-cap">Capacity</label><input id="rf-cap" type="number" min="1" max="10" value={form.capacity} onChange={set('capacity')} />{err('capacity')}</div>
            <div className="field"><label htmlFor="rf-bed">Bed type</label><input id="rf-bed" value={form.bedType} onChange={set('bedType')} placeholder="1 King Bed" />{err('bedType')}</div>
            <div className="field"><label htmlFor="rf-size">Size (sq ft)</label><input id="rf-size" type="number" value={form.sizeSqft} onChange={set('sizeSqft')} />{err('sizeSqft')}</div>
            <div className="field"><label htmlFor="rf-floor">Floor</label><input id="rf-floor" type="number" value={form.floorNo} onChange={set('floorNo')} />{err('floorNo')}</div>
            <div className="field span-2"><label htmlFor="rf-desc">Description</label><textarea id="rf-desc" rows="3" value={form.description} onChange={set('description')} /></div>
            <div className="field span-2"><label htmlFor="rf-img">Main image URL</label><input id="rf-img" value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://..." />{err('imageUrl')}</div>
            <div className="field span-2"><label htmlFor="rf-gal">Gallery image URLs (one per line)</label><textarea id="rf-gal" rows="3" value={form.gallery} onChange={set('gallery')} />{err('gallery')}</div>
            <fieldset className="field span-2"><legend>Amenities</legend>
              <div className="check-grid">{amenities.data?.amenities.map((a) => <label key={a.id} className="check"><input type="checkbox" checked={form.amenityIds.includes(a.id)} onChange={() => toggleAmenity(a.id)} /> {a.name}</label>)}</div></fieldset>
            <div className="field"><label htmlFor="rf-op">Operational status</label>
              <select id="rf-op" value={form.operationalStatus} onChange={set('operationalStatus')}><option value="available">Available</option><option value="maintenance">Maintenance (not bookable)</option></select></div>
            <div className="field"><span className="label-like">Options</span>
              <label className="check"><input type="checkbox" checked={form.isFeatured} onChange={set('isFeatured')} /> Featured on home page</label>
              <label className="check"><input type="checkbox" checked={form.isActive} onChange={set('isActive')} /> Active (visible to guests)</label></div>
          </form>
        </Modal>
      )}
    </>
  );
}
