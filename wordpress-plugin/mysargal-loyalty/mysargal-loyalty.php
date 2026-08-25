<?php
/**
 * Plugin Name: MySargal — Fidélité & Cartes cadeaux
 * Description: Points de fidélité, récompenses et cartes cadeaux MySargal pour WooCommerce. Le client dépense sa récompense au checkout, règle avec une carte cadeau, et gagne des points sur commande payée, sans app.
 * Version: 1.3.0
 * Author: MySargal
 * Requires Plugins: woocommerce
 * License: Proprietary
 */
if (!defined('ABSPATH')) exit;

class MySargal_Loyalty {
  const OPT = 'mysargal_options';

  public function __construct() {
    add_action('admin_menu', [$this, 'menu']);
    add_action('admin_init', [$this, 'settings']);
    add_filter('plugin_action_links_' . plugin_basename(__FILE__), [$this, 'action_links']);

    add_action('woocommerce_review_order_before_payment', [$this, 'checkout_block']);
    add_action('wp_ajax_mysargal_apply_gc', [$this, 'ajax_apply']);
    add_action('wp_ajax_nopriv_mysargal_apply_gc', [$this, 'ajax_apply']);
    add_action('wp_ajax_mysargal_remove_gc', [$this, 'ajax_remove']);
    add_action('wp_ajax_nopriv_mysargal_remove_gc', [$this, 'ajax_remove']);

    // Récompenses : chercher la carte, choisir, retirer.
    foreach (['find_rewards', 'apply_reward', 'remove_reward'] as $a) {
      add_action('wp_ajax_mysargal_' . $a, [$this, 'ajax_' . $a]);
      add_action('wp_ajax_nopriv_mysargal_' . $a, [$this, 'ajax_' . $a]);
    }
    // Dernière vérification avant création de la commande : sans elle, un
    // client dont les points ont baissé entre le choix et le paiement
    // obtiendrait la remise sans rien dépenser.
    add_action('woocommerce_checkout_process', [$this, 'verifier_recompense']);
    add_action('woocommerce_cart_calculate_fees', [$this, 'apply_fee']);
    add_action('woocommerce_checkout_create_order', [$this, 'save_gc_meta'], 10, 2);

    add_action('woocommerce_payment_complete', [$this, 'on_paid']);
    add_action('woocommerce_order_status_completed', [$this, 'on_paid']);
    add_action('woocommerce_order_status_refunded', [$this, 'on_refunded']);
    add_action('woocommerce_order_status_cancelled', [$this, 'on_refunded']);
    add_action('woocommerce_thankyou', [$this, 'thankyou']);
  }

  /* ---------- Réglages ---------- */
  private function opt($k, $d = '') { $o = get_option(self::OPT, []); return isset($o[$k]) ? $o[$k] : $d; }
  public function menu() { add_submenu_page('woocommerce', 'MySargal', 'MySargal', 'manage_woocommerce', 'mysargal', [$this, 'page']); }
  public function settings() {
    register_setting('mysargal_group', self::OPT);
    add_settings_section('s', '', '__return_false', 'mysargal');
    $fields = [
      'api_key' => 'Clé API (x-api-key)',
      'base_url' => 'URL de base de l\'API',
      'enable_points' => 'Activer les points de fidélité (1 = oui)',
      'enable_giftcard' => 'Activer la carte cadeau au checkout (1 = oui)',
      'enable_rewards' => 'Activer les récompenses fidélité au checkout (1 = oui)',
    ];
    foreach ($fields as $k => $label) {
      add_settings_field($k, $label, function() use ($k) {
        $defauts_actifs = ['enable_points', 'enable_giftcard', 'enable_rewards'];
        $v = esc_attr($this->opt($k, $k === 'base_url' ? 'https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1' : (in_array($k, $defauts_actifs, true) ? '1' : '')));
        echo '<input type="text" name="' . self::OPT . '[' . $k . ']" value="' . $v . '" style="width:460px" />';
      }, 'mysargal', 's');
    }
  }
  public function page() {
    echo '<div class="wrap"><h1>MySargal — Fidélité & Cartes cadeaux</h1>';
    echo '<p>Renseignez votre clé API MySargal (Espace développeurs). Les commandes payées créditent des points, et vos clients peuvent régler avec une carte cadeau MySargal au checkout.</p>';
    echo '<form method="post" action="options.php">';
    settings_fields('mysargal_group'); do_settings_sections('mysargal'); submit_button();
    echo '</form></div>';
  }
  public function action_links($links) {
    array_unshift($links, '<a href="' . esc_url(admin_url('admin.php?page=mysargal')) . '">Réglages</a>');
    return $links;
  }

  /* ---------- Langue de la boutique ----------

     Tout le texte visible était écrit en français. Une boutique WooCommerce à
     Nairobi ou à Lagos affichait donc du français à ses clients, alors que
     MySargal ouvre désormais trente neuf pays. On suit la langue du site
     WordPress, qui est celle que le commerçant a choisie pour sa clientèle.

     Un dictionnaire interne plutot que des fichiers .mo : ceux ci demandent une
     compilation, une étape de plus à rater à chaque mise à jour, pour une
     trentaine de phrases.
  */
  private function langue() {
    $l = strtolower(substr(get_locale(), 0, 2));
    return in_array($l, ['fr', 'en', 'es'], true) ? $l : 'en';
  }

