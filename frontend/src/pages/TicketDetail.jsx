import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ticketsAPI, groupsAPI } from '../services/api';

function TicketDetail({ user }) {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [comment, setComment] = useState('');
  const [isActionPlan, setIsActionPlan] = useState(false);
  const [approveDeadline, setApproveDeadline] = useState('');
  const [approvePriority, setApprovePriority] = useState('BAJA');
  const [approveVisibility, setApproveVisibility] = useState('PRIVATE');
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [groupMembers, setGroupMembers] = useState([]);
  const [selectedViewerIds, setSelectedViewerIds] = useState([]);
  const [allGroups, setAllGroups] = useState([]);
  const [isLeader, setIsLeader] = useState(false);
  const [editDeadline, setEditDeadline] = useState('');
  const [isEditingDeadline, setIsEditingDeadline] = useState(false);
  const [editPriority, setEditPriority] = useState('');
  const [isEditingPriority, setIsEditingPriority] = useState(false);
  const [editVisibility, setEditVisibility] = useState('');
  const [isEditingVisibility, setIsEditingVisibility] = useState(false);
  const [editGroupId, setEditGroupId] = useState('');
  const [isEditingGroup, setIsEditingGroup] = useState(false);
  const [editViewerIds, setEditViewerIds] = useState([]);
  const [isEditingViewers, setIsEditingViewers] = useState(false);

  useEffect(() => {
    fetchTicket();
  }, [id]);

  const fetchTicket = async () => {
    try {
      const res = await ticketsAPI.getById(id);
      setTicket(res.data);
      if (res.data.group?.id) {
        try {
          const groupRes = await groupsAPI.getById(res.data.group.id);
          const members = groupRes.data.members || [];
          const leaderMember = members.find(m => m.isLeader && m.user.id === user.id);
          setIsLeader(!!leaderMember);
        } catch (e) {
          setIsLeader(false);
        }
      }
    } catch (error) {
      console.error('Error fetching ticket:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddComment = async (e) => {
    e.preventDefault();
    if (!comment.trim()) return;

    try {
      await ticketsAPI.addComment(id, { content: comment, isActionPlan });
      setComment('');
      setIsActionPlan(false);
      fetchTicket();
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  const handleStatusChange = async (newStatus, deadline = null, priority = null, visibility = null, viewerIds = null) => {
    try {
      const data = { status: newStatus };
      if (deadline) data.deadline = deadline;
      if (priority) data.priority = priority;
      if (visibility) data.visibility = visibility;
      if (viewerIds) data.viewerIds = viewerIds;
      await ticketsAPI.update(id, data);
      fetchTicket();
    } catch (error) {
      console.error('Error updating status:', error);
    }
  };

  const handleApprove = () => {
    if (!approveDeadline) {
      alert('Debes seleccionar una fecha límite para aprobar.');
      return;
    }
    if (approveVisibility === 'USER_SPECIFIC' && selectedViewerIds.length === 0) {
      alert('Debes seleccionar al menos un usuario.');
      return;
    }
    handleStatusChange('APROBADO', approveDeadline, approvePriority, approveVisibility, approveVisibility === 'USER_SPECIFIC' ? selectedViewerIds : null);
    setShowApproveModal(false);
    setApproveDeadline('');
    setApprovePriority('BAJA');
    setApproveVisibility('PRIVATE');
    setSelectedViewerIds([]);
  };

  const fetchGroupMembers = async (groupId) => {
    try {
      const res = await groupsAPI.getById(groupId);
      const members = res.data.members?.map(m => m.user) || [];
      setGroupMembers(members);
    } catch (error) {
      console.error('Error fetching group members:', error);
    }
  };

  const handleSaveDeadline = async () => {
    if (!editDeadline) {
      alert('Debes seleccionar una fecha límite.');
      return;
    }
    try {
      await ticketsAPI.update(id, { deadline: editDeadline });
      setIsEditingDeadline(false);
      fetchTicket();
    } catch (error) {
      console.error('Error updating deadline:', error);
    }
  };

  const getMinDate = () => {
    const today = new Date();
    return today.toISOString().split('T')[0];
  };

  const handleSavePriority = async () => {
    try {
      await ticketsAPI.update(id, { priority: editPriority });
      setIsEditingPriority(false);
      fetchTicket();
    } catch (error) {
      console.error('Error updating priority:', error);
    }
  };

  const handleSaveVisibility = async () => {
    try {
      const data = { visibility: editVisibility };
      if (editVisibility === 'USER_SPECIFIC' && editViewerIds.length > 0) {
        data.viewerIds = editViewerIds;
      }
      await ticketsAPI.update(id, data);
      setIsEditingVisibility(false);
      fetchTicket();
    } catch (error) {
      console.error('Error updating visibility:', error);
    }
  };

  const handleSaveGroup = async () => {
    if (!editGroupId || editGroupId === ticket.group.id) {
      setIsEditingGroup(false);
      return;
    }
    try {
      await ticketsAPI.update(id, { groupId: editGroupId, visibility: 'INICIAL', viewerIds: [] });
      setIsEditingGroup(false);
      fetchTicket();
    } catch (error) {
      console.error('Error updating group:', error);
    }
  };

  const fetchAllGroups = async () => {
    try {
      const res = await groupsAPI.getAll();
      setAllGroups(res.data);
    } catch (error) {
      console.error('Error fetching groups:', error);
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
    return <div className="text-center py-8">Cargando ticket...</div>;
  }

  if (!ticket) {
    return <div className="text-center py-8">Ticket no encontrado</div>;
  }

  return (
    <div>
      <div className="mb-6">
        <Link to={`/groups/${ticket.group.id}`} className="text-blue-600 hover:underline">
          ← Volver a {ticket.group.name}
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Ticket Info */}
        <div className="lg:col-span-2">
          <div className="card mb-6">
            <div className="flex justify-between items-start mb-4">
              <h1 className="text-2xl font-bold">{ticket.title}</h1>
              <span className={getStatusClass(ticket.status)}>
                {getStatusText(ticket.status)}
              </span>
            </div>
            
            <p className="text-gray-600 mb-4">{ticket.description}</p>

            {ticket.deadline && (
              <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg mb-4 ${
                new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO'
                  ? 'bg-red-100 border border-red-300 text-red-800'
                  : 'bg-blue-50 border border-blue-200 text-blue-800'
              }`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="font-semibold">
                  {new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO'
                    ? 'VENCIDO:'
                    : 'Fecha límite:'
                  }
                </span>
                <span className="font-bold">
                  {new Date(ticket.deadline).toLocaleDateString('es-ES', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                </span>
              </div>
            )}
            
            <div className="flex items-center space-x-4 text-sm text-gray-500">
              <span>Creado: {new Date(ticket.createdAt).toLocaleDateString()}</span>
              <span>Grupo: {ticket.group.name}</span>
            </div>
          </div>

          {/* Comments */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Comentarios y Planes de Acción</h2>
            
            {ticket.comments.length === 0 ? (
              <p className="text-gray-500 mb-4">No hay comentarios aún.</p>
            ) : (
              <div className="space-y-4 mb-6">
                {ticket.comments.map(c => (
                  <div
                    key={c.id}
                    className={`p-4 rounded-lg ${
                      c.isActionPlan ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <span className="font-medium">{c.user.name}</span>
                      <div className="flex items-center gap-2">
                        {c.isActionPlan && (
                          <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                            Plan de Acción
                          </span>
                        )}
                        {c.reviewStatus && (
                          <span className={`text-xs px-2 py-1 rounded ${
                            c.reviewStatus === 'PENDING_REVIEW' ? 'bg-yellow-100 text-yellow-800' :
                            c.reviewStatus === 'APPROVED_BY_LEADER' ? 'bg-green-100 text-green-800' :
                            c.reviewStatus === 'REJECTED_BY_LEADER' ? 'bg-red-100 text-red-800' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {c.reviewStatus === 'PENDING_REVIEW' ? '⏳ Pendiente revisión' :
                             c.reviewStatus === 'APPROVED_BY_LEADER' ? '✓ Aprobado por líder' :
                             c.reviewStatus === 'REJECTED_BY_LEADER' ? '✗ Rechazado por líder' :
                             '→ Enviado a pastora'}
                          </span>
                        )}
                      </div>
                    </div>
                    <p className="text-gray-700">{c.content}</p>
                    <div className="flex items-center justify-between mt-2">
                      <p className="text-xs text-gray-500">
                        {new Date(c.createdAt).toLocaleString()}
                      </p>
                      <div className="flex gap-2">
                        {c.user.id === user.id && !c.reviewStatus && (
                          <button
                            onClick={async () => {
                              try {
                                await ticketsAPI.requestReview(ticket.id, c.id);
                                fetchTicket();
                              } catch (e) {
                                alert(e.response?.data?.error || 'Error al pedir revisión');
                              }
                            }}
                            className="text-xs bg-yellow-100 text-yellow-800 px-2 py-1 rounded hover:bg-yellow-200"
                          >
                            Pedir Revisión
                          </button>
                        )}
                        {c.reviewStatus === 'PENDING_REVIEW' && (user.role === 'PASTORA' || user.role === 'ADMIN' || isLeader) && (
                          <>
                            <button
                              onClick={async () => {
                                try {
                                  await ticketsAPI.reviewComment(ticket.id, c.id, 'send-to-pastora');
                                  fetchTicket();
                                } catch (e) {
                                  alert(e.response?.data?.error || 'Error');
                                }
                              }}
                              className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded hover:bg-blue-200"
                            >
                              Enviar a Pastora
                            </button>
                            <button
                              onClick={async () => {
                                try {
                                  await ticketsAPI.reviewComment(ticket.id, c.id, 'reject');
                                  fetchTicket();
                                } catch (e) {
                                  alert(e.response?.data?.error || 'Error');
                                }
                              }}
                              className="text-xs bg-red-100 text-red-800 px-2 py-1 rounded hover:bg-red-200"
                            >
                              Rechazar
                            </button>
                          </>
                        )}
                        {c.reviewStatus === 'PENDING_REVIEW' && user.role !== 'PASTORA' && user.role !== 'ADMIN' && !isLeader && (
                          <span className="text-xs text-gray-400">Esperando revisión del líder</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Comment Form */}
            <form onSubmit={handleAddComment}>
              <div className="mb-4">
                <textarea
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Escribe un comentario o plan de acción..."
                  className="input-field"
                  rows={3}
                />
              </div>
              <div className="flex items-center justify-between">
                <label className="flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isActionPlan}
                    onChange={(e) => setIsActionPlan(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-sm text-gray-600">Es un plan de acción</span>
                </label>
                <button type="submit" className="btn-primary">
                  Agregar
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* Sidebar */}
        <div>
          {/* Status Actions (Pastora + Admin) */}
          {(user.role === 'PASTORA' || user.role === 'ADMIN') && (
            <div className="card mb-6">
              <h2 className="text-xl font-semibold mb-4">Gestionar Ticket</h2>
              <div className="space-y-2">
                {user.role === 'ADMIN' ? (
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { status: 'PENDIENTE_PASTORA', label: 'Pendiente', color: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200' },
                      { status: 'APROBADO', label: 'Aprobar', color: 'bg-green-100 text-green-800 hover:bg-green-200' },
                      { status: 'RECHAZADO', label: 'Rechazar', color: 'bg-red-100 text-red-800 hover:bg-red-200' },
                      { status: 'EN_PROGRESO', label: 'En Progreso', color: 'bg-blue-100 text-blue-800 hover:bg-blue-200' },
                      { status: 'COMPLETADO', label: 'Completar', color: 'bg-gray-100 text-gray-800 hover:bg-gray-200' }
                    ].filter(s => s.status !== ticket.status).map(s => (
                      <button
                        key={s.status}
                        onClick={() => {
                          if (s.status === 'APROBADO') {
                            setShowApproveModal(true);
                          } else {
                            handleStatusChange(s.status);
                          }
                        }}
                        className={`px-3 py-2 rounded text-sm font-medium ${s.color}`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                ) : (
                  <>
                    {ticket.status === 'PENDIENTE_PASTORA' && (
                      <>
                        <button onClick={() => setShowApproveModal(true)} className="btn-primary w-full">Aprobar</button>
                        <button onClick={() => handleStatusChange('RECHAZADO')} className="btn-danger w-full">Rechazar</button>
                      </>
                    )}
                    {ticket.status === 'APROBADO' && (
                      <button onClick={() => handleStatusChange('EN_PROGRESO')} className="btn-primary w-full">Iniciar Progreso</button>
                    )}
                    {ticket.status === 'EN_PROGRESO' && (
                      <button onClick={() => handleStatusChange('COMPLETADO')} className="btn-primary w-full">Marcar Completado</button>
                    )}
                    {ticket.status === 'COMPLETADO' && (
                      <p className="text-green-600 text-center py-2">✓ Este ticket está completado</p>
                    )}
                    {ticket.status === 'RECHAZADO' && (
                      <p className="text-red-600 text-center py-2">✗ Ticket rechazado</p>
                    )}
                  </>
                )}
              </div>
            </div>
          )}

          {/* Ticket Info */}
          <div className="card">
            <h2 className="text-xl font-semibold mb-4">Información</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-500">Estado:</dt>
                <dd className={getStatusClass(ticket.status)}>
                  {getStatusText(ticket.status)}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Sugerencia de:</dt>
                <dd className="font-medium">{ticket.creator?.name || 'Miembro activo'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-500">Fecha creación:</dt>
                <dd>{new Date(ticket.createdAt).toLocaleDateString()}</dd>
              </div>

              {/* Fecha límite - editable por admin y pastora */}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500 font-bold">Fecha límite:</dt>
                {isEditingDeadline ? (
                  <div className="flex items-center gap-2">
                    <input
                      type="date"
                      value={editDeadline}
                      onChange={(e) => setEditDeadline(e.target.value)}
                      min={getMinDate()}
                      className="border rounded px-2 py-1 text-sm"
                    />
                    <button onClick={handleSaveDeadline} className="text-green-600 hover:text-green-800 text-sm font-medium">Guardar</button>
                    <button onClick={() => setIsEditingDeadline(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {ticket.deadline ? (
                      <dd className={new Date(ticket.deadline) < new Date() && ticket.status !== 'COMPLETADO' ? 'text-red-600 font-bold' : 'font-bold'}>
                        {new Date(ticket.deadline).toLocaleDateString()}
                      </dd>
                    ) : (
                      <dd className="text-gray-400 italic">Sin fecha</dd>
                    )}
                    {(user.role === 'PASTORA' || user.role === 'ADMIN') && (
                      <button
                        onClick={() => { setEditDeadline(ticket.deadline ? ticket.deadline.split('T')[0] : getMinDate()); setIsEditingDeadline(true); }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >Editar</button>
                    )}
                  </div>
                )}
              </div>

              {/* Prioridad - editable */}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500 font-bold">Prioridad:</dt>
                {isEditingPriority ? (
                  <div className="flex items-center gap-2">
                    <select value={editPriority} onChange={(e) => setEditPriority(e.target.value)} className="border rounded px-2 py-1 text-sm">
                      <option value="ALTA">Alta</option>
                      <option value="MEDIA">Media</option>
                      <option value="BAJA">Baja</option>
                    </select>
                    <button onClick={handleSavePriority} className="text-green-600 hover:text-green-800 text-sm font-medium">Guardar</button>
                    <button onClick={() => setIsEditingPriority(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancelar</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    {ticket.priority ? (
                      <dd className={`font-bold ${ticket.priority === 'ALTA' ? 'text-red-600' : ticket.priority === 'MEDIA' ? 'text-yellow-600' : 'text-green-600'}`}>
                        • {ticket.priority}
                      </dd>
                    ) : (
                      <dd className="text-gray-400 italic">Sin asignar</dd>
                    )}
                    {(user.role === 'PASTORA' || user.role === 'ADMIN') && (
                      <button
                        onClick={() => { setEditPriority(ticket.priority || 'BAJA'); setIsEditingPriority(true); }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >Editar</button>
                    )}
                  </div>
                )}
              </div>

              {/* Visibilidad - editable */}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500 font-bold">Visibilidad:</dt>
                {isEditingVisibility ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1 flex-wrap">
                      {[
                        { value: 'INICIAL', label: '📝 Inicial' },
                        { value: 'PRIVATE', label: '🔒 Grupo' },
                        { value: 'PUBLIC', label: '🌐 Iglesia' },
                        { value: 'USER_SPECIFIC', label: '👤 Usuario' }
                      ].map(v => (
                        <button
                          key={v.value}
                          type="button"
                          onClick={() => {
                            setEditVisibility(v.value);
                            if (v.value === 'USER_SPECIFIC') {
                              fetchGroupMembers(editGroupId || ticket.group.id);
                            }
                          }}
                          className={`px-2 py-1 rounded text-xs border ${
                            editVisibility === v.value ? 'bg-blue-100 border-blue-400 text-blue-800' : 'bg-gray-50 border-gray-200 text-gray-600'
                          }`}
                        >{v.label}</button>
                      ))}
                    </div>
                    {editVisibility === 'USER_SPECIFIC' && (
                      <div className="space-y-1 max-h-32 overflow-y-auto border rounded p-1">
                        {groupMembers.map(m => (
                          <label key={m.id} className="flex items-center gap-2 text-xs cursor-pointer">
                            <input
                              type="checkbox"
                              checked={editViewerIds.includes(m.id)}
                              onChange={(e) => {
                                setEditViewerIds(e.target.checked ? [...editViewerIds, m.id] : editViewerIds.filter(i => i !== m.id));
                              }}
                            />
                            {m.name}
                          </label>
                        ))}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <button onClick={handleSaveVisibility} className="text-green-600 hover:text-green-800 text-sm font-medium">Guardar</button>
                      <button onClick={() => setIsEditingVisibility(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-2 py-1 rounded font-medium ${
                      ticket.visibility === 'PUBLIC' ? 'bg-blue-100 text-blue-800' :
                      ticket.visibility === 'USER_SPECIFIC' ? 'bg-orange-100 text-orange-800' :
                      ticket.visibility === 'INICIAL' ? 'bg-gray-100 text-gray-800' :
                      'bg-purple-100 text-purple-800'
                    }`}>
                      {ticket.visibility === 'PUBLIC' ? '🌐 Iglesia' :
                       ticket.visibility === 'USER_SPECIFIC'
                         ? `👤 Solo ${ticket.viewers?.map(v => v.user.name).join(', ') || 'usuario'}`
                         : ticket.visibility === 'INICIAL' ? '📝 Inicial'
                         : '🔒 Grupo'}
                    </span>
                    {(user.role === 'PASTORA' || user.role === 'ADMIN') && (
                      <button
                        onClick={() => {
                          setEditVisibility(ticket.visibility || 'PRIVATE');
                          setEditViewerIds(ticket.viewers?.map(v => v.user.id) || []);
                          setIsEditingVisibility(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >Editar</button>
                    )}
                  </div>
                )}
              </div>

              {/* Grupo - editable (mover a otro grupo) */}
              <div className="flex justify-between items-center">
                <dt className="text-gray-500 font-bold">Grupo:</dt>
                {isEditingGroup ? (
                  <div className="flex flex-col gap-2">
                    <select
                      value={editGroupId}
                      onChange={(e) => setEditGroupId(e.target.value)}
                      className="border rounded px-2 py-1 text-sm"
                    >
                      {allGroups.map(g => (
                        <option key={g.id} value={g.id}>{g.name}</option>
                      ))}
                    </select>
                    <div className="flex gap-2">
                      <button onClick={handleSaveGroup} className="text-green-600 hover:text-green-800 text-sm font-medium">Guardar</button>
                      <button onClick={() => setIsEditingGroup(false)} className="text-gray-400 hover:text-gray-600 text-sm">Cancelar</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2">
                    <dd className="font-medium">{ticket.group.name}</dd>
                    {(user.role === 'PASTORA' || user.role === 'ADMIN') && (
                      <button
                        onClick={() => {
                          setEditGroupId(ticket.group.id);
                          fetchAllGroups();
                          setIsEditingGroup(true);
                        }}
                        className="text-blue-600 hover:text-blue-800 text-xs"
                      >Mover</button>
                    )}
                  </div>
                )}
              </div>

              <div className="flex justify-between">
                <dt className="text-gray-500">Última actualización:</dt>
                <dd>{new Date(ticket.updatedAt).toLocaleDateString()}</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>

      {/* Approve Modal */}
      {showApproveModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md mx-4">
            <h3 className="text-xl font-bold mb-2">Aprobar Sugerencia</h3>
            <p className="text-gray-600 mb-4">
              Estás por aprobar "<strong>{ticket.title}</strong>". Establece una fecha límite de entrega:
            </p>
            <div className="mb-4">
              <label className="block text-gray-700 mb-2">Fecha límite *</label>
              <input
                type="date"
                value={approveDeadline}
                onChange={(e) => setApproveDeadline(e.target.value)}
                min={getMinDate()}
                className="input-field w-full"
                required
              />
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">Prioridad</label>
              <div className="flex gap-2">
                {[
                  { value: 'ALTA', label: 'Alta', color: 'bg-red-100 border-red-300 text-red-700 hover:bg-red-200' },
                  { value: 'MEDIA', label: 'Media', color: 'bg-yellow-100 border-yellow-300 text-yellow-700 hover:bg-yellow-200' },
                  { value: 'BAJA', label: 'Baja', color: 'bg-green-100 border-green-300 text-green-700 hover:bg-green-200' }
                ].map(p => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setApprovePriority(p.value)}
                    className={`flex-1 py-2 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      approvePriority === p.value
                        ? `${p.color} ring-2 ring-offset-1 ring-blue-400`
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    • {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-6">
              <label className="block text-gray-700 mb-2">Visibilidad</label>
              <div className="flex gap-2">
                {[
                  { value: 'INICIAL', label: 'Inicial', desc: 'Solo creador y pastora', icon: '📝', color: 'bg-gray-100 border-gray-300 text-gray-700 hover:bg-gray-200' },
                  { value: 'PRIVATE', label: 'Privado', desc: 'Grupo', icon: '🔒', color: 'bg-purple-100 border-purple-300 text-purple-700 hover:bg-purple-200' },
                  { value: 'PUBLIC', label: 'Público', desc: 'Toda la iglesia', icon: '🌐', color: 'bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200' },
                  { value: 'USER_SPECIFIC', label: 'Privado para usuario', desc: '', icon: '👤', color: 'bg-orange-100 border-orange-300 text-orange-700 hover:bg-orange-200' }
                ].map(v => (
                  <button
                    key={v.value}
                    type="button"
                    onClick={() => {
                      setApproveVisibility(v.value);
                      if (v.value === 'USER_SPECIFIC' && groupMembers.length === 0) {
                        fetchGroupMembers(ticket.group.id);
                      }
                    }}
                    className={`flex-1 py-3 px-3 rounded-lg border-2 text-sm font-medium transition-all ${
                      approveVisibility === v.value
                        ? `${v.color} ring-2 ring-offset-1 ring-blue-400`
                        : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="text-lg">{v.icon}</span>
                    <div className="font-medium">{v.label}</div>
                    <div className="text-xs opacity-75">
                      {v.value === 'USER_SPECIFIC'
                        ? (selectedViewerIds.length > 0
                          ? `Solo ve${selectedViewerIds.length > 1 ? 'n' : ''} ${groupMembers.filter(m => selectedViewerIds.includes(m.id)).map(m => m.name).join(', ')}`
                          : 'Selecciona usuario')
                        : v.desc
                      }
                    </div>
                  </button>
                ))}
              </div>
            </div>
            {approveVisibility === 'USER_SPECIFIC' && (
              <div className="mb-6">
                <label className="block text-gray-700 mb-2">Seleccionar usuarios del grupo</label>
                <div className="space-y-2 max-h-48 overflow-y-auto border rounded-lg p-2">
                  {groupMembers.length === 0 ? (
                    <p className="text-gray-500 text-sm">Cargando miembros...</p>
                  ) : (
                    groupMembers.map(member => (
                      <label key={member.id} className="flex items-center gap-3 p-2 rounded hover:bg-gray-50 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedViewerIds.includes(member.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedViewerIds([...selectedViewerIds, member.id]);
                            } else {
                              setSelectedViewerIds(selectedViewerIds.filter(id => id !== member.id));
                            }
                          }}
                          className="rounded"
                        />
                        <div>
                          <p className="text-sm font-medium">{member.name}</p>
                          <p className="text-xs text-gray-500">{member.email}</p>
                        </div>
                        <span className={`ml-auto text-xs px-2 py-0.5 rounded ${
                          member.role === 'PASTORA' ? 'bg-pink-100 text-pink-700' :
                          member.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {member.role === 'PASTORA' ? 'Pastora' : member.role === 'ADMIN' ? 'Admin' : 'Miembro'}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3">
              <button
                onClick={() => { setShowApproveModal(false); setApproveDeadline(''); setApprovePriority('BAJA'); setApproveVisibility('PRIVATE'); setSelectedViewerIds([]); }}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Cancelar
              </button>
              <button
                onClick={handleApprove}
                className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
              >
                Aprobar con Fecha
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default TicketDetail;
