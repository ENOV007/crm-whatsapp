const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendPushToUser } = require('../services/pushNotifications');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();
const router = express.Router();

router.get('/vapid-key', (req, res) => {
  if (!VAPID_PUBLIC_KEY) {
    return res.status(503).json({ error: 'Push notifications no configuradas.' });
  }
  res.json({ publicKey: VAPID_PUBLIC_KEY });
});

router.post('/subscribe', auth, async (req, res) => {
  try {
    const { subscription } = req.body;
    if (!subscription?.endpoint || !subscription?.keys) {
      return res.status(400).json({ error: 'Suscripción inválida.' });
    }
    console.log(`[push] Subscribe: user ${req.user.name} (${req.user.id}), endpoint ${subscription.endpoint.substring(0, 50)}...`);
    await saveSubscription(req.user.id, subscription, req.headers['user-agent']);
    res.json({ message: 'Suscripción guardada.' });
  } catch (error) {
    console.error('[push] Error saving subscription:', error);
    res.status(500).json({ error: 'Error al guardar suscripción.' });
  }
});

router.post('/unsubscribe', auth, async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (endpoint) {
      await removeSubscription(endpoint);
    }
    res.json({ message: 'Suscripción eliminada.' });
  } catch (error) {
    console.error('Error removing push subscription:', error);
    res.status(500).json({ error: 'Error al eliminar suscripción.' });
  }
});

router.get('/my-status', auth, async (req, res) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      where: { userId: req.user.id },
      select: { id: true, endpoint: true, userAgent: true, createdAt: true }
    });
    res.json({
      subscribed: subscriptions.length > 0,
      count: subscriptions.length,
      devices: subscriptions.map(s => ({
        id: s.id,
        userAgent: s.userAgent,
        createdAt: s.createdAt
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estado.' });
  }
});

router.post('/send-test', auth, async (req, res) => {
  try {
    const { title, body: msgBody, userId } = req.body;
    if (!title || !msgBody) {
      return res.status(400).json({ error: 'Se requiere título y mensaje.' });
    }
    const targetUserId = userId || req.user.id;
    console.log(`[push] Test push from ${req.user.name} to user ${targetUserId}`);
    const result = await sendPushToUser(targetUserId, {
      title,
      body: msgBody,
      url: '/',
      icon: '/icon-notification.png'
    });
    const sent = result.filter(r => r.status === 'sent').length;
    const failed = result.filter(r => r.status === 'error').length;
    console.log(`[push] Result: ${sent} sent, ${failed} failed`);
    res.json({ message: `Enviado a ${sent} dispositivo(s)${failed > 0 ? `, ${failed} falló` : ''}`, results: result });
  } catch (error) {
    console.error('[push] Error sending test push:', error);
    res.status(500).json({ error: 'Error al enviar push de prueba.' });
  }
});

router.get('/all-subscriptions', auth, isAdmin, async (req, res) => {
  try {
    const subscriptions = await prisma.pushSubscription.findMany({
      select: {
        id: true,
        userId: true,
        endpoint: true,
        userAgent: true,
        createdAt: true,
        user: { select: { id: true, name: true, email: true, role: true } }
      },
      orderBy: { createdAt: 'desc' }
    });
    res.json(subscriptions);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener suscripciones.' });
  }
});

module.exports = router;
