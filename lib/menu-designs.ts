/**
 * Premium menu templates ("designs"). A design is a preset written into a NEW Layout Studio board: a layout,
 * colour roles, fonts, realistic sample content and an optional bundled stock photo. Nothing is live-linked:
 * editing this file never changes a saved board, and boards without `design` render exactly as before.
 *
 * The drawing lives in lib/menu-design-svg.ts and is shared by the browser preview and the server PNG.
 */
import type { BoardFontId } from "@/lib/board-fonts";
import type { LayoutDocument, LayoutSection, LayoutTemplate } from "@/lib/layout-studio";

export type DesignComposition = "showcase" | "columns" | "promo" | "list" | "cards" | "featured";
export type DesignStyle = "dark" | "light" | "bold";
export type DesignBusiness = "restaurant" | "cafe" | "fast" | "bar" | "sweets";
export type Localized = { en: string; es: string };

export type DesignVariant = {
  id: string;
  name: Localized;
  paper: string;
  ink: string;
  muted: string;
  accent: string;
  panel: string;
  /** Price tag fill (tag designs). Defaults to accent. */
  tag?: string;
};

export type DesignLook = {
  head: BoardFontId;
  headWeight: 400 | 700 | 800;
  body: BoardFontId;
  /** Section headings use the heading face (true) or the body face. */
  sectionInHead: boolean;
  sectionWeight: 400 | 700 | 800;
  sectionTracking: number;
  namesUpper?: boolean;
  /** Dotted leader between name and price. */
  leader?: boolean;
  /** Thin rule under each section heading. */
  rule?: boolean;
  /** Prices in filled tags. */
  tags?: boolean;
  /** Price colour: accent (true) or menu text colour. */
  accentPrices?: boolean;
  /** Card templates: photo shape. */
  photoShape?: "rect" | "circle";
};

export const STOCK_PHOTOS = [
  "steak", "latte", "burger", "coldbrew", "pizza", "ribs", "pancakes", "interior", "croissant",
  // Item photos for the photo templates (Unsplash licence; ids in docs/MENU_TEMPLATES.md).
  "salmon", "pasta", "parfait", "smoothie", "cinnamon", "bowl", "sandwich", "salad", "donuts", "tacos", "carnitas",
  "streettacos", "wings", "macarons", "cake", "chicken", "muffins", "quesadilla", "burrito",
] as const;
export type StockPhotoId = (typeof STOCK_PHOTOS)[number];

export function isStockPhoto(value: unknown): value is StockPhotoId {
  return typeof value === "string" && (STOCK_PHOTOS as readonly string[]).includes(value);
}
/** Browser path of a stock photo (public/menu-templates). The server reads the same file from assets/menu-templates. */
export function stockPhotoPath(id: StockPhotoId) {
  return `/menu-templates/${id}.jpg`;
}

type Sample = { title: string; subtitle: string; footer: string; featureTitle: string; featureDetail: string; sections: LayoutSection[] };

export type MenuDesign = {
  id: string;
  composition: DesignComposition;
  business: DesignBusiness;
  style: DesignStyle;
  name: Localized;
  blurb: Localized;
  look: DesignLook;
  variants: DesignVariant[];
  stock: StockPhotoId | null;
  sample: Sample;
  /** Item photos on non-card templates: "thumbs" shows them by default. Absent = text-focused. */
  photoStyle?: "thumbs" | "text";
};

/** Layout Studio geometry each composition is drawn on. Keeps the frame and the video box contract intact. */
export const COMPOSITION_LAYOUT: Record<DesignComposition, { template: LayoutTemplate; split: number; columnWidths: [number, number, number] | null }> = {
  showcase: { template: "split-50", split: 0.59375, columnWidths: null },
  columns: { template: "two-menu-promo", split: 0.35, columnWidths: [0.35, 0.35, 0.3] },
  promo: { template: "menu-promo-67", split: 0.65625, columnWidths: null },
  list: { template: "triple-column", split: 1 / 3, columnWidths: null },
  // Photo templates fill the whole board with menu content; there is no single feature photo or video area.
  cards: { template: "triple-column", split: 1 / 3, columnWidths: null },
  featured: { template: "triple-column", split: 1 / 3, columnWidths: null },
};

const i = (name: string, price: string, description = "", stockPhoto?: StockPhotoId) => ({ name, price, description, ...(stockPhoto ? { stockPhoto } : {}) });
const v = (id: string, en: string, es: string, paper: string, ink: string, muted: string, accent: string, panel: string, tag?: string): DesignVariant =>
  ({ id, name: { en, es }, paper, ink, muted, accent, panel, ...(tag ? { tag } : {}) });

