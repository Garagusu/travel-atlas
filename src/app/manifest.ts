import type { MetadataRoute } from "next";

/** Lets phones install the journal to the home screen like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Travel Atlas",
    short_name: "Travel Atlas",
    description: "A private journal of the places you've been across the United States.",
    start_url: "/",
    display: "standalone",
    background_color: "#faf8f4",
    theme_color: "#faf8f4",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