  private function t($cle) {
    $T = [
      'titre'        => ['fr' => 'Programme Fidélité', 'en' => 'Loyalty programme', 'es' => 'Programa de fidelidad'],
      'gagne'        => ['fr' => 'Vous gagnez des points avec cette commande.', 'en' => 'You earn points with this order.', 'es' => 'Ganas puntos con este pedido.'],
      'gagne_sub'    => ['fr' => 'Recevez votre carte de fidélité sur WhatsApp, sans créer de compte.', 'en' => 'Get your loyalty card on WhatsApp, no account needed.', 'es' => 'Recibe tu tarjeta de fidelidad por WhatsApp, sin crear cuenta.'],
      'num_wa'       => ['fr' => 'Numéro WhatsApp', 'en' => 'WhatsApp number', 'es' => 'Número de WhatsApp'],
      'num_ex'       => ['fr' => '77 123 45 67', 'en' => '77 123 45 67', 'es' => '77 123 45 67'],
      'rw_toggle'    => ['fr' => "+ J'ai une récompense fidélité", 'en' => '+ I have a loyalty reward', 'es' => '+ Tengo una recompensa de fidelidad'],
      'rw_ph'        => ['fr' => 'Code LC-XXXXXX ou numéro', 'en' => 'Code LC-XXXXXX or phone number', 'es' => 'Código LC-XXXXXX o número'],
      'rw_find'      => ['fr' => 'Chercher', 'en' => 'Search', 'es' => 'Buscar'],
      'rw_titre'     => ['fr' => 'Récompense', 'en' => 'Reward', 'es' => 'Recompensa'],
      'rw_pts'       => ['fr' => 'points seront retirés de votre carte', 'en' => 'points will be taken from your card', 'es' => 'puntos se descontarán de tu tarjeta'],
      'rw_vide'      => ['fr' => 'Entrez votre code ou votre numéro', 'en' => 'Enter your code or your number', 'es' => 'Introduce tu código o tu número'],
      'rw_cherche'   => ['fr' => 'Recherche...', 'en' => 'Searching...', 'es' => 'Buscando...'],
      'rw_intro'     => ['fr' => 'Carte introuvable', 'en' => 'Card not found', 'es' => 'Tarjeta no encontrada'],
      'rw_aucune'    => ['fr' => 'points, aucune récompense disponible pour le moment.', 'en' => 'points, no reward available right now.', 'es' => 'puntos, ninguna recompensa disponible ahora.'],
      'rw_pts_court' => ['fr' => 'points', 'en' => 'points', 'es' => 'puntos'],
      'rw_applique'  => ['fr' => 'Application...', 'en' => 'Applying...', 'es' => 'Aplicando...'],
      'rw_ko'        => ['fr' => "Impossible d'appliquer", 'en' => 'Could not apply', 'es' => 'No se ha podido aplicar'],
      'rw_ligne'     => ['fr' => 'Récompense fidélité', 'en' => 'Loyalty reward', 'es' => 'Recompensa de fidelidad'],
      'rw_plus_dispo'=> ['fr' => "Votre récompense MySargal n'est plus disponible : elle a été retirée du panier.", 'en' => 'Your MySargal reward is no longer available: it has been removed from the cart.', 'es' => 'Tu recompensa MySargal ya no está disponible: se ha retirado del carrito.'],
      'rw_pas_assez' => ['fr' => 'Pas assez de points pour cette récompense', 'en' => 'Not enough points for this reward', 'es' => 'No tienes puntos suficientes para esta recompensa'],
      'rw_dabord'    => ['fr' => "Retrouvez d'abord votre carte", 'en' => 'Find your card first', 'es' => 'Encuentra primero tu tarjeta'],
      'rw_invalide'  => ['fr' => 'Récompense invalide', 'en' => 'Invalid reward', 'es' => 'Recompensa no válida'],
      'rw_introuv'   => ['fr' => 'Récompense introuvable', 'en' => 'Reward not found', 'es' => 'Recompensa no encontrada'],
      'rw_pas_carte' => ['fr' => 'Aucune carte de fidélité pour ce code ni pour ce numéro', 'en' => 'No loyalty card for this code or this number', 'es' => 'Ninguna tarjeta de fidelidad con ese código ni ese número'],
      'gc_toggle'    => ['fr' => "+ J'ai une carte cadeau", 'en' => '+ I have a gift card', 'es' => '+ Tengo una tarjeta regalo'],
      'gc_ph'        => ['fr' => 'Code GC-XXXXXX', 'en' => 'Code GC-XXXXXX', 'es' => 'Código GC-XXXXXX'],
      'gc_apply'     => ['fr' => 'Appliquer', 'en' => 'Apply', 'es' => 'Aplicar'],
      'gc_ok'        => ['fr' => 'Carte cadeau appliquée.', 'en' => 'Gift card applied.', 'es' => 'Tarjeta regalo aplicada.'],
      'gc_posee'     => ['fr' => 'Carte cadeau appliquée', 'en' => 'Gift card applied', 'es' => 'Tarjeta regalo aplicada'],
      'gc_retirer'   => ['fr' => 'Retirer', 'en' => 'Remove', 'es' => 'Quitar'],
      'gc_verif'     => ['fr' => 'Vérification...', 'en' => 'Checking...', 'es' => 'Comprobando...'],
      'gc_vide'      => ['fr' => 'Entrez un code carte cadeau', 'en' => 'Enter a gift card code', 'es' => 'Introduce un código de tarjeta regalo'],
      'gc_ko'        => ['fr' => 'Carte invalide', 'en' => 'Invalid card', 'es' => 'Tarjeta no válida'],
      'gc_requis'    => ['fr' => 'Code requis', 'en' => 'Code required', 'es' => 'Código obligatorio'],
      'gc_intro'     => ['fr' => 'Carte introuvable', 'en' => 'Card not found', 'es' => 'Tarjeta no encontrada'],
      'gc_vide_solde'=> ['fr' => 'Solde épuisé', 'en' => 'No balance left', 'es' => 'Saldo agotado'],
      'gc_econo'     => ['fr' => 'Vous économisez', 'en' => 'You save', 'es' => 'Ahorras'],
      'gc_econo_fin' => ['fr' => 'avec votre carte cadeau.', 'en' => 'with your gift card.', 'es' => 'con tu tarjeta regalo.'],
      'gc_ligne'     => ['fr' => 'Carte cadeau MySargal', 'en' => 'MySargal gift card', 'es' => 'Tarjeta regalo MySargal'],
      'merci_pts'    => ['fr' => 'Vous avez gagné', 'en' => 'You earned', 'es' => 'Has ganado'],
      'merci_fid'    => ['fr' => 'de fidélité.', 'en' => 'loyalty.', 'es' => 'de fidelidad.'],
      'merci_voir'   => ['fr' => 'Voir ma carte', 'en' => 'View my card', 'es' => 'Ver mi tarjeta'],
      'point'        => ['fr' => 'point', 'en' => 'point', 'es' => 'punto'],
      'points'       => ['fr' => 'points', 'en' => 'points', 'es' => 'puntos'],
    ];
    $l = $this->langue();
    return isset($T[$cle][$l]) ? $T[$cle][$l] : (isset($T[$cle]['fr']) ? $T[$cle]['fr'] : $cle);
  }

