import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { groupsAPI, ticketsAPI } from '../services/api';

function GroupDetail({ user }) {
  const { id } = useParams();
  const [group, setGroup] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddMember, setShowAddMember] = useState(false);
  const [memberEmail, setMemberEmail] = useState('');

  useEffect(() => {
    fetchGroupData();
  }, [id]);

  const fetchGroupData = async () => {
    try {
      const [groupRes, ticketsRes] = await Promise.all([
        groupsAPI.getById(id),
        ticketsAPI.getAll({ groupId: id })
      ]);
      setGroup(groupRes.data);
      setTickets(ticketsRes.data);
    } catch (error) {
      console.error('Error fetching group:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusClass = (status) => {
    const classes = {
      PENDIENTE_PASTORA: 'status-pending',
      APROBADO: 'status-approved',
      RECHAZADO: 'status-rejected',
      EN_PROGRESO: 'status-progress',
      COMPLETADO: 'status-completed'
    };
    return classes[status] || '';
  };

  const getStatusText = (status) => {
    const texts = {
      PENDIENTE_PASTORA: 'Pendiente Pastora',
      APROBADO: 'Aprobado',
      RECHAZADO: 'Rechazado',
      EN_PROGRESO: 'En Progreso',
      COMPLETADO: 'Completado'
    };
    return texts[status] || status;
  };

  if (loading) {
    return <div className="text-center py-8">Cargando grupo...</div>;
  }

  if (!group) {
    return <div className="text-center py-8">Grupo no encontrado</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link to="/" className="text-blue-600 hover:underline">← Volver a grupos</Link>
      </div>

      <div className="card mb-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold mb-2">{group.name}</h1>
            {group.description && (
              <p className="text-gray-600">{group.description}</p>
            )}
          </div>
          <Link to={`/create-ticket?groupId=${id}`} className="btn-primary">
            + Nueva Sugerencia
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Tickets */}
        <div className="lg:col-span-2">
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Sugerencias y Tickets</h2>
            {tickets.length === 0 ? (
              <p className="text-gray-500">No hay tickets en este grupo.</p>
            ) : (
              <div className="space-y-3">
                {tickets.map(ticket => (
                  <Link
                    key={ticket.id}
                    to={`/tickets/${ticket.id}`}
                    className="block p-4 border rounded-lg hover:bg-gray-50"
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <h3 className="font-medium">{ticket.title}</h3>
                        <p className="text-sm text-gray-500 mt-1">
                          {new Date(ticket.createdAt).toLocaleDateString()}
                        </p>
                        {ticket.deadline && (
                          <div className={`inline-flex items-center gap-1 mt-2 px-2 py-1 rounded text-xs font-medium ${
                            new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO'
                              ? 'bg-red-100 text-red-800'
                              : 'bg-blue-100 text-blue-800'
                          }`}>
                            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                            {new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO'
                              ? `Vencido: ${new Date(ticket.deadline).toLocaleDateString()}`
                              : `Entrega: ${new Date(ticket.deadline).toLocaleDateString()}`
                            }
                          </div>
                        )}
                        {ticket.priority && (
                          <span className={`inline-flex items-center gap-1 mt-2 ml-2 px-2 py-1 rounded text-xs font-medium ${
                            ticket.priority === 'ALTA' ? 'text-red-600' :
                            ticket.priority === 'MEDIA' ? 'text-yellow-600' :
                            'text-green-600'
                          }`}>
                            Prioridad: • {ticket.priority}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className={getStatusClass(ticket.status)}>
                          {getStatusText(ticket.status)}
                        </span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Members */}
        <div>
          <div className="card">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold">Miembros</h2>
              {user.role === 'PASTORA' && (
                <button
                  onClick={() => setShowAddMember(!showAddMember)}
                  className="text-blue-600 hover:underline text-sm"
                >
                  + Agregar
                </button>
              )}
            </div>

            {showAddMember && (
              <div className="mb-4 p-3 bg-gray-50 rounded">
                <input
                  type="email"
                  placeholder="Email del miembro"
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="input-field text-sm mb-2"
                />
                <button
                  onClick={async () => {
                    // TODO: Implement add member
                    alert('Función por implementar');
                  }}
                  className="btn-primary text-sm w-full"
                >
                  Agregar
                </button>
              </div>
            )}

            <div className="space-y-2">
              {group.members.map(member => (
                <div key={member.id} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium">{member.user.name}</p>
                    <p className="text-sm text-gray-500">{member.user.email}</p>
                  </div>
                  <span className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded">
                    {member.user.role === 'PASTORA' ? 'Pastora' : 'Miembro'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default GroupDetail;
