# website

Website van Seppe Verbeke — AI & automatisatie voor Belgische kmo's.

Statische site (geen build-stap), gehost op Netlify. Ontworpen volgens het Seppeverbeke-brandbook v1 (kleuren, typografie, componenten, mobile-first, twee signature-microinteracties).

## Structuur
- `index.html`, `diensten.html`, `portfolio.html` (+ 7 `portfolio-*.html` detailpagina's), `over-mij.html`, `blog.html`, `contact.html`, `404.html`
- `css/style.css` — design tokens + componenten
- `js/main.js` — mobiele nav, FAQ-accordion, scroll-reveal
- `robots.txt`, `sitemap.xml` — SEO-basis
- `netlify.toml` — headers + 404-redirect

## Lokaal bekijken
Open `index.html` in de browser, of start een lokale server:

```bash
python3 -m http.server 8000
```

## Nog te doen
- Echte cijfers voor de stat-rows invullen (huidige `-80%` / `20u` / `48u` zijn placeholder)
- "Over mij"-tekst invullen (huidige content is placeholder)
- Agenda-link voor rechtstreeks intake boeken (contact.html)
- Open Graph-afbeelding toevoegen
