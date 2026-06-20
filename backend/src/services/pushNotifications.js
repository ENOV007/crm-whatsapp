const webpush = require('web-push');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@crm.com';

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function saveSubscription(userId, subscription, userAgent = null) {
  const { endpoint, keys } = subscription;
  return prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { p256dh: keys.p256dh, auth: keys.auth, userAgent, userId },
    create: { userId, endpoint, p256dh: keys.p256dh, auth: keys.auth, userAgent }
  });
}

async function removeSubscription(endpoint) {
  return prisma.pushSubscription.delete({ where: { endpoint } }).catch(() => {});
}

async function sendPushToUser(userId, payload) {
  const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
  const results = [];

  for (const sub of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        JSON.stringify(payload)
      );
      results.push({ endpoint: sub.endpoint, status: 'sent' });
    } catch (error) {
      if (error.statusCode === 410 || error.statusCode === 404) {
        await prisma.pushSubscription.delete({ where: { id: sub.id } }).catch(() => {});
        results.push({ endpoint: sub.endpoint, status: 'removed' });
      } else {
        results.push({ endpoint: sub.endpoint, status: 'error', error: error.message });
      }
    }
  }
  return results;
}

async function sendPushToGroup(groupId, payload, excludeUserId = null) {
  const memberships = await prisma.userGroup.findMany({
    where: { groupId },
    select: { userId: true }
  });

  const results = [];
  for (const { userId } of memberships) {
    if (excludeUserId && userId === excludeUserId) continue;
    const res = await sendPushToUser(userId, payload);
    results.push(...res);
  }
  return results;
}

module.exports = {
  VAPID_PUBLIC_KEY,
  saveSubscription,
  removeSubscription,
  sendPushToUser,
  sendPushToGroup
};