export const MENU_DESIGNS: MenuDesign[] = [
  {
    id: "modern-restaurant", composition: "showcase", business: "restaurant", style: "dark",
    name: { en: "Modern Restaurant", es: "Restaurante moderno" },
    blurb: { en: "Dark, quiet and upscale. Serif headings, brass accents, one hero photo.", es: "Oscuro, sobrio y elegante. Títulos con serifa, detalles dorados y una foto principal." },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.12, leader: true },
    variants: [
      v("brass", "Charcoal & brass", "Carbón y latón", "#131416", "#f3eee5", "#a89f92", "#c9a46a", "#1b1c1f"),
      v("midnight", "Midnight & copper", "Medianoche y cobre", "#0d1526", "#eef2f8", "#93a1b8", "#d38d5f", "#14203a"),
      v("ivory", "Ivory & ink", "Marfil y tinta", "#f4efe6", "#17171a", "#6b645a", "#8a6a3b", "#e9e1d3"),
    ],
    stock: "steak",
    sample: {
      title: "Ember & Oak", subtitle: "Wood-fired kitchen · Dinner from 5 pm", footer: "Ask about tonight’s wine pairings · Gluten-free options available",
      featureTitle: "Chef’s selection", featureDetail: "28-day dry-aged ribeye, smoked butter · $46",
      sections: [
        { name: "Starters", items: [i("Burrata", "$16", "Heirloom tomato, basil oil, sourdough"), i("Charred octopus", "$19", "Romesco, fingerling potato, lemon"), i("Beef tartare", "$18", "Cured yolk, capers, rye crisp")] },
        { name: "From the fire", items: [i("Ribeye 14 oz", "$46", "Dry-aged, bone marrow butter"), i("Half chicken", "$29", "Salsa verde, charred lemon"), i("Whole branzino", "$34", "Fennel, citrus, olive"), i("Wild mushroom risotto", "$26", "Parmesan, thyme, truffle")] },
        { name: "Dessert", items: [i("Basque cheesecake", "$12", "Burnt top, seasonal fruit"), i("Dark chocolate tart", "$13", "Sea salt, crème fraîche")] },
      ],
    },
  },
  {
    id: "trattoria", composition: "showcase", business: "restaurant", style: "light",
    name: { en: "Trattoria", es: "Trattoria" },
    blurb: { en: "Warm Italian classic. Cream paper, herb green and a wood-fired pizza.", es: "Clásico italiano y cálido. Papel crema, verde albahaca y una pizza al horno." },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.1, leader: true },
    variants: [
      v("basil", "Cream & basil", "Crema y albahaca", "#f6f0e4", "#1f2a1f", "#5f604c", "#2f6b3a", "#2f6b3a"),
      v("terracotta", "Terracotta", "Terracota", "#f7efe6", "#2a1a14", "#6f584c", "#a8432a", "#a8432a"),
      v("notte", "Notte", "Notte", "#161a17", "#f1ece0", "#a9a493", "#d9b46a", "#232923"),
    ],
    stock: "pizza",
    sample: {
      title: "Nonna Rosa", subtitle: "Handmade pasta · Wood-fired pizza", footer: "Half portions of pasta available · Ask for our gluten-free crust",
      featureTitle: "Pizza of the week", featureDetail: "Fennel sausage, broccoli rabe, smoked mozzarella · $19",
      sections: [
        { name: "Antipasti", items: [i("Arancini", "$11", "Saffron risotto, mozzarella"), i("Burrata & prosciutto", "$17", "Grilled bread, olive oil")] },
        { name: "Pizza", items: [i("Margherita", "$16", "San Marzano, fior di latte, basil"), i("Diavola", "$18", "Spicy salami, chili honey"), i("Funghi", "$18", "Roasted mushrooms, taleggio")] },
        { name: "Pasta", items: [i("Cacio e pepe", "$19", "Tonnarelli, pecorino, black pepper"), i("Bolognese", "$22", "Tagliatelle, slow-cooked ragù"), i("Pesto Genovese", "$20", "Trofie, green beans, potato")] },
        { name: "Dolci", items: [i("Tiramisù", "$10"), i("Panna cotta", "$9", "Berries, aged balsamic")] },
      ],
    },
  },
  {
    id: "cocktail-lounge", composition: "showcase", business: "bar", style: "dark",
    name: { en: "Cocktail Lounge", es: "Bar de cócteles" },
    blurb: { en: "Low light and copper. Signature cocktails beside a moody room photo.", es: "Luz tenue y cobre. Cócteles de autor junto a una foto del local." },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.18, leader: true },
    variants: [
      v("copper", "Copper", "Cobre", "#120f0d", "#f5ece2", "#a8998b", "#d98b4e", "#1d1814"),
      v("emerald", "Emerald", "Esmeralda", "#0c1714", "#e9f3ee", "#93aba2", "#4fc59a", "#13221d"),
      v("plum", "Plum", "Ciruela", "#170f19", "#f4eaf4", "#ab98ad", "#e08fc2", "#22172a"),
    ],
    stock: "interior",
    sample: {
      title: "The Copper Room", subtitle: "Cocktails · Wine · Small plates", footer: "Happy hour weekdays 4–6 pm · Please drink responsibly",
      featureTitle: "Tonight", featureDetail: "Live jazz from 8 pm · No cover",
      sections: [
        { name: "Signature cocktails", items: [i("Smoked old fashioned", "$15", "Bourbon, maple, orange bitters"), i("Copper mule", "$13", "Vodka, ginger beer, lime"), i("Garden spritz", "$12", "Aperol, elderflower, prosecco"), i("Espresso martini", "$14", "Vodka, cold brew, coffee liqueur")] },
        { name: "Wine by the glass", items: [i("Pinot noir", "$13", "Willamette Valley"), i("Sauvignon blanc", "$11", "Marlborough"), i("Cava brut", "$10", "Penedès")] },
        { name: "Small plates", items: [i("Truffle fries", "$9"), i("Crispy calamari", "$14", "Lemon aioli"), i("Cheese board", "$18", "Three cheeses, honeycomb")] },
      ],
    },
  },
  {
    id: "coffee-shop", composition: "columns", business: "cafe", style: "light",
    name: { en: "Coffee Shop", es: "Cafetería" },
    blurb: { en: "Warm and minimal. Two menu columns and a photo with today’s special.", es: "Cálido y minimalista. Dos columnas de menú y una foto con la especialidad del día." },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.12, rule: true, accentPrices: true },
    variants: [
      v("oat", "Oat & forest", "Avena y bosque", "#f3ede4", "#2a1f17", "#6d5d50", "#2f5d50", "#2f5d50"),
      v("linen", "Linen & clay", "Lino y arcilla", "#f8f4ef", "#2b2420", "#75655a", "#a2552e", "#a2552e"),
      v("espresso", "Espresso", "Espresso", "#221913", "#f4eadc", "#b8a796", "#e0a868", "#3a2a1f"),
    ],
    stock: "latte",
    sample: {
      title: "Little Harbor Coffee", subtitle: "Roasted in small batches", footer: "Oat, almond and whole milk at no extra charge · Free Wi-Fi",
      featureTitle: "Maple oat latte", featureDetail: "Fall special · $5.75",
      sections: [
        { name: "Espresso bar", items: [i("Espresso", "3.25"), i("Cortado", "4.00"), i("Flat white", "4.75"), i("Latte", "5.25", "Hot or iced"), i("Cappuccino", "4.75")] },
        { name: "Brewed & cold", items: [i("Drip coffee", "3.00", "House blend, refills $1"), i("Cold brew", "4.50", "Steeped 18 hours"), i("Chai latte", "5.00"), i("Matcha latte", "5.50")] },
        { name: "Bakery", items: [i("Butter croissant", "3.75"), i("Almond croissant", "4.50"), i("Banana bread", "3.95", "Walnuts, brown butter"), i("Morning bun", "4.25", "Orange, cinnamon sugar")] },
      ],
    },
  },
  {
    id: "bakery", composition: "columns", business: "cafe", style: "light",
    name: { en: "Neighborhood Bakery", es: "Panadería de barrio" },
    blurb: { en: "Butter-yellow and serif. Breads, pastries and a flaky croissant photo.", es: "Amarillo mantequilla y serifa. Panes, bollería y una foto de cruasán." },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.08, rule: true, leader: true },
    variants: [
      v("butter", "Butter", "Mantequilla", "#fbf3df", "#2b2116", "#6e5f4b", "#9a5a12", "#9a5a12"),
      v("rose", "Rose", "Rosa", "#fbf0ee", "#2d1d1e", "#76605f", "#b04a5a", "#b04a5a"),
      v("rye", "Rye", "Centeno", "#1f1a14", "#f3ebdd", "#b3a68f", "#e3b465", "#2e261d"),
    ],
    stock: "croissant",
    sample: {
      title: "Golden Crumb Bakery", subtitle: "Baked here every morning since 1998", footer: "Whole cakes to order with 48 hours’ notice",
      featureTitle: "Fresh at 7 am", featureDetail: "Sourdough loaves · Limited batch",
      sections: [
        { name: "Pastries", items: [i("Butter croissant", "$3.75"), i("Pain au chocolat", "$4.25"), i("Cinnamon roll", "$4.50", "Cream cheese glaze"), i("Fruit danish", "$4.25", "Seasonal fruit")] },
        { name: "Breads", items: [i("Country sourdough", "$9"), i("Seeded rye", "$8"), i("Baguette", "$4")] },
        { name: "Cakes & cookies", items: [i("Carrot cake slice", "$6.50"), i("Lemon tart", "$5.75"), i("Chocolate chip cookie", "$3")] },
      ],
    },
  },
  {
    id: "brunch-house", composition: "columns", business: "cafe", style: "bold",
    name: { en: "Brunch House", es: "Casa de brunch" },
    blurb: { en: "Sunny and friendly. Big morning plates, juices and a stack of pancakes.", es: "Soleado y amable. Platos de desayuno, jugos y una torre de panqueques." },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.1, rule: true, accentPrices: true },
    variants: [
      v("sunny", "Sunny", "Soleado", "#fff6dc", "#2a2112", "#6b5b3a", "#c2410c", "#f5b700"),
      v("mint", "Mint", "Menta", "#eef8f2", "#16261e", "#58695f", "#0f7a55", "#0f7a55"),
      v("berry", "Berry", "Frutos rojos", "#fdf0f3", "#2a1520", "#735865", "#b4235a", "#b4235a"),
    ],
    stock: "pancakes",
    sample: {
      title: "Sunny Side Café", subtitle: "Breakfast & brunch all day", footer: "Add bacon or avocado to any plate +$3",
      featureTitle: "Buttermilk stack", featureDetail: "Three pancakes, berries, maple · $12",
      sections: [
        { name: "Eggs", items: [i("Two eggs any style", "$11", "Toast, potatoes"), i("Avocado toast", "$13", "Poached egg, chili, lime"), i("Huevos rancheros", "$14", "Black beans, salsa roja"), i("Veggie omelette", "$13")] },
        { name: "Griddle", items: [i("Buttermilk pancakes", "$12"), i("French toast", "$13", "Brioche, berries"), i("Chicken & waffles", "$16", "Hot honey")] },
        { name: "Juice & coffee", items: [i("Fresh orange juice", "$5"), i("Green juice", "$7", "Kale, apple, ginger"), i("Drip coffee", "$3")] },
      ],
    },
  },
  {
    id: "espresso-bar", composition: "columns", business: "cafe", style: "dark",
    name: { en: "Espresso Bar", es: "Barra de espresso" },
    blurb: { en: "Dark roast mood. Condensed headings, copper prices, an iced coffee photo.", es: "Ambiente de tostado oscuro. Títulos condensados, precios cobrizos y café helado." },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.14, rule: true, accentPrices: true },
    variants: [
      v("roast", "Dark roast", "Tostado oscuro", "#14110f", "#f2e9df", "#aa9c8f", "#e0965a", "#2a211b"),
      v("slate", "Slate", "Pizarra", "#11161c", "#e9eef4", "#98a5b4", "#7fb6ff", "#1c2530"),
      v("crema", "Crema", "Crema", "#efe6da", "#1f1813", "#685a4d", "#8c4a1e", "#3a2a1f"),
    ],
    stock: "coldbrew",
    sample: {
      title: "Third Wave", subtitle: "Single-origin espresso · Pour-over bar", footer: "Ask the barista about this week’s single origin",
      featureTitle: "Nitro cold brew", featureDetail: "Velvety, on tap · $5.50",
      sections: [
        { name: "Espresso", items: [i("Espresso", "3.50"), i("Macchiato", "3.75"), i("Cortado", "4.25"), i("Flat white", "4.75"), i("Latte", "5.25")] },
        { name: "Slow bar", items: [i("Pour-over", "5.50", "Ethiopia Guji, floral"), i("Batch brew", "3.25"), i("Cold brew", "4.75")] },
        { name: "Not coffee", items: [i("Hojicha latte", "5.25"), i("Hot chocolate", "4.50"), i("Sparkling yerba mate", "4.00")] },
      ],
    },
  },
  {
    id: "bold-fast-casual", composition: "promo", business: "fast", style: "bold",
    name: { en: "Bold Fast Casual", es: "Comida rápida llamativa" },
    blurb: { en: "High contrast and loud. Big headings, yellow price tags, a combo deal panel.", es: "Alto contraste y mucha energía. Títulos grandes, precios en amarillo y un panel de combo." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("fire", "Fire red", "Rojo fuego", "#121212", "#ffffff", "#b9b9b9", "#ffcc00", "#e0261b", "#ffcc00"),
      v("electric", "Electric", "Eléctrico", "#0d1220", "#ffffff", "#a9b4c8", "#3ddc84", "#1a5cff", "#3ddc84"),
      v("sunny", "Sunny", "Soleado", "#ffcc00", "#141414", "#3d3400", "#b8160f", "#141414", "#141414"),
    ],
    stock: "burger",
    sample: {
      title: "Stackhouse Burgers", subtitle: "Smashed to order · Fresh, never frozen", footer: "Make any burger a double +$2.50 · Gluten-free bun available",
      featureTitle: "Combo deal", featureDetail: "Any burger + fries + drink · $13.99",
      sections: [
        { name: "Burgers", items: [i("Classic smash", "$9.49", "Two patties, American, house sauce"), i("Double bacon", "$11.99", "Cheddar, crispy bacon, pickles"), i("Spicy jalapeño", "$10.49", "Pepper jack, chipotle mayo"), i("Crispy chicken", "$10.99", "Buttermilk fried, slaw")] },
        { name: "Sides", items: [i("Fries", "$3.99"), i("Loaded fries", "$6.49", "Cheese, bacon, scallion"), i("Onion rings", "$4.99")] },
        { name: "Shakes & drinks", items: [i("Hand-spun shake", "$5.99", "Vanilla, chocolate, strawberry"), i("Fountain soda", "$2.49")] },
      ],
    },
  },
  {
    id: "pizza-night", composition: "promo", business: "fast", style: "bold",
    name: { en: "Pizza Night", es: "Noche de pizza" },
    blurb: { en: "Red, cream and loud. Slices, whole pies and a two-for-one offer.", es: "Rojo, crema y llamativo. Porciones, pizzas enteras y una oferta 2x1." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("classic", "Classic red", "Rojo clásico", "#fbf3e4", "#1c1410", "#5f5047", "#c8221a", "#c8221a", "#c8221a"),
      v("night", "Night", "Noche", "#141110", "#fff6ea", "#bdb2a4", "#ffb627", "#b81d15", "#ffb627"),
      v("basil", "Basil", "Albahaca", "#f4f1e6", "#17221a", "#55604f", "#1f7a3a", "#1f7a3a", "#1f7a3a"),
    ],
    stock: "pizza",
    sample: {
      title: "Slice Brothers", subtitle: "New York style · By the slice or whole", footer: "Gluten-free crust +$3 · Delivery until 11 pm",
      featureTitle: "Two for Tuesday", featureDetail: "Any two large pies · $29.99",
      sections: [
        { name: "By the slice", items: [i("Cheese", "$3.75"), i("Pepperoni", "$4.25"), i("White pie", "$4.50", "Ricotta, garlic, mozzarella"), i("Veggie", "$4.50", "Peppers, onion, olive")] },
        { name: "Whole pies", items: [i("Large cheese", "$19"), i("Large pepperoni", "$22"), i("Meat lovers", "$26", "Sausage, bacon, meatball")] },
        { name: "Sides", items: [i("Garlic knots", "$5"), i("Caesar salad", "$9"), i("Wings (8)", "$12", "Buffalo or BBQ")] },
      ],
    },
  },
  {
    id: "smokehouse-bbq", composition: "promo", business: "fast", style: "dark",
    name: { en: "Smokehouse BBQ", es: "Ahumados BBQ" },
    blurb: { en: "Smoky and rugged. Condensed type, amber tags and a rack of ribs.", es: "Ahumado y rústico. Letra condensada, etiquetas ámbar y un costillar." },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.08, namesUpper: true, tags: true },
    variants: [
      v("ember", "Ember", "Brasa", "#16110e", "#f6ede3", "#b5a594", "#f2a43a", "#7a2d16", "#f2a43a"),
      v("hickory", "Hickory", "Nogal", "#1b1714", "#f3ece4", "#b0a79c", "#e8c47c", "#3b3028", "#e8c47c"),
      v("butcher", "Butcher paper", "Papel de carnicero", "#efe4d3", "#1e1612", "#5e4f43", "#9b2f1a", "#2a1f19", "#9b2f1a"),
    ],
    stock: "ribs",
    sample: {
      title: "Smoke & Wheels", subtitle: "Low and slow over post oak", footer: "Sold by the half pound · We close when the meat runs out",
      featureTitle: "Rib Friday", featureDetail: "Full rack, two sides, cornbread · $32",
      sections: [
        { name: "Meats", items: [i("Brisket", "$14", "Half pound, salt and pepper bark"), i("Pork ribs", "$13", "Half rack, sweet glaze"), i("Pulled pork", "$11"), i("Smoked sausage", "$9", "Jalapeño cheddar")] },
        { name: "Sides", items: [i("Mac & cheese", "$5"), i("Smoked beans", "$4"), i("Collard greens", "$4"), i("Cornbread", "$3", "Honey butter")] },
        { name: "Drinks", items: [i("Sweet tea", "$3"), i("Lemonade", "$3.50")] },
      ],
    },
  },
  {
    id: "happy-hour", composition: "promo", business: "bar", style: "bold",
    name: { en: "Happy Hour", es: "Hora feliz" },
    blurb: { en: "Electric and fun. Drink specials, bar bites and a big deal badge.", es: "Eléctrico y divertido. Bebidas en promoción, botanas y una insignia de oferta." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("neon", "Neon", "Neón", "#0f0d1a", "#ffffff", "#b3aecb", "#ff4fa3", "#6d28d9", "#ff4fa3"),
      v("citrus", "Citrus", "Cítrico", "#0f1a14", "#ffffff", "#a9bdb0", "#c6f432", "#0d7c4a", "#c6f432"),
      v("sunset", "Sunset", "Atardecer", "#fff1e3", "#22140c", "#6a5243", "#d9480f", "#d9480f", "#d9480f"),
    ],
    stock: "interior",
    sample: {
      title: "Happy Hour", subtitle: "Monday to Friday · 4 to 7 pm", footer: "Must be 21 or older · Please drink responsibly",
      featureTitle: "Half-price wings", featureDetail: "All happy hour long · $6",
      sections: [
        { name: "Drinks", items: [i("Draft beer", "$5", "Rotating local taps"), i("House margarita", "$7"), i("Well cocktails", "$6"), i("House wine", "$6", "Red, white or rosé")] },
        { name: "Bar bites", items: [i("Wings (8)", "$6", "Buffalo, BBQ or lemon pepper"), i("Loaded nachos", "$9"), i("Sliders (3)", "$10"), i("Pretzel bites", "$7", "Beer cheese")] },
      ],
    },
  },
  {
    id: "morning-rush", composition: "promo", business: "cafe", style: "bold",
    name: { en: "Morning Rush", es: "Desayuno exprés" },
    blurb: { en: "Grab-and-go breakfast. Bold tags, quick combos and a hot stack.", es: "Desayuno para llevar. Etiquetas llamativas, combos rápidos y panqueques." },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.08, namesUpper: true, tags: true },
    variants: [
      v("sunrise", "Sunrise", "Amanecer", "#fff4e0", "#24170b", "#66533f", "#d9480f", "#d9480f", "#ffb627"),
      v("blue", "Diner blue", "Azul cafetería", "#0e1a33", "#ffffff", "#a7b4cc", "#ffc93c", "#1a5cff", "#ffc93c"),
      v("graphite", "Graphite", "Grafito", "#161616", "#ffffff", "#b4b4b4", "#ff7a1a", "#ff7a1a", "#ff7a1a"),
    ],
    stock: "pancakes",
    sample: {
      title: "Rise & Grind", subtitle: "Breakfast to go · Ready in 5 minutes", footer: "Breakfast served until 11 am · Order ahead in the app",
      featureTitle: "Morning combo", featureDetail: "Any sandwich + coffee · $8.99",
      sections: [
        { name: "Sandwiches", items: [i("Bacon egg & cheese", "$6.49", "Brioche bun"), i("Sausage biscuit", "$5.99"), i("Veggie wrap", "$6.99", "Egg, spinach, feta"), i("Breakfast burrito", "$7.49", "Chorizo, potato, salsa")] },
        { name: "Sweet", items: [i("Pancake stack", "$7.99"), i("Blueberry muffin", "$3.49"), i("Yogurt parfait", "$4.99", "Granola, berries")] },
        { name: "Coffee", items: [i("Hot coffee", "$2.49"), i("Iced latte", "$4.49")] },
      ],
    },
  },
  {
    id: "taqueria", composition: "list", business: "fast", style: "bold",
    name: { en: "Taquería", es: "Taquería" },
    blurb: { en: "Big, bright price list. Three columns that hold a full menu, no photo needed.", es: "Lista de precios grande y colorida. Tres columnas para un menú completo, sin foto." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("fiesta", "Fiesta", "Fiesta", "#fff7ea", "#1d140e", "#625244", "#d6336c", "#0b7a75", "#ffb000"),
      v("noche", "Noche", "Noche", "#121016", "#ffffff", "#b3adbd", "#ff5d8f", "#5b21b6", "#ffd23f"),
      v("verde", "Verde", "Verde", "#f3f7ee", "#15200f", "#53604b", "#c2410c", "#2f6b1f", "#f59e0b"),
    ],
    stock: null,
    sample: {
      title: "Taquería El Sol", subtitle: "Handmade tortillas · Salsas made fresh daily", footer: "All tacos on corn tortillas · Flour available on request",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Tacos", items: [i("Al pastor", "$3.50", "Pineapple, onion, cilantro"), i("Carne asada", "$3.75", "Grilled steak, salsa verde"), i("Carnitas", "$3.50"), i("Pollo asado", "$3.25"), i("Baja fish", "$4.25", "Cabbage, crema"), i("Hongos", "$3.25", "Mushrooms, epazote")] },
        { name: "Burritos & bowls", items: [i("Burrito", "$11", "Rice, beans, choice of meat"), i("Bowl", "$11", "Rice, beans, pico de gallo"), i("Quesadilla", "$9", "Oaxaca cheese")] },
        { name: "Sides", items: [i("Chips & guacamole", "$7"), i("Elote", "$5", "Mayo, cotija, chili"), i("Rice & beans", "$4")] },
        { name: "Drinks", items: [i("Horchata", "$3.50"), i("Agua de jamaica", "$3.50"), i("Mexican soda", "$3")] },
      ],
    },
  },
  {
    id: "diner-classics", composition: "list", business: "restaurant", style: "light",
    name: { en: "Diner Classics", es: "Clásicos de cafetería" },
    blurb: { en: "Retro red and cream. Dotted leaders, condensed headings, a long menu at a glance.", es: "Rojo y crema retro. Líneas punteadas, títulos condensados y un menú largo de un vistazo." },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.1, leader: true },
    variants: [
      v("cherry", "Cherry", "Cereza", "#fbf4e6", "#1f1714", "#655649", "#c1121f", "#c1121f"),
      v("teal", "Teal", "Verde azulado", "#f2f7f6", "#14201f", "#526361", "#0f766e", "#0f766e"),
      v("chrome", "Chrome", "Cromo", "#121417", "#f2f4f7", "#a3aab4", "#ff5a5f", "#23272e"),
    ],
    stock: null,
    sample: {
      title: "Route 9 Diner", subtitle: "Open 6 am to midnight · Breakfast all day", footer: "Substitute sweet potato fries +$1.50 · Ask about the pie of the day",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Breakfast", items: [i("Two eggs & toast", "$8.50"), i("Pancake stack", "$9.50"), i("Western omelette", "$12"), i("Biscuits & gravy", "$10")] },
        { name: "Burgers & melts", items: [i("Diner burger", "$12.50", "Lettuce, tomato, onion"), i("Patty melt", "$13", "Rye, Swiss, grilled onion"), i("Tuna melt", "$11.50"), i("Club sandwich", "$12.50")] },
        { name: "Blue plates", items: [i("Meatloaf", "$15", "Mashed potato, gravy"), i("Chicken fried steak", "$16"), i("Fish & chips", "$15")] },
        { name: "Shakes & pie", items: [i("Milkshake", "$6.50"), i("Apple pie", "$5.50", "À la mode +$1.50"), i("Coffee", "$2.50", "Bottomless")] },
      ],
    },
  },
  {
    id: "chalkboard-bistro", composition: "list", business: "restaurant", style: "dark",
    name: { en: "Chalkboard Bistro", es: "Bistró de pizarra" },
    blurb: { en: "Slate green and chalk white. A full bistro menu, calm and easy to read.", es: "Verde pizarra y blanco tiza. Un menú de bistró completo, sereno y fácil de leer." },
    look: { head: "montserrat", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.16, rule: true },
    variants: [
      v("slate", "Slate", "Pizarra", "#1d2a24", "#f1f3ee", "#a9b5ad", "#e9c46a", "#15201b"),
      v("blackboard", "Blackboard", "Pizarrón", "#1a1b1d", "#f4f4f2", "#abacaf", "#8ecae6", "#111214"),
      v("navy", "Navy", "Azul marino", "#14213d", "#f4f6fb", "#a8b3c9", "#fca311", "#0d1730"),
    ],
    stock: null,
    sample: {
      title: "Le Petit Coin", subtitle: "Seasonal French bistro · Lunch & dinner", footer: "Bread from Golden Crumb Bakery · Prix fixe Sunday nights",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Entrées", items: [i("French onion soup", "$11", "Gruyère crouton"), i("Escargots", "$14", "Garlic, parsley butter"), i("Frisée salad", "$12", "Lardons, poached egg")] },
        { name: "Plats", items: [i("Steak frites", "$32", "Hanger steak, béarnaise"), i("Moules marinières", "$24", "White wine, shallot"), i("Coq au vin", "$27"), i("Ratatouille", "$21", "Herbed goat cheese")] },
        { name: "Desserts", items: [i("Crème brûlée", "$10"), i("Tarte Tatin", "$11", "Crème fraîche"), i("Chocolate mousse", "$9")] },
        { name: "Wine", items: [i("Côtes du Rhône", "$12"), i("Sancerre", "$15"), i("Champagne", "$18")] },
      ],
    },
  },
  {
    id: "juice-bar", composition: "list", business: "sweets", style: "light",
    name: { en: "Juice Bar", es: "Bar de jugos" },
    blurb: { en: "Fresh and green. Pressed juices, smoothies and bowls in clean columns.", es: "Fresco y verde. Jugos prensados, licuados y bowls en columnas limpias." },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.12, tags: true },
    variants: [
      v("greens", "Greens", "Verdes", "#f2f8ec", "#15210f", "#536149", "#2f7a1f", "#2f7a1f", "#c6f432"),
      v("citrus", "Citrus", "Cítrico", "#fff8e8", "#24190a", "#675a43", "#d9480f", "#f08c00", "#ffd43b"),
      v("acai", "Açaí", "Açaí", "#1b1022", "#ffffff", "#b9a9c4", "#f783ac", "#5f3dc4", "#f783ac"),
    ],
    stock: null,
    sample: {
      title: "Press & Pulp", subtitle: "Cold-pressed daily · Add protein +$2", footer: "All juices 16 oz · Ask for a 32 oz bottle to go",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Pressed juice", items: [i("Green machine", "$9", "Kale, cucumber, apple, lemon"), i("Sunrise", "$8", "Orange, carrot, ginger"), i("Beet it", "$8", "Beet, apple, lemon")] },
        { name: "Smoothies", items: [i("PB banana", "$9", "Peanut butter, oat milk"), i("Berry blast", "$9", "Strawberry, blueberry, yogurt"), i("Tropical", "$9", "Mango, pineapple, coconut")] },
        { name: "Bowls", items: [i("Açaí bowl", "$12", "Granola, banana, honey"), i("Pitaya bowl", "$12", "Coconut, kiwi, berries")] },
        { name: "Shots", items: [i("Ginger shot", "$4"), i("Turmeric shot", "$4")] },
      ],
    },
  },
  {
    id: "ice-cream-parlor", composition: "list", business: "sweets", style: "light",
    name: { en: "Ice Cream Parlor", es: "Heladería" },
    blurb: { en: "Pastel and playful. Script headline, scoops, sundaes and shakes.", es: "Pastel y divertido. Título manuscrito, bolas, copas y malteadas." },
    look: { head: "lobster", headWeight: 400, body: "inter", sectionInHead: false, sectionWeight: 800, sectionTracking: 0.14, tags: true },
    variants: [
      v("strawberry", "Strawberry", "Fresa", "#fff1f4", "#2b1820", "#735a65", "#d6336c", "#f06595", "#ffd6e0"),
      v("mint", "Mint chip", "Menta", "#ecfaf5", "#13261f", "#53675e", "#0c8a64", "#20c997", "#c3fae8"),
      v("vanilla", "Vanilla", "Vainilla", "#fff9ec", "#2a2013", "#6c5e48", "#b45309", "#f59f00", "#ffe8a3"),
    ],
    stock: null,
    sample: {
      title: "Sprinkle Scoop", subtitle: "Small-batch ice cream made in house", footer: "Dairy-free sorbets available · Ask for a free taste",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Scoops", items: [i("Single scoop", "$4.50"), i("Double scoop", "$6.50"), i("Waffle cone", "+$1.50")] },
        { name: "Sundaes", items: [i("Hot fudge", "$8", "Whipped cream, cherry"), i("Banana split", "$10"), i("Brownie sundae", "$9")] },
        { name: "Shakes", items: [i("Classic shake", "$7", "Any flavor"), i("Malted shake", "$7.50")] },
        { name: "Today’s flavors", items: [i("Salted caramel", ""), i("Mint chip", ""), i("Strawberry swirl", "")] },
      ],
    },
  },
  {
    id: "boba-tea", composition: "list", business: "sweets", style: "bold",
    name: { en: "Boba Tea", es: "Té de burbujas" },
    blurb: { en: "Bright and bubbly. Milk teas, fruit teas and toppings in bold tags.", es: "Brillante y alegre. Tés con leche, tés frutales y toppings en etiquetas llamativas." },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.1, tags: true },
    variants: [
      v("taro", "Taro", "Taro", "#f6f0ff", "#21123a", "#62557a", "#7048e8", "#7048e8", "#ffd8a8"),
      v("matcha", "Matcha", "Matcha", "#f1f8ec", "#172414", "#55654f", "#2b8a3e", "#2b8a3e", "#ffe066"),
      v("brown-sugar", "Brown sugar", "Azúcar morena", "#1f1611", "#fff7ed", "#c2ae9b", "#f4a261", "#6f3b17", "#f4a261"),
    ],
    stock: null,
    sample: {
      title: "Bubble Bloom", subtitle: "Real tea, fresh fruit, chewy boba", footer: "Choose sweetness 0–100% · Ice level as you like",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Milk tea", items: [i("Classic milk tea", "$5.50"), i("Brown sugar boba", "$6.25", "Fresh milk, tiger stripes"), i("Taro milk tea", "$6"), i("Thai tea", "$5.75")] },
        { name: "Fruit tea", items: [i("Passion fruit green", "$5.75"), i("Mango jasmine", "$5.75"), i("Strawberry lemonade", "$5.50")] },
        { name: "Toppings", items: [i("Tapioca pearls", "$0.75"), i("Lychee jelly", "$0.75"), i("Cheese foam", "$1.25")] },
      ],
    },
  },
  {
    id: "photo-menu-grid", composition: "cards", business: "fast", style: "bold",
    name: { en: "Photo Menu Grid", es: "Menú con fotos" },
    blurb: { en: "Modern fast-casual cards: a big food photo, the name and a bright price tag for every item.", es: "Tarjetas modernas: una foto grande, el nombre y una etiqueta de precio llamativa por producto." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true, photoShape: "rect" },
    variants: [
      v("charcoal", "Charcoal & lime", "Carbón y lima", "#141414", "#ffffff", "#b5b5b5", "#c6f432", "#1f1f1f", "#c6f432"),
      v("ketchup", "Ketchup & mustard", "Kétchup y mostaza", "#fff7ed", "#1c1410", "#6b5a4c", "#c81d25", "#c81d25", "#ffb703"),
      v("ocean", "Ocean", "Océano", "#0b1d33", "#ffffff", "#a9b8cc", "#ffd166", "#12355b", "#ffd166"),
    ],
    stock: null,
    sample: {
      title: "Fresh Fork Kitchen", subtitle: "Made to order · Ready in 10 minutes", footer: "Add avocado +$2 · Ask about gluten-free options",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Bowls & salads", items: [i("Harvest bowl", "$12.95", "Quinoa, avocado, roasted sweet potato", "bowl"), i("Garden salad", "$10.50", "Greens, feta, citrus vinaigrette", "salad")] },
        { name: "Handhelds", items: [i("Pressed panini", "$11.25", "Turkey, provolone, pesto", "sandwich"), i("Smash burger", "$12.50", "Double patty, cheddar, house sauce", "burger"), i("Chicken wrap", "$11.75", "Grilled chicken, slaw, chipotle", "burrito")] },
        { name: "Plates", items: [i("Buffalo wings", "$13.00", "Eight wings, ranch, celery", "wings"), i("Half roast chicken", "$15.50", "Herbs, lemon, pan jus", "chicken"), i("Penne arrabbiata", "$13.25", "Spicy tomato, parmesan", "pasta")] },
      ],
    },
  },
  {
    id: "cafe-favorites", composition: "cards", business: "cafe", style: "light",
    name: { en: "Café Favorites", es: "Favoritos de la cafetería" },
    blurb: { en: "Round coffee and pastry photos on warm paper, with elegant serif names and prices.", es: "Fotos redondas de café y repostería sobre papel cálido, con nombres y precios elegantes." },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.1, accentPrices: true, photoShape: "circle" },
    variants: [
      v("mocha", "Cream & mocha", "Crema y moca", "#f6efe6", "#2b1d14", "#6e5a4b", "#8b4a26", "#3b2a20"),
      v("sage", "Sage", "Salvia", "#eef3ec", "#1f2a22", "#56645a", "#3f6f4f", "#2f5040"),
      v("blush", "Blush", "Rubor", "#fbf1f0", "#2d1d1f", "#725e60", "#a3425a", "#6d2c3c"),
    ],
    stock: null,
    sample: {
      title: "Maple & Bean", subtitle: "Coffee · Pastries · Little treats", footer: "Oat and almond milk at no extra charge",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Coffee", items: [i("Caffè latte", "$5.25", "Double shot, steamed milk", "latte"), i("Cold brew", "$4.75", "Steeped 18 hours", "coldbrew"), i("Mango smoothie", "$6.50", "Mango, banana, yogurt", "smoothie")] },
        { name: "Bakery", items: [i("Butter croissant", "$3.95", "Laminated in house", "croissant"), i("Cinnamon roll", "$4.50", "Brown sugar, cream cheese glaze", "cinnamon"), i("Blueberry muffin", "$3.75", "", "muffins")] },
        { name: "Sweets", items: [i("French macarons", "$2.50", "Ask for today’s flavors", "macarons"), i("Berry parfait", "$5.75", "Yogurt, granola, strawberries", "parfait")] },
      ],
    },
  },
  {
    id: "taqueria-specials", composition: "list", business: "fast", style: "bold",
    name: { en: "Taquería Specials", es: "Especiales de taquería" },
    blurb: { en: "Colourful three-column menu with a small food photo beside each dish and big price tags.", es: "Menú colorido de tres columnas con una foto pequeña junto a cada platillo y precios grandes." },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("papel", "Papel picado", "Papel picado", "#fff6e8", "#1d140e", "#625244", "#c2255c", "#0b7a75", "#ffb000"),
      v("noche", "Noche", "Noche", "#141019", "#ffffff", "#b5adc2", "#ff6b9a", "#5b21b6", "#ffd23f"),
      v("lima", "Lima", "Lima", "#f2f8ea", "#16220f", "#53604b", "#c2410c", "#2b7a1f", "#ffcf3f"),
    ],
    stock: null,
    photoStyle: "thumbs",
    sample: {
      title: "La Esquina Taquería", subtitle: "Handmade tortillas · Grilled to order", footer: "All tacos on corn tortillas · Flour available on request",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Tacos", items: [i("Tacos al pastor", "$3.75", "Pineapple, onion, cilantro", "streettacos"), i("Carnitas", "$3.75", "Slow-cooked pork, salsa verde", "carnitas"), i("Veggie tacos", "$3.25", "Roasted squash, chickpeas, lime", "tacos")] },
        { name: "Burritos & more", items: [i("Carne asada burrito", "$11.50", "Rice, beans, pico de gallo", "burrito"), i("Quesadilla", "$9.50", "Oaxaca cheese, peppers", "quesadilla"), i("Tostada", "$5.50", "Black beans, crema, queso fresco")] },
        { name: "Sides", items: [i("Chips & guacamole", "$7"), i("Elote", "$5", "Mayo, cotija, chili"), i("Rice & beans", "$4")] },
        { name: "Drinks", items: [i("Horchata", "$3.50"), i("Agua de jamaica", "$3.50")] },
      ],
    },
  },
  {
    id: "featured-dishes", composition: "featured", business: "restaurant", style: "dark",
    name: { en: "Featured Dishes", es: "Platillos destacados" },
    blurb: { en: "Premium restaurant menu with your signature dishes in large photos beside the full list.", es: "Menú de restaurante elegante con sus platillos estrella en fotos grandes junto a la lista completa." },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.12, leader: true },
    variants: [
      v("onyx", "Onyx & gold", "Ónix y oro", "#121214", "#f3eee5", "#a39b8e", "#d4af6a", "#1c1b1f"),
      v("bordeaux", "Bordeaux", "Burdeos", "#16100f", "#f5ece6", "#ab9a92", "#e2a86b", "#3a1418"),
      v("linen", "Linen", "Lino", "#f5f0e8", "#1c1a17", "#67604f", "#8a5a2b", "#24302a"),
    ],
    stock: null,
    sample: {
      title: "Atelier 21", subtitle: "Seasonal kitchen · Dinner", footer: "Tasting menu available Thursday to Saturday",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "To start", items: [i("Charred octopus", "$19", "Romesco, fingerling potato"), i("Burrata", "$16", "Heirloom tomato, basil oil"), i("Garden salad", "$13", "Shaved vegetables, citrus")] },
        { name: "Mains", items: [i("Seared salmon", "$32", "Fennel, citrus beurre blanc", "salmon"), i("Dry-aged ribeye", "$46", "Bone marrow butter, frites", "steak"), i("Rigatoni al ragù", "$26", "Slow-cooked beef, parmesan", "pasta"), i("Roast half chicken", "$29", "Salsa verde, charred lemon")] },
        { name: "Dessert", items: [i("Chocolate torte", "$13", "Sea salt, crème fraîche"), i("Basque cheesecake", "$12", "Seasonal fruit")] },
      ],
    },
  },
];

