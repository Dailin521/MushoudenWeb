# Team Platypus

The English website for Team Platypus, featuring Gods on Duty. Astro builds the Games, About, and Contact pages as static HTML.

## Development

Use Node.js 22.23.4 or later.

```sh
npm ci
npm run dev
npm run check
npm run build
npm run preview
```

GitHub Actions deploys pushes to `main` at [the existing GitHub Pages site](https://dailin521.github.io/MushoudenWeb/). To reproduce the Pages build, set `SITE_URL=https://dailin521.github.io` and `BASE_PATH=/MushoudenWeb` before building. The legacy Games, English, and Community URLs redirect to their corresponding English pages.

## Sizing

Fixed CSS lengths and responsive breakpoints use `rem`, converted from the approved layout at a 16px default root font size. The root uses `110%` for the approved 1.1× scale while respecting browser font preferences. Percentage/viewport sizing, unitless line heights, and font-relative letter spacing, underline offsets, and the Contact heading's cap-height spacing retain their proportional behavior. Media-query rem units refer to the browser's default font size, not the root override. The navigation's JavaScript media query must match the CSS breakpoint.

## Artwork

The site uses the supplied artwork in `public/media/platypus/`. The Games hero is from `组 3.png`, the gallery uses `组 4.png`, `组 6.png`, and `组 5.png` in that order, and the About page uses `logo.png`. Images are WebP at their original dimensions. The bundled Noto Sans SC Latin font and its OFL license are in `public/fonts/`.
