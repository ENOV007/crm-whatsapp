const { PrismaClient } = require('@prisma/client');
const axios = require('axios');

const prisma = new PrismaClient();

const WPPCONNECT_URL = process.env.WPPCONNECT_URL || 'http://whatsapp.railway.internal:8080';
const WPPCONNECT_SESSION = process.env.WPPCONNECT_SESSION || 'crm-session';
const WPPCONNECT_SECRET = process.env.WPPCONNECT_SECRET || 'THISISMYSECURETOKEN';
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://crm-familiayproposito.up.railway.app';

let WPPCONNECT_TOKEN = process.env.WPPCONNECT_TOKEN || '';

const wppApi = axios.create({
  baseURL: WPPCONNECT_URL,
  headers: {
    'Authorization': `Bearer ${WPPCONNECT_TOKEN}`,
    'Content-Type': 'application/json'
  },
  timeout: 30000
});

let tokenReady = false;

async function ensureToken() {
  if (tokenReady) return;
  try {
    const resp = await axios.post(`${WPPCONNECT_URL}/api/${WPPCONNECT_SESSION}/${WPPCONNECT_SECRET}/generate-token`);
    if (resp.data?.full) {
      WPPCONNECT_TOKEN = resp.data.full;
      wppApi.defaults.headers['Authorization'] = `Bearer ${WPPCONNECT_TOKEN}`;
      tokenReady = true;
      console.log('[WhatsApp Notifications] Token generated');
    }
  } catch (error) {
    console.error('[WhatsApp Notifications] Token generation failed:', error.message);
  }
}

async function sendWhatsAppMessage(to, text) {
  try {
    await ensureToken();
    const phone = to.replace(/[^0-9]/g, '');
    const response = await wppApi.post(`/api/${WPPCONNECT_SESSION}/send-message`, {
      phone: phone,
      message: text
    });
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp message:', error.response?.data || error.message);
    return null;
  }
}

async function sendWhatsAppGroupMessage(groupId, text) {
  try {
    await ensureToken();
    const response = await wppApi.post(`/api/${WPPCONNECT_SESSION}/send-message`, {
      groupId: groupId,
      message: text
    });
    return response.data;
  } catch (error) {
    console.error('Error sending WhatsApp group message:', error.response?.data || error.message);
    return null;
  }
}

function getPriorityEmoji(priority) {
  switch (priority) {
    case 'ALTA': return '🔴';
    case 'MEDIA': return '🟡';
    case 'BAJA': return '🟢';
    default: return '⚪';
  }
}

function getPriorityColor(priority) {
  switch (priority) {
    case 'ALTA': return 'alta';
    case 'MEDIA': return 'media';
    case 'BAJA': return 'baja';
    default: return '';
  }
}

function getStatusEmoji(status) {
  switch (status) {
    case 'PENDIENTE_PASTORA': return '⏳';
    case 'PENDIENTE_REVISION': return '👀';
    case 'APROBADO': return '✅';
    case 'EN_PROGRESO': return '🔄';
    case 'COMPLETADO': return '✔️';
    case 'RECHAZADO': return '❌';
    default: return '📋';
  }
}

function formatDate(date) {
  if (!date) return 'Sin fecha';
  return new Date(date).toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit'
  });
}