  /* ---------- Appels API ---------- */
  // Clé publique du projet, celle qui est déjà servie dans chaque page du site
  // MySargal. Elle ne donne aucun droit : l'autorisation réelle vient du
  // x-api-key du commerçant, vérifié par la fonction elle même.
  //
  // Pourquoi elle est nécessaire : certaines routes sont publiées avec la
  // vérification de jeton activée côté passerelle. Sans en tête Authorization,
  // l'appel est rejeté AVANT d'atteindre la fonction. C'est ce qui se passait
  // sur api-redeem : la remise était accordée au client, puis le retrait des
  // points échouait en silence. Le commerçant offrait la réduction sans jamais
  // débiter les points.
  const ANON_PUBLIQUE = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imlpb2N4bHZjdW9xYWZ6bGlzcXdkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTgwODIsImV4cCI6MjA5MDkzNDA4Mn0.o-dRdHDGc5_IwCGhK5Ri67CCtZRj6J4evsxgBkMgvao';

  private function api($path, $body) {
    $url = rtrim($this->opt('base_url', 'https://iiocxlvcuoqafzlisqwd.supabase.co/functions/v1'), '/') . '/' . $path;
    $anon = $this->opt('anon_key', self::ANON_PUBLIQUE);
    $res = wp_remote_post($url, [
      'timeout' => 15,
      'headers' => [
        'Content-Type'  => 'application/json',
        'x-api-key'     => $this->opt('api_key'),
        'Authorization' => 'Bearer ' . $anon,
        'apikey'        => $anon,
      ],
      'body' => wp_json_encode($body),
    ]);
    if (is_wp_error($res)) return ['success' => false, 'error' => $res->get_error_message()];
    $data = json_decode(wp_remote_retrieve_body($res), true);
    if (!is_array($data)) $data = [];
    $data['_http'] = wp_remote_retrieve_response_code($res);
    return $data;
  }

  /* ---------- Identité de marque (couleurs du commerce) ---------- */
  private function brand_default() {
    return ['bg1' => '#0b5c3a', 'bg2' => '#0f7a4d', 'accent' => '#16a34a', 'name' => '', 'logo' => ''];
  }
  private function hex_rgb($hex) {
    $hex = ltrim((string) $hex, '#');
    if (strlen($hex) === 3) { $hex = $hex[0].$hex[0].$hex[1].$hex[1].$hex[2].$hex[2]; }
    if (strlen($hex) !== 6) return [22, 163, 74];
    return [hexdec(substr($hex,0,2)), hexdec(substr($hex,2,2)), hexdec(substr($hex,4,2))];
  }
  private function brand() {
    $key = $this->opt('api_key');
    if (!$key) return $this->brand_default();
    $ck = 'mysargal_brand_' . md5($key);
    $cached = get_transient($ck);
    if (is_array($cached)) return $cached;
    $b = $this->brand_default();
    $r = $this->api('api-brand', []);
    if (!empty($r['success']) && !empty($r['merchant'])) {
      $m = $r['merchant'];
      if (!empty($m['brand']) && !empty($m['brand']['bg2'])) {
        if (!empty($m['brand']['bg1'])) $b['bg1'] = $m['brand']['bg1'];
        $b['bg2'] = $m['brand']['bg2'];
        if (!empty($m['brand']['accent'])) $b['accent'] = $m['brand']['accent'];
      }
      if (!empty($m['name'])) $b['name'] = $m['name'];
      if (!empty($m['logo_url'])) $b['logo'] = $m['logo_url'];
    }
    set_transient($ck, $b, 6 * HOUR_IN_SECONDS);
    return $b;
  }

  /**
   * Les indicatifs proposés au checkout.
   *
   * La liste n'en comptait que neuf : un client kenyan, gambien ou rwandais ne
   * pouvait pas saisir son numéro et repartait donc sans carte de fidélité.
   * Elle couvre maintenant les trente huit pays ouverts par MySargal, dans
   * l'ordre où ils se rencontrent en Afrique de l'Ouest puis ailleurs.
   */
  private function countries() {
    return [
      '221' => 'SN +221', '225' => 'CI +225', '223' => 'ML +223',
      '226' => 'BF +226', '229' => 'BJ +229', '228' => 'TG +228',
      '227' => 'NE +227', '245' => 'GW +245', '224' => 'GN +224',
      '220' => 'GM +220', '222' => 'MR +222', '238' => 'CV +238',
      '234' => 'NG +234', '233' => 'GH +233', '254' => 'KE +254',
      '255' => 'TZ +255', '250' => 'RW +250', '256' => 'UG +256',
      '257' => 'BI +257', '251' => 'ET +251', '260' => 'ZM +260',
      '27' => 'ZA +27', '237' => 'CM +237', '241' => 'GA +241',
      '242' => 'CG +242', '243' => 'CD +243', '212' => 'MA +212',
      '213' => 'DZ +213', '216' => 'TN +216', '33' => 'FR +33',
      '32' => 'BE +32', '41' => 'CH +41', '39' => 'IT +39',
      '34' => 'ES +34', '351' => 'PT +351', '49' => 'DE +49',
      '44' => 'GB +44', '55' => 'BR +55', '1' => 'US/CA +1',
    ];
  }

