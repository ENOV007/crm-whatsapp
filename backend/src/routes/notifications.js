const express = require('express');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

// Get user's notifications
router.get('/', auth, async (req, res) => {
  try {
    const { unread } = req.query;

    const where = { userId: req.user.id };
    if (unread === 'true') where.read = false;

    const notifications = await prisma.notification.findMany({
      where,
      select: {
        id: true,
        message: true,
        read: true,
        createdAt: true,
        ticket: {
          select: { id: true, title: true, status: true }
        }
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    res.json(notifications);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener notificaciones.' });
  }
});

// Get unread count
router.get('/unread-count', auth, async (req, res) => {
  try {
    const count = await prisma.notification.count({
      where: {
        userId: req.user.id,
        read: false
      }
    });

    res.json({ count });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al obtener conteo.' });
  }
});

// Mark notification as read
router.patch('/:id/read', auth, async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await prisma.notification.update({
      where: { id },
      data: { read: true }
    });

    res.json(notification);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al marcar notificación.' });
  }
});

// Mark all as read
router.patch('/read-all', auth, async (req, res) => {
  try {
    await prisma.notification.updateMany({
      where: {
        userId: req.user.id,
        read: false
      },
      data: { read: true }
    });

    res.json({ message: 'Todas las notificaciones marcadas como leídas.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Error al marcar notificaciones.' });
  }
});

module.exports = router;
