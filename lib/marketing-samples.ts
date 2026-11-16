import type { Locale } from "@/lib/i18n/locales";

/**
 * Sample signage shown on the public marketing pages. Every business here is fictional and every board is
 * labelled as a sample design on the page. Business names and prices are the same in both languages;
 * dish names and descriptions are translated so a Spanish visitor sees a believable Spanish board.
 * The boards mirror real Pekko options: two menu columns plus a photo or video panel, Brand Kit colours,
 * logo and fonts (Noto Serif, Montserrat, Lobster, Oswald, Bebas Neue), and full-screen uploaded artwork.
 */
type Item = { name: string; price: string; desc?: string };
type Section = { name: string; items: Item[] };
type Feature = { kicker: string; title: string; price: string };
type MenuBoard = { sub: string; sections: [Section, Section]; foot: string; feature: Feature };

export type SampleCopy = {
  ember: MenuBoard & { special: Feature };
  bean: MenuBoard & { season: string; extra: string };
  forno: MenuBoard;
  brunch: { script: string; title: string; when: string; items: Item[]; stickerTop: string; stickerPrice: string };
  coldbrew: { title: string; price: string; priceNote: string; small: string };
  truck: { section: string; items: Item[]; bannerLeft: string; bannerRight: string };
  paws: { title: string; detail: string; badge: string };
  linden: { title: string; off: string; small: string };
};

const EN: SampleCopy = {
  ember: {
    sub: "Dinner menu",
    sections: [
      { name: "Starters", items: [
        { name: "Burrata & Peach", price: "$14", desc: "Basil oil, sourdough crisps" },
        { name: "Crispy Calamari", price: "$13", desc: "Lemon aioli, pickled chili" },
        { name: "Wood-Fired Wings", price: "$12", desc: "Honey-chili glaze" },
        { name: "Charred Broccolini", price: "$11", desc: "Chili crisp, lemon" },
      ] },
      { name: "Mains", items: [
        { name: "Oak Smash Burger", price: "$16", desc: "Aged cheddar, house sauce" },
        { name: "Rigatoni alla Vodka", price: "$18", desc: "Basil, parmesan, chili" },
        { name: "Smoked Salmon", price: "$24", desc: "Herb potatoes, dill cream" },
        { name: "Steak Frites", price: "$29", desc: "Ribeye, herb butter, fries" },
      ] },
    ],
    foot: "Kitchen open until 10 pm · Ask about today’s specials",
    feature: { kicker: "Chef’s pick", title: "Oak Smash Burger", price: "$16" },
    special: { kicker: "Tonight’s special", title: "Steak Frites", price: "$29" },
  },
  bean: {
    sub: "Coffee & bakery",
    season: "Fall menu",
    sections: [
      { name: "Espresso bar", items: [
        { name: "Latte", price: "$4.50", desc: "Espresso, steamed milk" },
        { name: "Maple Cortado", price: "$4.75", desc: "Double shot, maple" },
        { name: "Chai Latte", price: "$4.50", desc: "House spice blend" },
        { name: "Cold Brew", price: "$4.25", desc: "Steeped 18 hours" },
      ] },
      { name: "Bakery", items: [
        { name: "Butter Croissant", price: "$3.75", desc: "Baked every morning" },
        { name: "Almond Croissant", price: "$4.25", desc: "Toasted almond cream" },
        { name: "Pumpkin Loaf", price: "$3.95", desc: "Brown butter glaze" },
      ] },
    ],
    foot: "Oat or almond milk",
    extra: "+$0.75",
    feature: { kicker: "New this fall", title: "Maple Cortado", price: "$4.75" },
  },
  forno: {
    sub: "Wood-fired pizza",
    sections: [
      { name: "Pizzas", items: [
        { name: "Margherita", price: "$15", desc: "San Marzano, fior di latte, basil" },
        { name: "Diavola", price: "$17", desc: "Spicy salami, chili honey" },
        { name: "Funghi", price: "$16", desc: "Roasted mushrooms, thyme" },
        { name: "Quattro Formaggi", price: "$17", desc: "Four cheeses, hot honey" },
      ] },
      { name: "Sides & drinks", items: [
        { name: "Garlic Knots", price: "$7", desc: "Parmesan, parsley" },
        { name: "Caesar Salad", price: "$9", desc: "Romaine, croutons" },
        { name: "Italian Soda", price: "$4", desc: "Blood orange" },
        { name: "Tiramisu", price: "$8", desc: "Espresso, mascarpone" },
      ] },
    ],
    foot: "Slices until midnight Fri & Sat",
    feature: { kicker: "Fresh from the oven", title: "Margherita", price: "$15" },
  },
  brunch: {
    script: "Sunny Side Café",
    title: "Sunday Brunch",
    when: "Served 9 am – 2 pm",
    items: [
      { name: "Buttermilk Pancakes", price: "$11" },
      { name: "Avocado Toast", price: "$12" },
      { name: "Shakshuka Skillet", price: "$13" },
    ],
    stickerTop: "Bottomless coffee",
    stickerPrice: "$4",
  },
  coldbrew: { title: "Cold Brew Week", price: "$3.50", priceNote: "any size", small: "Through Sunday · Order at the counter" },
  truck: {
    section: "Today’s menu",
    items: [
      { name: "Brisket Sandwich", price: "$12" },
      { name: "Smash Burger", price: "$11" },
      { name: "Mac & Cheese Bowl", price: "$9" },
      { name: "Lemonade", price: "$3" },
    ],
    bannerLeft: "Today: Pier 4 · 11 am – 3 pm",
    bannerRight: "Cash & card",
  },
  paws: { title: "Adoption Saturday", detail: "Meet your new best friend · 10 am – 4 pm", badge: "Free nail trim with any bath" },
  linden: { title: "Summer Sale", off: "off", small: "Select styles · This weekend in store" },
};