  /* ---------- Bloc MySargal ---------- */
  public function checkout_block() {
    $points = ($this->opt('enable_points', '1') === '1');
    $gcon = ($this->opt('enable_giftcard', '1') === '1');
    $recon = ($this->opt('enable_rewards', '1') === '1');
    if (!$points && !$gcon && !$recon) return;
    $applied = ($gcon && WC()->session) ? WC()->session->get('mysargal_gc') : null;
    $rec_applique = ($recon && WC()->session) ? WC()->session->get('mysargal_reward') : null;
    $ajax = admin_url('admin-ajax.php'); $nonce = wp_create_nonce('mysargal_gc');
    ?>
    <?php
      $save = 0;
      if ($applied) { $save = !empty($applied['amount']) ? floatval($applied['amount']) : floatval($applied['balance']); }
      $fmt = function($n){ return number_format((float)$n, 0, ',', ' '); };
      $B = $this->brand();
      $ms_c1 = $B['bg1']; $ms_c2 = $B['bg2']; $ms_ca = $B['accent'];
      list($msr,$msg,$msb) = $this->hex_rgb($ms_ca);
      $ms_soft = "rgba($msr,$msg,$msb,.09)"; $ms_softb = "rgba($msr,$msg,$msb,.24)";
    ?>
    <div style="margin:18px 0;border:1.5px solid <?php echo $ms_softb; ?>;border-radius:16px;overflow:hidden;background:#fff;box-shadow:0 6px 20px rgba(15,61,46,.08)">
      <div style="background:linear-gradient(135deg,<?php echo $ms_c2; ?>,<?php echo $ms_c1; ?>);padding:13px 16px;display:flex;align-items:center;justify-content:space-between">
        <span style="display:flex;align-items:center;gap:9px;color:#fff;font-weight:800;font-size:14.5px">
          <span style="width:24px;height:24px;border-radius:7px;background:rgba(255,255,255,.16);display:inline-flex;align-items:center;justify-content:center">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 2 6.5 3.5 8.5 7 12 7zM12 7s3-5 5.5-3.5S15.5 7 12 7z"/></svg>
          </span><?php echo esc_html($this->t('titre')); ?></span>
        <span style="color:#fff;background:rgba(255,255,255,.18);border-radius:20px;padding:3px 10px;font-size:10px;font-weight:800;letter-spacing:.4px">MySargal</span>
      </div>
      <div style="padding:16px">
        <?php if ($points): ?>
        <div style="display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:<?php echo $ms_c1; ?>;background:<?php echo $ms_soft; ?>;border:1px solid <?php echo $ms_softb; ?>;border-radius:12px;padding:12px 13px;margin-bottom:14px;line-height:1.5">
          <span style="flex:0 0 9px;width:9px;height:9px;border-radius:50%;background:<?php echo $ms_c2; ?>;margin-top:5px"></span>
          <span><b><?php echo esc_html($this->t('gagne')); ?></b> <?php echo esc_html($this->t('gagne_sub')); ?></span>
        </div>
        <div style="font-size:11.5px;color:#6a7871;margin-bottom:6px;font-weight:700;text-transform:uppercase;letter-spacing:.4px"><?php echo esc_html($this->t('num_wa')); ?></div>
        <div style="display:flex;gap:8px;align-items:stretch;margin-bottom:<?php echo $gcon ? '14px' : '0'; ?>">
          <select name="mysargal_cc" style="width:132px;height:46px;box-sizing:border-box;padding:0 8px;border:1px solid #e0e6e2;border-radius:10px;background:#fafbfa;font-size:14px;line-height:44px;color:#152019">
            <?php foreach ($this->countries() as $cc => $lbl): ?>
              <option value="<?php echo esc_attr($cc); ?>"><?php echo esc_html($lbl); ?></option>
            <?php endforeach; ?>
          </select>
          <input type="tel" name="mysargal_phone_local" placeholder="<?php echo esc_attr($this->t('num_ex')); ?>" style="flex:1;height:46px;box-sizing:border-box;padding:0 12px;border:1px solid #e0e6e2;border-radius:10px;font-size:14px;background:#fafbfa" />
        </div>
        <?php endif; ?>

        <?php if ($recon): ?>
          <?php if (!$rec_applique): ?>
          <div id="mysargal-rw-toggle" style="font-size:13px;color:<?php echo $ms_c2; ?>;cursor:pointer;font-weight:700"><?php echo esc_html($this->t('rw_toggle')); ?></div>
          <?php endif; ?>
          <div id="mysargal-rw" style="<?php echo $rec_applique ? '' : 'display:none;'; ?>margin-top:10px;margin-bottom:12px">
            <?php if ($rec_applique): ?>
              <div style="display:flex;align-items:center;justify-content:space-between;background:<?php echo $ms_soft; ?>;border:1px solid <?php echo $ms_softb; ?>;border-radius:11px;padding:11px 13px">
                <span style="font-size:13.5px;color:<?php echo $ms_c1; ?>;font-weight:600"><?php echo esc_html($this->t('rw_titre')); ?> · <b><?php echo esc_html($rec_applique['name']); ?></b><br/><span style="font-size:12px;font-weight:400;color:#6a7871"><?php echo intval($rec_applique['pts_cost']); ?> <?php echo esc_html($this->t('rw_pts')); ?></span></span>
                <a href="#" id="mysargal-rw-remove" style="color:#6a7871;font-size:13px;text-decoration:none"><?php echo esc_html($this->t('gc_retirer')); ?></a>
              </div>
            <?php else: ?>
              <div style="display:flex;gap:8px">
                <input type="text" id="mysargal-rw-q" placeholder="<?php echo esc_attr($this->t('rw_ph')); ?>" style="flex:1;padding:11px 13px;border:1px solid #e0e6e2;border-radius:10px;background:#fafbfa" />
                <button type="button" id="mysargal-rw-find" style="background:<?php echo $ms_c2; ?>;color:#fff;border:0;border-radius:10px;padding:0 18px;font-weight:800;cursor:pointer"><?php echo esc_html($this->t('rw_find')); ?></button>
              </div>
              <div id="mysargal-rw-list" style="margin-top:9px"></div>
            <?php endif; ?>
            <div id="mysargal-rw-msg" style="font-size:12px;margin-top:7px"></div>
          </div>
          <script>
          (function($){
            var A="<?php echo esc_js($ajax); ?>", N="<?php echo esc_js($nonce); ?>";
            var VERT="<?php echo esc_js($ms_c2); ?>";
            // Les messages suivent la langue du site : un client kenyan ne doit
            // pas lire « Recherche... » en francais.
            var L={
              vide:"<?php echo esc_js($this->t('rw_vide')); ?>",
              cherche:"<?php echo esc_js($this->t('rw_cherche')); ?>",
              intro:"<?php echo esc_js($this->t('rw_intro')); ?>",
              aucune:"<?php echo esc_js($this->t('rw_aucune')); ?>",
              pts:"<?php echo esc_js($this->t('rw_pts_court')); ?>",
              applique:"<?php echo esc_js($this->t('rw_applique')); ?>",
              ko:"<?php echo esc_js($this->t('rw_ko')); ?>"
            };
            $(document).off('click.msrt').on('click.msrt','#mysargal-rw-toggle',function(){ $('#mysargal-rw').slideDown(120); $(this).hide(); });
            $(document).off('click.msrf').on('click.msrf','#mysargal-rw-find',function(){
              var q=$('#mysargal-rw-q').val();
              if(!q){ $('#mysargal-rw-msg').css('color','#c0392b').text(L.vide); return; }
              $('#mysargal-rw-msg').css('color','#5b6c61').text(L.cherche);
              $.post(A,{action:'mysargal_find_rewards',q:q,nonce:N},function(r){
                if(!r||!r.success){ $('#mysargal-rw-msg').css('color','#c0392b').text((r&&r.error)||L.intro); return; }
                if(!r.rewards||!r.rewards.length){
                  $('#mysargal-rw-msg').css('color','#5b6c61').text(r.client+' : '+r.points+' '+L.aucune);
                  return;
                }
                $('#mysargal-rw-msg').css('color','#5b6c61').text(r.client+' : '+r.points+' '+L.pts+'.');
                var h='';
                for(var i=0;i<r.rewards.length;i++){
                  var w=r.rewards[i];
                  h+='<button type="button" class="mysargal-rw-pick" data-id="'+w.id+'" style="display:block;width:100%;text-align:left;margin-top:7px;padding:11px 13px;border:1.5px solid '+VERT+';border-radius:11px;background:#fff;cursor:pointer;font-size:13.5px;font-weight:700;color:#152019">'+w.name+' <span style="font-weight:400;color:#6a7871">— '+w.pts_cost+' '+L.pts+'</span></button>';
                }
                $('#mysargal-rw-list').html(h);
              });
            });
            $(document).off('click.msrp').on('click.msrp','.mysargal-rw-pick',function(){
              var id=$(this).data('id');
              $('#mysargal-rw-msg').css('color','#5b6c61').text(L.applique);
              $.post(A,{action:'mysargal_apply_reward',reward_id:id,nonce:N},function(r){
                if(r&&r.success){ $(document.body).trigger('update_checkout'); }
                else { $('#mysargal-rw-msg').css('color','#c0392b').text((r&&r.error)||L.ko); }
              });
            });
            $(document).off('click.msrr').on('click.msrr','#mysargal-rw-remove',function(e){
              e.preventDefault();
              $.post(A,{action:'mysargal_remove_reward',nonce:N},function(){ $(document.body).trigger('update_checkout'); });
            });
          })(jQuery);
          </script>
        <?php endif; ?>

        <?php if ($gcon): ?>
          <?php if (!$applied): ?>
          <div id="mysargal-gc-toggle" style="font-size:13px;color:<?php echo $ms_c2; ?>;cursor:pointer;font-weight:700"><?php echo esc_html($this->t('gc_toggle')); ?></div>
          <?php endif; ?>
          <div id="mysargal-gc" style="<?php echo $applied ? '' : 'display:none;'; ?>margin-top:10px">
            <?php if ($applied): ?>
              <div style="display:flex;align-items:center;justify-content:space-between;background:<?php echo $ms_soft; ?>;border:1px solid <?php echo $ms_softb; ?>;border-radius:11px;padding:11px 13px">
                <span style="font-size:13.5px;color:<?php echo $ms_c1; ?>;font-weight:600"><?php echo esc_html($this->t('gc_posee')); ?> · <b><?php echo esc_html($applied['code']); ?></b></span>
                <a href="#" id="mysargal-gc-remove" style="color:#6a7871;font-size:13px;text-decoration:none"><?php echo esc_html($this->t('gc_retirer')); ?></a>
              </div>
              <?php if ($save > 0): ?>
              <div style="display:flex;align-items:center;gap:10px;background:<?php echo $ms_soft; ?>;border:1px solid <?php echo $ms_softb; ?>;border-radius:11px;padding:11px 13px;margin-top:10px;font-size:13px;color:<?php echo $ms_c1; ?>;font-weight:700">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="<?php echo $ms_c2; ?>" stroke-width="1.8"><path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7S9 2 6.5 3.5 8.5 7 12 7z"/></svg>
                <span><?php echo esc_html($this->t('gc_econo')); ?> <b><?php echo wp_kses_post(wc_price($save)); ?></b> <?php echo esc_html($this->t('gc_econo_fin')); ?></span>
              </div>
              <?php endif; ?>
            <?php else: ?>
              <div style="display:flex;gap:8px">
                <input type="text" id="mysargal-gc-code" placeholder="<?php echo esc_attr($this->t('gc_ph')); ?>" style="flex:1;padding:11px 13px;border:1px solid #e0e6e2;border-radius:10px;font-family:monospace;background:#fafbfa" />
                <button type="button" id="mysargal-gc-apply" style="background:<?php echo $ms_c2; ?>;color:#fff;border:0;border-radius:10px;padding:0 18px;font-weight:800;cursor:pointer"><?php echo esc_html($this->t('gc_apply')); ?></button>
              </div>
            <?php endif; ?>
            <div id="mysargal-gc-msg" style="font-size:12px;margin-top:7px"></div>
          </div>
          <script>
          (function($){
            var A="<?php echo esc_js($ajax); ?>", N="<?php echo esc_js($nonce); ?>";
            $(document).off('click.msgt').on('click.msgt','#mysargal-gc-toggle',function(){ $('#mysargal-gc').slideDown(120); $(this).hide(); });
            $(document).off('click.msgc').on('click.msgc','#mysargal-gc-apply',function(){
              var c=$('#mysargal-gc-code').val();
              if(!c){ $('#mysargal-gc-msg').css('color','#c0392b').text("<?php echo esc_js($this->t('gc_vide')); ?>"); return; }
              $('#mysargal-gc-msg').css('color','#5b6c61').text("<?php echo esc_js($this->t('gc_verif')); ?>");
              $.post(A,{action:'mysargal_apply_gc',code:c,nonce:N},function(r){
                if(r&&r.success){
                  $('#mysargal-gc-msg').css('color','<?php echo esc_js($ms_ca); ?>').text("<?php echo esc_js($this->t('gc_ok')); ?>");
                  $('#mysargal-gc-code,#mysargal-gc-apply').prop('disabled',true);
                  $(document.body).trigger('update_checkout');
                } else { $('#mysargal-gc-msg').css('color','#c0392b').text((r&&r.error)||"<?php echo esc_js($this->t('gc_ko')); ?>"); }
              });
            });
            $(document).off('click.msgcr').on('click.msgcr','#mysargal-gc-remove',function(e){
              e.preventDefault();
              $.post(A,{action:'mysargal_remove_gc',nonce:N},function(){ $(document.body).trigger('update_checkout'); });
            });
          })(jQuery);
          </script>
        <?php endif; ?>
      </div>
    </div>
    <?php
  }

