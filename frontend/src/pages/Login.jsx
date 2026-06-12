import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

function Login({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mustChangePassword, setMustChangePassword] = useState(false);
  const [tempToken, setTempToken] = useState('');
  const [tempUser, setTempUser] = useState(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changeError, setChangeError] = useState('');
  const [changeLoading, setChangeLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await authAPI.login(email, password);
      
      if (res.data.user.mustChangePassword) {
        setTempToken(res.data.token);
        setTempUser(res.data.user);
        setMustChangePassword(true);
      } else {
        onLogin(res.data.user, res.data.token);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    setChangeError('');

    if (newPassword !== confirmPassword) {
      setChangeError('Las contraseñas no coinciden');
      return;
    }

    if (newPassword.length < 6) {
      setChangeError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setChangeLoading(true);

    try {
      // Store token temporarily to make the API call
      localStorage.setItem('token', tempToken);
      await authAPI.changePassword(newPassword);
      localStorage.removeItem('token');
      
      // Now login normally with the new password
      const res = await authAPI.login(email, newPassword);
      onLogin(res.data.user, res.data.token);
    } catch (err) {
      setChangeError(err.response?.data?.error || 'Error al cambiar contraseña');
      localStorage.removeItem('token');
    } finally {
      setChangeLoading(false);
    }
  };

  if (mustChangePassword) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="card w-full max-w-md">
          <h1 className="text-2xl font-bold text-center mb-2">Cambiar Contraseña</h1>
          <p className="text-gray-500 text-center mb-6">Debes cambiar tu contraseña para continuar</p>
          
          {changeError && (
            <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
              {changeError}
            </div>
          )}

          <form onSubmit={handlePasswordChange}>
            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Nueva Contraseña</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input-field"
                required
                minLength={6}
              />
            </div>

            <div className="mb-6">
              <label className="block text-gray-700 mb-2">Confirmar Contraseña</label>
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="input-field"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={changeLoading}
              className="btn-primary w-full"
            >
              {changeLoading ? 'Guardando...' : 'Guardar Contraseña'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Iniciar Sesión</h1>
        
        {error && (
          <div className="bg-red-50 border border-red-300 text-red-700 p-4 rounded mb-4 flex items-start gap-3">
            <svg className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="flex-1">
              <p className="font-medium">{error}</p>
            </div>
            <button onClick={() => setError('')} className="text-red-400 hover:text-red-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Usuario</label>
            <input
              type="text"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`input-field ${error ? 'border-red-400 focus:ring-red-300' : ''}`}
              placeholder="ej: miembro@crm.com"
              required
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Contraseña</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={`input-field ${error ? 'border-red-400 focus:ring-red-300' : ''}`}
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Ingresando...' : 'Iniciar Sesión'}
          </button>
        </form>

        <p className="text-center mt-4 text-gray-600">
          ¿No tienes cuenta?{' '}
          <Link to="/register" className="text-blue-600 hover:underline">
            Regístrate
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Login;
