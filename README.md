# website

Website van Seppe Verbeke — AI & automatisatie voor Belgische kmo's.

Statische site (geen build-stap), gehost op Netlify. Ontworpen volgens het Seppeverbeke-brandbook v1 (kleuren, typografie, componenten, mobile-first, twee signature-microinteracties).

## Structuur
- `index.html`, `diensten.html`, `cases.html`, `over-mij.html`, `blog.html`, `contact.html`, `404.html`
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
- Echt domein instellen (nu `https://seppeverbeke.be` als placeholder in canonical tags, sitemap.xml, robots.txt en schema.org)
- Echte cases/cijfers, "over mij"-tekst en e-mailadres invullen (huidige content is placeholder)
- Agenda-link voor rechtstreeks intake boeken (contact.html)
- Open Graph-afbeelding toevoegen
