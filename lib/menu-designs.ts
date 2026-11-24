/**
 * Premium menu templates ("designs"). A design is a preset written into a NEW Layout Studio board: a layout,
 * colour roles, fonts, realistic sample content and an optional bundled stock photo. Nothing is live-linked:
 * editing this file never changes a saved board, and boards without `design` render exactly as before.
 *
 * The drawing lives in lib/menu-design-svg.ts and is shared by the browser preview and the server PNG.
 */
import { normalizeCustomFor } from "@/lib/board-custom";
import type { BoardFontId } from "@/lib/board-fonts";
import type { LayoutDocument, LayoutSection, LayoutTemplate } from "@/lib/layout-studio";

export type DesignComposition = "showcase" | "columns" | "promo" | "list" | "cards" | "featured"
  // Premium service templates (Noir & Co., Linden, Forge).
  | "showcaseLeft" | "editorial" | "spotlight" | "timetable";
/**
 * t421u: item photo size seeded into NEW template boards (see lib/board-custom.ts ITEM_PHOTO_SIZES). Existing boards
 * have no `itemPhotoSize` and keep the legacy size (= "small"). Lists have the widest columns, so they start Large.
 */
export const DESIGN_ITEM_PHOTO_DEFAULT: Record<DesignComposition, "small" | "medium" | "large"> = {
  list: "large", showcase: "medium", columns: "medium", promo: "medium", cards: "medium", featured: "medium",
  showcaseLeft: "medium", editorial: "medium", spotlight: "medium", timetable: "medium",
};
export type DesignStyle = "dark" | "light" | "bold";
export type DesignBusiness = "restaurant" | "cafe" | "fast" | "bar" | "sweets"
  // Non-food businesses (service and retail boards).
  | "salon" | "retail" | "fitness" | "office" | "pets";
/**
 * Words the guided editor uses for a design's list. Absent = the menu words ("Your menu", "Item", "Price").
 * services/products: "Price (optional)"; classes/schedule: the price field holds a time; board: a free detail.
 */
