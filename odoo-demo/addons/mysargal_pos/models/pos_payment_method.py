# -*- coding: utf-8 -*-
from odoo import fields, models


class PosPaymentMethod(models.Model):
    _inherit = 'pos.payment.method'

    x_mysargal_giftcard = fields.Boolean(
        string='Carte cadeau MySargal',
        help="Ce moyen de paiement demande le code de la carte cadeau MySargal, "
             "affiche le solde disponible et débite la carte en temps réel.",
    )
