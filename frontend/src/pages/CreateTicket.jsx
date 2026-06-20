import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { groupsAPI, ticketsAPI } from '../services/api';

function CreateTicket({ user }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [groups, setGroups] = useState([]);
  const [personalGroup, setPersonalGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isPastoraOrAdmin = user?.role === 'PASTORA' || user?.role === 'ADMIN';

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    groupId: searchParams.get('groupId') || '',
    visibility: 'PRIVATE',
    priority: 'BAJA',
    deadline: ''
  });

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const [groupsRes, personalRes] = await Promise.all([
        groupsAPI.getAll(),
        isPastoraOrAdmin ? groupsAPI.getMyPersonal() : Promise.resolve({ data: null })
      ]);
      const visibleGroups = groupsRes.data.filter(g => !g.isPersonal);
      setGroups(visibleGroups);
      setPersonalGroup(personalRes.data);
      if (!formData.groupId && personalRes.data) {
        setFormData(prev => ({ ...prev, groupId: personalRes.data.id }));
      }
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);

    try {
      const payload = { ...formData };
      if (isPastoraOrAdmin && payload.deadline) {
        payload.deadline = new Date(payload.deadline).toISOString();
      } else {
        delete payload.deadline;
        delete payload.visibility;
        delete payload.priority;
      }
      const res = await ticketsAPI.create(payload);
      navigate(`/tickets/${res.data.id}`);
    } catch (err) {
      setError(err.response?.data?.error || 'Error al crear sugerencia');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-center py-8">Cargando...</div>;
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline">← Volver al inicio</Link>
      </div>

      <div className="card">
        <h1 className="text-2xl font-bold mb-6">
          {isPastoraOrAdmin ? 'Nuevo Ticket' : 'Nueva Sugerencia'}
        </h1>
        
        {isPastoraOrAdmin ? (
          <p className="text-gray-600 mb-6">
            Tu ticket será aprobado automáticamente. Selecciona la visibilidad y prioridad.
          </p>
        ) : (
          <p className="text-gray-600 mb-6">
            Tu sugerencia será enviada de forma anónima al grupo. La pastora la revisará y decidirá si aprueba o rechaza.
          </p>
        )}

        {error && (
          <div className="bg-red-100 text-red-700 p-3 rounded mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Grupo *</label>
            <select
              name="groupId"
              value={formData.groupId}
              onChange={handleChange}
              className="input-field"
              required
            >
              <option value="">Selecciona un grupo</option>
              {personalGroup && (
                <option value={personalGroup.id}>
                  🏠 {personalGroup.name} (Mi espacio)
                </option>
              )}
              {groups.map(group => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Título *</label>
            <input
              type="text"
              name="title"
              value={formData.title}
              onChange={handleChange}
              className="input-field"
              placeholder="Ej: Necesitamos un tecladista"
              required
            />
          </div>

          <div className="mb-4">
            <label className="block text-gray-700 mb-2">Descripción *</label>
            <textarea
              name="description"
              value={formData.description}
              onChange={handleChange}
              className="input-field"
              rows={4}
              placeholder="Describe tu sugerencia en detalle..."
              required
            />
          </div>

          {isPastoraOrAdmin && (
            <>
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-gray-700 mb-2">Visibilidad</label>
                  <select
                    name="visibility"
                    value={formData.visibility}
                    onChange={handleChange}
                    className="input-field"
                  >
                    <option value="INICIAL">Inicial (solo tú y pastora)</option>
                    <option value="PRIVATE">Privado (grupo)</option>
                    <option value="PUBLIC">Público (toda la iglesia)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-gray-700 mb-2">Prioridad</label>
                  <select
                    name="priority"
                    value={formData.priority}
                    onChange={handleChange}
                    className="input-field"
                  >
                    <option value="BAJA">🟢 Baja</option>
                    <option value="MEDIA">🟡 Media</option>
                    <option value="ALTA">🔴 Alta</option>
                  </select>
                </div>
              </div>

              <div className="mb-4">
                <label className="block text-gray-700 mb-2">Fecha Límite</label>
                <input
                  type="datetime-local"
                  name="deadline"
                  value={formData.deadline}
                  onChange={handleChange}
                  className="input-field"
                />
              </div>
            </>
          )}

          {!isPastoraOrAdmin && (
            <div className="mb-6">
              <p className="text-sm text-gray-500 mb-4">
                La fecha límite será establecida por la pastora al aprobar tu sugerencia.
              </p>
            </div>
          )}

          <div className="flex justify-end space-x-4">
            <Link to="/" className="btn-secondary">
              Cancelar
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="btn-primary"
            >
              {submitting ? 'Enviando...' : (isPastoraOrAdmin ? 'Crear Ticket' : 'Enviar Sugerencia')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CreateTicket;
