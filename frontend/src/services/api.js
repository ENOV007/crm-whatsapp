import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Handle auth errors
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config.url.includes('/auth/login')) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Auth API
export const authAPI = {
  login: (email, password) => api.post('/auth/login', { email, password }),
  register: (data) => api.post('/auth/register', data),
  getMe: () => api.get('/auth/me'),
  getGroups: () => api.get('/auth/groups'),
  changePassword: (newPassword) => api.post('/auth/change-password', { newPassword })
};

// Groups API
export const groupsAPI = {
  getAll: () => api.get('/groups/all'),
  getMyGroups: () => api.get('/groups'),
  getById: (id) => api.get(`/groups/${id}`),
  create: (data) => api.post('/groups', data),
  addMember: (groupId, userId) => api.post(`/groups/${groupId}/members`, { userId }),
  removeMember: (groupId, userId) => api.delete(`/groups/${groupId}/members/${userId}`)
};

// Tickets API
export const ticketsAPI = {
  getAll: (params) => api.get('/tickets', { params }),
  getPastora: () => api.get('/tickets/pastora'),
  getAllIncludingHidden: () => api.get('/tickets/all-visible'),
  getById: (id) => api.get(`/tickets/${id}`),
  create: (data) => api.post('/tickets', data),
  update: (id, data) => api.patch(`/tickets/${id}`, data),
  hide: (id, hidden = true) => api.patch(`/tickets/${id}/hide`, { hidden }),
  delete: (id) => api.delete(`/tickets/${id}`),
  addComment: (ticketId, data) => api.post(`/tickets/${ticketId}/comments`, data)
};

// Notifications API
export const notificationsAPI = {
  getAll: (params) => api.get('/notifications', { params }),
  getUnreadCount: () => api.get('/notifications/unread-count'),
  markAsRead: (id) => api.patch(`/notifications/${id}/read`),
  markAllAsRead: () => api.patch('/notifications/read-all')
};

// Admin API
export const adminAPI = {
  getStats: () => api.get('/admin/stats'),
  getUsers: () => api.get('/admin/users'),
  createUser: (data) => api.post('/admin/users', data),
  updateUserRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }),
  deleteUser: (id) => api.delete(`/admin/users/${id}`),
  resetPassword: (id) => api.post(`/admin/users/${id}/reset-password`),
  updateUserGroup: (id, groupId) => api.patch(`/admin/users/${id}/group`, { groupId }),
  getGroups: () => api.get('/admin/groups'),
  createGroup: (data) => api.post('/admin/groups', data),
  deleteGroup: (id) => api.delete(`/admin/groups/${id}`),
  addUserToGroup: (userId, groupId) => api.post(`/admin/users/${userId}/groups/${groupId}`),
  removeUserFromGroup: (userId, groupId) => api.delete(`/admin/users/${userId}/groups/${groupId}`)
};

export default api;