export type DesignTerms = "services" | "products" | "classes" | "schedule" | "board";
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
  headWeight: 400 | 500 | 600 | 700 | 800;
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
  // Non-food templates (Unsplash licence; ids in docs/MENU_TEMPLATES.md).
  "shoppingbags", "beagle",
  // Premium service templates (Unsplash licence; ids in docs/MENU_TEMPLATES.md).
  "barbershave", "knitwear", "amberoil", "deadlift",
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
  /** Editor wording for non-menu boards (see DesignTerms). Absent = menu wording. */
  terms?: DesignTerms;
  /** One line on what the board is for (gallery and future onboarding recommendations). */
  useCase?: Localized;
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
  // Service templates draw their own frame; this geometry is only what the Advanced editor's layout fields hold.
  showcaseLeft: { template: "split-50", split: 0.6, columnWidths: null },
  editorial: { template: "split-50", split: 1 - 840 / 1920, columnWidths: null },
  spotlight: { template: "triple-column", split: 1 / 3, columnWidths: null },
  timetable: { template: "split-50", split: 0.4, columnWidths: null },
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
  /* ---------------- salons & barbershops ---------------- */
  {
    id: "salon-maison", composition: "list", business: "salon", style: "light", terms: "services",
    name: { en: "Maison Salon", es: "Salón Maison" },
    blurb: { en: "Quiet luxury: serif headings, dotted leaders and fine rules on a soft, warm ground.", es: "Lujo discreto: títulos con serifa, líneas punteadas y filetes finos sobre un fondo cálido." },
    useCase: { en: "Elegant service & price list", es: "Lista elegante de servicios y precios" },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.14, leader: true, rule: true },
    variants: [
      v("blush", "Blush & ivory", "Rubor y marfil", "#f7efe9", "#2b2220", "#7a6a64", "#a8616a", "#e8d3cc"),
      v("sage", "Sage & linen", "Salvia y lino", "#eef1ea", "#1f2a22", "#5f6b61", "#4f7559", "#d5ddd2"),
      v("noir", "Noir & champagne", "Negro y champán", "#141213", "#f4ece6", "#a99f99", "#c8a27a", "#221e1f"),
    ],
    stock: null,
    sample: {
      title: "Maison Lumière", subtitle: "Hair · Color · Care", footer: "Complimentary consultation with every color service · Book at the front desk",
      featureTitle: "New client offer", featureDetail: "20% off your first color service",
      sections: [
        { name: "Cut & style", items: [i("Women’s cut & style", "$75", "Consultation, wash, cut and finish"), i("Men’s cut", "$45"), i("Signature blowout", "$50", "Wash and a smooth, lasting finish"), i("Bang trim", "$15")] },
        { name: "Color", items: [i("Single process", "$95"), i("Full highlights", "$185", "Includes toner"), i("Balayage", "From $220", "Hand-painted, natural blend"), i("Gloss & tone", "$65"), i("Root touch-up", "$75")] },
        { name: "Treatments", items: [i("Keratin smoothing", "$280", "Frizz-free for up to 4 months"), i("Bond repair", "$45"), i("Scalp ritual", "$40"), i("Deep conditioning", "$30")] },
      ],
    },
  },
  {
    id: "barber-blade", composition: "list", business: "salon", style: "dark", terms: "services",
    name: { en: "Blade & Fade", es: "Blade & Fade" },
    blurb: { en: "Bold condensed type on deep charcoal with metallic price tags. Reads from across the shop.", es: "Letra condensada y fuerte sobre carbón con etiquetas de precio metálicas. Se lee desde toda la barbería." },
    useCase: { en: "Barbershop price list", es: "Lista de precios de barbería" },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, tags: true },
    variants: [
      v("brass", "Charcoal & brass", "Carbón y latón", "#121212", "#f5f1e8", "#a39e94", "#c9a14a", "#1c1c1c", "#c9a14a"),
      v("crimson", "Black & crimson", "Negro y carmesí", "#141011", "#f7efe9", "#a99c97", "#d23c3c", "#1e1718", "#d23c3c"),
      v("steel", "Steel blue", "Azul acero", "#0f1720", "#eef3f8", "#93a3b5", "#6fb4d9", "#172331", "#6fb4d9"),
    ],
    stock: null,
    sample: {
      title: "Blade & Fade", subtitle: "Barbershop · Walk-ins welcome", footer: "Card, cash and tap accepted · Kids under 12: $5 off any cut",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Cuts", items: [i("Classic cut", "$30", "Scissor or clipper, hot towel finish"), i("Skin fade", "$35"), i("Buzz cut", "$20"), i("Long hair cut", "$40"), i("Kids cut", "$22", "12 and under")] },
        { name: "Beard & shave", items: [i("Beard trim", "$18", "Shape, line-up and oil"), i("Hot towel shave", "$35", "Straight razor, two towels"), i("Beard color", "$25")] },
        { name: "Combos", items: [i("Cut + beard", "$45"), i("Cut + shave", "$55"), i("Father & son", "$45")] },
        { name: "Extras", items: [i("Line-up", "$12"), i("Hair design", "From $10"), i("Brow trim", "$8")] },
      ],
    },
  },
  {
    id: "beauty-glow", composition: "promo", business: "salon", style: "bold", terms: "services",
    name: { en: "Glow Studio", es: "Glow Studio" },
    blurb: { en: "A confident promo panel with a price badge, beside your full treatment list.", es: "Un panel de promoción con insignia de precio, junto a la lista completa de tratamientos." },
    useCase: { en: "Beauty service promotion", es: "Promoción de servicios de belleza" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.02, accentPrices: true },
    variants: [
      v("plum", "Plum & pink", "Ciruela y rosa", "#fbf3f6", "#2a1424", "#7d6375", "#b0306a", "#3b1233", "#f2b8cf"),
      v("rose", "Rose", "Rosa", "#fff5f2", "#2b1a17", "#806a64", "#c8465b", "#c8465b", "#2b1a17"),
      v("violet", "Midnight violet", "Violeta noche", "#120f1c", "#f6f0ff", "#aaa1c2", "#c792ff", "#2a1f45", "#c792ff"),
    ],
    stock: null,
    sample: {
      title: "Glow Studio", subtitle: "Lashes · Brows · Skin", footer: "Book online or at the front desk · Offer ends Sunday",
      featureTitle: "Lash lift", featureDetail: "With tint · our most-booked treatment · $85",
      sections: [
        { name: "Lashes", items: [i("Lash lift", "$65", "Lasts 6–8 weeks"), i("Classic extensions", "$120"), i("Lash tint", "$25")] },
        { name: "Brows", items: [i("Brow lamination", "$70"), i("Shape & tint", "$40"), i("Brow wax", "$20")] },
        { name: "Skin", items: [i("Signature facial", "$95", "60 minutes"), i("Hydrating peel", "$110")] },
      ],
    },
  },
  {
    id: "nails-polished", composition: "list", business: "salon", style: "light", terms: "services",
    name: { en: "Polished", es: "Polished" },
    blurb: { en: "Airy and modern. Accent prices and fine rules, with a specials column that stands out.", es: "Ligero y moderno. Precios en color, filetes finos y una columna de especiales que destaca." },
    useCase: { en: "Services & weekly specials", es: "Servicios y especiales de la semana" },
    look: { head: "montserrat", headWeight: 700, body: "inter", sectionInHead: false, sectionWeight: 800, sectionTracking: 0.18, rule: true, accentPrices: true },
    variants: [
      v("ivory", "Ivory & copper", "Marfil y cobre", "#fbf8f3", "#262322", "#7c756f", "#a8693d", "#efe6da"),
      v("lilac", "Lilac", "Lila", "#f6f3fb", "#24203a", "#726c88", "#6b4fc0", "#e6dff6"),
      v("mint", "Mint", "Menta", "#f1f8f5", "#17302a", "#5e7a72", "#22816a", "#dcefe7"),
    ],
    stock: null,
    sample: {
      title: "Polished Nail Studio", subtitle: "Nails · Spa · Waxing", footer: "Walk-ins welcome when chairs are open · Gift cards at the desk",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Manicures", items: [i("Classic manicure", "$25"), i("Gel manicure", "$40", "Lasts up to 3 weeks"), i("Nail art", "From $10"), i("French tip", "+$5")] },
        { name: "Pedicures", items: [i("Classic pedicure", "$35"), i("Spa pedicure", "$55", "Scrub, mask and hot stones"), i("Gel pedicure", "$50"), i("Paraffin add-on", "$10")] },
        { name: "Specials", items: [i("Gel mani + spa pedi", "$80", "Save $15"), i("Brow wax + tint", "$30"), i("Bring a friend", "$10 off", "Both guests, any service")] },
      ],
    },
  },
  /* ---------------- retail ---------------- */
  {
    id: "retail-sale", composition: "promo", business: "retail", style: "bold", terms: "products",
    name: { en: "Big Sale", es: "Gran rebaja" },
    blurb: { en: "Loud and clear: a huge sale message, condensed type and was/now prices.", es: "Claro y llamativo: un gran mensaje de rebajas, letra condensada y precios antes/ahora." },
    useCase: { en: "Seasonal sale promotion", es: "Promoción de rebajas de temporada" },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.04, namesUpper: true, tags: true },
    variants: [
      v("red", "Sale red", "Rojo rebajas", "#f8f4ee", "#161616", "#66605a", "#d42a1a", "#d42a1a", "#161616"),
      v("black", "Black & yellow", "Negro y amarillo", "#111111", "#ffffff", "#a3a3a3", "#ffd400", "#1f1f1f", "#ffd400"),
      v("navy", "Navy", "Marino", "#f3f6fb", "#0d1b33", "#5d6b80", "#1f5cff", "#0d1b33", "#ffcf33"),
    ],
    stock: "shoppingbags",
    sample: {
      title: "Northline Outfitters", subtitle: "Winter sale · This week only", footer: "While stock lasts · Prices as marked at the register",
      featureTitle: "Up to 50% off", featureDetail: "Storewide on winter styles",
      sections: [
        { name: "Outerwear", items: [i("Puffer jacket", "$89", "Was $149"), i("Wool coat", "$129", "Was $210"), i("Rain shell", "$59", "Was $95"), i("Fleece vest", "$39", "Was $65")] },
        { name: "Knits & boots", items: [i("Merino sweater", "$49", "Was $79"), i("Cable beanie", "$15"), i("Trail boots", "$99", "Was $160"), i("Wool socks, 3 pack", "$18", "Was $30")] },
      ],
    },
  },
  {
    id: "retail-offers", composition: "list", business: "retail", style: "bold", terms: "products",
    name: { en: "Tech Deals", es: "Ofertas tech" },
    blurb: { en: "High-contrast product board with neon price tags, made for electronics and phone stores.", es: "Tablero de productos de alto contraste con etiquetas neón, pensado para tiendas de electrónica y telefonía." },
    useCase: { en: "Featured products & offers", es: "Productos destacados y ofertas" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.1, tags: true },
    variants: [
      v("electric", "Electric mint", "Menta eléctrica", "#0e1116", "#f3f6fa", "#9aa5b4", "#2ee6a8", "#161b23", "#2ee6a8"),
      v("sun", "Sun yellow", "Amarillo sol", "#fffbea", "#1a1a1a", "#6b6450", "#1a1a1a", "#ffcc00", "#ffcc00"),
      v("coral", "Coral", "Coral", "#fff6f3", "#231815", "#7a625b", "#d9452a", "#ffe3dc", "#ff5a3c"),
    ],
    stock: null,
    sample: {
      title: "Volt Mobile", subtitle: "This week’s deals", footer: "Trade in your old phone for credit · Repairs while you wait",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Phones", items: [i("Refurbished phones", "From $199", "12-month warranty"), i("Prepaid plans", "From $25/mo"), i("Unlocked phones", "From $299"), i("Phone trade-in", "Up to $300")] },
        { name: "Accessories", items: [i("Wireless earbuds", "$49", "Was $79"), i("Fast charger", "$19"), i("Rugged case", "$24"), i("Screen protector", "$15", "Installed free")] },
        { name: "Services", items: [i("Screen repair", "From $79", "Most models in 1 hour"), i("Battery swap", "$59"), i("Data transfer", "Free"), i("Phone cleaning", "Free")] },
      ],
    },
  },
  {
    id: "retail-boutique", composition: "list", business: "retail", style: "light", terms: "products",
    name: { en: "Juniper Boutique", es: "Boutique Juniper" },
    blurb: { en: "Editorial serif headings and fine rules: a calm, gallery-like board for a curated shop.", es: "Títulos editoriales con serifa y filetes finos: un tablero sereno, de galería, para una tienda selecta." },
    useCase: { en: "Boutique collection & services", es: "Colección y servicios de boutique" },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.18, leader: false, rule: true },
    variants: [
      v("stone", "Stone & ink", "Piedra y tinta", "#f4f1ec", "#1d1c1a", "#77716a", "#1d1c1a", "#e4ded5"),
      v("olive", "Olive", "Oliva", "#eff0e8", "#1e2219", "#686e5f", "#55613f", "#dadcca"),
      v("night", "Night", "Noche", "#16181b", "#f1eee8", "#9d9890", "#d9c3a0", "#212428"),
    ],
    stock: null,
    sample: {
      title: "Juniper", subtitle: "Clothing · Home · Gifts", footer: "Free gift wrapping on every purchase · Open daily 10–7",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "New this week", items: [i("Linen shirt dress", "$128", "Sand, olive, ink"), i("Cashmere crew", "$165"), i("Wide-leg trousers", "$98"), i("Leather tote", "$210", "Handmade in Portugal")] },
        { name: "Home & gifts", items: [i("Stoneware mug set", "$48"), i("Hand-poured candle", "$34", "Fig & cedar"), i("Wool throw", "$120"), i("Gift card", "From $25")] },
        { name: "Services", items: [i("Personal styling", "Free", "By appointment"), i("Alterations", "From $15"), i("Gift wrapping", "Free"), i("Local delivery", "$8")] },
      ],
    },
  },
  /* ---------------- gyms & fitness ---------------- */
  {
    id: "fitness-timetable", composition: "list", business: "fitness", style: "dark", terms: "classes",
    name: { en: "Class Timetable", es: "Horario de clases" },
    blurb: { en: "A week of classes at a glance: days as columns, times in the accent colour, coach and room underneath.", es: "Las clases de la semana de un vistazo: días en columnas, horas en color, coach y sala debajo." },
    useCase: { en: "Weekly class schedule", es: "Horario semanal de clases" },
    look: { head: "oswald", headWeight: 700, body: "inter", sectionInHead: true, sectionWeight: 700, sectionTracking: 0.08, namesUpper: true, accentPrices: true, rule: true },
    variants: [
      v("lime", "Black & lime", "Negro y lima", "#0d0f0c", "#f3f7ee", "#9ba596", "#c6ff3d", "#171a15"),
      v("orange", "Ink & orange", "Tinta y naranja", "#111014", "#f6f3ff", "#a19caf", "#ff7a1a", "#1c1a21"),
      v("aqua", "Light aqua", "Aqua claro", "#f2f7f8", "#0e1c22", "#5b707a", "#0a7f9d", "#dcebef"),
    ],
    stock: null,
    sample: {
      title: "Pulse Fitness", subtitle: "Class schedule · This week", footer: "Book in the Pulse app · Arrive 10 minutes early · Towels at the desk",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Monday", items: [i("HIIT 45", "6:00 AM", "Coach Maya · Studio A"), i("Spin", "12:15 PM", "Coach Leo · Cycle room"), i("Strength club", "5:30 PM", "Coach Marcus · Floor"), i("Yoga flow", "6:30 PM", "Coach Ana · Studio B")] },
        { name: "Wednesday", items: [i("Strength club", "6:00 AM", "Coach Marcus · Floor"), i("Pilates core", "12:15 PM", "Coach Ana · Studio B"), i("Boxing", "7:00 PM", "Coach Dre · Studio A")] },
        { name: "Friday", items: [i("Bootcamp", "6:00 AM", "Coach Maya · Studio A"), i("Mobility", "12:15 PM", "Coach Leo · Studio B"), i("Spin", "5:30 PM", "Coach Leo · Cycle room")] },
        { name: "Saturday", items: [i("Bootcamp", "8:00 AM", "Coach Maya · Park"), i("Yoga flow", "9:30 AM", "Coach Ana · Studio B")] },
      ],
    },
  },
  {
    id: "fitness-join", composition: "promo", business: "fitness", style: "bold", terms: "services",
    name: { en: "Join Now", es: "Inscríbete" },
    blurb: { en: "Membership plans on the left, a punchy offer and price badge on the right.", es: "Planes de membresía a la izquierda y una oferta llamativa con insignia de precio a la derecha." },
    useCase: { en: "Membership promotion", es: "Promoción de membresías" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.02, accentPrices: true },
    variants: [
      v("blue", "Electric blue", "Azul eléctrico", "#f4f7ff", "#0b1533", "#5e6b87", "#1d4fe0", "#1d4fe0", "#ffd23f"),
      v("red", "Power red", "Rojo intenso", "#fff5f3", "#1d0f0c", "#7b625c", "#c9281f", "#1d0f0c", "#e5352b"),
      v("black", "Black & volt", "Negro y neón", "#0f0f10", "#ffffff", "#a2a2a6", "#e5ff3b", "#202022", "#e5ff3b"),
    ],
    stock: null,
    sample: {
      title: "Iron District", subtitle: "Memberships", footer: "Cancel anytime · Student and military rates at the desk",
      featureTitle: "Join for $1", featureDetail: "No joining fee · first month $1",
      sections: [
        { name: "Plans", items: [i("Basic", "$29/mo", "Gym floor, 5 AM–11 PM"), i("Plus", "$49/mo", "All classes, sauna, guest pass"), i("Premier", "$79/mo", "Plus a monthly PT session"), i("Student", "$19/mo", "With a valid student ID")] },
        { name: "Extras", items: [i("Day pass", "$15"), i("Personal training", "$60", "Per session"), i("Towel service", "$8/mo"), i("Guest pass", "$10")] },
      ],
    },
  },
  {
    id: "fitness-motivate", composition: "promo", business: "fitness", style: "bold", terms: "board",
    name: { en: "Daily Grind", es: "Entreno del día" },
    blurb: { en: "Workout of the day beside a big motivational line. Change it daily in seconds.", es: "El entrenamiento del día junto a una gran frase motivadora. Se cambia cada día en segundos." },
    useCase: { en: "Workout of the day & motivation", es: "Entrenamiento del día y motivación" },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: true, sectionWeight: 400, sectionTracking: 0.06, namesUpper: true, accentPrices: true },
    variants: [
      v("yellow", "Black & yellow", "Negro y amarillo", "#121212", "#f5f5f5", "#9c9c9c", "#ffd400", "#ffd400"),
      v("red", "Black & red", "Negro y rojo", "#0f0f0f", "#ffffff", "#a0a0a0", "#ff3b30", "#ff3b30"),
      v("mono", "Concrete", "Concreto", "#ecebe7", "#111111", "#666666", "#111111", "#111111"),
    ],
    stock: null,
    sample: {
      title: "Forge Athletics", subtitle: "Workout of the day", footer: "Scale any movement · Log your time at the desk",
      featureTitle: "Stronger than yesterday", featureDetail: "Every rep counts.",
      sections: [
        { name: "Warm-up", items: [i("Row", "500 m"), i("Jumping jacks", "50"), i("Air squats", "25"), i("Arm circles", "30 s")] },
        { name: "5 rounds", items: [i("Kettlebell swings", "20"), i("Box jumps", "15"), i("Push-ups", "12"), i("Finisher: plank", "2 min")] },
      ],
    },
  },
  /* ---------------- offices & workplaces ---------------- */
  {
    id: "office-welcome", composition: "promo", business: "office", style: "light", terms: "board",
    name: { en: "Welcome", es: "Bienvenida" },
    blurb: { en: "Greets guests with today’s visitors and building info. Calm, corporate, on brand.", es: "Recibe a los invitados con las visitas del día e información del edificio. Sereno y corporativo." },
    useCase: { en: "Reception welcome screen", es: "Pantalla de bienvenida en recepción" },
    look: { head: "inter", headWeight: 800, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.16, rule: true },
    variants: [
      v("navy", "Navy", "Marino", "#f6f7f9", "#101828", "#667085", "#1d4ed8", "#101828"),
      v("teal", "Teal", "Verde azulado", "#f4f8f8", "#0f2a2e", "#5b7377", "#0c7b7d", "#0c7b7d"),
      v("charcoal", "Charcoal", "Carbón", "#111317", "#f2f4f7", "#9aa1ab", "#8ab4ff", "#1d2129"),
    ],
    stock: null,
    sample: {
      title: "Northwind Partners", subtitle: "Tuesday, Nov 25", footer: "Wi-Fi: Northwind-Guest · Ask reception for the password",
      featureTitle: "Hello", featureDetail: "Welcome · please check in at reception",
      sections: [
        { name: "Visitors", items: [i("Acme Robotics", "10:00 AM", "Boardroom · Host: Dana Ruiz"), i("Harbor Health", "1:30 PM", "Room 4B · Host: Sam Patel"), i("Westline Capital", "3:00 PM", "Boardroom · Host: Lee Chen")] },
        { name: "Building", items: [i("Reception", "Floor 1"), i("Restrooms", "End of hall"), i("Emergency exit", "Stairs A & B")] },
      ],
    },
  },
  {
    id: "office-rooms", composition: "list", business: "office", style: "light", terms: "schedule",
    name: { en: "Room Schedule", es: "Agenda de salas" },
    blurb: { en: "Today’s meetings by room, with times in clear tags. Built for lobbies and hallways.", es: "Las reuniones de hoy por sala, con horas en etiquetas claras. Pensado para recepciones y pasillos." },
    useCase: { en: "Meeting room schedule", es: "Agenda de salas de reuniones" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.1, tags: true },
    variants: [
      v("indigo", "Indigo", "Índigo", "#f5f6fb", "#141a33", "#646b85", "#4338ca", "#141a33", "#4338ca"),
      v("graphite", "Graphite & green", "Grafito y verde", "#121417", "#f1f3f6", "#9aa1ab", "#22c55e", "#1b1f24", "#22c55e"),
      v("sand", "Sand & amber", "Arena y ámbar", "#f7f3ec", "#231d16", "#7a6f61", "#a14a07", "#ece2d2", "#b45309"),
    ],
    stock: null,
    sample: {
      title: "Brightline HQ", subtitle: "Meeting rooms · Today", footer: "Book rooms in the calendar app · Please leave rooms tidy",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Boardroom", items: [i("Q4 planning", "9:00", "Finance team"), i("Client review", "11:00", "Acme Robotics"), i("Leadership sync", "4:00", "Exec team")] },
        { name: "Room 2A", items: [i("Design critique", "10:00", "Product design"), i("Interviews", "1:00", "Engineering hiring"), i("Product demo", "3:30", "Partners")] },
        { name: "Room 3C", items: [i("New hire onboarding", "9:30", "People team"), i("Sales standup", "2:00", "Sales"), i("Customer call", "4:00", "Support")] },
      ],
    },
  },
  {
    id: "office-kudos", composition: "promo", business: "office", style: "dark", terms: "board",
    name: { en: "Kudos", es: "Reconocimientos" },
    blurb: { en: "Celebrate people: employee of the month up front, work anniversaries and kudos alongside.", es: "Celebre a su equipo: el empleado del mes al frente, aniversarios y reconocimientos al lado." },
    useCase: { en: "Employee recognition", es: "Reconocimiento a empleados" },
    look: { head: "noto-serif", headWeight: 700, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.16 },
    variants: [
      v("gold", "Black & gold", "Negro y oro", "#12110f", "#f5efe3", "#aaa293", "#d4a54a", "#d4a54a"),
      v("plum", "Plum", "Ciruela", "#150f17", "#f7eef9", "#b0a0b5", "#d48bd9", "#3a1f40"),
      v("light", "Ivory", "Marfil", "#f8f6f1", "#1c1a16", "#6f6a60", "#8a6418", "#1c1a16"),
    ],
    stock: null,
    sample: {
      title: "Brightline", subtitle: "Team celebrations", footer: "Nominate a teammate in the People portal",
      featureTitle: "Maria Gómez", featureDetail: "Employee of the month · Customer Success",
      sections: [
        { name: "Tenure", items: [i("Dana Ruiz", "10 years", "Operations"), i("Sam Patel", "5 years", "Engineering"), i("Lee Chen", "1 year", "Sales"), i("Ana Ortiz", "3 years", "Design")] },
        { name: "Kudos", items: [i("Priya N.", "", "Led our smoothest launch yet"), i("Jordan K.", "", "Mentored three new hires"), i("Support team", "", "Record satisfaction this quarter"), i("Facilities crew", "", "Kept the office running all week")] },
      ],
    },
  },
  /* ---------------- pet shops & services ---------------- */
  {
    id: "pets-groom", composition: "list", business: "pets", style: "light", terms: "services",
    name: { en: "Groom Room", es: "Peluquería canina" },
    blurb: { en: "Friendly script title, clear size-based prices in tags, and the add-ons owners actually ask for.", es: "Título manuscrito y amable, precios claros por tamaño en etiquetas y los extras que más se piden." },
    useCase: { en: "Grooming price list", es: "Lista de precios de peluquería" },
    look: { head: "lobster", headWeight: 400, body: "inter", sectionInHead: false, sectionWeight: 800, sectionTracking: 0.1, tags: true },
    variants: [
      v("teal", "Teal", "Verde azulado", "#f2faf8", "#12302b", "#5d7772", "#0d7f73", "#0d7f73", "#ffb84d"),
      v("sunny", "Sunny", "Soleado", "#fffaf0", "#2a2112", "#7a6c52", "#b8600f", "#ffe8c2", "#e07a1f"),
      v("berry", "Berry", "Frutos rojos", "#fbf5fb", "#2a1530", "#7a6280", "#93307f", "#f2dcef", "#a4378f"),
    ],
    stock: null,
    sample: {
      title: "The Groom Room", subtitle: "Dog & cat grooming", footer: "Prices vary by coat and temperament · Ask about our puppy intro visit",
      featureTitle: "", featureDetail: "",
      sections: [
        { name: "Bath & tidy", items: [i("Small dog", "$35", "Up to 20 lb"), i("Medium dog", "$45", "21–50 lb"), i("Large dog", "$60", "Over 50 lb"), i("Puppy intro", "$30", "Under 6 months")] },
        { name: "Full groom", items: [i("Small dog", "$65"), i("Medium dog", "$80"), i("Large dog", "$95+"), i("Cat groom", "$75")] },
        { name: "Add-ons", items: [i("Nail trim", "$15"), i("Teeth brushing", "$10"), i("Blueberry facial", "$12"), i("De-shed treatment", "$20")] },
      ],
    },
  },
  {
    id: "pets-treats", composition: "promo", business: "pets", style: "bold", terms: "products",
    name: { en: "Treat Week", es: "Semana de premios" },
    blurb: { en: "A happy pet photo, a bold offer and a price badge, with products and prices beside it.", es: "Una foto de mascota feliz, una oferta llamativa y una insignia de precio, con productos y precios al lado." },
    useCase: { en: "Pet product promotion", es: "Promoción de productos para mascotas" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.02, accentPrices: true },
    variants: [
      v("sky", "Sky & sun", "Cielo y sol", "#f3f8ff", "#0f1d33", "#5d6c82", "#1f6fe8", "#0f1d33", "#ffcc33"),
      v("leaf", "Leaf", "Hoja", "#f4f8ef", "#17240f", "#63705a", "#3f7a22", "#17240f", "#ffd24d"),
      v("coral", "Coral", "Coral", "#fff6f2", "#2b1610", "#7f655d", "#d24a2c", "#2b1610", "#ff6b4a"),
    ],
    stock: "beagle",
    sample: {
      title: "Happy Tails", subtitle: "Pet supply · Treat week", footer: "Offer valid while supplies last",
      featureTitle: "2 for $15", featureDetail: "Mix and match any treat bags · $15",
      sections: [
        { name: "Treats", items: [i("Peanut butter biscuits", "$8.99"), i("Dental chews, 12 pack", "$14.99"), i("Salmon bites", "$9.49"), i("Freeze-dried liver", "$12.99")] },
        { name: "Toys & gear", items: [i("Rope tug toy", "$7.99"), i("Reflective leash", "$18.99"), i("Cozy bed, medium", "$49"), i("Squeaky balls, 3 pack", "$6.99")] },
      ],
    },
  },
  {
    id: "pets-care", composition: "columns", business: "pets", style: "light", terms: "services",
    name: { en: "Pet Care", es: "Cuidado de mascotas" },
    blurb: { en: "Daycare, boarding and grooming prices in two tidy columns, with a pet photo and booking note.", es: "Precios de guardería, hospedaje y peluquería en dos columnas ordenadas, con foto y aviso de reservas." },
    useCase: { en: "Daycare, boarding & grooming board", es: "Guardería, hospedaje y peluquería" },
    look: { head: "montserrat", headWeight: 800, body: "inter", sectionInHead: true, sectionWeight: 800, sectionTracking: 0.12, leader: true },
    variants: [
      v("cream", "Cream & rust", "Crema y óxido", "#fbf7f0", "#2b2118", "#7d6f60", "#a9521f", "#f1e5d3"),
      v("sage", "Sage", "Salvia", "#f1f5ef", "#1b2a1d", "#627062", "#2f6b3f", "#dde7da"),
      v("navy", "Navy & amber", "Marino y ámbar", "#0f1726", "#eef2f8", "#95a0b3", "#f2a541", "#1a2436"),
    ],
    stock: "beagle",
    sample: {
      title: "Paws & Co.", subtitle: "Daycare · Boarding · Grooming", footer: "Vaccination records required · Tours daily 10 AM–4 PM",
      featureTitle: "Now booking", featureDetail: "Holiday boarding fills fast. Reserve today.",
      sections: [
        { name: "Daycare", items: [i("Half day", "$22"), i("Full day", "$35"), i("10-day pass", "$300", "Save $50")] },
        { name: "Boarding", items: [i("Dog suite", "$55", "Per night, two walks"), i("Cat condo", "$35", "Per night"), i("Late pickup", "$15", "After 7 PM")] },
        { name: "Grooming", items: [i("Bath & brush", "$40"), i("Full groom", "From $65")] },
      ],
    },
  },
  /* ---------------- premium service templates (salons, retail, fitness) ---------------- */
  {
    id: "luxury-barbershop", composition: "showcaseLeft", business: "salon", style: "dark", terms: "services",
    name: { en: "Luxury Barbershop", es: "Barbería de lujo" },
    blurb: { en: "Quiet and expensive. A refined serif, brass details and a moody photo that melts into the page.", es: "Sobria y exclusiva. Serifa refinada, detalles dorados y una foto que se funde con la página." },
    useCase: { en: "Premium barbershop service list", es: "Lista premium de servicios de barbería" },
    look: { head: "cormorant-garamond", headWeight: 600, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.25, rule: true, accentPrices: true },
    variants: [
      v("noir", "Noir & brass", "Negro y latón", "#100f0e", "#f1e9dc", "#9c9183", "#c8a46e", "#1b1a18"),
      v("bone", "Bone & ink", "Hueso y tinta", "#ece6dc", "#1d1a16", "#6b6257", "#7d5f35", "#d9d0c2"),
      v("oxblood", "Oxblood", "Burdeos", "#1f100f", "#f3e7d7", "#b39d8a", "#d6a877", "#2c1715"),
    ],
    stock: "barbershave",
    sample: {
      title: "Noir & Co.", subtitle: "Barbers & grooming · Est. 2012", footer: "Walk-ins welcome · Book at the front desk or online · Tue–Sat 9 am – 8 pm",
      featureTitle: "Signature ritual", featureDetail: "The hot towel shave · $48",
      sections: [
        { name: "Cuts", items: [i("Signature cut", "$55", "45 min · Wash, cut and style"), i("Skin fade", "$50", "40 min · Foil finish"), i("Long hair restyle", "$70", "60 min")] },
        { name: "Rituals", items: [i("The full service", "$95", "90 min · Cut, shave, scalp massage")] },
        { name: "Shave & beard", items: [i("Hot towel shave", "$48", "40 min · Straight razor, balm"), i("Beard sculpt", "$32", "25 min · Shape and line")] },
        { name: "Finishing", items: [i("Grey blending", "$40", "30 min"), i("Brow & ear tidy", "$15", "10 min")] },
      ],
    },
  },
  {
    id: "boutique-promotion", composition: "editorial", business: "retail", style: "light", terms: "products",
    name: { en: "Boutique Promotion", es: "Promoción boutique" },
    blurb: { en: "Editorial and calm, like a magazine page. A big serif headline, one offer band and featured products.", es: "Editorial y serena, como una página de revista. Gran titular con serifa, una franja de oferta y productos destacados." },
    useCase: { en: "Boutique collection promotion", es: "Promoción de colección boutique" },
    look: { head: "playfair-display", headWeight: 700, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.26 },
    variants: [
      v("stone", "Stone & rust", "Piedra y óxido", "#f2ede5", "#1c1a17", "#746b61", "#9b4a2c", "#9b4a2c"),
      v("sage", "Sage", "Salvia", "#eef0ea", "#18201b", "#66706a", "#3f5f4b", "#3f5f4b"),
      v("noir", "Noir", "Negro", "#141312", "#f3eee6", "#a49b90", "#d9a78a", "#d9a78a"),
    ],
    stock: "knitwear",
    sample: {
      title: "Linden & Co.", subtitle: "Knitwear, coats and quiet essentials.", footer: "Members get early access · Free alterations in store",
      featureTitle: "The Autumn Edit", featureDetail: "Up to 25% off knitwear · This weekend only",
      sections: [
        { name: "", items: [i("Merino crewneck", "$128", "Was $160 · Oat, charcoal"), i("Cable-knit cardigan", "$156", "Was $195 · Undyed wool"), i("Alpaca scarf", "$68", "Was $85 · Six colours"), i("Wool-blend coat", "$296", "Was $370 · Camel, black")] },
      ],
    },
  },
  {
    id: "product-spotlight", composition: "spotlight", business: "retail", style: "light", terms: "products",
    name: { en: "Product Spotlight", es: "Producto destacado" },
    blurb: { en: "One hero product in the centre, its story and price on one side, what makes it special on the other.", es: "Un producto protagonista en el centro, su historia y precio a un lado y lo que lo hace especial al otro." },
    useCase: { en: "Single hero product launch", es: "Lanzamiento de un producto estrella" },
    look: { head: "playfair-display", headWeight: 700, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.26 },
    variants: [
      v("stone", "Stone & rust", "Piedra y óxido", "#f2ede5", "#1c1a17", "#746b61", "#9b4a2c", "#9b4a2c"),
      v("sage", "Sage", "Salvia", "#eef0ea", "#18201b", "#66706a", "#3f5f4b", "#3f5f4b"),
      v("noir", "Noir", "Negro", "#141312", "#f3eee6", "#a49b90", "#d9a78a", "#d9a78a"),
    ],
    stock: "amberoil",
    sample: {
      title: "Solène Skin Studio", subtitle: "New arrival", footer: "Ask to try it in store",
      featureTitle: "Glow, bottled.", featureDetail: "Free travel mini with every bottle",
      sections: [
        { name: "Product", items: [i("Amber Facial Oil", "$64", "Rosehip, squalane and sea buckthorn. 30 ml.")] },
        { name: "Why it works", items: [i("Fragrance-free", "", "Gentle on sensitive skin"), i("Fast absorbing", "", "No greasy finish"), i("Refillable glass", "", "Bring it back for 15% off"), i("Made in small batches", "", "Cold-pressed oils")] },
      ],
    },
  },
  {
    id: "modern-gym", composition: "timetable", business: "fitness", style: "bold", terms: "classes",
    name: { en: "Modern Gym", es: "Gimnasio moderno" },
    blurb: { en: "Dark and athletic. A huge wordmark, today's classes by time and a bright offer block.", es: "Oscuro y atlético. Un gran logotipo, las clases de hoy por hora y una oferta llamativa." },
    useCase: { en: "Today's classes & member offer", es: "Clases de hoy y oferta para socios" },
    look: { head: "bebas-neue", headWeight: 400, body: "inter", sectionInHead: false, sectionWeight: 700, sectionTracking: 0.2, namesUpper: true },
    variants: [
      v("volt", "Volt", "Voltio", "#0a0a0b", "#f5f6f2", "#8c9088", "#d4ff3a", "#d4ff3a"),
      v("signal", "Signal", "Señal", "#0b0a0a", "#f6f3f1", "#958b86", "#ff5b2e", "#ff5b2e"),
      v("ice", "Ice", "Hielo", "#080b0e", "#f1f6fa", "#869099", "#5fd3ff", "#5fd3ff"),
    ],
    stock: "deadlift",
    sample: {
      title: "Forge", subtitle: "Strength & conditioning", footer: "Open 5 am – 11 pm daily · Book classes in the app or at the desk",
      featureTitle: "New member offer", featureDetail: "$29 · First month · No joining fee this week",
      sections: [
        { name: "Today’s classes", items: [i("HIIT Burn", "6:00", "Coach Maya · 45 min · Studio A"), i("Strength Lab", "7:15", "Coach Dre · 60 min · Platform"), i("Spin 45", "12:00", "Coach Lena · 45 min · Ride room"), i("Olympic Lifting", "17:30", "Coach Dre · 75 min · Platform"), i("Mobility Flow", "19:00", "Coach Sam · 40 min · Studio B")] },
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
    itemPhotoSize: DESIGN_ITEM_PHOTO_DEFAULT[design.composition],
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
  // Customization (text sizes, weights, spacing, section heading overrides) carries over; the featured media size is
  // clamped to this design's bounds, or dropped when it has no media area.
  return normalizeCustomFor(next);
}

/** True when this design can show a photo or video. */
export function designHasMedia(design: MenuDesign) {
  return design.composition !== "list" && design.composition !== "cards" && design.composition !== "featured";
}
/** Templates whose layout is built around item photos. */
export function isPhotoDesign(design: MenuDesign) {
  return design.composition === "cards" || design.composition === "featured" || design.photoStyle === "thumbs";
}
