/** @odoo-module **/
/**
 * Bouton « Récompense MySargal » dans l'écran de caisse.
 *
 * 1. Le caissier saisit le code de la carte (ou le client sélectionné est utilisé)
 * 2. La liste des récompenses du client s'affiche avec ses points
 * 3. Il choisit : les points sont débités et la remise est appliquée au ticket
 */
import { Component } from "@odoo/owl";
import { ProductScreen } from "@point_of_sale/app/screens/product_screen/product_screen";
import { usePos } from "@point_of_sale/app/store/pos_hook";
import { useService } from "@web/core/utils/hooks";
import { TextInputPopup } from "@point_of_sale/app/utils/input_popups/text_input_popup";
import { SelectionPopup } from "@point_of_sale/app/utils/input_popups/selection_popup";
import { ErrorPopup } from "@point_of_sale/app/errors/popups/error_popup";
import { ConfirmPopup } from "@point_of_sale/app/utils/confirm_popup/confirm_popup";
import { _t } from "@web/core/l10n/translation";

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

export class MySargalRewardButton extends Component {
    static template = "mysargal_pos.RewardButton";

    setup() {
        this.pos = usePos();
        this.popup = useService("popup");
        this.notification = useService("notification");
    }

    /** Retrouve le produit technique qui porte la remise fidélité. */
    _findRewardProduct() {
        const pools = [];
        try {
            const db = this.pos.db || {};
            if (db.product_by_id) pools.push(Object.values(db.product_by_id));
        } catch (e) { /* ignore */ }
        try {
            // Odoo 18 : modèles chargés dans this.pos.models
            const models = this.pos.models && this.pos.models["product.product"];
            if (models && models.getAll) pools.push(models.getAll());
        } catch (e) { /* ignore */ }

        for (const list of pools) {
            if (!list || !list.length) continue;
            let found = list.find((p) => p && p.default_code === "MYSARGAL_REWARD");
            if (found) return found;
            found = list.find((p) => p && typeof p.display_name === "string"
                && p.display_name.indexOf("Récompense fidélité") !== -1);
            if (found) return found;
            found = list.find((p) => p && typeof p.name === "string"
                && p.name.indexOf("Récompense fidélité") !== -1);
            if (found) return found;
        }
        return null;
    }

    /** Demande le produit au serveur et l'insère dans la caisse en cours.
     *
     * Selon la version d'Odoo et la configuration du point de vente, le
     * catalogue chargé au démarrage ne contient pas ce produit service. Plutot
     * que d'abandonner, on le fait garantir par le serveur puis on l'ajoute au
     * cache local, ce qui évite au caissier de redémarrer sa session en pleine
     * file d'attente.
     */
    async _fetchRewardProduct() {
        let info;
        try {
            info = await msJsonRpc("/mysargal/loyalty/reward_product", {});
        } catch (e) {
            return null;
        }
        if (!info || !info.success || !info.id) return null;

        // Odoo 18 : on lit le enregistrement par le chargeur de données.
        try {
            if (this.pos.data && this.pos.data.read) {
                const lus = await this.pos.data.read("product.product", [info.id]);
                if (lus && lus.length) return lus[0];
            }
        } catch (e) { /* version suivante */ }
        try {
            const models = this.pos.models && this.pos.models["product.product"];
            if (models && models.get) {
                const p = models.get(info.id);
                if (p) return p;
            }
        } catch (e) { /* version suivante */ }

        // Odoo 16 et 17 : on complète le cache produit de la caisse.
        try {
            const db = this.pos.db;
            if (db && db.add_products && db.get_product_by_id) {
                const deja = db.get_product_by_id(info.id);
                if (deja) return deja;
                db.add_products([{
                    id: info.id,
                    display_name: info.display_name,
                    name: info.display_name,
                    default_code: "MYSARGAL_REWARD",
                    lst_price: 0,
                    taxes_id: [],
                    type: "service",
                    available_in_pos: true,
                    pos_categ_id: false,
                    categ_id: false,
                    to_weight: false,
                    tracking: "none",
                }]);
                return db.get_product_by_id(info.id) || null;
            }
        } catch (e) { /* on renonce proprement */ }
        return null;
    }

