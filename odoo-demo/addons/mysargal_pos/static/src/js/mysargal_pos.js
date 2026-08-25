/** @odoo-module **/
/**
 * MySargal — carte cadeau dans l'écran de paiement du point de vente.
 *
 * 1. Le caissier choisit le moyen de paiement « Carte cadeau MySargal »
 * 2. Il saisit ou scanne le code : le solde est vérifié auprès de MySargal
 * 3. Le montant appliqué = min(solde, reste à payer)
 * 4. À la validation du ticket, la carte est réellement débitée
 *
 * La clé API ne transite jamais par le navigateur : le POS appelle des routes
 * Odoo (/mysargal/giftcard/*) et c'est le serveur qui parle à MySargal.
 */
import { PaymentScreen } from "@point_of_sale/app/screens/payment_screen/payment_screen";
import { patch } from "@web/core/utils/patch";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { _t } from "@web/core/l10n/translation";

/** Appel JSON-RPC natif : indépendant du service `rpc` (change selon les versions). */
async function msJsonRpc(route, params) {
    const res = await fetch(route, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: "call", params: params || {} }),
    });
    const data = await res.json();
    if (data.error) {
        throw new Error((data.error.data && data.error.data.message) || data.error.message);
    }
    return data.result;
}

patch(PaymentScreen.prototype, {

    async addNewPaymentLine(paymentMethod) {
        if (!paymentMethod || !paymentMethod.x_mysargal_giftcard) {
            return super.addNewPaymentLine(...arguments);
        }

        // 1. Demander le code de la carte
        const { confirmed, payload: code } = await this.popup.add(TextInputPopup, {
            title: _t("Carte cadeau MySargal"),
            body: _t("Saisissez ou scannez le code de la carte."),
            startingValue: "",
            placeholder: "GC-XXXXXX",
        });
        if (!confirmed || !code) {
            return false;
        }
        const cleanCode = code.trim().toUpperCase();

        // 2. Vérifier le solde
        let balanceRes;
        try {
            balanceRes = await msJsonRpc("/mysargal/giftcard/balance", { code: cleanCode });
        } catch (err) {
            await this.popup.add(ErrorPopup, {
                title: _t("MySargal"),
                body: _t("Vérification impossible : ") + err.message,
            });
            return false;
        }
        if (!balanceRes || !balanceRes.success) {
            await this.popup.add(ErrorPopup, {
                title: _t("Carte cadeau"),
                body: (balanceRes && balanceRes.error === "not_found")
                    ? _t("Carte introuvable.")
                    : _t("Carte inutilisable : ") + ((balanceRes && balanceRes.error) || "erreur"),
            });
            return false;
        }

        const balance = Number(balanceRes.balance || 0);
        if (balance <= 0) {
            await this.popup.add(ErrorPopup, {
                title: _t("Carte cadeau"),
                body: _t("Cette carte n'a plus de solde."),
            });
            return false;
        }

        // 3. Créer la ligne de paiement : min(solde, reste à payer)
        const order = this.currentOrder;
        const due = order.get_due();
        const amount = Math.min(balance, due > 0 ? due : balance);

        const added = super.addNewPaymentLine(...arguments);
        const line = order.selected_paymentline;
        if (!line) {
            return added;
        }
        line.set_amount(amount);
        // mémorisé pour le débit à la validation
        line.mysargal_code = cleanCode;
        line.mysargal_balance = balance;

        try {
            this.env.services.notification.add(
                _t("Carte %(code)s — solde %(balance)s, appliqué %(amount)s", {
                    code: cleanCode,
                    balance: this.env.utils.formatCurrency(balance),
                    amount: this.env.utils.formatCurrency(amount),
                }),
                { type: "success" }
            );
        } catch (e) {
            // la notification est un confort, jamais bloquante
        }
        return added;
    },

    /**
     * Crédite les points de fidélité du client sélectionné en caisse.
     * Le montant retenu exclut ce qui a été payé en carte cadeau
     * (sinon l'avantage serait compté deux fois).
     */
    async _mysargalCreditLoyalty(snapshot) {
        if (!snapshot || (!snapshot.phone && !snapshot.email) || snapshot.amount <= 0) {
            return;
        }
        try {
            const res = await msJsonRpc("/mysargal/loyalty/credit", {
                phone: snapshot.phone,
                email: snapshot.email || "",
                name: snapshot.name || "",
                amount: snapshot.amount,
                reference: snapshot.reference || "",
            });
            if (res && res.success && res.points_added) {
                this.env.services.notification.add(
                    _t("MySargal : +%(pts)s points pour %(client)s", {
                        pts: res.points_added,
                        client: res.client || snapshot.name || "",
                    }),
                    { type: "success" }
                );
            }
        } catch (err) {
            // la fidélité ne doit jamais bloquer l'encaissement
            console.warn("MySargal fidélité :", err);
        }
    },

    /** Débit réel des cartes cadeaux au moment de valider le ticket. */
    async validateOrder(isForceValidate) {
        const order = this.currentOrder;
        const giftLines = order.paymentlines.filter((l) => l.mysargal_code);

        for (const line of giftLines) {
            if (line.mysargal_redeemed) {
                continue;
            }
            const amount = Math.round(line.get_amount());
            if (amount <= 0) {
                continue;
            }
            const reference = (order.name || "POS") + "/" + line.cid;
            let res;
            try {
                res = await msJsonRpc("/mysargal/giftcard/redeem", {
                    code: line.mysargal_code,
                    amount: amount,
                    reference: reference,
                });
            } catch (err) {
                await this.popup.add(ErrorPopup, {
                    title: _t("MySargal"),
                    body: _t("Débit impossible : ") + err.message,
                });
                return false;
            }
            if (!res || !res.success) {
                const reason = res && res.error === "insufficient_balance"
                    ? _t("Solde insuffisant sur la carte.")
                    : _t("Débit refusé : ") + ((res && res.error) || "erreur");
                await this.popup.add(ErrorPopup, { title: _t("Carte cadeau"), body: reason });
                return false;
            }
            line.mysargal_redeemed = true;
            line.mysargal_remaining = res.balance_remaining;
        }

        // Photo des infos avant validation (l'objet est réinitialisé ensuite)
        let snapshot = null;
        try {
            const partner = order.get_partner && order.get_partner();
            const phone = partner ? (partner.mobile || partner.phone || "") : "";
            const email = partner ? (partner.email || "") : "";
            if (phone || email) {
                const giftPaid = giftLines.reduce((sum, l) => sum + l.get_amount(), 0);
                snapshot = {
                    phone: phone,
                    email: email,
                    name: partner.name || "",
                    amount: Math.max(0, order.get_total_with_tax() - giftPaid),
                    reference: "POS/" + (order.name || order.uid || ""),
                };
            }
        } catch (e) {
            snapshot = null;
        }

        const result = await super.validateOrder(...arguments);
        await this._mysargalCreditLoyalty(snapshot);
        return result;
    },
});
