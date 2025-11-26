-- 初始化：如果表存在則刪除，方便你重新測試 (生產環境請小心使用)
DROP TABLE IF EXISTS sales;
DROP TABLE IF EXISTS products;
DROP TABLE IF EXISTS employees;

-- 1. 建立「員工」資料表 (Employees)
CREATE TABLE employees (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT DEFAULT 'staff', -- 預留欄位，分辨是店員還是店長
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 2. 建立「產品」資料表 (Products)
CREATE TABLE products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    price INTEGER NOT NULL DEFAULT 0, -- 建議存整數，若是台幣不需要小數點
    stock INTEGER NOT NULL DEFAULT 0, -- 庫存數量
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- 3. 建立「銷售紀錄」資料表 (Sales)
CREATE TABLE sales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    employee_id INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity INTEGER NOT NULL CHECK (quantity > 0), -- 限制數量必須大於 0
    total_price INTEGER NOT NULL, -- 記錄當下總金額 (單價 x 數量)，避免未來漲價影響歷史報表
    status TEXT DEFAULT 'valid', -- 'valid' 為正常銷售, 'refunded' 為已退銷
    sale_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employees(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
);

-- 為了查詢效能，加一點索引 (Optional but recommended)
CREATE INDEX idx_sales_employee ON sales(employee_id);
CREATE INDEX idx_sales_product ON sales(product_id);

-- ==========================================
-- 預先插入一些測試資料 (Seeding)
-- 這樣你一架設好，就有數據可以看到，不用手動建
-- ==========================================

-- 新增員工
INSERT INTO employees (name, role) VALUES ('尼格', 'Manager'), ('陳姿問', 'Staff'), ('奎桑提', 'Staff');

-- 新增產品 (假設是賣飲料或點心)
INSERT INTO products (name, price, stock) VALUES 
('珍珠奶茶', 50, 100),
('紅茶', 30, 200),
('雞排', 80, 50);

-- 新增一些銷售紀錄 (模擬李四賣了珍珠奶茶，王五賣了雞排)
INSERT INTO sales (employee_id, product_id, quantity, total_price) VALUES 
(2, 1, 2, 100), -- 李四賣出 2 杯珍奶 (50*2)
(2, 1, 1, 50),  -- 李四又賣出 1 杯珍奶
(3, 3, 1, 80);  -- 王五賣出 1 份雞排