import { pool } from '../db.js';

// Simple queue estimate: sum the preparation minutes of active orders,
// adjusted by historical average if there are enough completed orders.
// This is an estimate, not a guaranteed pickup time.
export async function estimateWaitMinutes(connection = pool) {
  const [active] = await connection.query(
    `SELECT COALESCE(SUM(oi.prep_minutes * oi.quantity), 0) AS prep_total
     FROM orders o JOIN order_items oi ON oi.order_id = o.id
     WHERE o.order_status IN ('Pending','Preparing')`
  );
  const [history] = await connection.query(
    `SELECT AVG(TIMESTAMPDIFF(MINUTE, created_at, updated_at)) AS avg_minutes
     FROM orders WHERE order_status = 'Completed'
     AND created_at >= NOW() - INTERVAL 7 DAY`
  );
  const queued = Number(active[0]?.prep_total || 0);
  const historical = Number(history[0]?.avg_minutes || 0);
  // Keep estimates practical for a pilot canteen; history contributes only when available.
  const estimate = historical > 0 ? Math.round(queued * 0.75 + historical * 0.25) : queued;
  return Math.max(3, Math.min(120, estimate));
}
