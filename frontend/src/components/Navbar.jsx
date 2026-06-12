import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { notificationsAPI } from '../services/api';

function Navbar({ user, onLogout }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 30000); // Check every 30 seconds
    return () => clearInterval(interval);
  }, []);

  const fetchUnreadCount = async () => {
    try {
      const res = await notificationsAPI.getUnreadCount();
      setUnreadCount(res.data.count);
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const fetchNotifications = async () => {
    try {
      const res = await notificationsAPI.getAll({ unread: 'true' });
      setNotifications(res.data);
      setShowNotifications(!showNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    }
  };

  const markAsRead = async (id) => {
    try {
      await notificationsAPI.markAsRead(id);
      setNotifications(notifications.filter(n => n.id !== id));
      setUnreadCount(Math.max(0, unreadCount - 1));
    } catch (error) {
      console.error('Error marking notification:', error);
    }
  };

  return (
    <nav className="bg-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center space-x-4">
            <Link to="/" className="text-xl font-bold text-blue-600">
              CRM
            </Link>
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              Inicio
            </Link>
            {user.role === 'PASTORA' && (
              <Link to="/pastora" className="text-gray-600 hover:text-gray-900">
                Panel Pastora
              </Link>
            )}
            {user.role === 'ADMIN' && (
              <Link to="/admin" className="text-gray-600 hover:text-gray-900">
                Panel Admin
              </Link>
            )}
            <Link to="/create-ticket" className="text-gray-600 hover:text-gray-900">
              Nueva Sugerencia
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={fetchNotifications}
                className="relative p-2 text-gray-600 hover:text-gray-900"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-80 bg-white rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  <div className="p-4 border-b">
                    <h3 className="font-semibold">Notificaciones</h3>
                  </div>
                  {notifications.length === 0 ? (
                    <div className="p-4 text-gray-500 text-center">
                      No hay notificaciones
                    </div>
                  ) : (
                    <div>
                      {notifications.map(notification => (
                        <div
                          key={notification.id}
                          className="p-4 border-b hover:bg-gray-50 cursor-pointer"
                          onClick={() => {
                            markAsRead(notification.id);
                            if (notification.ticket) {
                              navigate(`/tickets/${notification.ticket.id}`);
                            }
                            setShowNotifications(false);
                          }}
                        >
                          <p className="text-sm">{notification.message}</p>
                          <p className="text-xs text-gray-500 mt-1">
                            {new Date(notification.createdAt).toLocaleString()}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-2">
              <span className="text-gray-700">{user.name}</span>
              <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                {user.role === 'ADMIN' ? 'Admin' : user.role === 'PASTORA' ? 'Pastora' : 'Miembro'}
              </span>
            </div>

            <button
              onClick={onLogout}
              className="text-gray-600 hover:text-gray-900"
            >
              Salir
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navbar;
