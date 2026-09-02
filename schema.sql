-- 好物商城 demo store — D1 (SQLite) schema + seed data
-- Run locally:  npx wrangler d1 execute haowu_mall --local --file=schema.sql
-- Run in prod:  npx wrangler d1 execute haowu_mall --remote --file=schema.sql

DROP TABLE IF EXISTS admin_actions;
DROP TABLE IF EXISTS order_events;
DROP TABLE IF EXISTS order_items;
DROP TABLE IF EXISTS orders;
DROP TABLE IF EXISTS product_variants;
DROP TABLE IF EXISTS reviews;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS customers;

CREATE TABLE products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT UNIQUE NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  collection TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  compare_at_price_cents INTEGER,
  image_seed TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE product_variants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  option_name TEXT NOT NULL,
  value TEXT NOT NULL,
  inventory INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id),
  author_name TEXT NOT NULL,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT UNIQUE NOT NULL,
  customer_id INTEGER REFERENCES customers(id),
  customer_name TEXT NOT NULL,
  customer_email TEXT NOT NULL,
  shipping_address TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  subtotal_cents INTEGER NOT NULL,
  shipping_cents INTEGER NOT NULL DEFAULT 0,
  tax_cents INTEGER NOT NULL DEFAULT 0,
  total_cents INTEGER NOT NULL,
  payment_card_brand TEXT,
  payment_card_last4 TEXT,
  tracking_number TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  product_id INTEGER NOT NULL,
  variant_id INTEGER,
  title TEXT NOT NULL,
  variant_label TEXT,
  price_cents INTEGER NOT NULL,
  quantity INTEGER NOT NULL
);

CREATE TABLE order_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id),
  status TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 後台操作紀錄：目前後台只有單一管理員密碼、沒有多使用者身分，
-- 所以這裡記的是「發生了什麼操作」而非「誰做的」，作為操作留痕的展示。
CREATE TABLE admin_actions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ---------- seed data ----------
-- price_cents 以「分」為單位儲存 NT$（例如 NT$680 存為 68000），
-- 前端 formatPrice() 一律以 zh-TW / TWD、不顯示小數的方式呈現。