export function designById(id: unknown): MenuDesign | null {
  return MENU_DESIGNS.find((design) => design.id === id) ?? null;
}
export function isDesignId(value: unknown): value is string {
  return designById(value) !== null;
}
export function designVariant(design: MenuDesign, id: unknown): DesignVariant {
  return design.variants.find((variant) => variant.id === id) ?? design.variants[0];
}

/** Gallery filter. */
export function filterDesigns(business: DesignBusiness | "all", style: DesignStyle | "all"): MenuDesign[] {
  return MENU_DESIGNS.filter((design) => (business === "all" || design.business === business) && (style === "all" || design.style === style));
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

/** A complete Layout Studio document for a brand-new board from this design, with its sample content. */
export function designDocument(design: MenuDesign, variantId?: string): LayoutDocument {
  const geo = COMPOSITION_LAYOUT[design.composition];
  const sample = clone(design.sample);
  return {
    layoutVersion: 1,
    template: geo.template,
    split: geo.split,
    title: sample.title,
    subtitle: sample.subtitle,
    footer: sample.footer,
    sections: sample.sections,
    imageMediaId: null,
    videoMediaId: null,
    palette: design.style === "light" ? "fresh" : design.style === "bold" ? "bold" : "classic",
    primaryColor: null,
    accentColor: null,
    typeScale: "room",
    font: design.look.head,
    ...(design.look.body !== design.look.head ? { bodyFont: design.look.body } : {}),
    textColor: null,
    backgroundColor: null,
    featureTitle: sample.featureTitle,
    featureDetail: sample.featureDetail,
    columnWidths: geo.columnWidths,
    imageFit: "cover",
    imageAnchor: "center",
    design: design.id,
    variant: designVariant(design, variantId).id,
    ...(design.stock ? { stockPhoto: design.stock } : {}),
  };
}

/** "Start from scratch": the clean starter with one empty section. */
export function scratchDocument(): LayoutDocument {
  const base = designDocument(designById("coffee-shop")!, "oat");
  return { ...base, title: "", subtitle: "", footer: "", featureTitle: "", featureDetail: "", sections: [{ name: "", items: [{ name: "", price: "", description: "" }] }], stockPhoto: undefined };
}

/**
 * Switch an existing board to another design. Keeps every word, price, photo, video, logo and brand colour;
 * changes only the layout, fonts, colour style and (when the board still shows the old design's stock photo)
 * the stock photo. Nothing the owner typed is dropped.
 */
export function switchDesign(doc: LayoutDocument, design: MenuDesign): LayoutDocument {
  const geo = COMPOSITION_LAYOUT[design.composition];
  const previous = designById(doc.design);
  const keepOwnStock = doc.stockPhoto && previous && doc.stockPhoto !== previous.stock;
  const next: LayoutDocument = {
    ...doc,
    template: geo.template,
    split: geo.split,
    columnWidths: geo.columnWidths,
    font: design.look.head,
    design: design.id,
    variant: design.variants[0].id,
    stockPhoto: keepOwnStock ? doc.stockPhoto : design.stock ?? doc.stockPhoto,
  };
  if (design.look.body !== design.look.head) next.bodyFont = design.look.body;
  else delete next.bodyFont;
  // A list design has no video area; the video stays in the document for the next design that shows one.
  return next;
}

/** True when this design can show a photo or video. */
export function designHasMedia(design: MenuDesign) {
  return design.composition !== "list" && design.composition !== "cards" && design.composition !== "featured";
}
/** Templates whose layout is built around item photos. */
export function isPhotoDesign(design: MenuDesign) {
  return design.composition === "cards" || design.composition === "featured" || design.photoStyle === "thumbs";
}