  public function ajax_apply() {
    check_ajax_referer('mysargal_gc', 'nonce');
    $code = strtoupper(trim(sanitize_text_field($_POST['code'] ?? '')));
    if (!$code) wp_send_json(['success' => false, 'error' => $this->t('gc_requis')]);
    $r = $this->api('api-giftcard-balance', ['code' => $code]);
    if (empty($r['success'])) wp_send_json(['success' => false, 'error' => $r['error'] ?? $this->t('gc_intro')]);
    if (($r['balance'] ?? 0) <= 0) wp_send_json(['success' => false, 'error' => $this->t('gc_vide_solde')]);
    WC()->session->set('mysargal_gc', ['code' => $code, 'balance' => floatval($r['balance']), 'amount' => 0]);
    wp_send_json(['success' => true, 'balance' => $r['balance']]);
  }
  public function ajax_remove() {
    check_ajax_referer('mysargal_gc', 'nonce');
    if (WC()->session) WC()->session->set('mysargal_gc', null);
    wp_send_json(['success' => true]);
  }

  /* ---------- Récompenses fidélité ---------- */

  /**
   * Cherche la carte du client. Le champ accepte un code ou un numéro : le
   * client a rarement son code sous les yeux, mais toujours son téléphone.
   */
  public function ajax_find_rewards() {
    check_ajax_referer('mysargal_gc', 'nonce');
    $saisie = trim(sanitize_text_field($_POST['q'] ?? ''));
    if (!$saisie) wp_send_json(['success' => false, 'error' => $this->t('rw_vide')]);

    $chiffres = preg_replace('/[^0-9]/', '', $saisie);
    $nu = preg_replace('/[\s+.\-()]/', '', $saisie);
    $est_numero = (strlen($chiffres) >= 6 && strlen($chiffres) >= strlen($nu));
    $corps = $est_numero ? ['phone' => $saisie] : ['card_code' => strtoupper($saisie)];

    $r = $this->api('api-rewards', $corps);
    if (empty($r['success'])) {
      $msg = (($r['error'] ?? '') === 'not_found')
        ? $this->t('rw_pas_carte')
        : ($r['error'] ?? $this->t('gc_intro'));
      wp_send_json(['success' => false, 'error' => $msg]);
    }

    $dispo = [];
    foreach (($r['rewards'] ?? []) as $rw) {
      if (empty($rw['available'])) continue;
      $dispo[] = [
        'id' => $rw['id'],
        'name' => $rw['name'],
        'pts_cost' => intval($rw['pts_cost'] ?? 0),
        'discount_type' => $rw['discount_type'] ?? null,
        'discount_value' => isset($rw['discount_value']) ? floatval($rw['discount_value']) : null,
      ];
    }
    if (WC()->session) {
      WC()->session->set('mysargal_carte', [
        'card_code' => $r['card_code'] ?? '',
        'client' => $r['client'] ?? '',
        'points' => intval($r['points'] ?? 0),
      ]);
    }
    wp_send_json([
      'success' => true,
      'client' => $r['client'] ?? '',
      'points' => intval($r['points'] ?? 0),
      'card_code' => $r['card_code'] ?? '',
      'rewards' => $dispo,
    ]);
  }

