/* ═══════════════════════════════════════════════════════════════════
   MySargal — générateur de visuels et de flyers

   Assemble deux modules qui ne se connaissent pas : le catalogue de
   messages (ms-visuels-templates.js) et le moteur de rendu multi
   formats (ms-visuels-rendu.js). Ce fichier ne dessine rien et ne
   rédige rien, il ne fait que tenir l'interface entre les deux.

   La page appelle msVisuels.ouvrir(source) où source est une fonction
   rendant le contexte de la boutique. Ce détour existe parce que la
   variable MERCHANT vit dans la portée d'un bloc script du panneau et
   n'est pas accessible depuis un fichier séparé.

   msStatusImage et msPrintPoster restent en place et intacts : ce
   générateur s'ajoute à côté, il ne les remplace pas.
   ═══════════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  var LIB = {
    fr: { titre: 'Visuels et flyers', modele: 'Message', langue: 'Langue du visuel',
          formats: 'Formats a generer', generer: 'Generer', fermer: 'Fermer',
          attente: 'Generation en cours...', aucun: 'Choisis au moins un format',
          fini: 'Termine', partage: 'Visuel partage', zip: 'Archive telechargee',
          degrade: 'Bibliotheque indisponible, image PNG a la place' },
    en: { titre: 'Visuals and flyers', modele: 'Message', langue: 'Visual language',
          formats: 'Formats to generate', generer: 'Generate', fermer: 'Close',
          attente: 'Generating...', aucun: 'Pick at least one format',
          fini: 'Done', partage: 'Visual shared', zip: 'Archive downloaded',
          degrade: 'Library unavailable, PNG image instead' },
    es: { titre: 'Visuales y folletos', modele: 'Mensaje', langue: 'Idioma del visual',
          formats: 'Formatos a generar', generer: 'Generar', fermer: 'Cerrar',
          attente: 'Generando...', aucun: 'Elige al menos un formato',
          fini: 'Listo', partage: 'Visual compartido', zip: 'Archivo descargado',
          degrade: 'Biblioteca no disponible, imagen PNG en su lugar' },
    wo: { titre: 'Visuels ak flyers', modele: 'Bataaxal', langue: 'Lakk bu visuel bi',
          formats: 'Formats yi nga bëgg', generer: 'Defal ko', fermer: 'Tëj',
          attente: 'Mungi defu...', aucun: 'Tannal benn format doonte',
          fini: 'Noppi na', partage: 'Visuel bi jottali nañu ko', zip: 'Archive bi wacc na',
          degrade: 'Bibliothèque bi amul, PNG lañu jël' }
  };
  function L(l) { return LIB[l] || LIB.fr; }

  var CSS = [
    '.msv-fond{position:fixed;inset:0;z-index:100000;background:rgba(4,10,6,.72);backdrop-filter:blur(6px);display:flex;align-items:flex-end;justify-content:center}',
    '@media(min-width:640px){.msv-fond{align-items:center}}',
    '.msv-boite{width:100%;max-width:520px;max-height:92vh;overflow:auto;background:var(--s2,#0e1a12);',
    'border:1px solid var(--b1,rgba(255,255,255,.12));border-radius:22px 22px 0 0;padding:20px 18px calc(20px + env(safe-area-inset-bottom))}',
    '@media(min-width:640px){.msv-boite{border-radius:22px}}',
    '.msv-tete{display:flex;align-items:center;justify-content:space-between;margin-bottom:16px}',
    '.msv-titre{font-family:Montserrat,sans-serif;font-weight:900;font-size:1.05rem;color:var(--tx,#fff)}',
    '.msv-x{border:none;background:transparent;color:var(--tx3,#8a958d);font-size:1.5rem;line-height:1;cursor:pointer;padding:0 4px}',
    '.msv-champ{margin-bottom:13px}',
    '.msv-label{display:block;font-size:.70rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--tx3,#8a958d);margin-bottom:6px}',
    '.msv-input,.msv-select{width:100%;height:46px;padding:0 12px;background:var(--s3,#132a1c);color:var(--tx,#fff);',
    'border:1.5px solid var(--b1,rgba(255,255,255,.12));border-radius:12px;font-family:inherit;font-size:.88rem;outline:none}',
    '.msv-input:focus,.msv-select:focus{border-color:var(--green2,#26d07c)}',
    '.msv-fmts{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px}',
    '@media(max-width:400px){.msv-fmts{grid-template-columns:1fr}}',
    '.msv-fmt{display:flex;align-items:flex-start;gap:9px;padding:11px 12px;cursor:pointer;',
    'background:var(--s3,#132a1c);border:1.5px solid var(--b1,rgba(255,255,255,.12));border-radius:13px}',
    '.msv-fmt.on{border-color:var(--green2,#26d07c);background:rgba(38,208,124,.10)}',
    '.msv-fmt input{margin:2px 0 0;accent-color:var(--green2,#26d07c);flex:none}',
    '.msv-fmt-n{font-size:.80rem;font-weight:700;color:var(--tx,#fff);line-height:1.25}',
    '.msv-fmt-c{font-size:.66rem;color:var(--tx3,#8a958d);line-height:1.3;margin-top:2px}',
    '.msv-fmt-d{font-size:.62rem;color:var(--tx3,#8a958d);opacity:.75;margin-top:1px}',
    '.msv-go{width:100%;height:52px;border:none;border-radius:26px;cursor:pointer;',
    'background:var(--green2,#26d07c);color:#04140a;font-family:Montserrat,sans-serif;font-weight:900;font-size:.95rem}',
    '.msv-go[disabled]{opacity:.55;cursor:default}'
  ].join('');

  function poserStyle() {
    if (document.getElementById('msv-style')) return;
    var s = document.createElement('style');
    s.id = 'msv-style';
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  function ech(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Les formats cochés par défaut sont ceux qu'un commerçant utilise chaque
  // semaine. Cocher les six ferait fabriquer six fichiers pour rien, sur un
  // téléphone et souvent en connexion mesurée.
  var DEFAUTS = { story: true };

  var ETAT = { ouvert: false, langue: 'fr', modele: 'fidelite' };

  function ouvrir(source) {
    if (ETAT.ouvert) return;
    var T = window.msVisuelsTemplates, R = window.msVisuelsRendu;
    if (!T || !R) { avertir('Generateur indisponible'); return; }

    var src = (typeof source === 'function') ? source() : (source || {});
    var toast = src.toast || function () {};
    poserStyle();
    ETAT.ouvert = true;

    try { ETAT.langue = src.langue || localStorage.getItem('ms_lang') || 'fr'; } catch (e) {}
    if (!LIB[ETAT.langue]) ETAT.langue = 'fr';

    var t = L(ETAT.langue);
    var fond = document.createElement('div');
    fond.className = 'msv-fond';
    fond.innerHTML =
      '<div class="msv-boite" role="dialog" aria-modal="true">' +
        '<div class="msv-tete">' +
          '<div class="msv-titre">' + ech(t.titre) + '</div>' +
          '<button type="button" class="msv-x" id="msv-fermer" aria-label="' + ech(t.fermer) + '">&times;</button>' +
        '</div>' +
        '<div class="msv-champ">' +
          '<label class="msv-label" for="msv-modele">' + ech(t.modele) + '</label>' +
          '<select class="msv-select" id="msv-modele">' + T.optionsSelect(ETAT.langue) + '</select>' +
        '</div>' +
        '<div id="msv-form"></div>' +
        '<div class="msv-champ">' +
          '<label class="msv-label" for="msv-langue">' + ech(t.langue) + '</label>' +
          '<select class="msv-select" id="msv-langue">' +
            T.LANGUES.map(function (x) {
              return '<option value="' + x.c + '"' + (x.c === ETAT.langue ? ' selected' : '') + '>' + ech(x.nom) + '</option>';
            }).join('') +
          '</select>' +
        '</div>' +
        '<label class="msv-label">' + ech(t.formats) + '</label>' +
        '<div class="msv-fmts" id="msv-fmts">' +
          R.FORMATS.map(function (f) {
            var on = !!DEFAUTS[f.id];
            return '<label class="msv-fmt' + (on ? ' on' : '') + '" data-f="' + f.id + '">' +
                   '<input type="checkbox" value="' + f.id + '"' + (on ? ' checked' : '') + '/>' +
                   '<span><span class="msv-fmt-n">' + ech(f.nom) + '</span>' +
                   '<span class="msv-fmt-c">' + ech(f.cible) + '</span>' +
                   '<span class="msv-fmt-d">' + f.l + ' x ' + f.h + (f.sortie === 'pdf' ? ' PDF' : '') + '</span></span></label>';
          }).join('') +
        '</div>' +
        '<button type="button" class="msv-go" id="msv-go">' + ech(t.generer) + '</button>' +
      '</div>';
    document.body.appendChild(fond);

    function fermer() { ETAT.ouvert = false; try { fond.remove(); } catch (e) {} }
    fond.querySelector('#msv-fermer').addEventListener('click', fermer);
    fond.addEventListener('click', function (e) { if (e.target === fond) fermer(); });

    var selModele = fond.querySelector('#msv-modele');
    var selLangue = fond.querySelector('#msv-langue');
    var zoneForm = fond.querySelector('#msv-form');

    function peindreForm() {
      ETAT.modele = selModele.value;
      // On relit les valeurs avant de redessiner : changer de langue ne doit
      // pas effacer un montant ou une date déja saisis.
      var v = {};
      try { v = T.lire(ETAT.modele); } catch (e) {}
      zoneForm.innerHTML = T.formulaire(ETAT.modele, ETAT.langue, v) || '';
    }
    selModele.addEventListener('change', peindreForm);
    selLangue.addEventListener('change', function () {
      ETAT.langue = selLangue.value;
      var v = {};
      try { v = T.lire(ETAT.modele); } catch (e) {}
      selModele.innerHTML = T.optionsSelect(ETAT.langue);
      selModele.value = ETAT.modele;
      zoneForm.innerHTML = T.formulaire(ETAT.modele, ETAT.langue, v) || '';
      var n = L(ETAT.langue);
      fond.querySelector('.msv-titre').textContent = n.titre;
      fond.querySelector('#msv-go').textContent = n.generer;
    });
    peindreForm();

    fond.querySelector('#msv-fmts').addEventListener('change', function (e) {
      var lab = e.target.closest ? e.target.closest('.msv-fmt') : null;
      if (lab) lab.classList.toggle('on', e.target.checked);
    });

    var bouton = fond.querySelector('#msv-go');
    bouton.addEventListener('click', function () {
      var n = L(ETAT.langue);
      var choisis = [].slice.call(fond.querySelectorAll('#msv-fmts input:checked')).map(function (i) { return i.value; });
      if (!choisis.length) { toast(n.aucun, 'warn'); return; }

      bouton.disabled = true;
      bouton.textContent = n.attente;
      generer(src, choisis, ETAT.modele, ETAT.langue).then(function (r) {
        var msg = r.mode === 'partage' ? n.partage : (r.mode === 'zip' ? n.zip : n.fini);
        if (r.degrade) msg = n.degrade;
        toast(msg, 'ok');
        fermer();
      }).catch(function (err) {
        toast((err && err.message) || 'Erreur', 'err');
        bouton.disabled = false;
        bouton.textContent = n.generer;
      });
    });
  }

  function avertir(m) { if (typeof window.toast === 'function') window.toast(m, 'err'); }

  // Une date ISO se lit differemment selon la langue : le flyer d'une boutique
  // de Nairobi ne doit pas afficher un format francais.
  function dateLisible(iso, l) {
    if (!iso) return '';
    var loc = { fr: 'fr-FR', en: 'en-GB', es: 'es-ES', wo: 'fr-FR' }[l] || 'fr-FR';
    try {
      var d = new Date(iso + 'T12:00:00');
      if (isNaN(d.getTime())) return String(iso);
      return d.toLocaleDateString(loc, { day: 'numeric', month: 'long' });
    } catch (e) { return String(iso); }
  }

  function generer(src, formats, modeleId, langue) {
    var T = window.msVisuelsTemplates, R = window.msVisuelsRendu;
    var m = src.m || {};
    var base = src.base || 'https://mysargal.com';

    var ctx = {
      m: m,
      l: langue,
      devise: src.devise || function (n) { return String(n); },
      date: function (iso) { return dateLisible(iso, langue); }
    };

    var modele = null;
    for (var i = 0; i < T.LISTE.length; i++) if (T.LISTE[i].id === modeleId) modele = T.LISTE[i];
    if (!modele) return Promise.reject(new Error('Modele inconnu'));

    var v = {};
    try { v = T.lire(modeleId); } catch (e) {}
    var contenu = modele.contenu(v, ctx);

    // Ces deux adresses sont celles que msPrintPoster imprime deja : un QR
    // scanne depuis un flyer et un QR scanne depuis une story doivent mener
    // au meme endroit, sinon les statistiques se separent sans raison.
    var qrUrl = (contenu.qrCible === 'cadeau')
      ? (base + '/buy-giftcard.html?merchant=' + encodeURIComponent(m.id || ''))
      : (base + '/join.html?merchant=' + encodeURIComponent(m.id || '') + '&n=' + encodeURIComponent(m.name || ''));

    var travaux = [];
    var chaine = Promise.resolve();
    R.FORMATS.forEach(function (f) {
      if (formats.indexOf(f.id) < 0) return;
      chaine = chaine.then(function () {
        return R.dessiner(f, contenu, { m: m, qrUrl: qrUrl }).then(function (cv) {
          travaux.push({ format: f, canvas: cv, nom: 'mysargal-' + modeleId + '-' + f.id });
        });
      });
    });

    return chaine.then(function () {
      if (!travaux.length) throw new Error('Rien a generer');
      return R.exporter(travaux, { partage: true });
    });
  }

  window.msVisuels = { ouvrir: ouvrir, LIB: LIB };
})();
