// =====================================================================
// KESNOENE · speldata (publiek)
// Dit bestand is leesbaar door iedereen die de pagina bezoekt. Er staat
// daarom NERGENS geheime inhoud in: geen namen/iconen/uren van stops,
// geen tekst van activiteitenvakjes, geen spelerscodes of admincode.
// Die staan in Supabase (secret_stops, secret_cells, secret_config),
// ingevuld via supabase-seed.sql (niet gecommit, zie .gitignore).
//
// Stop-id's hier zijn neutraal (s1, s2, ...) zodat ze niets verklappen.
// Pas dit bestand aan, niet app.js.
// Let op: na 28/11 07:00 niets meer wijzigen aan "CELLS" of "CARD",
// anders verschuiven de kaarten van de spelers.
// =====================================================================

export const MISSION = {
  title: "MISSION KESNOENE",
  start: "2026-11-28T07:50:00+01:00",   // aftelling loopt hiernaartoe
  end:   "2026-11-28T20:00:00+01:00",   // daarna: "Mission accomplished"
};

// Spelers. Codes staan in secret_config, niet hier.
export const PLAYERS = [
  { id: "seppe",  name: "Seppe" },
  { id: "dennus", name: "Dennus" },
  { id: "spriet", name: "Spriet" },
  { id: "kruidn", name: "Kruidn" },
];

// Kaartopbouw per speler
export const CARD = {
  size: 4,              // 4 = 4x4 (16 vakjes, geen gratis vakje) · 5 = 5x5 (24 + gratis midden)
  activities: 4,        // aantal vergrendelde activiteitenvakjes per kaart
  personal: 4,          // aantal vakjes over ANDERE spelers per kaart
  // de rest wordt aangevuld met algemene vakjes
};

// Neutrale stop-id's, enkel om activiteitenvakjes te verdelen. De echte
// naam/icoon/uur van elke stop staat server-side (secret_stops) en is
// enkel zichtbaar voor de spelleider via het admin-paneel.
export const STOP_IDS = ["s1", "s2", "s3", "s4", "s5", "s6", "s7", "s8"];

// Vakjes
// type: "general"  = kan op elke kaart
//       "personal" = gaat over speler `about`, komt NOOIT op diens eigen kaart
//       "activity" = vergrendeld tot `stop` open is. Tekst/icoon staan
//                    server-side in secret_cells, niet hier.
// id: vast en uniek, nooit hergebruiken (wordt zo opgeslagen in Supabase)
export const CELLS = [
  // ---- algemeen ----
  { id: "g01", type: "general", icon: "💤", text: "Iemand valt in slaap" },
  { id: "g02", type: "general", icon: "🚗", text: "De 2CV valt stil" },
  { id: "g03", type: "general", icon: "↩️", text: "Foute weg ingeslagen" },
  { id: "g04", type: "general", icon: "🇩🇪", text: "Iemand doet een Duits accent" },
  { id: "g05", type: "general", icon: "🫡", text: "Iemand salueert" },
  { id: "g06", type: "general", icon: "🍸", text: "Er wordt een picon besteld" },
  { id: "g07", type: "general", icon: "💦", text: "Iemand morst zijn drank" },
  { id: "g08", type: "general", icon: "💼", text: "Iemand begint over het werk" },
  { id: "g09", type: "general", icon: "🔁", text: "Iemand vertelt een verhaal dat iedereen al kent" },
  { id: "g10", type: "general", icon: "🔍", text: "Iemand verliest of vergeet iets" },
  { id: "g11", type: "general", icon: "🚴", text: "Iemand vloekt op een fietser" },
  { id: "g12", type: "general", icon: "🎶", text: "Iemand zingt een liedje mee" },
  { id: "g13", type: "general", icon: "🤕", text: "Iemand stoot zijn hoofd" },
  { id: "g14", type: "general", icon: "🗣️", text: "Iemand begint te praten tegen een wildvreemde" },
  { id: "g15", type: "general", icon: "💥", text: "Iemand doet een gevechtsgeluid na" },
  { id: "g16", type: "general", icon: "🧭", text: "Iemand loopt de groep kwijt" },

  // ---- persoonlijk ----
  { id: "p01", type: "personal", about: "dennus", icon: "🍺", text: "Dennus drinkt een drankje ad fundum" },
  { id: "p02", type: "personal", about: "dennus", icon: "📺", text: "Dennus vertelt over een BV die klant is of wordt" },
  { id: "p03", type: "personal", about: "spriet", icon: "📜", text: "Spriet vertelt een weetje over de oorlog" },
  { id: "p04", type: "personal", about: "kruidn", icon: "📸", text: "Kruidn babbelt over een (Instagram)model of actrice" },
  // TODO: meer persoonlijke vakjes over seppe, spriet, kruidn

  // ---- activiteiten (vergrendeld, tekst/icoon staan server-side) ----
  { id: "a01", type: "activity", stop: "s3" },
  { id: "a02", type: "activity", stop: "s7" },
  // TODO: minstens 1 per stop
];

