import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { groupsAPI } from '../services/api';

function Dashboard({ user }) {
  const [groups, setGroups] = useState([]);
  const [personalGroup, setPersonalGroup] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchGroups();
  }, []);

  const fetchGroups = async () => {
    try {
      const [groupsRes, personalRes] = await Promise.all([
        groupsAPI.getAll(),
        (user?.role === 'PASTORA' || user?.role === 'ADMIN') ? groupsAPI.getMyPersonal() : Promise.resolve({ data: null })
      ]);
      setGroups(groupsRes.data);
      setPersonalGroup(personalRes.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    } finally {
      setLoading(false);
    }
  };

  const userGroupIds = user?.groups?.map(g => g.group.id) || [];
  const myGroups = groups.filter(g => userGroupIds.includes(g.id));
  const otherGroups = groups.filter(g => !userGroupIds.includes(g.id));

  if (loading) {
    return <div className="text-center py-8">Cargando grupos...</div>;
  }

  return (
    <div>
      {/* Mi Espacio Personal */}
      {personalGroup && (
        <div className="mb-8">
          <div className="card border-2 border-purple-200 bg-purple-50">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-purple-800">🏠 Mi Espacio Personal</h2>
                <p className="text-purple-600 text-sm mt-1">Tus gestiones privadas — {personalGroup._count?.tickets || 0} tickets</p>
              </div>
              <div className="flex gap-2">
                <Link
                  to={`/groups/${personalGroup.id}`}
                  className="bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 text-sm font-medium"
                >
                  Ver tickets
                </Link>
                <Link
                  to={`/create-ticket?groupId=${personalGroup.id}`}
                  className="bg-white text-purple-600 border border-purple-300 px-4 py-2 rounded-lg hover:bg-purple-100 text-sm font-medium"
                >
                  + Crear
                </Link>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Mi Grupo */}
      {myGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4">Mis Grupos</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {myGroups.map(group => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="card hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-semibold mb-2">{group.name}</h3>
                {group.description && (
                  <p className="text-gray-600 mb-3 text-sm">{group.description}</p>
                )}
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{group._count.members} miembros</span>
                  <span>{group._count.tickets} tickets</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Acción rápida */}
      <div className="mb-8">
        <Link
          to="/create-ticket"
          className="inline-block bg-green-600 text-white px-6 py-3 rounded-lg hover:bg-green-700 font-semibold"
        >
          + Nueva Sugerencia
        </Link>
        <span className="ml-3 text-gray-500 text-sm">Haz una sugerencia anónima a cualquier grupo</span>
      </div>

      {/* Otros Grupos */}
      {otherGroups.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-700">Otros Grupos</h2>
          <p className="text-gray-500 text-sm mb-4">Selecciona un grupo para ver detalles o crear una sugerencia</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {otherGroups.map(group => (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="card hover:shadow-lg transition-shadow"
              >
                <h3 className="text-lg font-semibold mb-2">{group.name}</h3>
                {group.description && (
                  <p className="text-gray-600 mb-3 text-sm">{group.description}</p>
                )}
                <div className="flex justify-between text-sm text-gray-500">
                  <span>{group._count.members} miembros</span>
                  <span>{group._count.tickets} tickets</span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Si no tiene grupo */}
      {myGroups.length === 0 && !personalGroup && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
          <p className="text-yellow-800">
            <strong>No perteneces a ningún grupo aún.</strong> Contacta al administrador para ser asignado a un grupo.
          </p>
        </div>
      )}
    </div>
  );
}

export default Dashboard;
