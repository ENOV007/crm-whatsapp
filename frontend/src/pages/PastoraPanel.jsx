import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { ticketsAPI, groupsAPI } from '../services/api';

function PastoraPanel({ user }) {
  const [tickets, setTickets] = useState([]);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [ticketsRes, groupsRes] = await Promise.all([
        ticketsAPI.getPastora(),
        groupsAPI.getAll()
      ]);
      setTickets(ticketsRes.data);
      setGroups(groupsRes.data);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getStatusText = (status) => {
    const texts = {
      PENDIENTE_PASTORA: 'Pendiente',
      APROBADO: 'Aprobado',
      RECHAZADO: 'Rechazado',
      EN_PROGRESO: 'En Progreso',
      COMPLETADO: 'Completado'
    };
    return texts[status] || status;
  };

  const getStatusColor = (status) => {
    const colors = {
      PENDIENTE_PASTORA: 'bg-yellow-100 text-yellow-800',
      APROBADO: 'bg-green-100 text-green-800',
      RECHAZADO: 'bg-red-100 text-red-800',
      EN_PROGRESO: 'bg-blue-100 text-blue-800',
      COMPLETADO: 'bg-gray-100 text-gray-800'
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const getFilteredTickets = () => {
    if (!statusFilter) return tickets;
    if (statusFilter === 'OVERDUE') return tickets.filter(t => t.isOverdue);
    return tickets.filter(t => t.status === statusFilter);
  };

  const stats = [
    { key: null, label: 'Total', count: tickets.length, color: 'text-blue-600', bg: 'hover:bg-blue-50 border-blue-200' },
    { key: 'PENDIENTE_PASTORA', label: 'Pendientes', count: tickets.filter(t => t.status === 'PENDIENTE_PASTORA').length, color: 'text-yellow-600', bg: 'hover:bg-yellow-50 border-yellow-200' },
    { key: 'APROBADO', label: 'Aprobados', count: tickets.filter(t => t.status === 'APROBADO').length, color: 'text-green-600', bg: 'hover:bg-green-50 border-green-200' },
    { key: 'EN_PROGRESO', label: 'En Progreso', count: tickets.filter(t => t.status === 'EN_PROGRESO').length, color: 'text-blue-600', bg: 'hover:bg-blue-50 border-blue-200' },
    { key: 'COMPLETADO', label: 'Completados', count: tickets.filter(t => t.status === 'COMPLETADO').length, color: 'text-gray-600', bg: 'hover:bg-gray-50 border-gray-200' },
    { key: 'OVERDUE', label: 'Vencidos', count: tickets.filter(t => t.isOverdue).length, color: 'text-red-600', bg: 'hover:bg-red-50 border-red-200' }
  ];

  const filteredTickets = getFilteredTickets();

  if (loading) {
    return <div className="text-center py-8">Cargando panel...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Panel de Mónica</h1>
      <p className="text-gray-500 mb-6">Bienvenida, {user.name}</p>

      {/* Stats Cards - Clickable */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-8">
        {stats.map(stat => (
          <button
            key={stat.key || 'all'}
            onClick={() => setStatusFilter(stat.key)}
            className={`card text-center cursor-pointer transition-all border-2 ${
              statusFilter === stat.key
                ? 'ring-2 ring-offset-1 ring-blue-400 border-blue-400'
                : stat.bg
            }`}
          >
            <p className={`text-2xl font-bold ${stat.color}`}>{stat.count}</p>
            <p className="text-gray-600 text-xs">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My Groups */}
        <div className="card">
          <h2 className="text-xl font-semibold mb-4">Mis Grupos</h2>
          {groups.length === 0 ? (
            <p className="text-gray-500 text-center py-4">No perteneces a ningún grupo.</p>
          ) : (
            <div className="space-y-3">
              {groups.map(group => (
                <Link
                  key={group.id}
                  to={`/groups/${group.id}`}
                  className="block p-3 border rounded-lg hover:bg-gray-50"
                >
                  <div className="flex justify-between items-center">
                    <div>
                      <p className="font-medium">{group.name}</p>
                      {group.description && (
                        <p className="text-sm text-gray-500">{group.description}</p>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500">
                      <p>{group._count.members} miembros</p>
                      <p>{group._count.tickets} tickets</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Filtered Tickets */}
        <div className="lg:col-span-2 card">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">
              {statusFilter ? getStatusText(statusFilter) || 'Todos' : 'Todos los Tickets'}
              <span className="text-sm font-normal text-gray-500 ml-2">({filteredTickets.length})</span>
            </h2>
            {statusFilter && (
              <button
                onClick={() => setStatusFilter(null)}
                className="text-blue-600 hover:underline text-sm"
              >
                Limpiar filtro
              </button>
            )}
          </div>

          {filteredTickets.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              {statusFilter ? 'No hay tickets con este estado.' : 'No hay tickets aún.'}
            </p>
          ) : (
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {filteredTickets.map(ticket => (
                <Link
                  key={ticket.id}
                  to={`/tickets/${ticket.id}`}
                  className={`block p-3 border rounded-lg hover:bg-gray-50 ${
                    ticket.isOverdue ? 'border-red-300 bg-red-50' : ''
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center space-x-2">
                        <p className="font-medium text-sm">{ticket.title}</p>
                        {ticket.isOverdue && (
                          <span className="text-xs bg-red-100 text-red-800 px-1 rounded">VENCIDO</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-500 mt-1">{ticket.group.name}</p>
                      {ticket.deadline && (
                        <p className="text-xs text-gray-400 mt-1">
                          Vence: {new Date(ticket.deadline).toLocaleDateString()}
                        </p>
                      )}
                      {ticket.priority && (
                        <span className={`text-xs font-bold mt-1 inline-block ${
                          ticket.priority === 'ALTA' ? 'text-red-600' :
                          ticket.priority === 'MEDIA' ? 'text-yellow-600' :
                          'text-green-600'
                        }`}>
                          Prioridad: • {ticket.priority}
                        </span>
                      )}
                      {ticket.visibility && (
                        <span className={`text-xs px-1.5 py-0.5 rounded mt-1 inline-block ml-2 ${
                          ticket.visibility === 'PUBLIC' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
                        }`}>
                          {ticket.visibility === 'PUBLIC' ? '🌐' : '🔒'}
                        </span>
                      )}
                    </div>
                    <span className={`text-xs px-2 py-1 rounded ${getStatusColor(ticket.status)}`}>
                      {getStatusText(ticket.status)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default PastoraPanel;