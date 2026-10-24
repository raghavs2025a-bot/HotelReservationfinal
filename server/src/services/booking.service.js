import crypto from 'crypto';
import { query, q, withTransaction } from '../config/db.js';
import * as Room from '../models/room.model.js';
import * as Booking from '../models/booking.model.js';
import { AppError } from '../utils/AppError.js';
import { calculatePrice, round2 } from './pricing.service.js';
import { cleanText, isEmail, isPhone, normalizePhone, parseId, parseIntInRange, validateStayDates } from '../utils/validators.js';
import { diffDays, todayStr } from '../utils/dates.js';

const PAYMENT_METHODS = ['simulated_card', 'pay_at_hotel'];
const REF_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateReference() {
  const d = todayStr().replace(/-/g, '');
  let suffix = '';
  const bytes = crypto.randomBytes(6);
  for (const b of bytes) suffix += REF_CHARS[b % REF_CHARS.length];
  return `SE-${d}-${suffix}`;
}

export function cancellationInfo(b, today = todayStr()) {
  if (!['pending', 'confirmed'].includes(b.status)) return { canCancel: false, refundPercent: 0, reason: 'This booking is no longer active.' };
  if (b.stay_status !== 'not_arrived') return { canCancel: false, refundPercent: 0, reason: 'The guest has already checked in.' };
  const days = diffDays(today, b.check_in);
  if (days <= 0) return { canCancel: false, refundPercent: 0, reason: 'Online cancellation closes on the check-in date. Please contact the hotel.' };
  if (days >= 2) return { canCancel: true, refundPercent: 100, reason: 'Free cancellation: full refund.' };
  return { canCancel: true, refundPercent: 50, reason: 'Cancelling within 48 hours of check-in: 50% refund.' };
}

export function serializeBooking(b) {
  const info = cancellationInfo(b);
  return { ...b, can_cancel: info.canCancel, refund_percent: info.refundPercent, cancel_note: info.reason };
}

function parseStayInput(body) {
  const roomId = parseId(body.roomId, 'room');
  const guests = parseIntInRange(body.guests, 1, 10, 'Number of guests');
  const nights = validateStayDates(body.checkIn, body.checkOut);
  return { roomId, guests, nights, checkIn: body.checkIn, checkOut: body.checkOut };
}

export async function quote(body) {
  const s = parseStayInput(body);
  const room = await Room.getRoomById(s.roomId);
  if (!room) throw new AppError(404, 'Room not found.');
  const price = calculatePrice(room.price_per_night, s.nights);
  let available = true;
  let reason = null;
  if (room.operational_status !== 'available') { available = false; reason = 'This room is temporarily unavailable.'; }
  else if (s.guests > room.capacity) { available = false; reason = `This room sleeps up to ${room.capacity} guests.`; }
  else {
    const clash = await Room.findOverlap(null, room.id, s.checkIn, s.checkOut);
    if (clash) { available = false; reason = `Room ${room.room_number} is already booked from ${clash.check_in} to ${clash.check_out}. Please pick other dates or another room.`; }
  }
  return { ...price, checkIn: s.checkIn, checkOut: s.checkOut, guests: s.guests, available, reason,
    room: { id: room.id, name: room.name, category: room.category, capacity: room.capacity, image_url: room.image_url,
      room_number: room.room_number, floor_no: room.floor_no, hotel_name: room.hotel_name, city: room.city } };
}

export async function createBooking(user, body) {
  const s = parseStayInput(body);
  const guestName = cleanText(body.guestName, 100);
  const guestEmail = cleanText(body.guestEmail, 150).toLowerCase();
  const guestPhone = normalizePhone(cleanText(body.guestPhone, 20));
  const specialRequests = cleanText(body.specialRequests, 500) || null;
  const paymentMethod = body.paymentMethod;
  const errors = {};
  if (guestName.length < 2) errors.guestName = 'Please enter the guest name.';
  if (!isEmail(guestEmail)) errors.guestEmail = 'Please enter a valid email address.';
  if (!isPhone(guestPhone)) errors.guestPhone = 'Please enter a valid phone number (10-13 digits).';
  if (!PAYMENT_METHODS.includes(paymentMethod)) errors.paymentMethod = 'Please choose a payment method.';
  if (Object.keys(errors).length) throw new AppError(400, 'Please correct the highlighted fields.', errors);

  const created = await withTransaction(async (conn) => {
    // Row lock on the room serialises concurrent bookings for the same room, preventing double booking.
    const room = await Room.lockRoom(conn, s.roomId);
    if (!room || !room.is_active) throw new AppError(404, 'Room not found.');
    if (room.operational_status !== 'available') throw new AppError(409, 'This room is temporarily unavailable.');
    if (s.guests > room.capacity) throw new AppError(400, `This room sleeps up to ${room.capacity} guests.`);
    const clash = await Room.findOverlap(conn, room.id, s.checkIn, s.checkOut);
    if (clash) {
      throw new AppError(409, `Room ${room.room_number} is already booked from ${clash.check_in} to ${clash.check_out}. It cannot be booked again for these dates - please choose different dates or another room.`);
    }
    const price = calculatePrice(Number(room.price_per_night), s.nights);
    const simulatedPaid = paymentMethod === 'simulated_card';

    let bookingId = null;
    let reference = null;
    for (let attempt = 0; attempt < 5 && !bookingId; attempt += 1) {
      reference = generateReference();
      try {
        bookingId = await Booking.insertBooking(conn, {
          reference, userId: user.id, roomId: room.id, checkIn: s.checkIn, checkOut: s.checkOut, nights: s.nights, guests: s.guests,
          guestName, guestEmail, guestPhone, specialRequests, pricePerNight: price.pricePerNight, roomCharges: price.roomCharges,
          taxAmount: price.taxAmount, serviceFee: price.serviceFee, totalAmount: price.totalAmount,
          status: simulatedPaid ? 'confirmed' : 'pending',
        });
      } catch (err) {
        if (err.code === 'ER_SIGNAL_EXCEPTION' || /ROOM_ALREADY_BOOKED/.test(err.message || '')) {
          throw new AppError(409, `Room ${room.room_number} is already booked for the selected dates. Please choose different dates or another room.`);
        }
        if (err.code !== 'ER_DUP_ENTRY') throw err;
      }
    }
    if (!bookingId) throw new AppError(500, 'Could not generate a booking reference. Please try again.');

    await Booking.insertPayment(conn, {
      bookingId, amount: price.totalAmount, method: paymentMethod,
      status: simulatedPaid ? 'success' : 'pending',
      transactionRef: simulatedPaid ? `SIM-${crypto.randomBytes(5).toString('hex').toUpperCase()}` : null,
      paidAt: simulatedPaid ? new Date() : null,
    });
    return bookingId;
  });

  return serializeBooking(await Booking.findById(created));
}

