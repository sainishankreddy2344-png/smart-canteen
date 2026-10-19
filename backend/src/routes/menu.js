import { Router } from 'express';
import { pool } from '../db.js';
import { requireAuth, requireAdmin } from '../middleware/auth.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id,name,description,price_paise,image_url,available,prep_minutes FROM menu_items WHERE available = TRUE ORDER BY name'
    );
    res.json(rows);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load menu.' });
  }
});

router.post('/', requireAuth, requireAdmin, async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const description = String(req.body.description || '').trim();
    const price = Number(req.body.price);
    const prep = Number(req.body.prep_minutes || 8);
    if (!name || !Number.isFinite(price) || price <= 0 || !Number.isInteger(prep) || prep < 1 || prep > 120) {
      return res.status(400).json({ error: 'Enter a name, positive price, and preparation time from 1 to 120 minutes.' });
    }
    const [result] = await pool.query(
      'INSERT INTO menu_items (name,description,price_paise,prep_minutes) VALUES (?,?,?,?)',
      [name, description, Math.round(price * 100), prep]
    );
    res.status(201).json({ id: result.insertId, message: 'Menu item added.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not add menu item.' });
  }
});

router.patch('/:id/availability', requireAuth, requireAdmin, async (req, res) => {
  const available = Boolean(req.body.available);
  try {
    await pool.query('UPDATE menu_items SET available = ? WHERE id = ?', [available, req.params.id]);
    res.json({ message: 'Availability updated.' });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not update availability.' });
  }
});

export default router;
