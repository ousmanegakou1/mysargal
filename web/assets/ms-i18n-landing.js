/* ============================================================
   MySargal — traduction de la page d'accueil et de l'inscription

   Même mécanique que ms-i18n.js : on traduit le rendu, la clé est la phrase
   française, une phrase absente s'affiche en français plutôt que de casser.

   Particularité : c'est de la copie commerciale, très marquée Afrique de
   l'Ouest. Certaines phrases sont ADAPTÉES et non traduites mot à mot —
   « commerçants d'Afrique de l'Ouest » devient « independent shops », les
   exemples locaux deviennent neutres. Une traduction littérale sonnerait faux
   pour un commerçant de Nairobi.

   Langue : ?lang=en, puis choix mémorisé, puis langue du téléphone.
   ============================================================ */
(function () {
  'use strict';

  var DICO = {
    en: {
      'Commencer gratuitement': 'Start for free',
      /* ── En-tête et accroche ───────────────────────────────── */
      "MySargal — Cartes de fidélité digitales & cartes cadeaux pour commerçants en Afrique de l'Ouest": 'MySargal — Digital loyalty cards & gift cards for independent shops',
      'MySargal — La fidélité digitale des commerçants': 'MySargal — Digital loyalty for independent shops',
      'MySargal — La plateforme de fidélité digitale et cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest.': 'MySargal — The digital loyalty and gift card platform for independent shops.',
      'Fonctionnalités': 'Features',
      'Comment ça marche': 'How it works',
      'Comment ça marche →': 'How it works →',
      'Démarrer gratuitement': 'Start for free',
      'Changer de thème': 'Switch theme',
      "Pour les commerçants d'Afrique de l'Ouest": 'For independent shops',
      'Fidélisez vos clients.': 'Keep your customers coming back.',
      'Offrez des': 'Give',
      'qui marquent.': 'they remember.',
      "Créer ma boutique — c'est gratuit": 'Create my shop — it’s free',
      'Pour démarrer': 'To get started',
      "Offerts à l'inscription": 'Free when you sign up',
      'La carte de tes clients, dans leur téléphone :': 'Your customers’ card, on their phone:',
      'Ma carte de fidélité': 'My loyalty card',
      'FIDÉLITÉ': 'LOYALTY',
      'Café Teranga · Dakar': 'Teranga Café · Dakar',
      'Récompense': 'Reward',
      'Ajouter à Apple Wallet': 'Add to Apple Wallet',
      'Ajouter à Google Wallet': 'Add to Google Wallet',
      'Scanner un achat': 'Scan a purchase',
      'Récompense débloquée !': 'Reward unlocked',
      'un café offert chez Café Teranga.': 'a free coffee at Teranga Café.',
      '↑ Touche « Scanner » pour essayer': '↑ Tap “Scan” to try it',

      /* ── Fonctionnalités ───────────────────────────────────── */
      'Tout ce dont votre': 'Everything your',
      'Cartes de fidélité': 'Loyalty cards',
      'QR code unique par client. Points automatiques à chaque scan, récompense quand le seuil est atteint.': 'A unique QR code for each customer. Points added on every scan, reward when the threshold is reached.',
      "La carte s'ajoute au Wallet du téléphone en un tap, avec le solde de points mis à jour automatiquement.": 'The card is added to the phone Wallet in one tap, with the points balance kept up to date automatically.',
      "Relance des clients inactifs, vœux d'anniversaire avec bonus, alertes récompense — envoyés tout seuls, chaque matin.": 'Win-back messages, birthday wishes with a bonus, reward alerts — all sent automatically, every morning.',
      'Cartes cadeaux animées': 'Animated gift cards',
      'Cartes cadeaux livrées par WhatsApp avec une vraie animation de déballage. Solde en temps réel, rechargeable.': 'Gift cards delivered on WhatsApp with a real unwrapping animation. Live balance, top-up anytime.',
      'Parrainage intégré': 'Built-in referrals',
      'Tes clients invitent leurs amis : points bonus pour le parrain ET le filleul. Ta clientèle grandit toute seule.': 'Your customers invite their friends: bonus points for both of them. Your customer base grows on its own.',
      'Points à ta façon': 'Points your way',
      'Par passage (1 visite = 1 point) ou par montant dépensé (1 point = X FCFA). Tu choisis, tu changes quand tu veux.': 'Per visit (1 visit = 1 point) or per amount spent (1 point = X). You choose, and you can change it anytime.',
      'Top clients, heures de pointe, performances cartes cadeaux, export CSV. Filtrable sur 7, 30 ou 90 jours.': 'Top customers, peak hours, gift card performance, CSV export. Filter over 7, 30 or 90 days.',
      'Délai anti re-scan, plafond de points par jour, PIN caissier et journal des scans. Ta caisse est protégée.': 'Anti re-scan delay, daily points cap, cashier PIN and scan log. Your checkout is protected.',
      "S'installe sur iPhone et Android, fonctionne hors ligne — les scans se synchronisent automatiquement.": 'Installs on iPhone and Android, works offline — scans sync automatically.',
      'Boutique en ligne connectée': 'Online shop connected',
      "Shopify, WooCommerce ou ton propre site : chaque commande payée crédite les points automatiquement. Sans plugin —": 'Shopify, WooCommerce or your own site: every paid order adds points automatically. No plugin —',
      'une URL à coller': 'just one URL to paste',

      /* ── Statistiques ──────────────────────────────────────── */
      'Connaissez vos clients': 'Know your customers',
      'Scans et points distribués jour par jour': 'Scans and points given, day by day',
      'Top 5 clients les plus fidèles avec progression': 'Your 5 most loyal customers, with progress',
      'Heures de pointe sur 24h pour optimiser vos horaires': 'Peak hours over 24h, to fine-tune your opening times',
      'Performances des cartes cadeaux par design': 'Gift card performance by design',
      'Export CSV pour votre comptabilité': 'CSV export for your accounts',
      'Voir le panel →': 'See the dashboard →',

      /* ── Cartes cadeaux ────────────────────────────────────── */
      'Vendez des cadeaux': 'Sell gifts',
      'sans effort': 'effortlessly',
      "Partagez simplement votre lien. N'importe qui peut acheter une carte cadeau pour votre boutique en quelques minutes.": 'Just share your link. Anyone can buy a gift card for your shop in a couple of minutes.',
      'Design, montant et message personnalisé': 'Design, amount and personal message',
      'Paiement Wave, Orange Money ou en boutique': 'Pay by mobile money or in store',
      'Carte envoyée automatiquement par WhatsApp': 'Card sent automatically on WhatsApp',
      'Le destinataire scanne pour payer en boutique': 'The recipient scans to pay in store',
      'Acheter une carte cadeau': 'Buy a gift card',
      'pour chaque occasion': 'for every occasion',
      'Anniversaires, fêtes, remerciements. Des cartes avec effet shimmer et solde en temps réel.': 'Birthdays, celebrations, thank-yous. Cards with a shimmer effect and a live balance.',
      'Pour Fatou': 'For Fatou',
      'Pour Amina': 'For Amina',
      'Or Précieux': 'Precious Gold',
      'Violet Mystère': 'Mystery Purple',
      'points fidélité': 'loyalty points',
      'Awa Ndiaye · Café Teranga': 'Awa Ndiaye · Teranga Café',
      'Bouge la souris — les cartes suivent le regard': 'Move your mouse — the cards follow',
      'Offrir cette carte →': 'Send this card →',

      /* ── Mise en route ─────────────────────────────────────── */
      'Opérationnel en': 'Up and running in',
      'Café Teranga': 'Teranga Café',
      'est en ligne': 'is live',
      'Boutique créée en 2 minutes,': 'Shop created in 2 minutes,',
      'vérifiée par WhatsApp.': 'verified on WhatsApp.',
      'Salut Awa ! 👋 Voici ta carte de fidélité': 'Hi Awa! 👋 Here is your loyalty card',
      'La carte part par WhatsApp.': 'The card goes out on WhatsApp.',
      'Aucune app à télécharger.': 'No app to download.',
      'Un scan en caisse,': 'One scan at the till,',
      'les points tombent. Même hors ligne.': 'and the points land. Even offline.',
      'débloquée': 'unlocked',
      '10 points atteints : Awa reçoit': '10 points reached: Awa gets',
      'son café offert — et revient.': 'her free coffee — and comes back.',
      'ÉTAPE 01': 'STEP 01',
      'ÉTAPE 02': 'STEP 02',
      'ÉTAPE 03': 'STEP 03',
      'ÉTAPE 04': 'STEP 04',
      'Créer votre boutique': 'Create your shop',
      'Nom, type, récompense, téléphone. Vérification par code WhatsApp. Aucun mot de passe à retenir.': 'Name, type, reward, phone. Verified by a WhatsApp code. No password to remember.',
      'Ajouter vos clients': 'Add your customers',
      'Créez une carte par client. Envoyez le lien par WhatsApp en 1 tap. Aucune app à télécharger.': 'Create a card per customer. Send the link on WhatsApp in one tap. No app to download.',
      'Scanner à chaque visite': 'Scan on every visit',
      'Le client présente son QR. Vous scannez et ajoutez les points. 3 secondes, même hors ligne.': 'The customer shows their QR code. You scan and add the points. Three seconds, even offline.',
      'Récompenser fidèlement': 'Reward them properly',
      'MySargal alerte quand le seuil est atteint. Vous offrez la récompense, les compteurs repartent.': 'MySargal alerts you when the threshold is reached. You give the reward, and the counter starts again.',

      /* ── Témoignages ───────────────────────────────────────── */
      'Témoignages': 'Testimonials',
      'Ce que disent': 'What our',
      'nos commerçants': 'shop owners say',
      'Café Atlas · Dakar': 'Atlas Café · Dakar',
      'Téléphonie · Thiès': 'Phone shop · Thiès',
      'Salon Beauté Plus · Saint-Louis': 'Beauté Plus Salon · Saint-Louis',

      /* ── Tarifs ────────────────────────────────────────────── */
      'Tout est inclus, dès le premier jour.': 'Everything included, from day one.',
      '— sans carte bancaire.': '— no card required.',
      'jours — sans carte bancaire': 'days — no card required',
      'Toutes les fonctionnalités': 'Every feature',
      ', sans restriction': ', with no limits',
      'Clients illimités': 'Unlimited customers',
      'Cartes de fidélité + scan QR': 'Loyalty cards + QR scanning',
      'Cartes cadeaux + designs personnalisés': 'Gift cards + custom designs',
      'Zéro engagement — tu arrêtes quand tu veux': 'No commitment — stop whenever you like',
      "APRÈS L'ESSAI": 'AFTER THE TRIAL',
      'Pro — tout illimité': 'Pro — everything unlimited',
      'Parrainage intégré (bonus parrain + filleul)': 'Built-in referrals (bonus for both)',
      'Cartes cadeaux illimitées + designs personnalisés': 'Unlimited gift cards + custom designs',
      'Démarrer — 3 mois offerts': 'Get started — 3 months free',

      /* ── Appel final ───────────────────────────────────────── */
      'Prêt à démarrer ?': 'Ready to start?',
      'Commencez à fidéliser': 'Start building loyalty',
      "dès aujourd'hui": 'today',
      "Rejoignez les commerçants d'Afrique de l'Ouest qui fidélisent autrement. Aucune carte bancaire, aucune installation.": 'Join the shops building loyalty a better way. No bank card, nothing to install.',
      'Créer ma boutique — gratuit': 'Create my shop — free',
      'Déjà inscrit ? Se connecter': 'Already registered? Sign in',

      /* ── Questions fréquentes ──────────────────────────────── */
      'fréquentes': 'questions',
      "C'est quoi MySargal ?": 'What is MySargal?',
      'Combien ça coûte ?': 'How much does it cost?',
      "3 mois d'essai gratuit avec tout inclus, sans carte bancaire. Ensuite, un abonnement sur devis, adapté à ton pays et à ton volume.": 'A 3-month free trial with everything included, no bank card. After that, a subscription quoted for your country and your volume.',
      "J'ai une boutique en ligne (Shopify, WooCommerce…), ça marche ?": 'I have an online shop (Shopify, WooCommerce…) — does it work?',
      'Faut-il télécharger une application ?': 'Do I need to download an app?',
      'Comment mes clients gagnent-ils des points ?': 'How do my customers earn points?',
      "Qu'est-ce qu'une carte cadeau MySargal ?": 'What is a MySargal gift card?',

      /* ── Pied de page ──────────────────────────────────────── */
      'Pour les marques': 'For brands',
      'Accès': 'Access',
      'Créer une boutique': 'Create a shop',
      'Panel commerçant': 'Merchant dashboard',
      'Développeurs / API': 'Developers / API',
      'Confidentialité': 'Privacy',
      '© 2026 MySargal · Tous droits réservés': '© 2026 MySargal · All rights reserved',
      'Écris-nous sur WhatsApp': 'Message us on WhatsApp',
      'Nous écrire sur WhatsApp': 'Message us on WhatsApp',
      'Haut de page': 'Back to top',
      'Commerçant utilisant le dashboard MySargal': 'Shop owner using the MySargal dashboard',
      'Changer la photo': 'Change the photo',

      /* ── Inscription ───────────────────────────────────────── */
      'Créer ma boutique — MySargal': 'Create my shop — MySargal',
      'ta boutique ?': 'your shop?',
      "Un seul champ. C'est tout ce dont on a besoin pour commencer.": 'One field. That is all we need to get started.',
      'Restaurant / Café': 'Restaurant / Café',
      'Thiébou dieune, café touba...': 'Restaurant, café, takeaway...',
      'Épicerie / Boutique': 'Grocery / Shop',
      'Beauté / Coiffure': 'Beauty / Hair',
      'Quelle est ta': 'What is your',
      'récompense ?': 'reward?',
      "Après combien d'achats tu offres quelque chose à ton client ?": 'After how many purchases do you give something to your customer?',
      'Par passage': 'Per visit',
      'Par montant': 'Per amount',
      '1 point = X FCFA dépensés': '1 point = X spent',
      '1 point = combien de FCFA ?': '1 point = how much?',
      'Tu offres quoi ?': 'What do you give?',
      'Tu peux changer ça à tout moment dans tes paramètres': 'You can change this anytime in your settings',
      "C'est ma récompense →": 'That’s my reward →',
      'Décider plus tard': 'Decide later',
      'Ton numéro': 'Your',
      'de téléphone': 'phone number',
      "On t'envoie un code par WhatsApp pour sécuriser ton compte. Pas de mot de passe à retenir.": 'We send you a code on WhatsApp to secure your account. No password to remember.',
      'Ton numéro ne sera jamais partagé ni vendu': 'Your number will never be shared or sold',
      'Recevoir mon code WhatsApp →': 'Send my WhatsApp code →',
      'Code reçu': 'Code received',
      'sur WhatsApp': 'on WhatsApp',
      'Saisis les 6 chiffres envoyés au': 'Enter the 6 digits sent to',
      'Vérifier →': 'Verify →',
      'Ton espace est prêt. Tu peux scanner ta première carte client maintenant.': 'Your account is ready. You can scan your first customer card now.',
      'Téléphone': 'Phone',
      'Scanner mon premier client': 'Scan my first customer',
      'Cartes de fidélité digitales et cartes cadeaux pour ton commerce. Gratuit, prêt en 2 minutes.': 'Digital loyalty cards and gift cards for your shop. Free, ready in 2 minutes.',
      'Ex: Café Touba, Épicerie Ndiaye...': 'e.g. Corner Café, Ndiaye Grocery...',
      'Ex: Un café gratuit, 10% de réduction...': 'e.g. A free coffee, 10% off...',
      'Numéro': 'Number',
      /* ── Complété le 7 août 2026 ─────────────────────── */
      '"Les cartes cadeaux ont transformé mon business. Des clients en achètent pour offrir à leurs proches et ça m\'amène de nouveaux clients."': '"Gift cards changed my business. Customers buy them for the people they love, and that brings me new customers."',
      '"Mes clients adorent scanner leur carte. Les habitués reviennent bien plus souvent depuis MySargal. Le système de récompenses marche vraiment."': '"My customers love scanning their card. Regulars come back a lot more often since MySargal. The rewards really work."',
      '"Simple, rapide, zéro papier. Je gère tout depuis mon téléphone. Le dashboard m\'aide à voir quels jours sont les plus chargés."': '"Simple, fast, zero paper. I run everything from my phone. The dashboard shows me which days are busiest."',
      '1 kg de sucre gratuit': '1 kg of sugar free',
      '1 visite = 1 point': '1 visit = 1 point',
      '10% de réduction': '10% off',
      '10% sur les courses': '10% off groceries',
      '15% de réduction': '15% off',
      '2 minutes': '2 minutes',
      'Accueil': 'Home',
      'Alimentation, produits...': 'Groceries, products...',
      'Aller au tableau de bord': 'Go to dashboard',
      'Analytics complet + export CSV': 'Full analytics + CSV export',
      'Anti-fraude & caissiers': 'Cashiers & fraud protection',
      'App client': 'Customer app',
      'App mobile (PWA)': 'Mobile app (PWA)',
      'Automations WhatsApp': 'WhatsApp automations',
      'Automations WhatsApp — relances inactifs, anniversaires': 'WhatsApp automations: reminders for inactive customers, birthdays',
      'Awa a atteint 10 points :': 'Awa reached 10 points:',
      'Bienvenue': 'Welcome',
      'Bleu Profond': 'Deep Blue',
      'Bon de 1000 FCFA': '1000 FCFA voucher',
      'Bonjour MySargal, je souhaite un devis pour ma boutique.': 'Hi MySargal, I\'d like a quote for my shop.',
      'Boutique': 'Shop',
      'CADEAU': 'GIFT',
      'Caissiers, PIN & anti-fraude': 'Cashiers, PIN & fraud protection',
      'Carte cadeau MySargal offerte en boutique': 'MySargal gift card handed over in a shop',
      'Cartes cadeaux': 'Gift cards',
      'Cartes de fidélité digitales et cartes cadeaux pour votre boutique. Vos clients scannent, accumulent, reviennent. Sans papier, sans application.': 'Digital loyalty cards and gift cards for your shop. Your customers scan, earn points, come back. No paper, no app to install.',
      'Code envoyé sur WhatsApp !': 'Code sent on WhatsApp!',
      'Combien coûte MySargal ?': 'How much does MySargal cost?',
      'Compte non créé. Réessaie.': 'Account not created. Try again.',
      'Conditions': 'Terms',
      'Contact': 'Contact',
      'Continuer →': 'Continue →',
      'Dashboard analytics': 'Analytics dashboard',
      'Demander un devis': 'Request a quote',
      'Démarrer —': 'Get started —',
      'Erreur création compte': 'Account creation failed',
      'Erreur inscription. Réessaie.': 'Signup failed. Try again.',
      'Essai gratuit': 'Free trial',
      'Essai gratuit — 3 mois offerts': 'Free trial: 3 months free',
      'Flow d\'achat carte cadeau': 'Gift card purchase flow',
      'Guide d\'installation (5 min)': 'Setup guide (5 min)',
      'Ils utilisent MySargal': 'Shops using MySargal',
      'La plateforme de fidélité digitale et cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest. Simple, rapide, sans installation.': 'The digital loyalty and gift card platform for independent shops. Simple, fast, nothing to install.',
      'Livraison, pressing...': 'Delivery, dry cleaning...',
      'Marques': 'Brands',
      'Menu': 'Menu',
      'Multi-boutiques': 'Multiple shops',
      'MySargal fonctionne-t-il avec Shopify ou WooCommerce ?': 'Does MySargal work with Shopify or WooCommerce?',
      'Nombre d\'achats →': 'Number of purchases →',
      'Non. Tout fonctionne dans le navigateur du téléphone — et les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet.': 'No. Everything runs in the phone\'s browser, and customers can add their card to Apple Wallet or Google Wallet.',
      'Non. Tout fonctionne dans le navigateur du téléphone. Les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet.': 'No. Everything runs in the phone\'s browser. Customers can add their card to Apple Wallet or Google Wallet.',
      'Nouveau code envoyé sur WhatsApp !': 'New code sent on WhatsApp!',
      'Oui — sans plugin. Tu colles une URL dans ta boutique et chaque commande payée crédite automatiquement les points de ton client, avec sa carte envoyée par WhatsApp.': 'Yes, and no plugin needed. You paste a URL into your store and every paid order automatically credits your customer\'s points, with their card sent over WhatsApp.',
      'Plan': 'Plan',
      'Plateforme de fidélité digitale et de cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest.': 'Digital loyalty and gift card platform for independent shops.',
      'Produit': 'Product',
      'Qu\'est-ce qu\'une gift card MySargal ?': 'What is a MySargal gift card?',
      'Questions': 'Questions',
      'Recommencer ↺': 'Start over ↺',
      'Renvoyer le code': 'Resend code',
      'Rose Ardent': 'Fiery Pink',
      'Récompense à combien de points ?': 'Reward at how many points?',
      'Récompense à définir': 'Reward to be set',
      'Salon, tresses, soins...': 'Salon, braids, treatments...',
      'Se connecter': 'Log in',
      'Service / Autre': 'Service / Other',
      'Session expirée — refais la vérification OTP.': 'Session expired. Verify with the OTP code again.',
      'Simple.': 'Simple.',
      'Solde': 'Balance',
      'Support prioritaire WhatsApp': 'Priority WhatsApp support',
      'Sur devis': 'On request',
      'Tarif adapté à ton pays et à ton volume': 'Pricing that fits your country and your volume',
      'Tarifs': 'Pricing',
      'Transparent.': 'Transparent.',
      'Turquoise': 'Turquoise',
      'Type': 'Type',
      'Un café gratuit': 'A free coffee',
      'Un produit offert': 'A free product',
      'Un repas offert': 'A free meal',
      'Un scan du QR code en caisse suffit : points ajoutés instantanément, client averti sur WhatsApp. Tu choisis tes règles, par passage ou par montant.': 'One QR code scan at the register is enough: points added instantly, customer notified on WhatsApp. You set the rules, per visit or per amount spent.',
      'Un soin offert': 'A free treatment',
      'Une boisson offerte': 'A free drink',
      'Une carte cadeau digitale de ta boutique, envoyée par WhatsApp avec une animation de déballage, encaissable via QR code — parfaite pour la Tabaski, la Korité et les anniversaires.': 'A digital gift card from your shop, sent over WhatsApp with an unwrapping animation and redeemed with a QR code. Perfect for holidays and birthdays.',
      'Une livraison gratuite': 'A free delivery',
      'Une plateforme ouest-africaine de fidélité digitale : cartes avec QR code, points automatiques, récompenses et cartes cadeaux digitales pour les commerçants et leurs clients.': 'A digital loyalty platform for independent shops: QR code cards, automatic points, rewards and digital gift cards for merchants and their customers.',
      'Une plateforme pensée pour l\'Afrique de l\'Ouest — Sénégal, Côte d\'Ivoire et au-delà. Fonctionne via QR code et WhatsApp, sans installation.': 'A platform built for independent shops, from a single counter to a whole chain. Works with a QR code and WhatsApp, nothing to install.',
      'WhatsApp support': 'WhatsApp support',
      'À chaque achat, le commerçant scanne le QR code de la carte du client : les points sont ajoutés instantanément et le client est notifié sur WhatsApp.': 'On every purchase, the merchant scans the QR code on the customer\'s card: points are added instantly and the customer is notified on WhatsApp.',
      'À définir': 'To be set',
      /* ── Titres coupés par <br> : chaque moitié se traduit seule ── */
      'boutique a besoin': 'shop needs',
      '8 designs': '8 designs',
      /* ── Paragraphes longs ──────────────────────────── */
      'MySargal est une plateforme ouest-africaine de fidélité digitale : chaque client reçoit une carte de fidélité avec QR code dans son téléphone, gagne des points à chaque achat et reçoit ses récompenses. Les commerçants peuvent aussi vendre des cartes cadeaux digitales livrées par WhatsApp.': 'MySargal is a digital loyalty platform: each customer receives a loyalty card with a QR code on their phone, earns points on every purchase and unlocks their rewards. Merchants can also sell digital gift cards delivered straight to WhatsApp.',
      'Oui, sans plugin : une simple URL webhook à coller dans Shopify, WooCommerce ou n\'importe quel site. Chaque commande payée crédite automatiquement les points fidélité du client et sa carte est envoyée par WhatsApp.': 'Yes, with no plugin needed: just a webhook URL to paste into Shopify, WooCommerce or any website. Every paid order automatically credits the customer\'s loyalty points and their card is sent by WhatsApp.',
      'MySargal offre 3 mois d\'essai gratuit avec toutes les fonctionnalités, sans carte bancaire. Ensuite, l\'abonnement Pro est proposé sur devis, adapté au pays et au volume du commerçant.': 'MySargal gives you a 3-month free trial with every feature, no bank card. After that, the Pro subscription is quoted for the merchant\'s country and volume.',
      'Non. Tout fonctionne dans le navigateur du téléphone. Les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet, et le commerçant gère sa boutique depuis son propre téléphone.': 'No. Everything works in the phone browser. Customers can add their card to Apple Wallet or Google Wallet, and the merchant runs the shop from their own phone.',
      '500 FCFA offerts': '500 FCFA off',
      'Manucure gratuite': 'Free manicure',
      'Service prioritaire': 'Priority service',
      'Tresses 50% off': '50% off braids',
      '3 mois': '3 months',
      /* ── Moitiés de titres coupés par une balise ── */
      'cadeaux': 'gifts',
      'comme': 'like',
      'jamais avant': 'never before',
      'Comment s\'appelle': 'What\'s the name of',
    },

    es: {
      'Commencer gratuitement': 'Empezar gratis',
      "MySargal — Cartes de fidélité digitales & cartes cadeaux pour commerçants en Afrique de l'Ouest": 'MySargal — Tarjetas de fidelidad digitales y tarjetas regalo para comercios',
      'MySargal — La fidélité digitale des commerçants': 'MySargal — La fidelidad digital de los comercios',
      'MySargal — La plateforme de fidélité digitale et cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest.': 'MySargal — La plataforma de fidelidad digital y tarjetas regalo para comercios independientes.',
      'Fonctionnalités': 'Funciones',
      'Comment ça marche': 'Cómo funciona',
      'Comment ça marche →': 'Cómo funciona →',
      'Démarrer gratuitement': 'Empezar gratis',
      'Changer de thème': 'Cambiar de tema',
      "Pour les commerçants d'Afrique de l'Ouest": 'Para comercios independientes',
      'Fidélisez vos clients.': 'Haz que tus clientes vuelvan.',
      'Offrez des': 'Ofrece',
      'qui marquent.': 'que se recuerdan.',
      "Créer ma boutique — c'est gratuit": 'Crear mi tienda: es gratis',
      'Pour démarrer': 'Para empezar',
      "Offerts à l'inscription": 'De regalo al registrarte',
      'La carte de tes clients, dans leur téléphone :': 'La tarjeta de tus clientes, en su móvil:',
      'Ma carte de fidélité': 'Mi tarjeta de fidelidad',
      'FIDÉLITÉ': 'FIDELIDAD',
      'Café Teranga · Dakar': 'Café Teranga · Dakar',
      'Récompense': 'Recompensa',
      'Ajouter à Apple Wallet': 'Añadir a Apple Wallet',
      'Ajouter à Google Wallet': 'Añadir a Google Wallet',
      'Scanner un achat': 'Escanear una compra',
      'Récompense débloquée !': 'Recompensa desbloqueada',
      'un café offert chez Café Teranga.': 'un café gratis en Café Teranga.',
      '↑ Touche « Scanner » pour essayer': '↑ Pulsa «Escanear» para probarlo',

      'Tout ce dont votre': 'Todo lo que tu',
      'Cartes de fidélité': 'Tarjetas de fidelidad',
      'QR code unique par client. Points automatiques à chaque scan, récompense quand le seuil est atteint.': 'Un código QR único por cliente. Puntos automáticos en cada escaneo y recompensa al alcanzar el umbral.',
      "La carte s'ajoute au Wallet du téléphone en un tap, avec le solde de points mis à jour automatiquement.": 'La tarjeta se añade al Wallet del móvil con un toque, y el saldo de puntos se actualiza solo.',
      "Relance des clients inactifs, vœux d'anniversaire avec bonus, alertes récompense — envoyés tout seuls, chaque matin.": 'Recordatorios a clientes inactivos, felicitaciones de cumpleaños con bonus, avisos de recompensa: todo automático, cada mañana.',
      'Cartes cadeaux animées': 'Tarjetas regalo animadas',
      'Cartes cadeaux livrées par WhatsApp avec une vraie animation de déballage. Solde en temps réel, rechargeable.': 'Tarjetas regalo enviadas por WhatsApp con una animación real de apertura. Saldo en tiempo real y recargable.',
      'Parrainage intégré': 'Recomendaciones integradas',
      'Tes clients invitent leurs amis : points bonus pour le parrain ET le filleul. Ta clientèle grandit toute seule.': 'Tus clientes invitan a sus amigos: puntos extra para ambos. Tu clientela crece sola.',
      'Points à ta façon': 'Puntos a tu manera',
      'Par passage (1 visite = 1 point) ou par montant dépensé (1 point = X FCFA). Tu choisis, tu changes quand tu veux.': 'Por visita (1 visita = 1 punto) o por importe gastado (1 punto = X). Tú eliges y lo cambias cuando quieras.',
      'Top clients, heures de pointe, performances cartes cadeaux, export CSV. Filtrable sur 7, 30 ou 90 jours.': 'Mejores clientes, horas punta, rendimiento de las tarjetas regalo, exportación CSV. Filtrable a 7, 30 o 90 días.',
      'Délai anti re-scan, plafond de points par jour, PIN caissier et journal des scans. Ta caisse est protégée.': 'Retardo antirreescaneo, tope de puntos diario, PIN de cajero y registro de escaneos. Tu caja está protegida.',
      "S'installe sur iPhone et Android, fonctionne hors ligne — les scans se synchronisent automatiquement.": 'Se instala en iPhone y Android, funciona sin conexión: los escaneos se sincronizan solos.',
      'Boutique en ligne connectée': 'Tienda online conectada',
      "Shopify, WooCommerce ou ton propre site : chaque commande payée crédite les points automatiquement. Sans plugin —": 'Shopify, WooCommerce o tu propia web: cada pedido pagado suma puntos automáticamente. Sin plugin:',
      'une URL à coller': 'solo una URL que pegar',

      'Connaissez vos clients': 'Conoce a tus clientes',
      'Scans et points distribués jour par jour': 'Escaneos y puntos entregados, día a día',
      'Top 5 clients les plus fidèles avec progression': 'Tus 5 clientes más fieles, con su progreso',
      'Heures de pointe sur 24h pour optimiser vos horaires': 'Horas punta en 24 h para ajustar tu horario',
      'Performances des cartes cadeaux par design': 'Rendimiento de las tarjetas regalo por diseño',
      'Export CSV pour votre comptabilité': 'Exportación CSV para tu contabilidad',
      'Voir le panel →': 'Ver el panel →',

      'Vendez des cadeaux': 'Vende regalos',
      'sans effort': 'sin esfuerzo',
      "Partagez simplement votre lien. N'importe qui peut acheter une carte cadeau pour votre boutique en quelques minutes.": 'Solo comparte tu enlace. Cualquiera puede comprar una tarjeta regalo de tu tienda en unos minutos.',
      'Design, montant et message personnalisé': 'Diseño, importe y mensaje personalizado',
      'Paiement Wave, Orange Money ou en boutique': 'Pago por dinero móvil o en tienda',
      'Carte envoyée automatiquement par WhatsApp': 'Tarjeta enviada automáticamente por WhatsApp',
      'Le destinataire scanne pour payer en boutique': 'El destinatario escanea para pagar en tienda',
      'Acheter une carte cadeau': 'Comprar una tarjeta regalo',
      'pour chaque occasion': 'para cada ocasión',
      'Anniversaires, fêtes, remerciements. Des cartes avec effet shimmer et solde en temps réel.': 'Cumpleaños, celebraciones, agradecimientos. Tarjetas con efecto brillo y saldo en tiempo real.',
      'Pour Fatou': 'Para Fatou',
      'Pour Amina': 'Para Amina',
      'Or Précieux': 'Oro Precioso',
      'Violet Mystère': 'Violeta Misterio',
      'points fidélité': 'puntos de fidelidad',
      'Awa Ndiaye · Café Teranga': 'Awa Ndiaye · Café Teranga',
      'Bouge la souris — les cartes suivent le regard': 'Mueve el ratón: las tarjetas te siguen',
      'Offrir cette carte →': 'Regalar esta tarjeta →',

      'Opérationnel en': 'Operativo en',
      'Café Teranga': 'Café Teranga',
      'est en ligne': 'está en línea',
      'Boutique créée en 2 minutes,': 'Tienda creada en 2 minutos,',
      'vérifiée par WhatsApp.': 'verificada por WhatsApp.',
      'Salut Awa ! 👋 Voici ta carte de fidélité': '¡Hola Awa! 👋 Aquí tienes tu tarjeta de fidelidad',
      'La carte part par WhatsApp.': 'La tarjeta se envía por WhatsApp.',
      'Aucune app à télécharger.': 'Sin apps que descargar.',
      'Un scan en caisse,': 'Un escaneo en caja',
      'les points tombent. Même hors ligne.': 'y los puntos entran. Incluso sin conexión.',
      'débloquée': 'desbloqueada',
      '10 points atteints : Awa reçoit': '10 puntos alcanzados: Awa recibe',
      'son café offert — et revient.': 'su café gratis, y vuelve.',
      'ÉTAPE 01': 'PASO 01',
      'ÉTAPE 02': 'PASO 02',
      'ÉTAPE 03': 'PASO 03',
      'ÉTAPE 04': 'PASO 04',
      'Créer votre boutique': 'Crea tu tienda',
      'Nom, type, récompense, téléphone. Vérification par code WhatsApp. Aucun mot de passe à retenir.': 'Nombre, tipo, recompensa, teléfono. Verificación por código de WhatsApp. Sin contraseñas que recordar.',
      'Ajouter vos clients': 'Añade a tus clientes',
      'Créez une carte par client. Envoyez le lien par WhatsApp en 1 tap. Aucune app à télécharger.': 'Crea una tarjeta por cliente. Envía el enlace por WhatsApp con un toque. Sin apps que descargar.',
      'Scanner à chaque visite': 'Escanea en cada visita',
      'Le client présente son QR. Vous scannez et ajoutez les points. 3 secondes, même hors ligne.': 'El cliente muestra su QR. Escaneas y sumas los puntos. Tres segundos, incluso sin conexión.',
      'Récompenser fidèlement': 'Recompensa de verdad',
      'MySargal alerte quand le seuil est atteint. Vous offrez la récompense, les compteurs repartent.': 'MySargal te avisa al alcanzar el umbral. Entregas la recompensa y el contador vuelve a empezar.',

      'Témoignages': 'Testimonios',
      'Ce que disent': 'Lo que dicen',
      'nos commerçants': 'nuestros comercios',
      'Café Atlas · Dakar': 'Café Atlas · Dakar',
      'Téléphonie · Thiès': 'Telefonía · Thiès',
      'Salon Beauté Plus · Saint-Louis': 'Salón Beauté Plus · Saint-Louis',

      'Tout est inclus, dès le premier jour.': 'Todo incluido, desde el primer día.',
      '— sans carte bancaire.': '— sin tarjeta bancaria.',
      'jours — sans carte bancaire': 'días, sin tarjeta bancaria',
      'Toutes les fonctionnalités': 'Todas las funciones',
      ', sans restriction': ', sin restricciones',
      'Clients illimités': 'Clientes ilimitados',
      'Cartes de fidélité + scan QR': 'Tarjetas de fidelidad + escaneo QR',
      'Cartes cadeaux + designs personnalisés': 'Tarjetas regalo + diseños personalizados',
      'Zéro engagement — tu arrêtes quand tu veux': 'Sin compromiso: lo dejas cuando quieras',
      "APRÈS L'ESSAI": 'DESPUÉS DE LA PRUEBA',
      'Pro — tout illimité': 'Pro: todo ilimitado',
      'Parrainage intégré (bonus parrain + filleul)': 'Recomendaciones integradas (bonus para ambos)',
      'Cartes cadeaux illimitées + designs personnalisés': 'Tarjetas regalo ilimitadas + diseños personalizados',
      'Démarrer — 3 mois offerts': 'Empezar: 3 meses gratis',

      'Prêt à démarrer ?': '¿Listo para empezar?',
      'Commencez à fidéliser': 'Empieza a fidelizar',
      "dès aujourd'hui": 'hoy mismo',
      "Rejoignez les commerçants d'Afrique de l'Ouest qui fidélisent autrement. Aucune carte bancaire, aucune installation.": 'Únete a los comercios que fidelizan de otra manera. Sin tarjeta bancaria, sin instalar nada.',
      'Créer ma boutique — gratuit': 'Crear mi tienda: gratis',
      'Déjà inscrit ? Se connecter': '¿Ya tienes cuenta? Inicia sesión',

      'fréquentes': 'frecuentes',
      "C'est quoi MySargal ?": '¿Qué es MySargal?',
      'Combien ça coûte ?': '¿Cuánto cuesta?',
      "3 mois d'essai gratuit avec tout inclus, sans carte bancaire. Ensuite, un abonnement sur devis, adapté à ton pays et à ton volume.": 'Tres meses de prueba gratis con todo incluido, sin tarjeta bancaria. Después, una suscripción con precio adaptado a tu país y a tu volumen.',
      "J'ai une boutique en ligne (Shopify, WooCommerce…), ça marche ?": 'Tengo una tienda online (Shopify, WooCommerce…), ¿funciona?',
      'Faut-il télécharger une application ?': '¿Hay que descargar una aplicación?',
      'Comment mes clients gagnent-ils des points ?': '¿Cómo ganan puntos mis clientes?',
      "Qu'est-ce qu'une carte cadeau MySargal ?": '¿Qué es una tarjeta regalo MySargal?',

      'Pour les marques': 'Para marcas',
      'Accès': 'Acceso',
      'Créer une boutique': 'Crear una tienda',
      'Panel commerçant': 'Panel del comercio',
      'Développeurs / API': 'Desarrolladores / API',
      'Confidentialité': 'Privacidad',
      '© 2026 MySargal · Tous droits réservés': '© 2026 MySargal · Todos los derechos reservados',
      'Écris-nous sur WhatsApp': 'Escríbenos por WhatsApp',
      'Nous écrire sur WhatsApp': 'Escríbenos por WhatsApp',
      'Haut de page': 'Volver arriba',
      'Commerçant utilisant le dashboard MySargal': 'Comerciante usando el panel de MySargal',
      'Changer la photo': 'Cambiar la foto',

      'Créer ma boutique — MySargal': 'Crear mi tienda — MySargal',
      'ta boutique ?': 'tu tienda?',
      "Un seul champ. C'est tout ce dont on a besoin pour commencer.": 'Un solo campo. Es todo lo que necesitamos para empezar.',
      'Restaurant / Café': 'Restaurante / Café',
      'Thiébou dieune, café touba...': 'Restaurante, café, comida para llevar...',
      'Épicerie / Boutique': 'Tienda de alimentación',
      'Beauté / Coiffure': 'Belleza / Peluquería',
      'Quelle est ta': '¿Cuál es tu',
      'récompense ?': 'recompensa?',
      "Après combien d'achats tu offres quelque chose à ton client ?": '¿Tras cuántas compras le regalas algo a tu cliente?',
      'Par passage': 'Por visita',
      'Par montant': 'Por importe',
      '1 point = X FCFA dépensés': '1 punto = X gastado',
      '1 point = combien de FCFA ?': '1 punto = ¿cuánto?',
      'Tu offres quoi ?': '¿Qué regalas?',
      'Tu peux changer ça à tout moment dans tes paramètres': 'Puedes cambiarlo cuando quieras en tus ajustes',
      "C'est ma récompense →": 'Esta es mi recompensa →',
      'Décider plus tard': 'Decidir más tarde',
      'Ton numéro': 'Tu número',
      'de téléphone': 'de teléfono',
      "On t'envoie un code par WhatsApp pour sécuriser ton compte. Pas de mot de passe à retenir.": 'Te enviamos un código por WhatsApp para proteger tu cuenta. Sin contraseñas que recordar.',
      'Ton numéro ne sera jamais partagé ni vendu': 'Tu número nunca se comparte ni se vende',
      'Recevoir mon code WhatsApp →': 'Recibir mi código de WhatsApp →',
      'Code reçu': 'Código recibido',
      'sur WhatsApp': 'por WhatsApp',
      'Saisis les 6 chiffres envoyés au': 'Introduce los 6 dígitos enviados al',
      'Vérifier →': 'Verificar →',
      'Ton espace est prêt. Tu peux scanner ta première carte client maintenant.': 'Tu espacio está listo. Ya puedes escanear tu primera tarjeta de cliente.',
      'Téléphone': 'Teléfono',
      'Scanner mon premier client': 'Escanear mi primer cliente',
      'Cartes de fidélité digitales et cartes cadeaux pour ton commerce. Gratuit, prêt en 2 minutes.': 'Tarjetas de fidelidad digitales y tarjetas regalo para tu comercio. Gratis, listo en 2 minutos.',
      'Ex: Café Touba, Épicerie Ndiaye...': 'P. ej. Café de la esquina, Tienda Ndiaye...',
      'Ex: Un café gratuit, 10% de réduction...': 'P. ej. Un café gratis, 10 % de descuento...',
      'Numéro': 'Número',
      /* ── Complété le 7 août 2026 ─────────────────────── */
      '"Les cartes cadeaux ont transformé mon business. Des clients en achètent pour offrir à leurs proches et ça m\'amène de nouveaux clients."': '"Las tarjetas regalo transformaron mi negocio. Hay clientes que las compran para regalar a sus seres queridos y eso me trae clientes nuevos."',
      '"Mes clients adorent scanner leur carte. Les habitués reviennent bien plus souvent depuis MySargal. Le système de récompenses marche vraiment."': '"A mis clientes les encanta escanear su tarjeta. Los habituales vuelven mucho más seguido desde MySargal. El sistema de recompensas funciona de verdad."',
      '"Simple, rapide, zéro papier. Je gère tout depuis mon téléphone. Le dashboard m\'aide à voir quels jours sont les plus chargés."': '"Simple, rápido, cero papel. Lo gestiono todo desde mi teléfono. El panel me muestra qué días son los más movidos."',
      '1 kg de sucre gratuit': '1 kg de azúcar gratis',
      '1 visite = 1 point': '1 visita = 1 punto',
      '10% de réduction': '10% de descuento',
      '10% sur les courses': '10% en la compra',
      '15% de réduction': '15% de descuento',
      '2 minutes': '2 minutos',
      'Accueil': 'Inicio',
      'Alimentation, produits...': 'Alimentación, productos...',
      'Aller au tableau de bord': 'Ir al panel',
      'Analytics complet + export CSV': 'Analíticas completas + exportación CSV',
      'Anti-fraude & caissiers': 'Cajeros y antifraude',
      'App client': 'App para clientes',
      'App mobile (PWA)': 'App móvil (PWA)',
      'Automations WhatsApp': 'Automatizaciones de WhatsApp',
      'Automations WhatsApp — relances inactifs, anniversaires': 'Automatizaciones de WhatsApp: recordatorios a inactivos, cumpleaños',
      'Awa a atteint 10 points :': 'Awa llegó a 10 puntos:',
      'Bienvenue': 'Te damos la bienvenida',
      'Bleu Profond': 'Azul Profundo',
      'Bon de 1000 FCFA': 'Vale de 1000 FCFA',
      'Bonjour MySargal, je souhaite un devis pour ma boutique.': 'Hola MySargal, quiero un presupuesto para mi tienda.',
      'Boutique': 'Tienda',
      'CADEAU': 'REGALO',
      'Caissiers, PIN & anti-fraude': 'Cajeros, PIN y antifraude',
      'Carte cadeau MySargal offerte en boutique': 'Tarjeta regalo MySargal entregada en la tienda',
      'Cartes cadeaux': 'Tarjetas regalo',
      'Cartes de fidélité digitales et cartes cadeaux pour votre boutique. Vos clients scannent, accumulent, reviennent. Sans papier, sans application.': 'Tarjetas de fidelidad digitales y tarjetas regalo para tu tienda. Tus clientes escanean, acumulan y vuelven. Sin papel y sin instalar nada.',
      'Code envoyé sur WhatsApp !': '¡Código enviado por WhatsApp!',
      'Combien coûte MySargal ?': '¿Cuánto cuesta MySargal?',
      'Compte non créé. Réessaie.': 'No se creó la cuenta. Inténtalo de nuevo.',
      'Conditions': 'Términos',
      'Contact': 'Contacto',
      'Continuer →': 'Continuar →',
      'Dashboard analytics': 'Panel de analíticas',
      'Demander un devis': 'Solicitar presupuesto',
      'Démarrer —': 'Empezar —',
      'Erreur création compte': 'Error al crear la cuenta',
      'Erreur inscription. Réessaie.': 'Error al registrarte. Inténtalo de nuevo.',
      'Essai gratuit': 'Prueba gratis',
      'Essai gratuit — 3 mois offerts': 'Prueba gratis: 3 meses gratis',
      'Flow d\'achat carte cadeau': 'Flujo de compra de tarjeta regalo',
      'Guide d\'installation (5 min)': 'Guía de instalación (5 min)',
      'Ils utilisent MySargal': 'Tiendas que usan MySargal',
      'La plateforme de fidélité digitale et cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest. Simple, rapide, sans installation.': 'La plataforma de fidelidad digital y tarjetas regalo para tiendas independientes. Simple, rápida y sin instalar nada.',
      'Livraison, pressing...': 'Reparto, tintorería...',
      'Marques': 'Marcas',
      'Menu': 'Menú',
      'Multi-boutiques': 'Varias tiendas',
      'MySargal fonctionne-t-il avec Shopify ou WooCommerce ?': '¿MySargal funciona con Shopify o WooCommerce?',
      'Nombre d\'achats →': 'Número de compras →',
      'Non. Tout fonctionne dans le navigateur du téléphone — et les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet.': 'No. Todo funciona en el navegador del teléfono, y los clientes pueden añadir su tarjeta a Apple Wallet o Google Wallet.',
      'Non. Tout fonctionne dans le navigateur du téléphone. Les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet.': 'No. Todo funciona en el navegador del teléfono. Los clientes pueden añadir su tarjeta a Apple Wallet o Google Wallet.',
      'Nouveau code envoyé sur WhatsApp !': '¡Nuevo código enviado por WhatsApp!',
      'Oui — sans plugin. Tu colles une URL dans ta boutique et chaque commande payée crédite automatiquement les points de ton client, avec sa carte envoyée par WhatsApp.': 'Sí, y sin plugin. Pegas una URL en tu tienda y cada pedido pagado acredita automáticamente los puntos de tu cliente, con su tarjeta enviada por WhatsApp.',
      'Plan': 'Plan',
      'Plateforme de fidélité digitale et de cartes cadeaux pour les commerçants d\'Afrique de l\'Ouest.': 'Plataforma de fidelidad digital y tarjetas regalo para tiendas independientes.',
      'Produit': 'Producto',
      'Qu\'est-ce qu\'une gift card MySargal ?': '¿Qué es una tarjeta regalo MySargal?',
      'Questions': 'Preguntas',
      'Recommencer ↺': 'Empezar de nuevo ↺',
      'Renvoyer le code': 'Reenviar el código',
      'Rose Ardent': 'Rosa Ardiente',
      'Récompense à combien de points ?': '¿Recompensa a cuántos puntos?',
      'Récompense à définir': 'Recompensa por definir',
      'Salon, tresses, soins...': 'Salón, trenzas, tratamientos...',
      'Se connecter': 'Iniciar sesión',
      'Service / Autre': 'Servicio / Otro',
      'Session expirée — refais la vérification OTP.': 'Sesión caducada. Vuelve a hacer la verificación OTP.',
      'Simple.': 'Simple.',
      'Solde': 'Saldo',
      'Support prioritaire WhatsApp': 'Soporte prioritario por WhatsApp',
      'Sur devis': 'A consultar',
      'Tarif adapté à ton pays et à ton volume': 'Precio adaptado a tu país y a tu volumen',
      'Tarifs': 'Precios',
      'Transparent.': 'Transparente.',
      'Turquoise': 'Turquesa',
      'Type': 'Tipo',
      'Un café gratuit': 'Un café gratis',
      'Un produit offert': 'Un producto gratis',
      'Un repas offert': 'Una comida gratis',
      'Un scan du QR code en caisse suffit : points ajoutés instantanément, client averti sur WhatsApp. Tu choisis tes règles, par passage ou par montant.': 'Basta con escanear el código QR en caja: los puntos se añaden al instante y el cliente recibe aviso por WhatsApp. Tú eliges las reglas, por visita o por importe.',
      'Un soin offert': 'Un tratamiento gratis',
      'Une boisson offerte': 'Una bebida gratis',
      'Une carte cadeau digitale de ta boutique, envoyée par WhatsApp avec une animation de déballage, encaissable via QR code — parfaite pour la Tabaski, la Korité et les anniversaires.': 'Una tarjeta regalo digital de tu tienda, enviada por WhatsApp con una animación de desenvolver y canjeable con código QR. Perfecta para las fiestas y los cumpleaños.',
      'Une livraison gratuite': 'Un envío gratis',
      'Une plateforme ouest-africaine de fidélité digitale : cartes avec QR code, points automatiques, récompenses et cartes cadeaux digitales pour les commerçants et leurs clients.': 'Una plataforma de fidelidad digital para tiendas independientes: tarjetas con código QR, puntos automáticos, recompensas y tarjetas regalo digitales para los comercios y sus clientes.',
      'Une plateforme pensée pour l\'Afrique de l\'Ouest — Sénégal, Côte d\'Ivoire et au-delà. Fonctionne via QR code et WhatsApp, sans installation.': 'Una plataforma pensada para tiendas independientes, desde un solo local hasta una cadena. Funciona con código QR y WhatsApp, sin instalar nada.',
      'WhatsApp support': 'Soporte por WhatsApp',
      'À chaque achat, le commerçant scanne le QR code de la carte du client : les points sont ajoutés instantanément et le client est notifié sur WhatsApp.': 'En cada compra, el comercio escanea el código QR de la tarjeta del cliente: los puntos se añaden al instante y el cliente recibe un aviso por WhatsApp.',
      'À définir': 'Por definir',
      /* ── Titres coupés par <br> : chaque moitié se traduit seule ── */
      'boutique a besoin': 'tienda necesita',
      '8 designs': '8 diseños',
      /* ── Paragraphes longs ──────────────────────────── */
      'MySargal est une plateforme ouest-africaine de fidélité digitale : chaque client reçoit une carte de fidélité avec QR code dans son téléphone, gagne des points à chaque achat et reçoit ses récompenses. Les commerçants peuvent aussi vendre des cartes cadeaux digitales livrées par WhatsApp.': 'MySargal es una plataforma de fidelización digital: cada cliente recibe una tarjeta de fidelidad con código QR en su teléfono, gana puntos en cada compra y recibe sus recompensas. Los comercios también pueden vender tarjetas regalo digitales entregadas por WhatsApp.',
      'Oui, sans plugin : une simple URL webhook à coller dans Shopify, WooCommerce ou n\'importe quel site. Chaque commande payée crédite automatiquement les points fidélité du client et sa carte est envoyée par WhatsApp.': 'Sí, sin plugin: basta con pegar una URL de webhook en Shopify, WooCommerce o cualquier sitio web. Cada pedido pagado acredita automáticamente los puntos de fidelidad del cliente y su tarjeta se envía por WhatsApp.',
      'MySargal offre 3 mois d\'essai gratuit avec toutes les fonctionnalités, sans carte bancaire. Ensuite, l\'abonnement Pro est proposé sur devis, adapté au pays et au volume du commerçant.': 'MySargal ofrece 3 meses de prueba gratis con todas las funciones, sin tarjeta bancaria. Después, la suscripción Pro se cotiza según el país y el volumen del comerciante.',
      'Non. Tout fonctionne dans le navigateur du téléphone. Les clients peuvent ajouter leur carte à Apple Wallet ou Google Wallet, et le commerçant gère sa boutique depuis son propre téléphone.': 'No. Todo funciona en el navegador del teléfono. Los clientes pueden añadir su tarjeta a Apple Wallet o Google Wallet, y el comerciante gestiona su tienda desde su propio teléfono.',
      '500 FCFA offerts': '500 FCFA de regalo',
      'Manucure gratuite': 'Manicura gratis',
      'Service prioritaire': 'Servicio prioritario',
      'Tresses 50% off': 'Trenzas al 50%',
      '3 mois': '3 meses',
      /* ── Moitiés de titres coupés par une balise ── */
      'cadeaux': 'regalos',
      'comme': 'como',
      'jamais avant': 'nunca antes',
      'Comment s\'appelle': '¿Cómo se llama',
    },
  };

  /* ── Mécanique identique aux autres couches ────────────────── */
  function detecter() {
    try {
      var p = new URLSearchParams(location.search).get('lang');
      if (p && DICO[p]) { localStorage.setItem('ms_lang', p); return p; }
      if (p === 'fr') { localStorage.setItem('ms_lang', 'fr'); return 'fr'; }
      var m = localStorage.getItem('ms_lang');
      if (m && (DICO[m] || m === 'fr')) return m;
    } catch (e) {}
    var n = ((navigator.language || 'fr') + '').slice(0, 2).toLowerCase();
    return DICO[n] ? n : 'fr';
  }

  var LANGUE = detecter();
  var TABLE = DICO[LANGUE] || null;
  var IGNORER = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, CODE: 1, PRE: 1, SVG: 1 };
  var ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];

  function traduire(racine) {
    if (!TABLE) return;
    racine = racine || document.body;
    var it = document.createTreeWalker(racine, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        var p = n.parentNode;
        if (p && IGNORER[p.nodeName]) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    var lot = [], n;
    while ((n = it.nextNode())) lot.push(n);
    for (var i = 0; i < lot.length; i++) {
      var brut = lot[i].nodeValue, cle = brut.trim();
      if (Object.prototype.hasOwnProperty.call(TABLE, cle)) lot[i].nodeValue = brut.replace(cle, TABLE[cle]);
    }
    for (var a = 0; a < ATTRS.length; a++) {
      var nom = ATTRS[a], els = racine.querySelectorAll ? racine.querySelectorAll('[' + nom + ']') : [];
      for (var j = 0; j < els.length; j++) {
        var v = els[j].getAttribute(nom);
        if (v && Object.prototype.hasOwnProperty.call(TABLE, v.trim())) els[j].setAttribute(nom, TABLE[v.trim()]);
      }
    }
  }

  var obs = null, attente = false;
  function planifier() {
    if (attente) return;
    attente = true;
    requestAnimationFrame(function () {
      attente = false;
      obs && obs.disconnect();
      try { traduire(document.body); } catch (e) {}
      brancher();
    });
  }
  function brancher() {
    if (!TABLE || !document.body || !window.MutationObserver) return;
    obs = new MutationObserver(planifier);
    obs.observe(document.body, { childList: true, subtree: true, characterData: true });
  }
  function demarrer() {
    if (!TABLE) return;
    document.documentElement.lang = LANGUE;
    // Le titre de l'onglet n'est pas dans le corps de page.
    try {
      var t = document.title.trim();
      if (Object.prototype.hasOwnProperty.call(TABLE, t)) document.title = TABLE[t];
    } catch (e) {}
    traduire(document.body);
    brancher();
  }

  function demarrerAvecSelecteur() { try { demarrer(); } catch (e) {} try { poserSelecteur(); } catch (e) {} }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', demarrerAvecSelecteur);
  else demarrerAvecSelecteur();


  /* ── Sélecteur de langue ──────────────────────────────────────
     Le mécanisme de changement existait déjà, mais aucune page ne
     l'affichait : il fallait taper ?lang=en à la main. Il est maintenant
     injecté par cette couche, donc présent partout où elle est chargée.
     Une page peut s'en passer avec <body data-ms-langue="non">.
     ─────────────────────────────────────────────────────────── */
  // Le sélecteur est désormais un composant partagé, identique partout :
  // même endroit, même geste, sur la landing comme dans les consoles.
  function poserSelecteur() {
    if (!document.body) return;
    if (document.body.getAttribute('data-ms-langue') === 'non') return;
    if (!window.msLangue) return;
    window.msLangue.poser({ courante: LANGUE });
  }

  window.msI18nLanding = { langue: LANGUE, traduire: traduire };
})();
