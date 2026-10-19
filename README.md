# Smart Canteen Pre-Order & Queue Management

Full-stack starter project: React + Vite, Node.js + Express, MySQL, QR pickup codes, wait-time estimation, cash payment, and Razorpay test-mode integration.

## Requirements
- Node.js 20+ and npm
- MySQL 8+
- Optional: Razorpay test account for online payment testing

## 1. Database setup
1. Open MySQL Workbench.
2. Open `database/schema.sql`.
3. Execute the whole file. It creates `smart_canteen` and sample menu items.

## 2. Backend setup
```bash
cd backend
npm install
```
Copy `.env.example` to `.env`, then set your MySQL username/password and (optionally) Razorpay test keys.

```bash
npm run dev
```
API runs at `http://localhost:5000`.

On first start, the API seeds a demo admin account if it does not exist:
- Email: `admin@canteen.local`
- Password: `Admin123!`
Change this password and use a private database before any real deployment.

## 3. Frontend setup
Open a second terminal:
```bash
cd frontend
npm install
npm run dev
```
Open the local URL printed by Vite, normally `http://localhost:5173`.

## Demo flow
1. Register a student account.
2. Browse the menu and add items to the cart.
3. Choose cash or Razorpay test payment.
4. Open My Orders to view order status, QR pickup code, and estimated wait.
5. Sign in as the demo admin to manage orders and menu items.
6. Admin can change status and mark an order completed; pickup code verification is available in the admin panel.

## Payment notes
- Cash orders are marked `pending` until collected/paid at the counter.
- Razorpay requires `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` in backend `.env`.
- Use Razorpay test mode keys and test cards only. Never expose the secret key in frontend code.
- This starter verifies Razorpay order signatures. For production, add verified webhooks, rate limiting, HTTPS, backups, robust audit logs, and rotate the demo admin credentials.

## Project structure
```text
smart-canteen/
├── database/schema.sql
├── backend/
│   ├── .env.example
│   ├── package.json
│   └── src/
│       ├── server.js
│       ├── db.js
│       ├── middleware/auth.js
│       ├── utils/waitTime.js
│       └── routes/
│           ├── auth.js
│           ├── menu.js
│           ├── orders.js
│           └── admin.js
└── frontend/
    ├── package.json
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        ├── api.js
        └── styles.css
```
