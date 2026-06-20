const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isPastora } = require('../middleware/auth');
const { sendNewTicketNotification } = require('../services/whatsappNotifications');
const { sendPushToUser, sendPushToGroup } = require('../services/pushNotifications');

const router = express.Router();
const prisma = new PrismaClient();

// Create ticket (anonymous suggestion — any user can suggest to any group)
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, groupId, deadline, visibility, priority } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: 'Debes seleccionar un grupo.' });
    }

    const group = await prisma.group.findUnique({
      where: { id: groupId },
      include: { members: { include: { user: { select: { id: true, role: true } } } } }
    });

    if (!group) {
      return res.status(404).json({ error: 'Grupo no encontrado.' });
    }

    if (group.isPrivate) {
      const isMember = group.members.some(m => m.userId === req.user.id);
      if (!isMember) {
        return res.status(403).json({ error: 'No puedes crear sugerencias en este grupo.' });
      }
    }

    const isPastoraCreator = req.user.role === 'PASTORA';
    const ticketData = {
      title,
      description,
      groupId,
      createdById: req.user.id,
      deadline: deadline ? new Date(deadline) : null
    };

    if (isPastoraCreator) {
      ticketData.status = 'APROBADO';
      if (visibility) ticketData.visibility = visibility;
      if (priority) ticketData.priority = priority;
    }

    const ticket = await prisma.ticket.create({
      data: ticketData,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        createdAt: true
      }
    });

    if (!isPastoraCreator) {
      const pastoras = await prisma.user.findMany({
        where: { role: 'PASTORA' },
        select: { id: true }
      });

      for (const pastora of pastoras) {
        await prisma.notification.create({
          data: {
            userId: pastora.id,
            ticketId: ticket.id,
            message: `Nueva sugerencia en ${group.name}: "${title}"`
          }
        });
      }
    } else {
      const members = group.members.filter(m => m.userId !== req.user.id);
      for (const member of members) {
        await prisma.notification.create({
          data: {
            userId: member.userId,
            ticketId: ticket.id,
            message: `Nuevo ticket aprobado en ${group.name}: "${title}"`
          }
        });
      }
    }

    sendNewTicketNotification(groupId, ticket).catch(err =>
      console.error('WhatsApp notification failed:', err.message)
    );

    if (isPastoraCreator) {
      sendPushToGroup(groupId, {
        title: `📋 Nuevo ticket: ${title}`,
        body: `✅ Aprobado por ${req.user.name} en ${group.name}`,
        url: `/tickets/${ticket.id}`,
        icon: '/icon-192.png'
      }).catch(err => console.error('Push notification failed:', err.message));
    } else {
      sendPushToGroup(groupId, {
        title: `💡 Nueva sugerencia: ${title}`,
        body: `⏳ En ${group.name} — esperando revisión de la pastora`,
        url: `/tickets/${ticket.id}`,
        icon: '/icon-192.png'
      }, req.user.id).catch(err => console.error('Push notification failed:', err.message));
    }

    res.status(201).json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear sugerencia.' });
  }
});

// Get tickets by group
router.get('/', auth, async (req, res) => {
  try {
    const { groupId, status } = req.query;

    const where = { hidden: false };
    if (groupId) where.groupId = groupId;
    if (status) where.status = status;

    if (req.user.role !== 'ADMIN' && req.user.role !== 'PASTORA') {
      where.OR = [
        { createdById: req.user.id },
        { viewers: { some: { userId: req.user.id } } },
        { visibility: 'PUBLIC' },
        { visibility: 'PRIVATE', group: { members: { some: { userId: req.user.id } } } },
        { status: 'PENDIENTE_REVISION', group: { members: { some: { userId: req.user.id, isLeader: true } } } }
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        createdAt: true,
        group: { select: { id: true, name: true } },
        viewers: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { comments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener tickets.' });
  }
});

// Get ALL tickets for pastora (she sees everything)
router.get('/pastora', auth, isPastora, async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      where: { hidden: false },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        createdAt: true,
        group: { select: { id: true, name: true } },
        viewers: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { comments: true } }
      },
      orderBy: [
        { status: 'asc' },
        { deadline: 'asc' }
      ]
    });

    // Mark overdue tickets
    const now = new Date();
    const ticketsWithOverdue = tickets.map(ticket => ({
      ...ticket,
      isOverdue: ticket.deadline && new Date(ticket.deadline) < now && ticket.status !== 'COMPLETADO'
    }));

    res.json(ticketsWithOverdue);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener tickets.' });
  }
});