  public function ajax_apply_reward() {
    check_ajax_referer('mysargal_gc', 'nonce');
    $id = sanitize_text_field($_POST['reward_id'] ?? '');
    if (!$id || !WC()->session) wp_send_json(['success' => false, 'error' => $this->t('rw_invalide')]);
    $carte = WC()->session->get('mysargal_carte');
    if (empty($carte['card_code'])) wp_send_json(['success' => false, 'error' => $this->t('rw_dabord')]);

    // On relit le catalogue plutot que de faire confiance au navigateur : le
    // montant de la remise ne doit jamais venir du client.
    $r = $this->api('api-rewards', ['card_code' => $carte['card_code']]);
    if (empty($r['success'])) wp_send_json(['success' => false, 'error' => $r['error'] ?? $this->t('gc_intro')]);
    foreach (($r['rewards'] ?? []) as $rw) {
      if ((string) $rw['id'] !== (string) $id) continue;
      if (empty($rw['available'])) wp_send_json(['success' => false, 'error' => $this->t('rw_pas_assez')]);
      WC()->session->set('mysargal_reward', [
        'card_code' => $r['card_code'],
        'reward_id' => $rw['id'],
        'name' => $rw['name'],
        'pts_cost' => intval($rw['pts_cost'] ?? 0),
        'discount_type' => $rw['discount_type'] ?? null,
        'discount_value' => isset($rw['discount_value']) ? floatval($rw['discount_value']) : 0,
        'amount' => 0,
      ]);
      wp_send_json(['success' => true, 'name' => $rw['name']]);
    }
    wp_send_json(['success' => false, 'error' => $this->t('rw_introuv')]);
  }

