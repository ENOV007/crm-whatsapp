const express = require('express');
const { auth, isAdmin } = require('../middleware/auth');
const { VAPID_PUBLIC_KEY, saveSubscription, removeSubscription, sendPushToUser } = require('../services/pushNotifications');

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
    await saveSubscription(req.user.id, subscription, req.headers['user-agent']);
    res.json({ message: 'Suscripción guardada.' });
  } catch (error) {
    console.error('Error saving push subscription:', error);
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

router.post('/test', auth, isAdmin, async (req, res) => {
  try {
    const result = await sendPushToUser(req.user.id, {
      title: 'Notificación de prueba',
      body: 'Las notificaciones push están funcionando correctamente!',
      url: '/',
      icon: '/icon-192.png'
    });
    res.json({ message: 'Push enviado', results: result });
  } catch (error) {
    console.error('Error sending test push:', error);
    res.status(500).json({ error: 'Error al enviar push de prueba.' });
  }
});

module.exports = router;
