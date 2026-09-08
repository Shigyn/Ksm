// ===================================================================
//  KSM Burger — la carte, la personnalisation, le panier, la commande.
//
//  Le site n'a qu'un objectif : qu'une commande parte. Tout ce qui ne
//  sert pas ce chemin n'est pas ici.
//
//  Ce que ce fichier NE fait pas, volontairement :
//   - il ne calcule pas le total qui fait foi. Le prix affiche sert a
//     informer ; celui qui compte est recalcule cote serveur depuis la
//     base, sinon n'importe qui commande un burger a 0 euro en
//     modifiant la page.
//   - il ne gere aucun paiement. On regle sur place.
//   - il ne propose aucune livraison. Retrait uniquement.
//   - aucune option ne change le prix. Retirer un ingredient est
//     gratuit, choisir une viande ou une sauce aussi. Un supplement
//     payant demanderait que le serveur sache le facturer, sinon
//     l'addition affichee et l'addition reelle divergent.
// ===================================================================
(function () {
  'use strict';

  var config = window.LOCWEB_CONFIG;
  if (!config || !config.supabaseUrl || !config.clientId) {
    console.warn('LOCWEB_CONFIG manquant — la carte ne peut pas se charger.');
    return;
  }

  // =================================================================
  //  FILET DE SECOURS UNIQUEMENT.
  //
  //  Ces deux listes etaient devinees — les parfums habituels d'un
  //  tacos francais — et elles etaient FAUSSES : elles proposaient un
  //  kefta et un poulet pane que KSM ne fait pas, et oubliaient le
  //  kebab et la viande hachee qu'il fait. Un client qui commande un
  //  kefta, c'est un appel et une commande a refaire.
  //
  //  Les vraies listes sont desormais lues dans la categorie
  //  « Suppléments » de la base (voir `viandesAuChoix` et
  //  `saucesOffertes`), ou Soso les a saisies. On ne retombe ici que
  //  si cette categorie est vide, pour qu'une fiche de tacos ne
  //  s'ouvre jamais sans aucun choix.
  // =================================================================
  var VIANDES = ['Steak haché', 'Escalope', 'Nuggets', 'Tenders'];
  var SAUCES  = ['Algérienne', 'Blanche', 'Samouraï', 'Barbecue', 'Ketchup'];

  /* =================================================================
     LES PHOTOS DE LA CARTE

     Deux origines, dans cet ordre de preference :

      1. les VRAIES photos du restaurant, fournies par Soso le
         2026-09-07 et normalisees en 640 x 640 par
         `plats/fabriquer.sh` ;
      2. a defaut, une photo Unsplash qui montre LE MEME PLAT.

     La regle qui tranche : une photo de banque ne rentre que si elle
     montre le meme plat. Un Coca est un Coca, des donuts sont des
     donuts — la montrer n'induit personne en erreur. Mais mettre un
     burger au boeuf sur un filet de colin, c'est promettre au
     comptoir un plat qu'on ne sert pas, et c'est le restaurant qui
     porte la reclamation.

     Quand rien d'honnete n'existe, `null` : la carte affiche
     l'initiale du plat, et le plat part sur `PHOTOS-A-DEMANDER.md`
     pour la prochaine seance photo de KSM.

     L'ORDRE COMPTE : la premiere expression qui accroche gagne. D'ou
     le classement du plus specifique au plus general, et surtout les
     FRITES AVANT LES BURGERS — « Frites cheddar » tombait sinon sur
     /double|cheddar/ et s'affichait avec la photo d'un double
     cheddar. Constate le 2026-09-08 sur trois lignes de la categorie
     Frites.
     ================================================================= */
  var U = 'https://images.unsplash.com/';
  var Q = '?w=640&h=640&fit=crop&q=75';   // meme format que les photos maison

  var PHOTOS = [
    /* --- Ce qu'on ne montre PAS, volontairement ------------------
       Le filet o fish n'existe dans aucune photo du client, et aucune
       banque d'images ne propose un burger au poisson credible. Le
       laisser vide vaut mieux que de montrer un burger au boeuf. */
    [/fish|colin/i,                 null],

    /* --- Frites : AVANT les burgers, voir l'entete --------------- */
    [/frites?.*(gruy|bacon).*(bacon|gruy)/i, 'plats/frite-gruyere-bacon.webp'],
    [/frites?.*gruy/i,              U + 'photo-1576107232684-1279f390859f' + Q],
    [/frites?.*bacon/i,             U + 'photo-1598679253544-2c97992403ea' + Q],
    [/frites?.*cheddar/i,           U + 'photo-1573080496219-bb080dd4f877' + Q],
    [/frites?.*jalape/i,            U + 'photo-1541592106381-b31e9677c0e5' + Q],
    [/frites?.*oignons/i,           U + 'photo-1585109649139-366815a0d713' + Q],
    [/^frites?$/i,                  U + 'photo-1630431341973-02e1b662ec35' + Q],

    /* --- Burgers, du plus specifique au plus general ------------- */
    [/triple\s*juli/i,              'plats/le-triple-julienas.webp'],
    [/triple\s*(cheese|bacon)/i,    'plats/le-triple-cheese-bacon.webp'],
    [/bazooka/i,                    'plats/le-bazooka.webp'],
    [/smash/i,                      'plats/smash-burger.webp'],
    [/saint.?amour/i,               'plats/le-saint-amour.webp'],
    [/moulin/i,                     'plats/le-moulin-a-vent.webp'],
    [/chiroubl/i,                   'plats/le-chiroubles.webp'],
    [/juli[eé]nas/i,                'plats/le-julienas.webp'],
    [/morgon/i,                     'plats/le-morgon.webp'],
    [/fleurie/i,                    'plats/le-fleurie.webp'],
    [/beaujolais/i,                 'plats/le-beaujolais.webp'],
    [/ch[eé]nas/i,                  'plats/double-cheddar.webp'],
    /* Le Regnie n'a pas de photo a lui. `smash-burger.webp` est la
       seule photo du lot qui ne porte le nom d'aucun cru : un burger
       simple, anonyme, qui correspond a sa composition (steak,
       salade, cheddar). Lui donner celle du Julienas afficherait un
       AUTRE burger de la carte, a 14 € au lieu de 9 €. */
    [/r[eé]gni[eé]/i,               'plats/smash-burger.webp'],
    /* Le « Cheeseburger » a 2,50 € du snacking : c'est un petit
       burger simple, une photo de burger simple ne ment pas. */
    [/cheeseburger/i,               U + 'photo-1568901346375-23c9450c58cd' + Q],
    [/double|cheddar/i,             'plats/double-cheddar.webp'],

    /* --- Tacos, sandwichs, box ----------------------------------- */
    [/tacos.*boursin|boursin.*tacos/i, 'plats/tacos-boursin.webp'],
    [/crousty/i,                    'plats/ksm-crousty.webp'],
    [/boursin/i,                    'plats/le-boursin.webp'],
    /* Le Maxi prend la photo du tacos OUVERT : c'est celle qui
       montre la garniture, donc celle qui correspond au « double
       viande ». Sans cette ligne, le Maxi et le Tacos simple
       affichaient la meme vignette cote a cote. */
    [/maxi.*tacos|tacos.*maxi/i,    'plats/tacos-boursin.webp'],
    [/tacos/i,                      'plats/tacos.webp'],
    [/kebab/i,                      U + 'photo-1561651823-34feb02250e4' + Q],
    [/le\s*chef/i,                  U + 'photo-1509722747041-616f39b57569' + Q],

    /* --- Accompagnements ----------------------------------------- */
    [/tenders/i,                    'plats/tenders.webp'],
    [/nugget/i,                     'plats/nuggets.webp'],
    [/mozza|stick/i,                'plats/mozza-sticks.webp'],
    [/jalape/i,                     'plats/jalapenos.webp'],
    [/camembert|bouch[eé]e/i,       'plats/bouchees-camembert.webp'],
    /* La box contient QUATRE choses (tenders, nuggets, bouchees
       camembert, jalapenos). Lui donner la photo des tenders la
       reduisait a un seul de ses composants — et affichait la
       meme vignette que « Tenders maison », juste a cote. Une
       planchette de fritures se lit comme ce qu'elle est : un
       plat a partager. */
    [/box/i,                        U + 'photo-1626082927389-6cd097cdc6ec' + Q],
    [/menu\s*enfant|kids/i,         U + 'photo-1610614819513-58e34989848b' + Q],

    /* --- Salades et bowls ---------------------------------------- */
    [/c[eé]sar/i,                   'plats/salade-cesar.webp'],
    [/ch[eè]vre\s*chaud/i,           U + 'photo-1512621776951-a57141f2eefd' + Q],
    /* Le bowl de KSM est a base de RIZ (« riz, viande au choix,
       fromage, sauce, frites, oignons frits »). La photo maison
       montre une salade au poulet : ce n'est pas le meme plat, et
       c'etait deja la vignette de la Salade Cesar juste au-dessus. */
    [/bowl/i,                       U + 'photo-1546069901-ba9599a7e63c' + Q],
    [/salade/i,                     'plats/salade-cesar.webp'],

    /* --- Desserts ------------------------------------------------
       La tarte au Daim n'a pas d'equivalent honnete en banque
       d'images : un gateau au chocolat n'est pas une tarte au Daim. */
    [/daim/i,                       null],
    [/milkshake.*gourmand|gourmand.*milkshake/i, U + 'photo-1572490122747-3968b75cc699' + Q],
    [/milkshake/i,                  U + 'photo-1553787499-6f9133860278' + Q],
    [/donut/i,                      U + 'photo-1551024601-bec78aea704b' + Q],
    [/gaufre/i,                     U + 'photo-1562376552-0d160a2f238d' + Q],
    [/tiramisu/i,                   U + 'photo-1571877227200-a0d98ea607e9' + Q],
    [/confiserie|bonbon/i,          U + 'photo-1582058091505-f87a2e55a40f' + Q],

    /* --- Boissons ------------------------------------------------ */
    [/coca/i,                       U + 'photo-1554866585-cd94860890b7' + Q],
    [/ice\s*tea|th[eé]\s*glac/i,     U + 'photo-1499638673689-79a0b5115d87' + Q],
    [/limonade/i,                   U + 'photo-1621263764928-df1444c5e859' + Q],
    [/eau/i,                        U + 'photo-1523362628745-0c100150b504' + Q],
    /* « Canette 33cl » (1,50 €) et « Bouteille » (2,00 €) ne disent
       pas leur parfum : seul KSM sait ce qu'il a en frigo. Toute
       photo de MARQUE y ferait donc une promesse — et la marque
       la plus evidente, le Coca, est vendue 1 € de plus sur la
       ligne d'a cote : le client croirait payer son Coca moins
       cher ici. La canette recoit un verre de soda sans marque ;
       pour la bouteille, aucune photo sans marque n'a ete
       trouvee, donc rien. Les deux sont sur PHOTOS-A-DEMANDER.md. */
    [/canette/i,                    U + 'photo-1581636625402-29b2a704ef13' + Q],
    [/bouteille/i,                  null]
  ];

  // Ordre d'apparition des categories. Ce qui fait venir les gens
  // passe en premier ; les boissons ferment la marche, comme au
  // comptoir.
  //
  // Mis a jour le 2026-09-08, apres separation des categories en base.
  // L'ancienne liste citait « Bowls et Snacking » et « Salades et
  // Desserts », qui n'existent plus : les categories inconnues
  // tombant a la fin, les desserts se retrouvaient APRES les boissons
  // et les bowls entre le menu enfant et les canettes. Le menu se
  // lisait dans un ordre que personne ne commande. Une categorie absente d'ici s'ajoute a la fin plutot
  // que de disparaitre — le restaurateur peut en creer depuis son
  // espace sans que personne ait a toucher au code.
  var ORDRE = [
    // Les plats d'abord, du plus commande au moins.
    'Burgers', 'Tacos', 'Sandwichs', 'Bowls', 'Salades',
    // Puis ce qui accompagne.
    'Snacking', 'Frites',
    // Puis la fin de repas, dans l'ordre ou on la commande.
    'Menu Kids', 'Desserts', 'Boissons'
  ];

  // Ingredients qu'on ne propose pas de retirer : ce qui reste du plat
  // sans eux n'est plus le plat. Un burger sans steak n'est pas une
  // commande, c'est une erreur de saisie.
  var SOCLE = /steak|poulet|escalope|kebab|viande|pain|galette/i;

  var panier = Object.create(null);   // cle -> { produit, quantite, options }
  var supplements = [];               // produits de la categorie Supplements
  var tousProduits = [];              // la carte entiere, boissons comprises
  /* Les supplements sont de vrais produits, avec leur prix en base —
     c'est ce qui permet au serveur de les facturer sans une ligne de
     code de plus. Mais on ne les parcourt pas comme des plats : on ne
     commande pas un cheddar tout seul, il ne se choisit que dans la
     fiche d'un burger ou d'un tacos. */
  var CAT_SUP = 'Suppléments';

  /* =================================================================
     LES FAMILLES DE SUPPLEMENTS

     La fiche affichait les trente supplements en une seule liste a
     plat, dans l'ordre du prix : on y trouvait un kebab entre deux
     fromages, et douze sauces a « + 0,00 € » qui ne disaient rien.

     Le PRIX est le signal fiable pour les ranger, parce que c'est lui
     que Soso a saisi avec intention : 3 € une viande, 1 € un fromage
     ou une garniture, 0 € une sauce offerte. Le nom ne sert qu'a
     couper le palier a 1 € en deux. Un supplement que Kassim ajoutera
     plus tard depuis son espace tombe donc tout seul dans la bonne
     famille, sans que personne touche a ce fichier.
     ================================================================= */
  var FROMAGES = /^(cheddar|raclette|boursin|kiri|ch[eè]vre|mozzarella|emmental|comt[eé]|bleu)/i;

  function familleSup(sup) {
    var prix = Number(sup.prix);
    if (prix >= 3) return 'viande';
    if (prix >= 1) return FROMAGES.test(sup.nom) ? 'fromage' : 'garniture';
    return 'sauce';                       // 0 € offerte, 0,50 € la sauce en plus
  }

  var FAMILLES = [
    { cle: 'viande',    titre: 'Une viande en plus' },
    { cle: 'fromage',   titre: 'Un fromage en plus' },
    { cle: 'garniture', titre: 'Une garniture en plus' },
    { cle: 'sauce',     titre: 'Une sauce en plus' }
  ];

  /* Ce qui se met HABITUELLEMENT dans un burger.

     Le kebab, la merguez, le cordon bleu, l'escalope, les nuggets, les
     tenders et la viande hachee sont les viandes du TACOS — c'est la
     liste que Soso a donnee pour le choix de garniture d'un tacos. Les
     proposer sur un burger, c'est offrir sept plats que personne ne
     commande, et noyer au milieu les deux seules lignes qui comptent :
     un steak de plus, et du bacon. */
  var VIANDE_BURGER = /steak|bacon/i;

  function ordreFr(a, b) { return String(a).localeCompare(String(b), 'fr'); }

  /* =================================================================
     LA FORMULE MENU

     C'est un produit de la categorie « Suppléments », a 3 € (voir
     `sql/28-ksm-formule-menu.sql`) : c'est ce qui la rend payante,
     puisque le serveur recalcule le total depuis `produits` et
     qu'une option inventee dans le navigateur ne coute rien.

     Mais elle ne se PRESENTE pas comme un supplement :

      - a 3 €, la regle de classement par prix la rangerait parmi les
        VIANDES, coincee entre le bacon et le steak supplementaire ;

      - c'est la seule option qui change la nature de la commande —
        un plat devient un repas. Elle merite la tete de la fiche, pas
        la quatrieme ligne d'une liste.
     ================================================================= */
  var MENU_SUP = /^formule\s*menu$/i;

  function supplementMenu() {
    for (var i = 0; i < supplements.length; i++) {
      if (MENU_SUP.test(String(supplements[i].nom).trim())) return supplements[i];
    }
    return null;
  }

  /* Les boissons qu'on peut prendre DANS la formule.

     Deux filtres, tous deux lus en base plutot qu'ecrits ici :
     le 33cl, parce que c'est le format d'une canette, et le plafond a
     2,50 € — sans lui, la limonade artisanale a 3 € partirait dans un
     menu facture 3 €, et KSM offrirait la boisson.

     Si la liste est vide (aucune boisson 33cl en base), le menu reste
     proposable : la boisson se choisit alors au retrait, et la fiche
     le dit. Mieux vaut ca qu'un menu impossible a commander. */
  function boissonsDuMenu() {
    return tousProduits
      .filter(function (x) {
        return String(x.categorie || '').trim() === 'Boissons'
          && x.disponible !== false
          && /33\s*cl/i.test(x.nom)
          && Number(x.prix) <= 2.5;
      })
      .map(function (x) { return x.nom; })
      .sort(ordreFr);
  }


  /* Les sauces OFFERTES (0 €). Elles ne sont pas des supplements : les
     cocher ajoutait au panier une ligne a 0,00 € par sauce, et rien
     n'empechait d'en prendre huit. C'est un CHOIX, et un choix se fait
     une fois. */
  function saucesOffertes() {
    var l = supplements
      .filter(function (x) { return Number(x.prix) === 0; })
      .map(function (x) { return x.nom; })
      .sort(ordreFr);
    return l.length ? l : SAUCES;
  }

  /* Les viandes au choix d'un tacos ou d'un bowl : celles a 3 € en
     base, moins deux intrus qui portent le meme prix sans etre des
     viandes :

      - le « steak supplementaire », qui est un ajout payant et non
        une garniture au choix ;

      - la « formule menu ». Sans elle, la fiche l'affichait comme
        une viande entre l'escalope et le kebab, et elle partait en
        cuisine comme telle. Vu le 2026-09-08 sur le recapitulatif :
        « 1 x Tacos simple — Formule menu, Samourai, Harissa », un
        tacos sans viande. C'est le meme piege que dans
        `supplementsPour`, a un endroit que je n'avais pas repris :
        TOUTE lecture des supplements par le prix doit ecarter la
        formule, qui n'est un supplement que par commodite. */
  function viandesAuChoix() {
    var l = supplements
      .filter(function (x) {
        if (MENU_SUP.test(String(x.nom).trim())) return false;
        return Number(x.prix) >= 3 && !/suppl[eé]mentaire/i.test(x.nom);
      })
      .map(function (x) { return x.nom; })
      .sort(ordreFr);
    return l.length ? l : VIANDES;
  }

  var neAvant = Date.now();           // sert au filtre anti-robot

  var $ = function (s) { return document.querySelector(s); };
  var elListe  = $('#carte-liste');
  var elCats   = $('#cats');
  var elBarre  = $('#barre');
  var elModale = $('#modale');
  var elFiche  = $('#fiche');

  function euros(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }
  function texte(el, v) { el.textContent = v; }

  function creer(balise, classe, contenu) {
    var el = document.createElement(balise);
    if (classe) el.className = classe;
    if (contenu != null) el.textContent = contenu;
    return el;
  }

  function photoDe(p) {
    if (p.image_url && String(p.image_url).trim()) return String(p.image_url).trim();
    for (var i = 0; i < PHOTOS.length; i++) {
      if (PHOTOS[i][0].test(p.nom)) return PHOTOS[i][1];
    }
    return null;
  }

  // -----------------------------------------------------------------
  //  1. Ce qu'on peut personnaliser, deduit du plat lui-meme
  // -----------------------------------------------------------------
  /* Les ingredients retirables sortent de la DESCRIPTION du produit,
     pas d'une liste ecrite ici. C'est ce qui fait que « Le Fleurie —
     steak, salade, chevre, miel, oignons » propose exactement ces
     cinq lignes, et que le jour ou Kassim change sa recette depuis
     son espace, les options suivent sans que personne y touche. */
  function retirables(p) {
    if (!p.description) return [];
    return p.description
      .split(/[,;]|·/)
      .map(function (x) { return x.replace(/[.…]+$/, '').trim(); })
      .filter(function (x) {
        if (x.length < 3 || x.length > 28) return false;
        if (SOCLE.test(x)) return false;
        // « frite ou salade » est un choix, pas un ingredient a retirer.
        if (/\bou\b/i.test(x)) return false;
        /* « sauce » a son propre groupe de choix juste au-dessus.
           L'offrir aussi en « retirer » ferait deux lignes qui se
           contredisent dans la meme fiche. */
        if (/^sauces?$/i.test(x)) return false;
        return true;
      })
      .map(function (x) { return x.charAt(0).toUpperCase() + x.slice(1); });
  }

  /* Les groupes de choix. Un tacos se compose, un burger se corrige :
     ce ne sont pas les memes gestes, et ils ne se rangent pas dans le
     meme type de commande. */
  function groupesOptions(p) {
    var cat = (p.categorie || '').toLowerCase();
    var nom = (p.nom || '').toLowerCase();
    var groupes = [];

    if (cat.indexOf('tacos') !== -1) {
      var double = /maxi|double/.test(nom);
      groupes.push({
        titre: double ? 'Vos deux viandes' : 'Votre viande',
        aide: double ? 'Choisissez-en deux.' : 'Choisissez-en une.',
        type: double ? 'multi' : 'unique',
        max: double ? 2 : 1,
        requis: true,
        choix: viandesAuChoix()
      });
      /* DEUX sauces, et gratuites.

         Un tacos se mange avec deux sauces, c'est l'usage. La
         fiche n'en laissait choisir qu'une, et la seconde passait
         par la « Sauce supplementaire » a 0,50 € : on facturait
         un usage courant.

         `min` et non `max` pour la validation : le client peut
         n'en vouloir qu'une, et le bouton ne doit pas rester
         bloque a l'attendre. La ligne payante a 0,50 € reste dans
         les supplements pour une TROISIEME sauce ou un pot en
         plus. */
      groupes.push({
        titre: 'Vos sauces', aide: 'Une ou deux, offertes.',
        type: 'multi', min: 1, max: 2, requis: true, choix: saucesOffertes()
      });
    }

    if (nom.indexOf('bowl') !== -1) {
      groupes.push({
        titre: 'Votre base', aide: 'Frite ou salade.',
        type: 'unique', max: 1, requis: true, choix: ['Frite', 'Salade']
      });
      groupes.push({
        titre: 'Votre viande', aide: 'Choisissez-en une.',
        type: 'unique', max: 1, requis: true, choix: viandesAuChoix()
      });
      groupes.push({
        titre: 'Votre sauce', aide: 'Une seule, offerte.',
        type: 'unique', max: 1, requis: true, choix: saucesOffertes()
      });
    }

    if (nom.indexOf('menu enfant') !== -1) {
      groupes.push({
        titre: 'Le plat', aide: 'Au choix.',
        type: 'unique', max: 1, requis: true,
        choix: ['4 nuggets', 'Mini burger']
      });
    }

    /* Le burger et le sandwich arrivent avec une sauce (leur
       description finit par « sauce ») sans que le client sache
       laquelle. Les douze sauces de la base etaient jusqu'ici des
       cases a cocher a « + 0,00 € » au milieu des supplements
       PAYANTS : on pouvait en prendre huit, et chacune ajoutait au
       panier sa propre ligne a 0,00 €. Une sauce se choisit, elle
       ne s'empile pas. */
    if (/burger|sandwich/.test(cat)) {
      groupes.push({
        titre: 'Votre sauce', aide: 'Une seule, offerte.',
        type: 'unique', max: 1, requis: false, choix: saucesOffertes()
      });
    }

    var sans = retirables(p);
    if (sans.length && /burger|sandwich/.test(cat)) {
      groupes.push({
        titre: 'Retirer un ingrédient',
        aide: 'Facultatif, sans supplément.',
        type: 'sans', max: sans.length, requis: false, choix: sans
      });
    }

    return groupes;
  }

  // -----------------------------------------------------------------
  //  2. Charger la carte
  // -----------------------------------------------------------------
  function chargerCarte() {
    var url = config.supabaseUrl + '/rest/v1/produits'
      + '?client_id=eq.' + encodeURIComponent(config.clientId)
      + '&select=id,nom,prix,categorie,description,disponible,image_url'
      + '&order=nom';

    fetch(url, {
      headers: {
        apikey: config.supabaseAnonKey,
        Authorization: 'Bearer ' + config.supabaseAnonKey
      }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('Supabase ' + r.status);
        return r.json();
      })
      .then(function (produits) {
        if (!produits.length) {
          elListe.innerHTML = '<p class="carte-vide">La carte est momentanément indisponible. '
            + 'Appelez-nous au <a href="tel:+33950948815">09 50 94 88 15</a>.</p>';
          return;
        }
        afficher(dedoublonner(produits));
      })
      .catch(function (err) {
        console.warn('Carte indisponible.', err);
        elListe.innerHTML = '<p class="carte-erreur">Impossible d’afficher la carte pour le moment. '
          + 'Vous pouvez commander par téléphone au <a href="tel:+33950948815">09 50 94 88 15</a>.</p>';
      });
  }

  /* La base contient aujourd'hui six produits en double, a l'identique
     (meme nom, meme prix, meme categorie) — un reste d'import. Sur un
     site dont l'unique fonction est la commande, un plat affiche deux
     fois, c'est une commande fausse et un client qui doute.

     On n'ecarte que les doublons PARFAITS : deux plats de meme nom
     mais de prix ou de categorie differents sont deux plats reels
     (une petite et une grande portion, par exemple) et restent tous
     les deux. */
  function dedoublonner(produits) {
    var vus = Object.create(null);
    var sortie = [];
    produits.forEach(function (p) {
      var cle = [
        String(p.nom || '').trim().toLowerCase(),
        Number(p.prix),
        String(p.categorie || '').trim().toLowerCase()
      ].join('|');
      if (vus[cle]) return;
      vus[cle] = true;
      sortie.push(p);
    });
    return sortie;
  }

  function afficher(produits) {
    tousProduits = produits;
    supplements = produits
      .filter(function (p) { return (p.categorie || '').trim() === CAT_SUP && p.disponible !== false; })
      .sort(function (x, y) { return Number(y.prix) - Number(x.prix); });   // la viande d'abord

    var groupes = Object.create(null);
    produits.forEach(function (p) {
      var cat = (p.categorie || 'Autres').trim();
      if (cat === CAT_SUP) return;
      (groupes[cat] || (groupes[cat] = [])).push(p);
    });

    var noms = Object.keys(groupes).sort(function (a, b) {
      var ia = ORDRE.indexOf(a), ib = ORDRE.indexOf(b);
      if (ia === -1 && ib === -1) return a.localeCompare(b, 'fr');
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });

    elCats.innerHTML = '';
    elListe.innerHTML = '';

    noms.forEach(function (nom, i) {
      var ancre = 'cat-' + i;

      var bouton = creer('button', null, nom);
      bouton.type = 'button';
      bouton.setAttribute('data-ancre', ancre);
      if (i === 0) bouton.setAttribute('aria-current', 'true');
      elCats.appendChild(bouton);

      var section = creer('section', 'groupe');
      section.id = ancre;
      section.appendChild(creer('h3', null, nom));

      var liste = creer('div', 'liste');
      groupes[nom].forEach(function (p) { liste.appendChild(ligne(p)); });
      section.appendChild(liste);

      elListe.appendChild(section);
    });

    /* Indispensable, et pas seulement pour la mise a jour : c'est ce
       qui replie les pas-a-pas a leur seul « + » au premier rendu.
       Sans cet appel, chaque photo affichait une pastille doree vide
       jusqu'au premier ajout au panier. */
    majPas();
    surveillerCategories();
  }

  /* Un plat epuise, c'est la case « disponible » decochee dans
     l'espace du restaurateur, et rien d'autre.

     On NE regarde PAS `produits.stock` ici, contrairement au camion.
     Verifie le 2026-09-04 : les 40 produits de KSM sont a stock = 0,
     valeur par defaut jamais touchee — le champ n'existe pas dans
     l'editeur d'un restaurateur, seulement dans l'ecran du chauffeur,
     qui epuise son chargement au fil de la tournee. Traiter ce 0
     comme une rupture rendait la carte ENTIEREMENT indisponible. */
  function ligne(p) {
    var dispo = p.disponible !== false;

    var row = creer('div', 'ligne' + (dispo ? '' : ' ligne-indispo'));
    row.setAttribute('data-produit', p.id);

    // Le corps ouvre la fiche ; le pas-a-pas vit a cote, pas dedans.
    var corps = creer('button', 'ligne-corps');
    corps.type = 'button';
    if (!dispo) corps.disabled = true;

    var txt = creer('div', 'ligne-txt');
    txt.appendChild(creer('div', 'ligne-nom', p.nom));
    if (p.description) txt.appendChild(creer('div', 'ligne-desc', p.description));
    txt.appendChild(creer('div', 'ligne-prix', euros(p.prix)));

    var aOptions = dispo && groupesOptions(p).length > 0;
    if (aOptions) txt.appendChild(creer('div', 'ligne-perso', 'Personnalisable'));
    corps.appendChild(txt);

    var media = creer('div', 'ligne-media');
    var src = photoDe(p);
    if (src) {
      var img = document.createElement('img');
      img.className = 'ligne-photo';
      img.src = src;
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      /* Si la source ne se decode pas, on retombe sur la tuile sobre
         plutot que de laisser l'icone d'image brisee du navigateur.
         Constate le 2026-09-08 sur Maxi Tacos : son `image_url`
         pointait un .HEIC, format qu'aucun navigateur ne lit. Le cas
         se reproduira des que le restaurateur televersera une photo
         prise avec un iPhone. */
      img.addEventListener('error', function () {
        if (img.parentNode !== media) return;
        media.replaceChild(creer('div', 'ligne-vide', p.nom.charAt(0).toUpperCase()), img);
      });
      media.appendChild(img);
    } else {
      // Initiale du plat plutot qu'une photo d'un autre restaurant.
      media.appendChild(creer('div', 'ligne-vide', p.nom.charAt(0).toUpperCase()));
    }
    if (!dispo) media.appendChild(creer('span', 'epuise', 'Épuisé'));
    corps.appendChild(media);

    corps.addEventListener('click', function () { ouvrirFiche(p); });
    row.appendChild(corps);

    if (dispo) row.appendChild(pasRapide(p, aOptions));
    return row;
  }

  /* Le pas-a-pas rapide, sur le coin de la photo.

     Tant que le plat n'est pas au panier : un seul rond « + ». Des
     qu'il y est : « − n + ». Trente-quatre plats affichant trois
     boutons chacun feraient une carte illisible, alors qu'on n'en
     commande que deux ou trois. */
  function pasRapide(p, aOptions) {
    var boite = creer('div', 'ligne-pas');
    boite.setAttribute('data-produit-pas', p.id);

    var moins = creer('button', null, '−');
    moins.type = 'button';
    moins.setAttribute('aria-label', 'Retirer un ' + p.nom);
    moins.addEventListener('click', function (e) {
      e.stopPropagation();
      retirerUn(p);
    });

    var n = creer('span', 'n');

    var plus = creer('button', null, '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Ajouter un ' + p.nom);
    plus.addEventListener('click', function (e) {
      e.stopPropagation();
      ajouterUn(p, aOptions);
    });

    boite.appendChild(moins);
    boite.appendChild(n);
    boite.appendChild(plus);
    return boite;
  }

  /* Un « + » sur un plat a options ne peut pas deviner la recette.
     Deux cas, et un seul est ambigu :
      - rien de ce plat au panier : on ouvre la fiche, il faut bien
        choisir une viande avant de commander un tacos ;
      - deja au panier : on refait le MEME, c'est « la meme chose »
        et c'est ce qu'on attend d'un bouton +. Pour une autre
        composition, on ouvre la fiche en touchant la ligne. */
  function ajouterUn(p, aOptions) {
    var derniere = derniereVariante(p.id);
    if (aOptions && !derniere) { ouvrirFiche(p); return; }
    ajouter(p, 1, derniere ? derniere.options : []);
  }

  function retirerUn(p) {
    var derniere = derniereVariante(p.id);
    if (!derniere) return;
    var k = cle(p, derniere.options);
    if (panier[k].quantite <= 1) delete panier[k];
    else panier[k].quantite -= 1;
    majBarre();
    majPas();
  }

  /* La variante ajoutee en dernier pour ce plat. `ordre` et non
     l'ordre des cles : reajouter une variante existante ne la
     deplace pas en fin d'objet, et « + » retomberait alors sur une
     composition choisie il y a cinq minutes. */
  function derniereVariante(produitId) {
    var meilleure = null;
    Object.keys(panier).forEach(function (k) {
      var l = panier[k];
      if (l.produit.id !== produitId) return;
      if (!meilleure || l.ordre > meilleure.ordre) meilleure = l;
    });
    return meilleure;
  }

  // -----------------------------------------------------------------
  //  3. La fiche d'un plat
  // -----------------------------------------------------------------
  var ficheEtat = null;

  function ouvrirFiche(p) {
    /* `sup` et `menuBoisson` naissent ici, et NULLE PART ailleurs.
       L'encadre menu et le bloc des supplements ecrivent tous les
       deux dans `sup` ; si l'un des deux le recreait en s'affichant,
       il effacerait ce que l'autre vient d'y mettre. */
    ficheEtat = {
      produit: p, quantite: 1,
      choisi: Object.create(null),
      sup: Object.create(null),
      menuBoisson: null
    };

    var boite = $('#fiche-boite');
    boite.innerHTML = '';
    boite.scrollTop = 0;

    var src = photoDe(p);
    if (src) {
      var img = document.createElement('img');
      img.className = 'fiche-photo';
      img.src = src.replace('w=320&h=320', 'w=760&h=420');
      img.alt = '';
      boite.appendChild(img);
    }

    var tete = creer('div', 'modale-tete');
    var g = document.createElement('div');
    var h2 = creer('h2', null, p.nom);
    h2.id = 'fiche-titre';
    g.appendChild(h2);
    if (p.description) g.appendChild(creer('p', 'fiche-desc', p.description));
    g.appendChild(creer('p', 'fiche-prix', euros(p.prix)));
    tete.appendChild(g);

    var x = creer('button', 'fermer', '×');
    x.type = 'button';
    x.setAttribute('aria-label', 'Fermer');
    x.addEventListener('click', fermerFiche);
    tete.appendChild(x);
    boite.appendChild(tete);

    var groupes = groupesOptions(p);
    groupes.forEach(function (grp, i) { boite.appendChild(blocOption(grp, i)); });

    if (accepteMenu(p)) boite.appendChild(blocMenu(p));
    if (accepteSupplements(p)) boite.appendChild(blocSupplements(p));

    boite.appendChild(pied(groupes));
    elFiche.setAttribute('data-ouvert', '1');
    document.body.style.overflow = 'hidden';
    x.focus();
  }

  /* Burgers et tacos seulement. Un supplement cheddar sur un Coca ou
     sur un tiramisu n'a pas de sens, et proposer partout revient a ne
     rien proposer : le client cesse de lire. */
  function accepteSupplements(p) {
    if (!supplements.length) return false;
    var cat = (p.categorie || '').toLowerCase();
    if (cat.indexOf('burger') === -1 && cat.indexOf('tacos') === -1) return false;
    // Une fois les filtres passes, il peut ne rien rester : pas de titre
    // « Suppléments » au-dessus du vide.
    return supplementsPour(p).length > 0;
  }

  /* Les supplements PAYANTS que ce plat accepte, ranges par famille.

     Deux filtres, et chacun repond a un vrai probleme vu sur la fiche :

      - les sauces OFFERTES sortent d'ici. Elles ont leur groupe de
        choix plus haut ; les laisser en cases a cocher affichait
        douze lignes a « + 0,00 € » au milieu des ajouts payants, et
        chaque case cochee ajoutait au panier une ligne a 0,00 €.

      - sur un BURGER, seules les viandes qu'on met habituellement
        dans un burger restent : un steak de plus, du bacon. Le kebab,
        la merguez, le cordon bleu, l'escalope, les nuggets, les
        tenders et la viande hachee sont les garnitures du TACOS. */
  function supplementsPour(p) {
    var cat = (p.categorie || '').toLowerCase();
    var burger = cat.indexOf('burger') !== -1 || cat.indexOf('sandwich') !== -1;

    var retenus = supplements.filter(function (sup) {
      if (Number(sup.prix) <= 0) return false;
      // La formule menu a son propre encadre, en tete de fiche.
      if (MENU_SUP.test(String(sup.nom).trim())) return false;
      if (burger && familleSup(sup) === 'viande' && !VIANDE_BURGER.test(sup.nom)) return false;
      return true;
    });

    return FAMILLES.map(function (f) {
      return {
        titre: f.titre,
        items: retenus
          .filter(function (sup) { return familleSup(sup) === f.cle; })
          .sort(function (a, b) { return ordreFr(a.nom, b.nom); })
      };
    }).filter(function (f) { return f.items.length > 0; });
  }

  /* La formule menu s'applique a ce qui se mange en repas : un
     burger, un sandwich, un tacos. Pas a une part de frites, pas a
     un dessert, pas a une canette — un menu sur une canette n'est
     pas une offre, c'est une faute de saisie. */
  function accepteMenu(p) {
    if (!supplementMenu()) return false;
    var cat = (p.categorie || '').toLowerCase();
    return /burger|sandwich|tacos/.test(cat);
  }

  function blocMenu(p) {
    var menu = supplementMenu();
    var bloc = creer('div', 'groupe-opt menu-bloc');
    bloc.appendChild(entete('En menu', false));
    bloc.appendChild(creer('p', 'aide', menu.description || 'Frites et une boisson.'));


    var opts = creer('div', 'opts');
    var label = creer('label', 'opt');
    var input = document.createElement('input');
    input.type = 'checkbox';
    input.value = menu.id;
    label.appendChild(input);
    label.appendChild(creer('span', null, 'Ajouter frites et boisson'));
    label.appendChild(creer('span', 'opt-prix', '+ ' + euros(menu.prix)));
    opts.appendChild(label);
    bloc.appendChild(opts);

    /* Le choix de la boisson n'apparait qu'une fois le menu coche.
       L'afficher d'emblee poserait une question a laquelle la
       plupart des clients n'ont pas a repondre. */
    var boissons = boissonsDuMenu();
    var choixBoisson = null;
    if (boissons.length) {
      choixBoisson = creer('div', 'menu-boisson');
      choixBoisson.hidden = true;
      choixBoisson.appendChild(creer('h4', 'sup-famille', 'Votre boisson'));
      var lb = creer('div', 'opts');
      boissons.forEach(function (nom, i) {
        var l = creer('label', 'opt');
        var r = document.createElement('input');
        r.type = 'radio';
        r.name = 'menu-boisson';
        r.value = nom;
        if (i === 0) { r.checked = true; ficheEtat.menuBoisson = nom; }
        r.addEventListener('change', function () {
          if (r.checked) ficheEtat.menuBoisson = nom;
        });
        l.appendChild(r);
        l.appendChild(creer('span', null, nom));
        lb.appendChild(l);
      });
      choixBoisson.appendChild(lb);
      bloc.appendChild(choixBoisson);
    } else {
      /* Aucune boisson 33cl en base : on ne bloque pas la commande,
         on dit ou le choix se fera. */
      bloc.appendChild(creer('p', 'aide', 'Boisson à choisir au retrait.'));
    }

    input.addEventListener('change', function () {
      if (input.checked) ficheEtat.sup[menu.id] = menu;
      else delete ficheEtat.sup[menu.id];
      if (choixBoisson) choixBoisson.hidden = !input.checked;
      majPied();
    });

    return bloc;
  }

  function blocSupplements(p) {
    var bloc = creer('div', 'groupe-opt');
    bloc.appendChild(entete('Suppléments', false));
    bloc.appendChild(creer('p', 'aide', 'Facultatif, ajouté au prix.'));


    supplementsPour(p).forEach(function (fam) {
      /* Un intitule par famille. Sans lui, la fiche listait trente
         lignes d'affilee ou un kebab tombait entre deux fromages :
         personne ne lit une liste pareille jusqu'au bout. */
      bloc.appendChild(creer('h4', 'sup-famille', fam.titre));

      var opts = creer('div', 'opts');
      fam.items.forEach(function (sup) {
        var label = creer('label', 'opt');
        var input = document.createElement('input');
        input.type = 'checkbox';
        input.value = sup.id;
        input.addEventListener('change', function () {
          if (input.checked) ficheEtat.sup[sup.id] = sup;
          else delete ficheEtat.sup[sup.id];
          majPied();
        });
        label.appendChild(input);
        label.appendChild(creer('span', null, sup.nom));
        // Le prix a droite, aligne : on compare d'un coup d'oeil ce que
        // coute chaque ajout sans lire ligne a ligne.
        label.appendChild(creer('span', 'opt-prix', '+ ' + euros(sup.prix)));
        opts.appendChild(label);
      });
      bloc.appendChild(opts);
    });

    return bloc;
  }

  /* Ce que coute la fiche telle qu'elle est composee : le plat plus ses
     supplements, multiplie par la quantite. C'est un affichage — le
     total qui fait foi reste celui que le serveur recalcule. */
  function totalFiche() {
    var unite = Number(ficheEtat.produit.prix);
    Object.keys(ficheEtat.sup || {}).forEach(function (id) {
      unite += Number(ficheEtat.sup[id].prix);
    });
    return unite * ficheEtat.quantite;
  }

  /* Combien de choix il faut AU MOINS dans ce groupe. */
  function minimum(grp) { return (grp.min == null) ? grp.max : grp.min; }

  /* L'etat d'un groupe, affiche a droite de son titre.

     Sur une fiche qui compte quarante options, le client perd le
     fil de ce qu'il a deja choisi des qu'il a defile. « 1 / 2 »
     le lui rend sans qu'il ait a remonter compter les cases.

     Seuls les groupes OBLIGATOIRES en portent un : sur « Retirer
     un ingredient », un « 0 / 4 » n'apprendrait rien et ferait
     croire qu'il reste quelque chose a faire. */
  function majEtatGroupe(bloc, grp, index) {
    var pastille = bloc.querySelector('.grp-etat');
    if (!pastille) return;
    var n = ficheEtat.choisi[index].length;
    pastille.textContent = grp.max > 1 ? (n + ' / ' + grp.max)
                                       : (n ? 'Choisi' : 'À choisir');
    if (n >= minimum(grp)) pastille.setAttribute('data-plein', '1');
    else pastille.removeAttribute('data-plein');
  }

  /* L'entete d'un bloc : le titre, et a sa droite l'etat quand il y
     en a un. Une seule fonction pour les trois sortes de blocs
     (choix, menu, supplements), sinon le comportement collant du
     titre ne s'appliquerait qu'a ceux passes par `blocOption` —
     c'est-a-dire pas aux supplements, qui sont le plus long. */
  function entete(titre, avecEtat) {
    var tete = creer('div', 'groupe-tete');
    tete.appendChild(creer('h3', null, titre));
    if (avecEtat) tete.appendChild(creer('span', 'grp-etat'));
    return tete;
  }

  function blocOption(grp, index) {
    var bloc = creer('div', 'groupe-opt');
    bloc.appendChild(entete(grp.titre, grp.requis));
    bloc.appendChild(creer('p', 'aide', grp.aide));

    var opts = creer('div', 'opts');
    ficheEtat.choisi[index] = [];

    grp.choix.forEach(function (valeur) {
      var label = creer('label', 'opt');
      var input = document.createElement('input');
      // Un choix unique se coche comme une radio, un retrait comme une
      // case : la forme du controle dit deja combien on peut en
      // prendre, avant meme de lire l'aide.
      input.type = (grp.type === 'unique') ? 'radio' : 'checkbox';
      input.name = 'grp' + index;
      input.value = valeur;

      input.addEventListener('change', function () {
        var liste = ficheEtat.choisi[index];
        if (grp.type === 'unique') {
          ficheEtat.choisi[index] = [valeur];
        } else if (input.checked) {
          if (liste.length >= grp.max) {
            // Deja au maximum : on refuse plutot que de remplacer en
            // silence un choix que le client vient de faire.
            input.checked = false;
            return;
          }
          liste.push(valeur);
        } else {
          ficheEtat.choisi[index] = liste.filter(function (v) { return v !== valeur; });
        }
        majEtatGroupe(bloc, grp, index);
        majPied();
      });

      label.appendChild(input);
      label.appendChild(creer('span', null, grp.type === 'sans' ? 'Sans ' + valeur.toLowerCase() : valeur));
      opts.appendChild(label);
    });

    bloc.appendChild(opts);
    majEtatGroupe(bloc, grp, index);
    return bloc;
  }

  function pied(groupes) {
    var p = creer('div', 'fiche-pied');

    var pas = creer('div', 'pas');
    var moins = creer('button', null, '−');
    moins.type = 'button';
    moins.setAttribute('aria-label', 'Retirer un');
    moins.addEventListener('click', function () {
      ficheEtat.quantite = Math.max(1, ficheEtat.quantite - 1);
      majPied();
    });
    var n = creer('span', 'pas-n', '1');
    n.id = 'fiche-n';
    var plus = creer('button', null, '+');
    plus.type = 'button';
    plus.setAttribute('aria-label', 'Ajouter un');
    plus.addEventListener('click', function () {
      ficheEtat.quantite = Math.min(50, ficheEtat.quantite + 1);
      majPied();
    });
    pas.appendChild(moins); pas.appendChild(n); pas.appendChild(plus);
    p.appendChild(pas);

    var btn = creer('button', 'pill pill-vin');
    btn.type = 'button';
    btn.id = 'fiche-ajouter';
    btn.addEventListener('click', function () { validerFiche(groupes); });
    p.appendChild(btn);

    ficheEtat.groupes = groupes;
    setTimeout(majPied, 0);
    return p;
  }

  /* Le bouton dit toujours ce qui manque, plutot que de rester actif
     et de refuser au dernier moment : sur un tacos, « Choisissez votre
     viande » evite d'envoyer une commande que la cuisine ne peut pas
     faire. */
  function majPied() {
    if (!ficheEtat) return;
    var n = $('#fiche-n');
    var btn = $('#fiche-ajouter');
    if (!n || !btn) return;

    n.textContent = ficheEtat.quantite;

    var manque = null;
    ficheEtat.groupes.forEach(function (grp, i) {
      if (manque) return;
      /* Combien il en faut AU MOINS. Sans `min`, c'est `max` : les
         « deux viandes » d'un maxi tacos se prennent bien par deux,
         il en manque une tant qu'il n'y en a qu'une. Mais les
         sauces se prennent par une OU deux — exiger le maximum y
         bloquerait le bouton sur un choix que le client a fini de
         faire. */
      if (grp.requis && ficheEtat.choisi[i].length < minimum(grp)) manque = grp.titre;
    });

    if (manque) {
      btn.disabled = true;
      btn.textContent = manque;
    } else {
      btn.disabled = false;
      btn.textContent = 'Ajouter · ' + euros(totalFiche());
    }
  }

  function validerFiche(groupes) {
    var options = [];
    groupes.forEach(function (grp, i) {
      var choisis = ficheEtat.choisi[i];
      if (!choisis.length) return;
      choisis.forEach(function (v) {
        options.push(grp.type === 'sans' ? 'sans ' + v.toLowerCase() : v);
      });
    });

    var plat = ficheEtat.produit;
    var qte = ficheEtat.quantite;
    var sup = ficheEtat.sup || {};

    ajouter(plat, qte, options);

    /* Chaque supplement part comme une LIGNE A PART du panier, avec le
       nom du plat en option.

       C'est ce qui le rend payant sans une ligne de code cote serveur :
       la fonction de commande recalcule le total depuis `produits`, et
       un supplement EST un produit. Le glisser dans le texte des
       options du burger, au contraire, ne lui aurait donne aucun prix —
       le client aurait lu un total et paye un autre.

       Le nom du plat suit pour la cuisine : « Cheddar (Le Fleurie) »
       dit sur quoi le poser. */
    Object.keys(sup).forEach(function (id) {
      var notes = [plat.nom];
      /* La boisson choisie voyage sur la ligne du menu : sans elle,
         la cuisine lit « Formule menu (Le Fleurie) » et doit
         rappeler le client pour savoir quoi mettre dans le sac. */
      if (MENU_SUP.test(String(sup[id].nom).trim()) && ficheEtat.menuBoisson) {
        notes.push(ficheEtat.menuBoisson);
      }
      ajouter(sup[id], qte, notes);
    });

    fermerFiche();
  }

  function fermerFiche() {
    elFiche.removeAttribute('data-ouvert');
    document.body.style.overflow = '';
    ficheEtat = null;
  }

  // -----------------------------------------------------------------
  //  4. Le panier
  // -----------------------------------------------------------------
  /* Deux fois le meme burger, l'un sans oignon et l'autre non, sont
     deux lignes distinctes : les regrouper reviendrait a servir deux
     fois la meme chose. La cle du panier porte donc les options. */
  function cle(produit, options) {
    return produit.id + '|' + options.slice().sort().join(',');
  }

  var rang = 0;

  function ajouter(produit, quantite, options) {
    var k = cle(produit, options);
    var e = panier[k];
    panier[k] = {
      produit: produit,
      options: options,
      ordre: ++rang,
      quantite: Math.min(50, (e ? e.quantite : 0) + quantite)
    };
    majBarre();
    majPas();
  }

  function retirerLigne(k) {
    delete panier[k];
    majBarre();
    majPas();
  }

  function lignesPanier() {
    return Object.keys(panier).map(function (k) {
      var l = panier[k];
      return { cle: k, produit: l.produit, options: l.options, quantite: l.quantite };
    });
  }

  /* Le compteur d'articles ne compte QUE les plats. Un burger avec
     cheddar et steak en plus, c'est un article et non trois — annoncer
     « 6 articles » pour deux burgers ferait douter le client de ce
     qu'il a mis au panier. Le total, lui, additionne bien tout. */
  function totaux() {
    var n = 0, somme = 0;
    lignesPanier().forEach(function (l) {
      if ((l.produit.categorie || '').trim() !== CAT_SUP) n += l.quantite;
      somme += Number(l.produit.prix) * l.quantite;
    });
    return { n: n, somme: somme };
  }

  function majBarre() {
    var t = totaux();
    texte($('#barre-n'), t.n);
    texte($('#barre-mot'), t.n > 1 ? 'articles' : 'article');
    texte($('#barre-total'), euros(t.somme));

    var ouvert = t.n > 0;
    elBarre.setAttribute('data-ouvert', ouvert ? '1' : '0');
    // Le contenu doit pouvoir defiler au-dessus de la barre, sinon le
    // dernier produit de la carte reste inatteignable.
    document.documentElement.style.setProperty(
      '--barre', ouvert ? (elBarre.offsetHeight + 8) + 'px' : '0px');
    majBarreSuivi();
  }

  /* Le nombre pose sur la photo, toutes options confondues : ce que le
     client veut savoir en parcourant la carte, c'est « combien de
     Fleurie j'ai pris », pas le detail de chaque variante. */
  function majPas() {
    var parProduit = Object.create(null);
    lignesPanier().forEach(function (l) {
      parProduit[l.produit.id] = (parProduit[l.produit.id] || 0) + l.quantite;
    });

    document.querySelectorAll('.ligne-pas[data-produit-pas]').forEach(function (boite) {
      var n = parProduit[boite.getAttribute('data-produit-pas')] || 0;
      boite.querySelector('.n').textContent = n || '';

      /* Le « − » et le compteur n'existent que si le plat est au
         panier. Sans ca, chaque photo de la carte porterait une
         pastille vide qui ne veut rien dire — et un « − » qui ne
         retire rien. */
      boite.children[0].hidden = !n;
      boite.children[1].hidden = !n;
      if (n) boite.setAttribute('data-au-panier', '');
      else boite.removeAttribute('data-au-panier');
    });
  }

  // -----------------------------------------------------------------
  //  5. Le sommaire de categories
  // -----------------------------------------------------------------
  function surveillerCategories() {
    elCats.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-ancre]');
      if (!b) return;
      var cible = document.getElementById(b.getAttribute('data-ancre'));
      if (cible) cible.scrollIntoView({ block: 'start' });
    });

    if (!('IntersectionObserver' in window)) return;

    var obs = new IntersectionObserver(function (entrees) {
      entrees.forEach(function (en) {
        if (!en.isIntersecting) return;
        var id = en.target.id;
        Array.prototype.forEach.call(elCats.children, function (b) {
          if (b.getAttribute('data-ancre') === id) {
            b.setAttribute('aria-current', 'true');
            // Garde la categorie courante visible dans un sommaire qui
            // defile lateralement. `inline: nearest` et non `center` :
            // center deplace aussi la page entiere sur certains
            // navigateurs.
            b.scrollIntoView({ block: 'nearest', inline: 'nearest' });
          } else {
            b.removeAttribute('aria-current');
          }
        });
      });
    }, { rootMargin: '-130px 0px -70% 0px' });

    document.querySelectorAll('.groupe').forEach(function (g) { obs.observe(g); });
  }

  // -----------------------------------------------------------------
  //  6 bis. Les horaires d'ouverture
  //
  //  Regle de securite qui prime sur tout le reste ici : en cas de
  //  doute, ON LAISSE COMMANDER. Ces horaires sont du texte libre,
  //  saisi par le restaurateur depuis son espace. S'il ecrit quelque
  //  chose que je ne sais pas lire, refuser une commande serait lui
  //  faire perdre de l'argent a cause de MON analyseur. Une commande
  //  hors horaires se refuse d'un geste au comptoir ; une commande
  //  jamais passee ne se rattrape pas.
  // -----------------------------------------------------------------
  var JOURS = ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'];
  var PREPARATION = 20;   // minutes annoncees au client

  function texteHoraire(jour) {
    var r = document.querySelector('#horaires .hrow[data-jour="' + jour + '"]');
    return r ? r.lastElementChild.textContent.trim() : '';
  }

  /* Rend { ferme } , { inconnu } ou { plages: [[debutMin, finMin], ...] },
     en minutes depuis minuit. Comprend « 12h–14h · 18h30–21h30 »,
     « 12h - 14h », « 12h a 14h », et « Ferme ». */
  function analyserHoraire(texte) {
    if (!texte) return { inconnu: true };
    // Sans accents : le restaurateur peut ecrire « Fermé » ou « ferme ».
    var sansAccent = texte.normalize ? texte.normalize('NFD').replace(/[̀-ͯ]/g, '') : texte;
    if (/ferm/i.test(sansAccent)) return { ferme: true, plages: [] };

    var re = /(\d{1,2})\s*h\s*(\d{2})?\s*(?:[-–—]|a)\s*(\d{1,2})\s*h\s*(\d{2})?/gi;
    var plages = [], m;
    while ((m = re.exec(sansAccent)) !== null) {
      var d = Number(m[1]) * 60 + Number(m[2] || 0);
      var f = Number(m[3]) * 60 + Number(m[4] || 0);
      // Une plage qui « recule » (23h–1h) passe minuit : on la coupe a
      // la fin de la journee plutot que de produire une plage vide.
      if (f <= d) f = 24 * 60;
      plages.push([d, f]);
    }
    return plages.length ? { plages: plages } : { inconnu: true };
  }

  /* Les creneaux de retrait possibles aujourd'hui, en minutes.
     Rend aussi `inconnu` : dans ce cas on retombe sur l'ancien
     comportement, trois heures de creneaux sans contrainte. */
  function creneauxDuJour() {
    var maintenant = new Date();
    var h = analyserHoraire(texteHoraire(maintenant.getDay()));
    if (h.inconnu) return { inconnu: true, creneaux: [] };

    var tot = maintenant.getHours() * 60 + maintenant.getMinutes() + PREPARATION;
    var depuis = Math.ceil(tot / 15) * 15;

    var creneaux = [], ouvertMaintenant = false;
    (h.plages || []).forEach(function (p) {
      if (tot >= p[0] && tot <= p[1]) ouvertMaintenant = true;
      for (var m = Math.max(p[0], depuis); m <= p[1]; m += 15) {
        if (m % 15 === 0) creneaux.push(m);
      }
    });
    return { creneaux: creneaux, ouvertMaintenant: ouvertMaintenant, ferme: h.ferme === true };
  }

  /* Le prochain moment ou l'on peut venir chercher. Sert a dire
     « nous rouvrons mercredi a 12h » plutot qu'un « ferme » sec. */
  function prochaineOuverture() {
    var maintenant = new Date();
    for (var i = 1; i <= 7; i++) {
      var jour = (maintenant.getDay() + i) % 7;
      var h = analyserHoraire(texteHoraire(jour));
      if (h.inconnu || h.ferme || !h.plages.length) continue;
      return { jour: JOURS[jour], minute: h.plages[0][0] };
    }
    return null;
  }

  function enHeure(minutes) {
    return String(Math.floor(minutes / 60)).padStart(2, '0') + 'h'
      + String(minutes % 60).padStart(2, '0');
  }

  /* Le bandeau au-dessus de la carte. Il ne masque jamais les plats :
     on peut regarder le menu a n'importe quelle heure. */
  function majAvisFermeture() {
    var el = $('#avis-ferme');
    if (!el) return;
    var d = creneauxDuJour();

    if (d.inconnu || d.creneaux.length) { el.hidden = true; return; }

    var suite = prochaineOuverture();
    el.innerHTML = suite
      ? '<span>Nous ne prenons plus de commande pour aujourd’hui. '
        + '<b>Réouverture ' + suite.jour + ' à ' + enHeure(suite.minute) + '.</b></span>'
      : '<span>Nous ne prenons pas de commande en ligne pour le moment. '
        + '<b>Appelez-nous au 09 50 94 88 15.</b></span>';
    el.hidden = false;
  }

  // -----------------------------------------------------------------
  //  6. Le formulaire de commande
  // -----------------------------------------------------------------
  function ouvrirModale() {
    if (!totaux().n) return;

    /* Hors horaires, on ne montre pas un formulaire dont on sait qu'il
       ne menera nulle part. Le panier n'est pas vide pour autant : il
       attend la reouverture. */
    var d = creneauxDuJour();
    if (!d.inconnu && !d.creneaux.length) {
      var suite = prochaineOuverture();
      $('#modale-boite').innerHTML =
        '<div class="modale-tete" style="border:0;padding:0">'
        + '<span></span><button class="fermer" type="button" data-fermer aria-label="Fermer">&times;</button></div>'
        + '<div class="ok-bloc">'
        + '<div class="ok-rond" data-s="recue" aria-hidden="true">⏱</div>'
        + '<h2>C’est fermé pour aujourd’hui</h2>'
        + (suite
            ? '<p>Nous rouvrons <strong>' + suite.jour + ' à ' + enHeure(suite.minute) + '</strong>.</p>'
              + '<p>Votre panier vous attend d’ici là.</p>'
            : '<p>Les commandes en ligne sont momentanément fermées.</p>')
        + '<a class="pill pill-vin" style="margin-top:18px" href="tel:+33950948815">Appeler le restaurant</a>'
        + '</div>';
      var x = $('#modale-boite [data-fermer]');
      if (x) x.addEventListener('click', fermerModale);
      elModale.setAttribute('data-ouvert', '1');
      document.body.style.overflow = 'hidden';
      return;
    }

    remplirRecap();
    remplirHeures();
    elModale.setAttribute('data-ouvert', '1');
    document.body.style.overflow = 'hidden';
    $('#f-nom').focus();
  }

  function fermerModale() {
    elModale.removeAttribute('data-ouvert');
    document.body.style.overflow = '';
  }

  function remplirRecap() {
    var recap = $('#recap');
    recap.innerHTML = '';

    lignesPanier().forEach(function (l) {
      var d = creer('div', 'recap-l');
      var g = document.createElement('span');
      g.appendChild(document.createTextNode(l.quantite + ' × ' + l.produit.nom));
      if (l.options.length) {
        var o = creer('span', 'ligne-perso', l.options.join(', '));
        o.style.display = 'block';
        o.style.color = 'var(--gris)';
        o.style.fontWeight = '400';
        g.appendChild(o);
      }
      d.appendChild(g);
      d.appendChild(creer('span', null, euros(Number(l.produit.prix) * l.quantite)));
      recap.appendChild(d);
    });

    var tot = creer('div', 'recap-l recap-total');
    tot.appendChild(creer('span', null, 'Total à régler sur place'));
    tot.appendChild(creer('span', null, euros(totaux().somme)));
    recap.appendChild(tot);
  }

  /* Creneaux de retrait par quarts d'heure, sur les trois heures qui
     viennent, en partant de 20 minutes — le temps de preparation
     annonce. On ne verifie pas ici que le restaurant est ouvert :
     l'horaire du jour est modifiable depuis l'espace client, et une
     regle codee en dur finirait par refuser des commandes un jour ou
     KSM aurait justement decide d'ouvrir. */
  /* Les creneaux proposes, bornes aux horaires du jour. « Des que
     possible » n'apparait que si le restaurant est ouvert MAINTENANT :
     le proposer a 10h du matin promettrait un burger dans vingt
     minutes alors que la cuisine ouvre a midi. */
  function remplirHeures() {
    var sel = $('#f-heure');
    sel.innerHTML = '';

    var d = creneauxDuJour();

    // Horaire illisible : on retombe sur trois heures de creneaux sans
    // contrainte, plutot que de bloquer la commande.
    if (d.inconnu) {
      var o0 = document.createElement('option');
      o0.value = 'Dès que possible';
      o0.textContent = 'Dès que possible (environ ' + PREPARATION + ' min)';
      sel.appendChild(o0);

      var t = new Date();
      t.setMinutes(t.getMinutes() + PREPARATION);
      t.setMinutes(Math.ceil(t.getMinutes() / 15) * 15, 0, 0);
      for (var i = 0; i < 12; i++) {
        ajouterCreneau(sel, String(t.getHours()).padStart(2, '0') + 'h'
          + String(t.getMinutes()).padStart(2, '0'));
        t.setMinutes(t.getMinutes() + 15);
      }
      return;
    }

    if (d.ouvertMaintenant) {
      var o = document.createElement('option');
      o.value = 'Dès que possible';
      o.textContent = 'Dès que possible (environ ' + PREPARATION + ' min)';
      sel.appendChild(o);
    }
    d.creneaux.forEach(function (m) { ajouterCreneau(sel, enHeure(m)); });
  }

  function ajouterCreneau(sel, libelle) {
    var o = document.createElement('option');
    o.value = libelle;
    o.textContent = libelle;
    sel.appendChild(o);
  }

  function erreur(message) {
    var m = $('#msg-err');
    m.textContent = message;
    m.setAttribute('data-on', '1');
    m.scrollIntoView({ block: 'nearest' });
  }

  function envoyer(e) {
    e.preventDefault();
    $('#msg-err').removeAttribute('data-on');

    var nom = $('#f-nom').value.trim();
    var tel = $('#f-tel').value.trim();
    var heure = $('#f-heure').value;

    if (nom.length < 2) return erreur('Merci d’indiquer votre nom.');
    // Un numero francais fait dix chiffres ; on compte les chiffres
    // plutot que d'imposer un format, pour accepter les espaces, les
    // points et le +33 sans rien reprocher au client.
    if (tel.replace(/[^0-9]/g, '').length < 9) {
      return erreur('Merci d’indiquer un numéro de téléphone valide.');
    }

    // Filtre anti-robot : le piege doit rester vide, et un humain ne
    // remplit pas une commande en moins de quatre secondes.
    if ($('#f-site').value) return;
    if (Date.now() - neAvant < 4000) {
      return erreur('Un instant, votre commande part dans quelques secondes.');
    }

    var btn = $('#f-envoyer');
    btn.disabled = true;
    btn.textContent = 'Envoi en cours…';

    fetch(config.supabaseUrl + '/functions/v1/create-commande-retrait', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + config.supabaseAnonKey,
        apikey: config.supabaseAnonKey
      },
      body: JSON.stringify({
        client_id: config.clientId,
        nom_client: nom,
        telephone_client: tel,
        heure_retrait: heure,
        panier: lignesPanier().map(function (l) {
          return { produit_id: l.produit.id, quantite: l.quantite, options: l.options };
        })
      })
    })
      .then(function (r) {
        return r.json().then(function (corps) {
          if (!r.ok) throw new Error(corps && corps.error ? corps.error : 'Erreur ' + r.status);
          return corps;
        });
      })
      .then(function (corps) { confirmer(corps, heure); })
      .catch(function (err) {
        console.warn(err);
        btn.disabled = false;
        btn.textContent = 'Envoyer la commande';
        erreur('Votre commande n’a pas pu être envoyée. '
          + 'Appelez-nous au 09 50 94 88 15, nous la prenons tout de suite.');
      });
  }

  /* Une fois la commande partie, l'ecran ne se fige pas : il suit
     l'avancement, parce que c'est la seule question que se pose le
     client ensuite — « c'est bon, ils l'ont prise ? » et « je viens
     quand ? ». Sans ca, il rappelle le restaurant pour le savoir. */
  var ETAPES = {
    recue: {
      rond: '<i></i><i></i><i></i>',
      titre: 'Commande envoyée',
      texte: 'Le restaurant va la confirmer dans un instant.',
      libelleHeure: 'Vous avez demandé'
    },
    acceptee: {
      rond: '🔥',
      titre: 'Commande acceptée',
      texte: 'Elle est en cours de préparation.',
      libelleHeure: 'À récupérer à'
    },
    prete: {
      rond: '✓',
      titre: 'Votre commande est prête',
      texte: 'Présentez-vous au comptoir, elle vous attend.',
      libelleHeure: 'Prête depuis'
    },
    recuperee: {
      rond: '✓',
      titre: 'Bon appétit',
      texte: 'Merci, et à bientôt chez KSM.',
      libelleHeure: null
    },
    refusee: {
      rond: '!',
      titre: 'Commande non retenue',
      texte: 'Le restaurant n’a pas pu la prendre. Appelez-nous, on trouve une solution.',
      libelleHeure: null
    }
  };

  var suiviId = null;

  function confirmer(corps, heure) {
    // La reference est le debut de l'identifiant : c'est ce que le
    // comptoir voit de son cote, donc ce qui permet de se retrouver.
    var id = String(corps.commande_id || '');

    // Garde la commande sous la main : si le client ferme la page ou
    // rafraichit, il retrouve son suivi au lieu d'un site normal qui
    // fait comme s'il n'avait rien commande.
    try {
      localStorage.setItem('ksm_commande', JSON.stringify({
        id: id, heure: heure, quand: Date.now()
      }));
    } catch (e) { /* navigation privee : le suivi vivra le temps de la page */ }

    panier = Object.create(null);
    majBarre();
    majPas();

    if (window.gtag) {
      window.gtag('event', 'commande_envoyee', {
        event_category: 'conversion',
        value: corps.total || 0
      });
    }

    commandeEnCours = { id: id, heure: heure, statut: 'recue' };
    ouvrirSuivi(id, heure, 'recue');
  }

  function ouvrirSuivi(id, heure, statut) {
    elModale.setAttribute('data-ouvert', '1');
    document.body.style.overflow = 'hidden';
    peindreSuivi(id, heure, statut);
    lancerSuivi(id);
  }

  function peindreSuivi(id, heure, statut) {
    var e = ETAPES[statut] || ETAPES.recue;
    var ref = id.slice(0, 8).toUpperCase();

    var html = '<div class="modale-tete" style="border:0;padding:0">'
      + '<span></span>'
      + '<button class="fermer" type="button" data-fermer aria-label="Fermer">&times;</button>'
      + '</div>'
      + '<div class="ok-bloc">'
      + '<div class="ok-rond" data-s="' + statut + '" aria-hidden="true">' + e.rond + '</div>'
      + '<h2>' + e.titre + '</h2>'
      + '<p>' + e.texte + '</p>';

    if (e.libelleHeure && heure) {
      html += '<p class="ok-heure"><small>' + e.libelleHeure + '</small>'
        + (heure === 'Dès que possible' ? 'dès que possible' : heure) + '</p>';
    }

    html += '<p class="ref" style="margin-top:16px">Référence ' + ref + '</p>'
      + '<p style="margin-top:14px">10 rue du Beaujolais, 69820 Fleurie<br>Règlement sur place.</p>'
      + '<a class="pill pill-vin" style="margin-top:18px" href="tel:+33950948815">Appeler le restaurant</a>'
      + '</div>';

    $('#modale-boite').innerHTML = html;
    var x = $('#modale-boite [data-fermer]');
    if (x) x.addEventListener('click', fermerModale);
  }

  /* On interroge le serveur toutes les quinze secondes. Assez souvent
     pour que « c'est prêt » arrive vite, assez rare pour ne pas vider
     la batterie de quelqu'un qui attend vingt minutes. */
  function lancerSuivi(id) {
    clearInterval(suiviId);

    function voir() {
      // Onglet en arriere-plan : personne ne regarde, on ne demande
      // rien. Le retour au premier plan declenche une lecture.
      if (document.hidden) return;

      fetch(config.supabaseUrl + '/functions/v1/commande-statut-ksm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: config.supabaseAnonKey,
          Authorization: 'Bearer ' + config.supabaseAnonKey
        },
        body: JSON.stringify({ commande_id: id })
      })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (d) {
          if (!d || !d.statut) return;
          commandeEnCours = { id: id, heure: d.heure, statut: d.statut };
          majBarreSuivi();
          // Ne repeindre que si l'ecran de suivi est effectivement
          // ouvert : sinon on ecraserait le formulaire de commande
          // d'un client en train d'en passer une seconde.
          if (elModale.getAttribute('data-ouvert') && $('#modale-boite .ok-bloc')) {
            peindreSuivi(id, d.heure, d.statut);
          }

          // Commande close : plus rien a suivre, et on oublie la
          // commande pour ne pas rouvrir ce suivi au prochain passage.
          if (d.statut === 'recuperee' || d.statut === 'refusee') {
            clearInterval(suiviId);
            commandeEnCours = null;
            majBarreSuivi();
            try { localStorage.removeItem('ksm_commande'); } catch (e) {}
          }
        })
        .catch(function () { /* reseau coupe : on reessaie au tour suivant */ });
    }

    suiviId = setInterval(voir, 15000);
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) voir();
    });
    voir();
  }

  /* Au chargement du site, une commande encore en cours rouvre son
     suivi. Passe quatre heures, on considere le service termine et on
     oublie : rouvrir le suivi d'un repas d'hier serait absurde. */
  function reprendreSuivi() {
    var brut;
    try { brut = localStorage.getItem('ksm_commande'); } catch (e) { return; }
    if (!brut) return;

    var c;
    try { c = JSON.parse(brut); } catch (e) { return; }
    if (!c || !c.id) return;

    if (Date.now() - (c.quand || 0) > 4 * 3600 * 1000) {
      try { localStorage.removeItem('ksm_commande'); } catch (e) {}
      return;
    }

    /* Une barre en bas, pas une modale : quelqu'un qui revient sur le
       site veut peut-etre commander autre chose, et se faire barrer la
       route par l'ecran de sa commande precedente serait absurde. Il
       l'ouvre s'il veut la voir. */
    commandeEnCours = { id: c.id, heure: c.heure, statut: 'recue' };
    majBarreSuivi();
    lancerSuivi(c.id);
  }

  var commandeEnCours = null;

  function majBarreSuivi() {
    var b = $('#suivi-barre');
    if (!b) return;

    // Panier non vide : la barre du panier prend la place. Les deux
    // sont fixees en bas de l'ecran, elles ne peuvent pas cohabiter.
    var visible = commandeEnCours && !totaux().n;
    b.setAttribute('data-ouvert', visible ? '1' : '0');
    if (!visible) return;

    var e = ETAPES[commandeEnCours.statut] || ETAPES.recue;
    var t = e.titre;
    if (commandeEnCours.statut === 'acceptee' && commandeEnCours.heure) {
      t = 'En préparation · prête à ' + commandeEnCours.heure;
    } else if (commandeEnCours.statut === 'prete') {
      t = 'Votre commande est prête';
    }
    $('#suivi-txt').innerHTML = '<b>' + t + '</b>';
  }

  // -----------------------------------------------------------------
  //  7. Horaires : mettre en avant le jour en cours
  // -----------------------------------------------------------------
  function majHoraires() {
    var jour = new Date().getDay();   // 0 = dimanche
    document.querySelectorAll('#horaires .hrow').forEach(function (r) {
      if (Number(r.getAttribute('data-jour')) !== jour) return;
      r.classList.add('aujourdhui');
      var valeur = r.lastElementChild.textContent.trim();
      texte($('#fait-horaire'), /^ferm/i.test(valeur) ? 'Fermé' : valeur);
    });
  }

  // -----------------------------------------------------------------
  //  7 bis. Le heros : les quatre clips se relaient
  // -----------------------------------------------------------------
  function heros() {
    var clips = Array.prototype.slice.call(document.querySelectorAll('.hero-clip'));
    if (!clips.length) return;

    var hero = document.querySelector('.hero');

    // Respecter « moins d'animations » : l'image fixe suffit. Un site
    // de commande doit pouvoir se lire par quelqu'un que le mouvement
    // gene.
    var calme = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)');
    if (calme && calme.matches) return;

    var i = 0;
    var minuteur = null;

    /* Le navigateur peut refuser la lecture automatique — economie de
       donnees, reglage strict, batterie faible. On ne laisse pas un
       cadre noir : on bascule sur l'image fixe. */
    function replier() {
      clearTimeout(minuteur);
      hero.setAttribute('data-sans-video', '');
    }

    /* `play()` est lance sans qu'on l'attende, et son echec est
       rattrape a part.

       La premiere version enchainait les clips DANS le `.then()` de
       cette promesse. Or dans un onglet en arriere-plan elle ne se
       resout jamais : la bascule ne partait pas, et le heros restait
       fige sur le meme clip pour toujours, y compris apres le retour
       au premier plan. */
    function jouer(v) {
      var p = v.play();
      if (p && p.catch) p.catch(function () { /* rattrape par le minuteur */ });
    }

    /* La bascule est pilotee par un minuteur, jamais par l'evenement
       `ended` seul : un clip qui ne se termine pas — onglet masque,
       decodage en retard, reseau coupe — bloquerait la boucle. Le
       minuteur, lui, tombe toujours. */
    /* Chaque plan reste a l'ecran le temps du nombre de boucles qu'il
       declare. La cuisson en demande deux : un seul passage de 1,8 s
       ne laisse pas le temps de voir la viande saisir. Elle porte
       l'attribut `loop`, donc elle repart d'elle-meme ; le minuteur ne
       fait qu'attendre plus longtemps avant de passer au suivant. */
    function programmer() {
      clearTimeout(minuteur);
      var v = clips[i];
      var duree = (v.duration && isFinite(v.duration)) ? v.duration * 1000 : 1800;
      var boucles = Number(v.getAttribute('data-boucles')) || 1;
      minuteur = setTimeout(suivant, Math.max(1200, duree * boucles - 250));
    }

    function suivant() {
      var sortant = clips[i];
      i = (i + 1) % clips.length;
      var entrant = clips[i];

      entrant.currentTime = 0;
      jouer(entrant);
      entrant.setAttribute('data-on', '');
      sortant.removeAttribute('data-on');

      // On arrete le sortant APRES le fondu, sinon sa derniere image se
      // fige a l'ecran pendant toute la transition.
      setTimeout(function () {
        sortant.pause();
        sortant.currentTime = 0;
      }, 850);

      // Le clip d'apres se prepare pendant celui-ci : sans ca, son
      // premier passage attend le reseau et le fondu tombe sur du noir.
      var apres = clips[(i + 1) % clips.length];
      if (apres.preload !== 'auto') { apres.preload = 'auto'; apres.load(); }

      programmer();
    }

    clips.forEach(function (v) {
      v.addEventListener('error', replier);
    });

    // Onglet en arriere-plan : quatre videos qui tournent pour personne
    // vident la batterie d'un telephone. On arrete aussi le minuteur,
    // sinon on revient sur un heros qui a defile dans le vide.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        clearTimeout(minuteur);
        clips[i].pause();
      } else if (!hero.hasAttribute('data-sans-video')) {
        jouer(clips[i]);
        programmer();
      }
    });

    jouer(clips[0]);
    programmer();
  }

  // -----------------------------------------------------------------
  //  8. Branchements
  // -----------------------------------------------------------------
  $('#barre-btn').addEventListener('click', ouvrirModale);
  $('#suivi-barre').addEventListener('click', function () {
    if (!commandeEnCours) return;
    ouvrirSuivi(commandeEnCours.id, commandeEnCours.heure, commandeEnCours.statut);
  });
  $('#modale-fermer').addEventListener('click', fermerModale);
  elModale.addEventListener('click', function (e) {
    if (e.target === elModale) fermerModale();
  });
  elFiche.addEventListener('click', function (e) {
    if (e.target === elFiche) fermerFiche();
  });
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (elFiche.getAttribute('data-ouvert')) fermerFiche();
    else if (elModale.getAttribute('data-ouvert')) fermerModale();
  });
  $('#form-commande').addEventListener('submit', envoyer);
  $('#annee').textContent = new Date().getFullYear();

  // Les horaires se relisent une fois que l'espace client a pose ses
  // valeurs, sinon on recopierait dans le hero l'horaire par defaut
  // du HTML — celui qui n'est plus le bon.
  majHoraires();
  majAvisFermeture();
  /* Les horaires reels arrivent de l'espace client apres coup : sans
     ce second passage, on jugerait l'ouverture sur les valeurs par
     defaut du HTML, qui ne sont peut-etre plus les bonnes. */
  document.addEventListener('locweb:contenu-charge', function () {
    majHoraires();
    majAvisFermeture();
  });

  heros();
  chargerCarte();
  reprendreSuivi();
})();
