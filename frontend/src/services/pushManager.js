import { pushAPI } from './api';

let swRegistration = null;

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Push notifications not supported');
    return false;
  }

  try {
    swRegistration = await navigator.serviceWorker.register('/sw.js');
    console.log('Service Worker registered');
    return true;
  } catch (error) {
    console.error('Service Worker registration failed:', error);
    return false;
  }
}

export async function subscribeToPush() {
  if (!swRegistration) {
    const registered = await registerServiceWorker();
    if (!registered) return null;
  }

  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Push permission denied');
      return null;
    }

    const res = await pushAPI.getVapidKey();
    const publicKey = res.data.publicKey;

    const subscription = await swRegistration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });

    await pushAPI.subscribe(subscription.toJSON());
    console.log('Push subscribed successfully');
    return subscription;
  } catch (error) {
    console.error('Push subscription failed:', error);
    return null;
  }
}

export async function unsubscribeFromPush() {
  if (!swRegistration) return;

  try {
    const subscription = await swRegistration.pushManager.getSubscription();
    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();
      await pushAPI.unsubscribe({ endpoint });
      console.log('Push unsubscribed');
    }
  } catch (error) {
    console.error('Push unsubscribe failed:', error);
  }
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
