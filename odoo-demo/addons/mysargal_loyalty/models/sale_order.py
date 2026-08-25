# -*- coding: utf-8 -*-
# MySargal — fidélité + cartes cadeaux, à la confirmation de commande.
# Config : Paramètres > Technique > Paramètres système
#   mysargal.api_key   (obligatoire, fournie par MySargal)
#   mysargal.base_url  (optionnel, défaut : https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1)
import logging

import requests

from odoo import fields, models

_logger = logging.getLogger(__name__)

TIMEOUT = 10
MAX_CARDS_PER_LINE = 20  # garde-fou


class SaleOrder(models.Model):
    _inherit = 'sale.order'

    x_mysargal_done = fields.Boolean(string='Points MySargal crédités', default=False, copy=False)
    x_mysargal_gift_done = fields.Boolean(string='Cartes cadeaux MySargal émises', default=False, copy=False)
    x_mysargal_gift_phone = fields.Char(
        string='WhatsApp bénéficiaire (carte cadeau)',
        help="Numéro qui recevra la carte cadeau. Si vide, le téléphone du client est utilisé.",
    )

    # ------------------------------------------------------------------
    def action_confirm(self):
        res = super().action_confirm()
        for order in self:
            try:
                order._mysargal_credit_points()
            except Exception as exc:  # ne jamais bloquer la confirmation
                _logger.warning('MySargal: points, erreur non bloquante sur %s : %s', order.name, exc)
            try:
                order._mysargal_issue_giftcards()
            except Exception as exc:
                _logger.warning('MySargal: carte cadeau, erreur non bloquante sur %s : %s', order.name, exc)
        return res

    # ------------------------------------------------------------------
    def _mysargal_config(self):
        icp = self.env['ir.config_parameter'].sudo()
        api_key = icp.get_param('mysargal.api_key')
        base = (icp.get_param('mysargal.base_url')
                or 'https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1').rstrip('/')
        return api_key, base

    def _mysargal_gift_lines(self):
        return self.order_line.filtered(
            lambda l: l.product_id and l.product_id.product_tmpl_id.x_mysargal_giftcard
        )

    # ------------------------------------------------------------------
    def _mysargal_credit_points(self):
        self.ensure_one()
        if self.x_mysargal_done:
            return
        api_key, base = self._mysargal_config()
        if not api_key:
            return
        partner = self.partner_id
        phone = (partner.mobile or partner.phone or '').strip()
        email = (partner.email or '').strip()
        if not phone and not email:
            _logger.info('MySargal: ni téléphone ni email sur %s, points non crédités', self.name)
            return

        # Les cartes cadeaux vendues ne rapportent pas de points (l'avantage serait compté deux fois)
        gift_total = sum(self._mysargal_gift_lines().mapped('price_total'))
        amount = float(self.amount_total) - float(gift_total)
        if amount <= 0:
            self.x_mysargal_done = True
            return

        resp = requests.post(
            base + '/api-order',
            json={
                'phone': phone,
                'email': email,
                'name': partner.name or '',
                'amount': amount,
                'order_id': self.name,
                # Qui a validé la commande, côté Odoo. Sans cela, MySargal ne
                # voit qu'une clé d'API et toute l'activité apparaît anonyme.
                'operator_ref': self.env.user.login or '',
                'operator_name': self.env.user.name or '',
                'operator_src': 'Odoo',
            },
            headers={'x-api-key': api_key, 'Content-Type': 'application/json'},
            timeout=TIMEOUT,
        )
        data = {}
        try:
            data = resp.json()
        except ValueError:
            pass
        if resp.ok and data.get('success'):
            self.x_mysargal_done = True
            self.message_post(body=(
                'Points MySargal crédités : +%s (carte %s). '
                'Le client reçoit sa carte par WhatsApp.'
                % (data.get('points_added', 0), data.get('card_code', ''))
            ))
        else:
            _logger.warning('MySargal: réponse %s pour %s : %s', resp.status_code, self.name, data or resp.text[:200])

    # ------------------------------------------------------------------
    def _mysargal_issue_giftcards(self):
        self.ensure_one()
        if self.x_mysargal_gift_done:
            return
        lines = self._mysargal_gift_lines()
        if not lines:
            return
        api_key, base = self._mysargal_config()
        if not api_key:
            return

        partner = self.partner_id
        phone = (self.x_mysargal_gift_phone or partner.mobile or partner.phone or '').strip()
        codes = []
        for line in lines:
            qty = int(line.product_uom_qty or 0)
            if qty <= 0:
                continue
            qty = min(qty, MAX_CARDS_PER_LINE)
            unit = float(line.price_unit or 0)
            if unit <= 0:
                continue
            for i in range(qty):
                ref = '%s/%s/%s' % (self.name, line.id, i + 1)
                resp = requests.post(
                    base + '/api-giftcard-activate',
                    json={
                        'amount': round(unit),
                        'recipient_phone': phone or None,
                        'reference': ref,
                    },
                    headers={'x-api-key': api_key, 'Content-Type': 'application/json'},
                    timeout=TIMEOUT,
                )
                data = {}
                try:
                    data = resp.json()
                except ValueError:
                    pass
                if resp.ok and data.get('success'):
                    codes.append(data.get('code', ''))
                else:
                    _logger.warning('MySargal: carte cadeau %s : %s', ref, data or resp.text[:200])

        if codes:
            self.x_mysargal_gift_done = True
            self.message_post(body=(
                'Carte(s) cadeau MySargal émise(s) : %s.%s'
                % (', '.join(c for c in codes if c),
                   ' Envoyée(s) au %s par WhatsApp.' % phone if phone else '')
            ))
