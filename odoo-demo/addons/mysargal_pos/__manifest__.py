{
    'name': 'MySargal — Caisse (cartes cadeaux & récompenses)',
    'version': '1.1.0',
    'summary': "Encaisser une carte cadeau et appliquer une récompense fidélité directement dans le point de vente.",
    'description': """
Ajoute au point de vente :

1. Un moyen de paiement « Carte cadeau MySargal » : le caissier saisit ou scanne
   le code, le solde s'affiche, la carte est débitée à la validation du ticket.
   La carte cadeau est un MOYEN DE PAIEMENT (jamais une remise) : TVA et chiffre
   d'affaires restent justes.

2. Un bouton « Récompense » : affiche les récompenses disponibles du client,
   débite les points et applique la remise correspondante sur le ticket.

3. Les points de fidélité sont crédités automatiquement à la validation du ticket
   pour le client sélectionné en caisse.

Prérequis : module « MySargal Fidélité » installé et clé API renseignée
(Paramètres > Technique > Paramètres système : mysargal.api_key).
""",
    'category': 'Sales/Point of Sale',
    'author': 'MySargal',
    'website': 'https://mysargal.com',
    'license': 'LGPL-3',
    'depends': ['point_of_sale', 'mysargal_loyalty'],
    'data': [
        'views/pos_views.xml',
        'data/mysargal_product.xml',
    ],
    'assets': {
        'point_of_sale._assets_pos': [
            'mysargal_pos/static/src/js/mysargal_pos.js',
            'mysargal_pos/static/src/js/mysargal_reward_button.js',
            'mysargal_pos/static/src/xml/mysargal_reward_button.xml',
        ],
    },
    'installable': True,
    'application': False,
}
