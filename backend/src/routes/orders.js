import { Router } from 'express';
import crypto from 'node:crypto';
import Razorpay from 'razorpay';
import QRCode from 'qrcode';
import { pool } from '../db.js';
import { requireAuth } from '../middleware/auth.js';
import { estimateWaitMinutes } from '../utils/waitTime.js';

const router = Router();

function razorpayClient() {
  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) return null;
  return new Razorpay({ key_id: process.env.RAZORPAY_KEY_ID, key_secret: process.env.RAZORPAY_KEY_SECRET });
}

router.post('/', requireAuth, async (req, res) => {
  const cart = req.body.items;
  const method = req.body.payment_method;
  if (!Array.isArray(cart) || cart.length < 1 || cart.length > 30) {
    return res.status(400).json({ error: 'Cart must contain between 1 and 30 items.' });
  }
  if (!['cash', 'razorpay'].includes(method)) {
    return res.status(400).json({ error: 'Choose cash or online payment.' });
  }
  if (method === 'razorpay' && !razorpayClient()) {
    return res.status(503).json({ error: 'Online payments are not configured. Add Razorpay test keys to backend/.env.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const normalized = [];
    for (const item of cart) {
      const id = Number(item.id);
      const quantity = Number(item.quantity);
      if (!Number.isInteger(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > 20) {
        throw Object.assign(new Error('Invalid cart item or quantity.'), { status: 400 });
      }
      const [rows] = await connection.query(
        'SELECT id,name,price_paise,prep_minutes FROM menu_items WHERE id = ? AND available = TRUE FOR UPDATE',
        [id]
      );
      if (!rows.length) throw Object.assign(new Error('One or more items are no longer available.'), { status: 400 });
      normalized.push({ ...rows[0], quantity });
    }
    const total = normalized.reduce((sum, item) => sum + item.price_paise * item.quantity, 0);
    const wait = await estimateWaitMinutes(connection);
    const orderNumber = `SC${Date.now().toString().slice(-8)}${crypto.randomInt(100, 999)}`;
    const pickupToken = crypto.randomBytes(32).toString('hex');

    const [result] = await connection.query(
      `INSERT INTO orders (order_number,user_id,total_paise,payment_method,payment_status,order_status,pickup_token,estimated_minutes)
       VALUES (?,?,?,?,?,'Pending',?,?)`,
      [orderNumber, req.user.id, total, method, 'pending', pickupToken, wait]
    );
    for (const item of normalized) {
      await connection.query(
        'INSERT INTO order_items (order_id,menu_item_id,item_name,unit_price_paise,quantity,prep_minutes) VALUES (?,?,?,?,?,?)',
        [result.insertId, item.id, item.name, item.price_paise, item.quantity, item.prep_minutes]
      );
    }

    let razorpayOrder = null;
    if (method === 'razorpay') {
      try {
        razorpayOrder = await razorpayClient().orders.create({
          amount: total,
          currency: 'INR',
          receipt: orderNumber,
          notes: { app_order_id: String(result.insertId), order_number: orderNumber }
        });
        await connection.query('UPDATE orders SET razorpay_order_id = ? WHERE id = ?', [razorpayOrder.id, result.insertId]);
      } catch (paymentError) {
        await connection.rollback();
        return res.status(502).json({ error: 'Could not create online payment order. Please try again.' });
      }
    }
    await connection.commit();
    const qrDataUrl = await QRCode.toDataURL(pickupToken, { width: 240, margin: 2 });
    res.status(201).json({
      order: {
        id: result.insertId, order_number: orderNumber, total_paise: total,
        payment_method: method, payment_status: 'pending', order_status: 'Pending',
        estimated_minutes: wait, qr_data_url: qrDataUrl, pickup_token: pickupToken
      },
      razorpay: razorpayOrder ? { order_id: razorpayOrder.id, amount: total, currency: 'INR', key_id: process.env.RAZORPAY_KEY_ID } : null
    });
  } catch (e) {
    await connection.rollback();
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'Could not place order.' });
  } finally {
    connection.release();
  }
});

router.post('/verify-payment', requireAuth, async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, app_order_id } = req.body;
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !app_order_id) {
    return res.status(400).json({ error: 'Missing payment verification fields.' });
  }
  try {
    const [orders] = await pool.query(
      'SELECT id,razorpay_order_id FROM orders WHERE id = ? AND user_id = ? AND payment_method = ?',
      [app_order_id, req.user.id, 'razorpay']
    );
    if (!orders.length || orders[0].razorpay_order_id !== razorpay_order_id) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    const expected = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET || '')
      .update(`${razorpay_order_id}|${razorpay_payment_id}`).digest('hex');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(razorpay_signature));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      await pool.query("UPDATE orders SET payment_status='failed' WHERE id = ?", [app_order_id]);
      return res.status(400).json({ error: 'Payment signature verification failed.' });
    }
    await pool.query(
      "UPDATE orders SET payment_status='paid', razorpay_payment_id=? WHERE id=?",
      [razorpay_payment_id, app_order_id]
    );
    res.json({ message: 'Payment verified.', payment_status: 'paid' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Payment verification failed.' });
  }
});

router.get('/mine', requireAuth, async (req, res) => {
  try {
    const [orders] = await pool.query(
      `SELECT id,order_number,total_paise,payment_method,payment_status,order_status,estimated_minutes,created_at
       FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 50`, [req.user.id]
    );
    for (const order of orders) {
      const [items] = await pool.query(
        'SELECT item_name,unit_price_paise,quantity FROM order_items WHERE order_id = ?', [order.id]
      );
      order.items = items;
      const [tokenRows] = await pool.query(
        'SELECT pickup_token FROM orders WHERE id = ?', [order.id]
      );
      order.qr_data_url = await QRCode.toDataURL(tokenRows[0].pickup_token, { width: 180, margin: 1 });
    }
    res.json(orders);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load your orders.' });
  }
});

router.get('/wait-time', requireAuth, async (_req, res) => {
  try {
    res.json({ estimated_minutes: await estimateWaitMinutes() });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not estimate waiting time.' });
  }
});

export default router;
