PRAGMA foreign_keys=OFF;
BEGIN TRANSACTION;
CREATE TABLE addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      full_name TEXT,
      phone TEXT,
      line1 TEXT,
      line2 TEXT,
      landmark TEXT,
      city TEXT,
      state_code TEXT,
      postal_code TEXT,
      country TEXT DEFAULT 'IN',
      label TEXT,                 -- e.g. "Work", "Home"
      is_default INTEGER DEFAULT 0,
      last_used_at INTEGER,
      created_at INTEGER
    , pincode TEXT, state TEXT, last_used INTEGER DEFAULT 0);
INSERT INTO "addresses" VALUES(2,1,'Amit Gupta','09899107642','232 sfs flats phase - 4','ashok vihar','','North West Delhi','Delhi','110052','IN','',0,1756211585399,1756211552100,NULL,NULL,1756546131618);
INSERT INTO "addresses" VALUES(3,1,'Amit Gupta','09899107642','231 sfs flats phase - 4','ashok vihar','','North West Delhi','Delhi','110001','IN','',0,1756211588197,1756211575499,NULL,NULL,1756215199700);
INSERT INTO "addresses" VALUES(4,1,'Amit Gupta','09899107642','231 sfs flats phase - 4','ashok vihar','','North West Delhi',NULL,NULL,'IN',NULL,0,NULL,1756213553439,'110052','Delhi',1756546139841);
INSERT INTO "addresses" VALUES(5,5,'Amit Gupta','09899107642','231 sfs flats phase - 4','ashok vihar','','North West Delhi',NULL,NULL,'IN',NULL,0,NULL,1756223598842,'1100555','Delhi',1756224763456);
INSERT INTO "addresses" VALUES(6,5,'Amit Gupta','09899107642','231 sfs flats phase - 4','ashok vihar','','North West Delhi',NULL,NULL,'IN',NULL,0,NULL,1756224139780,'110034','Delhi',1756294509495);
CREATE TABLE banner_crops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      banner_id INTEGER NOT NULL,
      preset TEXT NOT NULL,            -- e.g. 'desktop1440','laptop1200','tablet1024','wide1920'
      focus_x REAL NOT NULL,           -- 0..100 (%)
      focus_y REAL NOT NULL,           -- 0..100 (%)
      width INTEGER NOT NULL,          -- target width (px)
      height INTEGER NOT NULL,         -- target height (px) — 320
      file TEXT NOT NULL,              -- generated cropped filename in /uploads
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (banner_id, preset)
    );
CREATE TABLE banner_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      auto_rotate INTEGER NOT NULL DEFAULT 1,
      interval_ms INTEGER NOT NULL DEFAULT 5000,
      transition TEXT NOT NULL DEFAULT 'fade',       -- 'fade' or 'slide'
      transition_ms INTEGER NOT NULL DEFAULT 400,
      show_arrows INTEGER NOT NULL DEFAULT 1,
      loop INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "banner_settings" VALUES(1,1,2500,'fade',400,0,0,'2025-08-30 15:12:03');
CREATE TABLE banners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
INSERT INTO "banners" VALUES(41,'1756566594077-1920_x_200.jpg','2025-08-30 15:09:54');
CREATE TABLE cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      product_id INTEGER,
      title TEXT,
      image TEXT,
      price_cents INTEGER NOT NULL DEFAULT 0,
      qty INTEGER NOT NULL DEFAULT 1,
      in_stock INTEGER NOT NULL DEFAULT 1,
      color TEXT,
      pattern TEXT,
      updated_at INTEGER
    );
