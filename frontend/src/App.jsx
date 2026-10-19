import React, { useEffect, useMemo, useState } from 'react';
import { api, clearSession, getUser, setSession } from './api.js';

const money = (paise) => `₹${(Number(paise || 0) / 100).toFixed(2)}`;
const statuses = ['Pending', 'Preparing', 'Ready', 'Completed', 'Cancelled'];

function loadRazorpay() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export default function App() {
  const [user, setUser] = useState(getUser());
  const [authMode, setAuthMode] = useState('login');
  const [auth, setAuth] = useState({ name: '', email: '', password: '' });
  const [menu, setMenu] = useState([]);
  const [cart, setCart] = useState([]);
  const [orders, setOrders] = useState([]);
  const [adminOrders, setAdminOrders] = useState([]);
  const [wait, setWait] = useState(null);
  const [payment, setPayment] = useState('cash');
  const [tab, setTab] = useState('menu');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [pickupToken, setPickupToken] = useState('');
  const [newItem, setNewItem] = useState({ name: '', description: '', price: '', prep_minutes: 8 });

  const cartTotal = useMemo(() => cart.reduce((sum, item) => sum + item.price_paise * item.quantity, 0), [cart]);

  async function refreshMenu() {
    try { setMenu(await api('/menu')); } catch (e) { setError(e.message); }
  }
  async function refreshOrders() {
    try {
      setOrders(await api('/orders/mine'));
      const w = await api('/orders/wait-time');
      setWait(w.estimated_minutes);
    } catch (e) { setError(e.message); }
  }
  async function refreshAdmin() {
    try {
      const data = await api('/admin/orders');
      setAdminOrders(data.orders);
      setWait(data.estimated_minutes);
    } catch (e) { setError(e.message); }
  }

  useEffect(() => { refreshMenu(); }, []);
  useEffect(() => {
    if (user) {
      refreshOrders();
      if (user.role === 'admin') refreshAdmin();
    }
  }, [user]);

  function flash(message) { setNotice(message); setError(''); }
  function fail(message) { setError(message); setNotice(''); }

  async function submitAuth(e) {
    e.preventDefault(); setBusy(true);
    try {
      const route = authMode === 'login' ? '/auth/login' : '/auth/register';
      const data = await api(route, { method: 'POST', body: JSON.stringify(auth) });
      if (authMode === 'register') {
        flash('Account created. Log in with your email and password.');
        setAuthMode('login');
      } else {
        setSession(data.token, data.user);
        setUser(data.user);
        flash(`Welcome, ${data.user.name}!`);
      }
    } catch (e) { fail(e.message); }
    finally { setBusy(false); }
  }

  function addToCart(item) {
    setCart(prev => {
      const found = prev.find(x => x.id === item.id);
      if (found) return prev.map(x => x.id === item.id ? { ...x, quantity: Math.min(20, x.quantity + 1) } : x);
      return [...prev, { ...item, quantity: 1 }];
    });
    flash(`${item.name} added to cart.`);
  }
  function changeQty(id, delta) {
    setCart(prev => prev.map(x => x.id === id ? { ...x, quantity: x.quantity + delta } : x).filter(x => x.quantity > 0));
  }

  async function checkout() {
    if (!user) return fail('Please log in before placing an order.');
    if (!cart.length) return fail('Your cart is empty.');
    setBusy(true);
    try {
      const data = await api('/orders', {
        method: 'POST',
        body: JSON.stringify({ payment_method: payment, items: cart.map(x => ({ id: x.id, quantity: x.quantity })) })
      });
      if (payment === 'razorpay') {
        const loaded = await loadRazorpay();
        if (!loaded) throw new Error('Could not load Razorpay Checkout. Check your internet connection.');
        const checkout = new window.Razorpay({
          key: data.razorpay.key_id,
          amount: data.razorpay.amount,
          currency: data.razorpay.currency,
          name: 'Smart Canteen',
          description: `Order ${data.order.order_number}`,
          order_id: data.razorpay.order_id,
          prefill: { name: user.name, email: user.email },
          theme: { color: '#176344' },
          handler: async (response) => {
            try {
              await api('/orders/verify-payment', {
                method: 'POST',
                body: JSON.stringify({
                  ...response,
                  app_order_id: data.order.id
                })
              });
              setPickupToken(data.order.pickup_token);
              setCart([]);
              flash('Payment verified and order placed!');
              setTab('orders');
              await refreshOrders();
            } catch (e) { fail(e.message); }
          },
          modal: { ondismiss: () => flash('Payment window closed. If you paid, check order status before retrying.') }
        });
        checkout.on('payment.failed', () => fail('Payment failed. Check your order and try again.'));
        checkout.open();
      } else {
        setPickupToken(data.order.pickup_token);
        setCart([]);
        flash('Order placed! Pay cash at the canteen counter.');
        setTab('orders');
        await refreshOrders();
      }
    } catch (e) { fail(e.message); }
    finally { setBusy(false); }
  }

  async function updateStatus(id, status) {
    try {
      await api(`/admin/orders/${id}/status`, { method: 'PATCH', body: JSON.stringify({ status }) });
      flash('Order status updated.');
      await refreshAdmin();
      await refreshOrders();
    } catch (e) { fail(e.message); }
  }
  async function updateCashPayment(id, status) {
    try {
      await api(`/admin/orders/${id}/payment`, { method: 'PATCH', body: JSON.stringify({ payment_status: status }) });
      flash('Payment status updated.');
      await refreshAdmin();
    } catch (e) { fail(e.message); }
  }
  async function addMenuItem(e) {
    e.preventDefault();
    try {
      await api('/menu', {
        method: 'POST',
        body: JSON.stringify({ ...newItem, price: Number(newItem.price), prep_minutes: Number(newItem.prep_minutes) })
      });
      setNewItem({ name: '', description: '', price: '', prep_minutes: 8 });
      await refreshMenu();
      flash('Menu item added.');
    } catch (e) { fail(e.message); }
  }
  async function toggleAvailability(item) {
    try {
      await api(`/menu/${item.id}/availability`, {
        method: 'PATCH', body: JSON.stringify({ available: !item.available })
      });
      await refreshMenu();
      flash('Menu availability updated.');
    } catch (e) { fail(e.message); }
  }
  async function verifyPickup(e) {
    e.preventDefault();
    try {
      const data = await api('/admin/verify-pickup', { method: 'POST', body: JSON.stringify({ pickup_token: pickupToken }) });
      flash(data.message);
      setPickupToken('');
      await refreshAdmin();
    } catch (e) { fail(e.message); }
  }

  function logout() {
    clearSession(); setUser(null); setOrders([]); setAdminOrders([]); setCart([]); setTab('menu');
    flash('Logged out.');
  }

  return <div className="app-shell">
    <header className="topbar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('menu'); }}>
        <span className="brand-mark">SC</span><span>Smart<span className="brand-light">Canteen</span><small>PRE-ORDER • PICK UP • ENJOY</small></span>
      </a>
      <nav>
        <button className={tab === 'menu' ? 'nav active' : 'nav'} onClick={() => setTab('menu')}>Menu</button>
        {user && <button className={tab === 'orders' ? 'nav active' : 'nav'} onClick={() => { setTab('orders'); refreshOrders(); }}>My orders</button>}
        {user?.role === 'admin' && <button className={tab === 'admin' ? 'nav active' : 'nav'} onClick={() => { setTab('admin'); refreshAdmin(); }}>Admin</button>}
      </nav>
      <div className="user-actions">
        {user ? <><span className="user-name">{user.name}</span><button className="button ghost small" onClick={logout}>Log out</button></> :
          <button className="button primary small" onClick={() => setTab('auth')}>Login / Register</button>}
      </div>
    </header>

    <main className="main">
      {notice && <div className="notice" role="status">{notice}<button onClick={() => setNotice('')}>×</button></div>}
      {error && <div className="error" role="alert">{error}<button onClick={() => setError('')}>×</button></div>}

      {tab === 'auth' && <section className="auth-card panel">
        <div className="eyebrow">YOUR CAMPUS, SIMPLIFIED</div>
        <h1>{authMode === 'login' ? 'Welcome back' : 'Create student account'}</h1>
        <p className="muted">Order ahead and spend your break enjoying it.</p>
        <form onSubmit={submitAuth} className="stack">
          {authMode === 'register' && <label>Full name<input required minLength="2" value={auth.name} onChange={e => setAuth({ ...auth, name: e.target.value })} /></label>}
          <label>Email<input type="email" required value={auth.email} onChange={e => setAuth({ ...auth, email: e.target.value })} /></label>
          <label>Password<input type="password" minLength="8" required value={auth.password} onChange={e => setAuth({ ...auth, password: e.target.value })} /></label>
          <button className="button primary" disabled={busy}>{busy ? 'Please wait…' : authMode === 'login' ? 'Log in' : 'Register'}</button>
        </form>
        <button className="link-button" onClick={() => setAuthMode(authMode === 'login' ? 'register' : 'login')}>
          {authMode === 'login' ? 'New student? Create an account' : 'Already registered? Log in'}
        </button>
      </section>}

      {tab === 'menu' && <>
        <section className="hero">
          <div className="hero-copy">
            <div className="eyebrow"><span className="live-dot"></span> YOUR CAMPUS CANTEEN, REIMAGINED</div>
            <h1>Good food.<br /><em>No long queues.</em></h1>
            <p>Order before your break, track preparation, and pick up when your order is ready.</p>
            <button className="button light" onClick={() => document.getElementById('food-menu')?.scrollIntoView({ behavior: 'smooth' })}>Explore menu <span>↓</span></button>
          </div>
          <div className="hero-art">
            <div className="plate"><span>🍛</span></div>
            <div className="floating-card"><span className="check">✓</span><span><b>Order ahead</b><small>More break. Less queue.</small></span></div>
            <div className="hero-stat"><b>{wait == null ? '—' : `${wait} min`}</b><small>Estimated queue</small></div>
          </div>
        </section>
        <section id="food-menu" className="section">
          <div className="section-heading"><div><div className="eyebrow">FRESH FROM THE COUNTER</div><h2>Campus favourites</h2></div><span className="muted">{menu.length} items available</span></div>
          <div className="menu-layout">
            <div className="food-grid">
              {menu.map((item, index) => <article className="food-card" key={item.id}>
               
<div className={`food-visual food-${index % 5}`}>
  <span>
    {(() => {
      const name = item.name.toLowerCase();

      if (name.includes('idli')) return '🍘';
      if (name.includes('dosa')) return '🥞';
      if (name.includes('tea')) return '☕';
      if (name.includes('fried rice')) return '🍚';
      if (name.includes('sandwich')) return '🥪';

      return '🍽️';
    })()}
  </span>
  <small>{item.prep_minutes} min prep</small>
</div>

                <div className="food-info"><h3>{item.name}</h3><p>{item.description || 'Made fresh at the campus canteen.'}</p>
                  <div className="food-bottom"><b>{money(item.price_paise)}</b><button className="add-button" onClick={() => addToCart(item)}>+ Add</button></div>
                </div>
              </article>)}
              {!menu.length && <div className="empty panel">Menu is loading, or no items are currently available.</div>}
            </div>
            <aside className="cart panel">
              <div className="cart-title"><h3>Your order</h3><span className="count">{cart.reduce((s, x) => s + x.quantity, 0)}</span></div>
              {!cart.length ? <div className="cart-empty"><span>🛍️</span><p>Your cart is waiting.</p><small>Add something tasty from the menu.</small></div> :
                <div className="cart-items">{cart.map(item => <div className="cart-row" key={item.id}>
                  <div><b>{item.name}</b><small>{money(item.price_paise)} each</small></div>
                  <div className="qty"><button onClick={() => changeQty(item.id, -1)} aria-label="Decrease quantity">−</button><span>{item.quantity}</span><button onClick={() => changeQty(item.id, 1)} aria-label="Increase quantity">+</button></div>
                </div>)}</div>}
              <div className="cart-total"><span>Total</span><b>{money(cartTotal)}</b></div>
              <label className="payment-label">Payment method
                <select value={payment} onChange={e => setPayment(e.target.value)}>
                  <option value="cash">Cash at canteen</option><option value="razorpay">Online (Razorpay)</option>
                </select>
              </label>
              <button className="button primary full" disabled={!cart.length || busy} onClick={checkout}>{busy ? 'Processing…' : payment === 'cash' ? 'Place order' : 'Pay & place order'}</button>
              {!user && <small className="cart-hint">You will be asked to log in to place an order.</small>}
              <div className="secure-note">🔒 Your order details are kept secure.</div>
            </aside>
          </div>
        </section>
      </>}

      {tab === 'orders' && <section className="section">
        <div className="section-heading"><div><div className="eyebrow">YOUR FOOD, YOUR TIMELINE</div><h2>My orders</h2></div><button className="button ghost" onClick={refreshOrders}>↻ Refresh</button></div>
        {!user ? <div className="panel empty">Please <button className="link-button" onClick={() => setTab('auth')}>log in</button> to view orders.</div> :
        <div className="orders-grid">{orders.map(order => <article className="order-card panel" key={order.id}>
          <div className="order-head"><div><small>ORDER NUMBER</small><h3>{order.order_number}</h3></div><span className={`status status-${order.order_status.toLowerCase()}`}>{order.order_status}</span></div>
          <div className="order-items">{order.items.map((it, i) => <div key={i}><span>{it.item_name} × {it.quantity}</span><b>{money(it.unit_price_paise * it.quantity)}</b></div>)}</div>
          <div className="order-total"><span>Total · {order.payment_method === 'cash' ? 'Cash at canteen' : 'Online'}</span><b>{money(order.total_paise)}</b></div>
          <div className="order-meta"><span>Payment: <b>{order.payment_status}</b></span><span>Est. wait: <b>{order.estimated_minutes} min</b></span></div>
          <div className="qr-panel"><img className="order-qr" src={order.qr_data_url} alt={`Pickup QR for ${order.order_number}`} /><div><b>Pickup QR</b><p>Show this code to canteen staff when your order is ready.</p><small>QR token is unique to this order.</small></div></div>
        </article>)}
        {!orders.length && <div className="panel empty">No orders yet. Choose food from the menu to get started.</div>}</div>}
      </section>}

      {tab === 'admin' && <section className="section">
        <div className="section-heading"><div><div className="eyebrow">CANTEEN OPERATIONS</div><h2>Admin dashboard</h2><p className="muted">Manage orders, payments and menu availability.</p></div><button className="button ghost" onClick={refreshAdmin}>↻ Refresh</button></div>
        {!user || user.role !== 'admin' ? <div className="panel empty">Admin access required. Log in with the demo admin account configured in the README.</div> : <>
          <div className="admin-stats"><div className="stat panel"><small>Orders in view</small><b>{adminOrders.length}</b></div><div className="stat panel"><small>Estimated queue</small><b>{wait ?? '—'} min</b></div><div className="stat panel"><small>Awaiting preparation</small><b>{adminOrders.filter(o => ['Pending','Preparing'].includes(o.order_status)).length}</b></div></div>
          <div className="panel admin-panel"><h3>Order queue</h3>
            <div className="table-wrap"><table><thead><tr><th>Order / Student</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th><th>Actions</th></tr></thead>
            <tbody>{adminOrders.map(o => <tr key={o.id}><td><b>{o.order_number}</b><small>{o.student_name} · {o.email}</small></td><td>{o.items.map(i => `${i.item_name} ×${i.quantity}`).join(', ')}</td><td>{money(o.total_paise)}</td><td><span>{o.payment_method}</span><small>{o.payment_status}</small>{o.payment_method === 'cash' && o.payment_status !== 'paid' && <button className="text-action" onClick={() => updateCashPayment(o.id, 'paid')}>Mark paid</button>}</td>
              <td><select value={o.order_status} onChange={e => updateStatus(o.id, e.target.value)}>{statuses.map(s => <option key={s}>{s}</option>)}</select></td><td><button className="button ghost small" onClick={() => { setPickupToken(o.pickup_token); flash(`Pickup token loaded for ${o.order_number}.`); }}>Load pickup token</button></td></tr>)}</tbody></table>
            {!adminOrders.length && <p className="muted">No orders have been placed.</p>}</div>
          </div>
          <div className="admin-lower">
            <form className="panel stack" onSubmit={addMenuItem}><h3>Add menu item</h3>
              <label>Name<input required value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })}/></label>
              <label>Description<input value={newItem.description} onChange={e => setNewItem({ ...newItem, description: e.target.value })}/></label>
              <div className="two-fields"><label>Price (₹)<input type="number" min="0.01" step="0.01" required value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })}/></label><label>Prep minutes<input type="number" min="1" max="120" required value={newItem.prep_minutes} onChange={e => setNewItem({ ...newItem, prep_minutes: e.target.value })}/></label></div>
              <button className="button primary">Add item</button>
            </form>
            <div className="panel stack"><h3>Menu availability</h3>{menu.map(item => <div className="availability-row" key={item.id}><div><b>{item.name}</b><small>{money(item.price_paise)}</small></div><button className="button ghost small" onClick={() => toggleAvailability(item)}>Set {item.available ? 'unavailable' : 'available'}</button></div>)}</div>
          </div>
          <form className="panel stack pickup-form" onSubmit={verifyPickup}><h3>Verify pickup token</h3><p className="muted">Paste the QR token here after scanning/decode it. The order must be Ready, and cash orders must be marked paid.</p><label>Pickup token<input value={pickupToken} onChange={e => setPickupToken(e.target.value)} placeholder="64-character QR token" required /></label><button className="button primary">Verify and complete pickup</button></form>
        </>}
      </section>}
    </main>
    <footer><span>© {new Date().getFullYear()} Smart Canteen</span><span>Built for quicker campus breaks.</span></footer>
  </div>;
}