// Get ALL tickets including hidden (for pastora/admin management)
router.get('/all-visible', auth, async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        hidden: true,
        createdAt: true,
        group: { select: { id: true, name: true } },
        viewers: { select: { user: { select: { id: true, name: true } } } },
        _count: { select: { comments: true } }
      },
      orderBy: { createdAt: 'desc' }
    });

    res.json(tickets);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener tickets.' });
  }
});

// Get ticket detail
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const ticket = await prisma.ticket.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        createdAt: true,
        updatedAt: true,
        group: { select: { id: true, name: true } },
        creator: { select: { id: true, name: true } },
        viewers: { select: { user: { select: { id: true, name: true } } } },
        comments: {
          select: {
            id: true,
            content: true,
            isActionPlan: true,
            reviewStatus: true,
            reviewedById: true,
            createdAt: true,
            user: { select: { id: true, name: true } }
          },
          orderBy: { createdAt: 'asc' }
        }
      }
    });

    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener ticket.' });
  }
});

// Update ticket (pastora or admin)
router.patch('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'PASTORA' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo pastora o admin pueden editar tickets.' });
    }

    const { id } = req.params;
    const { status, deadline, priority, visibility, viewerIds, groupId } = req.body;

    const validPriorities = ['ALTA', 'MEDIA', 'BAJA'];
    const validVisibilities = ['INICIAL', 'PRIVATE', 'PUBLIC', 'USER_SPECIFIC'];
    const validStatuses = ['PENDIENTE_PASTORA', 'PENDIENTE_REVISION', 'APROBADO', 'RECHAZADO', 'EN_PROGRESO', 'COMPLETADO'];

    const currentTicket = await prisma.ticket.findUnique({
      where: { id },
      select: { status: true, createdById: true, groupId: true }
    });

    if (!currentTicket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    const updateData = {};
    if (status && validStatuses.includes(status)) updateData.status = status;
    if (deadline) updateData.deadline = new Date(deadline);
    if (priority && validPriorities.includes(priority)) updateData.priority = priority;
    if (visibility && validVisibilities.includes(visibility)) updateData.visibility = visibility;
    if (groupId) updateData.groupId = groupId;

    if (status === 'RECHAZADO') {
      updateData.visibility = 'INICIAL';
      await prisma.ticketViewer.deleteMany({ where: { ticketId: id } });
    }

    const ticket = await prisma.ticket.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        visibility: true,
        deadline: true,
        group: { select: { id: true, name: true } }
      }
    });

    if (visibility === 'USER_SPECIFIC' && Array.isArray(viewerIds) && viewerIds.length > 0) {
      await prisma.ticketViewer.deleteMany({ where: { ticketId: id } });
      for (const userId of viewerIds) {
        await prisma.ticketViewer.create({
          data: { ticketId: id, userId }
        }).catch(() => {});
      }
    } else if (visibility && visibility !== 'USER_SPECIFIC') {
      await prisma.ticketViewer.deleteMany({ where: { ticketId: id } });
    }

    const group = await prisma.group.findUnique({
      where: { id: ticket.group.id },
      include: {
        members: { select: { userId: true } }
      }
    });

    const statusMessages = {
      APROBADO: 'aprobado',
      RECHAZADO: 'rechazado',
      EN_PROGRESO: 'en progreso',
      COMPLETADO: 'completado'
    };

    let notifyUserIds;
    if (status === 'RECHAZADO') {
      notifyUserIds = [currentTicket.createdById];
    } else if (visibility === 'USER_SPECIFIC' && Array.isArray(viewerIds) && viewerIds.length > 0) {
      notifyUserIds = viewerIds;
    } else {
      notifyUserIds = group.members.map(m => m.userId);
    }

    if (status !== 'RECHAZADO') {
      const pastoras = await prisma.user.findMany({
        where: { role: 'PASTORA' },
        select: { id: true }
      });
      for (const p of pastoras) {
        if (!notifyUserIds.includes(p.id)) {
          notifyUserIds.push(p.id);
        }
      }
    }

    for (const userId of notifyUserIds) {
      await prisma.notification.create({
        data: {
          userId,
          ticketId: ticket.id,
          message: `El ticket "${ticket.title}" ha sido ${statusMessages[status]}`
        }
      });
    }

    if (status && statusMessages[status]) {
      const statusEmojis = {
        APROBADO: '✅',
        RECHAZADO: '❌',
        EN_PROGRESO: '🚀',
        COMPLETADO: '🎉'
      };
      const emoji = statusEmojis[status] || '📌';
      const pushPayload = {
        title: `${emoji} Ticket ${statusMessages[status]}`,
        body: `"${ticket.title}" ha cambiado a ${statusMessages[status]}`,
        url: `/tickets/${ticket.id}`,
        icon: '/icon-192.png'
      };
      for (const userId of notifyUserIds) {
        sendPushToUser(userId, pushPayload).catch(() => {});
      }
    }

    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar ticket.' });
  }
});