INSERT INTO products (slug, title, description, collection, price_cents, compare_at_price_cents, image_seed) VALUES
-- 生活居家
('ceramic-vase', '手拉坏陶瓷花瓶', '職人手工拉坏、上釉燒製，每一件的紋理都略有不同，擺在玄關或餐桌都好看。', '生活居家', 68000, NULL, 'arden-vase'),
('linen-throw', '水洗亞麻蓋毯', '歐洲進口水洗亞麻，垂墜感佳、透氣不悶熱，沙發、床尾都好搭。', '生活居家', 98000, 118000, 'arden-linen'),
('woven-basket', '手工編織收納籃', '海草編織、堅固耐用，收納衣物、玩具都適合，天然質感提升居家氛圍。', '生活居家', 52000, NULL, 'arden-basket'),
('stoneware-set', '陶製餐盤四件組', '反應釉燒製，每組花色獨一無二，可微波、可用洗碗機清洗，四人份剛剛好。', '生活居家', 168000, NULL, 'arden-stoneware'),
('soy-candle', '大豆蠟香氛蠟燭', '手工冷倒大豆蠟，燃燒時間長達 45 小時，無合成色素、煙霧少。', '生活居家', 39000, NULL, 'arden-candle'),
('wool-rug', '手工羊毛地毯', '紐西蘭進口羊毛，厚實蓬鬆，客廳臥室鋪上立刻升級質感。', '生活居家', 298000, 358000, 'arden-rug'),
('oak-board', '橡木餐盤砧板', '整塊實心橡木、天然木油處理，招待起司拼盤或麵包都很適合。', '生活居家', 58000, NULL, 'arden-board'),
('mug-set', '陶瓷馬克杯四件組', '手工上釉、握把厚度舒適，四個顏色略有差異，每一杯都獨一無二。', '生活居家', 45000, NULL, 'arden-mugs'),
('table-runner', '棉質桌旗', '厚磅純棉織造，滾邊流蘇設計，洗滌後質地會越來越柔軟。', '生活居家', 38000, NULL, 'arden-runner'),
('pendant-lamp', '藤編吊燈罩', '手工藤編燈罩，點亮後光影溫暖柔和，附標準燈座接頭，安裝簡單。', '生活居家', 138000, NULL, 'arden-lamp'),
-- 3C家電
('earbuds', '真無線藍牙耳機', '主動降噪、單次續航 6 小時，配充電盒可延長至 24 小時，IPX5 防潑水。', '3C家電', 129000, 159000, 'gadget-earbuds'),
('powerbank', '10000mAh 快充行動電源', '支援 PD/QC 雙向快充，體積輕巧可放口袋，安全過流過壓保護。', '3C家電', 69000, NULL, 'gadget-powerbank'),
('smartband', '智慧手環', '心率血氧監測、多種運動模式、防水設計，續航長達 10 天。', '3C家電', 159000, NULL, 'gadget-smartband'),
('mini-fan', 'USB隨身小風扇', '三段風速、靜音馬達，辦公室、戶外都好攜帶，內建 2000mAh 電池。', '3C家電', 39900, NULL, 'gadget-fan'),
-- 美妝保養
('serum', '玻尿酸保濕精華液', '三重分子玻尿酸深層保濕，質地清爽好吸收，敏感肌也適用。', '美妝保養', 89000, NULL, 'beauty-serum'),
('cleanser', '胺基酸洗面乳', '溫和胺基酸潔淨配方，洗後不緊繃，適合日常卸妝後二次清潔。', '美妝保養', 45000, NULL, 'beauty-cleanser'),
('sunscreen', '防曬乳 SPF50+ PA++++', '清爽不泛白、抗汗抗水配方，日常通勤或戶外活動都適合。', '美妝保養', 58000, NULL, 'beauty-sunscreen'),
('shampoo-set', '護色洗髮精組', '胺基酸洗劑溫和潔淨，染燙後護色配方，洗後髮絲柔順好梳理。', '美妝保養', 78000, 98000, 'beauty-shampoo'),
-- 時尚服飾
('tshirt', '純棉圓領短袖上衣', '100% 精梳棉，版型微寬鬆好穿搭，日常休閒必備基本款。', '時尚服飾', 49000, NULL, 'fashion-tee'),
('jeans', '高腰直筒牛仔褲', '彈性丹寧布料，修飾腿型不緊繃，百搭經典水洗色。', '時尚服飾', 128000, NULL, 'fashion-jeans'),
('cardigan', '針織開襟外套', '柔軟針織布料，春秋單穿或疊搭都合適，五顆鈕扣設計。', '時尚服飾', 98000, NULL, 'fashion-cardigan'),
('totebag', '帆布托特包', '厚磅帆布材質耐用好清潔，內附拉鍊夾層，通勤上課都好用。', '時尚服飾', 45000, NULL, 'fashion-totebag'),
-- 食品雜貨
('oolong-tea', '台灣高山烏龍茶葉', '海拔 1200 公尺高山茶區採收，香氣清雅回甘，罐裝真空保鮮。', '食品雜貨', 58000, 68000, 'grocery-tea'),
('mixed-nuts', '精選綜合堅果禮盒', '無調味原味烘焙，杏仁、腰果、核桃、蔓越莓綜合裝，送禮自用兩相宜。', '食品雜貨', 69000, NULL, 'grocery-nuts'),
('olive-oil', '義大利原裝進口橄欖油', '特級初榨冷壓萃取，果香濃郁，涼拌熱炒皆宜。', '食品雜貨', 45000, NULL, 'grocery-oliveoil'),
('chicken-breast', '即食雞胸肉調理包（5入）', '低溫舒肥烹調、高蛋白低脂，加熱即食，健身備餐首選。', '食品雜貨', 39900, NULL, 'grocery-chicken');

INSERT INTO product_variants (product_id, option_name, value, inventory) VALUES
(1, '顏色', '沙色', 14), (1, '顏色', '炭灰', 9), (1, '顏色', '赤陶', 0),
(2, '顏色', '原色', 20), (2, '顏色', '炭灰', 11),
(3, '尺寸', '小', 25), (3, '尺寸', '大', 6),
(4, '顏色', '奶油色', 8),
(5, '香氛', '雪松', 30), (5, '香氛', '檀香', 22), (5, '香氛', '琥珀', 17),
(6, '尺寸', '5x8尺', 5), (6, '尺寸', '8x10尺', 2),
(7, '尺寸', '標準', 18),
(8, '顏色', '沙色', 12),
(9, '顏色', '原色', 16), (9, '顏色', '炭灰', 13),
(10, '尺寸', '標準', 7),
(11, '顏色', '黑色', 40), (11, '顏色', '白色', 25), (11, '顏色', '藍色', 0),
(12, '顏色', '黑色', 60),
(13, '顏色', '黑色', 18), (13, '顏色', '粉色', 22),
(14, '顏色', '白色', 33),
(15, '容量', '30ml', 28),
(16, '容量', '150ml', 45),
(17, '容量', '50ml', 20),
(18, '容量', '400ml', 16), (18, '容量', '700ml', 9),
(19, '尺寸', 'S', 20), (19, '尺寸', 'M', 24), (19, '尺寸', 'L', 15), (19, '尺寸', 'XL', 3),
(20, '尺寸', '26', 10), (20, '尺寸', '27', 14), (20, '尺寸', '28', 12), (20, '尺寸', '29', 0),
(21, '顏色', '米白', 11), (21, '顏色', '深藍', 9), (21, '顏色', '卡其', 6),
(22, '顏色', '本色', 30),
(23, '規格', '150g', 24),
(24, '規格', '400g', 19),
(25, '規格', '500ml', 27),
(26, '規格', '5入裝', 40);

