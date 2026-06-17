const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');
const {
  sendWhatsAppMessage,
  sendWhatsAppGroupMessage,
  sendGroupStatusSummary,
  sendNewTicketNotification,
  sendDeadlineWarning,
  sendAllGroupStatusSummaries,
  sendAllDeadlineWarnings
} = require('../services/whatsappNotifications');

const router = express.Router();
const prisma = new PrismaClient();

const WPPCONNECT_URL = process.env.WPPCONNECT_URL || 'http://whatsapp.railway.internal:8080';
const WPPCONNECT_SESSION = process.env.WPPCONNECT_SESSION || 'crm-session';
const WPPCONNECT_SECRET = process.env.WPPCONNECT_SECRET || 'THISISMYSECURETOKEN';

let WPPCONNECT_TOKEN = process.env.WPPCONNECT_TOKEN || '';

const wppApi = axios.create({
  baseURL: WPPCONNECT_URL,
  headers: {
    'Authorization': `Bearer ${WPPCONNECT_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

async function ensureToken() {
  if (WPPCONNECT_TOKEN) return;
  try {
    const resp = await axios.post(`${WPPCONNECT_URL}/api/${WPPCONNECT_SESSION}/${WPPCONNECT_SECRET}/generate-token`);
    if (resp.data?.token) {
      WPPCONNECT_TOKEN = resp.data.token;
      wppApi.defaults.headers.common['Authorization'] = `Bearer ${WPPCONNECT_TOKEN}`;
      console.log('[WhatsApp] Token generated automatically');
    }
  } catch (error) {
    console.error('[WhatsApp] Could not auto-generate token:', error.message);
  }
}

// Health check - WPPConnect connection status
router.get('/status', auth, async (req, res) => {
  try {
    await ensureToken();
    const response = await wppApi.post(`/api/${WPPCONNECT_SESSION}/start-session`);
    res.json({
      connected: response.data?.isConnected || false,
      session: WPPCONNECT_SESSION,
      server: WPPCONNECT_URL
    });
  } catch (error) {
    res.json({
      connected: false,
      session: WPPCONNECT_SESSION,
      server: WPPCONNECT_URL,
      error: error.response?.data?.message || error.message
    });
  }
});

// Get QR code for connecting WhatsApp
router.get('/qr', auth, async (req, res) => {
  try {
    const response = await wppApi.post(`/api/${WPPCONNECT_SESSION}/start-session`);
    if (response.data?.base64) {
      res.json({ qr: response.data.base64 });
    } else {
      res.json({ message: 'Session already connected or QR not ready', data: response.data });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error getting QR code', details: error.response?.data || error.message });
  }
});

// Restart session
router.post('/restart', auth, async (req, res) => {
  try {
    await wppApi.delete(`/api/${WPPCONNECT_SESSION}/logout`);
    res.json({ message: 'Session logged out. Restart to get new QR.' });
  } catch (error) {
    res.status(500).json({ error: 'Error restarting session', details: error.response?.data || error.message });
  }
});

// Send message to phone number (1:1)
router.post('/send', auth, async (req, res) => {
  try {
    const { phone, message } = req.body;
    if (!phone || !message) {
      return res.status(400).json({ error: 'phone and message are required' });
    }
    const result = await sendWhatsAppMessage(phone, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Error sending message', details: error.response?.data || error.message });
  }
});

// Send message to WhatsApp group
router.post('/send-group', auth, async (req, res) => {
  try {
    const { groupId, message } = req.body;
    if (!groupId || !message) {
      return res.status(400).json({ error: 'groupId and message are required' });
    }
    const result = await sendWhatsAppGroupMessage(groupId, message);
    res.json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: 'Error sending group message', details: error.response?.data || error.message });
  }
});

// List WhatsApp groups
router.get('/groups', auth, async (req, res) => {
  try {
    const response = await wppApi.get(`/api/${WPPCONNECT_SESSION}/groups`);
    res.json(response.data);
  } catch (error) {
    res.status(500).json({ error: 'Error listing groups', details: error.response?.data || error.message });
  }
});

// Send status summary to a specific CRM group
router.post('/notify/status/:crmGroupId', auth, async (req, res) => {
  try {
    const { crmGroupId } = req.params;
    const result = await sendGroupStatusSummary(crmGroupId);
    if (result) {
      res.json({ success: true, message: 'Status summary sent' });
    } else {
      res.json({ success: false, message: 'Group has no WhatsApp linked or no tickets' });
    }
  } catch (error) {
    res.status(500).json({ error: 'Error sending status summary', details: error.message });
  }
});

// Send status summary to ALL groups
router.post('/notify/status-all', auth, async (req, res) => {
  try {
    const results = await sendAllGroupStatusSummaries();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: 'Error sending status summaries', details: error.message });
  }
});

// Send deadline warnings to ALL groups
router.post('/notify/deadlines', auth, async (req, res) => {
  try {
    const results = await sendAllDeadlineWarnings();
    res.json({ success: true, results });
  } catch (error) {
    res.status(500).json({ error: 'Error sending deadline warnings', details: error.message });
  }
});

// Send new ticket notification (called internally)
router.post('/notify/new-ticket', auth, async (req, res) => {
  try {
    const { groupId, ticket } = req.body;
    const result = await sendNewTicketNotification(groupId, ticket);
    res.json({ success: !!result });
  } catch (error) {
    res.status(500).json({ error: 'Error sending new ticket notification', details: error.message });
  }
});

module.exports = router;