function getDaysUntil(date) {
  if (!date) return null;
  const now = new Date();
  const deadline = new Date(date);
  const diffTime = deadline - now;
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

function getDeadlineWarning(deadline) {
  const days = getDaysUntil(deadline);
  if (days === null) return '';
  if (days < 0) return `❌ *VENCIDO hace ${Math.abs(days)} día(s)*`;
  if (days === 0) return '⚠️ *VENCE HOY*';
  if (days <= 2) return `🔴 *Vence en ${days} día(s)*`;
  if (days <= 5) return `🟡 *Vence en ${days} días*`;
  return `🟢 Vence en ${days} días`;
}

// Format: Estado de casos del grupo
function formatGroupStatus(groupName, tickets, groupUrl) {
  if (tickets.length === 0) {
    return `📋 *Estado de casos*\n\nGrupo: *${groupName}*\n\n_No hay casos activos._`;
  }

  let msg = `📋 *Estado de casos*\n\n`;
  msg += `👥 Grupo: *${groupName}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const sortedTickets = [...tickets].sort((a, b) => {
    if (!a.deadline) return 1;
    if (!b.deadline) return -1;
    return new Date(a.deadline) - new Date(b.deadline);
  });

  for (const ticket of sortedTickets) {
    const priority = getPriorityEmoji(ticket.priority);
    const status = getStatusEmoji(ticket.status);
    const deadline = getDeadlineWarning(ticket.deadline);
    const dateStr = ticket.deadline ? formatDate(ticket.deadline) : 'Sin fecha';

    msg += `${status} *${ticket.title}*\n`;
    msg += `   ${priority} ${ticket.priority || 'S/P'} · ${dateStr}\n`;

    if (deadline) {
      msg += `   ${deadline}\n`;
    }
    msg += `\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📊 Total: ${tickets.length} caso(s)\n\n`;
  msg += `🔗 *Link al sistema de gestión:*\n${groupUrl}`;

  return msg;
}

// Format: New ticket notification
function formatNewTicket(groupName, ticket, groupUrl) {
  const priority = getPriorityEmoji(ticket.priority);
  const dateStr = ticket.deadline ? formatDate(ticket.deadline) : 'Sin fecha';

  let msg = `📢 *Nuevo caso en ${groupName}*\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `📝 *${ticket.title}*\n`;
  msg += `${ticket.description ? `\n${ticket.description.substring(0, 200)}${ticket.description.length > 200 ? '...' : ''}\n\n` : '\n'}`;
  msg += `${priority} Prioridad: *${ticket.priority || 'Sin prioridad'}*\n`;
  msg += `📅 Fecha límite: *${dateStr}*\n\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🔗 *Ver detalles:*\n${groupUrl}/tickets/${ticket.id}`;

  return msg;
}

// Format: Deadline warning
function formatDeadlineWarning(groupName, tickets, groupUrl) {
  let msg = `⚠️ *ALERTA DE FECHAS LÍMITE*\n\n`;
  msg += `👥 Grupo: *${groupName}*\n`;
  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;

  const urgentTickets = tickets
    .filter(t => t.deadline && getDaysUntil(t.deadline) !== null)
    .sort((a, b) => new Date(a.deadline) - new Date(b.deadline));

  for (const ticket of urgentTickets) {
    const days = getDaysUntil(ticket.deadline);
    const priority = getPriorityEmoji(ticket.priority);
    const warning = getDeadlineWarning(ticket.deadline);

    msg += `${priority} *${ticket.title}*\n`;
    msg += `   ${warning}\n`;
    msg += `   📅 ${formatDate(ticket.deadline)}\n\n`;
  }

  msg += `━━━━━━━━━━━━━━━━━━━━━━\n\n`;
  msg += `🔗 *Link al sistema de gestión:*\n${groupUrl}`;

  return msg;
}

// Send status summary to a group (every 3 days)
async function sendGroupStatusSummary(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, whatsappGroupId: true }
  });

  if (!group?.whatsappGroupId) {
    console.log(`Group ${group?.name} has no WhatsApp group linked, skipping status summary`);
    return null;
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      groupId: groupId,
      hidden: false,
      status: { notIn: ['COMPLETADO', 'RECHAZADO'] }
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      deadline: true,
      description: true,
      createdAt: true
    },
    orderBy: { createdAt: 'desc' }
  });

  const groupUrl = `${FRONTEND_URL}/groups/${groupId}`;
  const message = formatGroupStatus(group.name, tickets, groupUrl);

  return await sendWhatsAppGroupMessage(group.whatsappGroupId, message);
}

// Send new ticket notification to group
async function sendNewTicketNotification(groupId, ticket) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, whatsappGroupId: true }
  });

  if (!group?.whatsappGroupId) {
    console.log(`Group ${group?.name} has no WhatsApp group linked, skipping notification`);
    return null;
  }

  const groupUrl = `${FRONTEND_URL}/groups/${groupId}`;
  const message = formatNewTicket(group.name, ticket, groupUrl);

  return await sendWhatsAppGroupMessage(group.whatsappGroupId, message);
}

// Send deadline warning to group
async function sendDeadlineWarning(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    select: { id: true, name: true, whatsappGroupId: true }
  });

  if (!group?.whatsappGroupId) {
    return null;
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      groupId: groupId,
      hidden: false,
      status: { notIn: ['COMPLETADO', 'RECHAZADO'] },
      deadline: { not: null }
    },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      deadline: true
    }
  });

  const urgentTickets = tickets.filter(t => {
    const days = getDaysUntil(t.deadline);
    return days !== null && days <= 5;
  });

  if (urgentTickets.length === 0) {
    return null;
  }

  const groupUrl = `${FRONTEND_URL}/groups/${groupId}`;
  const message = formatDeadlineWarning(group.name, urgentTickets, groupUrl);

  return await sendWhatsAppGroupMessage(group.whatsappGroupId, message);
}

// Send status summaries to ALL groups with linked WhatsApp
async function sendAllGroupStatusSummaries() {
  const groups = await prisma.group.findMany({
    where: { whatsappGroupId: { not: null } },
    select: { id: true, name: true }
  });

  const results = [];
  for (const group of groups) {
    console.log(`Sending status summary to ${group.name}...`);
    const result = await sendGroupStatusSummary(group.id);
    results.push({ group: group.name, sent: !!result });

    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}

// Send deadline warnings to ALL groups
async function sendAllDeadlineWarnings() {
  const groups = await prisma.group.findMany({
    where: { whatsappGroupId: { not: null } },
    select: { id: true, name: true }
  });

  const results = [];
  for (const group of groups) {
    const result = await sendDeadlineWarning(group.id);
    if (result) {
      results.push({ group: group.name, sent: true });
    }
    await new Promise(r => setTimeout(r, 1000));
  }

  return results;
}

module.exports = {
  sendWhatsAppMessage,
  sendWhatsAppGroupMessage,
  sendGroupStatusSummary,
  sendNewTicketNotification,
  sendDeadlineWarning,
  sendAllGroupStatusSummaries,
  sendAllDeadlineWarnings,
  getDaysUntil,
  getDeadlineWarning
};
