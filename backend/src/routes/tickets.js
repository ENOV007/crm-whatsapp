const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isPastora } = require('../middleware/auth');

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

    // Notify pastora of the group (if not the Pastora's private group)
    if (!group.isPrivate) {
      const pastora = group.members.find(m => m.user.role === 'PASTORA');
      if (pastora) {
        await prisma.notification.create({
          data: {
            userId: pastora.user.id,
            ticketId: ticket.id,
            message: `Nueva sugerencia en ${group.name}: "${title}"`
          }
        });
      }
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
        { visibility: 'PUBLIC' },
        { group: { members: { some: { userId: req.user.id } } }, visibility: 'PRIVATE' },
        { viewers: { some: { userId: req.user.id } } }
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

// Update ticket status (only pastora)
router.patch('/:id', auth, isPastora, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, deadline, priority, visibility, viewerIds } = req.body;

    const validPriorities = ['ALTA', 'MEDIA', 'BAJA'];
    const validVisibilities = ['PRIVATE', 'PUBLIC', 'USER_SPECIFIC'];

    const ticket = await prisma.ticket.update({
      where: { id },
      data: {
        ...(status && { status }),
        ...(deadline && { deadline: new Date(deadline) }),
        ...(priority && validPriorities.includes(priority) && { priority }),
        ...(visibility && validVisibilities.includes(visibility) && { visibility })
      },
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
    if (visibility === 'USER_SPECIFIC' && Array.isArray(viewerIds) && viewerIds.length > 0) {
      notifyUserIds = viewerIds;
    } else {
      notifyUserIds = group.members.map(m => m.userId);
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
