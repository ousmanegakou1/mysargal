# -*- coding: utf-8 -*-
from odoo import fields, models


class ProductTemplate(models.Model):
    _inherit = 'product.template'

    x_mysargal_giftcard = fields.Boolean(
        string='Carte cadeau MySargal',
        help="Si coché, la vente de ce produit génère une carte cadeau MySargal "
             "envoyée au bénéficiaire par WhatsApp. Ces lignes ne rapportent pas "
             "de points de fidélité (l'avantage serait compté deux fois).",
    )
