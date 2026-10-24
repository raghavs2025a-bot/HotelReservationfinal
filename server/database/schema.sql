-- StayEase Hotel Reservation System - MySQL 8.0+ schema
-- Safe to re-run: uses CREATE ... IF NOT EXISTS. To wipe everything use: npm run db:reset

CREATE DATABASE IF NOT EXISTS hotel_reservation CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE hotel_reservation;

CREATE TABLE IF NOT EXISTS users (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(150) NOT NULL,
  phone         VARCHAR(20)  NULL,
  address       VARCHAR(255) NULL,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('customer','admin') NOT NULL DEFAULT 'customer',
  is_active     TINYINT(1) NOT NULL DEFAULT 1,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS amenities (
  id   INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(80) NOT NULL,
  icon VARCHAR(40) NOT NULL DEFAULT 'Check',
  PRIMARY KEY (id),
  UNIQUE KEY uq_amenities_name (name)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS room_types (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(80) NOT NULL,
  description TEXT NULL,
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_room_types_name (name)
) ENGINE=InnoDB;

-- One row per physical hotel. Every hotel belongs to exactly one city, so each city has its own hotels.
CREATE TABLE IF NOT EXISTS hotels (
  id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
  name        VARCHAR(120) NOT NULL,
  city        VARCHAR(80)  NOT NULL,
  country     VARCHAR(80)  NOT NULL,
  address     VARCHAR(255) NULL,
  star_rating TINYINT UNSIGNED NOT NULL DEFAULT 4,
  description VARCHAR(500) NULL,
  image_url   VARCHAR(500) NULL,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hotels_city_name (city, name),
  KEY idx_hotels_city (city),
  CONSTRAINT chk_hotels_star CHECK (star_rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS rooms (
  id                 INT UNSIGNED NOT NULL AUTO_INCREMENT,
  hotel_id           INT UNSIGNED NOT NULL,
  room_number        VARCHAR(10) NOT NULL,
  name               VARCHAR(120) NOT NULL,
  room_type_id       INT UNSIGNED NOT NULL,
  description        TEXT NULL,
  price_per_night    DECIMAL(10,2) NOT NULL,
  capacity           TINYINT UNSIGNED NOT NULL,
  bed_type           VARCHAR(60) NOT NULL,
  size_sqft          SMALLINT UNSIGNED NULL,
  floor_no           TINYINT UNSIGNED NULL,
  image_url          VARCHAR(500) NULL,
  gallery            JSON NULL,
  operational_status ENUM('available','maintenance') NOT NULL DEFAULT 'available',
  is_featured        TINYINT(1) NOT NULL DEFAULT 0,
  is_active          TINYINT(1) NOT NULL DEFAULT 1,
  created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_rooms_hotel_number (hotel_id, room_number),
  KEY idx_rooms_hotel (hotel_id),
  KEY idx_rooms_type (room_type_id),
  KEY idx_rooms_price (price_per_night),
  KEY idx_rooms_active (is_active, operational_status),
  CONSTRAINT fk_rooms_hotel FOREIGN KEY (hotel_id) REFERENCES hotels (id) ON DELETE RESTRICT,
  CONSTRAINT fk_rooms_type FOREIGN KEY (room_type_id) REFERENCES room_types (id) ON DELETE RESTRICT,
  CONSTRAINT chk_rooms_price CHECK (price_per_night > 0),
  CONSTRAINT chk_rooms_capacity CHECK (capacity BETWEEN 1 AND 10)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS room_amenities (
  room_id    INT UNSIGNED NOT NULL,
  amenity_id INT UNSIGNED NOT NULL,
  PRIMARY KEY (room_id, amenity_id),
  KEY idx_ra_amenity (amenity_id),
  CONSTRAINT fk_ra_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE CASCADE,
  CONSTRAINT fk_ra_amenity FOREIGN KEY (amenity_id) REFERENCES amenities (id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS bookings (
  id                  INT UNSIGNED NOT NULL AUTO_INCREMENT,
  reference           VARCHAR(24) NOT NULL,
  user_id             INT UNSIGNED NOT NULL,
  room_id             INT UNSIGNED NOT NULL,
  check_in            DATE NOT NULL,
  check_out           DATE NOT NULL,
  nights              SMALLINT UNSIGNED NOT NULL,
  guests              TINYINT UNSIGNED NOT NULL,
  guest_name          VARCHAR(100) NOT NULL,
  guest_email         VARCHAR(150) NOT NULL,
  guest_phone         VARCHAR(20) NOT NULL,
  special_requests    VARCHAR(500) NULL,
  price_per_night     DECIMAL(10,2) NOT NULL,
  room_charges        DECIMAL(10,2) NOT NULL,
  tax_amount          DECIMAL(10,2) NOT NULL,
  service_fee         DECIMAL(10,2) NOT NULL,
  total_amount        DECIMAL(10,2) NOT NULL,
  status              ENUM('pending','confirmed','cancelled','completed') NOT NULL DEFAULT 'pending',
  stay_status         ENUM('not_arrived','checked_in','checked_out') NOT NULL DEFAULT 'not_arrived',
  cancelled_at        DATETIME NULL,
  cancellation_reason VARCHAR(255) NULL,
  refund_amount       DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at          TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_bookings_reference (reference),
  KEY idx_bookings_user (user_id),
  KEY idx_bookings_room_dates (room_id, check_in, check_out),
  KEY idx_bookings_status (status),
  KEY idx_bookings_dates (check_in, check_out),
  CONSTRAINT fk_bookings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
  CONSTRAINT fk_bookings_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE RESTRICT,
  CONSTRAINT chk_bookings_dates CHECK (check_out > check_in),
  CONSTRAINT chk_bookings_guests CHECK (guests >= 1)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS payments (
  id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
  booking_id      INT UNSIGNED NOT NULL,
  amount          DECIMAL(10,2) NOT NULL,
  refunded_amount DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  method          ENUM('simulated_card','pay_at_hotel') NOT NULL,
  status          ENUM('pending','success','failed','cancelled','refunded','partially_refunded') NOT NULL DEFAULT 'pending',
  transaction_ref VARCHAR(60) NULL,
  is_simulated    TINYINT(1) NOT NULL DEFAULT 1,
  paid_at         DATETIME NULL,
  created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_payments_booking (booking_id),
  KEY idx_payments_status (status),
  CONSTRAINT fk_payments_booking FOREIGN KEY (booking_id) REFERENCES bookings (id) ON DELETE CASCADE,
  CONSTRAINT chk_payments_amount CHECK (amount >= 0)
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS reviews (
  id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
  room_id       INT UNSIGNED NULL,
  user_id       INT UNSIGNED NULL,
  reviewer_name VARCHAR(100) NOT NULL,
  reviewer_city VARCHAR(80) NULL,
  rating        TINYINT UNSIGNED NOT NULL,
  comment       VARCHAR(600) NOT NULL,
  is_featured   TINYINT(1) NOT NULL DEFAULT 0,
  created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_reviews_room (room_id),
  KEY idx_reviews_featured (is_featured),
  CONSTRAINT fk_reviews_room FOREIGN KEY (room_id) REFERENCES rooms (id) ON DELETE SET NULL,
  CONSTRAINT fk_reviews_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT chk_reviews_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB;
