const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth, isPastora } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get ALL groups (for dashboard and ticket creation)
router.get('/all', auth, async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      where: {
        OR: [
          { isPrivate: false },
          { members: { some: { userId: req.user.id } } }
        ]
      },
      select: {
        id: true,
        name: true,
        description: true,
        isPrivate: true,
        _count: {
          select: { tickets: true, members: true }
        }
      },
      orderBy: { name: 'asc' }
    });

    res.json(groups);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener grupos.' });
  }
});

// Get user's groups
router.get('/', auth, async (req, res) => {
  try {
    const groups = await prisma.userGroup.findMany({
      where: { userId: req.user.id },
      select: {
        group: {
          select: {
            id: true,
            name: true,
            description: true,
            _count: {
              select: { tickets: true, members: true }
            }
          }
        }
      }
    });

    res.json(groups.map(g => g.group));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener grupos.' });
  }
});

// Create group (only pastora)
router.post('/', auth, isPastora, async (req, res) => {
  try {
    const { name, description } = req.body;

    const group = await prisma.group.create({
      data: {
        name,
        description,
        members: {
          create: {
            userId: req.user.id
          }
        }
      },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true } } }
        }
      }
    });

    res.status(201).json(group);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear grupo.' });
  }
});

// Get group detail
router.get('/:id', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const group = await prisma.group.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { id: true, name: true, email: true, role: true } } }
        },
        tickets: {
          select: {
            id: true,
            title: true,
            status: true,
            deadline: true,
            createdAt: true
          },
          orderBy: { createdAt: 'desc' }
        }
      }
    });

    if (!group) {
      return res.status(404).json({ error: 'Grupo no encontrado.' });
    }

    if (group.isPrivate) {
      const isMember = group.members.some(m => m.userId === req.user.id);
      if (!isMember) {
        return res.status(404).json({ error: 'Grupo no encontrado.' });
      }
    }

    res.json(group);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener grupo.' });
  }
});

// Add member to group
router.post('/:id/members', auth, isPastora, async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.body;

    const existingMember = await prisma.userGroup.findUnique({
      where: {
        userId_groupId: { userId, groupId: id }
      }
    });

    if (existingMember) {
      return res.status(400).json({ error: 'El usuario ya es miembro del grupo.' });
    }

    const member = await prisma.userGroup.create({
      data: {
        userId,
        groupId: id
      },
      include: {
        user: { select: { id: true, name: true, email: true } }
      }
    });

    res.status(201).json(member);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al agregar miembro.' });
  }
});

// Remove member from group
router.delete('/:id/members/:userId', auth, isPastora, async (req, res) => {
  try {
    const { id, userId } = req.params;

    await prisma.userGroup.delete({
      where: {
        userId_groupId: { userId, groupId: id }
      }
    });

    res.json({ message: 'Miembro eliminado del grupo.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar miembro.' });
  }
});

module.exports = router;
