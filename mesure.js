// ===================================================================
//  Mesure — Google Analytics et suivi des vrais contacts.
//
//  A copier dans chaque site client, et a charger APRES la definition
//  de window.LOCWEB_CONFIG :
//
//    <script src="mesure.js"></script>
//
//  Deux raisons d'exister.
//
//  1. Sans balise GA4, le tableau de bord du client affiche zero
//     visiteur quoi qu'il arrive. Aucun des sites clients n'en avait.
//
//  2. Sur le site d'un artisan, l'action qui compte n'est pas de
//     remplir un formulaire : c'est d'appuyer sur le numero de
//     telephone. Personne ne la mesurait. On affichait donc "340
//     visiteurs, 0 demande" a un client qui avait peut-etre recu
//     quinze appels — et il en concluait que son site ne sert a rien.
//
//  Ce fichier ne pose aucun cookie publicitaire et n'envoie rien de
//  nominatif : uniquement des compteurs anonymes vers GA4.
// ===================================================================

(function () {
  var config = window.LOCWEB_CONFIG || {};

  // L'identifiant peut venir de trois endroits, dans cet ordre : la
  // config du site, une balise gtag deja posee a la main, ou rien.
  // Ce repli evite de poser une SECONDE balise sur un site qui en a
  // deja une — ce qui compterait chaque visite en double.
  var dejaPosee = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');
  var idGa4 = config.ga4Id || (dejaPosee && idDepuisUrl(dejaPosee.src));

  // Pas d'identifiant, pas de mesure. Le site continue de fonctionner
  // normalement — mieux vaut aucune donnee qu'une balise cassee.
  if (!idGa4) return;

  /* ---------- la balise ---------- */

  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

  if (!dejaPosee) {
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(idGa4);
    document.head.appendChild(script);
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', idGa4);
  }

  function idDepuisUrl(src) {
    var m = /[?&]id=([^&]+)/.exec(src || '');
    return m ? decodeURIComponent(m[1]) : null;
  }

  /* ---------- les contacts ---------- */

  // Un seul ecouteur sur le document plutot qu'un par lien : les menus
  // et les cartes produits sont reconstruits par les loaders apres le
  // chargement, et des ecouteurs poses a l'avance rateraient tout ce
  // qui apparait ensuite.
  document.addEventListener('click', function (e) {
    var lien = e.target.closest && e.target.closest('a[href]');
    if (!lien) return;

    var href = lien.getAttribute('href') || '';

    if (href.indexOf('tel:') === 0) {
      envoyer('appel_telephone', { numero: href.slice(4) });
    } else if (href.indexOf('mailto:') === 0) {
      envoyer('clic_email');
    } else if (/google\.[a-z.]+\/maps|maps\.app\.goo\.gl|waze\.com/.test(href)) {
      envoyer('clic_itineraire');
    } else if (/wa\.me|api\.whatsapp\.com/.test(href)) {
      envoyer('clic_whatsapp');
    } else if (/instagram\.com|facebook\.com|tiktok\.com/.test(href)) {
      envoyer('clic_reseau_social');
    }
  }, true);

  // Le formulaire de devis. On ecoute la soumission, pas le clic sur le
  // bouton : un envoi bloque par la validation du navigateur ne doit pas
  // etre compte comme un contact.
  document.addEventListener('submit', function (e) {
    if (e.target && e.target.tagName === 'FORM') envoyer('envoi_formulaire');
  }, true);

  function envoyer(nom, parametres) {
    try { gtag('event', nom, parametres || {}); } catch (err) { /* la mesure n'empeche jamais l'action */ }
  }
})();
