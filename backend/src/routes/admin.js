const express = require('express');
const bcrypt = require('bcryptjs');
const { PrismaClient } = require('@prisma/client');
const { auth, isAdmin } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// All admin routes require auth + admin role
router.use(auth, isAdmin);

// Get stats
router.get('/stats', async (req, res) => {
  try {
    const [users, groups, tickets, ticketsByStatus] = await Promise.all([
      prisma.user.count(),
      prisma.group.count(),
      prisma.ticket.count(),
      prisma.ticket.groupBy({
        by: ['status'],
        _count: { id: true }
      })
    ]);

    const stats = {
      totalUsers: users,
      totalGroups: groups,
      totalTickets: tickets,
      ticketsByStatus: ticketsByStatus.reduce((acc, item) => {
        acc[item.status] = item._count.id;
        return acc;
      }, {})
    };

    res.json(stats);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener estadísticas.' });
  }
});

// List all users
router.get('/users', async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        role: true,
        createdAt: true,
        groups: {
          select: {
            group: {
              select: { id: true, name: true }
            },
            isLeader: true
          }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    const usersWithGroups = users.map(u => ({
      ...u,
      groups: u.groups.map(g => ({ ...g.group, isLeader: g.isLeader }))
    }));

    res.json(usersWithGroups);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener usuarios.' });
  }
});

// Create user (admin can assign role)
router.post('/users', async (req, res) => {
  try {
    const { name, apellido, password, phone, role, groupId } = req.body;

    if (!name || !apellido || !password) {
      return res.status(400).json({ error: 'Nombre, apellido y contraseña son requeridos.' });
    }

    if (name.length < 3 || apellido.length < 3) {
      return res.status(400).json({ error: 'Nombre y apellido deben tener al menos 3 caracteres.' });
    }

    // Generate email: 3 letters name + 3 letters apellido + @crm.com
    const baseEmail = (name.substring(0, 3) + apellido.substring(0, 3)).toLowerCase() + '@crm.com';
    let email = baseEmail;
    let counter = 2;

    // Check if email exists, add number if needed
    while (await prisma.user.findUnique({ where: { email } })) {
      email = baseEmail.replace('@crm.com', `${counter}@crm.com`);
      counter++;
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const validRoles = ['ADMIN', 'PASTORA', 'MEMBER'];
    const userRole = validRoles.includes(role) ? role : 'MEMBER';

    const userData = {
      name: `${name} ${apellido}`,
      email,
      password: hashedPassword,
      phone,
      role: userRole
    };

    if (groupId) {
      const group = await prisma.group.findUnique({ where: { id: groupId } });
      if (group) {
        userData.groups = {
          create: { groupId }
        };
      }
    }

    const user = await prisma.user.create({
      data: userData,
      select: { id: true, name: true, email: true, role: true }
    });

    res.status(201).json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear usuario.' });
  }
});

// Update user role
router.patch('/users/:id/role', async (req, res) => {
  try {
    const { id } = req.params;
    const { role } = req.body;

    const validRoles = ['ADMIN', 'PASTORA', 'MEMBER'];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: 'Rol inválido.' });
    }

    const user = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, name: true, email: true, role: true }
    });

    res.json(user);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar rol.' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    const { id } = req.params;

    if (id === req.user.id) {
      return res.status(400).json({ error: 'No puedes eliminar tu propia cuenta.' });
    }

    await prisma.user.delete({ where: { id } });

    res.json({ message: 'Usuario eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar usuario.' });
  }
});

// Reset user password (marks mustChangePassword = true)
router.post('/users/:id/reset-password', async (req, res) => {
  try {
    const { id } = req.params;

    await prisma.user.update({
      where: { id },
      data: {
        password: await bcrypt.hash('temporal123', 10),
        mustChangePassword: true
      }
    });

    res.json({ message: 'Contraseña reseteada. El usuario deberá cambiarla en el próximo login.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al resetear contraseña.' });
  }
});