-- 評價（含新舊商品，作者名稱與內容皆為中文）
INSERT INTO reviews (product_id, author_name, rating, comment, created_at) VALUES
(1, '陳威廷', 5, '釉色本人比照片更好看，放在玄關櫃上質感十足。', datetime('now', '-21 days')),
(1, '林于庭', 4, '尺寸比想像中小一點，但整體很喜歡。', datetime('now', '-9 days')),
(1, '陳佳穎', 5, '買來當喬遷禮物，自己也手滑再下單一個。', datetime('now', '-2 days')),
(2, '韓小晴', 5, '洗過一次之後更軟，質感很好。', datetime('now', '-30 days')),
(2, '游丹尼', 4, '春天蓋剛剛好，亞麻材質容易皺是正常的。', datetime('now', '-14 days')),
(3, '游宇辰', 5, '比想像中堅固，拿來裝小孩玩具剛剛好。', datetime('now', '-18 days')),
(3, '賴宜臻', 4, '編織很細緻，剛拆封有一點點掉屑，用幾天就沒了。', datetime('now', '-6 days')),
(4, '彭立德', 5, '反應釉每個花色都不一樣，很有質感。', datetime('now', '-25 days')),
(4, '蘇菲', 5, '用了一個月天天洗碗機洗都沒問題。', datetime('now', '-4 days')),
(5, '任先生', 4, '燃燒很平均，雪松味道淡雅不刺鼻。', datetime('now', '-11 days')),
(5, '張怡文', 5, '目前最喜歡的味道，準備回購檀香。', datetime('now', '-3 days')),
(6, '湯瑪士', 5, '又厚又蓬鬆，客廳整個氛圍都不一樣了。', datetime('now', '-27 days')),
(6, '米雪兒', 3, '很漂亮但前兩週掉毛比預期多一些。', datetime('now', '-8 days')),
(7, '凱文', 5, '實心橡木沒有廉價塗料味，招待朋友很好用。', datetime('now', '-16 days')),
(8, '安娜', 4, '握把很舒服，杯子比標準款略小一點。', datetime('now', '-13 days')),
(8, '喬許', 5, '每個杯子花紋都不同，很有手作感。', datetime('now', '-5 days')),
(9, '陳可樂', 4, '洗了三次流蘇還很完整，顏色稍微變淡。', datetime('now', '-19 days')),
(10, '卡特', 5, '點亮後光影效果跟照片一樣好看，安裝很簡單。', datetime('now', '-7 days')),
(11, '王柏翰', 5, '降噪效果比同價位其他款都好，通勤必備。', datetime('now', '-6 days')),
(11, '李佳玲', 4, '音質不錯，戴久耳朵會有點悶。', datetime('now', '-2 days')),
(12, '許家豪', 5, '充電速度真的快，出門帶著很安心。', datetime('now', '-10 days')),
(13, '周奕安', 4, '心率量測準確，續航力比預期久。', datetime('now', '-4 days')),
(14, '吳品萱', 5, '風力夠強又不會太吵，辦公室必備小物。', datetime('now', '-8 days')),
(15, '黃思婷', 5, '吸收很快不黏膩，用了兩週感覺膚況變好。', datetime('now', '-5 days')),
(16, '鄭雅文', 4, '洗完不緊繃，卸妝後第二次清潔剛好。', datetime('now', '-9 days')),
(17, '謝明軒', 5, '完全不泛白，夏天騎車通勤很需要。', datetime('now', '-3 days')),
(18, '劉子涵', 4, '護色效果不錯，味道也很好聞。', datetime('now', '-12 days')),
(19, '方廷睿', 5, '版型很好穿，材質透氣厚薄適中。', datetime('now', '-6 days')),
(20, '陳柏諺', 4, '彈性很夠，久坐也不會太緊。', datetime('now', '-11 days')),
(21, '林采蓉', 5, '針織質感很好，疊搭春秋外套很好看。', datetime('now', '-7 days')),
(22, '曾詩涵', 5, '帆布很厚實，裝筆電也不擔心壞掉。', datetime('now', '-4 days')),
(23, '賴俊傑', 5, '回甘很明顯，是喜歡的高山茶香氣。', datetime('now', '-14 days')),
(24, '洪雅慧', 4, '堅果新鮮無油耗味，送禮很體面。', datetime('now', '-8 days')),
(25, '許芳瑜', 5, '拌沙拉果香很明顯，會回購。', datetime('now', '-6 days')),
(26, '蔡承恩', 5, '健身備餐很方便，口感也不會太柴。', datetime('now', '-3 days'));

