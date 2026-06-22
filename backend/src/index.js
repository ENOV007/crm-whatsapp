require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');

const authRoutes = require('./routes/auth');
const groupRoutes = require('./routes/groups');
const ticketRoutes = require('./routes/tickets');
const notificationRoutes = require('./routes/notifications');
const whatsappRoutes = require('./routes/whatsapp');
const adminRoutes = require('./routes/admin');
const backupRoutes = require('./routes/backups');
const pushRoutes = require('./routes/push');

const app = express();
const prisma = new PrismaClient();

const allowedOrigins = process.env.CORS_ORIGINS
  ? process.env.CORS_ORIGINS.split(',').map(o => o.trim())
  : ['http://localhost:3000', 'https://crm-familiayproposito.up.railway.app', 'https://frontend-production-f764.up.railway.app', 'https://frontend-production-e27a.up.railway.app'];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/groups', groupRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/whatsapp', whatsappRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/backups', backupRoutes);
app.use('/api/push', pushRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Algo salió mal!' });
});

// WhatsApp Scheduler
const { sendAllGroupStatusSummaries, sendAllDeadlineWarnings } = require('./services/whatsappNotifications');

function scheduleWhatsAppNotifications() {
  const THREE_DAYS = 3 * 24 * 60 * 60 * 1000;
  const ONE_DAY = 24 * 60 * 60 * 1000;

  setInterval(async () => {
    console.log('[Scheduler] Sending status summaries...');
    try {
      const results = await sendAllGroupStatusSummaries();
      console.log('[Scheduler] Status summaries sent:', results);
    } catch (error) {
      console.error('[Scheduler] Error sending status summaries:', error.message);
    }
  }, THREE_DAYS);

  setInterval(async () => {
    console.log('[Scheduler] Checking deadline warnings...');
    try {
      const results = await sendAllDeadlineWarnings();
      if (results.length > 0) {
        console.log('[Scheduler] Deadline warnings sent:', results);
      }
    } catch (error) {
      console.error('[Scheduler] Error sending deadline warnings:', error.message);
    }
  }, ONE_DAY);

  console.log('[Scheduler] WhatsApp notifications scheduled (status: 3 days, deadlines: daily)');
}

function scheduleAutoDelete() {
  const ONE_DAY = 24 * 60 * 60 * 1000;

  setInterval(async () => {
    console.log('[AutoDelete] Checking for expired rejected tickets...');
    try {
      const expired = await prisma.ticket.findMany({
        where: {
          status: 'RECHAZADO',
          autoDeleteAt: { not: null, lte: new Date() }
        }
      });
      for (const ticket of expired) {
        await prisma.comment.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.notification.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.ticketViewer.deleteMany({ where: { ticketId: ticket.id } });
        await prisma.ticket.delete({ where: { id: ticket.id } });
        console.log(`[AutoDelete] Ticket "${ticket.title}" eliminado automáticamente`);
      }
      if (expired.length > 0) {
        console.log(`[AutoDelete] ${expired.length} ticket(s) eliminado(s)`);
      }
    } catch (error) {
      console.error('[AutoDelete] Error:', error.message);
    }
  }, ONE_DAY);

  console.log('[AutoDelete] Scheduled (daily check for rejected tickets)');
}

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(`Servidor corriendo en puerto ${PORT}`);
  scheduleWhatsAppNotifications();
  scheduleAutoDelete();
});

module.exports = app;
