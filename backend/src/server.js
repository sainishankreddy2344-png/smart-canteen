import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bcrypt from 'bcryptjs';
import { pool } from './db.js';
import authRoutes from './routes/auth.js';
import menuRoutes from './routes/menu.js';
import orderRoutes from './routes/orders.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(helmet());
app.use(cors({
  origin: [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'https://smart-canteen-chmvsxlyv-sai-acaf.vercel.app'
  ]
}));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ status: 'ok', app: 'Smart Canteen API' }));
app.use('/api/auth', authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Unexpected server error.' });
});

async function bootstrap() {
  try {
    // Demo admin seed. Change these credentials before any shared/production use.
    const [admins] = await pool.query("SELECT id FROM users WHERE email='admin@canteen.local'");
    if (!admins.length) {
      const hash = await bcrypt.hash('Admin123!', 12);
      await pool.query(
        "INSERT INTO users (name,email,password_hash,role) VALUES (?,?,?,'admin')",
        ['Canteen Admin', 'admin@canteen.local', hash]
      );
      console.log('Demo admin created: admin@canteen.local / Admin123!');
    }
    const port = Number(process.env.PORT || 5000);
    app.listen(port, () => console.log(`Smart Canteen API running on http://localhost:${port}`));
  } catch (e) {
    console.error('Could not start API. Check MySQL and backend/.env.', e.message);
    process.exit(1);
  }
}
bootstrap();
