import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pekko",
    short_name: "Pekko",
    description: "Pekko Technologies. Making life simpler every day.",
    start_url: "/",
    display: "standalone",
    background_color: "#F4F7FB",
    theme_color: "#0066FF",
    icons: [
      { src: "/brand/icon-light.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-dark.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/brand/icon-alt.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
