/* ═══════════════════════════════════════════════════════════════════
   MySargal — sélecteur de langue partagé
   ───────────────────────────────────────────────────────────────────
   Un seul composant pour toutes les pages : landing, panneau marchand,
   consoles, pages clientes. Avant, chaque fichier de traduction dessinait
   le sien, à un endroit différent et avec un comportement différent : on
   ne savait jamais où le trouver, ni s'il allait recharger la page.

   Il est épinglé en bas à gauche. Le bas droit appartient à la bulle
   WhatsApp, le bas pleine largeur aux barres d'appel à l'action.

   On clique, un menu s'ouvre, on choisit. Le choix est mémorisé et
   l'emporte partout sur la langue devinée.

   Branchement : window.msLangue.poser({ courante, sur }) où « sur » est
   appelé avec le code choisi. Si « sur » ne fait rien, la page recharge.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LANGUES = [
    { c: 'fr', court: 'FR', nom: 'Français' },
    { c: 'en', court: 'EN', nom: 'English' },
    { c: 'es', court: 'ES', nom: 'Español' }
  ];

  function memoire() {
    try { return localStorage.getItem('ms_lang') || null; } catch (e) { return null; }
  }
  function retenir(l) {
    try { localStorage.setItem('ms_lang', l); } catch (e) {}
  }

  // Sans fonction de rafraîchissement, on recharge. On enlève ?lang= au
  // passage, sinon il reprendrait la main et le choix semblerait ignoré.
  function rechargerPropre() {
    try {
      var u = new URL(location.href);
      u.searchParams.delete('lang');
      location.replace(u.toString());
      return;
    } catch (e) {}
    location.reload();
  }

  function poser(opts) {
    opts = opts || {};
    if (!document.body) return null;
    if (document.body.getAttribute('data-ms-langue') === 'non') return null;

    var existant = document.getElementById('ms-langue');
    if (existant) return existant;

    var courante = String(opts.courante || memoire() || document.documentElement.lang || 'fr').slice(0, 2);
    if (!LANGUES.some(function (x) { return x.c === courante; })) courante = 'fr';

    var police = "-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

    var racine = document.createElement('div');
    racine.id = 'ms-langue';
    racine.style.cssText =
      'position:fixed;z-index:99998;left:12px;bottom:calc(90px + env(safe-area-inset-bottom));' +
      'font-family:' + police + ';';

    // ── Le bouton visible ────────────────────────────────────────
    var bouton = document.createElement('button');
    bouton.type = 'button';
    bouton.setAttribute('aria-haspopup', 'listbox');
    bouton.setAttribute('aria-expanded', 'false');
    bouton.setAttribute('aria-label', 'Langue / Language / Idioma');
    bouton.style.cssText =
      'display:flex;align-items:center;gap:7px;cursor:pointer;' +
      'padding:8px 13px;border-radius:999px;border:1px solid rgba(0,0,0,.10);' +
      'background:rgba(255,255,255,.94);color:#111827;' +
      'box-shadow:0 6px 20px rgba(0,0,0,.16);backdrop-filter:blur(8px);' +
      'font-size:12px;font-weight:800;letter-spacing:.04em;line-height:1;';

    var globe = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    globe.setAttribute('viewBox', '0 0 24 24');
    globe.setAttribute('width', '15');
    globe.setAttribute('height', '15');
    globe.setAttribute('aria-hidden', 'true');
    globe.style.cssText = 'fill:none;stroke:#16a34a;stroke-width:1.9;flex:none';
    globe.innerHTML =
      '<circle cx="12" cy="12" r="9"/>' +
      '<path d="M3 12h18M12 3c2.6 2.6 2.6 15 0 18M12 3c-2.6 2.6-2.6 15 0 18"/>';

    var etiquette = document.createElement('span');
    var chevron = document.createElement('span');
    chevron.textContent = '▾';
    chevron.style.cssText = 'font-size:10px;color:#6b7280;line-height:1';

    bouton.appendChild(globe);
    bouton.appendChild(etiquette);
    bouton.appendChild(chevron);

    // ── Le menu ──────────────────────────────────────────────────
    var menu = document.createElement('div');
    menu.setAttribute('role', 'listbox');
    menu.style.cssText =
      'position:absolute;left:0;bottom:calc(100% + 8px);min-width:158px;' +
      'display:none;flex-direction:column;padding:5px;border-radius:14px;' +
      'background:#ffffff;border:1px solid rgba(0,0,0,.10);' +
      'box-shadow:0 14px 40px rgba(0,0,0,.22);overflow:hidden;';

    var lignes = [];
    LANGUES.forEach(function (L) {
      var o = document.createElement('button');
      o.type = 'button';
      o.setAttribute('role', 'option');
      o.setAttribute('lang', L.c);
      o.style.cssText =
        'display:flex;align-items:center;justify-content:space-between;gap:12px;' +
        'width:100%;cursor:pointer;border:none;background:transparent;' +
        'padding:10px 12px;border-radius:10px;text-align:left;' +
        'font-family:' + police + ';font-size:13.5px;font-weight:600;color:#111827;';

      var nom = document.createElement('span');
      nom.textContent = L.nom;
      var coche = document.createElement('span');
      coche.textContent = '✓';
      coche.style.cssText = 'color:#16a34a;font-weight:900;font-size:13px;';
      o.appendChild(nom);
      o.appendChild(coche);

      o.addEventListener('mouseenter', function () { o.style.background = '#f3f4f6'; });
      o.addEventListener('mouseleave', function () { o.style.background = 'transparent'; });
      o.addEventListener('click', function () {
        fermer();
        if (L.c === courante) return;
        courante = L.c;
        retenir(L.c);
        peindre();
        var fait = false;
        if (typeof opts.sur === 'function') {
          try { fait = opts.sur(L.c) !== false; } catch (e) { fait = false; }
        }
        if (!fait) rechargerPropre();
      });

      lignes.push({ L: L, el: o, coche: coche });
      menu.appendChild(o);
    });

    function peindre() {
      var actuelle = LANGUES.filter(function (x) { return x.c === courante; })[0] || LANGUES[0];
      etiquette.textContent = actuelle.court;
      lignes.forEach(function (r) {
        var a = r.L.c === courante;
        r.el.setAttribute('aria-selected', a ? 'true' : 'false');
        r.coche.style.visibility = a ? 'visible' : 'hidden';
      });
    }

    var ouvert = false;
    function ouvrir() {
      ouvert = true; menu.style.display = 'flex';
      bouton.setAttribute('aria-expanded', 'true');
    }
    function fermer() {
      ouvert = false; menu.style.display = 'none';
      bouton.setAttribute('aria-expanded', 'false');
    }

    bouton.addEventListener('click', function (e) {
      e.stopPropagation();
      ouvert ? fermer() : ouvrir();
    });
    document.addEventListener('click', function () { if (ouvert) fermer(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && ouvert) fermer();
    });

    racine.appendChild(menu);
    racine.appendChild(bouton);
    document.body.appendChild(racine);
    peindre();

    return {
      element: racine,
      // Le panneau marchand connaît la langue de la boutique après connexion :
      // il l'annonce ici pour que le bouton dise la vérité.
      dire: function (l) {
        if (!LANGUES.some(function (x) { return x.c === l; })) return;
        courante = l; peindre();
      }
    };
  }

  window.msLangue = { poser: poser, langues: LANGUES, memoire: memoire };
})();