// =====================================================================
// BRIEFING op de landingspagina (voor MISSION.start, daarna verdwijnt hij
// vanzelf). Alle teksten hier; niets hardgecodeerd in app.js.
// =====================================================================
export const BRIEFING = {
  title: "BRIEFING",
  openButton: "Lees je orders",
  closeButton: "Sluit de orders",
  sections: [
    {
      heading: "RENDEZ-VOUS",
      lines: [
        "Station Izegem · Stationsstraat 2A",
        "50°55'15.4\"N 3°12'53.3\"E",
        "Zaterdag 28.11 · 07:40 stipt",
      ],
      map: {
        label: "Open in Maps",
        lat: 50.920944,
        lng: 3.214806,
        apple: "https://maps.apple.com/?ll={lat},{lng}&q=Station%20Izegem",
        google: "https://www.google.com/maps/search/?api=1&query={lat},{lng}",
      },
    },
    {
      heading: "UITRUSTING",
      items: ["Warme, waterdichte kledij", "Goeie schoenen", "Identiteitskaart", "Opgeladen gsm"],
    },
    {
      heading: "VOORBEREIDING",
      items: ["Je persoonlijke code krijg je op de dag zelf."],
    },
  ],
};

// Spelregels, getoond in een uitklapbaar blok op de kaart. Vul later aan.
export const RULES = [];