export async function listMyBookings(userId) {
  await Booking.syncStatuses(todayStr());
  return (await Booking.listForUser(userId)).map(serializeBooking);
}

export async function getBookingFor(user, id) {
  await Booking.syncStatuses(todayStr());
  const b = await Booking.findById(id);
  if (!b || (user.role !== 'admin' && b.user_id !== user.id)) throw new AppError(404, 'Booking not found.');
  return serializeBooking(b);
}

export async function cancelBooking(actor, id, reason) {
  const isAdmin = actor.role === 'admin';
  await withTransaction(async (conn) => {
    const b = await Booking.lockBooking(conn, id);
    if (!b || (!isAdmin && b.user_id !== actor.id)) throw new AppError(404, 'Booking not found.');
    if (!['pending', 'confirmed'].includes(b.status)) throw new AppError(409, 'This booking can no longer be cancelled.');
    if (b.stay_status !== 'not_arrived') throw new AppError(409, 'A guest who has checked in cannot be cancelled.');
    let pct = 100;
    if (!isAdmin) {
      const info = cancellationInfo(b);
      if (!info.canCancel) throw new AppError(400, info.reason);
      pct = info.refundPercent;
    }
    const payment = await Booking.getPayment(conn, id);
    let refund = 0;
    if (payment?.status === 'success') {
      refund = round2((payment.amount * pct) / 100);
      await q(conn, 'UPDATE payments SET status = ?, refunded_amount = ? WHERE id = ?', [pct === 100 ? 'refunded' : 'partially_refunded', refund, payment.id]);
    } else if (payment?.status === 'pending') {
      await q(conn, "UPDATE payments SET status = 'cancelled' WHERE id = ?", [payment.id]);
    }
    const note = cleanText(reason, 200) || (isAdmin ? 'Cancelled by hotel' : 'Cancelled by guest');
    await q(conn, "UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = ?, refund_amount = ? WHERE id = ?", [note, refund, id]);
  });
  return serializeBooking(await Booking.findById(id));
}

export async function adminConfirm(id) {
  await withTransaction(async (conn) => {
    const b = await Booking.lockBooking(conn, id);
    if (!b) throw new AppError(404, 'Booking not found.');
    if (b.status !== 'pending') throw new AppError(409, 'Only pending reservations can be confirmed.');
    await q(conn, "UPDATE bookings SET status = 'confirmed' WHERE id = ?", [id]);
  });
  return serializeBooking(await Booking.findById(id));
}

export async function adminSetStay(id, stayStatus) {
  if (!['checked_in', 'checked_out'].includes(stayStatus)) throw new AppError(400, 'stayStatus must be checked_in or checked_out.');
  const today = todayStr();
  await withTransaction(async (conn) => {
    const b = await Booking.lockBooking(conn, id);
    if (!b) throw new AppError(404, 'Booking not found.');
    if (stayStatus === 'checked_in') {
      if (b.status !== 'confirmed') throw new AppError(409, 'Only confirmed reservations can be checked in. Confirm the reservation first.');
      if (b.stay_status !== 'not_arrived') throw new AppError(409, 'This guest is already checked in or out.');
      if (today < b.check_in) throw new AppError(409, `Check-in opens on ${b.check_in}.`);
      if (today >= b.check_out) throw new AppError(409, 'The stay dates have already passed.');
      await q(conn, "UPDATE bookings SET stay_status = 'checked_in' WHERE id = ?", [id]);
    } else {
      if (b.stay_status !== 'checked_in') throw new AppError(409, 'Only checked-in guests can be checked out.');
      await q(conn, "UPDATE bookings SET stay_status = 'checked_out', status = 'completed' WHERE id = ?", [id]);
      // Pay-at-hotel balances are settled at check-out.
      await q(conn, "UPDATE payments SET status = 'success', paid_at = NOW() WHERE booking_id = ? AND status = 'pending'", [id]);
    }
  });
  return serializeBooking(await Booking.findById(id));
}
