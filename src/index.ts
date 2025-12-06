import { Hono } from 'hono'
import { cors } from 'hono/cors'

// 1. 定義環境變數型別，這樣 TypeScript 才知道 c.env.DB 是什麼
type Bindings = {
	DB: D1Database
}

const app = new Hono<{ Bindings: Bindings }>()

// 啟用 CORS
app.use('/*', cors())

app.get('/', (c) => {
	return c.text('歡迎來到進銷存系統 API!')
})

// 取得所有員工列表
app.get('/api/employees', async (c) => {
	const result = await c.env.DB.prepare('SELECT * FROM employees ORDER BY id DESC').all()
	return c.json(result.results)
})

// 新增員工
app.post('/api/employees', async (c) => {
	const body = await c.req.json();
	const { name, role } = body;

	// const result = c.env.DB.prepare('SELECT * FROM employees WHERE employees.name = ?')
	// 	.bind(name)
	// 	.first();

	// if (result != null) {
	// 	return c.json({ error: "員工已存在" }, 400);
	// }
	try {
		await c.env.DB.prepare('INSERT INTO employees (name, role) VALUES (?, ?)')
			.bind(name, role || 'staff')
			.run();
		return c.json({ success: true, message: "員工新增成功" }, 200);
	} catch (e) {
		return c.json({ error: "資料庫錯誤" }, 500);
	}
});

// 更新員工
app.put('/api/employees/:id', async (c) => {
	try {
		const id = c.req.param('id')
		const { name, role } = await c.req.json()
		await c.env.DB.prepare('UPDATE employees SET name = ?, role = ? WHERE id = ?')
			.bind(name, role, id)
			.run()
		return c.json({ success: true, message: '員工資料更新成功' })
	} catch (e) {
		return c.json({ error: "資料庫錯誤" }, 500);
	}
})

// 修改原本的刪除 API -> 變成「軟刪除」
app.delete('/api/employees/:id', async (c) => {
	const id = c.req.param('id')

	// 不執行 DELETE，而是執行 UPDATE 把狀態改為 0 (離職)
	await c.env.DB.prepare('UPDATE employees SET is_active = 0 WHERE id = ?')
		.bind(id)
		.run()

	return c.json({ success: true, message: '員工已標記為離職' })
})

// 取得所有產品列表
app.get('/api/products', async (c) => {
	const result = await c.env.DB.prepare('SELECT * FROM products ORDER BY id DESC').all()
	return c.json(result.results)
})

// 新增產品 
app.post('/api/products', async (c) => {
	const { name, price, stock } = await c.req.json()
	await c.env.DB.prepare('INSERT INTO products (name, price, stock) VALUES (?, ?, ?)')
		.bind(name, price, stock)
		.run()
	return c.json({ success: true, message: '產品新增成功' })
})

// 修改產品 
app.put('/api/products/:id', async (c) => {
	const id = c.req.param('id')
	const { name, price, stock } = await c.req.json()
	try {
		await c.env.DB.prepare('UPDATE products SET name = ?, price = ?, stock = ? WHERE id = ?')
			.bind(name, price, stock, id)
			.run()
		return c.json({ success: true, message: '產品更新成功' })
	} catch (e) {
		return c.json({ error: "資料庫錯誤" }, 500);
	}
})

// 刪除產品
app.delete('/api/products/:id', async (c) => {
	const id = c.req.param('id')
	try {
		await c.env.DB.prepare('DELETE FROM products WHERE id = ?').bind(id).run()
		return c.json({ success: true, message: '產品已刪除' })
	} catch (e) {
		// 如果產品已經被賣過，因為 Foreign Key 限制，資料庫會阻止刪除
		return c.json({ error: '無法刪除：該產品已有銷售紀錄' }, 400)
	}
})


