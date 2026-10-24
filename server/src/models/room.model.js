import { query, q } from '../config/db.js';

const ROOM_COLUMNS = `r.id, r.room_number, r.name, r.description, r.price_per_night, r.capacity, r.bed_type, r.size_sqft,
  r.floor_no, r.image_url, r.gallery, r.operational_status, r.is_featured, r.is_active, r.room_type_id, rt.name AS category,
  r.hotel_id, h.name AS hotel_name, h.city, h.country, h.address AS hotel_address, h.star_rating`;
const FROM = 'FROM rooms r JOIN room_types rt ON rt.id = r.room_type_id JOIN hotels h ON h.id = r.hotel_id';
const OVERLAP = `EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.status IN ('pending','confirmed') AND b.check_in < ? AND b.check_out > ?)`;

const parseGallery = (g) => {
  if (Array.isArray(g)) return g;
  if (typeof g === 'string') {
    try { return JSON.parse(g); } catch { return []; }
  }
  return [];
};

async function attachAmenities(rooms) {
  if (!rooms.length) return rooms;
  const ids = rooms.map((r) => r.id);
  const rows = await query(
    `SELECT ra.room_id, a.id, a.name, a.icon FROM room_amenities ra JOIN amenities a ON a.id = ra.amenity_id
     WHERE ra.room_id IN (${ids.map(() => '?').join(',')}) ORDER BY a.id`,
    ids
  );
  const map = new Map();
  rows.forEach((row) => {
    if (!map.has(row.room_id)) map.set(row.room_id, []);
    map.get(row.room_id).push({ id: row.id, name: row.name, icon: row.icon });
  });
  return rooms.map((r) => ({ ...r, gallery: parseGallery(r.gallery), amenities: map.get(r.id) || [] }));
}

const SORTS = {
  price_asc: 'r.price_per_night ASC, r.id ASC',
  price_desc: 'r.price_per_night DESC, r.id ASC',
  capacity_desc: 'r.capacity DESC, r.price_per_night ASC',
  recommended: 'r.is_featured DESC, h.id ASC, r.id ASC',
};

export async function searchRooms(f) {
  const selectParams = [];
  const whereParams = [];
  const where = ['r.is_active = 1'];
  let availabilitySelect = ', 1 AS date_free';

  if (f.checkIn && f.checkOut) {
    availabilitySelect = `, NOT ${OVERLAP} AS date_free`;
    selectParams.push(f.checkOut, f.checkIn);
    if (f.onlyAvailable) {
      where.push(`NOT ${OVERLAP}`, "r.operational_status = 'available'");
      whereParams.push(f.checkOut, f.checkIn);
    }
  } else if (f.onlyAvailable) {
    where.push("r.operational_status = 'available'");
  }
  if (f.guests) { where.push('r.capacity >= ?'); whereParams.push(f.guests); }
  if (f.location) { where.push('h.city = ?'); whereParams.push(f.location); }
  if (f.hotelId) { where.push('r.hotel_id = ?'); whereParams.push(f.hotelId); }
  if (f.typeId) { where.push('r.room_type_id = ?'); whereParams.push(f.typeId); }
  if (f.minPrice !== null && f.minPrice !== undefined) { where.push('r.price_per_night >= ?'); whereParams.push(f.minPrice); }
  if (f.maxPrice !== null && f.maxPrice !== undefined) { where.push('r.price_per_night <= ?'); whereParams.push(f.maxPrice); }
  if (f.search) {
    where.push('(r.name LIKE ? OR r.description LIKE ? OR rt.name LIKE ? OR h.name LIKE ? OR r.room_number LIKE ?)');
    const s = `%${f.search}%`;
    whereParams.push(s, s, s, s, s);
  }
  if (f.amenityIds?.length) {
    where.push(`(SELECT COUNT(DISTINCT ra.amenity_id) FROM room_amenities ra WHERE ra.room_id = r.id AND ra.amenity_id IN (${f.amenityIds.map(() => '?').join(',')})) = ?`);
    whereParams.push(...f.amenityIds, f.amenityIds.length);
  }
  const order = SORTS[f.sort] || SORTS.recommended;
  const rows = await query(
    `SELECT ${ROOM_COLUMNS}${availabilitySelect} ${FROM} WHERE ${where.join(' AND ')} ORDER BY ${order}`,
    [...selectParams, ...whereParams]
  );
  const rooms = (await attachAmenities(rows)).map((r) => ({
    ...r,
    available: r.operational_status === 'available' && Boolean(r.date_free),
  }));
  if (f.checkIn && f.checkOut && !f.sort) rooms.sort((a, b) => Number(b.available) - Number(a.available));
  return rooms;
}

