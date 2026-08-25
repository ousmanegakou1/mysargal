{
    'name': 'MySargal Fidélité',
    'version': '1.1.0',
    'summary': "Points de fidélité et cartes cadeaux MySargal, automatiques à la confirmation des commandes. Le client reçoit tout sur WhatsApp, sans créer de compte.",
    'description': """
MySargal pour Odoo
==================
1. Fidélité : à chaque commande confirmée, les points du client sont crédités
   sur MySargal et sa carte (Apple Wallet / Google Wallet / web) lui est
   envoyée par WhatsApp.
2. Cartes cadeaux : cochez « Carte cadeau MySargal » sur un produit ; sa vente
   génère une vraie carte cadeau envoyée au bénéficiaire par WhatsApp.
   Ces lignes ne rapportent pas de points (l'avantage serait compté deux fois).

Configuration :
1. Paramètres > Technique > Paramètres système
2. Créer la clé  mysargal.api_key  avec la clé fournie par MySargal
   (générée dans l'app marchande, section « Site web / WordPress »).
""",
    'category': 'Sales',
    'author': 'MySargal',
    'website': 'https://mysargal.com',
    'license': 'LGPL-3',
    'depends': ['sale'],
    'data': ['views/mysargal_views.xml'],
    'installable': True,
    'application': False,
}