    async onClick() {
        const order = this.pos.get_order();

        // 1. Identifier la carte.
        //
        // La boîte n'acceptait qu'un code de carte. Un caissier qui tape le
        // numéro de téléphone du client, ce qu'il a naturellement sous la main,
        // recevait « Aucune carte pour ce client » alors que la carte existait.
        // On accepte maintenant les deux et on devine lequel a été saisi :
        // majoritairement des chiffres, c'est un numéro.
        const chercher = async (saisie) => {
            const brut = String(saisie || "").trim();
            if (!brut) return null;
            const chiffres = brut.replace(/\D/g, "");
            const estNumero = chiffres.length >= 6 && chiffres.length >= brut.replace(/[\s+.\-()]/g, "").length;
            const params = estNumero
                ? { phone: brut }
                : { card_code: brut.toUpperCase() };
            return await msJsonRpc("/mysargal/loyalty/rewards", params);
        };

        let res = null;
        const partner = order.get_partner && order.get_partner();
        const telClient = partner && (partner.mobile || partner.phone);

        // Un client sélectionné en caisse donne son numéro sans rien saisir.
        if (telClient) {
            try {
                res = await msJsonRpc("/mysargal/loyalty/rewards", { phone: telClient });
            } catch (err) {
                res = null;
            }
        }

        // Sans client, ou si le numéro de la fiche ne donne rien, on demande.
        // Un client peut très bien avoir une carte MySargal sans exister comme
        // contact dans Odoo : la caisse ne doit pas l'exiger.
        if (!res || !res.success) {
            const { confirmed, payload } = await this.popup.add(TextInputPopup, {
                title: _t("Carte de fidélité"),
                body: _t("Code de la carte ou numéro de téléphone du client."),
                startingValue: "",
                placeholder: _t("LC-XXXXXX ou 77 000 00 00"),
            });
            if (!confirmed || !payload) {
                return;
            }
            try {
                res = await chercher(payload);
            } catch (err) {
                await this.popup.add(ErrorPopup, { title: _t("MySargal"), body: err.message });
                return;
            }
        }

        if (!res || !res.success) {
            await this.popup.add(ErrorPopup, {
                title: _t("Fidélité"),
                body: (res && res.error === "not_found")
                    ? _t("Aucune carte MySargal trouvée pour ce code ni pour ce numéro.")
                    : _t("Impossible de lire la carte : ") + ((res && res.error) || "erreur"),
            });
            return;
        }

        const available = (res.rewards || []).filter((r) => r.available);
        if (!available.length) {
            await this.popup.add(ConfirmPopup, {
                title: _t("Fidélité"),
                body: _t("%(client)s a %(pts)s points — aucune récompense disponible pour l'instant.", {
                    client: res.client || "",
                    pts: res.points || 0,
                }),
                confirmText: _t("OK"),
                cancelText: _t("Fermer"),
            });
            return;
        }

        // 3. Choix de la récompense
        const { confirmed, payload: reward } = await this.popup.add(SelectionPopup, {
            title: _t("Récompenses disponibles"),
            list: available.map((r) => ({
                id: r.id,
                item: r,
                label: (r.emoji ? r.emoji + " " : "") + r.name + "  (" + r.pts_cost + " pts)",
                isSelected: false,
            })),
        });
        if (!confirmed || !reward) {
            return;
        }

        // 4. Remise sur le ticket, AVANT tout débit.
        //
        // L'ordre inverse coutait des points au client : on débitait, puis on
        // cherchait de quoi poser la remise, et si cela manquait le caissier
        // voyait « appliquez la remise manuellement » alors que les points
        // avaient déja disparu. On pose donc la remise d'abord, on débite
        // ensuite, et on défait la remise si le débit échoue.
        //
        // Une remise en POURCENTAGE n'a besoin d'aucun produit technique :
        // Odoo sait appliquer un pourcentage sur chaque ligne du ticket, c'est
        // le bouton « % Rem. » du clavier. C'est plus juste que d'ajouter une
        // ligne négative, parce que la TVA se répartit correctement sur chaque
        // article. On ne recourt au produit de remise que pour un montant fixe,
        // qui lui n'a pas d'équivalent natif.
        const enPourcent = reward.discount_type === "percent" && Number(reward.discount_value) > 0;
        const enMontant = reward.discount_type === "amount" && Number(reward.discount_value) > 0;

        // Si la récompense ne dit ni pourcentage ni montant, aucune des deux
        // branches ne pose de remise. On s'arrête ICI, avant le débit.
        //
        // Sans ce garde fou, les points partaient et le ticket restait au prix
        // plein : la cliente perdait ses points et payait quand même. C'est
        // exactement la panne de juillet, qui revenait par la porte de derrière
        // dès qu'une récompense était créée sans forme de remise.
        if (!enPourcent && !enMontant) {
            this.popup.add(ErrorPopup, {
                title: _t("Récompense mal configurée"),
                body: _t(
                    "Cette récompense ne précise ni pourcentage ni montant. " +
                    "Aucun point n'a été retiré. Corrigez la récompense dans " +
                    "le panneau MySargal, puis réessayez."
                ),
            });
            return;
        }

        let defaire = () => {};

        if (enPourcent) {
            const taux = Math.min(100, Math.max(0, Number(reward.discount_value)));
            const lignes = order.get_orderlines ? order.get_orderlines() : [];
            const utiles = lignes.filter((l) => l && typeof l.set_discount === "function");
            if (!utiles.length) {
                await this.popup.add(ErrorPopup, {
                    title: _t("Récompense"),
                    body: _t("Ajoute d'abord les articles au ticket. Aucun point n'a été débité."),
                });
                return;
            }
            // On mémorise les remises existantes : une annulation doit rendre
            // le ticket exactement tel qu'il était.
            const avant = utiles.map((l) => ({ l: l, d: l.get_discount ? l.get_discount() : 0 }));
            utiles.forEach((l) => { try { l.set_discount(taux); } catch (e) {} });
            defaire = () => {
                avant.forEach((x) => { try { x.l.set_discount(x.d); } catch (e) {} });
            };
        } else if (enMontant) {
            const total = order.get_total_with_tax();
            const montant = Math.min(Math.round(Number(reward.discount_value)), Math.round(total));
            if (montant <= 0) {
                await this.popup.add(ErrorPopup, {
                    title: _t("Récompense"),
                    body: _t("Ajoute d'abord les articles au ticket. Aucun point n'a été débité."),
                });
                return;
            }

            let product = this._findRewardProduct();
            if (!product) {
                product = await this._fetchRewardProduct();
            }
            if (!product) {
                await this.popup.add(ErrorPopup, {
                    title: _t("Récompense"),
                    body: _t("Le produit de remise est introuvable dans cette caisse. Aucun point n'a été débité : redémarre Odoo puis mets à jour le module MySargal Caisse."),
                });
                return;
            }

            let added = false;
            try {
                await this.pos.addProductToCurrentOrder(product, {
                    price: -montant, quantity: 1, merge: false,
                });
                added = true;
            } catch (e) { /* version suivante */ }
            if (!added) {
                try {
                    order.add_product(product, { price: -montant, quantity: 1, merge: false });
                    added = true;
                } catch (e) { /* version suivante */ }
            }
            if (!added) {
                await this.popup.add(ErrorPopup, {
                    title: _t("Récompense"),
                    body: _t("La remise n'a pas pu être ajoutée au ticket. Aucun point n'a été débité."),
                });
                return;
            }
            const ligne = order.get_selected_orderline && order.get_selected_orderline();
            if (ligne && ligne.set_note) {
                try { ligne.set_note(reward.name); } catch (e) {}
            }
            defaire = () => {
                if (!ligne) return;
                try { order.removeOrderline(ligne); return; } catch (e) { /* version suivante */ }
                try { ligne.delete(); } catch (e) { /* on laisse plutot que casser */ }
            };
        }

        // 5. Débit des points, une fois la remise en place sur le ticket.
        let redeem;
        try {
            // La référence du ticket identifie l'opération : deux clics sur
            // le bouton, ou une requête rejouée après une coupure, ne peuvent
            // plus retirer les points deux fois.
            let reference = "";
            try { reference = String(order.uid || order.name || order.uuid || ""); } catch (e) {}
            redeem = await msJsonRpc("/mysargal/loyalty/redeem", {
                card_code: res.card_code,
                reward_id: reward.id,
                idempotency_key: reference ? (reference + "-" + reward.id) : "",
            });
        } catch (err) {
            defaire();
            await this.popup.add(ErrorPopup, { title: _t("MySargal"), body: err.message });
            return;
        }
        if (!redeem || !redeem.success) {
            defaire();
            await this.popup.add(ErrorPopup, {
                title: _t("Récompense"),
                body: (redeem && redeem.error) || _t("Débit refusé."),
            });
            return;
        }

        this.notification.add(
            _t("%(reward)s appliquée — %(pts)s points utilisés, il reste %(rest)s.", {
                reward: reward.name,
                pts: redeem.points_used,
                rest: redeem.points_remaining,
            }),
            { type: "success" }
        );
    }
}

ProductScreen.addControlButton({
    component: MySargalRewardButton,
    condition: function () {
        return true;
    },
});