// Change user group (remove from current, add to new)
router.patch('/users/:id/group', async (req, res) => {
  try {
    const { id } = req.params;
    const { groupId } = req.body;

    if (!groupId) {
      return res.status(400).json({ error: 'groupId es requerido.' });
    }

    // Remove from current group
    await prisma.userGroup.deleteMany({ where: { userId: id } });

    // Add to new group
    await prisma.userGroup.create({
      data: { userId: id, groupId }
    });

    res.json({ message: 'Grupo actualizado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al cambiar grupo.' });
  }
});

// Create group
router.post('/groups', async (req, res) => {
  try {
    const { name, description } = req.body;

    if (!name || name.trim().length < 2) {
      return res.status(400).json({ error: 'El nombre del grupo es requerido (mínimo 2 caracteres).' });
    }

    const existing = await prisma.group.findFirst({ where: { name: name.trim() } });
    if (existing) {
      return res.status(400).json({ error: 'Ya existe un grupo con ese nombre.' });
    }

    const group = await prisma.group.create({
      data: { name: name.trim(), description: description?.trim() || null },
      select: { id: true, name: true, description: true, createdAt: true }
    });

    res.status(201).json(group);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al crear grupo.' });
  }
});

// Delete group
router.delete('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const ticketCount = await prisma.ticket.count({ where: { groupId: id } });
    if (ticketCount > 0) {
      return res.status(400).json({ error: `No se puede eliminar: el grupo tiene ${ticketCount} ticket(s) asociado(s).` });
    }

    await prisma.userGroup.deleteMany({ where: { groupId: id } });
    await prisma.group.delete({ where: { id } });

    res.json({ message: 'Grupo eliminado.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al eliminar grupo.' });
  }
});

// Update group
router.patch('/groups/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, isPrivate } = req.body;

    const data = {};
    if (name !== undefined) data.name = name.trim();
    if (description !== undefined) data.description = description?.trim() || null;
    if (isPrivate !== undefined) data.isPrivate = isPrivate;

    const group = await prisma.group.update({
      where: { id },
      data,
      select: { id: true, name: true, description: true, isPrivate: true }
    });

    res.json(group);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al actualizar grupo.' });
  }
});

// List all groups with member count
router.get('/groups', async (req, res) => {
  try {
    const groups = await prisma.group.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        _count: {
          select: { members: true, tickets: true }
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

// Add user to group
router.post('/users/:userId/groups/:groupId', async (req, res) => {
  try {
    const { userId, groupId } = req.params;

    const existing = await prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    if (existing) {
      return res.status(400).json({ error: 'El usuario ya pertenece a este grupo.' });
    }

    await prisma.userGroup.create({
      data: { userId, groupId }
    });

    res.json({ message: 'Usuario agregado al grupo.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al agregar usuario al grupo.' });
  }
});

// Remove user from group
router.delete('/users/:userId/groups/:groupId', async (req, res) => {
  try {
    const { userId, groupId } = req.params;

    await prisma.userGroup.delete({
      where: { userId_groupId: { userId, groupId } }
    });

    res.json({ message: 'Usuario removido del grupo.' });
  } catch (error) {
    console.error('Error removing user from group:', error);
    res.status(500).json({ error: 'Error al remover usuario del grupo.' });
  }
});

// Set/unset group leader
router.patch('/users/:userId/groups/:groupId/leader', async (req, res) => {
  try {
    const { userId, groupId } = req.params;
    const { isLeader } = req.body;

    const membership = await prisma.userGroup.findUnique({
      where: { userId_groupId: { userId, groupId } }
    });

    if (!membership) {
      return res.status(404).json({ error: 'El usuario no es miembro de este grupo.' });
    }

    if (isLeader) {
      await prisma.userGroup.updateMany({
        where: { groupId },
        data: { isLeader: false }
      });
    }

    const updated = await prisma.userGroup.update({
      where: { userId_groupId: { userId, groupId } },
      data: { isLeader: !!isLeader },
      select: { userId: true, groupId: true, isLeader: true }
    });

    res.json(updated);
  } catch (error) {
    console.error('Error setting leader:', error);
    res.status(500).json({ error: 'Error al asignar líder.' });
  }
});

module.exports = router;
