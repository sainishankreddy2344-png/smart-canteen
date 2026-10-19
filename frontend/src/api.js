const API = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';

export function getToken() { return localStorage.getItem('canteen_token') || ''; }
export function setSession(token, user) {
  localStorage.setItem('canteen_token', token);
  localStorage.setItem('canteen_user', JSON.stringify(user));
}
export function clearSession() {
  localStorage.removeItem('canteen_token');
  localStorage.removeItem('canteen_user');
}
export function getUser() {
  try { return JSON.parse(localStorage.getItem('canteen_user') || 'null'); } catch { return null; }
}

export async function api(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await fetch(`${API}${path}`, { ...options, headers });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Request failed.');
  return data;
}
