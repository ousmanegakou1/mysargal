/*
  MySargal — moteur de rendu multi formats des visuels marchands.
  Expose window.msVisuelsRendu : FORMATS, planifier, qr, dessiner, charger, exporter.
  Le catalogue de messages est produit ailleurs : ici on ne reçoit qu'un objet `contenu` déja rempli.
*/
(function(){
  'use strict';

  var MONT = 'Montserrat, sans-serif';
  var INTER = 'Inter, sans-serif';

  var R = {};

  R.FORMATS = [
    {id:'story',   l:1080, h:1920, sortie:'image', nom:'Story verticale',    cible:'Instagram, Facebook, WhatsApp Statut'},
    {id:'tiktok',  l:1080, h:1920, sortie:'image', nom:'TikTok',             cible:'TikTok'},
    {id:'carre',   l:1080, h:1080, sortie:'image', nom:'Publication carrée', cible:'Instagram, Facebook'},
    {id:'paysage', l:1200, h:627,  sortie:'image', nom:'Bandeau paysage',    cible:'LinkedIn, X'},
    {id:'a5',      l:1748, h:2480, sortie:'pdf',   nom:'Flyer A5',           cible:'Impression comptoir'},
    {id:'a4',      l:2480, h:3508, sortie:'pdf',   nom:'Flyer A4',           cible:'Impression vitrine'}
  ];

  /* ------------------------------------------------------------------ */
  /* Palette                                                             */
  /* ------------------------------------------------------------------ */

  function hexA(h, a){
    h = String(h || '').replace('#','');
    if(h.length === 3){ h = h.charAt(0)+h.charAt(0)+h.charAt(1)+h.charAt(1)+h.charAt(2)+h.charAt(2); }
    var n = parseInt(h || '000000', 16);
    if(isNaN(n)){ n = 0; }
    return 'rgba('+((n>>16)&255)+','+((n>>8)&255)+','+(n&255)+','+a+')';
  }

  function palette(m){
    var br = (m && m.brand && typeof m.brand === 'object') ? m.brand : {};
    return {
      bg1: br.bg1 || '#06210f',
      bg2: br.bg2 || '#0c3f24',
      acc: br.accent || '#26d07c',
      or:  '#c9a24a'
    };
  }

  // Les rôles de couleur sont posés a la mise en page et résolus au dessin :
  // la géométrie reste ainsi vérifiable sans connaitre la marque du commerçant.
  function resoudre(role, pal){
    if(role === 'or') return pal.or;
    if(role === 'accent') return pal.acc;
    if(role === 'fond1') return pal.bg1;
    if(role === 'blanc78') return hexA('#ffffff', 0.78);
    if(role === 'blanc72') return hexA('#ffffff', 0.72);
    return '#ffffff';
  }

  /* ------------------------------------------------------------------ */
  /* Mesure de texte                                                     */
  /* ------------------------------------------------------------------ */

  // Une largeur approchée permet de valider la géométrie hors navigateur,
  // la mesure réelle du canvas prenant le relais des que le contexte existe.
  function largeurApprox(t, taille, poids, esp){
    t = String(t == null ? '' : t);
    var u = 0, i, c;
    for(i = 0; i < t.length; i++){
      c = t.charAt(i);
      if(c === ' '){ u += 0.28; }
      else if('ILijlt!.,\'|:;'.indexOf(c) >= 0){ u += 0.34; }
      else if(c >= '0' && c <= '9'){ u += 0.57; }
      else if('mwMW'.indexOf(c) >= 0){ u += 0.86; }
      else if(c !== c.toLowerCase() && c === c.toUpperCase()){ u += 0.68; }
      else { u += 0.54; }
    }
    var gras = (poids >= 700) ? 1.04 : 1;
    return u * taille * gras + (esp || 0) * Math.max(0, t.length - 1);
  }

  function mesureurCanvas(p){
    return function(t, taille, poids, fam, esp){
      t = String(t == null ? '' : t);
      try{
        p.font = poids + ' ' + Math.max(1, Math.round(taille)) + 'px ' + (fam === 'I' ? INTER : MONT);
        return p.measureText(t).width + (esp || 0) * Math.max(0, t.length - 1);
      }catch(e){
        return largeurApprox(t, taille, poids, esp);
      }
    };
  }

  function mesureurApproche(){
    return function(t, taille, poids, fam, esp){
      return largeurApprox(t, taille, poids, esp);
    };
  }

  function ajusterTaille(t, taille, poids, fam, esp, maxW, mes){
    var w = mes(t, taille, poids, fam, esp);
    if(w <= maxW || w <= 0) return taille;
    return taille * (maxW / w);
  }

  function couperBrut(mots, taille, poids, fam, esp, maxW, mes){
    var lignes = [], cur = '', i, essai;
    for(i = 0; i < mots.length; i++){
      essai = cur ? (cur + ' ' + mots[i]) : mots[i];
      if(mes(essai, taille, poids, fam, esp) <= maxW || !cur){ cur = essai; }
      else { lignes.push(cur); cur = mots[i]; }
    }
    if(cur) lignes.push(cur);
    return lignes;
  }

  function couper(t, taille, poids, fam, esp, maxW, mes){
    t = String(t == null ? '' : t).replace(/\s+/g, ' ').replace(/^\s|\s$/g, '');
    if(!t) return [];
    var mots = t.split(' ');
    var lignes = couperBrut(mots, taille, poids, fam, esp, maxW, mes);
    // Une coupe gloutonne laisse un mot seul en fin de paragraphe : on resserre
    // la colonne tant que le nombre de lignes ne change pas, ce qui les équilibre.
    if(lignes.length > 1){
      var w = maxW, i;
      for(i = 0; i < 14; i++){
        var essai = couperBrut(mots, taille, poids, fam, esp, w * 0.96, mes);
        if(essai.length !== lignes.length) break;
        lignes = essai;
        w = w * 0.96;
      }
    }
    // Un mot seul plus large que la colonne sortirait du cadre : on le tronque proprement.
    var sortie = [], j;
    for(j = 0; j < lignes.length; j++){
      var l = lignes[j];
      while(mes(l, taille, poids, fam, esp) > maxW && l.length > 2){ l = l.slice(0, l.length - 1); }
      sortie.push(l);
    }
    return sortie;
  }

  /* ------------------------------------------------------------------ */
  /* Mise en page                                                        */
  /* ------------------------------------------------------------------ */

  var CFG = {
    portrait: {u:1, margeH:0.115, margeV:0.085, logo:128, qr:0.39, remplissage:0.80, poids:[0.85,0.75,0.95,1.00,1.15]},
    carre:    {u:1, margeH:0.100, margeV:0.075, logo:88,  qr:0.30, remplissage:0.86, poids:[0.70,0.70,0.90,1.00,1.00]},
    presse:   {u:1, margeH:0.115, margeV:0.085, logo:118, qr:0.42, remplissage:0.85, poids:[0.80,0.75,0.95,1.00,1.10]}
  };

  function famille(fmt){
    if(fmt.id === 'a4' || fmt.id === 'a5' || fmt.sortie === 'pdf') return 'presse';
    if(fmt.l > fmt.h) return 'paysage';
    if(fmt.h / fmt.l < 1.25) return 'carre';
    return 'portrait';
  }

  function config(fmt){
    var f = famille(fmt);
    return CFG[f === 'presse' ? 'presse' : (f === 'carre' ? 'carre' : 'portrait')];
  }

  function normaliser(contenu){
    contenu = contenu || {};
    var lignes = [], src = contenu.lignes || [], i;
    for(i = 0; i < src.length; i++){
      var v = String(src[i] == null ? '' : src[i]).replace(/^\s+|\s+$/g, '');
      if(v) lignes.push(v);
    }
    function net(v){ return String(v == null ? '' : v).replace(/^\s+|\s+$/g, ''); }
    return {
      sur: net(contenu.sur),
      titre1: net(contenu.titre1) || 'ICI, VOTRE FIDÉLITÉ',
      titre2: net(contenu.titre2),
      lignes: lignes,
      qrLegende: net(contenu.qrLegende),
      qrCible: net(contenu.qrCible) || 'mysargal.com'
    };
  }

  function distribuer(blocs, y0, hDispo, libreMax){
    var N = 0, i;
    for(i = 0; i < blocs.length; i++){ N += blocs[i].h; }
    var libre = hDispo - N;
    if(libre < 0) libre = 0;
    // Un message court ne doit pas se transformer en composition trouée :
    // au dela d'un certain jeu, le surplus part en marge haute et basse.
    if(libreMax != null && libre > libreMax){
      y0 += (libre - libreMax) / 2;
      libre = libreMax;
    }
    var sp = 0;
    for(i = 0; i < blocs.length - 1; i++){ sp += blocs[i].poids; }
    var y = y0;
    for(i = 0; i < blocs.length; i++){
      blocs[i].faire(y);
      y += blocs[i].h;
      if(i < blocs.length - 1 && sp > 0){ y += libre * blocs[i].poids / sp; }
    }
    return N;
  }

  function sommeH(blocs){
    var N = 0, i;
    for(i = 0; i < blocs.length; i++){ N += blocs[i].h; }
    return N;
  }

  // Composition verticale commune aux formats portrait, carré et impression :
  // meme identité, seules les proportions et la place du QR changent.
  function pileVerticale(fmt, c, nom, mes, k){
    var W = fmt.l, H = fmt.h;
    var cfg = config(fmt);
    var s = (W / 1080) * cfg.u * k;
    var margeH = W * cfg.margeH, margeV = H * cfg.margeV;
    var maxW = W - 2 * margeH;
    var cx = W / 2;
    var items = [], blocs = [];

    function txt(texte, x, y, w, h, taille, poids, fam, role, esp, align){
      items.push({t:'txt', texte:texte, x:x, y:y, w:w, h:h, taille:taille, poids:poids,
                  fam:fam, role:role, esp:esp || 0, align:align || 'left', col:'c'});
    }

    /* Signature de marque */
    var tSig = 30 * s, espSig = 12 * s;
    var wSig = mes('MYSARGAL', tSig, 700, 'M', espSig);
    blocs.push({h:tSig, poids:cfg.poids[0], faire:function(y){
      txt('MYSARGAL', cx - wSig / 2, y, wSig, tSig, tSig, 700, 'M', 'or', espSig, 'center');
    }});

    /* Logo rond, deux anneaux */
    var rl = cfg.logo * s, anneau = 24 * s, dLogo = 2 * (rl + anneau);
    blocs.push({h:dLogo, poids:cfg.poids[1], faire:function(y){
      items.push({t:'logo', x:cx - rl - anneau, y:y, w:dLogo, h:dLogo,
                  cx:cx, cy:y + rl + anneau, r:rl, anneau:anneau, col:'c'});
    }});

    /* Nom de boutique et filet or */
    var nomT = String(nom || 'Ma boutique').slice(0, 28);
    var tNom = ajusterTaille(nomT, 66 * s, 800, 'M', 0, maxW, mes);
    var wNom = mes(nomT, tNom, 800, 'M', 0);
    var gNF = 34 * s, hFil = Math.max(2, 3 * s), wFil = 96 * s;
    blocs.push({h:tNom + gNF + hFil, poids:cfg.poids[2], faire:function(y){
      txt(nomT, cx - wNom / 2, y, wNom, tNom, tNom, 800, 'M', 'blanc', 0, 'center');
      items.push({t:'filet', x:cx - wFil / 2, y:y + tNom + gNF, w:wFil, h:hFil, col:'c'});
    }});

    /* Bloc message : surtitre optionnel, un ou deux titres, lignes de corps */
    var pieces = [], hMsg = 0;
    if(c.sur){
      var tSur = ajusterTaille(c.sur, 34 * s, 700, 'M', 8 * s, maxW, mes);
      pieces.push({r:'accent', texte:c.sur, taille:tSur, poids:700, fam:'M', esp:8 * s, apres:20 * s});
      hMsg += tSur + 20 * s;
    }
    var tTit = 84 * s;
    tTit = Math.min(tTit, ajusterTaille(c.titre1, tTit, 900, 'M', 0, maxW, mes));
    if(c.titre2){ tTit = Math.min(tTit, ajusterTaille(c.titre2, tTit, 900, 'M', 0, maxW, mes)); }
    pieces.push({r:'accent', texte:c.titre1, taille:tTit, poids:900, fam:'M', esp:0, apres:c.titre2 ? 12 * s : 0});
    hMsg += tTit + (c.titre2 ? 12 * s : 0);
    if(c.titre2){
      pieces.push({r:'blanc', texte:c.titre2, taille:tTit, poids:900, fam:'M', esp:0, apres:0});
      hMsg += tTit;
    }
    var tLig = 38 * s, lead = 1.42;
    var corps = [], j;
    for(j = 0; j < c.lignes.length; j++){
      var morceaux = couper(c.lignes[j], tLig, 500, 'I', 0, maxW, mes);
      for(var q = 0; q < morceaux.length; q++){ corps.push(morceaux[q]); }
    }
    if(corps.length){
      pieces[pieces.length - 1].apres = 32 * s;
      hMsg += 32 * s;
      for(j = 0; j < corps.length; j++){
        pieces.push({r:'blanc78', texte:corps[j], taille:tLig, poids:500, fam:'I', esp:0,
                     apres:(j < corps.length - 1) ? tLig * (lead - 1) : 0});
        hMsg += tLig + ((j < corps.length - 1) ? tLig * (lead - 1) : 0);
      }
    }
    blocs.push({h:hMsg, poids:cfg.poids[3], faire:function(y){
      var yy = y, i2;
      for(i2 = 0; i2 < pieces.length; i2++){
        var pc = pieces[i2];
        var w = mes(pc.texte, pc.taille, pc.poids, pc.fam, pc.esp);
        txt(pc.texte, cx - w / 2, yy, w, pc.taille, pc.taille, pc.poids, pc.fam, pc.r, pc.esp, 'center');
        yy += pc.taille + pc.apres;
      }
    }});

    /* Carte blanche portant le QR, plus sa légende */
    var cote = cfg.qr * W * k;
    var tLeg = 34 * s, gLeg = 26 * s;
    var legW = Math.min(maxW, cote * 1.7);
    var leg = c.qrLegende ? couper(c.qrLegende, tLeg, 500, 'I', 0, legW, mes) : [];
    var hLeg = leg.length ? (gLeg + leg.length * tLeg * 1.3 - tLeg * 0.3) : 0;
    blocs.push({h:cote + hLeg, poids:cfg.poids[4], faire:function(y){
      var pad = cote * 0.10;
      items.push({t:'carte', x:cx - cote / 2, y:y, w:cote, h:cote, rayon:cote * 0.072,
                  qx:cx - cote / 2 + pad, qy:y + pad, qt:cote - 2 * pad, col:'c'});
      var yy = y + cote + gLeg, i3;
      for(i3 = 0; i3 < leg.length; i3++){
        var w = mes(leg[i3], tLeg, 500, 'I', 0);
        txt(leg[i3], cx - w / 2, yy, w, tLeg, tLeg, 500, 'I', 'blanc72', 0, 'center');
        yy += tLeg * 1.3;
      }
    }});

    /* Pastille dorée */
    var tPas = 38 * s, wPas = Math.max(344 * s, mes('mysargal.com', tPas, 800, 'M', 0) + 70 * s);
    var hPas = 78 * s;
    blocs.push({h:hPas, poids:1, faire:function(y){
      items.push({t:'pastille', x:cx - wPas / 2, y:y, w:wPas, h:hPas, taille:tPas, texte:'mysargal.com', col:'c'});
    }});

    return {items:items, blocs:blocs, N:sommeH(blocs), y0:margeV, hDispo:H - 2 * margeV, s:s, cote:cote};
  }

  // Le 1200x627 impose deux colonnes : le message a gauche, le QR a droite.
  // Empiler la composition verticale y rendrait chaque bloc illisible.
  function pilePaysage(fmt, c, nom, mes, k){
    var W = fmt.l, H = fmt.h;
    var v = (H / 627) * k;
    var margeH = 58 * (H / 627), margeV = 62 * (H / 627);
    var items = [];

    function txt(texte, x, y, w, h, taille, poids, fam, role, esp, align, col){
      items.push({t:'txt', texte:texte, x:x, y:y, w:w, h:h, taille:taille, poids:poids,
                  fam:fam, role:role, esp:esp || 0, align:align || 'left', col:col});
    }

    /* Colonne de droite : carte QR, légende, pastille, le tout centré */
    var cote = 300 * (H / 627);
    var xD = W - margeH - cote;
    var tLegD = 22 * (H / 627), tPas = 30 * (H / 627), hPas = 58 * (H / 627);
    var legD = c.qrLegende ? couper(c.qrLegende, tLegD, 500, 'I', 0, cote, mes) : [];
    var wPas = Math.max(228 * (H / 627), mes('mysargal.com', tPas, 800, 'M', 0) + 56 * (H / 627));
    var blocsD = [];
    blocsD.push({h:cote, poids:1, faire:function(y){
      var pad = cote * 0.085;
      items.push({t:'carte', x:xD, y:y, w:cote, h:cote, rayon:cote * 0.072,
                  qx:xD + pad, qy:y + pad, qt:cote - 2 * pad, col:'d'});
    }});
    if(legD.length){
      blocsD.push({h:legD.length * tLegD * 1.32 - tLegD * 0.32, poids:1, faire:function(y){
        var yy = y, i;
        for(i = 0; i < legD.length; i++){
          var w = mes(legD[i], tLegD, 500, 'I', 0);
          txt(legD[i], xD + cote / 2 - w / 2, yy, w, tLegD, tLegD, 500, 'I', 'blanc72', 0, 'center', 'd');
          yy += tLegD * 1.32;
        }
      }});
    }
    blocsD.push({h:hPas, poids:1, faire:function(y){
      items.push({t:'pastille', x:xD + cote / 2 - wPas / 2, y:y, w:wPas, h:hPas,
                  taille:tPas, texte:'mysargal.com', col:'d'});
    }});
    var ND = sommeH(blocsD) + (blocsD.length - 1) * 20 * (H / 627);
    var yD = margeV + Math.max(0, (H - 2 * margeV - ND) / 2);
    distribuer(blocsD, yD, ND);

    /* Colonne de gauche : identité puis message */
    var xG = 74 * (H / 627);
    var gouttiere = 52 * (H / 627);
    var largeurG = xD - gouttiere - xG;
    var blocsG = [];

    var rl = 44 * v, anneau = 9 * v, dLogo = 2 * (rl + anneau);
    var tSig = 17 * v, espSig = 6 * v;
    var nomT = String(nom || 'Ma boutique').slice(0, 26);
    var xTexte = xG + dLogo + 22 * v;
    var maxNom = largeurG - dLogo - 22 * v;
    var tNom = ajusterTaille(nomT, 36 * v, 800, 'M', 0, maxNom, mes);
    var hEnt = Math.max(dLogo, tSig + 10 * v + tNom);
    blocsG.push({h:hEnt, poids:0.85, faire:function(y){
      items.push({t:'logo', x:xG, y:y + (hEnt - dLogo) / 2, w:dLogo, h:dLogo,
                  cx:xG + rl + anneau, cy:y + (hEnt - dLogo) / 2 + rl + anneau, r:rl, anneau:anneau, col:'g'});
      var yt = y + (hEnt - (tSig + 10 * v + tNom)) / 2;
      txt('MYSARGAL', xTexte, yt, mes('MYSARGAL', tSig, 700, 'M', espSig), tSig, tSig, 700, 'M', 'or', espSig, 'left', 'g');
      txt(nomT, xTexte, yt + tSig + 10 * v, mes(nomT, tNom, 800, 'M', 0), tNom, tNom, 800, 'M', 'blanc', 0, 'left', 'g');
    }});

    var hFil = Math.max(2, 3 * v), wFil = 84 * v;
    blocsG.push({h:hFil, poids:0.9, faire:function(y){
      items.push({t:'filet', x:xG, y:y, w:wFil, h:hFil, col:'g'});
    }});

    var pieces = [], hMsg = 0;
    if(c.sur){
      var tSur = ajusterTaille(c.sur, 22 * v, 700, 'M', 6 * v, largeurG, mes);
      pieces.push({r:'accent', texte:c.sur, taille:tSur, poids:700, fam:'M', esp:6 * v, apres:14 * v});
      hMsg += tSur + 14 * v;
    }
    var tTit = 48 * v;
    tTit = Math.min(tTit, ajusterTaille(c.titre1, tTit, 900, 'M', 0, largeurG, mes));
    if(c.titre2){ tTit = Math.min(tTit, ajusterTaille(c.titre2, tTit, 900, 'M', 0, largeurG, mes)); }
    pieces.push({r:'accent', texte:c.titre1, taille:tTit, poids:900, fam:'M', esp:0, apres:c.titre2 ? 9 * v : 0});
    hMsg += tTit + (c.titre2 ? 9 * v : 0);
    if(c.titre2){
      pieces.push({r:'blanc', texte:c.titre2, taille:tTit, poids:900, fam:'M', esp:0, apres:0});
      hMsg += tTit;
    }
    var tLig = 21 * v, corps = [], j;
    for(j = 0; j < c.lignes.length; j++){
      var mo = couper(c.lignes[j], tLig, 500, 'I', 0, largeurG, mes);
      for(var q = 0; q < mo.length; q++){ corps.push(mo[q]); }
    }
    if(corps.length){
      pieces[pieces.length - 1].apres = 22 * v;
      hMsg += 22 * v;
      for(j = 0; j < corps.length; j++){
        var ap = (j < corps.length - 1) ? tLig * 0.45 : 0;
        pieces.push({r:'blanc78', texte:corps[j], taille:tLig, poids:500, fam:'I', esp:0, apres:ap});
        hMsg += tLig + ap;
      }
    }
    blocsG.push({h:hMsg, poids:1, faire:function(y){
      var yy = y, i2;
      for(i2 = 0; i2 < pieces.length; i2++){
        var pc = pieces[i2];
        txt(pc.texte, xG, yy, mes(pc.texte, pc.taille, pc.poids, pc.fam, pc.esp), pc.taille,
            pc.taille, pc.poids, pc.fam, pc.r, pc.esp, 'left', 'g');
        yy += pc.taille + pc.apres;
      }
    }});

    return {items:items, blocs:blocsG, N:sommeH(blocsG), y0:margeV, hDispo:H - 2 * margeV,
            s:v, cote:cote, gauche:true};
  }

  /* Le facteur k ramène la pile naturelle a la hauteur utile du format. */
  function ajusterEchelle(fabrique, cible, hDispo){
    var k = 1, r = fabrique(1), i;
    for(i = 0; i < 6; i++){
      if(r.N > 0){
        var kv = k * cible / r.N;
        if(kv > 1.20) kv = 1.20;
        if(kv < 0.32) kv = 0.32;
        if(Math.abs(kv - k) / k < 0.006) break;
        k = kv;
      }
      r = fabrique(k);
    }
    if(r.N > hDispo && r.N > 0){
      k = k * hDispo / r.N * 0.98;
      r = fabrique(k);
    }
    return r;
  }

  /**
   * Calcule la géométrie complète d'un visuel.
   * infos : {nom: nom de boutique, mesure: fonction de mesure optionnelle}
   */
  R.planifier = function(format, contenu, infos){
    var fmt = format || R.FORMATS[0];
    infos = infos || {};
    var mes = infos.mesure || mesureurApproche();
    var c = normaliser(contenu);
    var fam = famille(fmt);
    var cfg = config(fmt);
    var res;

    if(fam === 'paysage'){
      var hDispoP = fmt.h - 2 * 62 * (fmt.h / 627);
      res = ajusterEchelle(function(k){ return pilePaysage(fmt, c, infos.nom, mes, k); },
                           hDispoP * 0.84, hDispoP);
      distribuer(res.blocs, res.y0, res.hDispo, res.N * 0.34);
    }else{
      var hDispo = fmt.h - 2 * fmt.h * cfg.margeV;
      res = ajusterEchelle(function(k){ return pileVerticale(fmt, c, infos.nom, mes, k); },
                           hDispo * cfg.remplissage, hDispo);
      distribuer(res.blocs, res.y0, res.hDispo, res.N * 0.46);
    }

    var inset = Math.round(Math.min(fmt.l, fmt.h) * (fam === 'paysage' ? 0.038 : 0.043));
    var logo = null, i;
    for(i = 0; i < res.items.length; i++){ if(res.items[i].t === 'logo'){ logo = res.items[i]; break; } }

    return {
      format: fmt,
      famille: fam,
      W: fmt.l,
      H: fmt.h,
      items: res.items,
      qrTaille: Math.round(res.cote * 0.86),
      cadre: {x:inset, y:inset, w:fmt.l - 2 * inset, h:fmt.h - 2 * inset,
              rayon: Math.round(inset * 0.74), trait: Math.max(2, Math.round(fmt.l / 540))},
      halo: {cx: logo ? logo.cx : fmt.l / 2, cy: logo ? logo.cy : fmt.h / 2,
             r: Math.max(fmt.l, fmt.h) * 0.36}
    };
  };

  /* ------------------------------------------------------------------ */
  /* Dessin                                                              */
  /* ------------------------------------------------------------------ */

  // roundRect n'existe pas partout : on trace le chemin nous mêmes en repli.
  function cheminArrondi(p, x, y, w, h, r){
    r = Math.min(r, w / 2, h / 2);
    if(p.roundRect){
      p.beginPath();
      try{ p.roundRect(x, y, w, h, r); return; }catch(e){}
    }
    p.beginPath();
    p.moveTo(x + r, y);
    p.lineTo(x + w - r, y);
    p.arcTo(x + w, y, x + w, y + r, r);
    p.lineTo(x + w, y + h - r);
    p.arcTo(x + w, y + h, x + w - r, y + h, r);
    p.lineTo(x + r, y + h);
    p.arcTo(x, y + h, x, y + h - r, r);
    p.lineTo(x, y + r);
    p.arcTo(x, y, x + r, y, r);
    p.closePath();
  }

  // letterSpacing est récent : sans lui on pose les lettres une par une.
  function texteEspace(p, t, x, y, esp, align){
    if(!esp){ p.textAlign = align; p.fillText(t, x, y); return; }
    var natif = false;
    try{ p.letterSpacing = esp + 'px'; natif = (p.letterSpacing === esp + 'px'); }catch(e){ natif = false; }
    if(natif){
      p.textAlign = align;
      // L'espacement natif ajoute un blanc après la dernière lettre :
      // on décale d'une demi valeur pour que le centrage optique reste juste.
      p.fillText(t, align === 'center' ? (x - esp / 2) : x, y);
      try{ p.letterSpacing = '0px'; }catch(e2){}
      return;
    }
    var total = 0, i;
    for(i = 0; i < t.length; i++){ total += p.measureText(t.charAt(i)).width + (i < t.length - 1 ? esp : 0); }
    var cur = (align === 'center') ? (x - total / 2) : x;
    p.textAlign = 'left';
    for(i = 0; i < t.length; i++){
      p.fillText(t.charAt(i), cur, y);
      cur += p.measureText(t.charAt(i)).width + esp;
    }
  }

  // Une adresse complete ne tient pas dans le carre blanc : on la coupe en
  // domaine et debut de chemin, ce qui suffit a la retaper.
  function adresseCourte(u){
    var t = String(u || 'mysargal.com').replace(/^https?:\/\//i, '').replace(/\/$/, '');
    var i = t.indexOf('/');
    if(i < 0) return [t, ''];
    var chemin = t.slice(i).split('?')[0];
    return [t.slice(0, i), chemin.length > 22 ? chemin.slice(0, 21) + '.' : chemin];
  }

  function peindre(p, plan, pal, logoImg, qrEl, c, adresse){
    var W = plan.W, H = plan.H;

    var fond = p.createLinearGradient(0, 0, 0, H);
    fond.addColorStop(0, pal.bg1);
    fond.addColorStop(0.5, pal.bg2);
    fond.addColorStop(1, pal.bg1);
    p.fillStyle = fond;
    p.fillRect(0, 0, W, H);

    var halo = p.createRadialGradient(plan.halo.cx, plan.halo.cy, plan.halo.r * 0.04,
                                      plan.halo.cx, plan.halo.cy, plan.halo.r);
    halo.addColorStop(0, hexA(pal.acc, 0.30));
    halo.addColorStop(1, hexA(pal.acc, 0));
    p.fillStyle = halo;
    p.fillRect(0, 0, W, H);

    p.strokeStyle = hexA(pal.or, 0.55);
    p.lineWidth = plan.cadre.trait;
    cheminArrondi(p, plan.cadre.x, plan.cadre.y, plan.cadre.w, plan.cadre.h, plan.cadre.rayon);
    p.stroke();

    p.textBaseline = 'alphabetic';

    var items = plan.items, i;
    for(i = 0; i < items.length; i++){
      var it = items[i];

      if(it.t === 'txt'){
        p.fillStyle = resoudre(it.role, pal);
        p.font = it.poids + ' ' + Math.max(1, Math.round(it.taille)) + 'px ' + (it.fam === 'I' ? INTER : MONT);
        var bx = (it.align === 'center') ? (it.x + it.w / 2) : it.x;
        texteEspace(p, it.texte, bx, it.y + it.taille * 0.78, it.esp, it.align === 'center' ? 'center' : 'left');
        continue;
      }

      if(it.t === 'logo'){
        var dessine = false;
        if(logoImg){
          try{
            p.save();
            p.beginPath();
            p.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
            p.closePath();
            p.clip();
            p.fillStyle = '#ffffff';
            p.fillRect(it.cx - it.r, it.cy - it.r, it.r * 2, it.r * 2);
            p.drawImage(logoImg, it.cx - it.r, it.cy - it.r, it.r * 2, it.r * 2);
            p.restore();
            dessine = true;
          }catch(e){ try{ p.restore(); }catch(e2){} }
        }
        if(!dessine){
          p.fillStyle = '#ffffff';
          p.beginPath();
          p.arc(it.cx, it.cy, it.r, 0, Math.PI * 2);
          p.fill();
          p.fillStyle = pal.bg1;
          p.font = '900 ' + Math.round(it.r * 1.08) + 'px ' + MONT;
          p.textAlign = 'center';
          p.textBaseline = 'middle';
          p.fillText(plan.initiale || 'M', it.cx, it.cy + it.r * 0.03);
          p.textBaseline = 'alphabetic';
        }
        p.strokeStyle = hexA(pal.acc, 0.6);
        p.lineWidth = Math.max(2, it.anneau * 0.21);
        p.beginPath();
        p.arc(it.cx, it.cy, it.r + it.anneau * 0.54, 0, Math.PI * 2);
        p.stroke();
        p.strokeStyle = hexA(pal.or, 0.5);
        p.lineWidth = Math.max(1, it.anneau * 0.09);
        p.beginPath();
        p.arc(it.cx, it.cy, it.r + it.anneau * 0.98, 0, Math.PI * 2);
        p.stroke();
        continue;
      }

      if(it.t === 'filet'){
        p.fillStyle = pal.or;
        p.fillRect(it.x, it.y, it.w, it.h);
        continue;
      }

      if(it.t === 'carte'){
        p.save();
        p.shadowColor = 'rgba(0,0,0,.35)';
        p.shadowBlur = it.w * 0.105;
        p.shadowOffsetY = it.w * 0.043;
        p.fillStyle = '#ffffff';
        cheminArrondi(p, it.x, it.y, it.w, it.h, it.rayon);
        p.fill();
        p.restore();
        if(qrEl){
          try{
            var lisse = p.imageSmoothingEnabled;
            p.imageSmoothingEnabled = false;
            p.drawImage(qrEl, it.qx, it.qy, it.qt, it.qt);
            p.imageSmoothingEnabled = lisse;
          }catch(e){ qrEl = null; }
        }
        if(!qrEl){
          // Repli lisible : sans bibliothèque QR le visuel reste exploitable.
          p.textAlign = 'center';
          p.fillStyle = pal.bg1;
          p.font = '800 ' + Math.round(it.w * 0.098) + 'px ' + MONT;
          var ad = adresseCourte(adresse);
          p.fillText(ad[0], it.x + it.w / 2, it.y + it.h * (ad[1] ? 0.46 : 0.55));
          if(ad[1]){
            p.font = '600 ' + Math.round(it.w * 0.075) + 'px ' + INTER;
            p.fillStyle = pal.bg2;
            p.fillText(ad[1], it.x + it.w / 2, it.y + it.h * 0.60);
          }
        }
        continue;
      }

      if(it.t === 'pastille'){
        p.fillStyle = pal.or;
        cheminArrondi(p, it.x, it.y, it.w, it.h, it.h / 2);
        p.fill();
        p.fillStyle = pal.bg1;
        p.font = '800 ' + Math.round(it.taille) + 'px ' + MONT;
        p.textAlign = 'center';
        p.textBaseline = 'middle';
        p.fillText(it.texte, it.x + it.w / 2, it.y + it.h / 2 + it.h * 0.02);
        p.textBaseline = 'alphabetic';
      }
    }
  }

  /* ------------------------------------------------------------------ */
  /* QR et logo                                                          */
  /* ------------------------------------------------------------------ */

  R.qr = function(url, taille){
    return new Promise(function(res){
      try{
        if(!window.QRCode || typeof document === 'undefined' || !document.body){ res(null); return; }
        var t = Math.max(120, Math.min(1400, Math.round(taille || 340)));
        var boite = document.createElement('div');
        boite.style.position = 'fixed';
        boite.style.left = '-9999px';
        boite.style.top = '0';
        document.body.appendChild(boite);
        new window.QRCode(boite, {
          text: String(url || 'https://mysargal.com'),
          width: t, height: t,
          colorDark: '#0a0f08', colorLight: '#ffffff',
          correctLevel: (window.QRCode.CorrectLevel ? window.QRCode.CorrectLevel.M : 0)
        });
        var essais = 0;
        var lire = function(){
          essais++;
          var el = boite.querySelector('img') || boite.querySelector('canvas');
          var pret = el && (el.tagName === 'CANVAS' || (el.complete && el.naturalWidth > 0));
          if(pret || essais > 40){
            try{ document.body.removeChild(boite); }catch(e){}
            res(pret ? el : null);
            return;
          }
          setTimeout(lire, 50);
        };
        setTimeout(lire, 40);
      }catch(e){ res(null); }
    });
  };

  function chargerLogo(m){
    return new Promise(function(res){
      var src = (m && (m.logo_base64 || m.logo_url)) || '';
      if(!src){ res(null); return; }
      try{
        var img = new Image();
        img.crossOrigin = 'anonymous';
        var fini = false;
        img.onload = function(){ if(!fini){ fini = true; res(img); } };
        img.onerror = function(){ if(!fini){ fini = true; res(null); } };
        img.src = src;
        setTimeout(function(){ if(!fini){ fini = true; res(null); } }, 4000);
      }catch(e){ res(null); }
    });
  }

  function polices(){
    try{
      if(typeof document !== 'undefined' && document.fonts && document.fonts.load){
        return Promise.all([
          document.fonts.load('900 80px Montserrat'),
          document.fonts.load('800 60px Montserrat'),
          document.fonts.load('500 40px Inter')
        ])['catch'](function(){ return null; });
      }
    }catch(e){}
    return Promise.resolve(null);
  }

  R.dessiner = function(format, contenu, ctx){
    var fmt = format || R.FORMATS[0];
    ctx = ctx || {};
    var m = ctx.m || {};
    var c = normaliser(contenu);
    return polices().then(function(){
      var cv = document.createElement('canvas');
      cv.width = fmt.l;
      cv.height = fmt.h;
      var p = cv.getContext('2d');
      var plan = R.planifier(fmt, c, {nom: m.name, mesure: mesureurCanvas(p)});
      plan.initiale = (String(m.name || 'M').replace(/^\s+/, '').charAt(0) || 'M').toUpperCase();
      return Promise.all([chargerLogo(m), R.qr(ctx.qrUrl || 'https://mysargal.com', plan.qrTaille)])
        .then(function(r){
          peindre(p, plan, palette(m), r[0], r[1], c, ctx.qrUrl);
          return cv;
        });
    });
  };

  /* ------------------------------------------------------------------ */
  /* Chargement paresseux des bibliothèques                              */
  /* ------------------------------------------------------------------ */

  var URL_JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
  var URL_JSZIP = 'https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js';

  var enCours = {};

  // Une bibliothèque de PDF ne doit pas peser sur le démarrage du panneau :
  // on ne l'injecte qu'au moment ou un marchand demande vraiment un flyer.
  R.charger = function(url, testePresence){
    try{ if(typeof testePresence === 'function' && testePresence()) return Promise.resolve(true); }catch(e){}
    if(enCours[url]) return enCours[url];
    var pr = new Promise(function(res, rej){
      try{
        var s = document.createElement('script');
        var fini = false;
        s.src = url;
        s.async = true;
        s.onload = function(){
          if(fini) return;
          fini = true;
          var ok = true;
          try{ ok = (typeof testePresence !== 'function') || !!testePresence(); }catch(e2){ ok = false; }
          ok ? res(true) : rej(new Error('bibliothèque absente'));
        };
        s.onerror = function(){ if(!fini){ fini = true; rej(new Error('chargement impossible')); } };
        document.head.appendChild(s);
        setTimeout(function(){ if(!fini){ fini = true; rej(new Error('délai dépassé')); } }, 15000);
      }catch(e3){ rej(e3); }
    });
    enCours[url] = pr;
    pr['catch'](function(){ delete enCours[url]; });
    return pr;
  };

  function jsPDFPresent(){ return !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF); }
  function jsZipPresent(){ return !!window.JSZip; }

  /* ------------------------------------------------------------------ */
  /* Export                                                              */
  /* ------------------------------------------------------------------ */

  var MM = {a5:[148, 210], a4:[210, 297]};

  function versBlob(cv){
    return new Promise(function(res, rej){
      try{
        if(cv.toBlob){
          cv.toBlob(function(b){ b ? res(b) : rej(new Error('image vide')); }, 'image/png');
          return;
        }
        var d = cv.toDataURL('image/png').split(',')[1];
        var bin = atob(d), n = bin.length, u8 = new Uint8Array(n), i;
        for(i = 0; i < n; i++){ u8[i] = bin.charCodeAt(i); }
        res(new Blob([u8], {type:'image/png'}));
      }catch(e){ rej(e); }
    });
  }

  function telecharger(blob, nom){
    var href = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = href;
    a.download = nom;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(function(){
      try{ document.body.removeChild(a); }catch(e){}
      try{ URL.revokeObjectURL(href); }catch(e2){}
    }, 4000);
  }

  function pdfBlob(travail){
    var J = (window.jspdf && window.jspdf.jsPDF) || window.jsPDF;
    if(!J) throw new Error('jsPDF absent');
    var id = travail.format && travail.format.id;
    var dim = MM[id];
    if(!dim){
      // Le canvas est rendu a 300 points par pouce : la taille physique s'en déduit.
      dim = [travail.canvas.width / 300 * 25.4, travail.canvas.height / 300 * 25.4];
    }
    var doc = new J({orientation: (dim[1] >= dim[0]) ? 'portrait' : 'landscape', unit:'mm', format:[dim[0], dim[1]]});
    doc.addImage(travail.canvas.toDataURL('image/png'), 'PNG', 0, 0, dim[0], dim[1], undefined, 'FAST');
    return doc.output('blob');
  }

  function repliPng(travaux){
    var chaine = Promise.resolve();
    travaux.forEach(function(t, idx){
      chaine = chaine.then(function(){
        return versBlob(t.canvas).then(function(b){
          telecharger(b, (t.nom || 'mysargal-visuel') + '.png');
          return new Promise(function(r){ setTimeout(r, idx < travaux.length - 1 ? 400 : 0); });
        });
      });
    });
    return chaine;
  }

  function exportUnique(t, options){
    if(t.format && t.format.sortie === 'pdf'){
      return R.charger(URL_JSPDF, jsPDFPresent).then(function(){
        var b = pdfBlob(t);
        telecharger(b, (t.nom || 'mysargal-flyer') + '.pdf');
        return {mode:'fichier', nb:1};
      })['catch'](function(){
        return repliPng([t]).then(function(){ return {mode:'fichier', nb:1, degrade:true}; });
      });
    }
    return versBlob(t.canvas).then(function(b){
      var nom = (t.nom || 'mysargal-visuel') + '.png';
      var fichier = null;
      try{ fichier = new File([b], nom, {type:'image/png'}); }catch(e){}
      var partageable = false;
      try{
        partageable = !!(options.partage && fichier && navigator.share && navigator.canShare &&
                         navigator.canShare({files:[fichier]}));
      }catch(e2){ partageable = false; }
      if(partageable){
        return navigator.share({files:[fichier], title:'MySargal'}).then(function(){
          return {mode:'partage', nb:1};
        })['catch'](function(err){
          if(err && err.name === 'AbortError') return {mode:'partage', nb:1, annule:true};
          telecharger(b, nom);
          return {mode:'fichier', nb:1};
        });
      }
      telecharger(b, nom);
      return {mode:'fichier', nb:1};
    });
  }

  function exportZip(travaux){
    var besoinPdf = false, i;
    for(i = 0; i < travaux.length; i++){
      if(travaux[i].format && travaux[i].format.sortie === 'pdf'){ besoinPdf = true; break; }
    }
    return R.charger(URL_JSZIP, jsZipPresent).then(function(){
      if(!besoinPdf) return true;
      return R.charger(URL_JSPDF, jsPDFPresent)['catch'](function(){ return false; });
    }).then(function(pdfOk){
      var zip = new window.JSZip();
      var degrade = false;
      var chaine = Promise.resolve();
      travaux.forEach(function(t){
        chaine = chaine.then(function(){
          var base = t.nom || 'mysargal-visuel';
          if(t.format && t.format.sortie === 'pdf' && pdfOk !== false){
            try{
              zip.file(base + '.pdf', pdfBlob(t));
              return null;
            }catch(e){ degrade = true; }
          }else if(t.format && t.format.sortie === 'pdf'){
            degrade = true;
          }
          return versBlob(t.canvas).then(function(b){ zip.file(base + '.png', b); });
        });
      });
      return chaine.then(function(){
        return zip.generateAsync({type:'blob'});
      }).then(function(b){
        telecharger(b, 'mysargal-visuels.zip');
        var r = {mode:'zip', nb:travaux.length};
        if(degrade) r.degrade = true;
        return r;
      });
    })['catch'](function(){
      return repliPng(travaux).then(function(){
        return {mode:'fichier', nb:travaux.length, degrade:true};
      });
    });
  }

  R.exporter = function(travaux, options){
    travaux = travaux || [];
    options = options || {};
    if(!travaux.length) return Promise.resolve({mode:'fichier', nb:0});
    if(travaux.length === 1) return exportUnique(travaux[0], options);
    return exportZip(travaux);
  };

  window.msVisuelsRendu = R;

})();