INSERT INTO "cart_items" VALUES(17,5,NULL,'Kelenate® (30 Pcs) Safety Reflective Stickers, Warning Reflective Stickers Reflector Sticker Waterproof Reflective Tape Stickers for Vehicle,1.18 x 3.25 Inch Compatible with F0rt Fgo','https://m.media-amazon.com/images/I/71FEE3VQRrL._SY355_.jpg',28405,1,1,'','',1756224155314);
INSERT INTO "cart_items" VALUES(18,5,NULL,'Kelenate® (White Black) Car Side High Intensity Reflective Bumper Fender Safety Warning Sticker Night Visibility Compatible with Maruti Grand Vitara','https://m.media-amazon.com/images/I/71T9gfQrz3L._SX450_.jpg',19900,1,1,'','',1756224160506);
CREATE TABLE home_categories (
  name TEXT PRIMARY KEY
);
CREATE TABLE home_sections (
      key TEXT PRIMARY KEY,        -- keep | pick | freq
      title TEXT NOT NULL,         -- display title
      category TEXT DEFAULT ''     -- chosen main category name
    );
INSERT INTO "home_sections" VALUES('keep','Keep shopping for','');
INSERT INTO "home_sections" VALUES('pick','Pick up where you left off','');
INSERT INTO "home_sections" VALUES('freq','Frequently reordered items for you','');
CREATE TABLE home_sections_order (
      position INTEGER PRIMARY KEY,    -- 1-based index
      category TEXT NOT NULL
    );
INSERT INTO "home_sections_order" VALUES(1,'Habit Tracker');
INSERT INTO "home_sections_order" VALUES(2,'Dot Stickers');
INSERT INTO "home_sections_order" VALUES(3,'Car Door Shock Absorber');
INSERT INTO "home_sections_order" VALUES(4,'car holder');
INSERT INTO "home_sections_order" VALUES(5,'car bulb');
INSERT INTO "home_sections_order" VALUES(6,'Buylogy Brand');
INSERT INTO "home_sections_order" VALUES(7,'Stickers');
CREATE TABLE main_categories (
  name TEXT PRIMARY KEY
);
INSERT INTO "main_categories" VALUES('Car Door Shock Absorber');
INSERT INTO "main_categories" VALUES('Habit Tracker');
INSERT INTO "main_categories" VALUES('Dot Stickers');
INSERT INTO "main_categories" VALUES('Buylogy Brand');
INSERT INTO "main_categories" VALUES('Stickers');
CREATE TABLE product_home_categories (
  product_id TEXT NOT NULL,
  name TEXT NOT NULL,
  PRIMARY KEY (product_id, name),
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY(name) REFERENCES home_categories(name) ON DELETE CASCADE
);
INSERT INTO "product_home_categories" VALUES('a8mu0mh9mdGY','Keep shopping for');
INSERT INTO "product_home_categories" VALUES('a8mu0mh9mdGY','Pick up where you left off');
INSERT INTO "product_home_categories" VALUES('a8mu0mh9mdGY','Frequently reordered items for you');
CREATE TABLE product_images (
  product_id TEXT NOT NULL,
  image TEXT NOT NULL,
  FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE
);
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687440-Q3z-6W.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687474-pbAfp0.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687490-Lq29ea.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687504-YWqHC0.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687514-1ZLpJU.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687526-gkgiSw.jpg');
INSERT INTO "product_images" VALUES('a8mu0mh9mdGY','/uploads/1755941687542-D-wTcQ.jpg');
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  price REAL DEFAULT 0,
  sku TEXT,
  description TEXT,
  mainCategory TEXT,
  image TEXT,
  amazonUrl TEXT,
  createdAt INTEGER
