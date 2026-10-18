// Shop-specific hints. Anything not listed here falls back to the generic
// button-text and price heuristics in content.js, so a missing selector only
// makes detection less precise; it never breaks the shop.
var FM_SITES = [
  {
    name: 'Amazon',
    match: /(^|\.)amazon\.(com\.be|nl|de|fr|es|it|co\.uk|com)$/,
    buy: ['#buy-now-button', 'input[name="submit.buy-now"]', '#one-click-button'],
    checkout: [
      '#sc-buy-box-ptc-button',
      'input[name="proceedToRetailCheckout"]',
      '#submitOrderButtonId',
      '#bottomSubmitOrderButtonId',
      'input[name="placeYourOrder1"]',
      '#placeYourOrder'
    ],
    cart: ['#add-to-cart-button', 'input[name="submit.add-to-cart"]'],
    price: [
      '#corePrice_feature_div .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .priceToPay .a-offscreen',
      '.priceToPay .a-offscreen',
      '#apex_desktop .a-offscreen',
      '#price_inside_buybox'
    ],
    total: [
      '.grand-total-price',
      '.order-summary-grand-total .a-color-price',
      '#sc-subtotal-amount-buybox .a-offscreen',
      '#sc-subtotal-amount-buybox',
      '#sc-subtotal-amount-activecart'
    ],
    title: ['#productTitle'],
    cartCount: ['#nav-cart-count']
  },
  {
    name: 'bol',
    match: /(^|\.)bol\.com$/,
    title: ['[data-test="title"]', 'h1']
  },
  {
    name: 'Coolblue',
    match: /(^|\.)coolblue\.(be|nl|de)$/,
    title: ['h1']
  },
  {
    name: 'Zalando',
    match: /(^|\.)zalando\.(be|nl|de|fr)$/,
    title: ['h1']
  }
];

// Button labels that mean "this commits money". Matched against the button's
// visible text, value or aria-label, lower-cased. EN / NL / FR / DE.
var FM_PHRASES = {
  buy: [
    'buy now', 'nu kopen', 'koop nu', 'direct kopen', 'meteen kopen',
    'acheter maintenant', 'achat imm\u00e9diat', 'jetzt kaufen', 'sofort kaufen'
  ],
  checkout: [
    'place your order', 'place order', 'complete order', 'complete purchase',
    'proceed to checkout', 'go to checkout', 'checkout', 'check out', 'pay now',
    'bestelling plaatsen', 'plaats bestelling', 'plaats je bestelling', 'bestellen en betalen',
    'nu bestellen', 'afrekenen', 'naar de kassa', 'verder naar bestellen', 'doorgaan naar afrekenen',
    'verder naar betalen', 'betalen', 'nu betalen',
    'passer la commande', 'valider la commande', 'commander', 'payer', 'finaliser la commande',
    'zur kasse', 'kostenpflichtig bestellen', 'jetzt bestellen', 'jetzt bezahlen', 'bezahlen'
  ],
  cart: [
    'add to cart', 'add to basket', 'add to bag',
    'in winkelwagen', 'in mijn winkelwagen', 'toevoegen aan winkelwagen', 'in winkelmandje', 'in winkelmand',
    'ajouter au panier', 'in den warenkorb', 'in den einkaufswagen'
  ],
  ignore: [
    'continue shopping', 'verder winkelen', 'doorgaan met winkelen', 'continuer mes achats',
    'weiter einkaufen', 'wishlist', 'verlanglijst', 'compare', 'vergelijk'
  ]
};

var FM_TOTAL_WORDS = /\b(order total|grand total|total|totaal|te betalen|totaalbedrag|totale prijs|gesamtsumme|gesamtbetrag|summe|montant total|total \u00e0 payer)\b/i;
