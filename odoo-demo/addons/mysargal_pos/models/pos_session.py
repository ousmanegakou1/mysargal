# -*- coding: utf-8 -*-
from odoo import api, models


def _produit_remise(env):
    """Le produit technique qui porte la remise fidélité sur le ticket."""
    prod = env.ref('mysargal_pos.product_mysargal_reward', raise_if_not_found=False)
    if prod:
        return prod
    return env['product.product'].sudo().search(
        [('default_code', '=', 'MYSARGAL_REWARD')], limit=1)


class PosSession(models.Model):
    _inherit = 'pos.session'

    def _loader_params_pos_payment_method(self):
        """Odoo 16/17 : expose le champ carte cadeau au point de vente."""
        res = super()._loader_params_pos_payment_method()
        try:
            fields_list = res['search_params']['fields']
            if 'x_mysargal_giftcard' not in fields_list:
                fields_list.append('x_mysargal_giftcard')
        except (KeyError, TypeError):
            pass
        return res

    def _loader_params_product_product(self):
        """Odoo 16/17 : charge le produit de remise même si la caisse est
        limitée à certaines catégories."""
        res = super()._loader_params_product_product()
        try:
            params = res['search_params']
            fields_list = params.get('fields')
            if fields_list is not None and 'default_code' not in fields_list:
                fields_list.append('default_code')
            prod = _produit_remise(self.env)
            if prod:
                domain = params.get('domain') or []
                params['domain'] = ['|', ('id', '=', prod.id)] + list(domain)
        except (KeyError, TypeError, ValueError):
            pass
        return res


class ProductProduct(models.Model):
    _inherit = 'product.product'

    # Odoo 18 a remplacé les _loader_params_* par un chargement déclaré sur
    # chaque modèle. Sans cette surcharge, le produit de remise n'arrivait
    # jamais jusqu'au navigateur sur les installations récentes : le bouton
    # Récompense tombait alors dans son cas d'erreur et demandait au caissier
    # d'appliquer la remise à la main, alors que le module était pourtant
    # correctement installé.
    @api.model
    def _load_pos_data_domain(self, data):
        domaine = super()._load_pos_data_domain(data)
        try:
            prod = _produit_remise(self.env)
            if prod:
                return ['|', ('id', '=', prod.id)] + list(domaine or [])
        except Exception:
            pass
        return domaine

    @api.model
    def _load_pos_data_fields(self, config_id):
        champs = super()._load_pos_data_fields(config_id)
        try:
            if 'default_code' not in champs:
                champs = list(champs) + ['default_code']
        except Exception:
            pass
        return champs