export async function getFeatured(limit = 6) {
  const rows = await query(`SELECT ${ROOM_COLUMNS} ${FROM} WHERE r.is_active = 1 AND r.is_featured = 1 ORDER BY h.id ASC LIMIT ${Number(limit) || 6}`);
  return attachAmenities(rows);
}

export async function getRoomById(id, { includeInactive = false } = {}) {
  const rows = await query(`SELECT ${ROOM_COLUMNS} ${FROM} WHERE r.id = ? ${includeInactive ? '' : 'AND r.is_active = 1'}`, [id]);
  if (!rows.length) return null;
  return (await attachAmenities(rows))[0];
}

export const getBookedRanges = (roomId, today) =>
  query(
    `SELECT check_in, check_out FROM bookings WHERE room_id = ? AND status IN ('pending','confirmed') AND check_out >= ? ORDER BY check_in`,
    [roomId, today]
  );

/** Filters data for the UI. When `city` is given, the price range and hotel list are limited to that city. */
export async function getMeta(city = '') {
  const cityWhere = city ? ' AND h.city = ?' : '';
  const cityParams = city ? [city] : [];
  const [types, amenities, price, cities, hotels] = await Promise.all([
    query('SELECT id, name, description FROM room_types ORDER BY sort_order, id'),
    query('SELECT id, name, icon FROM amenities ORDER BY id'),
    query(`SELECT MIN(r.price_per_night) AS min_price, MAX(r.price_per_night) AS max_price, MAX(r.capacity) AS max_capacity
           FROM rooms r JOIN hotels h ON h.id = r.hotel_id WHERE r.is_active = 1${cityWhere}`, cityParams),
    query(`SELECT h.city, h.country, COUNT(DISTINCT h.id) AS hotels, COUNT(r.id) AS rooms, MIN(r.price_per_night) AS min_price, MAX(r.price_per_night) AS max_price
           FROM hotels h JOIN rooms r ON r.hotel_id = h.id AND r.is_active = 1 GROUP BY h.city, h.country ORDER BY MIN(h.id)`),
    query(`SELECT h.id, h.name, h.city, h.star_rating FROM hotels h WHERE 1 = 1${cityWhere} ORDER BY h.id`, cityParams),
  ]);
  return { types, amenities, price: price[0], cities, hotels };
}

export const getTestimonials = () =>
  query('SELECT id, reviewer_name, reviewer_city, rating, comment FROM reviews WHERE is_featured = 1 ORDER BY created_at DESC LIMIT 6');

/** Lock a room row inside a transaction and return it (used to serialise bookings per room). */
export async function lockRoom(conn, roomId) {
  return (await q(conn, 'SELECT * FROM rooms WHERE id = ? FOR UPDATE', [roomId]))[0] || null;
}

/** Returns the conflicting booking (check_in/check_out) when the room is already taken for those dates, otherwise null. */
export async function findOverlap(conn, roomId, checkIn, checkOut, excludeBookingId = 0) {
  const sql = `SELECT id, check_in, check_out FROM bookings WHERE room_id = ? AND status IN ('pending','confirmed') AND check_in < ? AND check_out > ? AND id <> ? ORDER BY check_in LIMIT 1`;
  const params = [roomId, checkOut, checkIn, excludeBookingId];
  const rows = conn ? await q(conn, sql, params) : await query(sql, params);
  return rows[0] || null;
}
export const hasOverlap = async (...args) => Boolean(await findOverlap(...args));

export const hotelExists = async (id) => (await query('SELECT id FROM hotels WHERE id = ?', [id])).length > 0;
export const listHotels = () =>
  query(`SELECT h.id, h.name, h.city, h.country, h.star_rating, (SELECT COUNT(*) FROM rooms r WHERE r.hotel_id = h.id) AS rooms_count FROM hotels h ORDER BY h.city, h.name`);