// Move ticket to another group (pastora or admin only)
router.patch('/:id/move', auth, async (req, res) => {
  try {
    if (req.user.role !== 'PASTORA' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo pastora o admin pueden mover tickets.' });
    }

    const { id } = req.params;
    const { groupId, visibility, assignedUserId } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: 'Debes seleccionar un grupo destino.' });
    }

    const targetGroup = await prisma.group.findUnique({ where: { id: groupId } });
    if (!targetGroup) {
      return res.status(404).json({ error: 'Grupo destino no encontrado.' });
    }
    if (targetGroup.isPersonal) {
      return res.status(403).json({ error: 'No se pueden mover tickets a un grupo personal.' });
    }

    const ticket = await prisma.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return res.status(404).json({ error: 'Ticket no encontrado.' });
    }

    const updateData = { groupId };
    if (visibility) updateData.visibility = visibility;

    const updated = await prisma.ticket.update({
      where: { id },
      data: updateData,
      select: {
        id: true, title: true, status: true, visibility: true,
        groupId: true, createdAt: true
      }
    });

    if (assignedUserId) {
      await prisma.ticketViewer.upsert({
        where: { ticketId_userId: { ticketId: id, userId: assignedUserId } },
        update: {},
        create: { ticketId: id, userId: assignedUserId }
      });

      await prisma.notification.create({
        data: {
          userId: assignedUserId,
          ticketId: id,
          message: `📦 Te asignaron el ticket "${ticket.title}" en el grupo ${targetGroup.name}`
        }
      });

      sendPushToUser(assignedUserId, {
        title: `📦 Ticket asignado`,
        body: `"${ticket.title}" en el grupo ${targetGroup.name}`,
        url: `/tickets/${id}`,
        icon: '/icon-192.png'
      }).catch(() => {});
    }

    const creator = await prisma.user.findUnique({
      where: { id: ticket.createdById },
      select: { id: true }
    });
    if (creator) {
      await prisma.notification.create({
        data: {
          userId: creator.id,
          ticketId: id,
          message: `🔀 Tu ticket "${ticket.title}" fue movido al grupo ${targetGroup.name}`
        }
      });

      sendPushToUser(creator.id, {
        title: `🔀 Ticket movido`,
        body: `"${ticket.title}" → ${targetGroup.name}`,
        url: `/tickets/${id}`,
        icon: '/icon-192.png'
      }).catch(() => {});
    }

    res.json(updated);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al mover ticket.' });
  }
});

// Add comment to ticket
router.post('/:id/comments', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, isActionPlan } = req.body;

    const comment = await prisma.comment.create({
      data: {
        ticketId: id,
        userId: req.user.id,
        content,
        isActionPlan: isActionPlan || false
      },
      select: {
        id: true,
        content: true,
        isActionPlan: true,
        createdAt: true,
        user: { select: { id: true, name: true } }
      }
    });

    res.status(201).json(comment);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al agregar comentario.' });
  }
});

// Request review on a comment (member → leader)
router.post('/:ticketId/comments/:commentId/request-review', auth, async (req, res) => {
  try {
    const { ticketId, commentId } = req.params;

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { ticket: { select: { groupId: true } } }
    });

    if (!comment || comment.ticketId !== ticketId) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }

    if (comment.reviewStatus) {
      return res.status(400).json({ error: 'Este comentario ya tiene un estado de revisión.' });
    }

    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      select: { createdById: true }
    });

    const isCreator = ticket && ticket.createdById === req.user.id;
    const membership = await prisma.userGroup.findFirst({
      where: { userId: req.user.id, groupId: comment.ticket.groupId }
    });

    if (!membership && !isCreator && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No eres miembro de este grupo.' });
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { reviewStatus: 'PENDING_REVIEW' },
      select: {
        id: true, content: true, isActionPlan: true, reviewStatus: true, createdAt: true,
        user: { select: { id: true, name: true } }
      }
    });

    await prisma.ticket.update({
      where: { id: ticketId },
      data: { status: 'PENDIENTE_REVISION' }
    });

    const leader = await prisma.userGroup.findFirst({
      where: { groupId: comment.ticket.groupId, isLeader: true },
      include: { user: { select: { id: true, name: true } } }
    });

    if (leader) {
      await prisma.notification.create({
        data: {
          userId: leader.user.id,
          ticketId,
          message: `🔍 ${req.user.name} pide revisión de un comentario en un ticket`
        }
      });

      sendPushToUser(leader.user.id, {
        title: `🔍 Revisión solicitada`,
        body: `${req.user.name} pide revisión de un comentario`,
        url: `/tickets/${ticketId}`,
        icon: '/icon-192.png'
      }).catch(() => {});
    }

    res.json(updatedComment);
  } catch (error) {
    console.error('Error requesting review:', error);
    res.status(500).json({ error: 'Error al pedir revisión.' });
  }
});

