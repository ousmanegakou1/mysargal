/* MySargal, catalogue de modeles de visuels 1080x1920 et interface de saisie. */
(function(){
  'use strict';

  var LANGUES=[
    {c:'fr',nom:'Français'},
    {c:'en',nom:'English'},
    {c:'es',nom:'Español'},
    {c:'wo',nom:'Wolof'}
  ];

  var MAX_SUR=24, MAX_TITRE=22, MAX_LIGNE=52;

  function langue(l){
    for(var i=0;i<LANGUES.length;i++){ if(LANGUES[i].c===l) return l; }
    return 'fr';
  }

  function T(map,l){
    if(!map) return '';
    var k=langue(l);
    return (map[k]!=null&&map[k]!=='')?map[k]:(map.fr||'');
  }

  function esc(s){
    return String(s==null?'':s)
      .replace(/&/g,'&amp;').replace(/</g,'&lt;')
      .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function coupe(s,n){
    s=(s==null?'':String(s));
    return s.length<=n?s:s.slice(0,n);
  }

  /* Le moteur de rendu peint sur une largeur fixe sans retour a la ligne :
     un depassement sortirait du cadre. Les libelles du catalogue tiennent
     deja dans les bornes, ce garde fou couvre les valeurs imprevisibles
     qui viennent de la boutique (devise longue, date verbeuse). */
  function sortie(o){
    return {
      sur: coupe(o.sur,MAX_SUR),
      titre1: coupe(o.titre1,MAX_TITRE),
      titre2: coupe(o.titre2,MAX_TITRE),
      lignes: (function(){
        var src=o.lignes||[], out=[], i;
        for(i=0;i<src.length&&out.length<2;i++){
          if(src[i]) out.push(coupe(src[i],MAX_LIGNE));
        }
        return out;
      })(),
      qrLegende: o.qrLegende||'',
      qrCible: o.qrCible==='cadeau'?'cadeau':'fidelite'
    };
  }

  function milliers(n){
    var s=String(Math.round(Number(n)||0)), out='', c=0, i;
    for(i=s.length-1;i>=0;i--){
      out=s.charAt(i)+out; c++;
      if(c%3===0&&i>0) out=' '+out;
    }
    return out;
  }

  /* La monnaie suit la boutique : une boutique de Nairobi affiche des
     shillings. On ne fabrique jamais un montant en dur, on delegue a ctx. */
  function argent(ctx,n){
    if(ctx&&typeof ctx.devise==='function'){
      try{ var r=ctx.devise(n); if(r) return String(r); }catch(e){}
    }
    return milliers(n);
  }

  function fdate(ctx,iso){
    if(!iso) return '';
    if(ctx&&typeof ctx.date==='function'){
      try{ var r=ctx.date(iso); if(r) return String(r); }catch(e){}
    }
    return String(iso);
  }

  function maj(s){ return String(s==null?'':s).toUpperCase(); }

  function rempl(s,a,b){
    return String(s).replace('{a}',a).replace('{b}',b);
  }

  var PERIODE={
    fr:{ab:'Du {a} au {b} seulement.',b:'Jusqu\'au {b} seulement.',a:'À partir du {a}.',n:'Pendant toute l\'opération.'},
    en:{ab:'From {a} to {b} only.',b:'Until {b} only.',a:'Starting {a}.',n:'For the whole operation.'},
    es:{ab:'Del {a} al {b} solamente.',b:'Hasta el {b} solamente.',a:'A partir del {a}.',n:'Durante toda la operación.'},
    wo:{ab:'Dale ci {a} ba {b} rekk.',b:'Ba {b} rekk.',a:'Dale ci {a}.',n:'Ci diiru promo bi rekk.'}
  };

  var LIMITE={
    fr:{d:'Offre valable jusqu\'au {b}.',n:'Offre valable en boutique.'},
    en:{d:'Offer valid until {b}.',n:'Offer valid in store.'},
    es:{d:'Oferta válida hasta el {b}.',n:'Oferta válida en la tienda.'},
    wo:{d:'Offre bi ba {b} rekk la.',n:'Offre bi am na ci botik bi.'}
  };

  function periode(l,ctx,iso1,iso2){
    var m=PERIODE[langue(l)], a=fdate(ctx,iso1), b=fdate(ctx,iso2);
    if(a&&b) return rempl(m.ab,a,b);
    if(b) return rempl(m.b,a,b);
    if(a) return rempl(m.a,a,b);
    return m.n;
  }

  function limite(l,ctx,iso){
    var m=LIMITE[langue(l)], b=fdate(ctx,iso);
    return b?rempl(m.d,'',b):m.n;
  }

  var QR_FIDELITE={
    fr:'Scannez pour rejoindre le programme',
    en:'Scan to join the loyalty program',
    es:'Escanea para unirte al programa',
    wo:'Scanne ngir bokk ci programme bi.'
  };
  var QR_CADEAU={
    fr:'Scannez pour offrir une carte cadeau',
    en:'Scan to offer a gift card',
    es:'Escanea para regalar una tarjeta',
    wo:'Scanne ngir may kart cadeau.'
  };
  var QR_ACHAT_CADEAU={
    fr:'Scannez pour acheter la carte cadeau',
    en:'Scan to buy the gift card',
    es:'Escanea para comprar la tarjeta',
    wo:'Scanne ngir jënd kart cadeau bi.'
  };

  var L_DEBUT={fr:'Date de début',en:'Start date',es:'Fecha de inicio',wo:'Fan wu ñuy tambali'};
  var L_FIN={fr:'Date de fin',en:'End date',es:'Fecha de fin',wo:'Fan wu muy jeex'};

  var SAISONS={
    fete_meres:{
      qr:'cadeau',
      fr:{sur:'FÊTE DES MÈRES',t1:'FAITES PLAISIR',t2:'À VOTRE MAMAN',l1:'Une carte cadeau, elle choisit son cadeau.'},
      en:{sur:'MOTHERS DAY',t1:'MAKE YOUR MUM',t2:'SMILE TODAY',l1:'A gift card, she picks what she loves.'},
      es:{sur:'DÍA DE LA MADRE',t1:'ALEGRA EL DÍA',t2:'DE TU MAMÁ',l1:'Una tarjeta regalo, ella elige su regalo.'},
      wo:{sur:'BËS BU YAAY YI',t1:'BEGAL SA YAAY',t2:'TEY JI',l1:'Kart cadeau, moom la tann li mu bëgg.'}
    },
    tabaski:{
      qr:'fidelite',
      fr:{sur:'TABASKI',t1:'BONNE FÊTE',t2:'DE TABASKI',l1:'Préparez la fête avec MySargal.'},
      en:{sur:'TABASKI',t1:'HAPPY TABASKI',t2:'',l1:'Get ready for the feast with MySargal.'},
      es:{sur:'TABASKI',t1:'FELIZ TABASKI',t2:'',l1:'Prepara la fiesta con MySargal.'},
      wo:{sur:'TABASKI',t1:'DEWENATI',t2:'CI TABASKI BI',l1:'Waajal Tabaski bi ak MySargal.'}
    },
    korite:{
      qr:'fidelite',
      fr:{sur:'KORITÉ',t1:'BONNE FÊTE',t2:'DE KORITÉ',l1:'Préparez la Korité avec MySargal.'},
      en:{sur:'KORITE',t1:'HAPPY KORITE',t2:'',l1:'Get ready for Korite with MySargal.'},
      es:{sur:'KORITÉ',t1:'FELIZ KORITÉ',t2:'',l1:'Prepara la Korité con MySargal.'},
      wo:{sur:'KORITE',t1:'DEWENATI',t2:'CI KORITE GI',l1:'Waajal Korite gi ak MySargal.'}
    },
    ramadan:{
      qr:'fidelite',
      fr:{sur:'RAMADAN',t1:'BON RAMADAN',t2:'À TOUS',l1:'Tout pour le ndogou, ici en boutique.'},
      en:{sur:'RAMADAN',t1:'BLESSED RAMADAN',t2:'TO EVERYONE',l1:'Everything for iftar, right here in store.'},
      es:{sur:'RAMADÁN',t1:'FELIZ RAMADÁN',t2:'PARA TODOS',l1:'Todo para el iftar, aquí en la tienda.'},
      wo:{sur:'KOOR GI',t1:'DEWENATI',t2:'CI KOOR GI',l1:'Lépp ngir ndogou bi, fii ci botik bi.'}
    },
    rentree:{
      qr:'fidelite',
      fr:{sur:'RENTRÉE SCOLAIRE',t1:'PRÊTS POUR',t2:'LA RENTRÉE',l1:'Tout pour l\'école, et des points en plus.'},
      en:{sur:'BACK TO SCHOOL',t1:'READY FOR',t2:'BACK TO SCHOOL',l1:'Everything for school, plus extra points.'},
      es:{sur:'VUELTA AL COLE',t1:'LISTOS PARA',t2:'LA VUELTA AL COLE',l1:'Todo para la escuela, y puntos extra.'},
      wo:{sur:'UBBI DAARA YI',t1:'WAAJAL',t2:'UBBI DAARA YI',l1:'Lépp ngir daara bi, ak poñ yu bare.'}
    },
    fin_annee:{
      qr:'cadeau',
      fr:{sur:'FIN D\'ANNÉE',t1:'LES FÊTES',t2:'COMMENCENT ICI',l1:'Cadeaux et points dans toute la boutique.'},
      en:{sur:'HOLIDAY SEASON',t1:'THE HOLIDAYS',t2:'START RIGHT HERE',l1:'Gifts and points all season long.'},
      es:{sur:'FIN DE AÑO',t1:'LAS FIESTAS',t2:'EMPIEZAN AQUÍ',l1:'Regalos y puntos en toda la tienda.'},
      wo:{sur:'JEEXITAL ATT MI',t1:'FÊTE YI',t2:'FII LAÑUY TAMBALI',l1:'Cadeau ak poñ, fii ci botik bi.'}
    },
    saint_valentin:{
      qr:'cadeau',
      fr:{sur:'SAINT VALENTIN',t1:'UN CADEAU POUR',t2:'CELUI QUE VOUS AIMEZ',l1:'Offrez une carte cadeau MySargal.'},
      en:{sur:'VALENTINES DAY',t1:'A GIFT FOR',t2:'THE ONE YOU LOVE',l1:'Give a MySargal gift card.'},
      es:{sur:'SAN VALENTÍN',t1:'UN REGALO PARA',t2:'QUIEN TÚ QUIERES',l1:'Regala una tarjeta MySargal.'},
      wo:{sur:'SAINT VALENTIN',t1:'CADEAU NGIR',t2:'KI NGA BËGG',l1:'Mayal ko kart cadeau MySargal.'}
    },
    fete_peres:{
      qr:'cadeau',
      fr:{sur:'FÊTE DES PÈRES',t1:'UN CADEAU POUR',t2:'VOTRE PAPA',l1:'Une carte cadeau, il choisit son cadeau.'},
      en:{sur:'FATHERS DAY',t1:'A GIFT FOR',t2:'YOUR DAD',l1:'A gift card, he picks what he likes.'},
      es:{sur:'DÍA DEL PADRE',t1:'UN REGALO PARA',t2:'TU PAPÁ',l1:'Una tarjeta regalo, él elige su regalo.'},
      wo:{sur:'BËS BU BAAY YI',t1:'CADEAU NGIR',t2:'SA BAAY',l1:'Kart cadeau, moom la tann li mu bëgg.'}
    }
  };

  var OCCASIONS=[
    {v:'fete_meres',t:'Fête des mères',tl:{fr:'Fête des mères',en:'Mothers day',es:'Día de la madre',wo:'Bës bu yaay yi'}},
    {v:'tabaski',t:'Tabaski',tl:{fr:'Tabaski',en:'Tabaski',es:'Tabaski',wo:'Tabaski'}},
    {v:'korite',t:'Korité',tl:{fr:'Korité',en:'Korite',es:'Korité',wo:'Korite'}},
    {v:'ramadan',t:'Ramadan',tl:{fr:'Ramadan',en:'Ramadan',es:'Ramadán',wo:'Koor gi'}},
    {v:'rentree',t:'Rentrée scolaire',tl:{fr:'Rentrée scolaire',en:'Back to school',es:'Vuelta al cole',wo:'Ubbi daara yi'}},
    {v:'fin_annee',t:'Fin d\'année',tl:{fr:'Fin d\'année',en:'Holiday season',es:'Fin de año',wo:'Jeexital att mi'}},
    {v:'saint_valentin',t:'Saint Valentin',tl:{fr:'Saint Valentin',en:'Valentines day',es:'San Valentín',wo:'Saint Valentin'}},
    {v:'fete_peres',t:'Fête des pères',tl:{fr:'Fête des pères',en:'Fathers day',es:'Día del padre',wo:'Bës bu baay yi'}}
  ];

  var LISTE=[

    {
      id:'fidelite',
      nom:{fr:'Fidélité',en:'Loyalty',es:'Fidelidad',wo:'Fidelité'},
      champs:[],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var d={
          fr:{t1:'ICI, VOTRE FIDÉLITÉ',t2:'EST RÉCOMPENSÉE',a:'Demandez votre carte MySargal en caisse.',b:'Chaque achat vous rapporte des points.'},
          en:{t1:'HERE, YOUR LOYALTY',t2:'IS REWARDED',a:'Ask for your MySargal card at the counter.',b:'Every purchase earns you points.'},
          es:{t1:'AQUÍ TU FIDELIDAD',t2:'TIENE RECOMPENSA',a:'Pide tu tarjeta MySargal en la caja.',b:'Cada compra te da puntos.'},
          wo:{t1:'FII SA FIDELITE',t2:'DAY JARIÑ',a:'Laajal sa kart MySargal ci kees bi.',b:'Jënd bu nekk dana la jox poñ.'}
        }[l];
        return sortie({
          sur:'',
          titre1:d.t1,
          titre2:d.t2,
          lignes:[d.a,d.b],
          qrLegende:T(QR_CADEAU,l),
          qrCible:'cadeau'
        });
      }
    },

    {
      id:'booster',
      nom:{fr:'Points doublés',en:'Points booster',es:'Puntos multiplicados',wo:'Poñ yu dooble'},
      champs:[
        {id:'multi',type:'choix',label:{fr:'Multiplicateur',en:'Multiplier',es:'Multiplicador',wo:'Multiplicateur'},defaut:2,options:[{v:2,t:'2x'},{v:3,t:'3x'}]},
        {id:'debut',type:'date',label:L_DEBUT,defaut:''},
        {id:'fin',type:'date',label:L_FIN,defaut:''}
      ],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var x=(Number(v&&v.multi)===3)?3:2;
        var d={
          fr:{s:'OFFRE LIMITÉE',t1:'VOS POINTS X'+x,t2:'À CHAQUE ACHAT',b:'Présentez votre carte MySargal en caisse.'},
          en:{s:'LIMITED OFFER',t1:'YOUR POINTS X'+x,t2:'ON EVERY PURCHASE',b:'Show your MySargal card at the counter.'},
          es:{s:'OFERTA LIMITADA',t1:'TUS PUNTOS X'+x,t2:'EN CADA COMPRA',b:'Muestra tu tarjeta MySargal en la caja.'},
          wo:{s:'DIIRU AY FAN REKK',t1:'SA POÑ YI X'+x,t2:'CI JËND BU NEKK',b:'Wonel sa kart MySargal ci kees bi.'}
        }[l];
        return sortie({
          sur:d.s,
          titre1:d.t1,
          titre2:d.t2,
          lignes:[periode(l,ctx,v&&v.debut,v&&v.fin),d.b],
          qrLegende:T(QR_FIDELITE,l),
          qrCible:'fidelite'
        });
      }
    },

    {
      id:'promo',
      nom:{fr:'Promotion',en:'Discount',es:'Promoción',wo:'Promo'},
      champs:[
        {id:'pct',type:'number',label:{fr:'Pourcentage de remise',en:'Discount percentage',es:'Porcentaje de descuento',wo:'Ñaata pour cent'},defaut:20,min:1,max:90},
        {id:'fin',type:'date',label:L_FIN,defaut:''}
      ],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var p=Math.round(Number(v&&v.pct));
        if(!p||p<1) p=20;
        if(p>90) p=90;
        var d={
          fr:{s:'PROMOTION',t1:'MOINS '+p+' POUR CENT',t2:'SUR TOUTE LA BOUTIQUE',b:'Cumulez vos points sur chaque achat.'},
          en:{s:'SPECIAL OFFER',t1:p+' PER CENT OFF',t2:'ON THE WHOLE STORE',b:'Collect points on every purchase.'},
          es:{s:'PROMOCIÓN',t1:p+' POR CIENTO MENOS',t2:'EN TODA LA TIENDA',b:'Acumula puntos en cada compra.'},
          wo:{s:'PROMO',t1:'WAÑI '+p+' POUR CENT',t2:'CI LEPP CI BOTIK BI',b:'Jënd bu nekk day yokk sa poñ yi.'}
        }[l];
        return sortie({
          sur:d.s,
          titre1:d.t1,
          titre2:d.t2,
          lignes:[limite(l,ctx,v&&v.fin),d.b],
          qrLegende:T(QR_FIDELITE,l),
          qrCible:'fidelite'
        });
      }
    },

    {
      id:'cadeau',
      nom:{fr:'Carte cadeau',en:'Gift card',es:'Tarjeta regalo',wo:'Kart cadeau'},
      champs:[
        {id:'montant',type:'choix',label:{fr:'Montant de la carte',en:'Card amount',es:'Importe de la tarjeta',wo:'Ñaata la kart bi'},defaut:10000,
         options:[{v:5000,t:'5 000'},{v:10000,t:'10 000'},{v:25000,t:'25 000'},{v:50000,t:'50 000'},{v:100000,t:'100 000'}]}
      ],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var m=Number(v&&v.montant); if(!m||m<0) m=10000;
        var d={
          fr:{s:'CARTE CADEAU',t1:'OFFREZ',a:'La carte cadeau MySargal, valable ici.',b:'Le bénéficiaire dépense quand il veut.'},
          en:{s:'GIFT CARD',t1:'GIVE',a:'The MySargal gift card, valid right here.',b:'They spend it whenever they want.'},
          es:{s:'TARJETA REGALO',t1:'REGALA',a:'La tarjeta regalo MySargal, válida aquí.',b:'La usa cuando quiera.'},
          wo:{s:'KART CADEAU',t1:'MAYAL',a:'Kart cadeau MySargal bi, fii lañu koy jëfandikoo.',b:'Ki nga ko may, day ko jëfandikoo ba mu bëgg.'}
        }[l];
        return sortie({
          sur:d.s,
          titre1:d.t1,
          titre2:maj(argent(ctx,m)),
          lignes:[d.a,d.b],
          qrLegende:T(QR_ACHAT_CADEAU,l),
          qrCible:'cadeau'
        });
      }
    },

    {
      id:'saison',
      nom:{fr:'Fête ou saison',en:'Season or holiday',es:'Fiesta o temporada',wo:'Fête yi'},
      champs:[
        {id:'occasion',type:'choix',label:{fr:'Occasion',en:'Occasion',es:'Ocasión',wo:'Fête bi'},defaut:'fete_meres',options:OCCASIONS},
        {id:'fin',type:'date',label:L_FIN,defaut:''}
      ],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var cle=(v&&v.occasion)||'fete_meres';
        var s=SAISONS[cle]||SAISONS.fete_meres;
        var d=s[l]||s.fr;
        return sortie({
          sur:d.sur,
          titre1:d.t1,
          titre2:d.t2,
          lignes:[d.l1,limite(l,ctx,v&&v.fin)],
          qrLegende:s.qr==='cadeau'?T(QR_ACHAT_CADEAU,l):T(QR_FIDELITE,l),
          qrCible:s.qr
        });
      }
    },

    {
      id:'reouverture',
      nom:{fr:'Réouverture',en:'Reopening',es:'Reapertura',wo:'Ubbiwaat'},
      champs:[
        {id:'date',type:'date',label:{fr:'Date de réouverture',en:'Reopening date',es:'Fecha de reapertura',wo:'Fan wu ñuy ubbiwaat'},defaut:''}
      ],
      contenu:function(v,ctx){
        var l=langue(ctx&&ctx.l);
        var j=fdate(ctx,v&&v.date);
        var d={
          fr:{s:'BONNE NOUVELLE',t1:'ON ROUVRE',pre:'LE ',sans:'TRÈS BIENTÔT',a:'Votre boutique vous attend de nouveau.',b:'Vos points MySargal sont toujours là.'},
          en:{s:'GOOD NEWS',t1:'WE REOPEN',pre:'ON ',sans:'VERY SOON',a:'Your shop is waiting for you again.',b:'Your MySargal points are still there.'},
          es:{s:'BUENA NOTICIA',t1:'REABRIMOS',pre:'EL ',sans:'MUY PRONTO',a:'Tu tienda te espera otra vez.',b:'Tus puntos MySargal siguen ahí.'},
          wo:{s:'XIBAAR BU BAAX',t1:'DANU UBBIWAAT',pre:'CI ',sans:'LÉEGI LÉEGI',a:'Sa botik bi da lay xaar.',b:'Sa poñ MySargal yi nekk na fa ba tey.'}
        }[l];
        return sortie({
          sur:d.s,
          titre1:d.t1,
          titre2:j?(d.pre+maj(j)):d.sans,
          lignes:[d.a,d.b],
          qrLegende:T(QR_FIDELITE,l),
          qrCible:'fidelite'
        });
      }
    }

  ];

  function parId(id){
    for(var i=0;i<LISTE.length;i++){ if(LISTE[i].id===id) return LISTE[i]; }
    return null;
  }

  /* Les libelles d'option restent une chaine simple pour rester conformes au
     contrat ; tl porte la version traduite quand elle existe. */
  function texteOption(opt,l){
    if(opt&&opt.tl) return T(opt.tl,l);
    return opt?String(opt.t):'';
  }

  function memeValeur(a,b){
    return String(a)===String(b);
  }

  function balise(champ,l,valeur){
    var idDom='msv-champ-'+champ.id;
    var base=' id="'+esc(idDom)+'" data-msv-champ="'+esc(champ.id)+'"';
    var i, opts, o, sel;
    if(champ.type==='choix'){
      opts='';
      for(i=0;i<champ.options.length;i++){
        o=champ.options[i];
        sel=memeValeur(o.v,valeur)?' selected':'';
        opts+='<option value="'+esc(o.v)+'"'+sel+'>'+esc(texteOption(o,l))+'</option>';
      }
      return '<select class="msv-select"'+base+'>'+opts+'</select>';
    }
    if(champ.type==='number'){
      return '<input class="msv-input" type="number"'+base+
        (champ.min!=null?' min="'+esc(champ.min)+'"':'')+
        (champ.max!=null?' max="'+esc(champ.max)+'"':'')+
        ' value="'+esc(valeur)+'">';
    }
    if(champ.type==='date'){
      return '<input class="msv-input" type="date"'+base+' value="'+esc(valeur)+'">';
    }
    return '<input class="msv-input" type="text"'+base+' value="'+esc(valeur)+'">';
  }

  function formulaire(templateId,l,valeursActuelles){
    var t=parId(templateId);
    if(!t||!t.champs||!t.champs.length) return '';
    var lg=langue(l), v=valeursActuelles||{}, html='', i, c, val;
    for(i=0;i<t.champs.length;i++){
      c=t.champs[i];
      val=(v[c.id]!=null&&v[c.id]!=='')?v[c.id]:c.defaut;
      if(val==null) val='';
      html+='<div class="msv-champ">'+
        '<label class="msv-label" for="msv-champ-'+esc(c.id)+'">'+esc(T(c.label,lg))+'</label>'+
        balise(c,lg,val)+
        '</div>';
    }
    return html;
  }

  function lire(templateId){
    var t=parId(templateId), v={}, i, c, el, brut, n, j, trouve;
    if(!t||!t.champs) return v;
    for(i=0;i<t.champs.length;i++){
      c=t.champs[i];
      el=(typeof document!=='undefined')?document.getElementById('msv-champ-'+c.id):null;
      brut=el?el.value:'';
      if(brut==null) brut='';
      brut=String(brut);

      if(c.type==='number'){
        n=parseFloat(brut);
        if(brut===''||isNaN(n)) n=Number(c.defaut);
        if(c.min!=null&&n<c.min) n=c.min;
        if(c.max!=null&&n>c.max) n=c.max;
        v[c.id]=n;
      }else if(c.type==='choix'){
        trouve=null;
        for(j=0;j<c.options.length;j++){
          if(memeValeur(c.options[j].v,brut)) trouve=c.options[j].v;
        }
        /* On rend la valeur typee de l'option, pas la chaine du DOM : les
           montants et multiplicateurs servent ensuite a des calculs. */
        v[c.id]=(trouve!=null)?trouve:c.defaut;
      }else{
        v[c.id]=(brut==='')?(c.defaut==null?'':c.defaut):brut;
      }
    }
    return v;
  }

  function optionsSelect(l){
    var lg=langue(l), html='', i;
    for(i=0;i<LISTE.length;i++){
      html+='<option value="'+esc(LISTE[i].id)+'">'+esc(T(LISTE[i].nom,lg))+'</option>';
    }
    return html;
  }

  window.msVisuelsTemplates={
    LANGUES:LANGUES,
    LISTE:LISTE,
    parId:parId,
    formulaire:formulaire,
    lire:lire,
    optionsSelect:optionsSelect
  };

})();