// ---------------- admin ----------------
export async function adminListRooms({ search, typeId, status, hotelId }) {
  const where = ['1 = 1'];
  const params = [];
  if (search) {
    where.push('(r.name LIKE ? OR r.room_number LIKE ? OR h.name LIKE ? OR h.city LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (hotelId) { where.push('r.hotel_id = ?'); params.push(hotelId); }
  if (typeId) { where.push('r.room_type_id = ?'); params.push(typeId); }
  if (status === 'active') where.push('r.is_active = 1');
  if (status === 'inactive') where.push('r.is_active = 0');
  if (status === 'maintenance') where.push("r.operational_status = 'maintenance'");
  if (status === 'occupied') where.push("EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.stay_status = 'checked_in')");
  const rows = await query(
    `SELECT ${ROOM_COLUMNS},
       EXISTS (SELECT 1 FROM bookings b WHERE b.room_id = r.id AND b.stay_status = 'checked_in') AS occupied,
       (SELECT COUNT(*) FROM bookings b WHERE b.room_id = r.id) AS bookings_count
     ${FROM} WHERE ${where.join(' AND ')} ORDER BY h.city, h.name, r.room_number`,
    params
  );
  return (await attachAmenities(rows)).map((r) => ({ ...r, occupied: Boolean(r.occupied) }));
}

async function setRoomAmenities(conn, roomId, amenityIds) {
  await q(conn, 'DELETE FROM room_amenities WHERE room_id = ?', [roomId]);
  for (const id of amenityIds) await q(conn, 'INSERT INTO room_amenities (room_id, amenity_id) VALUES (?, ?)', [roomId, id]);
}

export async function createRoom(conn, d) {
  const res = await q(
    conn,
    `INSERT INTO rooms (hotel_id, room_number, name, room_type_id, description, price_per_night, capacity, bed_type, size_sqft, floor_no, image_url, gallery, operational_status, is_featured, is_active)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.hotelId, d.roomNumber, d.name, d.roomTypeId, d.description, d.pricePerNight, d.capacity, d.bedType, d.sizeSqft, d.floorNo, d.imageUrl, JSON.stringify(d.gallery), d.operationalStatus, d.isFeatured ? 1 : 0, d.isActive ? 1 : 0]
  );
  await setRoomAmenities(conn, res.insertId, d.amenityIds);
  return res.insertId;
}

export async function updateRoom(conn, id, d) {
  await q(
    conn,
    `UPDATE rooms SET hotel_id = ?, room_number = ?, name = ?, room_type_id = ?, description = ?, price_per_night = ?, capacity = ?, bed_type = ?,
       size_sqft = ?, floor_no = ?, image_url = ?, gallery = ?, operational_status = ?, is_featured = ?, is_active = ? WHERE id = ?`,
    [d.hotelId, d.roomNumber, d.name, d.roomTypeId, d.description, d.pricePerNight, d.capacity, d.bedType, d.sizeSqft, d.floorNo, d.imageUrl, JSON.stringify(d.gallery), d.operationalStatus, d.isFeatured ? 1 : 0, d.isActive ? 1 : 0, id]
  );
  await setRoomAmenities(conn, id, d.amenityIds);
}

export const setRoomActive = (id, active) => query('UPDATE rooms SET is_active = ? WHERE id = ?', [active ? 1 : 0, id]);
export const futureBookingsCount = async (roomId, today) =>
  (await query(`SELECT COUNT(*) AS n FROM bookings WHERE room_id = ? AND status IN ('pending','confirmed') AND check_out >= ?`, [roomId, today]))[0].n;

export const listTypes = () =>
  query('SELECT rt.id, rt.name, rt.description, rt.sort_order, (SELECT COUNT(*) FROM rooms r WHERE r.room_type_id = rt.id) AS rooms_count FROM room_types rt ORDER BY rt.sort_order, rt.id');
export const createType = async ({ name, description, sortOrder }) =>
  (await query('INSERT INTO room_types (name, description, sort_order) VALUES (?, ?, ?)', [name, description || null, sortOrder])).insertId;
export const updateType = (id, { name, description, sortOrder }) =>
  query('UPDATE room_types SET name = ?, description = ?, sort_order = ? WHERE id = ?', [name, description || null, sortOrder, id]);
export const typeExists = async (id) => (await query('SELECT id FROM room_types WHERE id = ?', [id])).length > 0;
export const validAmenityIds = async (ids) => {
  if (!ids.length) return [];
  const rows = await query(`SELECT id FROM amenities WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
  return rows.map((r) => r.id);
};