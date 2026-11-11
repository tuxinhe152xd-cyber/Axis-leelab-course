CREATE TABLE products(
  product_id TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  aliases    TEXT,
  unit       TEXT NOT NULL,
  price      INTEGER NOT NULL CHECK(price >= 0)
);
CREATE TABLE stock(
  product_id   TEXT PRIMARY KEY REFERENCES products(product_id),
  on_hand      INTEGER NOT NULL CHECK(on_hand >= 0),
  safety_stock INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL
);
CREATE TABLE orders(
  order_id   TEXT PRIMARY KEY,
  customer   TEXT NOT NULL,
  product_id TEXT NOT NULL REFERENCES products(product_id),
  quantity   INTEGER NOT NULL CHECK(quantity > 0),
  status     TEXT NOT NULL CHECK(status IN ('done','cancelled')),
  created_at TEXT NOT NULL
);
