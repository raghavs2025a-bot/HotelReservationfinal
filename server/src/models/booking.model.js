import { query, q } from '../config/db.js';

export const BOOKING_SELECT = `
  SELECT b.*, r.name AS room_name, r.room_number, r.floor_no, r.image_url AS room_image, rt.name AS category,
         h.id AS hotel_id, h.name AS hotel_name, h.city AS hotel_city, h.country AS hotel_country, h.address AS hotel_address,
         u.name AS customer_name, u.email AS customer_email,
         p.status AS payment_status, p.method AS payment_method, p.amount AS payment_amount,
         p.refunded_amount, p.transaction_ref, p.is_simulated, p.paid_at
  FROM bookings b
  JOIN rooms r ON r.id = b.room_id
  JOIN room_types rt ON rt.id = r.room_type_id
  JOIN hotels h ON h.id = r.hotel_id
  JOIN users u ON u.id = b.user_id
  LEFT JOIN payments p ON p.booking_id = b.id`;

export const findById = async (id) => (await query(`${BOOKING_SELECT} WHERE b.id = ?`, [id]))[0] || null;
export const listForUser = (userId) => query(`${BOOKING_SELECT} WHERE b.user_id = ? ORDER BY b.check_in DESC, b.id DESC`, [userId]);

export async function adminList(f) {
  const where = ['1 = 1'];
  const params = [];
  if (f.search) {
    where.push('(b.reference LIKE ? OR b.guest_name LIKE ? OR b.guest_email LIKE ? OR r.name LIKE ? OR r.room_number LIKE ? OR h.name LIKE ? OR h.city LIKE ?)');
    const s = `%${f.search}%`;
    params.push(s, s, s, s, s, s, s);
  }
  if (f.status) { where.push('b.status = ?'); params.push(f.status); }
  if (f.stayStatus) { where.push('b.stay_status = ?'); params.push(f.stayStatus); }
  if (f.from) { where.push('b.check_out >= ?'); params.push(f.from); }
  if (f.to) { where.push('b.check_in <= ?'); params.push(f.to); }
  if (f.userId) { where.push('b.user_id = ?'); params.push(f.userId); }
  return query(`${BOOKING_SELECT} WHERE ${where.join(' AND ')} ORDER BY b.created_at DESC, b.id DESC LIMIT 500`, params);
}

export async function insertBooking(conn, d) {
  const res = await q(
    conn,
    `INSERT INTO bookings (reference, user_id, room_id, check_in, check_out, nights, guests, guest_name, guest_email, guest_phone, special_requests,
       price_per_night, room_charges, tax_amount, service_fee, total_amount, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [d.reference, d.userId, d.roomId, d.checkIn, d.checkOut, d.nights, d.guests, d.guestName, d.guestEmail, d.guestPhone, d.specialRequests,
      d.pricePerNight, d.roomCharges, d.taxAmount, d.serviceFee, d.totalAmount, d.status]
  );
  return res.insertId;
}

export const insertPayment = (conn, d) =>
  q(
    conn,
    `INSERT INTO payments (booking_id, amount, method, status, transaction_ref, is_simulated, paid_at) VALUES (?, ?, ?, ?, ?, 1, ?)`,
    [d.bookingId, d.amount, d.method, d.status, d.transactionRef, d.paidAt]
  );

export const lockBooking = async (conn, id) => (await q(conn, 'SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]))[0] || null;
export const getPayment = async (conn, bookingId) => (await q(conn, 'SELECT * FROM payments WHERE booking_id = ? FOR UPDATE', [bookingId]))[0] || null;

export async function syncStatuses(today) {
  await query(
    `UPDATE bookings SET status = 'completed', stay_status = IF(stay_status = 'checked_in', 'checked_out', stay_status)
     WHERE status = 'confirmed' AND check_out < ?`,
    [today]
  );
  await query(
    `UPDATE payments p JOIN bookings b ON b.id = p.booking_id SET p.status = 'cancelled'
     WHERE b.status = 'pending' AND b.check_out < ? AND p.status = 'pending'`,
    [today]
  );
  await query(
    `UPDATE bookings SET status = 'cancelled', cancelled_at = NOW(), cancellation_reason = 'Expired: not confirmed before check-out'
     WHERE status = 'pending' AND check_out < ?`,
    [today]
  );
}
