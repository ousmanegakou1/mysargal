/* ═══════════════════════════════════════════════════════════════════
   MySargal — remontée des erreurs

   Les pannes nous parvenaient par téléphone, souvent plusieurs jours
   après. Un débit de points sans remise a ainsi survécu des semaines,
   parce que personne côté MySargal ne voyait le message affiché au
   commerçant. Cette page envoie désormais ses erreurs d'elle même.

   Ce qui est capté : les erreurs JavaScript non rattrapées, les
   promesses rejetées sans traitement, et les appels serveur qui
   répondent en erreur.

   Ce qui n'est JAMAIS envoyé : aucun numéro, aucun nom, aucun code de
   carte. Le message est nettoyé ici, puis à nouveau côté serveur. Une
   erreur sert à corriger, pas à observer les gens.

   Le module se tait de lui même : cinq envois par page au maximum, et
   une même erreur n'est signalée qu'une fois.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var ROUTE = 'https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1/bug-report';

  // Clé publique du projet. Elle est déjà servie dans chaque page du site et ne
  // donne aucun droit : la route n'écrit que dans le journal. On l'inscrit ici
  // parce que les pages déclarent leur clé dans une portée fermée, hors de
  // portée d'un module externe.
  var ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2N4bHZjdW9xYWZ6bGlzcXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTgwODIsImV4cCI6MjA5MDkzNDA4Mn0.o-dRdHDGc5_IwCGhK5Ri67CCtZRj6J4evsxgBkMgvao';
  var MAX_PAR_PAGE = 5;
  var envoyes = 0;
  var deja = {};

  // La source dit d'où vient l'erreur, pour trier le journal ensuite.
  function source() {
    var p = String(location.pathname || '');
    if (p.indexOf('/merchant') === 0) return 'marchand';
    if (p.indexOf('/admin') === 0) return 'admin';
    if (p.indexOf('/boutique') === 0 || p.indexOf('/scan') === 0) return 'boutique';
    return 'client';
  }

  // Un identifiant de boutique aide à savoir qui est touché. Il n'a rien de
  // personnel : c'est une référence interne, pas une donnée sur quelqu'un.
  function boutique() {
    try {
      if (typeof MERCHANT !== 'undefined' && MERCHANT && MERCHANT.id) return MERCHANT.id;
    } catch (e) {}
    try {
      var m = new URLSearchParams(location.search).get('merchant');
      if (m && /^[0-9a-f-]{36}$/i.test(m)) return m;
    } catch (e) {}
    return null;
  }

  // Premier nettoyage, avant même que la donnée quitte l'appareil.
  function laver(t) {
    return String(t == null ? '' : t)
      .replace(/\+?\d[\d\s.\-()]{7,}\d/g, 'numero-masque')
      .replace(/\b(LC|GC)-[A-Z0-9]{4,}/g, '$1-masque')
      .replace(/(apikey|api_key|token|secret|key)=[^&\s]+/gi, '$1=masque');
  }

  // L'adresse de la page sans ses paramètres : le chemin suffit à situer
  // l'erreur, et les paramètres transportent souvent un code de carte.
  function page() {
    try { return location.origin + location.pathname; } catch (e) { return ''; }
  }

  function envoyer(gravite, message, detail) {
    if (envoyes >= MAX_PAR_PAGE) return;
    var msg = laver(message).slice(0, 400);
    if (!msg) return;
    var cle = gravite + '|' + msg;
    if (deja[cle]) return;
    deja[cle] = true;
    envoyes++;

    var corps = JSON.stringify({
      gravite: gravite,
      source: source(),
      message: msg,
      detail: laver(detail).slice(0, 4000),
      page: page(),
      merchant_id: boutique(),
      version: (window.MS_VERSION || ''),
    });

    // keepalive laisse la requête se terminer même si l'onglet se ferme, ce qui
    // compte : une erreur fatale est souvent suivie d'un rechargement. On ne
    // passe pas par sendBeacon, qui ne sait pas poser d'en tête d'autorisation.
    try {
      fetch(ROUTE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: ANON,
          Authorization: 'Bearer ' + ANON,
        },
        body: corps,
        keepalive: true,
      }).catch(function () {});
    } catch (e) {}
  }

  window.addEventListener('error', function (e) {
    if (!e) return;
    // Une image ou un script qui ne charge pas n'a pas de message : on donne
    // au moins la ressource fautive, sinon le journal est illisible.
    if (e.target && e.target !== window && e.target.src) {
      envoyer('avertissement', 'Ressource non chargee', String(e.target.src));
      return;
    }
    var pile = (e.error && e.error.stack) ? e.error.stack : (e.filename + ':' + e.lineno);
    envoyer('erreur', e.message || 'Erreur JavaScript', pile);
  }, true);

  window.addEventListener('unhandledrejection', function (e) {
    var r = e && e.reason;
    var m = (r && (r.message || r)) || 'Promesse rejetee';
    envoyer('erreur', String(m), (r && r.stack) ? r.stack : '');
  });

  // Les appels serveur en échec. On ne signale que les erreurs du serveur et
  // les coupures réseau : un 401 ou un 404 est souvent une réponse normale,
  // et l'on inonderait le journal pour rien.
  try {
    var origine = window.fetch;
    if (typeof origine === 'function') {
      window.fetch = function (entree, options) {
        var url = '';
        try { url = (typeof entree === 'string') ? entree : (entree && entree.url) || ''; } catch (e) {}
        return origine.apply(this, arguments).then(function (r) {
          try {
            if (r && r.status >= 500 && url.indexOf('bug-report') < 0) {
              envoyer('erreur', 'Appel serveur en echec ' + r.status, laver(url));
            }
          } catch (e) {}
          return r;
        }).catch(function (err) {
          try {
            if (url.indexOf('bug-report') < 0) {
              envoyer('avertissement', 'Appel serveur injoignable', laver(url) + ' ' + (err && err.message));
            }
          } catch (e) {}
          throw err;
        });
      };
    }
  } catch (e) {}

  // Exposé pour qu'un écran puisse signaler lui même une anomalie métier,
  // par exemple un débit refusé que l'utilisateur ne comprend pas.
  window.msBug = function (message, detail, gravite) {
    envoyer(gravite === 'critique' ? 'critique' : 'erreur', message, detail || '');
  };
})();
