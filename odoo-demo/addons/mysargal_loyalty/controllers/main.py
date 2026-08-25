# -*- coding: utf-8 -*-
# Pont entre le point de vente (JavaScript) et l'API MySargal.
# La clé API ne quitte JAMAIS le serveur Odoo : le POS appelle ces routes,
# le serveur appelle MySargal.
import logging

import requests

from odoo import fields, http
from odoo.http import request

_logger = logging.getLogger(__name__)

TIMEOUT = 10
DEFAULT_BASE = 'https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1'


def _config():
    icp = request.env['ir.config_parameter'].sudo()
    api_key = icp.get_param('mysargal.api_key')
    base = (icp.get_param('mysargal.base_url') or DEFAULT_BASE).rstrip('/')
    return api_key, base


# Clé publique du projet MySargal. Elle ne donne aucun droit par elle même :
# la vraie authentification reste la clé d'API du marchand, dans x-api-key.
# Sa seule utilité est de satisfaire la passerelle Supabase, qui refuse une
# requête sans en tête Authorization dès qu'une fonction est marquée comme
# vérifiant le jeton. Sans elle, une simple bascule de ce réglage côté serveur
# coupait la caisse avec un « Missing authorization header » incompréhensible
# pour le commerçant.
ANON_PUBLIQUE = (
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2N4bHZjdW9xYWZ6bGlzcXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTgwODIsImV4cCI6MjA5MDkzNDA4Mn0.o-dRdHDGc5_IwCGhK5Ri67CCtZRj6J4evsxgBkMgvao'
)


def _entetes(api_key):
    icp = request.env['ir.config_parameter'].sudo()
    anon = icp.get_param('mysargal.anon_key') or ANON_PUBLIQUE
    return {
        'x-api-key': api_key,
        'Authorization': 'Bearer ' + anon,
        'apikey': anon,
        'Content-Type': 'application/json',
    }


def _call(endpoint, payload):
    api_key, base = _config()
    if not api_key:
        return {'success': False, 'error': "Clé MySargal absente (Paramètres système : mysargal.api_key)"}
    try:
        resp = requests.post(
            base + endpoint,
            json=payload,
            headers=_entetes(api_key),
            timeout=TIMEOUT,
        )
        try:
            return resp.json()
        except ValueError:
            return {'success': False, 'error': 'Réponse illisible de MySargal (%s)' % resp.status_code}
    except Exception as exc:
        _logger.warning('MySargal POS: %s -> %s', endpoint, exc)
        return {'success': False, 'error': "MySargal injoignable : %s" % exc}