  public function ajax_remove_reward() {
    check_ajax_referer('mysargal_gc', 'nonce');
    if (WC()->session) WC()->session->set('mysargal_reward', null);
    wp_send_json(['success' => true]);
  }

  /**
   * Le client a pu dépenser ses points ailleurs entre le choix et le paiement.
   * On revalide juste avant la création de la commande : sinon il repartirait
   * avec la remise sans que les points soient retirés.
   */
  public function verifier_recompense() {
    if (!WC()->session) return;
    $rec = WC()->session->get('mysargal_reward');
    if (empty($rec['reward_id'])) return;
    $r = $this->api('api-rewards', ['card_code' => $rec['card_code']]);
    $encore = false;
    if (!empty($r['success'])) {
      foreach (($r['rewards'] ?? []) as $rw) {
        if ((string) $rw['id'] === (string) $rec['reward_id'] && !empty($rw['available'])) { $encore = true; break; }
      }
    }
    if (!$encore) {
      WC()->session->set('mysargal_reward', null);
      wc_add_notice($this->t('rw_plus_dispo'), 'error');
    }
  }

  /* ---------- Carte cadeau : remise appliquée ---------- */
  public function apply_fee($cart) {
    if (is_admin() && !defined('DOING_AJAX')) return;
    if (!WC()->session) return;

    // La récompense s'applique d'abord : elle porte sur le prix des articles,
    // pas sur ce qu'il reste à payer après une carte cadeau. Une carte cadeau
    // est un moyen de paiement, une récompense est une remise commerciale.
    $sous_total = floatval($cart->get_subtotal());
    $remise = 0;
    $rec = WC()->session->get('mysargal_reward');
    if ($rec && !empty($rec['reward_id'])) {
      if (($rec['discount_type'] ?? '') === 'percent') {
        $taux = max(0, min(100, floatval($rec['discount_value'])));
        $remise = round($sous_total * $taux / 100, wc_get_price_decimals());
      } elseif (($rec['discount_type'] ?? '') === 'amount') {
        $remise = floatval($rec['discount_value']);
      }
      $remise = min($remise, $sous_total);
      if ($remise > 0) {
        $rec['amount'] = $remise;
        WC()->session->set('mysargal_reward', $rec);
        $cart->add_fee($this->t('rw_ligne') . ' (' . $rec['name'] . ')', -$remise, false);
      }
    }

    $gc = WC()->session->get('mysargal_gc');
    if (!$gc) return;
    $restant = max(0, $sous_total - $remise);
    $use = min(floatval($gc['balance']), $restant);
    if ($use <= 0) return;
    $gc['amount'] = $use;
    WC()->session->set('mysargal_gc', $gc);
    $cart->add_fee($this->t('gc_ligne') . ' (' . $gc['code'] . ')', -$use, false);
  }

  public function save_gc_meta($order, $data) {
    $cc = isset($_POST['mysargal_cc']) ? preg_replace('/[^0-9]/', '', sanitize_text_field($_POST['mysargal_cc'])) : '';
    $local = isset($_POST['mysargal_phone_local']) ? preg_replace('/[^0-9]/', '', sanitize_text_field($_POST['mysargal_phone_local'])) : '';
    if ($local) {
      $local = ltrim($local, '0');
      $order->update_meta_data('_mysargal_phone', '+' . $cc . $local);
    }
    if (!WC()->session) return;
    $gc = WC()->session->get('mysargal_gc');
    if ($gc && !empty($gc['amount'])) {
      $order->update_meta_data('_mysargal_gc_code', $gc['code']);
      $order->update_meta_data('_mysargal_gc_amount', $gc['amount']);
    }
    $rec = WC()->session->get('mysargal_reward');
    if ($rec && !empty($rec['reward_id']) && !empty($rec['amount'])) {
      $order->update_meta_data('_mysargal_reward_id', $rec['reward_id']);
      $order->update_meta_data('_mysargal_reward_card', $rec['card_code']);
      $order->update_meta_data('_mysargal_reward_name', $rec['name']);
      $order->update_meta_data('_mysargal_reward_amount', $rec['amount']);
      $order->update_meta_data('_mysargal_reward_pts', $rec['pts_cost']);
    }
  }

  /* ---------- Débit + points au paiement ---------- */
  public function on_paid($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) return;

