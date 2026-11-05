import { TRIAL } from "@/lib/plans";

/** Marketing copy. Every claim here maps to a feature that exists on main; don't add unbuilt ones. */
export const FEATURES = [
  { id: "devices", title: "Any screen with a web browser", body: "Smart TVs, tablets, computers and TV sticks run the Pekko player in their browser. Open the player, type the 6-digit code into your dashboard, and the screen is paired." },
  { id: "media", title: "Images, videos and menu boards", body: "Upload images and MP4 videos to your media library, or build digital menu boards from ready-made templates." },
  { id: "playlists", title: "Playlists", body: "Arrange slides, set how long each one shows, and preview the result before you publish it to your screens." },
  { id: "schedules", title: "Schedules", body: "Show breakfast in the morning and dinner at night. Schedule playlists by day and time for single screens or screen groups, per location and time zone." },
  { id: "screens", title: "Multiple screens and locations", body: "Manage every screen from one dashboard. Group screens and run different content in each location." },
  { id: "remote", title: "Remote management", body: "Change what's playing from your phone or computer. Screens pick up published changes on their own, usually within a minute." },
  { id: "status", title: "Screen status and alerts", body: "See which screens are online, what each one is showing, and get an alert in your dashboard when a screen goes offline or comes back." },
  { id: "offline", title: "Keeps playing offline", body: "If the internet drops, the player keeps showing saved content and catches up when it reconnects." },
  { id: "analytics", title: "Uptime and activity", body: "Analytics show screen uptime, what's on each screen, and recent activity in your account." },
] as const;

export const SHOTS = {
  dashboard: { src: "/marketing/dashboard.webp", alt: "Pekko dashboard overview showing screens online and offline, media, playlists and schedules", w: 1200, h: 750 },
  playlists: { src: "/marketing/playlists.webp", alt: "Pekko playlists list", w: 1200, h: 750 },
  schedule: { src: "/marketing/schedule.webp", alt: "Pekko schedule page with weekday rules for a screen group", w: 1200, h: 750 },
  displays: { src: "/marketing/displays.webp", alt: "Pekko displays page with paired screens and their status", w: 1200, h: 750 },
  media: { src: "/marketing/media.webp", alt: "Pekko media library", w: 1200, h: 750 },
  tvMenu: { src: "/marketing/tv-menu.webp", alt: "A TV running the Pekko player showing a digital menu board", w: 1200, h: 675 },
  tvPromo: { src: "/marketing/tv-promo.webp", alt: "A TV running the Pekko player showing a promotion slide", w: 1200, h: 675 },
} as const;

export const FAQ: { q: string; a: string }[] = [
  { q: "How does the free trial work?", a: `Your ${TRIAL.days}-day trial starts when you create your account. It includes every feature on up to ${TRIAL.screens} screens, the full Multi-screen experience. We don't ask for a card.` },
  { q: "What happens when the trial ends?", a: "Your screens keep playing for 3 more days. If you don't choose a plan, they pause. Your content and settings are never deleted when a trial ends, and choosing a plan turns your screens back on." },
  { q: "What counts as a screen?", a: "Each display paired to your account with the Pekko player counts as one screen, whether it's a TV, tablet or computer." },
  { q: "Which plans are there?", a: "Starter is $19 a month for 1 screen, Business is $39 a month for up to 3 screens, and Multi-screen is $59 a month for up to 5 screens. Prices are in US dollars, billed monthly; taxes may apply." },
  { q: "What devices does Pekko work on?", a: "Any device with a modern web browser: smart TVs, TV sticks, tablets and computers. You manage everything from a browser on your phone or computer." },
  { q: "Do I need special hardware?", a: "No. If your TV has a web browser, open the Pekko player on it. Otherwise, a computer or TV stick connected to the screen works." },
  { q: "What if the internet goes down?", a: "The player keeps showing content it has already saved and updates when the connection comes back. Your dashboard shows the screen as offline in the meantime." },
  { q: "Can I cancel or delete my account?", a: "There's no card on file during the trial, so there's nothing to cancel. You can delete your account at any time from Settings; deletion runs 7 days later and you can cancel it until then." },
];
