import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { adminAPI, authAPI, ticketsAPI, backupAPI, whatsappAPI, groupsAPI } from '../services/api';

function AdminPanel({ user }) {
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [groups, setGroups] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [newUser, setNewUser] = useState({ name: '', apellido: '', password: '', phone: '', role: 'MEMBER', groupId: '' });
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [availableGroups, setAvailableGroups] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [backupStats, setBackupStats] = useState(null);
  const [backupLogs, setBackupLogs] = useState([]);
  const [backupFiles, setBackupFiles] = useState([]);
  const [backupLoading, setBackupLoading] = useState(false);
  const [backupTriggering, setBackupTriggering] = useState(false);
  const [availableBackups, setAvailableBackups] = useState([]);
  const [restoring, setRestoring] = useState(false);
  const [restoreConfirm, setRestoreConfirm] = useState(null);
  const [whatsappStatus, setWhatsappStatus] = useState(null);
  const [whatsappQR, setWhatsappQR] = useState(null);
  const [whatsappGroups, setWhatsappGroups] = useState([]);
  const [whatsappLoading, setWhatsappLoading] = useState(false);
  const [whatsappTestPhone, setWhatsappTestPhone] = useState('');
  const [whatsappTestMsg, setWhatsappTestMsg] = useState('');
  const [whatsappTestSending, setWhatsappTestSending] = useState(false);
  const [linkingGroup, setLinkingGroup] = useState(null);
  const [personalGroup, setPersonalGroup] = useState(null);

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (activeTab === 'backups') {
      fetchBackupData();
    }
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'whatsapp') {
      fetchWhatsAppData();
    }
  }, [activeTab]);

  const fetchData = async () => {
    try {
      const [statsRes, usersRes, groupsRes, ticketsRes, personalRes] = await Promise.all([
        adminAPI.getStats(),
        adminAPI.getUsers(),
        adminAPI.getGroups(),
        ticketsAPI.getAllIncludingHidden(),
        groupsAPI.getMyPersonal()
      ]);
      setStats(statsRes.data);
      setUsers(usersRes.data);
      setGroups(groupsRes.data);
      setTickets(ticketsRes.data);
      setPersonalGroup(personalRes.data);
    } catch (error) {
      console.error('Error fetching admin data:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableGroups = async () => {
    try {
      const res = await authAPI.getGroups();
      setAvailableGroups(res.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
    }
  };

  const fetchBackupData = async () => {
    setBackupLoading(true);
    try {
      const [statsRes, logsRes, filesRes, availableRes] = await Promise.all([
        backupAPI.getStats(),
        backupAPI.getLogs({ limit: 15 }),
        backupAPI.getDriveFiles(),
        backupAPI.getAvailable()
      ]);
      setBackupStats(statsRes.data);
      setBackupLogs(logsRes.data);
      setBackupFiles(filesRes.data);
      setAvailableBackups(availableRes.data);
    } catch (error) {
      console.error('Error fetching backup data:', error);
    } finally {
      setBackupLoading(false);
    }
  };

  const handleDownloadBackup = async () => {
    setBackupTriggering(true);
    try {
      const response = await backupAPI.download();
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = response.headers['content-disposition']?.split('filename=')[1] || 'crm-backup.tar.gz';
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
      setTimeout(fetchBackupData, 2000);
    } catch (error) {
      console.error('Error downloading backup:', error);
      alert('Error al descargar backup');
    } finally {
      setBackupTriggering(false);
    }
  };

  const handleAutoBackup = async (type) => {
    const labels = { 'auto-db': 'DB a Drive', 'auto-code': 'Código a Drive', 'auto-cleanup': 'Limpieza' };
    if (!confirm(`¿Ejecutar backup automático: ${labels[type]}?`)) return;
    try {
      await backupAPI.triggerAuto(type);
      alert(`${labels[type]} iniciado.`);
      setTimeout(fetchBackupData, 3000);
    } catch (error) {
      console.error('Error triggering auto backup:', error);
      alert('Error al iniciar backup automático');
    }
  };

  const handleRestore = async (fileName) => {
    setRestoreConfirm(null);
    setRestoring(true);
    try {
      const res = await backupAPI.restore(fileName);
      alert(`Restore completado: ${res.data.executed} sentencias ejecutadas en ${res.data.duration}s`);
      fetchBackupData();
    } catch (error) {
      console.error('Error restoring backup:', error);
      alert('Error al restaurar backup: ' + (error.response?.data?.error || error.message));
    } finally {
      setRestoring(false);
    }
  };

  const fetchWhatsAppData = async () => {
    setWhatsappLoading(true);
    setWhatsappQR(null);
    try {
      const [statusRes, groupsRes] = await Promise.all([
        whatsappAPI.getStatus(),
        whatsappAPI.getGroups()
      ]);
      setWhatsappStatus(statusRes.data);
      setWhatsappGroups(groupsRes.data || []);
      if (!statusRes.data?.connected) {
        pollForQR(0);
      }
    } catch (error) {
      console.error('Error fetching WhatsApp data:', error);
      setWhatsappStatus({ connected: false, error: error.message });
    } finally {
      setWhatsappLoading(false);
    }
  };

  const pollForQR = async (attempt) => {
    if (attempt >= 15) {
      setWhatsappQR(null);
      return;
    }
    try {
      const qrRes = await whatsappAPI.getQR();
      if (qrRes.data?.qr) {
        setWhatsappQR(qrRes.data.qr);
        return;
      }
      if (qrRes.data?.data?.status === 'CONNECTED') {
        setWhatsappStatus({ connected: true, session: 'crm-session' });
        setWhatsappQR(null);
        return;
      }
      setTimeout(() => pollForQR(attempt + 1), 2000);
    } catch (error) {
      setTimeout(() => pollForQR(attempt + 1), 2000);
    }
  };

  const handleWhatsAppRestart = async () => {
    if (!confirm('¿Reiniciar sesión de WhatsApp? Necesitarás escanear el QR de nuevo.')) return;
    try {
      await whatsappAPI.restart();
      setWhatsappQR(null);
      setWhatsappStatus({ connected: false });
      setTimeout(fetchWhatsAppData, 3000);
    } catch (error) {
      console.error('Error restarting WhatsApp:', error);
      alert('Error al reiniciar sesión');
    }
  };

  const handleLinkGroup = async (crmGroupId, whatsappGroupId) => {
    try {
      await whatsappAPI.linkGroup(crmGroupId, whatsappGroupId);
      setGroups(groups.map(g => g.id === crmGroupId ? { ...g, whatsappGroupId } : g));
      setLinkingGroup(null);
      alert('Grupo vinculado correctamente');
    } catch (error) {
      console.error('Error linking group:', error);
      alert('Error al vincular grupo');
    }
  };

  const handleUnlinkGroup = async (crmGroupId) => {
    try {
      await whatsappAPI.linkGroup(crmGroupId, null);
      setGroups(groups.map(g => g.id === crmGroupId ? { ...g, whatsappGroupId: null } : g));
      alert('Grupo desvinculado');
    } catch (error) {
      console.error('Error unlinking group:', error);
      alert('Error al desvincular grupo');
    }
  };

  const handleSendStatusSummary = async (crmGroupId) => {
    if (!confirm('¿Enviar resumen de estado a este grupo de WhatsApp?')) return;
    try {
      await fetch(`http://localhost:3001/api/whatsapp/notify/status/${crmGroupId}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      alert('Resumen enviado');
    } catch (error) {
      console.error('Error sending status summary:', error);
      alert('Error al enviar resumen');
    }
  };

  const handleSendAllStatusSummaries = async () => {
    if (!confirm('¿Enviar resumen de estado a TODOS los grupos vinculados?')) return;
    try {
      await fetch('http://localhost:3001/api/whatsapp/notify/status-all', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      alert('Resúmenes enviados a todos los grupos');
    } catch (error) {
      console.error('Error sending all status summaries:', error);
      alert('Error al enviar resúmenes');
    }
  };

  const handleSendDeadlineWarnings = async () => {
    if (!confirm('¿Enviar alertas de fechas límite a todos los grupos?')) return;
    try {
      await fetch('http://localhost:3001/api/whatsapp/notify/deadlines', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        }
      });
      alert('Alertas de fecha límite enviadas');
    } catch (error) {
      console.error('Error sending deadline warnings:', error);
      alert('Error al enviar alertas');
    }
  };

  const handleSendTestMessage = async () => {
    if (!whatsappTestPhone || !whatsappTestMsg) {
      alert('Completa teléfono y mensaje');
      return;
    }
    setWhatsappTestSending(true);
    try {
      await whatsappAPI.send(whatsappTestPhone, whatsappTestMsg);
      alert('Mensaje enviado');
      setWhatsappTestMsg('');
    } catch (error) {
      console.error('Error sending test message:', error);
      alert('Error al enviar mensaje');
    } finally {
      setWhatsappTestSending(false);
    }
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    try {
      await adminAPI.createUser(newUser);
      setShowCreateUser(false);
      setNewUser({ name: '', email: '', password: '', phone: '', role: 'MEMBER', groupId: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating user:', error);
      alert(error.response?.data?.error || 'Error al crear usuario');
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    try {
      await adminAPI.updateUserRole(userId, newRole);
      setUsers(users.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (error) {
      console.error('Error updating role:', error);
      alert(error.response?.data?.error || 'Error al actualizar rol');
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!confirm('¿Estás seguro de eliminar este usuario?')) return;
    try {
      await adminAPI.deleteUser(userId);
      setUsers(users.filter(u => u.id !== userId));
    } catch (error) {
      console.error('Error deleting user:', error);
      alert(error.response?.data?.error || 'Error al eliminar usuario');
    }
  };

  const handleResetPassword = async (userId) => {
    if (!confirm('¿Resetear la contraseña? El usuario deberá cambiarla en el próximo login.')) return;
    try {
      await adminAPI.resetPassword(userId);
      alert('Contraseña reseteada. El usuario deberá cambiarla en el próximo login.');
    } catch (error) {
      console.error('Error resetting password:', error);
      alert(error.response?.data?.error || 'Error al resetear contraseña');
    }
  };

  const handleChangeGroup = async (userId, groupId) => {
    if (!groupId) return;
    try {
      await adminAPI.updateUserGroup(userId, groupId);
      fetchData();
    } catch (error) {
      console.error('Error changing group:', error);
      alert(error.response?.data?.error || 'Error al cambiar grupo');
    }
  };

  const handleAddToGroup = async (userId, groupId) => {
    if (!groupId) return;
    try {
      await adminAPI.addUserToGroup(userId, groupId);
      fetchData();
    } catch (error) {
      console.error('Error adding to group:', error);
      alert(error.response?.data?.error || 'Error al agregar al grupo');
    }
  };

  const handleRemoveFromGroup = async (userId, groupId) => {
    try {
      await adminAPI.removeUserFromGroup(userId, groupId);
      fetchData();
    } catch (error) {
      console.error('Error removing from group:', error);
      alert(error.response?.data?.error || 'Error al remover del grupo');
    }
  };

  const handleSetLeader = async (userId, groupId, isLeader) => {
    try {
      await adminAPI.setGroupLeader(userId, groupId, isLeader);
      fetchData();
    } catch (error) {
      console.error('Error setting leader:', error);
      alert(error.response?.data?.error || 'Error al asignar líder');
    }
  };

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    try {
      await adminAPI.createGroup(newGroup);
      setShowCreateGroup(false);
      setNewGroup({ name: '', description: '' });
      fetchData();
    } catch (error) {
      console.error('Error creating group:', error);
      alert(error.response?.data?.error || 'Error al crear grupo');
    }
  };

  const handleDeleteGroup = async (groupId, groupName) => {
    if (!confirm(`¿Eliminar el grupo "${groupName}"?`)) return;
    try {
      await adminAPI.deleteGroup(groupId);
      fetchData();
    } catch (error) {
      console.error('Error deleting group:', error);
      alert(error.response?.data?.error || 'Error al eliminar grupo');
    }
  };

  const handleHideTicket = async (ticketId) => {
    try {
      await ticketsAPI.hide(ticketId, true);
      fetchData();
    } catch (error) {
      console.error('Error hiding ticket:', error);
      alert(error.response?.data?.error || 'Error al ocultar ticket');
    }
  };

  const handleUnhideTicket = async (ticketId) => {
    try {
      await ticketsAPI.hide(ticketId, false);
      fetchData();
    } catch (error) {
      console.error('Error unhiding ticket:', error);
      alert(error.response?.data?.error || 'Error al mostrar ticket');
    }
  };

  const handleDeleteTicket = async (ticketId, ticketTitle) => {
    if (!confirm(`¿ELIMINAR el ticket "${ticketTitle}"? Esta acción no se puede deshacer.`)) return;
    try {
      await ticketsAPI.delete(ticketId);
      fetchData();
    } catch (error) {
      console.error('Error deleting ticket:', error);
      alert(error.response?.data?.error || 'Error al eliminar ticket');
    }
  };

  const filteredUsers = users.filter(u => {
    const matchesSearch = u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         u.email.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRole = filterRole === 'all' || u.role === filterRole;
    return matchesSearch && matchesRole;
  });

  const openCreateUser = () => {
    fetchAvailableGroups();
    setShowCreateUser(true);
  };

  if (loading) {
    return <div className="text-center py-8">Cargando panel de administración...</div>;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2">Panel de Administración</h1>
      <p className="text-gray-500 mb-6">Consola técnica — {user.name}</p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {[
          { id: 'overview', label: 'Vista General' },
          { id: 'users', label: 'Gestión de Usuarios' },
          { id: 'groups', label: 'Gestión de Grupos' },
          { id: 'whatsapp', label: 'WhatsApp' },
          { id: 'tickets', label: 'Gestión de Tickets' },
          { id: 'backups', label: 'Backups' },
          { id: 'security', label: 'Seguridad' },
          { id: 'system', label: 'Sistema' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg ${activeTab === tab.id ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {activeTab === 'overview' && stats && (
        <div>
          {/* Personal Space */}
          {personalGroup && (
            <div className="card mb-6 border-2 border-purple-200">
              <h2 className="text-xl font-semibold mb-2 text-purple-800">🏠 Mi Espacio Personal</h2>
              <p className="text-sm text-gray-500 mb-3">Tus gestiones privadas</p>
              <Link
                to={`/groups/${personalGroup.id}`}
                className="block p-3 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-purple-800">{personalGroup.name}</p>
                    <p className="text-sm text-purple-600">{personalGroup._count?.tickets || 0} tickets</p>
                  </div>
                  <span className="text-purple-600">→</span>
                </div>
              </Link>
              <Link
                to={`/create-ticket?groupId=${personalGroup.id}`}
                className="block mt-2 text-center text-sm text-purple-600 hover:text-purple-800"
              >
                + Crear ticket personal
              </Link>
            </div>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="card text-center">
              <p className="text-3xl font-bold text-blue-600">{stats.totalUsers}</p>
              <p className="text-gray-600">Usuarios</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-green-600">{stats.totalGroups}</p>
              <p className="text-gray-600">Grupos</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-yellow-600">{stats.totalTickets}</p>
              <p className="text-gray-600">Tickets</p>
            </div>
            <div className="card text-center">
              <p className="text-3xl font-bold text-red-600">{stats.ticketsByStatus?.PENDIENTE_PASTORA || 0}</p>
              <p className="text-gray-600">Pendientes</p>
            </div>
          </div>

          {/* Role Distribution */}
          <div className="card mb-6">
            <h2 className="text-xl font-semibold mb-4">Distribución de Roles</h2>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <p className="text-2xl font-bold text-purple-600">
                  {users.filter(u => u.role === 'ADMIN').length}
                </p>
                <p className="text-sm text-gray-600">Administradores</p>
              </div>
              <div className="text-center p-4 bg-pink-50 rounded-lg">
                <p className="text-2xl font-bold text-pink-600">
                  {users.filter(u => u.role === 'PASTORA').length}
                </p>
                <p className="text-sm text-gray-600">Pastoras</p>
              </div>
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <p className="text-2xl font-bold text-blue-600">
                  {users.filter(u => u.role === 'MEMBER').length}
                </p>
                <p className="text-sm text-gray-600">Miembros</p>
              </div>
            </div>
          </div>

          {/* Tickets by Status */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Tickets por Estado</h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {Object.entries(stats.ticketsByStatus || {}).map(([status, count]) => (
                <div key={status} className="text-center p-3 bg-gray-50 rounded-lg">
                  <p className="text-2xl font-bold">{count}</p>
                  <p className="text-xs text-gray-600">{status.replace(/_/g, ' ')}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Users Tab */}
      {activeTab === 'users' && (
        <div>
          <div className="flex flex-wrap justify-between items-center gap-4 mb-4">
            <h2 className="text-xl font-semibold">Usuarios ({filteredUsers.length})</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Buscar por nombre o email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              />
              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm"
              >
                <option value="all">Todos los roles</option>
                <option value="ADMIN">Admin</option>
                <option value="PASTORA">Pastora</option>
                <option value="MEMBER">Miembro</option>
              </select>
              <button onClick={openCreateUser} className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm">
                + Crear Usuario
              </button>
            </div>
          </div>

          {/* Create User Form */}
          {showCreateUser && (
            <div className="card mb-4">
              <h3 className="font-semibold mb-4">Crear Nuevo Usuario</h3>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nombre"
                  value={newUser.name}
                  onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                  required
                  minLength={3}
                />
                <input
                  type="text"
                  placeholder="Apellido"
                  value={newUser.apellido}
                  onChange={(e) => setNewUser({ ...newUser, apellido: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                  required
                  minLength={3}
                />
                <input
                  type="password"
                  placeholder="Contraseña"
                  value={newUser.password}
                  onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                  required
                />
                <input
                  type="tel"
                  placeholder="Teléfono (opcional)"
                  value={newUser.phone}
                  onChange={(e) => setNewUser({ ...newUser, phone: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
                <select
                  value={newUser.role}
                  onChange={(e) => setNewUser({ ...newUser, role: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                >
                  <option value="MEMBER">Miembro</option>
                  <option value="PASTORA">Pastora</option>
                  <option value="ADMIN">Administrador</option>
                </select>
                <select
                  value={newUser.groupId}
                  onChange={(e) => setNewUser({ ...newUser, groupId: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                >
                  <option value="">Sin grupo</option>
                  {availableGroups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
                <div className="flex space-x-2 md:col-span-2">
                  <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                    Crear
                  </button>
                  <button type="button" onClick={() => setShowCreateUser(false)} className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Users List */}
          <div className="card">
            <div className="space-y-3">
              {filteredUsers.map(u => (
                <div key={u.id} className="p-4 border rounded-lg hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <p className="font-medium">{u.name}</p>
                      <p className="text-sm text-gray-500">{u.email}</p>
                      <p className="text-xs text-gray-400 mt-1">
                        Creado: {new Date(u.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex items-center space-x-3">
                      <select
                        value={u.role}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="border rounded px-2 py-1 text-sm"
                      >
                        <option value="MEMBER">Miembro</option>
                        <option value="PASTORA">Pastora</option>
                        <option value="ADMIN">Admin</option>
                      </select>
                      {u.id !== user.id && (
                        <>
                          <button
                            onClick={() => handleResetPassword(u.id)}
                            className="text-yellow-600 hover:text-yellow-800 text-sm"
                            title="Resetear contraseña"
                          >
                            Reset Pass
                          </button>
                          <button
                            onClick={() => handleDeleteUser(u.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            Eliminar
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  
                  {/* Group management - single group */}
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-500 mb-2">Grupo:</p>
                    <div className="flex items-center gap-2">
                      {u.groups?.length > 0 ? (
                        <span className="inline-flex items-center bg-blue-100 text-blue-800 text-xs px-2 py-1 rounded">
                          {u.groups[0].name}
                        </span>
                      ) : (
                        <span className="text-xs text-gray-400">Sin grupo</span>
                      )}
                      {u.id !== user.id && u.groups?.length > 0 && (
                        <>
                          <button
                            onClick={() => handleSetLeader(u.id, u.groups[0].id, !u.groups[0].isLeader)}
                            className={`text-xs px-2 py-1 rounded ${
                              u.groups[0].isLeader
                                ? 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                            }`}
                          >
                            {u.groups[0].isLeader ? '⭐ Líder' : 'Asignar líder'}
                          </button>
                          <select
                            onChange={(e) => { handleChangeGroup(u.id, e.target.value); e.target.value = ''; }}
                            className="border rounded text-xs px-2 py-1"
                            defaultValue=""
                          >
                            <option value="" disabled>Cambiar a...</option>
                            {groups.map(g => (
                              <option key={g.id} value={g.id}>{g.name}</option>
                            ))}
                          </select>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Groups Tab */}
      {activeTab === 'groups' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Grupos ({groups.length})</h2>
            <button
              onClick={() => setShowCreateGroup(true)}
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              + Crear Grupo
            </button>
          </div>

          {showCreateGroup && (
            <div className="card mb-4">
              <h3 className="font-semibold mb-4">Crear Nuevo Grupo</h3>
              <form onSubmit={handleCreateGroup} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input
                  type="text"
                  placeholder="Nombre del grupo"
                  value={newGroup.name}
                  onChange={(e) => setNewGroup({ ...newGroup, name: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                  required
                  minLength={2}
                />
                <input
                  type="text"
                  placeholder="Descripción (opcional)"
                  value={newGroup.description}
                  onChange={(e) => setNewGroup({ ...newGroup, description: e.target.value })}
                  className="border rounded-lg px-3 py-2"
                />
                <div className="flex space-x-2 md:col-span-2">
                  <button type="submit" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700">
                    Crear
                  </button>
                  <button type="button" onClick={() => setShowCreateGroup(false)} className="bg-gray-300 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-400">
                    Cancelar
                  </button>
                </div>
              </form>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {groups.map(g => (
              <div key={g.id} className="card">
                <h3 className="font-semibold text-lg">{g.name}</h3>
                {g.description && <p className="text-gray-600 text-sm mt-1">{g.description}</p>}
                <div className="flex justify-between mt-4 text-sm text-gray-500">
                  <span>{g._count.members} miembros</span>
                  <span>{g._count.tickets} tickets</span>
                </div>
                <div className="mt-3 pt-3 border-t">
                  <button
                    onClick={() => handleDeleteGroup(g.id, g.name)}
                    className="text-red-600 hover:text-red-800 text-sm"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* WhatsApp Tab */}
      {activeTab === 'whatsapp' && (
        <div>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold">WhatsApp (WPPConnect)</h2>
            <button
              onClick={fetchWhatsAppData}
              disabled={whatsappLoading}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
            >
              {whatsappLoading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          {/* Connection Status */}
          <div className="card mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${whatsappStatus?.connected ? 'bg-green-500' : 'bg-red-500'}`}></div>
                <div>
                  <p className="font-medium">
                    {whatsappStatus?.connected ? 'Conectado a WhatsApp' : 'Desconectado'}
                  </p>
                  {whatsappStatus?.session && (
                    <p className="text-xs text-gray-500">Sesión: {whatsappStatus.session}</p>
                  )}
                </div>
              </div>
              <button
                onClick={handleWhatsAppRestart}
                className="bg-yellow-500 text-white px-4 py-2 rounded-lg hover:bg-yellow-600 text-sm"
              >
                Reiniciar Sesión
              </button>
            </div>
          </div>

          {/* QR Code */}
          {!whatsappStatus?.connected && (
            <div className="card mb-6">
              <h3 className="font-semibold mb-4">Código QR</h3>
              {whatsappQR ? (
                <div className="flex flex-col items-center">
                  <img src={whatsappQR} alt="QR Code" className="border rounded-lg" style={{ maxWidth: 300 }} />
                  <p className="text-sm text-gray-500 mt-3">Escanea con tu WhatsApp (Ajustes &gt; Dispositivos vinculados)</p>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  {whatsappLoading ? 'Generando QR... puede tardar 15-20 segundos' : 'Haz clic en "Actualizar" para obtener el QR'}
                </div>
              )}
            </div>
          )}

          {/* Link CRM Groups to WhatsApp Groups */}
          <div className="card mb-6">
            <h3 className="font-semibold mb-4">Vincular Grupos CRM ↔ WhatsApp</h3>
            <p className="text-sm text-gray-500 mb-4">
              Asociá cada grupo del CRM con su grupo de WhatsApp correspondiente. Las notificaciones de tickets se enviarán automáticamente.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-3">Grupo CRM</th>
                    <th className="text-left py-2 px-3">Grupo WhatsApp</th>
                    <th className="text-left py-2 px-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(g => (
                    <tr key={g.id} className="border-b hover:bg-gray-50">
                      <td className="py-2 px-3 font-medium">{g.name}</td>
                      <td className="py-2 px-3">
                        {g.whatsappGroupId ? (
                          <span className="inline-flex items-center bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
                            {whatsappGroups.find(wg => wg.id === g.whatsappGroupId)?.name || g.whatsappGroupId}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">No vinculado</span>
                        )}
                      </td>
                      <td className="py-2 px-3">
                        {linkingGroup === g.id ? (
                          <div className="flex items-center gap-2">
                            <select
                              onChange={(e) => {
                                if (e.target.value) handleLinkGroup(g.id, e.target.value);
                                setLinkingGroup(null);
                              }}
                              className="border rounded px-2 py-1 text-xs"
                              defaultValue=""
                              autoFocus
                            >
                              <option value="" disabled>Seleccionar grupo WA...</option>
                              {whatsappGroups.map(wg => (
                                <option key={wg.id} value={wg.id}>{wg.name || wg.id}</option>
                              ))}
                            </select>
                            <button onClick={() => setLinkingGroup(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
                          </div>
                        ) : g.whatsappGroupId ? (
                          <button
                            onClick={() => handleUnlinkGroup(g.id)}
                            className="text-red-600 hover:text-red-800 text-xs"
                          >
                            Desvincular
                          </button>
                        ) : (
                          <button
                            onClick={() => setLinkingGroup(g.id)}
                            className="text-blue-600 hover:text-blue-800 text-xs"
                          >
                            + Vincular
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {whatsappGroups.length === 0 && whatsappStatus?.connected && (
              <p className="text-sm text-yellow-600 mt-3">
                No se encontraron grupos de WhatsApp. Creá grupos en tu celular primero.
              </p>
            )}
          </div>

          {/* Notification Actions */}
          <div className="card mb-6">
            <h3 className="font-semibold mb-4">Acciones de Notificación</h3>
            <p className="text-sm text-gray-500 mb-4">
              Enviá resúmenes de estado y alertas de fechas límite a los grupos de WhatsApp vinculados.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <button
                onClick={handleSendAllStatusSummaries}
                disabled={!whatsappStatus?.connected}
                className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-blue-600 text-lg">📊</span>
                  <span className="font-medium">Enviar Resumen de Estado</span>
                </div>
                <p className="text-xs text-gray-500">A todos los grupos vinculados (cada 3 días automático)</p>
              </button>
              <button
                onClick={handleSendDeadlineWarnings}
                disabled={!whatsappStatus?.connected}
                className="p-4 border-2 border-red-200 rounded-lg hover:bg-red-50 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-red-600 text-lg">⚠️</span>
                  <span className="font-medium">Enviar Alertas de Fecha Límite</span>
                </div>
                <p className="text-xs text-gray-500">A grupos con casos próximos a vencer (diario automático)</p>
              </button>
            </div>
          </div>

          {/* Test Message */}
          <div className="card">
            <h3 className="font-semibold mb-4">Enviar Mensaje de Prueba</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <input
                type="tel"
                placeholder="Teléfono (ej: 541130901676)"
                value={whatsappTestPhone}
                onChange={(e) => setWhatsappTestPhone(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
              <input
                type="text"
                placeholder="Mensaje de prueba"
                value={whatsappTestMsg}
                onChange={(e) => setWhatsappTestMsg(e.target.value)}
                className="border rounded-lg px-3 py-2"
              />
              <button
                onClick={handleSendTestMessage}
                disabled={whatsappTestSending || !whatsappStatus?.connected}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {whatsappTestSending ? 'Enviando...' : 'Enviar'}
              </button>
            </div>
            {!whatsappStatus?.connected && (
              <p className="text-sm text-red-500 mt-2">Conectá WhatsApp primero para enviar mensajes.</p>
            )}
          </div>
        </div>
      )}

      {/* Tickets Tab */}
      {activeTab === 'tickets' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Todos los Tickets ({tickets.length})</h2>
          </div>
          <div className="card">
            <div className="space-y-3">
              {tickets.length === 0 ? (
                <p className="text-gray-500 text-center py-4">No hay tickets.</p>
              ) : (
                tickets.map(ticket => (
                  <div key={ticket.id} className={`p-4 border rounded-lg ${ticket.hidden ? 'bg-gray-100 opacity-70' : 'hover:bg-gray-50'}`}>
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <Link to={`/tickets/${ticket.id}`} className="font-medium hover:text-blue-600">{ticket.title}</Link>
                          {ticket.hidden && (
                            <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded">OCULTO</span>
                          )}
                          {ticket.priority && (
                            <span className={`text-xs font-bold ${
                              ticket.priority === 'ALTA' ? 'text-red-600' :
                              ticket.priority === 'MEDIA' ? 'text-yellow-600' :
                              'text-green-600'
                            }`}>• {ticket.priority}</span>
                          )}
                          {ticket.visibility && (
                            <span className={`text-xs px-1.5 py-0.5 rounded ${
                              ticket.visibility === 'PUBLIC' ? 'bg-blue-100 text-blue-700' :
                              ticket.visibility === 'USER_SPECIFIC' ? 'bg-orange-100 text-orange-700' :
                              ticket.visibility === 'INICIAL' ? 'bg-gray-100 text-gray-700' :
                              'bg-purple-100 text-purple-700'
                            }`}>
                              {ticket.visibility === 'PUBLIC' ? '🌐 Iglesia' :
                               ticket.visibility === 'USER_SPECIFIC'
                                 ? `👤 ${ticket.viewers?.map(v => v.user.name).join(', ') || ''}`
                                 : ticket.visibility === 'INICIAL' ? '📝 Inicial'
                                 : '🔒 Grupo'}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-xs text-gray-500 mt-1">
                          <span>{ticket.group.name}</span>
                          <span>{new Date(ticket.createdAt).toLocaleDateString()}</span>
                          {ticket.deadline && (
                            <span className={new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO' ? 'text-red-600 font-bold' : ''}>
                              Vence: {new Date(ticket.deadline).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-1 rounded ${
                          ticket.status === 'PENDIENTE_PASTORA' ? 'bg-yellow-100 text-yellow-800' :
                          ticket.status === 'APROBADO' ? 'bg-green-100 text-green-800' :
                          ticket.status === 'EN_PROGRESO' ? 'bg-blue-100 text-blue-800' :
                          ticket.status === 'COMPLETADO' ? 'bg-gray-100 text-gray-800' :
                          'bg-red-100 text-red-800'
                        }`}>{ticket.status.replace(/_/g, ' ')}</span>
                        <select
                          onChange={(e) => {
                            const action = e.target.value;
                            if (action === 'hide') handleHideTicket(ticket.id);
                            else if (action === 'unhide') handleUnhideTicket(ticket.id);
                            else if (action === 'delete') handleDeleteTicket(ticket.id, ticket.title);
                            e.target.value = '';
                          }}
                          defaultValue=""
                          className="border rounded text-xs px-2 py-1"
                        >
                          <option value="" disabled>Acciones</option>
                          {!ticket.hidden && <option value="hide">Ocultar</option>}
                          {ticket.hidden && <option value="unhide">Mostrar</option>}
                          <option value="delete">Eliminar</option>
                        </select>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Backups Tab */}
      {activeTab === 'backups' && (
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold">Sistema de Backups</h2>
            <button
              onClick={() => fetchBackupData()}
              disabled={backupLoading}
              className="bg-gray-200 text-gray-700 px-4 py-2 rounded-lg hover:bg-gray-300 text-sm disabled:opacity-50"
            >
              {backupLoading ? 'Cargando...' : 'Actualizar'}
            </button>
          </div>

          {backupLoading && !backupStats ? (
            <div className="text-center py-8 text-gray-500">Cargando datos de backups...</div>
          ) : (
            <>
              {/* Backup Stats Cards */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="card text-center">
                  <p className="text-3xl font-bold text-blue-600">{backupStats?.total || 0}</p>
                  <p className="text-gray-600">Total Backups</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-bold text-green-600">{backupStats?.successful || 0}</p>
                  <p className="text-gray-600">Exitosos</p>
                </div>
                <div className="card text-center">
                  <p className="text-3xl font-bold text-red-600">{backupStats?.failed || 0}</p>
                  <p className="text-gray-600">Fallidos</p>
                </div>
                <div className="card text-center">
                  <p className="text-lg font-bold text-purple-600">
                    {backupStats?.lastBackup?.fileName || 'N/A'}
                  </p>
                  <p className="text-gray-600">Último Backup</p>
                  {backupStats?.lastBackup?.createdAt && (
                    <p className="text-xs text-gray-400 mt-1">
                      {new Date(backupStats.lastBackup.createdAt).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>

              {/* Backup Actions */}
              <div className="card mb-6">
                <h3 className="font-semibold mb-4">Acciones de Backup</h3>

                {/* Manual Download */}
                <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-green-800">Descargar Backup Completo</p>
                      <p className="text-sm text-green-600">DB + código fuente en un .tar.gz para tu máquina</p>
                    </div>
                    <button
                      onClick={handleDownloadBackup}
                      disabled={backupTriggering}
                      className="bg-green-600 text-white px-5 py-2.5 rounded-lg hover:bg-green-700 font-medium disabled:opacity-50 flex items-center gap-2"
                    >
                      {backupTriggering ? (
                        <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                        </svg>
                      )}
                      Descargar Ahora
                    </button>
                  </div>
                </div>

                {/* Auto Backups - Independent */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <button
                    onClick={() => handleAutoBackup('auto-db')}
                    className="p-4 border-2 border-blue-200 rounded-lg hover:bg-blue-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-blue-600 text-lg">🗄️</span>
                      <span className="font-medium">DB → Drive</span>
                    </div>
                    <p className="text-xs text-gray-500">Dump de PostgreSQL subido a Drive/daily</p>
                  </button>
                  <button
                    onClick={() => handleAutoBackup('auto-code')}
                    className="p-4 border-2 border-purple-200 rounded-lg hover:bg-purple-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-purple-600 text-lg">📦</span>
                      <span className="font-medium">Código → Drive</span>
                    </div>
                    <p className="text-xs text-gray-500">git archive subido a Drive/weekly</p>
                  </button>
                  <button
                    onClick={() => handleAutoBackup('auto-cleanup')}
                    className="p-4 border-2 border-orange-200 rounded-lg hover:bg-orange-50 text-left transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-orange-600 text-lg">🧹</span>
                      <span className="font-medium">Limpiar Drive</span>
                    </div>
                    <p className="text-xs text-gray-500">Borrar diarios &gt;7d y semanales &gt;28d</p>
                  </button>
                </div>
              </div>

              {/* Restore from Drive */}
              <div className="card mb-6">
                <h3 className="font-semibold mb-4">Restaurar Backup desde Drive</h3>
                {availableBackups.length === 0 ? (
                  <p className="text-gray-500 text-center py-4">No hay backups disponibles en Drive.</p>
                ) : (
                  <div className="space-y-2">
                    {availableBackups.map((backup, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border">
                        <div className="flex items-center gap-3">
                          <span className={`w-3 h-3 rounded-full ${backup.isDump ? 'bg-blue-500' : 'bg-green-500'}`}></span>
                          <div>
                            <p className="font-mono text-sm">{backup.name}</p>
                            <p className="text-xs text-gray-500">
                              {backup.date || 'Fecha desconocida'} · {(backup.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {restoreConfirm === idx ? (
                            <>
                              <span className="text-xs text-red-600 font-medium">¿Restaurar?</span>
                              <button
                                onClick={() => handleRestore(backup.name)}
                                disabled={restoring}
                                className="bg-red-600 text-white px-3 py-1.5 rounded text-sm hover:bg-red-700 disabled:opacity-50"
                              >
                                {restoring ? 'Restaurando...' : 'Sí, restaurar'}
                              </button>
                              <button
                                onClick={() => setRestoreConfirm(null)}
                                disabled={restoring}
                                className="bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setRestoreConfirm(idx)}
                              className="bg-orange-500 text-white px-3 py-1.5 rounded text-sm hover:bg-orange-600"
                            >
                              Restaurar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Recent Logs */}
                <div className="card">
                  <h3 className="font-semibold mb-4">Últimos Procesos ({backupLogs.length})</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {backupLogs.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No hay logs de backup aún.</p>
                    ) : (
                      backupLogs.map(log => (
                        <div key={log.id} className={`p-3 rounded-lg border ${
                          log.status === 'success' ? 'bg-green-50 border-green-200' :
                          log.status === 'error' ? 'bg-red-50 border-red-200' :
                          log.status === 'running' ? 'bg-yellow-50 border-yellow-200' :
                          'bg-gray-50 border-gray-200'
                        }`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${
                                log.status === 'success' ? 'bg-green-500' :
                                log.status === 'error' ? 'bg-red-500' :
                                'bg-yellow-500'
                              }`}></span>
                              <span className="font-medium text-sm">{log.type}</span>
                              <span className={`text-xs px-2 py-0.5 rounded ${
                                log.status === 'success' ? 'bg-green-100 text-green-800' :
                                log.status === 'error' ? 'bg-red-100 text-red-800' :
                                'bg-yellow-100 text-yellow-800'
                              }`}>{log.status}</span>
                            </div>
                            <span className="text-xs text-gray-500">
                              {new Date(log.createdAt).toLocaleString()}
                            </span>
                          </div>
                          {log.fileName && (
                            <p className="text-xs text-gray-600 mt-1">{log.fileName} {log.fileSize && `(${log.fileSize})`}</p>
                          )}
                          {log.duration && (
                            <p className="text-xs text-gray-500 mt-1">Duración: {log.duration}s</p>
                          )}
                          {log.message && log.status === 'error' && (
                            <p className="text-xs text-red-600 mt-1 truncate">{log.message}</p>
                          )}
                          <p className="text-xs text-gray-400 mt-1">Por: {log.triggeredBy}</p>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Drive Files */}
                <div className="card">
                  <h3 className="font-semibold mb-4">Archivos en Google Drive (últimos 30 días)</h3>
                  <div className="space-y-2 max-h-96 overflow-y-auto">
                    {backupFiles.length === 0 ? (
                      <p className="text-gray-500 text-center py-4">No hay archivos en Drive.</p>
                    ) : (
                      backupFiles.map((file, idx) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                          <div className="flex items-center gap-2">
                            <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                            <span className="text-sm font-mono">{file.name}</span>
                          </div>
                          <span className="text-xs text-gray-500">
                            {(file.size / 1024 / 1024).toFixed(2)} MB
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>

              {/* Backup Schedule Info */}
              <div className="card mt-6">
                <h3 className="font-semibold mb-3">Programación de Backups</h3>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="font-medium text-blue-800">Automático (GitHub Actions)</p>
                    <p className="text-blue-600">Diario a las 03:00 UTC</p>
                  </div>
                  <div className="p-3 bg-green-50 rounded-lg">
                    <p className="font-medium text-green-800">Retención Diaria</p>
                    <p className="text-green-600">7 días</p>
                  </div>
                  <div className="p-3 bg-purple-50 rounded-lg">
                    <p className="font-medium text-purple-800">Retención Semanal</p>
                    <p className="text-purple-600">4 semanas</p>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Security Tab */}
      {activeTab === 'security' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Seguridad del Sistema</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Registration Security */}
            <div className="card">
              <h3 className="font-semibold mb-3">Registro de Usuarios</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Roles auto-asignados bloqueados</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Solo MEMBER en registro público</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Asignación de roles solo por Admin</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
              </div>
            </div>

            {/* Authentication */}
            <div className="card">
              <h3 className="font-semibold mb-3">Autenticación</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>JWT con expiración 7 días</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Passwords hasheados con bcrypt</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Middleware de autenticación</span>
                  <span className="text-green-600 font-medium">✓ ACTIVO</span>
                </div>
              </div>
            </div>

            {/* Access Control */}
            <div className="card">
              <h3 className="font-semibold mb-3">Control de Acceso</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 bg-blue-50 rounded">
                  <span>Admin: acceso total al sistema</span>
                  <span className="text-blue-600 font-medium">3 usuarios</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-purple-50 rounded">
                  <span>Pastora: gestión de sus grupos</span>
                  <span className="text-purple-600 font-medium">1 usuario</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                  <span>Miembro: solo ve sus grupos</span>
                  <span className="text-gray-600 font-medium">3 usuarios</span>
                </div>
              </div>
            </div>

            {/* Vulnerabilities */}
            <div className="card">
              <h3 className="font-semibold mb-3">Estado de Vulnerabilidades</h3>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Role escalation via register</span>
                  <span className="text-green-600 font-medium">✓ CORREGIDO</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-green-50 rounded">
                  <span>Endpoints sin auth</span>
                  <span className="text-green-600 font-medium">✓ PROTEGIDOS</span>
                </div>
                <div className="flex items-center justify-between p-2 bg-yellow-50 rounded">
                  <span>Rate limiting</span>
                  <span className="text-yellow-600 font-medium">⚠ PENDIENTE</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* System Tab */}
      {activeTab === 'system' && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Información del Sistema</h2>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Tech Stack */}
            <div className="card">
              <h3 className="font-semibold mb-3">Stack Tecnológico</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Backend</span>
                  <span className="font-mono">Node.js + Express</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Frontend</span>
                  <span className="font-mono">React + Vite + Tailwind</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Base de datos</span>
                  <span className="font-mono">PostgreSQL 15</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>ORM</span>
                  <span className="font-mono">Prisma</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Containerización</span>
                  <span className="font-mono">Docker</span>
                </div>
              </div>
            </div>

            {/* Database Stats */}
            <div className="card">
              <h3 className="font-semibold mb-3">Estadísticas de Base de Datos</h3>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Tablas principales</span>
                  <span className="font-mono">User, Group, Ticket, Comment, Notification</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Total usuarios</span>
                  <span className="font-mono">{stats?.totalUsers || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Total grupos</span>
                  <span className="font-mono">{stats?.totalGroups || 0}</span>
                </div>
                <div className="flex justify-between p-2 bg-gray-50 rounded">
                  <span>Total tickets</span>
                  <span className="font-mono">{stats?.totalTickets || 0}</span>
                </div>
              </div>
            </div>

            {/* API Endpoints */}
            <div className="card md:col-span-2">
              <h3 className="font-semibold mb-3">Endpoints API</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                <div className="p-3 bg-gray-50 rounded">
                  <p className="font-medium mb-2">Auth</p>
                  <ul className="space-y-1 text-gray-600">
                    <li className="font-mono text-xs">POST /api/auth/register</li>
                    <li className="font-mono text-xs">POST /api/auth/login</li>
                    <li className="font-mono text-xs">GET /api/auth/me</li>
                    <li className="font-mono text-xs">GET /api/auth/groups</li>
                  </ul>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <p className="font-medium mb-2">Admin</p>
                  <ul className="space-y-1 text-gray-600">
                    <li className="font-mono text-xs">GET /api/admin/stats</li>
                    <li className="font-mono text-xs">GET /api/admin/users</li>
                    <li className="font-mono text-xs">POST /api/admin/users</li>
                    <li className="font-mono text-xs">PATCH /api/admin/users/:id/role</li>
                    <li className="font-mono text-xs">DELETE /api/admin/users/:id</li>
                    <li className="font-mono text-xs">GET /api/admin/groups</li>
                    <li className="font-mono text-xs">POST /api/admin/users/:id/groups/:id</li>
                    <li className="font-mono text-xs">DELETE /api/admin/users/:id/groups/:id</li>
                  </ul>
                </div>
                <div className="p-3 bg-gray-50 rounded">
                  <p className="font-medium mb-2">WhatsApp</p>
                  <ul className="space-y-1 text-gray-600">
                    <li className="font-mono text-xs">POST /api/whatsapp/webhook</li>
                    <li className="font-mono text-xs">GET /api/whatsapp/webhook</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPanel;
