// ===================================================================
//  Espace restaurant — l'ecran du comptoir.
//
//  Une commande arrive, on l'accepte ou on la refuse, on dit quand
//  c'est pret. Rien d'autre : c'est un ecran qu'on regarde les mains
//  pleines, entre deux services.
//
//  Le code d'acces n'est jamais verifie ici : il part a la fonction
//  `restaurant-ksm`, qui seule detient la cle capable de lire les
//  commandes. Un code faux ne renvoie rien du tout.
// ===================================================================
(function () {
  'use strict';

  var config = window.LOCWEB_CONFIG;
  var CLE = 'locweb_resto_code_' + config.clientId;
  var URL_FN = config.supabaseUrl + '/functions/v1/restaurant-ksm';

  var code = localStorage.getItem(CLE) || '';
  var connues = Object.create(null);   // commandes deja vues, pour reperer les nouvelles
  var premierTour = true;
  var sonActif = false;
  var minuteur = null;

  var $ = function (s) { return document.querySelector(s); };

  var LIBELLE = {
    recue: 'À accepter',
    en_preparation: 'En préparation',
    prete: 'Prête'
  };

  function euros(n) { return Number(n).toFixed(2).replace('.', ',') + ' €'; }

  function appel(action, params) {
    var corps = { token: code, client_id: config.clientId, action: action };
    for (var k in params) corps[k] = params[k];

    return fetch(URL_FN, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        apikey: config.supabaseAnonKey,
        Authorization: 'Bearer ' + config.supabaseAnonKey
      },
      body: JSON.stringify(corps)
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d && d.error ? d.error : 'Erreur ' + r.status);
        return d;
      });
    });
  }

  // -----------------------------------------------------------------
  //  Entrer
  // -----------------------------------------------------------------
  function valider() {
    var saisi = $('#code-input').value.trim();
    if (!saisi) return;
    code = saisi;
    $('#code-erreur').textContent = '';

    appel('lister_commandes')
      .then(function () {
        localStorage.setItem(CLE, code);
        ouvrir();
      })
      .catch(function () {
        code = '';
        $('#code-erreur').textContent = 'Code incorrect.';
      });
  }

  function ouvrir() {
    $('#ecran-code').style.display = 'none';
    $('#ecran-app').style.display = 'block';

    // Empeche le telephone du comptoir de s'eteindre pendant le
    // service. Non supporte partout, et c'est sans consequence : on
    // ne previent pas, l'ecran se rallume au toucher comme avant.
    if (navigator.wakeLock) {
      navigator.wakeLock.request('screen').catch(function () {});
    }

    rafraichir();
    minuteur = setInterval(rafraichir, 10000);

    // Onglet remis au premier plan : on ne fait pas attendre dix
    // secondes de plus quelqu'un qui vient regarder son ecran.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) rafraichir();
    });
  }

  // -----------------------------------------------------------------
  //  Le son d'une nouvelle commande
  // -----------------------------------------------------------------
  /* Un ecran de cuisine qui ne signale rien est un ecran que personne
     ne regarde. Le son est synthetise : pas de fichier a charger, et
     rien a maintenir. Il reste coupe par defaut — c'est au comptoir
     de decider, et un navigateur refuse de toute facon de jouer un
     son avant un vrai geste de l'utilisateur. */
  var audio = null;

  function sonner() {
    if (!sonActif) return;
    try {
      if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
      var t = audio.currentTime;
      [880, 1174].forEach(function (freq, i) {
        var o = audio.createOscillator();
        var g = audio.createGain();
        o.type = 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, t + i * 0.16);
        g.gain.exponentialRampToValueAtTime(0.22, t + i * 0.16 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.16 + 0.34);
        o.connect(g); g.connect(audio.destination);
        o.start(t + i * 0.16); o.stop(t + i * 0.16 + 0.36);
      });
    } catch (e) { /* pas de son : ce n'est pas une raison d'arreter l'ecran */ }
  }

  function basculerSon() {
    sonActif = !sonActif;
    var b = $('#son-btn');
    b.textContent = sonActif ? 'Son activé' : 'Son coupé';
    if (sonActif) { b.setAttribute('data-on', ''); sonner(); }
    else b.removeAttribute('data-on');
  }

  // -----------------------------------------------------------------
  //  La liste
  // -----------------------------------------------------------------
  function rafraichir() {
    appel('lister_commandes')
      .then(function (d) {
        pouls(true);
        afficher(d.commandes || []);
      })
      .catch(function (err) {
        console.warn(err);
        pouls(false);
      });
  }

  function pouls(ok) {
    var el = $('#pouls');
    if (ok) {
      el.classList.remove('perdu');
      $('#pouls-txt').textContent = 'À jour';
    } else {
      el.classList.add('perdu');
      $('#pouls-txt').textContent = 'Connexion perdue';
    }
  }

  function afficher(commandes) {
    var zone = $('#cmds');
    var n = { recue: 0, en_preparation: 0, prete: 0 };
    var nouvelle = false;

    commandes.forEach(function (c) {
      if (n[c.statut] !== undefined) n[c.statut]++;
      if (!connues[c.id]) {
        connues[c.id] = true;
        // Au tout premier chargement, tout est « nouveau » : sonner
        // ferait retentir dix bips d'un coup a l'ouverture de l'ecran.
        if (!premierTour && c.statut === 'recue') nouvelle = true;
      }
    });
    premierTour = false;
    if (nouvelle) sonner();

    $('#c-attente').querySelector('b').textContent = n.recue;
    if (n.recue) $('#c-attente').setAttribute('data-alerte', '');
    else $('#c-attente').removeAttribute('data-alerte');
    $('#n-prep').textContent = n.en_preparation;
    $('#n-prete').textContent = n.prete;

    if (!commandes.length) {
      zone.innerHTML = '<div class="vide"><b>Aucune commande en cours</b>'
        + 'Les nouvelles commandes apparaissent ici toutes les dix secondes.</div>';
      return;
    }

    /* Les commandes a accepter passent devant, puis celles qui sont
       pretes (quelqu'un attend au comptoir), puis celles en cours.
       L'ordre d'arrivee departage a l'interieur de chaque groupe. */
    var rang = { recue: 0, prete: 1, en_preparation: 2 };
    commandes.sort(function (a, b) {
      var d = (rang[a.statut] ?? 9) - (rang[b.statut] ?? 9);
      return d !== 0 ? d : new Date(a.date_creation) - new Date(b.date_creation);
    });

    zone.innerHTML = '';
    commandes.forEach(function (c) { zone.appendChild(carte(c)); });
  }

  function el(balise, classe, contenu) {
    var e = document.createElement(balise);
    if (classe) e.className = classe;
    if (contenu != null) e.textContent = contenu;
    return e;
  }

  function carte(c) {
    var d = el('div', 'cmd');
    d.setAttribute('data-statut', c.statut);

    // --- entete
    var tete = el('div', 'cmd-tete');
    tete.appendChild(el('span', 'cmd-ref', String(c.id).slice(0, 8).toUpperCase()));
    tete.appendChild(el('span', 'cmd-nom', c.nom_client || 'Sans nom'));
    tete.appendChild(el('span', 'cmd-total', euros(c.total)));
    d.appendChild(tete);

    // --- ligne d'informations
    var meta = el('div', 'cmd-meta');
    var etat = el('span', 'etat', LIBELLE[c.statut] || c.statut);
    etat.setAttribute('data-s', c.statut);
    meta.appendChild(etat);

    var heure = c.heure_confirmee || c.heure_demandee;
    if (heure) {
      var h = el('span');
      h.appendChild(document.createTextNode(c.heure_confirmee ? 'Retrait ' : 'Demandé pour '));
      h.appendChild(el('b', null, heure));
      meta.appendChild(h);
    }

    if (c.telephone_client) {
      var tel = el('span');
      var a = el('a', null, c.telephone_client);
      a.href = 'tel:' + String(c.telephone_client).replace(/[^0-9+]/g, '');
      tel.appendChild(a);
      meta.appendChild(tel);
    }
    meta.appendChild(el('span', null, 'Reçue à ' + heureDe(c.date_creation)));
    d.appendChild(meta);

    // --- les plats
    var arts = el('div', 'cmd-articles');
    (c.articles || []).forEach(function (a) {
      var l = el('div', 'art');
      l.appendChild(el('span', 'art-q', '×' + a.quantite));

      var nom = el('span', 'art-n');
      // Les options sont accolees au nom par le serveur, entre
      // parentheses. On les detache pour les mettre en evidence :
      // « sans oignons » doit se voir, pas se lire.
      var m = String(a.nom).match(/^(.*?)\s*\((.+)\)$/);
      if (m) {
        nom.appendChild(document.createTextNode(m[1]));
        nom.appendChild(el('span', 'art-opt', m[2]));
      } else {
        nom.textContent = a.nom;
      }
      l.appendChild(nom);
      arts.appendChild(l);
    });
    d.appendChild(arts);

    // --- ce qu'on peut faire
    if (c.statut === 'recue') d.appendChild(zoneAcceptation(c));
    else d.appendChild(actions(c));

    return d;
  }

  function heureDe(iso) {
    var t = new Date(iso);
    return String(t.getHours()).padStart(2, '0') + 'h' + String(t.getMinutes()).padStart(2, '0');
  }

  /* Accepter, c'est s'engager sur une heure. On propose donc celle que
     le client a demandee, deja selectionnee, entouree de creneaux
     proches : en coup de feu, « je ne peux pas a 19h30 mais a 19h45
     oui » doit se dire en un geste, sans clavier. */
  function zoneAcceptation(c) {
    var bloc = document.createElement('div');

    var h = el('div', 'heures');
    h.appendChild(el('p', null, 'À quelle heure sera-t-elle prête ?'));
    var liste = el('div', 'heures-liste');

    var choix = creneaux(c.heure_demandee);
    var choisie = choix.defaut;

    choix.liste.forEach(function (lib) {
      var b = el('button', 'h-btn', lib);
      b.type = 'button';
      if (lib === choix.defaut) b.setAttribute('data-choisi', '');
      if (lib === choix.demandee) b.setAttribute('data-demande', '');
      b.addEventListener('click', function () {
        liste.querySelectorAll('.h-btn').forEach(function (x) { x.removeAttribute('data-choisi'); });
        b.setAttribute('data-choisi', '');
        choisie = lib;
      });
      liste.appendChild(b);
    });
    h.appendChild(liste);
    bloc.appendChild(h);

    var act = el('div', 'cmd-actions');
    var ok = el('button', 'b b-ok', 'Accepter');
    ok.type = 'button';
    ok.addEventListener('click', function () {
      ok.disabled = true;
      ok.textContent = 'Envoi…';
      appel('accepter', { commande_id: c.id, heure: choisie })
        .then(rafraichir)
        .catch(function (e) {
          ok.disabled = false;
          ok.textContent = 'Accepter';
          alert('Erreur : ' + e.message);
        });
    });
    act.appendChild(ok);

    var non = el('button', 'b b-refus', 'Refuser');
    non.type = 'button';
    non.addEventListener('click', function () {
      // Un refus se voit du cote du client : on demande confirmation
      // plutot que de laisser un doigt maladroit annuler un repas.
      if (!confirm('Refuser la commande de ' + (c.nom_client || 'ce client') + ' ?')) return;
      majStatut(c.id, 'annulee', non);
    });
    act.appendChild(non);

    bloc.appendChild(act);
    return bloc;
  }

  function actions(c) {
    var act = el('div', 'cmd-actions');

    if (c.statut === 'en_preparation') {
      var pret = el('button', 'b b-ok', 'C’est prêt');
      pret.type = 'button';
      pret.addEventListener('click', function () { majStatut(c.id, 'prete', pret); });
      act.appendChild(pret);
    }

    if (c.statut === 'prete') {
      var pris = el('button', 'b b-or', 'Récupérée');
      pris.type = 'button';
      pris.addEventListener('click', function () { majStatut(c.id, 'recuperee', pris); });
      act.appendChild(pris);
    }

    return act;
  }

  function majStatut(id, statut, bouton) {
    if (bouton) { bouton.disabled = true; bouton.textContent = 'Envoi…'; }
    appel('maj_statut', { commande_id: id, statut: statut })
      .then(rafraichir)
      .catch(function (e) {
        if (bouton) bouton.disabled = false;
        alert('Erreur : ' + e.message);
        rafraichir();
      });
  }

  /* Les creneaux proposes a l'acceptation : l'heure demandee au
     milieu, deux quarts d'heure avant et apres. « Dès que possible »
     n'est pas une heure — on part alors de maintenant + 20 minutes,
     le temps de preparation annonce au client. */
  function creneaux(demandee) {
    var base = null;
    var m = String(demandee || '').match(/(\d{1,2})\s*h\s*(\d{0,2})/i);
    if (m) {
      base = new Date();
      base.setHours(Number(m[1]), Number(m[2] || 0), 0, 0);
    }
    var libDemandee = base ? fmt(base) : null;

    if (!base) {
      base = new Date();
      base.setMinutes(base.getMinutes() + 20);
      base.setMinutes(Math.ceil(base.getMinutes() / 15) * 15, 0, 0);
    }

    var liste = [];
    for (var i = -2; i <= 3; i++) {
      var t = new Date(base.getTime() + i * 15 * 60000);
      liste.push(fmt(t));
    }
    return { liste: liste, defaut: fmt(base), demandee: libDemandee };
  }

  function fmt(d) {
    return String(d.getHours()).padStart(2, '0') + 'h' + String(d.getMinutes()).padStart(2, '0');
  }

  // -----------------------------------------------------------------
  //  Branchements
  // -----------------------------------------------------------------
  $('#code-valider').addEventListener('click', valider);
  $('#code-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') valider();
  });
  $('#son-btn').addEventListener('click', basculerSon);

  // Code deja connu : on entre directement, mais on verifie d'abord
  // qu'il vaut encore quelque chose.
  if (code) {
    appel('lister_commandes')
      .then(ouvrir)
      .catch(function () {
        localStorage.removeItem(CLE);
        code = '';
      });
  }
})();
