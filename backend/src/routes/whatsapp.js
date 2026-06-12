const express = require('express');
const axios = require('axios');
const { PrismaClient } = require('@prisma/client');
const { auth } = require('../middleware/auth');

const router = express.Router();
const prisma = new PrismaClient();

const WHATSAPP_API_URL = 'https://graph.facebook.com/v18.0';

// Verify webhook
router.get('/', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// Handle incoming messages
router.post('/', async (req, res) => {
  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      const entry = body.entry?.[0];
      const changes = entry?.changes?.[0];
      const messages = changes?.value?.messages;

      if (messages) {
        for (const message of messages) {
          await handleIncomingMessage(message);
        }
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error('Error processing webhook:', error);
    res.sendStatus(200); // Always return 200 to WhatsApp
  }
});

async function handleIncomingMessage(message) {
  const from = message.from;
  const text = message.text?.body;

  if (!text) return;

  // Find user by phone number
  const user = await prisma.user.findFirst({
    where: { phone: from },
    include: {
      groups: {
        include: { group: true }
      }
    }
  });

  if (!user) {
    await sendWhatsAppMessage(from, 'No estás registrado en el sistema. Por favor, regístrate en la página web.');
    return;
  }

  // Simple command processing
  const command = text.toLowerCase().trim();

  if (command === 'ayuda' || command === 'help') {
    const helpText = `📋 *Comandos disponibles:*
• *mis grupos* - Ver tus grupos
• *tickets [grupo]* - Ver tickets de un grupo
• *crear [grupo] [título]* - Crear nueva sugerencia
• *ayuda* - Ver esta ayuda`;
    
    await sendWhatsAppMessage(from, helpText);
  } else if (command === 'mis grupos') {
    const groupsList = user.groups.map(g => `• ${g.group.name}`).join('\n');
    await sendWhatsAppMessage(from, `👥 *Tus grupos:*\n${groupsList || 'No perteneces a ningún grupo.'}`);
  } else if (command.startsWith('tickets ')) {
    const groupName = command.replace('tickets ', '');
    const group = user.groups.find(g => 
      g.group.name.toLowerCase().includes(groupName)
    );

    if (!group) {
      await sendWhatsAppMessage(from, 'No se encontró el grupo especificado.');
      return;
    }

    const tickets = await prisma.ticket.findMany({
      where: { groupId: group.group.id },
      orderBy: { createdAt: 'desc' },
      take: 5
    });

    if (tickets.length === 0) {
      await sendWhatsAppMessage(from, 'No hay tickets en este grupo.');
      return;
    }

    const ticketsList = tickets.map(t => 
      `• *${t.title}* - ${t.status.replace('_', ' ')}${t.deadline ? ` (Vence: ${new Date(t.deadline).toLocaleDateString()})` : ''}`
    ).join('\n');

    await sendWhatsAppMessage(from, `📝 *Tickets de ${group.group.name}:*\n${ticketsList}`);
  }
}

async function sendWhatsAppMessage(to, text) {
  try {
    await axios.post(
      `${WHATSAPP_API_URL}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: text }
      },
      {
        headers: {
          'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
  }
}

// Send message to user (used by other parts of the app)
async function notifyUser(userId, message) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { phone: true }
  });

  if (user?.phone) {
    await sendWhatsAppMessage(user.phone, message);
  }
}

// Send ticket notification to group members
async function notifyGroupMembers(groupId, ticket, statusMessage) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: {
      members: {
        include: { user: { select: { id: true, phone: true } } }
      }
    }
  });

  const message = `📢 *Actualización en ${group.name}:*\n${ticket.title}\nEstado: ${statusMessage}${ticket.deadline ? `\nVence: ${new Date(ticket.deadline).toLocaleDateString()}` : ''}\n\n🔗 Ver detalles: ${process.env.FRONTEND_URL || 'http://localhost:3000'}/tickets/${ticket.id}`;

  for (const member of group.members) {
    if (member.user.phone) {
      await sendWhatsAppMessage(member.user.phone, message);
    }
  }
}

module.exports = router;
module.exports.sendWhatsAppMessage = sendWhatsAppMessage;
module.exports.notifyUser = notifyUser;
module.exports.notifyGroupMembers = notifyGroupMembers;