// 新增一筆銷售 
app.post('/api/sales', async (c) => {
	const body = await c.req.json()
	const { employee_id, product_id, quantity } = body

	// 1. 先查產品目前的庫存和價格
	const product = await c.env.DB.prepare('SELECT price, stock FROM products WHERE id = ?')
		.bind(product_id)
		.first() // .first() 只抓第一筆

	if (!product) {
		return c.json({ error: '找不到該產品' }, 404)
	}

	// 型別
	const p = product as { price: number; stock: number }

	// 2. 檢查庫存
	if (p.stock < quantity) {
		return c.json({ error: `庫存不足! 目前只剩 ${p.stock}` }, 400)
	}

	// 3. 計算總金額
	const totalPrice = p.price * quantity

	// 4. 執行交易
	try {
		// 步驟 A: 寫入銷售紀錄
		await c.env.DB.prepare(
			'INSERT INTO sales (employee_id, product_id, quantity, total_price) VALUES (?, ?, ?, ?)'
		).bind(employee_id, product_id, quantity, totalPrice).run()

		// 步驟 B: 扣除庫存
		await c.env.DB.prepare(
			'UPDATE products SET stock = stock - ? WHERE id = ?'
		).bind(quantity, product_id).run()

		return c.json({ success: true, message: '銷售成功', total_price: totalPrice })

	} catch (e) {
		return c.json({ error: '資料庫錯誤' }, 500)
	}
})

// 取得最近的銷售紀錄 
app.get('/api/sales', async (c) => {
	const sql = `
    SELECT 
      s.id, 
      s.quantity, 
      s.total_price, 
      s.status, 
      s.sale_at,
      e.name as employee_name, 
      p.name as product_name
    FROM sales s
    LEFT JOIN employees e ON s.employee_id = e.id
    LEFT JOIN products p ON s.product_id = p.id
    ORDER BY s.id DESC
    LIMIT 50
  `
	const result = await c.env.DB.prepare(sql).all()
	return c.json(result.results)
})

// 退銷 ：將狀態改為 refunded，並把庫存加回去
app.post('/api/sales/refund/:id', async (c) => {
	const saleId = c.req.param('id')

	// 1. 先查出這筆訂單賣了什麼、賣了幾個
	const sale = await c.env.DB.prepare('SELECT * FROM sales WHERE id = ?').bind(saleId).first()

	if (!sale) return c.json({ error: '找不到該筆銷售紀錄' }, 404)
	if (sale.status === 'refunded') return c.json({ error: '此訂單已退貨過' }, 400)

	// 2. 執行退貨 (標記狀態 + 加回庫存)
	// 這裡用 batch 確保兩件事同時成功
	await c.env.DB.batch([
		// A. 更新訂單狀態
		c.env.DB.prepare("UPDATE sales SET status = 'refunded' WHERE id = ?").bind(saleId),
		// B. 加回庫存 (stock = stock + quantity)
		c.env.DB.prepare("UPDATE products SET stock = stock + ? WHERE id = ?").bind(sale.quantity, sale.product_id)
	])

	return c.json({ success: true, message: '退銷成功，庫存已回補' })
})

// 1. 員工績效表 
app.get('/api/stats/employee-sales', async (c) => {
	const sql = `
    SELECT 
      e.name, 
      COUNT(s.id) as total_orders, 
      SUM(s.quantity) as total_items,
      SUM(s.total_price) as total_revenue,
      AVG(s.quantity) as avg_items  -- 新增這個：平均每次賣幾個
    FROM sales s
    JOIN employees e ON s.employee_id = e.id
    WHERE s.status = 'valid'
    GROUP BY e.name
    ORDER BY total_revenue DESC
  `
	const result = await c.env.DB.prepare(sql).all()
	return c.json(result.results)
})

// 2. 產品銷售表 (功能 4-2, 4-4)
app.get('/api/stats/product-sales', async (c) => {
	const sql = `
    SELECT 
      p.name, 
      SUM(s.quantity) as total_sold,
      SUM(s.total_price) as total_revenue,
      AVG(s.quantity) as avg_per_order
    FROM sales s
    JOIN products p ON s.product_id = p.id
    WHERE s.status = 'valid'
    GROUP BY p.name
    ORDER BY total_sold DESC
  `
	const result = await c.env.DB.prepare(sql).all()
	return c.json(result.results)
})

// 3. 必推銷品 Top 3 
app.get('/api/stats/top-products', async (c) => {
	const sql = `
    SELECT 
      p.name, 
      COALESCE(SUM(s.quantity), 0) as total_sold
    FROM products p
    LEFT JOIN sales s ON p.id = s.product_id AND s.status = 'valid'
    GROUP BY p.id
    ORDER BY total_sold ASC
    LIMIT 3
  `
	const result = await c.env.DB.prepare(sql).all()
	return c.json(result.results)
})

export default app