// =====================================================================
// EASTER EGGS
// Alle teksten en instellingen van de easter eggs staan hier. Niets
// hiervan is geheim: stopnamen komen er bewust niet in voor.
// Sjablonen gebruiken {accolades}, bv. {name}, {rank}, {n}.
// =====================================================================
export const EASTER_EGGS = {

  // 4. De 2CV rijdt voorbij: elk heel uur, enkel tussen MISSION.start en
  // MISSION.end. Het uur zelf (minuut 0) staat vast; windowSec is hoeveel
  // seconden na het uur een pagina die net opent hem nog mag laten rijden.
  car: {
    durationMs: 6000,
    windowSec: 30,
    bubble: "pruttel pruttel",
    puff: "PFFT…",
    stallMs: 2000,
    ariaLabel: "Een 2CV rijdt voorbij",
  },

  // 5. Dog tags op de foto. x, y en r zijn percentages van de foto
  // (x van links, y van boven, r = straal als percentage van de breedte).
  // Van links naar rechts staan op de foto: Dennus, Kruidn, Spriet, Seppe.
  // Zet ?zones=1 achter de url om de tikzones als rode cirkels te zien en
  // ze bij te stellen.
  dogtags: [
    { player: "dennus", name: "DENNUS", x: 22, y: 33, r: 8,
      rank: "Korporaal Drankbevoorrading",
      specialty: "Ad fundum onder vijandelijk vuur. Kent elke BV persoonlijk." },
    { player: "kruidn", name: "KRUIDN", x: 40, y: 30, r: 8,
      rank: "Verkenner 1e klas",
      specialty: "Instagram-surveillance. Spot elk model binnen 5 km." },
    { player: "spriet", name: "SPRIET", x: 53, y: 40, r: 8,
      rank: "Historicus van dienst",
      specialty: "Weet alles over de oorlog. Vertelt het ook allemaal." },
    { player: "seppe", name: "SEPPE", x: 73, y: 36, r: 8,
      rank: "Opperbevelhebber",
      specialty: "Zette voor het eerst iets in de agenda op de juiste dag." },
  ],
  dogtagHoldMs: 500,

  // 6. Rangen per aantal aangevinkte vakjes. fullCard: enkel bij een volle
  // kaart. chevrons = strepen, stars = sterren op het insigne.
  ranks: [
    { min: 0,  name: "Soldaat",   chevrons: 0, stars: 0 },
    { min: 4,  name: "Korporaal", chevrons: 1, stars: 0 },
    { min: 8,  name: "Sergeant",  chevrons: 2, stars: 0 },
    { min: 12, name: "Luitenant", chevrons: 0, stars: 1 },
    { min: 16, name: "Generaal",  chevrons: 0, stars: 3, fullCard: true },
  ],
  promotion: {
    toastSelf: "📯 Bevorderd tot {rank}!",
    feed: "📯 {name} is bevorderd tot {rank}",
  },

  // 9. Te veel tikken op een slot
  lockSpam: {
    taps: 5,
    withinMs: 2000,
    title: "Netjes geprobeerd, soldaat.",
    text: "Strafje: salueer naar de groep.",
    button: "Begrepen 🫡",
  },

  // 10. Eindgeneriek vanaf MISSION.end tot memorial.from
  credits: {
    title: "MISSION KESNOENE",
    ariaLabel: "Eindgeneriek",
    date: "28.11.2026",
    starringLabel: "Starring",
    starring: [
      { name: "Dennus", role: "as himself" },
      { name: "Spriet", role: "as himself" },
      { name: "Kruidn", role: "as himself" },
    ],
    directedLabel: "Written and directed by",
    directed: { name: "Seppe", role: "as himself" },
    locationsLabel: "Locations",
    locations: ["Poperinge", "Wijtschate", "Kemmel", "Loker"],
    standingsLabel: "Final standings",
    winnerLabel: "Winnaar van de dag",
    standingRow: "{count} / {total} vakjes · {lines} lijnen · {rank}",
    standingsUnavailable: "Eindstand niet beschikbaar",
    thanksLabel: "Special thanks",
    thanks: ["TODO: naam", "TODO: naam", "TODO: naam"],
    lastLine: "No soldiers were harmed. Some livers were.",
    skipButton: "Overslaan",
    toCardButton: "Naar mijn kaart",
    replayButton: "Opnieuw bekijken",
    pausedLabel: "Gepauzeerd",
    scrollSpeed: 34,     // pixels per seconde
    photoFadeMs: 6000,
  },

  // 11. Na middernacht (alleen-lezen)
  memorial: {
    from: "2026-11-29T00:00:00+01:00",
    title: "Mission Kesnoene · 28.11.2026",
    line: "Lest we forget.",
    replayButton: "Bekijk de eindgeneriek",
    toCardButton: "Naar mijn kaart",
    readOnlyNote: "De missie is voorbij: je kaart is alleen te bekijken.",
    readOnlyToast: "De missie is voorbij, soldaat.",
  },

  // 12. Verjaardag: 28 november van elk volgend jaar
  anniversary: {
    banner: "{n} jaar geleden… Tijd voor een nieuwe missie?",
    button: "Herbeleef de missie",
    toCardButton: "Naar mijn kaart",
  },

  // Admin-paneel: "Easter eggs testen"
  adminTest: {
    title: "Easter eggs testen",
    exitPreview: "Sluit voorbeeld",
    items: [
      { id: "car",         label: "2CV rijdt voorbij" },
      { id: "dogtag",      label: "Dog tag tonen" },
      { id: "promotion",   label: "Bevordering" },
      { id: "lockspam",    label: "Slot-spam" },
      { id: "credits",     label: "Eindgeneriek" },
      { id: "memorial",    label: "Na middernacht" },
      { id: "anniversary", label: "Verjaardag" },
    ],
  },
};
