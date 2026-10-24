import api from './api.js';

const data = (p) => p.then((r) => r.data);

export const authService = {
  register: (body) => data(api.post('/auth/register', body)),
  login: (body) => data(api.post('/auth/login', body)),
  logout: () => data(api.post('/auth/logout')),
  me: () => data(api.get('/auth/me')),
  updateProfile: (body) => data(api.put('/auth/profile', body)),
  changePassword: (body) => data(api.put('/auth/password', body)),
};

export const roomService = {
  list: (params) => data(api.get('/rooms', { params })),
  featured: () => data(api.get('/rooms/featured')),
  meta: (params) => data(api.get('/rooms/meta', { params })),
  testimonials: () => data(api.get('/rooms/testimonials')),
  get: (id) => data(api.get(`/rooms/${id}`)),
};

export const bookingService = {
  quote: (body) => data(api.post('/bookings/quote', body)),
  create: (body) => data(api.post('/bookings', body)),
  mine: () => data(api.get('/bookings/my')),
  get: (id) => data(api.get(`/bookings/${id}`)),
  cancel: (id, reason) => data(api.post(`/bookings/${id}/cancel`, { reason })),
};

export const adminService = {
  stats: () => data(api.get('/admin/stats')),
  report: (params) => data(api.get('/admin/reports', { params })),
  rooms: (params) => data(api.get('/admin/rooms', { params })),
  createRoom: (body) => data(api.post('/admin/rooms', body)),
  updateRoom: (id, body) => data(api.put(`/admin/rooms/${id}`, body)),
  setRoomActive: (id, isActive) => data(api.patch(`/admin/rooms/${id}/active`, { isActive })),
  hotels: () => data(api.get('/admin/hotels')),
  roomTypes: () => data(api.get('/admin/room-types')),
  createRoomType: (body) => data(api.post('/admin/room-types', body)),
  updateRoomType: (id, body) => data(api.put(`/admin/room-types/${id}`, body)),
  amenities: () => data(api.get('/admin/amenities')),
  bookings: (params) => data(api.get('/admin/bookings', { params })),
  setBookingStatus: (id, status, reason) => data(api.patch(`/admin/bookings/${id}/status`, { status, reason })),
  setStayStatus: (id, stayStatus) => data(api.patch(`/admin/bookings/${id}/stay`, { stayStatus })),
  customers: (params) => data(api.get('/admin/customers', { params })),
  customer: (id) => data(api.get(`/admin/customers/${id}`)),
  setCustomerActive: (id, isActive) => data(api.patch(`/admin/customers/${id}/active`, { isActive })),
};