// Review a comment (leader → approve/reject/send to pastora)
router.patch('/:ticketId/comments/:commentId/review', auth, async (req, res) => {
  try {
    const { ticketId, commentId } = req.params;
    const { action } = req.body;

    if (!['approve', 'reject', 'send-to-pastora'].includes(action)) {
      return res.status(400).json({ error: 'Acción inválida.' });
    }

    const comment = await prisma.comment.findUnique({
      where: { id: commentId },
      include: { ticket: { select: { groupId: true, title: true } } }
    });

    if (!comment || comment.ticketId !== ticketId) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }

    if (comment.reviewStatus !== 'PENDING_REVIEW') {
      return res.status(400).json({ error: 'Este comentario no está pendiente de revisión.' });
    }

    const membership = await prisma.userGroup.findFirst({
      where: { userId: req.user.id, groupId: comment.ticket.groupId, isLeader: true }
    });

    if (!membership && req.user.role !== 'PASTORA' && req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'No eres líder de este grupo.' });
    }

    let newStatus;
    if (action === 'approve') {
      newStatus = 'APPROVED_BY_LEADER';
    } else if (action === 'reject') {
      newStatus = 'REJECTED_BY_LEADER';
    } else {
      newStatus = 'SENT_TO_PASTORA';
    }

    const updatedComment = await prisma.comment.update({
      where: { id: commentId },
      data: { reviewStatus: newStatus, reviewedById: req.user.id },
      select: {
        id: true, content: true, isActionPlan: true, reviewStatus: true, reviewedById: true, createdAt: true,
        user: { select: { id: true, name: true } }
      }
    });

    if (action === 'reject') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'RECHAZADO', visibility: 'INICIAL' }
      });
      await prisma.ticketViewer.deleteMany({ where: { ticketId } });
    } else if (action === 'send-to-pastora') {
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { status: 'PENDIENTE_PASTORA' }
      });
    }

    if (action === 'send-to-pastora') {
      const pastoras = await prisma.user.findMany({
        where: { role: 'PASTORA' },
        select: { id: true }
      });
      for (const p of pastoras) {
        await prisma.notification.create({
          data: {
            userId: p.id,
            ticketId,
            message: `📨 ${req.user.name} envió a revisión un comentario de "${comment.ticket.title}"`
          }
        });
        sendPushToUser(p.id, {
          title: `📨 Comentario enviado a revisión`,
          body: `${req.user.name} en "${comment.ticket.title}"`,
          url: `/tickets/${ticketId}`,
          icon: '/icon-192.png'
        }).catch(() => {});
      }
    } else {
      const emoji = action === 'approve' ? '✅' : '❌';
      const text = action === 'approve' ? 'aprobado' : 'rechazado';
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          ticketId,
          message: `${emoji} Tu comentario fue ${text} por ${req.user.name}`
        }
      });
      sendPushToUser(comment.userId, {
        title: `${emoji} Comentario ${text}`,
        body: `Por ${req.user.name} en "${comment.ticket.title}"`,
        url: `/tickets/${ticketId}`,
        icon: '/icon-192.png'
      }).catch(() => {});
    }

    res.json(updatedComment);
  } catch (error) {
    console.error('Error reviewing comment:', error);
    res.status(500).json({ error: 'Error al revisar comentario.' });
  }
});

// Hide ticket (pastora or admin)
router.patch('/:id/hide', auth, async (req, res) => {
  try {
    const { id } = req.params;
    const { hidden } = req.body;

    const ticket = await prisma.ticket.update({
      where: { id },
      data: { hidden: hidden !== undefined ? hidden : true },
      select: { id: true, title: true, hidden: true }
    });

    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al ocultar ticket.' });
  }
});

// Delete ticket (admin only)
router.delete('/:id', auth, async (req, res) => {
  try {
    if (req.user.role !== 'ADMIN') {
      return res.status(403).json({ error: 'Solo el administrador puede eliminar tickets.' });
    }

    const { id } = req.params;
    await prisma.comment.deleteMany({ where: { ticketId: id } });
    await prisma.notification.deleteMany({ where: { ticketId: id } });
    await prisma.ticket.delete({ where: { id } });

    res.json({ message: 'Ticket eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar ticket.' });
  }
});

module.exports = router;