-- 一組 demo 會員帳號，方便直接體驗登入流程。密碼：demo1234
INSERT INTO customers (name, email, password_hash, password_salt) VALUES
('示範會員', 'demo@example.com', '8e00d362e5ee45a75d57a19e3abd21d54c00c4c6339e0c0f5cd034d20f607722', 'a59e92cab0785ae8a0fc54c0cd5d3aea');

-- 訂單種子資料：demo 會員帳號涵蓋四種狀態（已下單／已付款／已出貨／已取消），
-- 讓「我的訂單」與後台「訂單管理」一開始就有真實資料可看，而不是空畫面。
-- 另外補兩筆訪客訂單，讓後台清單更貼近多客戶下單的真實情境。
INSERT INTO orders (order_number, customer_id, customer_name, customer_email, shipping_address, status, subtotal_cents, shipping_cents, tax_cents, total_cents, payment_card_brand, payment_card_last4, tracking_number, created_at) VALUES
('HW9K2F7QXA', 1, '示範會員', 'demo@example.com', '台北市信義區松仁路100號8樓', 'fulfilled', 197000, 0, 0, 197000, 'Visa', '4242', 'HCT8X2QZK1A9', '2026-08-21 10:12:00'),
('HW9K5R3PLM', 1, '示範會員', 'demo@example.com', '台北市信義區松仁路100號8樓', 'paid', 178000, 0, 0, 178000, 'Visa', '4242', NULL, '2026-08-28 15:40:00'),
('HW9KAX1WZ2', 1, '示範會員', 'demo@example.com', '台北市信義區松仁路100號8樓', 'pending', 49000, 8000, 0, 57000, 'JCB', '9981', NULL, '2026-09-01 09:05:00'),
('HW9J8Q4NRT', 1, '示範會員', 'demo@example.com', '台北市信義區松仁路100號8樓', 'cancelled', 52000, 8000, 0, 60000, 'Visa', '4242', NULL, '2026-08-13 18:22:00'),
('HW9K7M2VDQ', NULL, '王小明', 'wang.demo@example.com', '新北市板橋區文化路二段18號', 'fulfilled', 183000, 0, 0, 183000, 'MasterCard', '5588', 'HCT4M8P2VXQ7', '2026-08-27 11:00:00'),
('HW9KC1YB6X', NULL, '陳雅婷', 'chen.demo@example.com', '台中市西屯區台灣大道三段99號', 'paid', 98000, 8000, 0, 106000, 'Visa', '1024', NULL, '2026-08-31 20:10:00');

INSERT INTO order_items (order_id, product_id, variant_id, title, variant_label, price_cents, quantity) VALUES
(1, 11, 20, '真無線藍牙耳機', '白色', 129000, 1),
(1, 1, 1, '手拉坏陶瓷花瓶', '沙色', 68000, 1),
(2, 15, 26, '玻尿酸保濕精華液', '30ml', 89000, 2),
(3, 19, 32, '純棉圓領短袖上衣', 'M', 49000, 1),
(4, 3, 6, '手工編織收納籃', '小', 52000, 1),
(5, 24, 44, '精選綜合堅果禮盒', '400g', 69000, 2),
(5, 25, 45, '義大利原裝進口橄欖油', '500ml', 45000, 1),
(6, 21, 40, '針織開襟外套', '深藍', 98000, 1);

INSERT INTO order_events (order_id, status, note, created_at) VALUES
(1, 'pending', NULL, '2026-08-21 10:12:00'),
(1, 'paid', '已確認付款', '2026-08-21 11:05:00'),
(1, 'fulfilled', '商品已出貨，物流追蹤碼 HCT8X2QZK1A9', '2026-08-22 09:30:00'),
(2, 'pending', NULL, '2026-08-28 15:40:00'),
(2, 'paid', '已確認付款', '2026-08-28 16:02:00'),
(3, 'pending', NULL, '2026-09-01 09:05:00'),
(4, 'pending', NULL, '2026-08-13 18:22:00'),
(4, 'cancelled', '訂單已取消', '2026-08-13 20:47:00'),
(5, 'pending', NULL, '2026-08-27 11:00:00'),
(5, 'paid', '已確認付款', '2026-08-27 11:28:00'),
(5, 'fulfilled', '商品已出貨，物流追蹤碼 HCT4M8P2VXQ7', '2026-08-28 10:15:00'),
(6, 'pending', NULL, '2026-08-31 20:10:00'),
(6, 'paid', '已確認付款', '2026-08-31 20:33:00');
