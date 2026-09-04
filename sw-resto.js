// ===================================================================
//  Service worker de l'ecran du comptoir.
//
//  Il ne sert QU'A recevoir les notifications de commande. Il ne met
//  rien en cache, volontairement : un ecran de service qui affiche une
//  version en cache de la liste des commandes serait pire que pas
//  d'ecran du tout. La page se recharge du reseau, toujours.
// ===================================================================

// Prendre la main tout de suite plutot qu'au prochain redemarrage :
// quelqu'un qui vient d'activer les notifications doit les recevoir
// pour la commande suivante, pas le lendemain.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (e) => {
  // Sans charge lisible on notifie quand meme : mieux vaut un libelle
  // generique qu'une commande passee inapercue.
  let d = {
    titre: 'Nouvelle commande',
    corps: 'Ouvrez l’écran du comptoir.',
    url: 'restaurant.html',
  };
  try { d = { ...d, ...(e.data ? e.data.json() : {}) }; } catch (err) { /* charge illisible */ }

  e.waitUntil(self.registration.showNotification(d.titre, {
    body: d.corps,
    // Chemins RELATIFS a la portee du service worker, jamais absolus :
    // le site vit aujourd'hui sous /Ksm/ et vivra peut-etre demain a la
    // racine de ksm-burger.fr. Un chemin absolu casserait ce jour-la,
    // en silence.
    icon: new URL('photos/1-burger-bacon.jpg', self.registration.scope).href,
    badge: new URL('photos/1-burger-bacon.jpg', self.registration.scope).href,
    tag: d.etiquette || 'commande',
    // Deux commandes coup sur coup n'empilent pas deux bandeaux, mais
    // le telephone vibre quand meme la seconde fois.
    renotify: true,
    // En cuisine, on a les mains prises et le telephone est loin : la
    // notification reste a l'ecran jusqu'a ce qu'on la touche.
    requireInteraction: true,
    vibrate: [180, 90, 180],
    data: { url: d.url },
  }));
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const brut = (e.notification.data && e.notification.data.url) || 'restaurant.html';
  const cible = new URL(brut, self.registration.scope).href;

  // Si l'ecran du comptoir est deja ouvert quelque part, on le ramene
  // au premier plan plutot que d'ouvrir un second onglet — sinon on se
  // retrouve avec dix onglets identiques en fin de service.
  e.waitUntil((async () => {
    const fenetres = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const f of fenetres) {
      if (new URL(f.url).origin === self.location.origin) {
        await f.focus();
        if ('navigate' in f) await f.navigate(cible).catch(() => undefined);
        return;
      }
    }
    await self.clients.openWindow(cible);
  })());
});
