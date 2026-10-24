import { withTransaction } from '../config/db.js';
import * as Room from '../models/room.model.js';
import * as Booking from '../models/booking.model.js';
import * as User from '../models/user.model.js';
import * as Svc from '../services/booking.service.js';
import { buildReport, dashboardStats } from '../services/report.service.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { addDays, isValidDateStr, todayStr } from '../utils/dates.js';
import { cleanText, parseId, parseIntInRange, parseMoney } from '../utils/validators.js';

const optNum = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const isUrl = (v) => /^https?:\/\/\S+$/i.test(v);

// ---------------- dashboard & reports ----------------
export const stats = asyncHandler(async (_req, res) => res.json({ success: true, stats: await dashboardStats() }));

export const report = asyncHandler(async (req, res) => {
  const to = req.query.to || todayStr();
  const from = req.query.from || addDays(to, -29);
  res.json({ success: true, report: await buildReport(from, to) });
});

// ---------------- rooms ----------------
async function parseRoomPayload(b) {
  const errors = {};
  const roomNumber = cleanText(b.roomNumber, 10);
  const hotelId = Number(b.hotelId);
  if (!Number.isInteger(hotelId) || !(await Room.hotelExists(hotelId))) errors.hotelId = 'Choose a hotel.';
  const name = cleanText(b.name, 120);
  if (!roomNumber) errors.roomNumber = 'Room number is required.';
  if (name.length < 3) errors.name = 'Room name must be at least 3 characters.';
  const roomTypeId = Number(b.roomTypeId);
  if (!Number.isInteger(roomTypeId) || !(await Room.typeExists(roomTypeId))) errors.roomTypeId = 'Choose a valid room type.';
  let pricePerNight; let capacity;
  try { pricePerNight = parseMoney(b.pricePerNight, 'Price per night'); } catch (e) { errors.pricePerNight = e.message; }
  try { capacity = parseIntInRange(b.capacity, 1, 10, 'Capacity'); } catch (e) { errors.capacity = e.message; }
  const bedType = cleanText(b.bedType, 60);
  if (!bedType) errors.bedType = 'Bed type is required.';
  const imageUrl = cleanText(b.imageUrl, 500);
  if (imageUrl && !isUrl(imageUrl)) errors.imageUrl = 'Image must be a valid http(s) URL.';
  const galleryRaw = Array.isArray(b.gallery) ? b.gallery : String(b.gallery || '').split('\n');
  const gallery = galleryRaw.map((s) => cleanText(String(s), 500)).filter(Boolean).slice(0, 8);
  if (gallery.some((g) => !isUrl(g))) errors.gallery = 'Every gallery entry must be a valid http(s) URL.';
  const sizeSqft = optNum(b.sizeSqft);
  if (sizeSqft !== null && (sizeSqft < 50 || sizeSqft > 10000)) errors.sizeSqft = 'Size must be between 50 and 10000 sq ft.';
  const floorNo = optNum(b.floorNo);
  if (floorNo !== null && (!Number.isInteger(floorNo) || floorNo < 0 || floorNo > 100)) errors.floorNo = 'Floor must be between 0 and 100.';
  const operationalStatus = ['available', 'maintenance'].includes(b.operationalStatus) ? b.operationalStatus : 'available';
  const amenityIds = await Room.validAmenityIds([...new Set((Array.isArray(b.amenityIds) ? b.amenityIds : []).map(Number).filter((n) => Number.isInteger(n) && n > 0))]);
  if (Object.keys(errors).length) throw new AppError(400, 'Please correct the highlighted fields.', errors);
  return {
    hotelId, roomNumber, name, roomTypeId, description: cleanText(b.description, 2000) || null, pricePerNight, capacity, bedType, sizeSqft, floorNo,
    imageUrl: imageUrl || gallery[0] || null, gallery: imageUrl ? [imageUrl, ...gallery.filter((g) => g !== imageUrl)] : gallery,
    operationalStatus, isFeatured: Boolean(b.isFeatured), isActive: b.isActive !== false, amenityIds,
  };
}

async function assertCanDeactivate(roomId) {
  const n = await Room.futureBookingsCount(roomId, todayStr());
  if (n > 0) throw new AppError(409, `This room has ${n} upcoming reservation(s). Cancel or complete them before deactivating the room.`);
}

export const listRooms = asyncHandler(async (req, res) => {
  const rooms = await Room.adminListRooms({ search: cleanText(req.query.search, 80), typeId: optNum(req.query.type), status: req.query.status, hotelId: optNum(req.query.hotel) });
  res.json({ success: true, rooms });
});

const duplicateRoomNumber = (err) => {
  if (err.code === 'ER_DUP_ENTRY') throw new AppError(409, 'This hotel already has a room with that number.', { roomNumber: 'Room number already used in this hotel.' });
  throw err;
};

export const listHotels = asyncHandler(async (_req, res) => res.json({ success: true, hotels: await Room.listHotels() }));