const ES: SampleCopy = {
  ember: {
    sub: "Menú de la cena",
    sections: [
      { name: "Entradas", items: [
        { name: "Burrata con durazno", price: "$14", desc: "Aceite de albahaca, crujientes de masa madre" },
        { name: "Calamares crujientes", price: "$13", desc: "Alioli de limón, chile encurtido" },
        { name: "Alitas al horno de leña", price: "$12", desc: "Glaseado de miel y chile" },
        { name: "Brócoli tatemado", price: "$11", desc: "Aceite de chile, limón" },
      ] },
      { name: "Platos fuertes", items: [
        { name: "Hamburguesa Oak Smash", price: "$16", desc: "Cheddar añejo, salsa de la casa" },
        { name: "Rigatoni alla vodka", price: "$18", desc: "Albahaca, parmesano, chile" },
        { name: "Salmón ahumado", price: "$24", desc: "Papas a las hierbas, crema de eneldo" },
        { name: "Steak frites", price: "$29", desc: "Ribeye, mantequilla de hierbas, papas" },
      ] },
    ],
    foot: "Cocina abierta hasta las 10 pm · Pregunte por los especiales",
    feature: { kicker: "Recomendación del chef", title: "Hamburguesa Oak Smash", price: "$16" },
    special: { kicker: "Especial de esta noche", title: "Steak frites", price: "$29" },
  },
  bean: {
    sub: "Café y panadería",
    season: "Menú de otoño",
    sections: [
      { name: "Barra de espresso", items: [
        { name: "Latte", price: "$4.50", desc: "Espresso, leche vaporizada" },
        { name: "Cortado de maple", price: "$4.75", desc: "Doble carga, maple" },
        { name: "Chai latte", price: "$4.50", desc: "Mezcla de especias de la casa" },
        { name: "Cold brew", price: "$4.25", desc: "Infusionado 18 horas" },
      ] },
      { name: "Panadería", items: [
        { name: "Croissant clásico", price: "$3.75", desc: "Horneado cada mañana" },
        { name: "Croissant de almendra", price: "$4.25", desc: "Crema de almendra tostada" },
        { name: "Pan de calabaza", price: "$3.95", desc: "Glaseado de mantequilla dorada" },
      ] },
    ],
    foot: "Leche de avena o almendra",
    extra: "+$0.75",
    feature: { kicker: "Nuevo este otoño", title: "Cortado de maple", price: "$4.75" },
  },
  forno: {
    sub: "Pizza al horno de leña",
    sections: [
      { name: "Pizzas", items: [
        { name: "Margherita", price: "$15", desc: "San Marzano, fior di latte, albahaca" },
        { name: "Diavola", price: "$17", desc: "Salami picante, miel con chile" },
        { name: "Funghi", price: "$16", desc: "Hongos asados, tomillo" },
        { name: "Quattro formaggi", price: "$17", desc: "Cuatro quesos, miel picante" },
      ] },
      { name: "Extras y bebidas", items: [
        { name: "Nudos de ajo", price: "$7", desc: "Parmesano, perejil" },
        { name: "Ensalada César", price: "$9", desc: "Lechuga romana, crutones" },
        { name: "Soda italiana", price: "$4", desc: "Naranja sangría" },
        { name: "Tiramisú", price: "$8", desc: "Espresso, mascarpone" },
      ] },
    ],
    foot: "Rebanadas hasta medianoche vie. y sáb.",
    feature: { kicker: "Recién salida del horno", title: "Margherita", price: "$15" },
  },
  brunch: {
    script: "Sunny Side Café",
    title: "Brunch de domingo",
    when: "De 9 am a 2 pm",
    items: [
      { name: "Hot cakes de suero de leche", price: "$11" },
      { name: "Pan tostado con aguacate", price: "$12" },
      { name: "Shakshuka en sartén", price: "$13" },
    ],
    stickerTop: "Café ilimitado",
    stickerPrice: "$4",
  },
  coldbrew: { title: "Semana del cold brew", price: "$3.50", priceNote: "cualquier tamaño", small: "Hasta el domingo · Pida en el mostrador" },
  truck: {
    section: "Menú de hoy",
    items: [
      { name: "Sándwich de brisket", price: "$12" },
      { name: "Smash burger", price: "$11" },
      { name: "Bowl de mac & cheese", price: "$9" },
      { name: "Limonada", price: "$3" },
    ],
    bannerLeft: "Hoy: Muelle 4 · 11 am – 3 pm",
    bannerRight: "Efectivo y tarjeta",
  },
  paws: { title: "Sábado de adopción", detail: "Conozca a su nuevo mejor amigo · 10 am – 4 pm", badge: "Corte de uñas gratis con cualquier baño" },
  linden: { title: "Venta de verano", off: "desc.", small: "Estilos seleccionados · Este fin de semana en tienda" },
};

