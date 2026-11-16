import type { MetadataRoute } from "next";

/** Lets people add BuildPath to the home screen of their phone and open it like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "BuildPath",
    short_name: "BuildPath",
    description: "От идеи до готового сайта — по этапам, с телефона.",
    start_url: "/projects",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f2f4f8",
    theme_color: "#141b2d",
    lang: "ru",
    icons: [
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
