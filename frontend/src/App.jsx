import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { authAPI } from './services/api';
import { subscribeToPush } from './services/pushManager';

// Pages
import Login from './pages/Login';
import Register from './pages/Register';
import Dashboard from './pages/Dashboard';
import GroupDetail from './pages/GroupDetail';
import TicketDetail from './pages/TicketDetail';
import CreateTicket from './pages/CreateTicket';
import PastoraPanel from './pages/PastoraPanel';
import AdminPanel from './pages/AdminPanel';

// Components
import Navbar from './components/Navbar';
import Loading from './components/Loading';

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (token) {
      authAPI.getMe()
        .then(res => {
          setUser(res.data);
          subscribeToPush().catch(() => {});
        })
        .catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (userData, token) => {
    localStorage.setItem('token', token);
    localStorage.setItem('user', JSON.stringify(userData));
    try {
      const res = await authAPI.getMe();
      setUser(res.data);
    } catch {
      setUser(userData);
    }
    subscribeToPush().catch(() => {});
  };

  const logout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  };

  if (loading) {
    return <Loading />;
  }

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        {user && <Navbar user={user} onLogout={logout} />}
        <main className="container mx-auto px-4 py-8">
          <Routes>
            <Route path="/login" element={!user ? <Login onLogin={login} /> : <Navigate to="/" />} />
            <Route path="/register" element={!user ? <Register onLogin={login} /> : <Navigate to="/" />} />
            <Route path="/" element={user ? <Dashboard user={user} /> : <Navigate to="/login" />} />
            <Route path="/groups/:id" element={user ? <GroupDetail user={user} /> : <Navigate to="/login" />} />
            <Route path="/tickets/:id" element={user ? <TicketDetail user={user} /> : <Navigate to="/login" />} />
            <Route path="/create-ticket" element={user ? <CreateTicket user={user} /> : <Navigate to="/login" />} />
            <Route path="/pastora" element={user?.role === 'PASTORA' ? <PastoraPanel user={user} /> : <Navigate to="/" />} />
            <Route path="/admin" element={user?.role === 'ADMIN' ? <AdminPanel user={user} /> : <Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </Router>
  );
}

export default App;