export const createRoom = asyncHandler(async (req, res) => {
  const data = await parseRoomPayload(req.body);
  const id = await withTransaction((conn) => Room.createRoom(conn, data)).catch(duplicateRoomNumber);
  res.status(201).json({ success: true, message: 'Room created.', room: await Room.getRoomById(id, { includeInactive: true }) });
});

export const updateRoom = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'room id');
  if (!(await Room.getRoomById(id, { includeInactive: true }))) throw new AppError(404, 'Room not found.');
  const data = await parseRoomPayload(req.body);
  if (!data.isActive) await assertCanDeactivate(id);
  await withTransaction((conn) => Room.updateRoom(conn, id, data)).catch(duplicateRoomNumber);
  res.json({ success: true, message: 'Room updated.', room: await Room.getRoomById(id, { includeInactive: true }) });
});

export const setRoomActive = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'room id');
  if (!(await Room.getRoomById(id, { includeInactive: true }))) throw new AppError(404, 'Room not found.');
  const active = Boolean(req.body.isActive);
  if (!active) await assertCanDeactivate(id);
  await Room.setRoomActive(id, active);
  res.json({ success: true, message: active ? 'Room activated.' : 'Room deactivated.', room: await Room.getRoomById(id, { includeInactive: true }) });
});

// ---------------- room types & amenities ----------------
export const listTypes = asyncHandler(async (_req, res) => res.json({ success: true, types: await Room.listTypes() }));
export const listAmenities = asyncHandler(async (_req, res) => res.json({ success: true, amenities: (await Room.getMeta()).amenities }));

function parseTypePayload(b) {
  const name = cleanText(b.name, 80);
  if (name.length < 2) throw new AppError(400, 'Room type name must be at least 2 characters.', { name: 'Name is required.' });
  const sortOrder = optNum(b.sortOrder) ?? 0;
  return { name, description: cleanText(b.description, 1000), sortOrder: Math.max(0, Math.min(999, Math.round(sortOrder))) };
}

export const createType = asyncHandler(async (req, res) => {
  const id = await Room.createType(parseTypePayload(req.body));
  res.status(201).json({ success: true, message: 'Room type created.', id });
});

export const updateType = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'type id');
  if (!(await Room.typeExists(id))) throw new AppError(404, 'Room type not found.');
  await Room.updateType(id, parseTypePayload(req.body));
  res.json({ success: true, message: 'Room type updated.' });
});

// ---------------- reservations ----------------
export const listBookings = asyncHandler(async (req, res) => {
  await Booking.syncStatuses(todayStr());
  const f = {
    search: cleanText(req.query.search, 80),
    status: ['pending', 'confirmed', 'cancelled', 'completed'].includes(req.query.status) ? req.query.status : '',
    stayStatus: ['not_arrived', 'checked_in', 'checked_out'].includes(req.query.stay) ? req.query.stay : '',
    from: isValidDateStr(req.query.from) ? req.query.from : '',
    to: isValidDateStr(req.query.to) ? req.query.to : '',
  };
  const bookings = (await Booking.adminList(f)).map(Svc.serializeBooking);
  res.json({ success: true, count: bookings.length, bookings });
});

export const updateBookingStatus = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'booking id');
  const { status, reason } = req.body;
  if (status === 'confirmed') return res.json({ success: true, message: 'Reservation confirmed.', booking: await Svc.adminConfirm(id) });
  if (status === 'cancelled') return res.json({ success: true, message: 'Reservation cancelled.', booking: await Svc.cancelBooking(req.user, id, reason) });
  throw new AppError(400, "status must be 'confirmed' or 'cancelled'.");
});

export const updateStayStatus = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'booking id');
  const booking = await Svc.adminSetStay(id, req.body.stayStatus);
  res.json({ success: true, message: req.body.stayStatus === 'checked_in' ? 'Guest checked in.' : 'Guest checked out.', booking });
});

// ---------------- customers ----------------
export const listCustomers = asyncHandler(async (req, res) => {
  const customers = await User.listCustomers({ search: cleanText(req.query.search, 80), status: req.query.status });
  res.json({ success: true, customers });
});

export const customerDetail = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'customer id');
  const user = await User.findById(id);
  if (!user || user.role !== 'customer') throw new AppError(404, 'Customer not found.');
  await Booking.syncStatuses(todayStr());
  const bookings = (await Booking.listForUser(id)).map(Svc.serializeBooking);
  res.json({ success: true, customer: user, bookings });
});

export const setCustomerActive = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'customer id');
  const user = await User.findById(id);
  if (!user || user.role !== 'customer') throw new AppError(404, 'Customer not found.');
  await User.setActive(id, Boolean(req.body.isActive));
  res.json({ success: true, message: req.body.isActive ? 'Account activated.' : 'Account deactivated.', customer: await User.findById(id) });
});