export function sampleCopy(locale: Locale): SampleCopy {
  return locale === "es" ? ES : EN;
}

/** Fictional names used on the sample boards. Never describe them as Pekko clients. */
export const SAMPLE_BUSINESSES = ["Ember & Oak", "Bean There", "Forno Rosso", "Sunny Side Café", "Smoke & Wheels", "Paws & Co.", "Linden & Co."] as const;

export const SAMPLE_MEDIA = {
  burger: "/marketing/samples/burger-portrait.webp",
  latte: "/marketing/samples/latte-portrait.webp",
  pizzaPoster: "/marketing/samples/pizza-poster.webp",
  pizzaVideo: "/marketing/samples/pizza-loop.mp4",
  pancakes: "/marketing/samples/pancakes-portrait.webp",
  coldBrew: "/marketing/samples/cold-brew.webp",
  ribs: "/marketing/samples/ribs-portrait.webp",
  beagle: "/marketing/samples/beagle-portrait.webp",
  bags: "/marketing/samples/bags.webp",
  croissant: "/marketing/samples/croissant.webp",
  steak: "/marketing/samples/steak-portrait.webp",
  interior: "/marketing/samples/restaurant-interior.webp",
} as const;

/**
 * Responsive image attributes for a sample photo: phones download the half-size file (-sm.webp).
 * `panel` images fill a board's side panel; `full` images fill the whole board.
 */
const FULL_WIDTH: Record<string, number> = { "cold-brew": 1600, bags: 1600, "pizza-poster": 720 };
export function sampleImage(src: string, fill: "panel" | "full" = "panel") {
  const name = src.split("/").pop()!.replace(/\.webp$/, "");
  const full = FULL_WIDTH[name] ?? 900;
  return {
    src,
    srcSet: `${src.replace(/\.webp$/, "-sm.webp")} ${Math.round(full / 2)}w, ${src} ${full}w`,
    sizes: fill === "full" ? "(max-width: 768px) 92vw, 50vw" : "(max-width: 768px) 40vw, 24vw",
  };
}