, category TEXT, bullets TEXT, images TEXT, videos TEXT, status TEXT DEFAULT 'active', mrp REAL, moq INTEGER DEFAULT 1, created_at TEXT, updated_at TEXT, is_deleted INTEGER DEFAULT 0, deleted_at TEXT);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Baked with Love) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQ6LPT5','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/5d6ec6cf7297e8cd.jpg","/uploads/961539b475b2f8c6.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:21','2025-09-02 06:27:21',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Baked with Love Chef) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQCPWGZ','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/a25af3f24ab6574d.jpg","/uploads/3036ab29b1e4c575.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:26','2025-09-02 06:27:26',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Baked with Love Chef Hat) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQB14CH','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/30052dc4d482fd14.jpg","/uploads/6fb96443d7cd925f.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:32','2025-09-02 06:27:32',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Handmade) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQ7DHT9','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/a63e6b1c20d5e96a.jpg","/uploads/04368ce907e7e28b.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:36','2025-09-02 06:27:36',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Made with Love) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',247.0,'B0CTQ1CZ4W','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/c61d33f946cca60d.jpg","/uploads/d8c4140a1eb52eb2.jpg"]','[]','active',247.0,1,'2025-09-02 06:27:40','2025-09-02 06:27:40',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Made with Love Heart) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',261.0,'B0CTQ3Z6K4','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/e37fc6ee330a2462.jpg","/uploads/5c0e4a97c78df949.jpg"]','[]','active',261.0,1,'2025-09-02 06:27:45','2025-09-02 06:27:45',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Speccially for You) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',261.0,'B0CTQ67B3V','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/5678238b1d7e454e.jpg","/uploads/18a72c613cd444ce.jpg"]','[]','active',261.0,1,'2025-09-02 06:27:49','2025-09-02 06:27:49',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Speccially for You Heart) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQF87YN','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/ee3fc6ca9457ff4c.jpg","/uploads/78f1906c07ad8015.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:53','2025-09-02 06:27:53',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Thanks You Doted) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQLBV6F','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/2e7a6102e895c53f.jpg","/uploads/57a56316788788c0.jpg"]','[]','active',199.0,1,'2025-09-02 06:27:57','2025-09-02 06:27:57',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Thanks You Flower) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQ87BKK','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/b6ff920bb5882ea7.jpg","/uploads/4ba0b761f4f12c53.jpg"]','[]','active',199.0,1,'2025-09-02 06:28:01','2025-09-02 06:28:01',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Thanks You Plain) Kraft, 80 Pieces, 2inches, Round, Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CTQB3XF7','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/ebf9e1fca53f4d64.jpg","/uploads/dd06f8bb7d49dedc.jpg"]','[]','active',199.0,1,'2025-09-02 06:28:05','2025-09-02 06:28:05',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Handmade with Love Stickers) Kraft, 80 Pieces, 2inches, Round, 5 Unique Designs, Self-Adhesive Stickers Labels Roll Decor Tags for Baking Packages, Homemade Gifts, Small Business Supplies',199.0,'B0CRVHCDGY','',NULL,NULL,NULL,NULL,'Dot Stickers','["[Handmade with Love Stickers] - Made of thicker premium kraft paper, thick and durable, not easy to break. The letters \"handmade with love\" in black font are marked on the craft paper stickers and features a striking red heart, with the adorable stickers to seal your handmade gift can express your bright wishes.","[Widely Uses] - The cute and lovely stickers can be used for decorating dessert package, homemade gifts, bakery boxes, home baker jams, cookie boxes, apple butter jars, envelope, diary, photo album, scrapbook, etc. This is a good gift for children, also suitable for school, shop, events using.","[Self-adhesive & Easy to Use] - These craft paper stickers are self-adhesive, just peel off the backing from the roll and stick onto any dry and smooth surface, and have no issues with curling at the edge or leaving any residue to your items.","[Suitable Occasions] - These stickers are romantic decoration for party, Christmas, Halloween, wedding ceremony, and other significant event. Also suitable for birthday, Mother''s Day, Father''s Day, Valentine''s Day, New born and other celebrations."]','["/uploads/477d0eb9e9450941.jpg","/uploads/996b97c402a51734.jpg"]','[]','active',199.0,1,'2025-09-02 06:28:09','2025-09-02 06:28:09',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate (Flower Theme Note) Self Adhesive Gift Tags Name Tags Stickers Wishes Note Stickers 80 Pieces 2inches Round 5 Unique Designs Made of Sticker Paper Stickers Party Favors Envelope',199.0,'B0CRVDZBPF','',NULL,NULL,NULL,NULL,'Dot Stickers','["🎉You will receive: 80 pcs 2 inch Theme Note Stickersin sufficient quantity to meet your needs at birthday parties and holiday celebration parties","🎉5 designs: The Theme Note StickersLabel comes in 6 unique designs, featuring lively and bright colors, making it perfect for expressing your love and blessings to boys and girls","🎉Writable blessings: The surface of the birthday gift sticker is made of semi glossy paper material. You can use a pen and marker to write down the names of yourself and your blessings in the blank space, passing on your love","🎉Best Gift Partner: Christmas Birthday Gift Label Sticker is your best choice for giving gifts. It is suitable for celebration venues such as birthday parties, themed parties, and holiday gatherings, and can be used to decorate gift boxes, gift bags, handicrafts, and candy bags"]','["/uploads/52a5052315086ba2.jpg","/uploads/f5a504b6988e961a.jpg"]','[]','active',399.0,1,'2025-09-02 06:28:14','2025-09-02 06:28:14',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Holi Stickers) Happy Holi Stickers, 80 Pieces, 2 inches, Round, 5 Unique Designs, Holi Gift Box Stickers, Festival Stickers, Holi Stickers, Holi Tags',199.0,'B0CVX68HLW','',NULL,NULL,NULL,NULL,'Dot Stickers','["PACKAGE CONTENT: It contains 80 stickers, 2 inches in diameter with 5 unique designs.","RICH DESIGNS: The sticker set has 5 different designs.","EASY TO PEEL AND STICK: The stickers are die-cut and are very easy to peel and stick on any smooth surface.","MATERIAL USED: High resolution, multicolored print on matte finish self-adhesive paper.","USAGE: Perfect to jazz up your party favors, gift wrapping, party decor, art and craft, making greeting cards, scrapbooking, to seal envelope and to practice gratitude."]','["/uploads/9fae4be7702dc336.jpg","/uploads/1523de7f6f370555.jpg"]','[]','active',399.0,1,'2025-09-02 06:28:18','2025-09-02 06:28:18',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Total 280 Pieces) 1-100 Number Stickers (200 Pcs), A-Z Alphabets Stickers (52 Pcs), Colour Dots (28 Pcs) Small Size Labels, 25 mm, Vinyl, Multicolour',199.0,'B0CV7BGLQH','',NULL,NULL,NULL,NULL,'Dot Stickers','["Size - 25 mm X 25 mm, Finish - Gloss, Material - Vinyl","Package Contents - 2 Sets of 1-100 Stickers , 2 Sets A-Z Alphabets Stickers , 2 set Colour Dots , Total Stickers - 240 Stickers","Easy Peel with Pop-up Edge offers Fast Peeling","Self Adhesive - Easily Remove & Place a Sticker on your Product","Made in India"]','["/uploads/88cbb2ced5220c29.jpg","/uploads/83a350bd20ba4bcf.jpg"]','[]','active',199.0,1,'2025-09-02 06:28:22','2025-09-02 06:28:22',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Happy Birthday) Gift Tags Name Tags Stickers, Wishes Note Stickers, 80 Pieces, 2inches, Round, 5 Unique Designs, Made of Sticker Paper, Stickers Party Favors Envelope Packages Seals',199.0,'B0CRV9M358','',NULL,NULL,NULL,NULL,'Dot Stickers','["🎉You will receive: 80 pcs 2 inch birthday stickers in sufficient quantity to meet your needs at birthday parties and holiday celebration parties","🎉5 designs: The Happy Birthday Gift Label comes in 6 unique designs, featuring lively and bright colors, as well as festive elements such as balloons, fireworks, candles, and birthday cakes, making it perfect for expressing your love and blessings to boys and girls","🎉Writable blessings: The surface of the birthday gift sticker is made of semi glossy paper material. You can use a pen and marker to write down the names of yourself and your blessings in the blank space, passing on your love","🎉Best Gift Partner: Christmas Birthday Gift Label Sticker is your best choice for giving gifts. It is suitable for celebration venues such as birthday parties, themed parties, and holiday gatherings, and can be used to decorate gift boxes, gift bags, handicrafts, and candy bags"]','["/uploads/74db3cfe6b5b2836.jpg","/uploads/d7990177c31955f2.jpg"]','[]','active',199.0,1,'2025-09-02 06:28:27','2025-09-02 06:28:27',0,NULL);
INSERT INTO "products" VALUES(NULL,'Kelenate® (Colour Background) 1.5 inch (36 mm) 192 pcs Thank You Stickers for Small Business, Self-Adhesive & Waterproof Stickers Thank You Stickers for Packaging',247.0,'B0CRV85XV4','',NULL,NULL,NULL,NULL,'Dot Stickers','["⭐ EXPRESS GRATITUDE: Perfect to place on retail bags, gift wrap and envelops as they send a powerful message of appreciation to your customers. Say thank you to your customers for choosing your business with these beautiful small business stickers","⭐ MULTI USE: Express your creativity and create an everlasting impression using these round sticker rolls. Add these thank you business stickers directly on the gift box, bags, boxes, tissue, or receipts to add a touch of appreciation","⭐EYE-CATCHING DESIGN: You receive 192 pieces (1.5 inch) thank you written on them .","⭐ EASY APPLICATION: Made with premium quality papqer,They are waterproof, tearproof, easy to peel and stick, and remove without leaving residue"]','["/uploads/6a179fd01c8eb98b.jpg","/uploads/819185caf54e17ab.jpg","/uploads/57e2c0e82b0249bc.jpg"]','[]','active',247.0,1,'2025-09-02 06:29:00','2025-09-02 06:29:00',0,NULL);
CREATE TABLE settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
INSERT INTO "settings" VALUES('header_logo','/uploads/1756131891305-Logo_Kelenate-1.png');
INSERT INTO "settings" VALUES('header_color','#F5F3EF');
INSERT INTO "settings" VALUES('nav_color','#ff9900');
INSERT INTO "settings" VALUES('header_text_color','#000000');
INSERT INTO "settings" VALUES('nav_text_color','#000000');
CREATE TABLE users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      firstName TEXT NOT NULL,
      lastName TEXT,
      email TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL,
      stateCode TEXT,            -- e.g. "DL"
      createdAt INTEGER
    , phone TEXT, last_address_id INTEGER);
