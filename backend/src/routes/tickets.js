const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isPastora } = require('../middleware/auth');
const { sendNewTicketNotification } = require('../services/whatsappNotifications');

const router = express.Router();
const prisma = new PrismaClient();

// Create ticket (anonymous suggestion — any user can suggest to any group)
router.post('/', auth, async (req, res) => {
  try {
    const { title, description, groupId, deadline } = req.body;

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

    const ticket = await prisma.ticket.create({
      data: {
        title,
        description,
        groupId,
        createdById: req.user.id,
        deadline: deadline ? new Date(deadline) : null
      },
      select: {
        id: true,
        title: true,
        description: true,
        status: true,
        deadline: true,
        createdAt: true
      }
    });

    // Notify all pastora users
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

    // Send WhatsApp notification to group
    sendNewTicketNotification(groupId, ticket).catch(err =>
      console.error('WhatsApp notification failed:', err.message)
    );

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

    res.json(ticket);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar ticket.' });
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
          message: `${req.user.name} pide revisión de un comentario en un ticket`
        }
      });
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
            message: `${req.user.name} envió a revisión un comentario de "${comment.ticket.title}"`
          }
        });
      }
    } else {
      await prisma.notification.create({
        data: {
          userId: comment.userId,
          ticketId,
          message: `Tu comentario fue ${action === 'approve' ? 'aprobado' : 'rechazado'} por ${req.user.name}`
        }
      });
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
