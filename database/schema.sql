USE defaultdb;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('student','admin') NOT NULL DEFAULT 'student',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS menu_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  description VARCHAR(500) DEFAULT '',
  price_paise INT UNSIGNED NOT NULL,
  image_url VARCHAR(500) DEFAULT '',
  available BOOLEAN NOT NULL DEFAULT TRUE,
  prep_minutes INT UNSIGNED NOT NULL DEFAULT 8,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_number VARCHAR(24) NOT NULL UNIQUE,
  user_id BIGINT UNSIGNED NOT NULL,
  total_paise INT UNSIGNED NOT NULL,
  payment_method ENUM('cash','razorpay') NOT NULL,
  payment_status ENUM('pending','paid','failed') NOT NULL DEFAULT 'pending',
  order_status ENUM('Pending','Preparing','Ready','Completed','Cancelled') NOT NULL DEFAULT 'Pending',
  pickup_token CHAR(64) NOT NULL UNIQUE,
  estimated_minutes INT UNSIGNED NOT NULL DEFAULT 10,
  razorpay_order_id VARCHAR(100) DEFAULT NULL,
  razorpay_payment_id VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_orders_user FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_orders_queue (order_status, created_at),
  INDEX idx_orders_user (user_id, created_at)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NOT NULL,
  menu_item_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(120) NOT NULL,
  unit_price_paise INT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL,
  prep_minutes INT UNSIGNED NOT NULL,
  CONSTRAINT fk_order_items_order FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT fk_order_items_menu FOREIGN KEY (menu_item_id) REFERENCES menu_items(id) ON DELETE SET NULL
);

INSERT INTO menu_items (name, description, price_paise, image_url, prep_minutes)
SELECT 'Veg Sandwich', 'Fresh vegetable sandwich', 5000, '', 6
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Veg Sandwich');
INSERT INTO menu_items (name, description, price_paise, image_url, prep_minutes)
SELECT 'Masala Dosa', 'Crispy dosa with potato masala', 6500, '', 10
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Masala Dosa');
INSERT INTO menu_items (name, description, price_paise, image_url, prep_minutes)
SELECT 'Idli (2 pcs)', 'Steamed idli with chutney', 3500, '', 5
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Idli (2 pcs)');
INSERT INTO menu_items (name, description, price_paise, image_url, prep_minutes)
SELECT 'Veg Fried Rice', 'Vegetable fried rice', 8000, '', 12
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Veg Fried Rice');
INSERT INTO menu_items (name, description, price_paise, image_url, prep_minutes)
SELECT 'Tea', 'Hot milk tea', 1500, '', 3
WHERE NOT EXISTS (SELECT 1 FROM menu_items WHERE name = 'Tea');