INSERT INTO "users" VALUES(1,'Amit','Gupta','amit@gmail.com','$2b$12$UHH9jR1yV/sHo2f9gmjsoeWJ0tksh/PRb/Sfvf6aMUmwfQizc0eQ6','DL',1756122382532,NULL,3);
INSERT INTO "users" VALUES(2,'om','kumar','om@gmail.com','$2b$12$GY1WYOjZh3p0AYnb4pjsMOwe0BmKNVANwabriujIPf87/NRQz.vv2','DL',1756124445627,NULL,NULL);
INSERT INTO "users" VALUES(3,'om','kumar','om1@gmail.com','$2b$12$2s1UNgr..M2dDvuIj9zUhO05uziQ2cvHFpDNvHloQeqJwOXnObnq6','',1756124956624,NULL,NULL);
INSERT INTO "users" VALUES(4,'Amit','Gupta','amit2@gmail.com','$2b$12$ZwHEkPOh3F6v3AQHlGkKEuqtdXdTBMoL/JgOg3NTjbw1U8gczx8wG','',1756199414067,NULL,NULL);
INSERT INTO "users" VALUES(5,'preeti','gupta','preeti@gmail.com','$2b$12$rOFmU3WsCJfcFYQVATicC.nv671YRuOISiFclTSSn.b3OD5imjZ.2','',1756222752992,NULL,NULL);
CREATE UNIQUE INDEX idx_products_sku_unique ON products (sku);
CREATE UNIQUE INDEX idx_cart_unique
          ON cart_items(user_id, product_id, color, pattern);
CREATE INDEX idx_addr_user ON addresses(user_id);
CREATE INDEX idx_products_deleted ON products(is_deleted);
DELETE FROM "sqlite_sequence";
INSERT INTO "sqlite_sequence" VALUES('banners',41);
INSERT INTO "sqlite_sequence" VALUES('users',5);
INSERT INTO "sqlite_sequence" VALUES('cart_items',32);
INSERT INTO "sqlite_sequence" VALUES('addresses',6);
INSERT INTO "sqlite_sequence" VALUES('banner_crops',24);
COMMIT;