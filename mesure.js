// ===================================================================
//  Mesure — Google Analytics et suivi des vrais contacts.
//
//  A copier dans chaque site client, et a charger APRES la definition
//  de window.LOCWEB_CONFIG :
//
//    <script src="mesure.js" defer></script>
//
//  Trois raisons d'exister.
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
//  3. L'identifiant de mesure n'a plus a etre colle a la main. Des que
//     le client connecte son compte Google, la base le connait ; ce
//     fichier va le chercher tout seul. C'etait le dernier geste
//     manuel de la mise en service, et le plus facile a oublier.
//
//  Ce fichier ne pose aucun cookie publicitaire et n'envoie rien de
//  nominatif : uniquement des compteurs anonymes vers GA4.
// ===================================================================

(function () {
  var config = window.LOCWEB_CONFIG || {};

  /* ---------- les contacts, tout de suite ---------- */

  // Les ecouteurs se posent AVANT de connaitre l'identifiant. gtag
  // empile dans dataLayer, que la balise soit chargee ou non : un clic
  // survenu pendant la recherche de l'identifiant sera envoye des que
  // la balise arrive, au lieu d'etre perdu.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }

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

  /* ---------- l'identifiant ---------- */

  // Trois sources, dans cet ordre : la config du site, une balise gtag
  // deja posee a la main, ou la base. Les deux premieres sont
  // immediates ; la troisieme evite d'avoir a coller quoi que ce soit.
  var dejaPosee = document.querySelector('script[src*="googletagmanager.com/gtag/js"]');

  if (dejaPosee) {
    // Rien a faire : la balise du site fait deja le travail, et en
    // ajouter une seconde compterait chaque visite en double.
    window.gtag = window.gtag || gtag;
    return;
  }

  if (config.ga4Id) {
    poser(config.ga4Id);
    return;
  }

  demanderALaBase(function (id) { if (id) poser(id); });

  function poser(idGa4) {
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(idGa4);
    document.head.appendChild(script);
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', idGa4);
  }

  // `mesure_publique` n'expose que client_id et ga4_measurement_id.
  // Un echec est silencieux : le site doit continuer de fonctionner
  // meme si Supabase est injoignable — mieux vaut perdre une mesure
  // qu'afficher une erreur a un visiteur.
  function demanderALaBase(suite) {
    if (!config.supabaseUrl || !config.supabaseAnonKey || !config.clientId) return suite(null);

    var url = config.supabaseUrl + '/rest/v1/mesure_publique'
      + '?client_id=eq.' + encodeURIComponent(config.clientId)
      + '&select=ga4_measurement_id';

    fetch(url, { headers: { apikey: config.supabaseAnonKey } })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (lignes) {
        suite(lignes && lignes[0] ? lignes[0].ga4_measurement_id : null);
      })
      .catch(function () { suite(null); });
  }
})();
