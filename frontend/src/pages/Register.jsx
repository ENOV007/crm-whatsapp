import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { authAPI } from '../services/api';

function Register({ onLogin }) {
  const [formData, setFormData] = useState({
    name: '',
    apellido: '',
    password: '',
    phone: '',
    groupId: ''
  });
  const [groups, setGroups] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registered, setRegistered] = useState(null);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const res = await authAPI.getGroups();
      setGroups(res.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const getGeneratedEmail = () => {
    const { name, apellido } = formData;
    if (name.length >= 3 && apellido.length >= 3) {
      return (name.substring(0, 3) + apellido.substring(0, 3)).toLowerCase() + '@crm.com';
    }
    return null;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const dataToSend = { ...formData };
      if (!dataToSend.groupId) delete dataToSend.groupId;
      if (!dataToSend.phone) delete dataToSend.phone;

      const res = await authAPI.register(dataToSend);
      setRegistered({
        name: res.data.user.name,
        email: res.data.user.email,
        password: formData.password
      });
    } catch (err) {
      setError(err.response?.data?.error || 'Error al registrar');
    } finally {
      setLoading(false);
    }
  };

  const handleGoToLogin = () => {
    onLogin(null, null);
  };

  const generatedEmail = getGeneratedEmail();

  if (registered) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="card w-full max-w-md text-center">
          <div className="mb-4">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">¡Cuenta creada!</h1>
            <p className="text-gray-500 mb-6">Guarda tus credenciales para iniciar sesión</p>
          </div>

          <div className="bg-gray-50 border rounded-lg p-4 mb-6 text-left">
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Usuario</p>
              <p className="font-mono text-lg font-semibold text-gray-800">{registered.email}</p>
            </div>
            <div className="mb-3">
              <p className="text-xs text-gray-500 uppercase tracking-wide">Contraseña</p>
              <p className="font-mono text-lg text-gray-800">{'•'.repeat(registered.password.length)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500 uppercase tracking-wide">Nombre</p>
              <p className="text-gray-800">{registered.name}</p>
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded p-3 mb-6 text-left">
            <p className="text-sm text-yellow-800">
              <strong>Importante:</strong> Anota tu usuario. La contraseña no se puede recuperar.
            </p>
          </div>

          <button
            onClick={handleGoToLogin}
            className="btn-primary w-full"
          >
            Ir a Iniciar Sesión
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="card w-full max-w-md">
        <h1 className="text-2xl font-bold text-center mb-6">Crear Cuenta</h1>
        
        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Nombre</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              className="input-field"
              required
              minLength={3}
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Apellido</label>
            <input
              type="text"
              name="apellido"
              value={formData.apellido}
              onChange={handleChange}
              className="input-field"
              required
              minLength={3}
            />
          </div>

          {generatedEmail && (
            <div className="mb-4 bg-blue-50 border border-blue-200 rounded p-3">
              <p className="text-sm text-blue-800">
                <strong>Tu usuario será:</strong> {generatedEmail}
              </p>
            </div>
          )}

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Contraseña</label>
            <input
              type="password"
              name="password"
              value={formData.password}
              onChange={handleChange}
              className="input-field"
              required
              minLength={6}
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Teléfono (opcional)</label>
            <input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              className="input-field"
              placeholder="+1234567890"
            />
          </div>

          <div className="mb-6">
            <label className="block text-gray-700 mb-2">Grupo</label>
            <select
              name="groupId"
              value={formData.groupId}
              onChange={handleChange}
              className="input-field"
            >
              <option value="">Selecciona un grupo</option>
              {groups.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="btn-primary w-full"
          >
            {loading ? 'Creando cuenta...' : 'Crear Cuenta'}
          </button>
        </form>

        <p className="text-center mt-4 text-gray-600">
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" className="text-blue-600 hover:underline">
            Inicia sesión
          </Link>
        </p>
      </div>
    </div>
  );
}

export default Register;
