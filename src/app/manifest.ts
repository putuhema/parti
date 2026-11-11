import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "pums party",
    short_name: "pums party",
    description: "A party of games to play with friends.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f7f0ea",
    theme_color: "#f7f0ea",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/logo.png", sizes: "378x378", type: "image/png", purpose: "any" },
    ],
  };
}
