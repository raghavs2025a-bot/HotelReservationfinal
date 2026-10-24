-- StayEase: database-level protection against double booking + a view that lists booked rooms.
-- `npm run db:setup` applies this file automatically. To run it by hand in the MySQL CLI:
--     mysql -u root -p hotel_reservation < triggers.sql
USE hotel_reservation;

DROP TRIGGER IF EXISTS trg_bookings_no_overlap_ins;
DROP TRIGGER IF EXISTS trg_bookings_no_overlap_upd;

DELIMITER $$

-- A room can never have two active (pending/confirmed) bookings whose dates overlap.
-- Two stays overlap when: existing.check_in < new.check_out AND existing.check_out > new.check_in
-- (the check-out day is free for the next guest).
CREATE TRIGGER trg_bookings_no_overlap_ins BEFORE INSERT ON bookings
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending','confirmed') AND EXISTS (
       SELECT 1 FROM bookings b
       WHERE b.room_id = NEW.room_id AND b.status IN ('pending','confirmed')
         AND b.check_in < NEW.check_out AND b.check_out > NEW.check_in) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ROOM_ALREADY_BOOKED: this room is already booked for the selected dates';
  END IF;
END$$

CREATE TRIGGER trg_bookings_no_overlap_upd BEFORE UPDATE ON bookings
FOR EACH ROW
BEGIN
  IF NEW.status IN ('pending','confirmed') AND EXISTS (
       SELECT 1 FROM bookings b
       WHERE b.room_id = NEW.room_id AND b.id <> NEW.id AND b.status IN ('pending','confirmed')
         AND b.check_in < NEW.check_out AND b.check_out > NEW.check_in) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'ROOM_ALREADY_BOOKED: this room is already booked for the selected dates';
  END IF;
END$$

DELIMITER ;

-- Handy for the viva / demo:  SELECT * FROM v_room_bookings;
CREATE OR REPLACE VIEW v_room_bookings AS
SELECT b.reference, h.city, h.name AS hotel, r.room_number, r.floor_no, rt.name AS room_type,
       b.check_in, b.check_out, b.nights, b.total_amount, b.status, b.guest_name
FROM bookings b
JOIN rooms r       ON r.id = b.room_id
JOIN hotels h      ON h.id = r.hotel_id
JOIN room_types rt ON rt.id = r.room_type_id
ORDER BY b.check_in DESC;