class MySargalPos(http.Controller):

    @http.route('/mysargal/giftcard/balance', type='json', auth='user')
    def giftcard_balance(self, code=None, **kw):
        if not code:
            return {'success': False, 'error': 'Code requis'}
        return _call('/api-giftcard-balance', {'code': str(code).strip().upper()})

    @http.route('/mysargal/loyalty/credit', type='json', auth='user')
    def loyalty_credit(self, phone=None, email=None, name=None, amount=0, reference=None, **kw):
        """Crédite les points d'un client depuis le point de vente."""
        if not phone and not email:
            return {'success': False, 'error': 'Numéro ou email requis'}
        try:
            amt = float(amount or 0)
        except (TypeError, ValueError):
            return {'success': False, 'error': 'Montant invalide'}
        if amt <= 0:
            return {'success': False, 'error': 'Montant invalide'}
        return _call('/api-order', {
            'phone': str(phone or '').strip(),
            'email': str(email or '').strip(),
            'name': name or '',
            'amount': amt,
            'order_id': reference or '',
        })

    @http.route('/mysargal/loyalty/rewards', type='json', auth='user')
    def loyalty_rewards(self, card_code=None, phone=None, **kw):
        """Récompenses disponibles pour un client (caisse)."""
        if not card_code and not phone:
            return {'success': False, 'error': 'Code carte ou numéro requis'}
        payload = {}
        if card_code:
            payload['card_code'] = str(card_code).strip().upper()
        if phone:
            payload['phone'] = str(phone).strip()
        return _call('/api-rewards', payload)

    @http.route('/mysargal/loyalty/redeem', type='json', auth='user')
    def loyalty_redeem(self, card_code=None, reward_id=None, idempotency_key=None, **kw):
        """Débite une récompense (les points sont retirés de la carte).

        La clé d'idempotence protège du double débit : un caissier qui appuie
        deux fois, ou une requête rejouée après une coupure réseau, ne retire
        les points qu'une seule fois. Sans clé fournie, on en fabrique une à
        partir de la carte, de la récompense et de la minute en cours, ce qui
        neutralise le double clic sans empêcher un second retrait légitime plus
        tard dans la journée.
        """
        if not card_code:
            return {'success': False, 'error': 'Code carte requis'}
        code = str(card_code).strip().upper()
        payload = {'card_code': code}
        if reward_id:
            payload['reward_id'] = reward_id
        cle = str(idempotency_key or '').strip()
        if not cle:
            cle = '%s-%s-%s' % (code, reward_id or 'defaut',
                                fields.Datetime.now().strftime('%Y%m%d%H%M'))
        payload['idempotency_key'] = cle[:120]
        res = _call('/api-redeem', payload)
        # api-redeem répond {error: ...} sans 'success' en cas d'échec
        if isinstance(res, dict) and 'success' not in res:
            res['success'] = False
        return res

    @http.route('/mysargal/giftcard/redeem', type='json', auth='user')
    def giftcard_redeem(self, code=None, amount=0, reference=None, **kw):
        if not code or not amount:
            return {'success': False, 'error': 'Code et montant requis'}
        try:
            amt = int(round(float(amount)))
        except (TypeError, ValueError):
            return {'success': False, 'error': 'Montant invalide'}
        if amt <= 0:
            return {'success': False, 'error': 'Montant invalide'}
        payload = {'code': str(code).strip().upper(), 'amount': amt}
        if reference:
            payload['reference'] = reference
            payload['idempotency_key'] = reference
        return _call('/api-giftcard-redeem', payload)

    @http.route('/mysargal/loyalty/reward_product', type='json', auth='user')
    def reward_product(self, **kw):
        """Renvoie le produit technique qui porte la remise fidélité, en le
        créant si besoin.

        La caisse ne charge pas tout le catalogue : selon la version d'Odoo et
        la configuration du point de vente, un produit service hors catégorie
        vendue n'arrive jamais jusqu'au navigateur. Le bouton Récompense se
        retrouvait alors sans support pour poser la remise, et demandait au
        caissier de l'appliquer à la main alors que les points étaient déjà
        débités. On garantit ici que le produit existe et on renvoie de quoi
        l'utiliser tout de suite.
        """
        env = request.env
        produit = env.ref('mysargal_pos.product_mysargal_reward', raise_if_not_found=False)
        if not produit:
            produit = env['product.product'].sudo().search(
                [('default_code', '=', 'MYSARGAL_REWARD')], limit=1)
        if not produit:
            produit = env['product.product'].sudo().create({
                'name': 'Récompense fidélité MySargal',
                'default_code': 'MYSARGAL_REWARD',
                'type': 'service',
                'available_in_pos': True,
                'sale_ok': False,
                'purchase_ok': False,
                'list_price': 0.0,
                'taxes_id': [(5, 0, 0)],
            })

        # Un produit créé après l'ouverture de la caisse doit y être visible :
        # sans ces deux drapeaux il resterait invisible jusqu'au redémarrage.
        valeurs = {}
        if not produit.available_in_pos:
            valeurs['available_in_pos'] = True
        if produit.taxes_id:
            valeurs['taxes_id'] = [(5, 0, 0)]
        if valeurs:
            produit.sudo().write(valeurs)

        return {
            'success': True,
            'id': produit.id,
            'display_name': produit.display_name,
            'lst_price': 0.0,
        }
