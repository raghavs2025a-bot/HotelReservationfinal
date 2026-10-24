/**
 * Database bootstrap: creates the schema, loads seed.sql, then creates the demo accounts
 * (with bcrypt-hashed passwords) and a few sample reservations.
 *
 *   npm run db:setup     -> create (if missing) + seed (only if empty)
 *   npm run db:reset     -> DROP the database first, then rebuild everything
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import { config } from '../src/config/env.js';
import { calculatePrice } from '../src/services/pricing.service.js';
import { addDays, todayStr } from '../src/utils/dates.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// SQL files live in server/database (a copy in <project>/database is also accepted).
const dbDir = [path.resolve(__dirname, '../database'), path.resolve(__dirname, '../../database')]
  .find((d) => fs.existsSync(path.join(d, 'schema.sql')));
if (!dbDir) { console.error('Could not find schema.sql in server/database or database/'); process.exit(1); }
const DB = config.db.database;
const reset = process.argv.includes('--reset');

const readSql = (file) => fs.readFileSync(path.join(dbDir, file), 'utf8').replace(/hotel_reservation/g, DB);
// triggers.sql uses DELIMITER (needed by the mysql CLI only); the driver sends the statements as they are.
const readTriggerSql = () => readSql('triggers.sql').replace(/^DELIMITER .*$/gm, '').replace(/\$\$/g, ';');

async function main() {
  const conn = await mysql.createConnection({
    host: config.db.host, port: config.db.port, user: config.db.user, password: config.db.password,
    multipleStatements: true, dateStrings: true, decimalNumbers: true,
  });
  console.log(`Connected to MySQL at ${config.db.host}:${config.db.port}`);

  if (reset) {
    console.log(`Dropping database "${DB}" ...`);
    await conn.query(`DROP DATABASE IF EXISTS \`${DB}\``);
  }
  console.log('Applying schema.sql ...');
  await conn.query(readSql('schema.sql'));
  await conn.query(`USE \`${DB}\``);

  // Older databases (single hotel table-less layout) cannot be upgraded in place.
  const [hotelCols] = await conn.query("SHOW COLUMNS FROM rooms LIKE 'hotel_id'");
  if (hotelCols.length === 0) {
    console.error('\nThis database was created with the OLD schema (no hotels table). Run:  npm run db:reset');
    process.exit(1);
  }

  const [[{ n: roomCount }]] = await conn.query('SELECT COUNT(*) AS n FROM rooms');
  if (roomCount === 0) {
    console.log('Loading seed.sql ...');
    await conn.query(readSql('seed.sql'));
  } else {
    console.log(`Rooms already present (${roomCount}); skipping seed.sql.`);
  }

  console.log('Applying triggers.sql (double-booking protection + v_room_bookings view) ...');
  await conn.query(readTriggerSql());

  const demoUsers = [
    { name: 'StayEase Admin', email: config.demo.adminEmail, phone: '+919800000001', password: config.demo.adminPassword, role: 'admin' },
    { name: 'Demo Guest', email: config.demo.customerEmail, phone: '+919800000002', password: config.demo.customerPassword, role: 'customer' },
  ];
  const ids = {};
  for (const u of demoUsers) {
    const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [u.email]);
    if (rows.length) { ids[u.role] = rows[0].id; continue; }
    const hash = await bcrypt.hash(u.password, 12);
    const [res] = await conn.execute('INSERT INTO users (name, email, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)', [u.name, u.email, u.phone, hash, u.role]);
    ids[u.role] = res.insertId;
    console.log(`Created demo ${u.role}: ${u.email}`);
  }

  const [[{ n: bookingCount }]] = await conn.query('SELECT COUNT(*) AS n FROM bookings');
  if (bookingCount === 0) {
    const today = todayStr();
    const samples = [
      { room: '201', offset: -30, nights: 3, guests: 2, status: 'completed', stay: 'checked_out', pay: 'success', method: 'simulated_card' },
      { room: '301', offset: -12, nights: 2, guests: 2, status: 'completed', stay: 'checked_out', pay: 'success', method: 'simulated_card' },
      { room: '202', offset: 10, nights: 3, guests: 3, status: 'confirmed', stay: 'not_arrived', pay: 'success', method: 'simulated_card' },
      { room: '401', offset: 15, nights: 2, guests: 4, status: 'pending', stay: 'not_arrived', pay: 'pending', method: 'pay_at_hotel' },
      { room: '102', offset: 20, nights: 2, guests: 2, status: 'cancelled', stay: 'not_arrived', pay: 'refunded', method: 'simulated_card' },
    ];
    let n = 0;
    for (const s of samples) {
      // Room numbers repeat across hotels, so pin the sample bookings to the first hotel (Chennai).
      const [[room]] = await conn.execute('SELECT id, price_per_night FROM rooms WHERE hotel_id = 1 AND room_number = ?', [s.room]);
      if (!room) continue;
      const checkIn = addDays(today, s.offset);
      const checkOut = addDays(checkIn, s.nights);
      const p = calculatePrice(Number(room.price_per_night), s.nights);
      const createdDay = addDays(checkIn, -7);
      const created = `${createdDay > today ? today : createdDay} 10:30:00`;
      n += 1;
      const ref = `SE-${checkIn.replace(/-/g, '')}-DEMO${n}${String.fromCharCode(64 + n)}`;
      const [b] = await conn.execute(
        `INSERT INTO bookings (reference, user_id, room_id, check_in, check_out, nights, guests, guest_name, guest_email, guest_phone,
           price_per_night, room_charges, tax_amount, service_fee, total_amount, status, stay_status, cancelled_at, cancellation_reason, refund_amount, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'Demo Guest', ?, '+919800000002', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [ref, ids.customer, room.id, checkIn, checkOut, s.nights, s.guests, config.demo.customerEmail, p.pricePerNight, p.roomCharges, p.taxAmount, p.serviceFee,
          p.totalAmount, s.status, s.stay, s.status === 'cancelled' ? `${created}` : null, s.status === 'cancelled' ? 'Cancelled by guest' : null,
          s.pay === 'refunded' ? p.totalAmount : 0, created]
      );
      await conn.execute(
        `INSERT INTO payments (booking_id, amount, refunded_amount, method, status, transaction_ref, is_simulated, paid_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [b.insertId, p.totalAmount, s.pay === 'refunded' ? p.totalAmount : 0, s.method, s.pay, s.method === 'simulated_card' ? `SIM-DEMO${n}` : null,
          s.method === 'simulated_card' ? created : null, created]
      );
    }
    console.log(`Created ${n} sample reservations for the demo guest.`);
  } else {
    console.log('Bookings already exist; skipping sample reservations.');
  }

  await conn.end();
  console.log('\nDatabase ready.');
  console.log('------------------------------------------------------------');
  console.log('DEMO ACCOUNTS (development only - change or delete before deploying)');
  console.log(`  Admin   : ${config.demo.adminEmail} / ${config.demo.adminPassword}`);
  console.log(`  Customer: ${config.demo.customerEmail} / ${config.demo.customerPassword}`);
  console.log('------------------------------------------------------------');
}

main().catch((err) => {
  console.error('\nDatabase setup failed:', err.message);
  if (err.code === 'ECONNREFUSED') console.error('MySQL is not reachable. Start the MySQL service and check DB_HOST/DB_PORT in server/.env.');
  if (err.code === 'ER_ACCESS_DENIED_ERROR') console.error('Wrong MySQL username/password. Check DB_USER/DB_PASSWORD in server/.env.');
  process.exit(1);
});
