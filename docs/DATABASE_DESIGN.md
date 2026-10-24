# StayEase Database Design

Engine: MySQL 8.0.16+ (InnoDB, utf8mb4). Files: `database/schema.sql`, `database/seed.sql`. Money columns are `DECIMAL(10,2)`.

## Entity relationship overview

```
users 1---* bookings *---1 rooms *---1 room_types
                              *
                              |
                              1
                            hotels (each hotel is in one city)
                |              |
                1              *---* amenities   (via room_amenities)
                |              |
             payments          *--- reviews (optional room/user link)
```

## Tables

### users
`id` PK, `name`, `email` (UNIQUE), `phone`, `address`, `password_hash` (bcrypt), `role` ENUM(customer, admin), `is_active`, `created_at`, `updated_at`. Index on `role`.

### room_types
`id` PK, `name` (UNIQUE), `description`, `sort_order`, `created_at`.

### amenities
`id` PK, `name` (UNIQUE), `icon` (Lucide icon name used by the UI).

### hotels
`id` PK, `name`, `city`, `country`, `address`, `star_rating` (1-5), `description`, `image_url`. UNIQUE (`city`, `name`). 36 hotels: 3 in each of 12 cities.

### rooms
`id` PK, `hotel_id` FK -> hotels (RESTRICT), `room_number` (UNIQUE together with `hotel_id`, so room 101 can exist in many hotels but only once per hotel), `name`, `room_type_id` FK -> room_types (RESTRICT), `description`, `price_per_night` DECIMAL(10,2) CHECK > 0, `capacity` CHECK 1-10, `bed_type`, `size_sqft`, `floor_no`, `image_url`, `gallery` JSON (array of URLs), `operational_status` ENUM(available, maintenance), `is_featured`, `is_active`, timestamps. Indexes: type, price, (`is_active`, `operational_status`).

### room_amenities
Composite PK (`room_id`, `amenity_id`), both FKs with ON DELETE CASCADE.

### bookings
`id` PK, `reference` (UNIQUE, e.g. `SE-20261010-K7M2QX`), `user_id` FK -> users (RESTRICT), `room_id` FK -> rooms (RESTRICT), `check_in`, `check_out` (DATE, CHECK check_out > check_in), `nights`, `guests` CHECK >= 1, guest contact fields, `special_requests`, price snapshot (`price_per_night`, `room_charges`, `tax_amount`, `service_fee`, `total_amount`), `status` ENUM(pending, confirmed, cancelled, completed), `stay_status` ENUM(not_arrived, checked_in, checked_out), `cancelled_at`, `cancellation_reason`, `refund_amount`, timestamps.
Indexes: `(room_id, check_in, check_out)` for overlap checks, `user_id`, `status`, `(check_in, check_out)`.
Prices are copied into the booking at creation time so later price changes do not alter existing reservations.

### payments
`id` PK, `booking_id` FK -> bookings (CASCADE, UNIQUE: one payment record per booking), `amount`, `refunded_amount`, `method` ENUM(simulated_card, pay_at_hotel), `status` ENUM(pending, success, failed, cancelled, refunded, partially_refunded), `transaction_ref`, `is_simulated`, `paid_at`, timestamps.
Revenue = `SUM(amount - refunded_amount)` where status is `success` or `partially_refunded`.

### reviews (optional)
`id` PK, `room_id` FK (SET NULL), `user_id` FK (SET NULL), `reviewer_name`, `reviewer_city`, `rating` CHECK 1-5, `comment`, `is_featured`, `created_at`. Seeded testimonials are shown on the home page.

## Preventing double booking
Two stays overlap when `existing.check_in < new.check_out AND existing.check_out > new.check_in` (check-out day is free for the next guest). Creating a booking:

1. `BEGIN`
2. `SELECT * FROM rooms WHERE id = ? FOR UPDATE` - serialises all concurrent bookings of that room
3. Verify the room is active, not under maintenance, and large enough
4. Check for any `pending`/`confirmed` booking that overlaps (query uses `idx_bookings_room_dates`)
5. Insert the booking (retrying on the unlikely reference collision) and the payment
6. `COMMIT` (any failure triggers `ROLLBACK`)

**Second line of defence (database trigger).** `database/triggers.sql` adds `BEFORE INSERT` and `BEFORE UPDATE` triggers on `bookings` that `SIGNAL` an error if the same room already has a pending/confirmed booking with overlapping dates, so even a direct SQL insert cannot double-book a room. The view `v_room_bookings` lists every booking with city, hotel and room number.

Cancellations and admin status changes lock the booking row (`FOR UPDATE`) before changing it.

## Seed data
`seed.sql` loads 12 amenities, 5 room types, 12 cities with 3 hotels each (36 hotels), 8 rooms per hotel (288 rooms: Standard, Deluxe, Suite, Family, Presidential) with amenity links, and 4 featured reviews. Prices depend on the city, the hotel category (budget / mid / luxury) and the room type, so every city has its own price range (for example Bali from INR 2,400, New York from INR 5,150 per night). `npm run db:setup` additionally creates the demo admin and customer (bcrypt hashes generated at setup time) and five sample reservations for the demo customer (completed, confirmed, pending and cancelled).
