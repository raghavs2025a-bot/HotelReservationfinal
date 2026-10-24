import * as Room from '../models/room.model.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { isValidDateStr, todayStr } from '../utils/dates.js';
import { parseId } from '../utils/validators.js';

const optNum = (v) => (v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));

export const list = asyncHandler(async (req, res) => {
  const { checkIn, checkOut } = req.query;
  const f = {
    guests: optNum(req.query.guests),
    typeId: optNum(req.query.category),
    location: typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 80) : '',
    hotelId: optNum(req.query.hotel),
    minPrice: optNum(req.query.minPrice),
    maxPrice: optNum(req.query.maxPrice),
    search: typeof req.query.search === 'string' ? req.query.search.trim().slice(0, 80) : '',
    sort: req.query.sort,
    onlyAvailable: req.query.onlyAvailable === 'true',
    amenityIds: String(req.query.amenities || '').split(',').map(Number).filter((n) => Number.isInteger(n) && n > 0),
  };
  if (checkIn || checkOut) {
    if (!isValidDateStr(checkIn) || !isValidDateStr(checkOut)) throw new AppError(400, 'Please provide valid check-in and check-out dates.');
    if (checkIn < todayStr()) throw new AppError(400, 'Check-in date cannot be in the past.');
    if (checkOut <= checkIn) throw new AppError(400, 'Check-out date must be after the check-in date.');
    f.checkIn = checkIn;
    f.checkOut = checkOut;
  }
  const rooms = await Room.searchRooms(f);
  res.json({ success: true, count: rooms.length, rooms });
});

export const featured = asyncHandler(async (_req, res) => res.json({ success: true, rooms: await Room.getFeatured(6) }));
export const meta = asyncHandler(async (req, res) => {
  const city = typeof req.query.location === 'string' ? req.query.location.trim().slice(0, 80) : '';
  res.json({ success: true, ...(await Room.getMeta(city)) });
});
export const testimonials = asyncHandler(async (_req, res) => res.json({ success: true, testimonials: await Room.getTestimonials() }));

export const detail = asyncHandler(async (req, res) => {
  const id = parseId(req.params.id, 'room id');
  const room = await Room.getRoomById(id);
  if (!room) throw new AppError(404, 'Room not found.');
  const bookedRanges = await Room.getBookedRanges(id, todayStr());
  res.json({ success: true, room: { ...room, available: room.operational_status === 'available' }, bookedRanges });
});