    $code = $order->get_meta('_mysargal_gc_code');
    $amount = floatval($order->get_meta('_mysargal_gc_amount'));
    if ($code && $amount > 0 && !$order->get_meta('_mysargal_gc_redeemed')) {
      $r = $this->api('api-giftcard-redeem', [
        'code' => $code, 'amount' => round($amount),
        'reference' => 'wc-' . $order_id, 'idempotency_key' => 'wc-' . $order_id,
      ]);
      if (!empty($r['success'])) {
        $order->update_meta_data('_mysargal_gc_redeemed', '1');
        $order->update_meta_data('_mysargal_gc_auth', $r['authorization_code'] ?? '');
        $order->add_order_note('Carte cadeau MySargal débitée : ' . wc_price(round($amount)) . ' (auth ' . ($r['authorization_code'] ?? '') . ').');
      } else {
        $order->add_order_note('Échec débit carte cadeau MySargal : ' . ($r['error'] ?? 'inconnu'));
      }
      $order->save();
    }

    // Récompense : les points sont retirés une fois la commande payée. La
    // remise est déja inscrite sur la commande, on ne peut donc plus la
    // défaire ici : en cas d'échec on le dit clairement au commerçant plutot
    // que d'offrir la remise en silence.
    $rec_id = $order->get_meta('_mysargal_reward_id');
    if ($rec_id && !$order->get_meta('_mysargal_reward_done')) {
      $r = $this->api('api-redeem', [
        'card_code' => $order->get_meta('_mysargal_reward_card'),
        'reward_id' => $rec_id,
        'idempotency_key' => 'wc-reward-' . $order_id,
      ]);
      if (!empty($r['success'])) {
        $order->update_meta_data('_mysargal_reward_done', '1');
        $order->add_order_note(sprintf(
          'Récompense MySargal utilisée : %s. %d points retirés, il en reste %d.',
          $order->get_meta('_mysargal_reward_name'),
          intval($r['points_used'] ?? 0),
          intval($r['points_remaining'] ?? 0)
        ));
      } else {
        $order->update_meta_data('_mysargal_reward_echec', '1');
        $order->add_order_note(sprintf(
          'ATTENTION : la remise fidélité de %s a été accordée mais les points n\'ont pas pu être retirés (%s). À régulariser dans le panneau MySargal.',
          wc_price($order->get_meta('_mysargal_reward_amount')),
          $r['error'] ?? 'raison inconnue'
        ));
      }
      $order->save();
    }

    if ($this->opt('enable_points', '1') === '1' && !$order->get_meta('_mysargal_points_done')) {
      $phone = $order->get_meta('_mysargal_phone') ? $order->get_meta('_mysargal_phone') : $order->get_billing_phone();
      $r = $this->api('api-order', [
        'phone' => $phone,
        'name' => trim($order->get_billing_first_name() . ' ' . $order->get_billing_last_name()),
        'amount' => floatval($order->get_total()),
        'order_id' => (string) $order_id,
      ]);
      if (!empty($r['success'])) {
        $order->update_meta_data('_mysargal_points_done', '1');
        $order->update_meta_data('_mysargal_points_added', intval($r['points_added'] ?? 0));
        $order->update_meta_data('_mysargal_card_url', $r['card_url'] ?? '');
        if (!empty($r['points_added'])) $order->add_order_note('Points MySargal crédités : +' . intval($r['points_added']) . ' (carte ' . ($r['card_code'] ?? '') . ').');
        $order->save();
      }
    }

    if (WC()->session) {
      WC()->session->set('mysargal_gc', null);
      WC()->session->set('mysargal_reward', null);
      WC()->session->set('mysargal_carte', null);
    }
  }

  public function on_refunded($order_id) {
    $order = wc_get_order($order_id);
    if (!$order) return;
    $auth = $order->get_meta('_mysargal_gc_auth');
    if ($auth && !$order->get_meta('_mysargal_gc_voided')) {
      $r = $this->api('api-giftcard-void', ['authorization_code' => $auth]);
      if (!empty($r['success'])) {
        $order->update_meta_data('_mysargal_gc_voided', '1');
        $order->add_order_note('Carte cadeau MySargal recréditée (annulation) : ' . wc_price(intval($r['amount_reversed'] ?? 0)) . '.');
        $order->save();
      }
    }
  }

  /* ---------- Remerciement ---------- */
  public function thankyou($order_id) {
    $order = wc_get_order($order_id); if (!$order) return;
    $pts = intval($order->get_meta('_mysargal_points_added'));
    $url = $order->get_meta('_mysargal_card_url');
    if ($pts > 0) {
      $B = $this->brand();
      $c1 = $B['bg1']; $c2 = $B['bg2']; $ca = $B['accent'];
      list($tr,$tg,$tb) = $this->hex_rgb($ca); $tsoftb = "rgba($tr,$tg,$tb,.24)";
      echo '<div style="margin:16px 0;border:1px solid ' . $tsoftb . ';border-radius:12px;overflow:hidden;background:#fff">'
        . '<div style="background:linear-gradient(135deg,' . esc_attr($c1) . ',' . esc_attr($c2) . ');padding:10px 14px;font-weight:800"><span style="color:' . esc_attr($ca) . '">My</span><span style="color:#fff">Sargal</span></div>'
        . '<div style="padding:14px;font-size:14px;color:' . esc_attr($c1) . '">' . esc_html($this->t('merci_pts')) . ' <b>' . $pts . ' ' . esc_html($pts > 1 ? $this->t('points') : $this->t('point')) . '</b> ' . esc_html($this->t('merci_fid'))
        . ($url ? ' <a href="' . esc_url($url) . '" target="_blank" style="color:' . esc_attr($ca) . ';font-weight:600">' . esc_html($this->t('merci_voir')) . '</a>' : '') . '</div></div>';
    }
  }
}
new MySargal_Loyalty();
