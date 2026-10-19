import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';
import { estimateWaitMinutes } from '../utils/waitTime.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/orders', async (_req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT o.id,o.order_number,o.total_paise,o.payment_method,o.payment_status,o.order_status,
              o.estimated_minutes,o.pickup_token,o.created_at,u.name AS student_name,u.email
       FROM orders o JOIN users u ON u.id=o.user_id
       ORDER BY CASE o.order_status WHEN 'Pending' THEN 0 WHEN 'Preparing' THEN 1 WHEN 'Ready' THEN 2 ELSE 3 END,
       o.created_at ASC LIMIT 200`
    );
    for (const o of orders) {
      const [items] = await pool.query(
        'SELECT item_name,quantity FROM order_items WHERE order_id=?', [o.id]
      );
      o.items = items;
    }
    res.json({ orders, estimated_minutes: await estimateWaitMinutes() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load admin orders.' });
  }
});

router.patch('/orders/:id/status', async (req, res) => {
  const allowed = ['Pending','Preparing','Ready','Completed','Cancelled'];
  const status = String(req.body.status || '');
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid order status.' });
  try {
    const [result] = await pool.query('UPDATE orders SET order_status=? WHERE id=?', [status, req.params.id]);
    if (!result.affectedRows) return res.status(404).json({ error: 'Order not found.' });
    res.json({ message: 'Order status updated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update status.' });
  }
});

router.post('/verify-pickup', async (req, res) => {
  const token = String(req.body.pickup_token || '').trim();
  if (!/^[a-f0-9]{64}$/.test(token)) return res.status(400).json({ error: 'Invalid QR pickup token.' });
  try {
    const [rows] = await pool.query(
      'SELECT id,order_number,order_status,payment_method,payment_status FROM orders WHERE pickup_token=?', [token]
    );
    if (!rows.length) return res.status(404).json({ error: 'Pickup code not found.' });
    if (rows[0].order_status !== 'Ready') {
      return res.status(409).json({ error: `Order is ${rows[0].order_status}; pickup is allowed only when Ready.` });
    }
    if (rows[0].payment_method === 'cash' && rows[0].payment_status !== 'paid') {
      return res.status(409).json({ error: 'Collect cash and mark payment as paid before completing pickup.' });
    }
    await pool.query("UPDATE orders SET order_status='Completed' WHERE id=?", [rows[0].id]);
    res.json({ message: `Pickup verified for ${rows[0].order_number}.`, order_number: rows[0].order_number });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not verify pickup.' });
  }
});

router.patch('/orders/:id/payment', async (req, res) => {
  const status = String(req.body.payment_status || '');
  if (!['paid','failed','pending'].includes(status)) return res.status(400).json({ error: 'Invalid payment status.' });
  try {
    const [result] = await pool.query(
      'UPDATE orders SET payment_status=? WHERE id=? AND payment_method=?',
      [status, req.params.id, 'cash']
    );
    if (!result.affectedRows) return res.status(404).json({ error: 'Cash order not found.' });
    res.json({ message: 'Cash payment status updated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update payment status.' });
  }
});

export default router;
