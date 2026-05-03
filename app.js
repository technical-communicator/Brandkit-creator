/* ═══════════════════════════════════════════════════════════
   BRANDKIT — app.js
   ═══════════════════════════════════════════════════════════ */

'use strict';

/* ─────────────────────────────────────────────────────────────
   1. COLOR UTILITIES
   ───────────────────────────────────────────────────────────── */

function hexToRgb(hex) {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex.trim());
  return m ? { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) } : { r: 0, g: 0, b: 0 };
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
}

function hexToHsl(hex) {
  let { r, g, b } = hexToRgb(hex);
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function hslToHex(h, s, l) {
  h = ((h % 360) + 360) % 360;
  s = Math.max(0, Math.min(100, s)) / 100;
  l = Math.max(0, Math.min(100, l)) / 100;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1))).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

function getRelativeLuminance(hex) {
  const { r, g, b } = hexToRgb(hex);
  const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

function contrastRatio(hex1, hex2) {
  const l1 = getRelativeLuminance(hex1), l2 = getRelativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

function textOnBg(bgHex) {
  return contrastRatio(bgHex, '#FFFFFF') >= contrastRatio(bgHex, '#111111') ? '#FFFFFF' : '#111111';
}

function darken(hex, amt) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.max(0, l - amt));
}

function lighten(hex, amt) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, s, Math.min(100, l + amt));
}

function saturate(hex, amt) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.min(100, s + amt), l);
}

function desaturate(hex, amt) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex(h, Math.max(0, s - amt), l);
}

function complementary(hex) {
  const { h, s, l } = hexToHsl(hex);
  return hslToHex((h + 180) % 360, s, l);
}

function splitComplementary(hex) {
  const { h, s, l } = hexToHsl(hex);
  return [hslToHex((h + 150) % 360, s, l), hslToHex((h + 210) % 360, s, l)];
}

/* ─────────────────────────────────────────────────────────────
   2. COLOR EXTRACTION FROM IMAGES
   ───────────────────────────────────────────────────────────── */

function extractDominantColors(imgEl, numColors = 8) {
  const srcW = imgEl.naturalWidth  || imgEl.width  || 0;
  const srcH = imgEl.naturalHeight || imgEl.height || 0;
  if (!srcW || !srcH) return [];
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const maxDim = 80;
  const scale = Math.min(maxDim / srcW, maxDim / srcH);
  canvas.width  = Math.max(1, Math.round(srcW * scale));
  canvas.height = Math.max(1, Math.round(srcH * scale));
  ctx.drawImage(imgEl, 0, 0, canvas.width, canvas.height);

  let data;
  try { data = ctx.getImageData(0, 0, canvas.width, canvas.height).data; }
  catch { return []; }

  const buckets = {};
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
    if (a < 128) continue;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    if (brightness > 240 || brightness < 15) continue;

    const { h, s } = hexToHsl(rgbToHex(r, g, b));
    if (s < 8) continue; // skip near-grays

    // Quantize to reduce noise
    const qr = Math.round(r / 28) * 28;
    const qg = Math.round(g / 28) * 28;
    const qb = Math.round(b / 28) * 28;
    const key = `${qr},${qg},${qb}`;
    if (!buckets[key]) buckets[key] = { r: qr, g: qg, b: qb, count: 0, h, s };
    buckets[key].count++;
  }

  const sorted = Object.values(buckets).sort((a, b) => b.count - a.count);

  // Pick maximally diverse colors by hue spacing
  const selected = [];
  for (const c of sorted) {
    if (selected.length >= numColors) break;
    const hueDist = h => Math.min(Math.abs(c.h - h), 360 - Math.abs(c.h - h));
    const tooClose = selected.some(s => hueDist(s.h) < 28);
    if (!tooClose || selected.length === 0) selected.push(c);
  }

  // Pad if needed
  if (selected.length < 3) {
    sorted.slice(0, numColors).forEach(c => {
      if (selected.length < numColors && !selected.includes(c)) selected.push(c);
    });
  }

  return selected.map(c => rgbToHex(c.r, c.g, c.b));
}

async function extractColorsFromUploadedImages() {
  // uploadedImages is the authoritative array (defined later, but called after full parse)
  if (typeof uploadedImages === 'undefined' || !uploadedImages.length) return [];
  const allColors = [];
  for (const img of uploadedImages) {
    if (img.naturalWidth > 0) allColors.push(...extractDominantColors(img, 5));
  }
  return allColors.slice(0, 6);
}

/* ─────────────────────────────────────────────────────────────
   3. FONT PAIRINGS DATA
   ───────────────────────────────────────────────────────────── */

const FONT_PAIRINGS = [
  { id: 'editorial',   heading: 'Playfair Display',   body: 'Lato',               hw: '700', bw: '400', desc: 'Elegant serif headings with clean humanist body text.', keywords: ['elegant','luxury','editorial','sophisticated','premium','fashion','boutique','artisan','refined'], industries: ['fashion-beauty','arts-entertainment','food-beverage'], wordmarkTracking: '-0.01em', allCaps: false },
  { id: 'bold',        heading: 'Oswald',              body: 'Merriweather',        hw: '700', bw: '400', desc: 'Condensed sans headings with solid slab-serif body — strong and readable.', keywords: ['bold','strong','powerful','impactful','energetic','assertive','direct'], industries: ['sports','fitness','construction'], wordmarkTracking: '0.06em', allCaps: true },
  { id: 'modern',      heading: 'Montserrat',          body: 'Open Sans',           hw: '700', bw: '400', desc: 'Geometric sans-serif throughout — modern, neutral, universal.', keywords: ['modern','clean','professional','corporate','neutral','polished'], industries: ['technology','finance','consulting','professional-services'], wordmarkTracking: '0.04em', allCaps: false },
  { id: 'friendly',    heading: 'Nunito',              body: 'Nunito Sans',         hw: '700', bw: '400', desc: 'Rounded letterforms that feel warm, welcoming, and approachable.', keywords: ['friendly','approachable','playful','warm','cheerful','fun','community','inclusive'], industries: ['education','nonprofit','children'], wordmarkTracking: '0.01em', allCaps: false },
  { id: 'artisan',     heading: 'Cormorant Garamond',  body: 'Proza Libre',         hw: '700', bw: '400', desc: 'Refined old-style serifs — artisan character with excellent readability.', keywords: ['artisan','craft','traditional','heritage','organic','natural','honest','earthy'], industries: ['food-beverage','health-wellness'], wordmarkTracking: '0.02em', allCaps: false },
  { id: 'tech',        heading: 'IBM Plex Sans',       body: 'IBM Plex Mono',       hw: '600', bw: '400', desc: 'Systematic type system — precise, technical, trustworthy.', keywords: ['technical','precise','systematic','developer','engineering','data','code'], industries: ['technology'], wordmarkTracking: '0.08em', allCaps: true },
  { id: 'creative',    heading: 'Raleway',             body: 'Source Sans 3',       hw: '700', bw: '400', desc: 'Art-deco inspired headings with clear, open body text.', keywords: ['creative','artistic','expressive','design','agency','photography','unconventional'], industries: ['design','agency','arts-entertainment'], wordmarkTracking: '0.12em', allCaps: true },
  { id: 'startup',     heading: 'Inter',               body: 'Inter',               hw: '700', bw: '400', desc: 'Optimised for screens — clean, functional, efficient.', keywords: ['startup','digital','functional','efficient','innovative','saas','minimal'], industries: ['technology','retail'], wordmarkTracking: '0.0em', allCaps: false },
  { id: 'classic',     heading: 'Libre Baskerville',   body: 'Source Sans 3',       hw: '700', bw: '400', desc: 'Classic serif heading with modern sans body — timeless and trustworthy.', keywords: ['classic','trustworthy','academic','established','reliable','authoritative'], industries: ['education','finance','real-estate','professional-services'], wordmarkTracking: '0.03em', allCaps: false },
  { id: 'geometric',   heading: 'Josefin Sans',        body: 'Josefin Slab',        hw: '700', bw: '400', desc: 'Geometric pair with 1920s art-deco character — structured and stylish.', keywords: ['geometric','vintage','retro','architectural','structured','distinctive'], industries: ['real-estate','travel-hospitality','fashion-beauty'], wordmarkTracking: '0.1em', allCaps: true },
  // Graphic-design-forward additions (2024–2025 editorial favourites)
  { id: 'fraunces',    heading: 'Fraunces',            body: 'Plus Jakarta Sans',   hw: '700', bw: '400', desc: 'Optical-size variable serif with personality paired with geometric humanist body.', keywords: ['editorial','expressive','distinctive','literary','craft','journal','magazine','narrative'], industries: ['arts-entertainment','food-beverage','fashion-beauty'], wordmarkTracking: '-0.02em', allCaps: false },
  { id: 'syne',        heading: 'Syne',                body: 'Space Grotesk',       hw: '700', bw: '400', desc: 'Avant-garde geometric headings with quirky grotesk body — design-forward.', keywords: ['design','agency','avant-garde','studio','contemporary','experimental','graphic','unconventional'], industries: ['design','arts-entertainment','technology'], wordmarkTracking: '0.08em', allCaps: true },
  { id: 'bebas',       heading: 'Bebas Neue',          body: 'Archivo',             hw: '400', bw: '400', desc: 'All-caps condensed impact headings with versatile grotesque body text.', keywords: ['bold','strong','impact','powerful','sports','urban','high-impact','energetic','assertive','intense'], industries: ['sports','arts-entertainment','retail'], wordmarkTracking: '0.12em', allCaps: true },
  { id: 'dmserif',     heading: 'DM Serif Display',    body: 'DM Sans',             hw: '400', bw: '400', desc: 'Transitional display serif matched with its humanist sans — polished and harmonious.', keywords: ['polished','refined','editorial','modern','premium','sophisticated','elevated','luxury'], industries: ['fashion-beauty','professional-services','finance'], wordmarkTracking: '0em', allCaps: false },
  { id: 'bricolage',   heading: 'Bricolage Grotesque', body: 'Plus Jakarta Sans',   hw: '700', bw: '400', desc: 'Variable grotesque with warmth and character — feels human, not generic.', keywords: ['human','warm','tech','startup','approachable','community','friendly','personality'], industries: ['technology','education','nonprofit'], wordmarkTracking: '-0.01em', allCaps: false },
  { id: 'unbounded',   heading: 'Unbounded',           body: 'Space Grotesk',       hw: '700', bw: '400', desc: 'Futuristic geometric headings — strong brand presence for forward-looking brands.', keywords: ['futuristic','tech','innovation','geometric','forward','progressive','digital','web3'], industries: ['technology','finance','retail'], wordmarkTracking: '0.1em', allCaps: true },
  { id: 'jakarta',     heading: 'Plus Jakarta Sans',   body: 'Plus Jakarta Sans',   hw: '700', bw: '400', desc: 'Versatile geometric humanist equally strong for both headings and body.', keywords: ['clean','modern','startup','minimal','digital','versatile','professional'], industries: ['technology','education','professional-services'], wordmarkTracking: '0.02em', allCaps: false },
  { id: 'archivo',     heading: 'Archivo Black',       body: 'Archivo',             hw: '900', bw: '400', desc: 'Heavy grotesque heading with lighter grotesque body — strong brand contrast.', keywords: ['impactful','commercial','confident','direct','retail','brand','promotions','marketing','bold'], industries: ['retail','food-beverage','nonprofit'], wordmarkTracking: '0.05em', allCaps: false },
];

/* ─────────────────────────────────────────────────────────────
   4. BRAND ARCHETYPES (Aaker's five dimensions)
   ───────────────────────────────────────────────────────────── */

const ARCHETYPES = {
  sincerity: {
    label: 'Sincere',
    emoji: '🌿',
    desc: 'Honest · Warm · Wholesome',
    traits: ['warm','honest','genuine','approachable','friendly'],
    satMod: -8, warmMod: +15,
    preferredFonts: ['artisan','fraunces','friendly','classic'],
    formality: 38, enthusiasm: 58,
    examples: 'Patagonia · Innocent · Ben & Jerry\'s',
    archIntro: (n) => `${n} is grounded in genuine values and real human connection. Speaks with warmth, avoids pretense, and earns trust by saying exactly what it means — never spinning, never performing.`,
    wordmarkWeight: '600', wordmarkCase: 'title',
  },
  excitement: {
    label: 'Exciting',
    emoji: '⚡',
    desc: 'Daring · Spirited · Imaginative',
    traits: ['energetic','bold','creative','fresh','inspiring'],
    satMod: +18, warmMod: +5,
    preferredFonts: ['bebas','syne','bold','creative','unbounded'],
    formality: 72, enthusiasm: 88,
    examples: 'Red Bull · Nike · Spotify',
    archIntro: (n) => `${n} lives at the edge of what's possible. Speaks with conviction and energy — never mundane, always moving. Takes risks with language the same way it takes risks in everything else.`,
    wordmarkWeight: '800', wordmarkCase: 'upper',
  },
  competence: {
    label: 'Competent',
    emoji: '🎯',
    desc: 'Reliable · Intelligent · Successful',
    traits: ['authoritative','trustworthy','professional','clear','technical'],
    satMod: -5, warmMod: -10,
    preferredFonts: ['modern','tech','classic','startup','jakarta'],
    formality: 22, enthusiasm: 38,
    examples: 'IBM · Apple · McKinsey',
    archIntro: (n) => `${n} commands respect through demonstrated expertise, not claimed authority. Every word is deliberate, every claim backed. Leads with clarity; follows through with precision.`,
    wordmarkWeight: '700', wordmarkCase: 'upper',
  },
  sophistication: {
    label: 'Sophisticated',
    emoji: '✦',
    desc: 'Elegant · Glamorous · Charming',
    traits: ['elegant','luxurious','sophisticated','considered','refined'],
    satMod: -12, warmMod: -5,
    preferredFonts: ['editorial','dmserif','artisan','fraunces'],
    formality: 15, enthusiasm: 28,
    examples: 'Chanel · The Economist · Hermès',
    archIntro: (n) => `${n} speaks in understated tones. Prestige is expressed through restraint, not volume. Every word carefully chosen; the silences matter as much as what's said.`,
    wordmarkWeight: '400', wordmarkCase: 'title',
  },
  ruggedness: {
    label: 'Rugged',
    emoji: '🏔',
    desc: 'Outdoorsy · Tough · Durable',
    traits: ['bold','grounded','direct','honest','candid'],
    satMod: -6, warmMod: +10,
    preferredFonts: ['bold','bebas','archivo','geometric'],
    formality: 55, enthusiasm: 55,
    examples: 'Carhartt · Jeep · Filson',
    archIntro: (n) => `${n} is no-nonsense and built to last. Speaks plainly and honestly about what it is and what it does. Values durability and authenticity over polish or performance.`,
    wordmarkWeight: '700', wordmarkCase: 'upper',
  },
};

/* ─────────────────────────────────────────────────────────────
   5. INDUSTRY BASE HUES + CONTENT STRATEGY DATA
   ───────────────────────────────────────────────────────────── */

const INDUSTRY_BASE_HUES = {
  'technology': 210, 'food-beverage': 28, 'health-wellness': 145,
  'fashion-beauty': 310, 'finance': 205, 'education': 220,
  'arts-entertainment': 270, 'real-estate': 20, 'travel-hospitality': 175,
  'nonprofit': 150, 'retail': 0, 'professional-services': 225,
};

const INDUSTRY_CONTENT = {
  'technology': {
    pillars: [
      { name: 'Product Education',    emoji: '📚', goal: 'Activation & Retention',    desc: 'How-to guides, feature explainers, and tutorials that help users unlock more value.' },
      { name: 'Industry Insights',    emoji: '🔭', goal: 'Brand Authority',            desc: 'Trend analysis, research, and thought leadership that builds credibility.' },
      { name: 'Behind the Build',     emoji: '⚙️', goal: 'Talent & Culture',           desc: 'Engineering culture, product decisions, and team spotlights that humanise your brand.' },
      { name: 'Customer Stories',     emoji: '⭐', goal: 'Trust & Conversion',         desc: 'Case studies and testimonials showing real, quantified outcomes.' },
      { name: 'Community & Ecosystem',emoji: '🌐', goal: 'Ecosystem Growth',           desc: 'User communities, integrations, and partnerships that expand reach.' },
    ],
    channels: [
      { name: 'LinkedIn',          fit: 'primary',   freq: '3–4×/week',    rationale: 'B2B decision-makers, thought leadership, hiring announcements.',           formats: ['Articles','Product announcements','Team spotlights','Data insights'] },
      { name: 'X (Twitter)',       fit: 'primary',   freq: 'Daily',        rationale: 'Real-time tech conversations, developer community, news commentary.',        formats: ['Threads','Product tips','Commentary','Behind-the-scenes'] },
      { name: 'YouTube',           fit: 'secondary', freq: '1–2×/week',    rationale: 'Tutorial and demo content drives high-intent discovery.',                    formats: ['Product demos','How-to tutorials','Webinar recordings'] },
      { name: 'Blog / Newsletter', fit: 'primary',   freq: '1–2×/week',    rationale: 'SEO anchor and depth content that establishes expertise.',                   formats: ['Deep dives','Case studies','Research reports','Engineering posts'] },
    ],
    toneGuidance: 'Lead with specificity, not hype. Developers and tech buyers distrust marketing superlatives — concrete examples, honest limitations, and specific numbers build more trust than hyperbolic claims.',
    postingTips: ['Use data to open posts — numbers stop the scroll','Ask one clear question at end of posts to drive discussion','Screenshots and demos outperform stock photos','Ship a "what we learned" post after every major launch'],
  },
  'food-beverage': {
    pillars: [
      { name: 'Recipes & Food Ideas',  emoji: '🍽️', goal: 'Inspiration & Shareability', desc: 'Original recipes, meal ideas, and creative uses of your products or menu.' },
      { name: 'Behind the Kitchen',    emoji: '👨‍🍳', goal: 'Authenticity & Trust',       desc: 'Prep process, kitchen team stories, and the craft behind what you serve.' },
      { name: 'Sourcing & Values',     emoji: '🌿', goal: 'Brand Differentiation',       desc: 'Where ingredients come from, producer relationships, and food ethics.' },
      { name: 'Community & Events',    emoji: '🗓️', goal: 'Community Loyalty',           desc: 'Local collaborations, special events, seasonal celebrations, and regulars.' },
      { name: 'Seasonal Specials',     emoji: '🍂', goal: 'Urgency & Engagement',        desc: 'Limited-time offerings, seasonal ingredients, and what\'s fresh right now.' },
    ],
    channels: [
      { name: 'Instagram',         fit: 'primary',   freq: '4–5×/week',   rationale: 'Food is inherently visual — Instagram is the primary discovery channel.',    formats: ['Food photography','Reels of prep','Stories for daily specials','Recipe carousels'] },
      { name: 'TikTok',            fit: 'secondary', freq: '3–4×/week',   rationale: 'Recipe and food prep videos drive massive organic reach for new audiences.', formats: ['Recipe videos','Kitchen day-in-life','Satisfying prep clips'] },
      { name: 'Email Newsletter',  fit: 'primary',   freq: 'Weekly',      rationale: 'High-loyalty audience for weekly menus, events, and pre-orders.',            formats: ['Weekly menu','Recipe of the week','Events','Seasonal announcements'] },
      { name: 'Google Business',   fit: 'primary',   freq: 'Ongoing',     rationale: 'Reviews and photos directly drive foot traffic and local discovery.',         formats: ['Menu updates','Event posts','Photo updates','Review responses'] },
    ],
    toneGuidance: 'Food is sensory — write to evoke smell, texture, and taste. Use specific, honest words ("charred", "hand-rolled", "slow-cooked") over vague claims. Let the food speak through imagery; copy supports, not competes.',
    postingTips: ['Post food content at meal times — not 2pm on a Tuesday','Behind-the-scenes consistently outperforms polished food shoots on engagement','Tag local suppliers — they\'ll reshare and their audience will trust you','Seasonal limited items create natural urgency — announce early, post countdowns'],
  },
  'health-wellness': {
    pillars: [
      { name: 'Educational Health Tips', emoji: '💡', goal: 'Authority & Trust',      desc: 'Evidence-based wellness info, myth-busting, and practical health advice.' },
      { name: 'Product Usage & Benefits',emoji: '✨', goal: 'Conversion',              desc: 'How your products or services support specific health goals with real outcomes.' },
      { name: 'Community Stories',       emoji: '💬', goal: 'Social Proof',            desc: 'Real customer journeys and milestones (with permission).' },
      { name: 'Lifestyle Inspiration',   emoji: '🌅', goal: 'Brand Aspiration',        desc: 'Aspirational but achievable content: routines, spaces, habits, and mindset.' },
      { name: 'Science & Research',      emoji: '🔬', goal: 'Credibility',             desc: 'Accessible breakdowns of relevant studies, ingredients, or methods.' },
    ],
    channels: [
      { name: 'Instagram',      fit: 'primary',   freq: '4–5×/week',  rationale: 'Wellness lifestyle content performs exceptionally with visual storytelling.',     formats: ['Routine carousels','Educational infographics','Transformation stories'] },
      { name: 'YouTube',        fit: 'secondary', freq: '1×/week',    rationale: 'Long-form content builds deep trust and expertise positioning.',                  formats: ['Expert interviews','Routine walkthroughs','Q&A sessions'] },
      { name: 'Email',          fit: 'primary',   freq: 'Weekly',     rationale: 'Wellness audience is high-loyalty; email delivers tips and drives product use.',  formats: ['Weekly wellness tip','Community spotlight','Product education'] },
      { name: 'Pinterest',      fit: 'secondary', freq: '3–5×/week',  rationale: 'High search intent for wellness; long content lifespan.',                        formats: ['Infographics','Recipe pins','Routine guides','Product collections'] },
    ],
    toneGuidance: 'Centre the person, not the transformation. Focus on feeling and capability — not appearance or comparison. Avoid before/after framing. Use inclusive, empowering language that meets people where they are.',
    postingTips: ['Cite specific sources for health claims — "studies show" is not enough','Morning posts (6–8am) outperform evening for wellness content','FAQ-style posts drive higher saves than inspirational quotes','UGC (with permission) converts 3× better than brand-created content'],
  },
  'fashion-beauty': {
    pillars: [
      { name: 'Style Inspiration',       emoji: '✨', goal: 'Brand Aspiration',           desc: 'Curated looks, outfit ideas, and editorial styling that define your aesthetic.' },
      { name: 'Product Spotlights',      emoji: '💎', goal: 'Conversion',                 desc: 'Deep-dives into individual products: ingredients, craftsmanship, how to use.' },
      { name: 'Brand Story & Values',    emoji: '📖', goal: 'Differentiation & Loyalty',  desc: 'The philosophy, people, and principles behind your brand.' },
      { name: 'User-Generated Content',  emoji: '📸', goal: 'Trust & Community',          desc: 'Real customers wearing and using your products — authentic social proof.' },
      { name: 'Trends & Editorial',      emoji: '🔮', goal: 'Relevance',                  desc: 'How your brand relates to — or deliberately departs from — current trends.' },
    ],
    channels: [
      { name: 'Instagram',  fit: 'primary',   freq: 'Daily',       rationale: 'The definitive platform for fashion and beauty — visual-first discovery and conversion.', formats: ['Editorial photography','Reels styling videos','Stories polls','Collab posts'] },
      { name: 'TikTok',     fit: 'primary',   freq: '4–5×/week',   rationale: 'GRWM and try-on content reaches new audiences at scale.',                              formats: ['Try-on hauls','GRWM','Before/after styling','Trend reactions'] },
      { name: 'Pinterest',  fit: 'secondary', freq: '5–7×/week',   rationale: 'Purchase-intent platform with long content lifespan for style inspiration.',            formats: ['Outfit boards','Seasonal lookbooks','Product collections','Style guides'] },
      { name: 'Email',      fit: 'secondary', freq: 'Weekly',      rationale: 'High-value for launches, exclusives, and loyalty programme communication.',             formats: ['New arrivals','Styling tips','Exclusive access','Sale announcements'] },
    ],
    toneGuidance: 'Speak to who your customer wants to be, not who they fear they are. Fashion copy should feel like a stylish friend — specific, assured, never gatekeeping. Inclusive language and diverse representation is the baseline, not optional.',
    postingTips: ['Shoot products on people, not tables','Consistency of aesthetic matters more than frequency','Tag products in every post with purchase links','Seasonal drops create urgency — use scarcity messaging sparingly'],
  },
  'finance': {
    pillars: [
      { name: 'Financial Education', emoji: '📊', goal: 'Trust & Authority',      desc: 'Plain-language explanations of financial concepts, tools, and decisions.' },
      { name: 'Product Guidance',    emoji: '🎯', goal: 'Conversion',              desc: 'How your specific products or services solve real financial problems.' },
      { name: 'Market Insights',     emoji: '🔭', goal: 'Thought Leadership',      desc: 'Commentary on financial news, market trends, and economic context.' },
      { name: 'Customer Milestones', emoji: '🏆', goal: 'Social Proof',            desc: 'Real stories of customers achieving financial goals (with permission).' },
      { name: 'Tools & Resources',   emoji: '🔧', goal: 'Engagement & Utility',    desc: 'Interactive resources that help people make better financial decisions.' },
    ],
    channels: [
      { name: 'LinkedIn',          fit: 'primary',   freq: '3–4×/week', rationale: 'Professional audience expects financial content here; strong for B2B.',    formats: ['Market commentary','Industry insights','Team expertise','Thought leadership'] },
      { name: 'Email',             fit: 'primary',   freq: 'Weekly',    rationale: 'Finance audience values depth and privacy; email is the highest-trust channel.', formats: ['Market briefings','Financial tips','Product updates','Deep-dives'] },
      { name: 'YouTube',           fit: 'secondary', freq: '1–2×/week', rationale: 'Long-form financial explainers rank well and build trust over time.',          formats: ['Explainer videos','Product walkthroughs','Q&A sessions'] },
      { name: 'X (Twitter)',       fit: 'secondary', freq: 'Daily',     rationale: 'Finance Twitter is active and influential for market commentary.',             formats: ['Market reactions','Quick tips','Commentary threads','Data visuals'] },
    ],
    toneGuidance: 'Clarity over cleverness. Finance is already intimidating — every piece of content should reduce complexity, not add to it. Avoid jargon unless you define it immediately. Write like you\'re explaining to a smart friend, not filing a regulatory document.',
    postingTips: ['Add compliance disclosures where required — write them in plain language','Data visualisations outperform text-only posts','Avoid predictions — frame as "things to consider"','Educational content builds more trust than promotional content'],
  },
  'education': {
    pillars: [
      { name: 'Learning Content',      emoji: '📚', goal: 'Authority & Trust',        desc: 'Actual valuable instruction — not just promotion, but genuine knowledge delivery.' },
      { name: 'Student Success',        emoji: '🎓', goal: 'Social Proof',             desc: 'Outcomes, achievements, and journeys of real learners.' },
      { name: 'Educator Spotlights',    emoji: '👩‍🏫', goal: 'Differentiation',          desc: 'The humans behind your curriculum — expertise and personality.' },
      { name: 'Industry Relevance',     emoji: '🌍', goal: 'Enrollment Motivation',    desc: 'How your education connects to real-world skills and job market demands.' },
      { name: 'Community & Belonging',  emoji: '🤝', goal: 'Retention & Referral',     desc: 'Peer connections, alumni community, and learning together.' },
    ],
    channels: [
      { name: 'YouTube',   fit: 'primary',   freq: '2–3×/week',  rationale: 'Educational video content is the top discovery channel for learning.',    formats: ['Lesson samples','Student stories','Course previews','Expert interviews'] },
      { name: 'LinkedIn',  fit: 'primary',   freq: '3–4×/week',  rationale: 'Professional development angle resonates; strong for adult learners.',    formats: ['Career outcomes','Skills insights','Course spotlights','Industry trends'] },
      { name: 'Email',     fit: 'primary',   freq: 'Weekly',     rationale: 'Enrollment funnel depends heavily on email nurturing and reminders.',     formats: ['Free resources','Course launches','Learner spotlights','Drip campaigns'] },
      { name: 'Instagram', fit: 'secondary', freq: '3–4×/week',  rationale: 'Works for younger learners and visual learning content.',                  formats: ['Quick lessons','Student milestones','Course previews','Inspiration'] },
    ],
    toneGuidance: 'Inspire without condescending. Education content should make learners feel capable, not behind. Start with where they are, not where they should be. Acknowledge that learning is genuinely hard — and worth it.',
    postingTips: ['Give something genuinely valuable for free in every post','Proof of outcomes converts far better than feature lists','Behind-the-scenes of curriculum creation builds confidence in quality','Graduation milestones with student permission are your highest-performing content'],
  },
  'arts-entertainment': {
    pillars: [
      { name: 'Creative Process',       emoji: '🎨', goal: 'Authenticity & Connection', desc: 'Behind-the-scenes of how work is made — the mess, decisions, and iterations.' },
      { name: 'New Work & Releases',    emoji: '🚀', goal: 'Direct Conversion',         desc: 'Launches, premieres, exhibitions, and new projects with context and story.' },
      { name: 'Influences & Inspiration',emoji: '💡', goal: 'Brand Identity',            desc: 'What you\'re consuming, loving, and drawing from — creates cultural context.' },
      { name: 'Community & Collaboration',emoji: '🤝',goal: 'Network & Discovery',      desc: 'Other creators you work with, admire, or are in conversation with.' },
      { name: 'Audience & Fan Stories', emoji: '❤️', goal: 'Social Proof & Loyalty',    desc: 'How your work lands with real audiences — reactions, fan art, testimonials.' },
    ],
    channels: [
      { name: 'Instagram',          fit: 'primary',   freq: '4–5×/week',  rationale: 'Visual art and performance have a natural home here.',                      formats: ['Work previews','Process videos','Event announcements','Collabs'] },
      { name: 'TikTok',             fit: 'primary',   freq: '3–5×/week',  rationale: 'Creative process content drives massive organic discovery.',                 formats: ['Studio day-in-life','Time-lapses','Behind creation','Trend participation'] },
      { name: 'Newsletter',         fit: 'secondary', freq: 'Bi-weekly',  rationale: 'Deep audience relationships built through long-form, intimate writing.',     formats: ['Creative essays','Work previews','Industry commentary','Personal updates'] },
      { name: 'YouTube',            fit: 'secondary', freq: '1×/week',    rationale: 'Documentary-style process content builds cult following over time.',         formats: ['Studio tours','Project retrospectives','Long-form interviews'] },
    ],
    toneGuidance: 'Authenticity is your brand moat. Over-polished content is the death of creative brands. Lead with point of view — opinions, failures, unfinished work. Audiences follow creative people because they want access, not perfection.',
    postingTips: ['In-progress content outperforms finished-product content 2–3× in engagement','Name-drop your influences generously — context builds audience','Event links belong in bio AND stories, not buried in captions','Post announcements with visuals, not text — people process image first'],
  },
  'real-estate': {
    pillars: [
      { name: 'Property Showcases',  emoji: '🏠', goal: 'Lead Generation',      desc: 'Listings presented with context: neighbourhood, lifestyle, unique features.' },
      { name: 'Market Education',    emoji: '📈', goal: 'Trust & Authority',     desc: 'Local market data, buying/selling guides, and process explainers.' },
      { name: 'Neighbourhood Stories',emoji: '🗺️', goal: 'Lifestyle Aspiration', desc: 'Restaurants, culture, walkability, and what life actually feels like in each area.' },
      { name: 'Agent & Team Stories', emoji: '👋', goal: 'Relationship Building', desc: 'Who you are, your expertise, and why clients trust you with major life decisions.' },
      { name: 'Client Milestones',   emoji: '🔑', goal: 'Social Proof',          desc: 'Closings, first homes, investment success — real stories with real impact.' },
    ],
    channels: [
      { name: 'Instagram',  fit: 'primary',   freq: '4–5×/week',  rationale: 'Real estate is aspirational and visual — Instagram drives serious leads.',          formats: ['Property tours','Neighbourhood Reels','Market infographics'] },
      { name: 'YouTube',    fit: 'primary',   freq: '2–3×/week',  rationale: 'Property tours and neighbourhood guides rank in search and build deep trust.',       formats: ['Full property walkthroughs','Neighbourhood guides','Buyer tips'] },
      { name: 'Email',      fit: 'primary',   freq: 'Weekly',     rationale: 'High-touch decisions require high-touch follow-up over months.',                     formats: ['New listings','Market reports','Sold highlights','Local events'] },
      { name: 'LinkedIn',   fit: 'secondary', freq: '2–3×/week',  rationale: 'Commercial real estate and relocation clients discover agents here.',               formats: ['Market data','Investment insights','Relocation guides'] },
    ],
    toneGuidance: 'This is the biggest purchase of most people\'s lives — treat it with appropriate gravity. Avoid manufactured urgency. Be genuinely helpful about process, honest about market conditions, and a trusted guide rather than a pushy seller.',
    postingTips: ['Drone footage and 3D walkthroughs generate 3× more qualified leads','Post market reports even when the market is slow — honesty builds trust','Name the neighbourhood in the first line for searchability','Sold announcements (respecting client privacy) are your most-reshared content'],
  },
  'travel-hospitality': {
    pillars: [
      { name: 'Destination Inspiration', emoji: '✈️', goal: 'Brand Aspiration & Discovery', desc: 'Stunning visuals and storytelling that make audiences want to be there.' },
      { name: 'Insider Guides',          emoji: '🗺️', goal: 'Authority & Bookings',         desc: 'What locals know that tourists don\'t — genuine expertise that builds trust.' },
      { name: 'Experience Stories',      emoji: '📸', goal: 'Social Proof',                  desc: 'Real guest stories, staff favourites, and moments that capture your essence.' },
      { name: 'Seasonal & Timely',       emoji: '🗓️', goal: 'Timely Conversions',            desc: 'When to visit, what\'s special now, events, and seasonal highlights.' },
      { name: 'Sustainability & Culture',emoji: '🌿', goal: 'Brand Values',                  desc: 'How you engage responsibly with the places and people you serve.' },
    ],
    channels: [
      { name: 'Instagram',  fit: 'primary',   freq: 'Daily',        rationale: 'Travel is the top category on Instagram — visual storytelling drives bookings.', formats: ['Destination photography','Guest stories','Experience Reels','Stories polls'] },
      { name: 'TikTok',     fit: 'primary',   freq: '4–5×/week',   rationale: 'Travel content goes viral here; short video reaches entirely new audiences.',    formats: ['Destination reveals','Day-in-life','Hidden gem spots','Seasonal highlights'] },
      { name: 'Pinterest',  fit: 'primary',   freq: '5–7×/week',   rationale: 'People plan trips on Pinterest months in advance — high intent, long lifespan.',  formats: ['Destination boards','Packing guides','Itineraries','Accommodation inspiration'] },
      { name: 'Email',      fit: 'secondary', freq: 'Bi-weekly',   rationale: 'Loyalty and repeat bookers respond very well to personalised email.',             formats: ['Special offers','Seasonal inspiration','Insider tips','Loyalty perks'] },
    ],
    toneGuidance: 'Don\'t just describe places — make people feel them. Travel copy should be sensory and specific: the smell of the morning market, the sound of waves at 6am. Generic "breathtaking views" is everywhere; specific details make your brand memorable.',
    postingTips: ['User-generated content from guests builds more trust than professional shoots','Post travel inspiration 2–3 months ahead — people plan in advance','Behind-the-scenes of your team builds loyalty beyond transactions','Collaborate with local businesses for cross-promotion'],
  },
  'nonprofit': {
    pillars: [
      { name: 'Mission & Impact',           emoji: '🎯', goal: 'Donor Trust & Retention', desc: 'Concrete stories and data showing what your work actually accomplishes.' },
      { name: 'Beneficiary Stories',        emoji: '💬', goal: 'Emotional Connection',    desc: 'Humanising stories (with consent) from the people your work serves.' },
      { name: 'Volunteer & Community',      emoji: '🤝', goal: 'Community Building',      desc: 'People power — volunteers, partners, and community members who make it happen.' },
      { name: 'Calls to Action',            emoji: '📣', goal: 'Conversion',               desc: 'Specific ways to help: donate, volunteer, advocate, share.' },
      { name: 'Transparency & Accountability',emoji: '📊',goal: 'Institutional Trust',    desc: 'How funds are used, what\'s working, what\'s hard — honest reporting builds trust.' },
    ],
    channels: [
      { name: 'Instagram',  fit: 'primary',   freq: '4–5×/week',  rationale: 'Story-driven visual content connects emotionally with donors and volunteers.',    formats: ['Impact photography','Beneficiary stories','Volunteer spotlights','Campaigns'] },
      { name: 'Email',      fit: 'primary',   freq: 'Monthly',    rationale: 'Primary fundraising channel — highest ROI for nonprofits.',                        formats: ['Impact reports','Campaign updates','Donor thank-yous','Fundraising appeals'] },
      { name: 'LinkedIn',   fit: 'secondary', freq: '3×/week',    rationale: 'Corporate partners, grant-makers, and professional volunteers are here.',          formats: ['Partnership announcements','Impact data','Volunteer recruitment'] },
      { name: 'Facebook',   fit: 'secondary', freq: '3–4×/week',  rationale: 'Older donor demographic is highly active; events and groups work well.',           formats: ['Event promotion','Community stories','Fundraising drives'] },
    ],
    toneGuidance: 'Lead with hope, not guilt. Show what\'s possible when people come together — not how dire things are. Avoid poverty porn and saviour narratives; centre the agency and dignity of the people you serve.',
    postingTips: ['Specific impact numbers convert better than vague claims ("fed 847 families last month")','Volunteer spotlights generate organic reach as volunteers reshare','Month-end giving urgency works — but use it sparingly or it loses meaning','Thank donors publicly (with permission) — appreciation posts increase retention'],
  },
  'retail': {
    pillars: [
      { name: 'Product Discovery',   emoji: '🛍️', goal: 'Conversion',           desc: 'New arrivals, collections, and curated selections that make buying feel like exploring.' },
      { name: 'Styling & Use Cases', emoji: '✨', goal: 'Purchase Confidence',   desc: 'How to use, wear, or incorporate your products into real life.' },
      { name: 'Behind the Brand',    emoji: '🏭', goal: 'Differentiation',       desc: 'How products are made, who makes them, and what makes yours different.' },
      { name: 'Customer Love',       emoji: '❤️', goal: 'Social Proof',          desc: 'Reviews, UGC, and real customers using real products.' },
      { name: 'Promotions & Events', emoji: '🎉', goal: 'Urgency & Revenue',     desc: 'Sales, launches, collabs, and time-sensitive offers — used strategically.' },
    ],
    channels: [
      { name: 'Instagram',  fit: 'primary',   freq: 'Daily',        rationale: 'Top discovery channel for retail — shoppable posts create direct path to purchase.', formats: ['Product photography','Reels styling','Stories launches','Collab content'] },
      { name: 'TikTok',     fit: 'primary',   freq: '4–5×/week',   rationale: '#TikTokMadeMeBuyIt is real — virality potential is highest here for retail.',        formats: ['Unboxing/hauls','GRWM with products','Product demos','Trend participation'] },
      { name: 'Email',      fit: 'primary',   freq: '2×/week',     rationale: 'Highest conversion rate for retail after social discovery.',                          formats: ['New arrivals','Promotions','Cart abandonment','Loyalty rewards'] },
      { name: 'Pinterest',  fit: 'secondary', freq: '5–7×/week',   rationale: 'Purchase intent is highest on Pinterest; great for home, fashion, gifts.',            formats: ['Product collections','Gift guides','Seasonal boards','Style inspiration'] },
    ],
    toneGuidance: 'Every touchpoint is a sales touchpoint — but great retail brands make it feel like inspiration, not selling. Create content that makes people want to live in your world, not just buy your products. The purchase follows the aspiration.',
    postingTips: ['Tag products in every post and link bio to shoppable landing page','Limited-time urgency works — but don\'t overuse or it loses power','UGC reposted with credit consistently outperforms branded content','Gift guides around major holidays are evergreen — build them months in advance'],
  },
  'professional-services': {
    pillars: [
      { name: 'Expertise & Insights',    emoji: '🧠', goal: 'Authority & Differentiation',  desc: 'Deep-dive thinking on problems your clients face — not surface tips.' },
      { name: 'Process & Methodology',   emoji: '⚙️', goal: 'Purchase Confidence',          desc: 'How you work, what makes your approach unique, and why it delivers results.' },
      { name: 'Client Outcomes',         emoji: '📈', goal: 'Social Proof & Conversion',    desc: 'Case studies and results with specific, quantified impact (with permission).' },
      { name: 'Team & Culture',          emoji: '👥', goal: 'Talent & Trust',               desc: 'The people, values, and working style that define your firm.' },
      { name: 'Industry Commentary',     emoji: '🔭', goal: 'Relevance & Thought Leadership', desc: 'Your take on industry news, shifts, and what they mean for clients.' },
    ],
    channels: [
      { name: 'LinkedIn',         fit: 'primary',   freq: '4–5×/week',  rationale: 'Professional services live and die on LinkedIn — it\'s where clients are.',  formats: ['Expert posts','Case study snippets','Team spotlights','Industry commentary'] },
      { name: 'Email Newsletter', fit: 'primary',   freq: 'Monthly',    rationale: 'High-trust, direct relationship with decision-makers who opt in.',            formats: ['Insight reports','Industry roundup','New thinking','Speaking invitations'] },
      { name: 'Podcast / Webinar',fit: 'secondary', freq: 'Monthly',    rationale: 'Long-form formats build deep expertise positioning and relationship depth.',  formats: ['Client interview series','Panel discussions','Quarterly market outlook'] },
      { name: 'Blog',             fit: 'primary',   freq: '1–2×/week',  rationale: 'SEO and credibility anchor — long-form writing is the primary trust builder.',formats: ['Deep analysis','Framework introductions','Research summaries'] },
    ],
    toneGuidance: 'Demonstrate expertise, don\'t claim it. Every piece of content should show your thinking in action — not just assert you\'re the best. Write for the actual decision-maker: what specific problem do they have, and what do they need to think differently?',
    postingTips: ['The most credible posts share something specific you\'ve learned — not generic advice','Reference real client situations (anonymised) rather than hypotheticals','Your team\'s individual LinkedIn profiles matter as much as the company page','Insights from client work (anonymised, consented) are your highest-value content type'],
  },
};

/* ─────────────────────────────────────────────────────────────
   5. RANDOMIZER DATA
   ───────────────────────────────────────────────────────────── */

const RAND = {
  adj: ['Velvet','Arc','Mossy','Prism','Ember','Drift','Cedar','Loom','Sage','Indigo',
        'Echo','Quill','Flint','Birch','Copper','Slate','Wren','Fable','Dune','Frost',
        'Glow','Kestrel','Linden','Nimbus','Ochre','Relic','Tide','Verdant','Auric',
        'Solace','Briar','Marlowe','Crest','Heron','Lark','Maren','Orin','Rova'],
  noun: ['Lane','Studio','Root','Collective','Co.','Lab','Works','House','Press',
         'Society','Space','Workshop','Assembly','Commons','Exchange','Guild',
         'Hub','Journal','Lodge','Market','Table','Union','Vault','Quarter','Co'],
  byIndustry: {
    'technology':            { desc: 'A developer-first platform that makes {WHAT} faster and more reliable', what: 'infrastructure automation', audience: 'Engineering teams and CTOs at growth-stage startups', tone: 'clear, direct, trustworthy, precise' },
    'food-beverage':         { desc: 'An artisan {WHAT} brand rooted in quality ingredients and honest craftsmanship', what: 'small-batch food', audience: 'Curious eaters aged 28–45 who care where their food comes from', tone: 'warm, honest, approachable, crafted' },
    'health-wellness':       { desc: 'A wellness brand helping {WHO} build sustainable, joyful health habits', what: 'holistic wellbeing products', audience: 'Health-conscious individuals aged 25–40 looking for balance, not perfection', tone: 'calm, encouraging, evidence-based, inclusive' },
    'fashion-beauty':        { desc: 'A contemporary {WHAT} label built on considered design and responsible sourcing', what: 'fashion', audience: 'Style-conscious individuals aged 22–38 who value quality and authenticity', tone: 'confident, considered, inclusive, elevated' },
    'finance':               { desc: 'A fintech company making {WHAT} genuinely accessible for everyday people', what: 'investing and financial planning', audience: 'Financially motivated adults aged 25–45 who feel underserved by traditional banks', tone: 'trustworthy, clear, empowering, straightforward' },
    'education':             { desc: 'An education platform that helps {WHO} gain real-world skills in {WHAT}', what: 'creative and technical disciplines', audience: 'Ambitious learners aged 18–35 looking to change careers or level up', tone: 'inspiring, practical, supportive, honest' },
    'arts-entertainment':    { desc: 'An independent {WHAT} studio with a distinct visual voice and strong values', what: 'creative production', audience: 'Culture-savvy audiences aged 20–40 who support independent creators', tone: 'authentic, expressive, bold, unconventional' },
    'real-estate':           { desc: 'A boutique real estate agency specialising in {WHAT} with a community-first approach', what: 'residential and lifestyle properties', audience: 'First-time buyers and upsizers aged 28–50 who want a trustworthy guide', tone: 'trustworthy, knowledgeable, warm, straightforward' },
    'travel-hospitality':    { desc: 'A curated travel brand connecting curious travellers with {WHAT} experiences', what: 'off-the-beaten-path', audience: 'Independent travellers aged 28–45 who prioritise depth over checklists', tone: 'evocative, genuine, adventurous, considered' },
    'nonprofit':             { desc: 'A nonprofit organisation working to {WHAT} through community-driven programmes', what: 'increase access to opportunity', audience: 'Socially conscious donors and volunteers aged 25–55', tone: 'hopeful, honest, grounded, urgent' },
    'retail':                { desc: 'A direct-to-consumer {WHAT} brand with a strong aesthetic identity and loyal community', what: 'lifestyle products', audience: 'Trend-aware shoppers aged 22–38 who buy intentionally', tone: 'vibrant, genuine, community-focused, quality-driven' },
    'professional-services': { desc: 'A boutique {WHAT} consultancy that combines strategic rigour with hands-on delivery', what: 'brand and communications', audience: 'Founders and marketing leaders at mid-size companies', tone: 'expert, candid, collaborative, results-focused' },
  },
  avoid: {
    'technology': 'buzzword-heavy copy, vague value props, stock photos of laptops',
    'food-beverage': 'clinical language, vague "artisan" claims without substance, diet culture',
    'health-wellness': 'before/after framing, diet culture language, unsupported health claims',
    'fashion-beauty': 'exclusionary sizing language, fast-fashion aesthetic, superficiality',
    'finance': 'financial jargon without explanation, fear-based messaging, small print',
    'education': '"anyone can do it" minimising language, credential inflation, vague outcomes',
    'arts-entertainment': 'over-produced corporate aesthetic, insincere collaborations',
    'real-estate': 'manufactured scarcity urgency, vague neighbourhood descriptions',
    'travel-hospitality': 'generic "paradise" language, irresponsible tourism promotion',
    'nonprofit': 'poverty porn, saviour narratives, guilt-based fundraising',
    'retail': 'fake scarcity, misleading discount framing, returns deterrence',
    'professional-services': 'jargon-heavy thought leadership, vague case studies, credential-stuffing',
  },
};

/* ─────────────────────────────────────────────────────────────
   6. DEMO DATA
   ───────────────────────────────────────────────────────────── */

const DEMO = {
  brandName:   'Verdant Kitchen',
  industry:    'food-beverage',
  description: 'A plant-based restaurant celebrating seasonal, local ingredients',
  whatDoes:    'We serve a seasonally rotating plant-based menu in a welcoming café environment, sourcing directly from local farms within 50 miles. Everything is made from scratch — no shortcuts.',
  audience:    'Health-conscious urban professionals, ages 25–45',
  tone:        'warm, honest, approachable, fresh',
  avoid:       'clinical language, diet culture messaging, corporate jargon',
  photos:      ['demo/photos/photo1.png', 'demo/photos/photo2.png', 'demo/photos/photo3.png'],
  archetype:   'sincerity',
  formality:   38,
  enthusiasm:  58,
};

/* ─────────────────────────────────────────────────────────────
   7. PALETTE GENERATION
   ───────────────────────────────────────────────────────────── */

function buildPaletteFromExtracted(extractedColors, brandData) {
  const { toneWords = [], industry = 'technology' } = brandData;
  const toneStr = toneWords.join(' ').toLowerCase();

  // Sort extracted colors by saturation (most saturated first)
  const ranked = extractedColors
    .map(hex => ({ hex, ...hexToHsl(hex) }))
    .sort((a, b) => b.s - a.s);

  let primary   = ranked[0]?.hex;
  let secondary = ranked[1]?.hex;
  let accent    = ranked[2]?.hex;

  if (!primary) return generatePaletteFromIndustry(industry, toneWords);

  // Ensure primary is rich enough — boost saturation if pale
  const pHsl = hexToHsl(primary);
  if (pHsl.s < 30) primary = hslToHex(pHsl.h, 55, Math.min(pHsl.l, 50));
  if (!secondary) { secondary = Math.random() > 0.5 ? lighten(primary, 16) : darken(primary, 10); }
  const splitC = splitComplementary(primary);
  if (!accent) { accent = pick([complementary(primary), splitC[0], splitC[1]]); }
  // Ensure accent is vibrant enough to function
  const aHsl = hexToHsl(accent);
  accent = hslToHex(aHsl.h, Math.max(aHsl.s, 58), Math.min(Math.max(aHsl.l, 32), 58));

  return assemblePalette(primary, secondary, accent, brandData);
}

function generatePaletteFromIndustry(industry, toneWords, guidance = '', archetypeId = '') {
  const toneStr = (toneWords.join(' ') + ' ' + guidance).toLowerCase();
  let baseH = INDUSTRY_BASE_HUES[industry] ?? 210;
  let sat   = 62, lit = 44;

  // Archetype saturation + warmth modifiers
  const arch = ARCHETYPES[archetypeId];
  if (arch) {
    sat   = Math.max(10, Math.min(95, sat + (arch.satMod || 0)));
    baseH = ((baseH + (arch.warmMod || 0)) + 360) % 360;
  }

  // Keyword-driven hue overrides
  const hueMap = {
    warm: +15, earthy: +20, amber: 38, coral: 10, terracotta: 14, red: 0,
    green: 140, sage: 130, forest: 135, teal: 174, turquoise: 170,
    blue: 210, navy: 225, midnight: 230, purple: 270, lavender: 270, violet: 270,
    gold: 48, yellow: 55, pink: 340, rose: 345, blush: 348,
    cool: -15,
  };
  for (const [kw, val] of Object.entries(hueMap)) {
    if (toneStr.includes(kw)) {
      baseH = typeof val === 'number' && Math.abs(val) < 50 ? (baseH + val + 360) % 360 : val;
    }
  }

  // Saturation / lightness modifiers
  if (toneStr.match(/vibrant|bold|saturated|vivid|pop/))      sat = Math.min(90, sat + 20);
  if (toneStr.match(/muted|subtle|desaturated|quiet/))         sat = Math.max(20, sat - 22);
  if (toneStr.match(/pastel|soft|gentle/))                    { sat = 42; lit = Math.max(lit, 65); }
  if (toneStr.match(/dark|deep|moody|dramatic/))               lit = Math.max(22, lit - 14);
  if (toneStr.match(/light|airy|minimal|clean/))               lit = Math.min(70, lit + 14);
  if (toneStr.match(/luxur|elegant|premium/))                 { sat = Math.min(70, sat); lit = Math.max(28, lit - 8); }

  // Random micro-jitter keeps each generation visually fresh within the same range
  const jitter = () => (Math.random() - 0.5) * 10;
  const rSat = Math.max(10, Math.min(95, sat + jitter()));
  const rLit = Math.max(18, Math.min(72, lit + jitter()));

  const primary = hslToHex(baseH, rSat, rLit);

  // Randomly pick colour relationship scheme for secondary + accent
  const scheme = pick(['complementary','split-a','split-b','triadic-a','triadic-b','analogous']);
  let secH, accH;
  switch (scheme) {
    case 'split-a':   secH = (baseH + 22)  % 360; accH = (baseH + 150) % 360; break;
    case 'split-b':   secH = (baseH + 18)  % 360; accH = (baseH + 210) % 360; break;
    case 'triadic-a': secH = (baseH + 30)  % 360; accH = (baseH + 120) % 360; break;
    case 'triadic-b': secH = (baseH + 20)  % 360; accH = (baseH + 240) % 360; break;
    case 'analogous': secH = (baseH + 35)  % 360; accH = (baseH + 55)  % 360; break;
    default:          secH = (baseH + 28)  % 360; accH = (baseH + 180) % 360; break;
  }

  const secondary = hslToHex(secH, Math.max(10, rSat - 14), Math.min(82, rLit + 12));
  const accent    = hslToHex(accH, Math.min(95, rSat + 8),  Math.max(28, Math.min(58, rLit)));

  return assemblePalette(primary, secondary, accent, { toneWords, industry });
}

function assemblePalette(primary, secondary, accent, brandData) {
  const { h: pH, s: pS } = hexToHsl(primary);
  // Neutrals carry a whisper of the brand hue
  const neutral    = hslToHex(pH, Math.min(pS, 12), 32);
  const lightColor = hslToHex(pH, Math.min(pS, 14), 96);
  const darkColor  = hslToHex(pH, Math.min(pS, 18), 11);

  return {
    primary:   { hex: primary,     role: 'Primary',   usage: 'Core brand identity — logos, headers, key UI elements' },
    secondary: { hex: secondary,   role: 'Secondary',  usage: 'Supporting color — cards, section backgrounds, icons' },
    accent:    { hex: accent,      role: 'Accent',     usage: 'CTAs, links, highlights — 10% rule, never as a background fill' },
    neutral:   { hex: neutral,     role: 'Neutral',    usage: 'Body text, borders, dividers' },
    light:     { hex: lightColor,  role: 'Light',      usage: 'Page backgrounds, negative space, breathing room' },
    dark:      { hex: darkColor,   role: 'Dark',       usage: 'Dark mode, strong emphasis, dramatic moments' },
  };
}

function applyPaletteGuidance(currentPalette, guidance, brandData) {
  return generatePaletteFromIndustry(brandData.industry, brandData.toneWords, guidance, brandData.archetype);
}

/* ─────────────────────────────────────────────────────────────
   8. FONT SELECTION
   ───────────────────────────────────────────────────────────── */

function selectFontPairing(brandData, guidance = '') {
  const { toneWords = [], industry = '', archetype = '' } = brandData;
  const words = [...toneWords, ...(guidance.toLowerCase().split(/\W+/))];
  const arch  = ARCHETYPES[archetype];
  const scores = FONT_PAIRINGS.map(pair => {
    let score = 0;
    words.forEach(w => { if (pair.keywords.includes(w)) score += 3; });
    if (pair.industries.includes(industry)) score += 4;
    if (arch?.preferredFonts.includes(pair.id)) score += 5;
    return { pair, score };
  });
  scores.sort((a, b) => b.score - a.score);
  // When top scores are close, pick randomly from the top tier for variety
  const topScore = scores[0].score;
  const topTier  = scores.filter(s => s.score >= topScore - 3);
  return pick(topTier).pair;
}

const loadedFonts = new Set();
function loadGoogleFont(family, weights = '400;600;700') {
  if (loadedFonts.has(family)) return;
  const link = document.createElement('link');
  link.rel   = 'stylesheet';
  link.href  = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(family)}:wght@${weights}&display=swap`;
  document.head.appendChild(link);
  loadedFonts.add(family);
}

/* ─────────────────────────────────────────────────────────────
   9. BRAND VOICE GENERATOR
   ───────────────────────────────────────────────────────────── */

const TRAIT_LIBRARY = {
  bold:          { means: 'Direct and confident — states positions without hedging', do: '"We built this differently. Here\'s why it works."', dont: '"We think this might be worth considering for certain use cases."' },
  warm:          { means: 'Speaks like a trusted friend, not a vendor', do: '"We know mornings are hard. That\'s exactly why we made this."', dont: '"Our product is designed to optimize your morning routine efficiency."' },
  professional:  { means: 'Polished and credible — substance over style', do: '"Our methodology reduced churn by 34% across 50+ clients."', dont: '"We are a leading provider of world-class solutions."' },
  playful:       { means: 'Light-hearted and creative — wit used purposefully', do: '"Life\'s too short for boring salads. You\'re welcome."', dont: '"LOL our product is literally so amazing you guys 😂😂"' },
  elegant:       { means: 'Refined word choice — intention in every phrase', do: '"Crafted from materials that improve with use."', dont: '"Super nice stuff that looks totally luxurious and amazing!"' },
  honest:        { means: 'Transparent about what we offer — and what we don\'t', do: '"This works best for X. If you need Y, we\'re not the right fit."', dont: '"Our solution handles everything your business could ever need."' },
  energetic:     { means: 'Active, present-tense voice — moves people to action', do: '"Start building today. Your first project is on us."', dont: '"Users are able to begin the process of project initiation immediately."' },
  calm:          { means: 'Measured and reassuring — never reactive or alarmist', do: '"Here\'s what\'s happening and what it means for you."', dont: '"URGENT: Everything is changing — don\'t get left behind!!"' },
  authoritative: { means: 'Expert-led, evidence-backed — earns credibility', do: '"A 2024 Stanford study found that teams using structured review cut errors by 41%."', dont: '"Studies show our approach is the best way to handle this."' },
  creative:      { means: 'Unexpected angles — fresh perspectives, never formula', do: '"The brief said \'timeless\'. We made \'forever anxious about trends\'."', dont: '"We offer innovative and creative solutions for modern brands."' },
  trustworthy:   { means: 'Consistent, accurate — does exactly what it says', do: '"Ships in 3–5 days. No exceptions."', dont: '"Ships quickly — timing may vary based on demand."' },
  luxurious:     { means: 'Elevated and aspirational — restraint signals quality', do: '"One piece. Designed to last 20 years."', dont: '"The most luxurious, premium, high-end product you\'ve ever seen!!!"' },
  organic:       { means: 'Natural, unforced language — earthy specificity', do: '"Hand-pressed from heirloom olives picked before first frost."', dont: '"100% natural, eco-friendly, sustainable, artisan-crafted goodness."' },
  minimal:       { means: 'Every word earns its place — no filler, no hedging', do: '"Less. Better."', dont: '"We are proud to offer you a truly comprehensive and holistic selection of..."' },
  approachable:  { means: 'Accessible to anyone — complexity reduced, not removed', do: '"Think of it like a search engine, but for your own files."', dont: '"Our AI-powered vectorised semantic search infrastructure democratises..."' },
  sophisticated: { means: 'Intelligent and nuanced — rewards attention', do: '"The intersection of craft and utility is where we live."', dont: '"Super cool sophisticated vibes for smart educated people."' },
  friendly:      { means: 'Inviting and genuine — warmth without performance', do: '"Pull up a chair. We\'ve got a lot to show you."', dont: '"Hi there valued customer! We\'re SO excited to serve you today!!! 😊"' },
  technical:     { means: 'Precise and domain-accurate — right word every time', do: '"Latency under 12ms at p95. Tested at 10k concurrent connections."', dont: '"Our system is super fast and handles tons of users simultaneously."' },
  edgy:          { means: 'Pushes conventions — takes risks others avoid', do: '"Most brands wouldn\'t admit this. We\'re not most brands."', dont: '"We\'re edgy and disruptive and totally not like other companies!!!"' },
  classic:       { means: 'Timeless language — doesn\'t chase trends', do: '"Made to last. Designed to be inherited."', dont: '"This season\'s most on-trend, viral, must-have drop is here."' },
  clear:         { means: 'Unambiguous and easy to act on — clarity over cleverness', do: '"Click here to book your free 30-minute call."', dont: '"We invite you to explore the possibility of initiating a consultation."' },
  direct:        { means: 'Says what it means — no padding, no hedging', do: '"It\'s expensive. Here\'s exactly why."', dont: '"While pricing varies based on many important factors and considerations..."' },
  encouraging:   { means: 'Uplifts and motivates — grounded in real possibility', do: '"You don\'t need experience. You just need to start."', dont: '"BELIEVE IN YOURSELF!! YOU CAN DO ANYTHING YOU SET YOUR MIND TO!!!"' },
  inclusive:     { means: 'Makes everyone feel seen — without erasure of identity', do: '"For anyone who\'s ever felt like the industry wasn\'t made for them."', dont: '"We welcome all kinds of diverse and inclusive types of various people."' },
  genuine:       { means: 'Authentic and jargon-free — real voice, real stakes', do: '"This took us three years to get right. We\'re still learning."', dont: '"As a purpose-driven brand, we leverage authentic storytelling frameworks."' },
  inspiring:     { means: 'Sparks curiosity — makes people want to act', do: '"What if your morning routine actually worked with you?"', dont: '"Our product will completely transform and revolutionize your entire life."' },
  fresh:         { means: 'Contemporary — feels current without chasing trends', do: '"Most brands are still solving yesterday\'s problems."', dont: '"We\'re totally vibing with the zeitgeist of today\'s discourse 💅"' },
  considered:    { means: 'Thoughtful and measured — speaks carefully about big ideas', do: '"We\'ve been sitting with this question for two years. Here\'s what we think."', dont: '"After careful consideration of all potential variables, we have determined..."' },
  grounded:      { means: 'Rooted in reality and practical outcomes', do: '"Forty families fed last month. That\'s what this looks like."', dont: '"We are making impactful positive impacts in the impact space."' },
  candid:        { means: 'Straight-talking, even on hard topics', do: '"We made a mistake. Here\'s what happened and what we changed."', dont: '"Due to operational complexities, outcomes did not align with expectations."' },
  evocative:     { means: 'Sensory, specific language — creates mental images', do: '"Salt air, cast-iron, three generations of the same recipe."', dont: '"Our immersive sensory experience creates memories and emotional connections."' },
  practical:     { means: 'Action-oriented and focused on tangible results', do: '"Do this one thing before bed. It takes four minutes."', dont: '"Empower yourself with the tools and resources to facilitate optimal outcomes."' },
};

const CHANNEL_TONE_SHIFTS = [
  { channel: 'Instagram / TikTok', tone: 'Casual, high-energy, visual-first. Short captions.', example: '"This one took six months. Totally worth it."' },
  { channel: 'LinkedIn',           tone: 'Professional but personal. Lead with insight.', example: '"The thing no one tells you about scaling a food brand…"' },
  { channel: 'Email',              tone: 'Write to one person, not a list. Reward the click.', example: '"Hey — quick one before you head into the weekend."' },
  { channel: 'Blog / Long-form',   tone: 'Show your thinking. Every paragraph earns its place.', example: '"Here\'s the question we kept getting wrong for two years."' },
  { channel: 'Product / UI',       tone: 'Clear, minimal. Never clever at the expense of clarity.', example: '"Save changes" not "Commit your preferences".' },
  { channel: 'Customer support',   tone: 'Empathetic, calm, never defensive. Trust-building.', example: '"That\'s completely understandable — here\'s what we can do."' },
];

const VOICE_SAMPLES = {
  'technology': [
    n => `"We built ${n} because we were frustrated with the complexity. Here's what we learned — and what we're still figuring out."`,
    n => `"Here's the honest post-mortem on our biggest product decision of the year. It didn't go perfectly. That's why we're sharing it."`,
    n => `"Fewer features. More focus. Here's what we removed from ${n} this quarter, and exactly why."`,
  ],
  'food-beverage': [
    n => `"This week's menu comes from a conversation with our farmer about what's actually ready right now. It changed everything."`,
    n => `"We charred these for eleven minutes. Not ten. Not twelve. The difference matters — and this is why."`,
    n => `"Our supplier called us last Tuesday. The harvest was early. So is this week's special. Come in while it lasts."`,
  ],
  'health-wellness': [
    n => `"We don't believe in perfect. We believe in consistent. ${n} is built for real life — not the highlight reel version of it."`,
    n => `"Three years of research went into this formula. Here's the study that changed what we thought we knew."`,
    n => `"The hardest part isn't starting. It's the Tuesday in week three when you don't feel like it. ${n} is built for that Tuesday."`,
  ],
  'fashion-beauty': [
    n => `"This piece took six months to get right. Not because we're perfectionists, but because the details matter to the people who will wear it every day."`,
    n => `"We stopped doing seasonal drops. Here's what we're doing instead, and why we think it's better for everyone."`,
    n => `"Our tailor has been doing this for thirty-one years. We asked her what most brands get wrong about fit. She had a lot to say."`,
  ],
  'finance': [
    n => `"Here's what the fine print actually means, in plain language. No catches. No hidden conditions."`,
    n => `"The interest rate changed. Here's exactly how it affects your account, in three sentences."`,
    n => `"Most people don't read the annual report. We rewrote ours so you would."`,
  ],
  'education': [
    n => `"You don't need to have it all figured out before you start. ${n} is designed for exactly where you are right now."`,
    n => `"We tracked 2,000 learners over two years. The one habit that predicted success had nothing to do with talent."`,
    n => `"Our most successful students all had one thing in common. It wasn't intelligence. It was this."`,
  ],
  'arts-entertainment': [
    n => `"This project started as a mistake. Here's why we're glad it did."`,
    n => `"We almost didn't release this. Here's the conversation that changed our minds."`,
    n => `"The first version was terrible. We're showing it to you anyway, because the gap between that and this is the whole story."`,
  ],
  'real-estate': [
    n => `"The market has shifted. Here's what that actually means if you're thinking about buying in the next six months."`,
    n => `"We turned down this listing. Here's why — and what it says about how we work."`,
    n => `"Buyers keep asking us about this neighbourhood. Here's the honest answer, including the parts other agents skip."`,
  ],
  'travel-hospitality': [
    n => `"The best version of this trip isn't on TripAdvisor. We'll show you where to actually go."`,
    n => `"We visited forty-three properties before we chose this one. Here's what made it different from the other forty-two."`,
    n => `"Low season. Lower prices. Fewer crowds. The same place, experienced the way locals actually experience it."`,
  ],
  'nonprofit': [
    n => `"Last month, 847 families accessed fresh produce for the first time in years. This is what that looked like."`,
    n => `"We didn't hit our target this quarter. Here's what we're doing differently — and why your trust matters more than the number."`,
    n => `"The funding gap is real. Here's exactly what $50 does, in specific, concrete terms. No vagueness."`,
  ],
  'retail': [
    n => `"We made fewer units this season. Not because of supply — because we wanted to make sure each one was worth keeping."`,
    n => `"This product has a two-year waitlist. We asked ourselves why, and it told us everything about what to build next."`,
    n => `"We got a thousand returns last year. We read every note. Here's what we changed because of them."`,
  ],
  'professional-services': [
    n => `"Most strategies fail in execution, not in planning. Here's where we see it go wrong — and how we prevent it."`,
    n => `"We walked away from a client last year. Here's why, and what it says about the kind of work we do."`,
    n => `"The brief said 'increase revenue'. The real problem was different. Here's how we found it."`,
  ],
};

function generateBrandVoice(brandData, guidance = '') {
  const { brandName, toneWords = [], industry = 'technology', audience = '', avoid = '', archetype = '', formality = 50, enthusiasm = 50 } = brandData;
  const toneStr = (toneWords.join(' ') + ' ' + guidance).toLowerCase();

  // Archetype-driven intro
  const arch = ARCHETYPES[archetype];
  const archIntroText = arch ? arch.archIntro(brandName) : null;

  // Resolve up to 4 voice traits (from toneWords + archetype traits)
  const candidateTraits = [...toneWords.map(w => w.trim().toLowerCase()), ...(arch?.traits || [])];
  const resolved = candidateTraits.filter(w => TRAIT_LIBRARY[w]).filter((w, i, a) => a.indexOf(w) === i).slice(0, 4);
  const fallbacks = ['honest','clear','professional','friendly'].filter(f => !resolved.includes(f));
  while (resolved.length < 4 && fallbacks.length) resolved.push(fallbacks.shift());

  const traits = resolved.map(w => ({
    trait: w,
    means: TRAIT_LIBRARY[w].means,
    do_example:   TRAIT_LIBRARY[w].do,
    dont_example: TRAIT_LIBRARY[w].dont,
  }));

  // Intro paragraph — pick randomly from varied templates
  const t = traits.map(tr => tr.trait);
  const shortAud = audience.split(',')[0].trim().toLowerCase() || 'people who care';
  const avoidClause = avoid ? ` We never ${avoid.split(',')[0].trim().toLowerCase()}.` : '';
  const avoidFirst  = avoid ? avoid.split(',')[0].trim().toLowerCase() : 'corporate jargon';

  const introTemplates = archIntroText ? [`${archIntroText}${avoidClause}`] : [
    `${brandName}'s voice is ${t[0]}, ${t[1]}, and ${t[2]}${t[3] ? ` — always ${t[3]}` : ''}. Every word${audience ? ` for ${shortAud}` : ''} earns its place.${avoidClause}`,
    `${brandName} believes ${t[0].toLowerCase()} communication builds better relationships than clever copy ever could. ${cap(t[1])} in everything — ${cap(t[2])} when it counts.${avoidClause}`,
    `When ${brandName} shows up — in an email, on a product label, in a social post — the tone is always ${t[0]} and ${t[1]}. Never ${avoidFirst}.`,
    `Every ${brandName} piece of writing asks one question before it goes out: would ${shortAud} find this ${t[0]}? If not, rewrite it.${avoidClause}`,
    `${brandName} writes ${t[0]}ly. Speaks ${t[1]}ly. Always for ${shortAud}. Never ${avoidFirst}.`,
  ];
  const intro = pick(introTemplates);

  // Writing rules based on tone sliders (0=formal/measured, 100=casual/enthusiastic)
  const fml = formality;   // 0=formal, 100=casual
  const ent = enthusiasm;  // 0=measured, 100=enthusiastic

  const writingRules = {
    contractions:    fml < 30 ? 'Avoid contractions — full forms only (e.g. "it is", "do not").' : fml < 60 ? 'Contractions welcome in conversational contexts.' : 'Always use contractions — formal phrasing feels distant.',
    sentenceLength:  fml < 30 ? 'Prefer longer, complete sentences with measured cadence.' : fml < 60 ? 'Mix short punchy sentences with longer explanatory ones.' : 'Favour short, direct sentences. One idea per sentence.',
    fragments:       fml < 40 ? 'Complete sentences throughout.' : 'Fragments OK for emphasis. Especially in headlines.',
    punctuation:     fml < 30 ? 'No exclamation marks. Em-dashes and semicolons where appropriate.' : fml < 65 ? 'One exclamation mark per piece, max.' : 'Exclamation marks OK but not stacked.',
    voiceEmotion:    ent < 30 ? 'Understated — let facts carry the weight. No hype.' : ent < 65 ? 'Measured warmth — enthusiasm is implied, not performed.' : 'Active, energetic voice. Enthusiasm is part of the brand.',
    headlines:       ent < 30 ? 'Declarative — state the point plainly.' : ent < 65 ? 'Lead with value or curiosity.' : 'Bold, action-oriented headlines. Start with a verb.',
  };

  const sampleArr = VOICE_SAMPLES[industry] || VOICE_SAMPLES['technology'];
  const sample    = pick(sampleArr)(brandName);

  return { intro, traits, writingRules, channels: CHANNEL_TONE_SHIFTS, sample };
}

/* ─────────────────────────────────────────────────────────────
   10. TAGLINE GENERATOR
   ───────────────────────────────────────────────────────────── */

const TAGLINE_VERBS = {
  'technology': 'Build', 'food-beverage': 'Craft', 'health-wellness': 'Nourish',
  'fashion-beauty': 'Define', 'finance': 'Grow', 'education': 'Shape',
  'arts-entertainment': 'Make', 'real-estate': 'Find', 'travel-hospitality': 'Explore',
  'nonprofit': 'Change', 'retail': 'Discover', 'professional-services': 'Deliver',
};
const TAGLINE_OBJECTS = {
  'technology': 'what\'s next', 'food-beverage': 'something worth sharing',
  'health-wellness': 'the life you want', 'fashion-beauty': 'your own standard',
  'finance': 'financial clarity', 'education': 'the skills that matter',
  'arts-entertainment': 'work that lasts', 'real-estate': 'the right place',
  'travel-hospitality': 'the places that change you', 'nonprofit': 'the world you want to see',
  'retail': 'things worth owning', 'professional-services': 'results that stick',
};
const INDUSTRY_GENERICS = {
  'technology': 'software', 'food-beverage': 'food brand', 'health-wellness': 'wellness brand',
  'fashion-beauty': 'fashion label', 'finance': 'fintech', 'education': 'learning platform',
  'arts-entertainment': 'creative studio', 'real-estate': 'real estate agency',
  'travel-hospitality': 'travel brand', 'nonprofit': 'non-profit', 'retail': 'retailer',
  'professional-services': 'consultancy',
};
const CONTRAST_TERMS = {
  'technology': 'complexity', 'food-beverage': 'compromise', 'health-wellness': 'guilt',
  'fashion-beauty': 'settling', 'finance': 'confusion', 'education': 'guesswork',
  'arts-entertainment': 'noise', 'real-estate': 'uncertainty', 'travel-hospitality': 'ordinary',
  'nonprofit': 'indifference', 'retail': 'mediocrity', 'professional-services': 'vague deliverables',
};

function cap(str) { return str ? str.charAt(0).toUpperCase() + str.slice(1) : ''; }

function generateTaglines(brandData, guidance = '') {
  const { brandName: n, industry: ind, toneWords: tw = [], description: desc = '', audience: aud = '' } = brandData;
  const verb     = TAGLINE_VERBS[ind]    || 'Create';
  const obj      = TAGLINE_OBJECTS[ind]  || 'something meaningful';
  const generic  = INDUSTRY_GENERICS[ind]|| 'brand';
  const contrast = CONTRAST_TERMS[ind]   || 'mediocrity';
  const t0       = cap(tw[0] || 'honest');
  const t1       = cap(tw[1] || 'clear');
  const shortAud = aud.split(',')[0].trim().toLowerCase() || 'people who care';
  const shortDesc= (desc || '').split(' ').slice(0, 6).join(' ').replace(/[.,]$/, '') || 'doing things differently';

  const guidanceLower = guidance.toLowerCase();

  // Expanded pool of 22 templates — shuffled each run for fresh picks
  const verbLower = verb.toLowerCase();
  const pool = [
    { text: `${n}. ${verb} ${obj}.`,                                         type: 'Action' },
    { text: `Less ${contrast}. More ${t0.toLowerCase()}.`,                   type: 'Contrast' },
    { text: `The ${generic} for ${shortAud} who mean it.`,                   type: 'Audience' },
    { text: `${t0}. ${t1}. ${n}.`,                                           type: 'Traits' },
    { text: `${verb} ${obj}, ${t0.toLowerCase()}ly.`,                        type: 'Adverb' },
    { text: `Not just a ${generic}. ${n}.`,                                  type: 'Differentiation' },
    { text: `${cap(shortDesc)}, by ${n}.`,                                   type: 'Descriptive' },
    { text: `${n} — where ${t0.toLowerCase()} meets ${t1.toLowerCase()}.`,   type: 'Intersection' },
    { text: `The ${t0.toLowerCase()} choice for ${shortAud}.`,               type: 'Positioning' },
    { text: `${verb} differently. ${n}.`,                                    type: 'Manifesto' },
    // New templates
    { text: `${n}. ${t0} by design.`,                                        type: 'Signature' },
    { text: `Made for ${shortAud}. Made different.`,                         type: 'Built For' },
    { text: `${t0}. Full stop.`,                                             type: 'Minimal' },
    { text: `The world has enough ${generic}s. Meet ${n}.`,                  type: 'Anti-category' },
    { text: `${n}: ${verbLower} ${obj} the ${t0.toLowerCase()} way.`,        type: 'The Way' },
    { text: `Here's to ${t0.toLowerCase()} ${generic}.`,                     type: 'Toast' },
    { text: `${t0}. ${t1}. Uncompromisingly ${n}.`,                          type: 'Uncompromising' },
    { text: `Built for ${shortAud}. Proven by results.`,                     type: 'Credibility' },
    { text: `What ${t0.toLowerCase()} looks like.`,                          type: 'Definition' },
    { text: `${n}: ${shortDesc}.`,                                           type: 'Colon Statement' },
    { text: `${verb} ${obj}. No shortcuts.`,                                 type: 'No Shortcuts' },
    { text: `${t0} enough to matter. ${t1} enough to last.`,                 type: 'Duality' },
  ];

  // Shuffle for fresh picks each generation
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  // Guidance re-ordering (promote matching types to front without removing others)
  let sorted = [...shuffled];
  if (guidanceLower.includes('short') || guidanceLower.includes('punchy')) sorted.sort((a, b) => a.text.length - b.text.length);
  if (guidanceLower.includes('aspir')) sorted = sorted.filter(t => ['Action','Manifesto','Intersection','Toast'].includes(t.type)).concat(sorted);
  if (guidanceLower.includes('direct') || guidanceLower.includes('benefit')) sorted = sorted.filter(t => ['Action','Audience','Positioning','Credibility'].includes(t.type)).concat(sorted);
  if (guidanceLower.includes('clever') || guidanceLower.includes('wordplay')) sorted = sorted.filter(t => ['Contrast','Intersection','Adverb','Duality','Minimal'].includes(t.type)).concat(sorted);
  if (guidanceLower.includes('minim') || guidanceLower.includes('simple')) sorted = sorted.filter(t => ['Minimal','Signature','Action'].includes(t.type)).concat(sorted);

  // De-duplicate and return 6
  const seen = new Set();
  return sorted.filter(t => { if (seen.has(t.text)) return false; seen.add(t.text); return true; }).slice(0, 6);
}

/* ─────────────────────────────────────────────────────────────
   11. CONTENT STRATEGY GENERATOR
   ───────────────────────────────────────────────────────────── */

function generateContentStrategy(brandData, guidance = '') {
  const { industry = 'technology', toneWords = [], audience = '' } = brandData;
  const base = INDUSTRY_CONTENT[industry] || INDUSTRY_CONTENT['professional-services'];
  const gLower = guidance.toLowerCase();

  let pillars  = [...base.pillars];
  let channels = [...base.channels];

  // Guidance adjustments
  if (gLower.includes('educational') || gLower.includes('education'))
    pillars.sort((a, b) => a.goal.includes('Trust') ? -1 : 1);
  if (gLower.includes('entertainment') || gLower.includes('inspiration'))
    pillars.sort((a, b) => a.goal.includes('Aspiration') ? -1 : 1);
  if (gLower.includes('b2b') || gLower.includes('linkedin'))
    channels = [{ name: 'LinkedIn', fit: 'primary', freq: '5×/week', rationale: 'B2B decision-makers and professionals.', formats: ['Thought leadership','Case studies','Team posts','Industry data'] }, ...channels.filter(c => c.name !== 'LinkedIn')];
  if (gLower.includes('short') || gLower.includes('video') || gLower.includes('tiktok'))
    channels = [{ name: 'TikTok', fit: 'primary', freq: '5×/week', rationale: 'Short-form video for maximum organic reach.', formats: ['Behind-the-scenes','Quick tips','Trend participation'] }, ...channels.filter(c => c.name !== 'TikTok')];

  return {
    pillars:      pillars.slice(0, 5),
    channels:     channels.slice(0, 4),
    toneGuidance: base.toneGuidance,
    postingTips:  base.postingTips,
  };
}

/* ─────────────────────────────────────────────────────────────
   12. RENDER — PALETTE
   ───────────────────────────────────────────────────────────── */

function renderPalette(palette) {
  const swatches = Object.entries(palette).map(([key, { hex, role, usage }]) => {
    const fg = textOnBg(hex);
    return `
      <div class="swatch">
        <div class="swatch-block" style="background:${hex}">
          <input type="color" class="swatch-picker" value="${hex}" title="Click to adjust ${role} colour"
            oninput="liveUpdateColor('${key}', this.value)">
          <button class="swatch-copy" style="color:${fg}" onclick="copyHex('${hex}',this)" title="Copy ${hex}">Copy</button>
        </div>
        <div class="swatch-info">
          <div class="swatch-hex">${hex.toUpperCase()}</div>
          <div class="swatch-role">${role}</div>
          <div class="swatch-usage">${usage}</div>
        </div>
      </div>`;
  }).join('');

  const cr = contrastRatio(palette.neutral.hex, palette.light.hex).toFixed(1);

  return `
    <div class="palette-swatches">${swatches}</div>
    <div class="palette-note">
      <strong>60-30-10 rule:</strong> Light (${palette.light.hex}) fills 60% of surfaces. Primary + Secondary carry 30%. Accent (${palette.accent.hex.toUpperCase()}) is reserved for calls-to-action and links only — never as a background fill.
      Body text (${palette.neutral.hex.toUpperCase()}) on light background passes WCAG AA at ${cr}:1 contrast.
      <span class="palette-picker-hint">Click any swatch to adjust its colour.</span>
    </div>`;
}

function liveUpdateColor(role, hex) {
  if (!kit.palette || !kit.palette[role]) return;
  kit.palette[role] = { ...kit.palette[role], hex };
  clearTimeout(liveUpdateColor._t);
  liveUpdateColor._t = setTimeout(() => {
    document.getElementById('palette-content').innerHTML = renderPalette(kit.palette);
    if (kit.fonts && kit.brandData) {
      document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...kit.brandData, taglines: kit.taglines });
      kit.wordmark = generateWordmark({ ...kit.brandData, taglines: kit.taglines }, kit.fonts, kit.palette);
      document.getElementById('wordmark-content').innerHTML = renderWordmark(kit.wordmark);
    }
  }, 280);
}

function copyHex(hex, btn) {
  navigator.clipboard?.writeText(hex).then(() => {
    const orig = btn.textContent;
    btn.textContent = '✓ Copied';
    setTimeout(() => { btn.textContent = orig; }, 1200);
  });
}

/* ─────────────────────────────────────────────────────────────
   13. RENDER — TYPOGRAPHY
   ───────────────────────────────────────────────────────────── */

function renderTypography(pair, brandData) {
  // Accept either a full brandData object or a plain string brandName (backwards-compat)
  const brandName = typeof brandData === 'string' ? brandData : (brandData?.brandName || 'Your Brand');
  const taglines  = (typeof brandData === 'object' && brandData?.taglines) || [];
  const taglineText = (taglines[0]?.text || brandData?.description || '').replace(/"/g, '').trim();
  const descText    = (typeof brandData === 'object' && (brandData?.description || brandData?.whatDoes)) || '';
  const bodyPreview = descText || 'Body copy that carries the reader from sentence to sentence — building understanding without demanding effort. Clear, considered, worth reading.';

  loadGoogleFont(pair.heading, `${pair.hw}`);
  if (pair.body !== pair.heading) loadGoogleFont(pair.body, `${pair.bw};400;600`);

  const hStyle = `font-family:'${pair.heading}',serif;font-weight:${pair.hw};`;
  const bStyle = `font-family:'${pair.body}',sans-serif;font-weight:${pair.bw};`;

  const scaleRows = [
    { label: 'Heading 1', size: '48px', weight: pair.hw, sample: brandName,          font: pair.heading },
    { label: 'Heading 2', size: '32px', weight: pair.hw, sample: taglineText || 'Your brand tagline goes here', font: pair.heading },
    { label: 'Heading 3', size: '22px', weight: pair.hw, sample: 'Section heading',  font: pair.heading },
    { label: 'Body',      size: '16px', weight: pair.bw, sample: bodyPreview.slice(0, 90), font: pair.body },
    { label: 'Caption',   size: '12px', weight: pair.bw, sample: 'Captions, labels, metadata', font: pair.body },
  ].map(r => `
    <div class="type-scale-row">
      <span class="type-scale-label">${r.label}</span>
      <span class="type-scale-size">${r.size}</span>
      <span class="type-scale-sample" style="font-family:'${r.font}',serif;font-size:${r.size};font-weight:${r.weight};line-height:1.3;">${r.sample}</span>
    </div>`).join('');

  return `
    <div class="type-display">
      <div class="type-card">
        <div class="type-card-label">Heading Font</div>
        <div class="type-card-family">${pair.heading}</div>
        <div class="type-card-details">Weight ${pair.hw} · Display</div>
        <div class="type-sample-heading" style="${hStyle}font-size:clamp(1.4rem,4vw,2rem);line-height:1.2;">${taglineText || brandName}</div>
      </div>
      <div class="type-card">
        <div class="type-card-label">Body Font</div>
        <div class="type-card-family">${pair.body}</div>
        <div class="type-card-details">Weight ${pair.bw} · Body text</div>
        <div class="type-sample-body" style="${bStyle}font-size:15px;line-height:1.65;">${bodyPreview.slice(0, 140)}</div>
      </div>
    </div>
    <div class="type-scale">${scaleRows}</div>
    <p class="type-pairing-desc">Pairing: <strong>${pair.heading} + ${pair.body}</strong> — ${pair.desc} Maintain a minimum 4.5:1 contrast ratio on all body text.</p>`;
}

/* ─────────────────────────────────────────────────────────────
   14. RENDER — BRAND VOICE
   ───────────────────────────────────────────────────────────── */

function renderVoice(voiceData) {
  const traitCards = voiceData.traits.map(t => `
    <div class="voice-trait">
      <div class="voice-trait-name">${cap(t.trait)}</div>
      <div class="voice-trait-means">${t.means}</div>
      <div class="voice-do-dont">
        <div class="voice-do"><span class="do-label">DO</span>${t.do_example}</div>
        <div class="voice-dont"><span class="dont-label">DON'T</span>${t.dont_example}</div>
      </div>
    </div>`).join('');

  const wr = voiceData.writingRules || {};
  const writingRuleRows = Object.entries(wr).map(([key, val]) => {
    const labels = { contractions:'Contractions', sentenceLength:'Sentence length', fragments:'Fragments', punctuation:'Punctuation', voiceEmotion:'Emotional register', headlines:'Headlines' };
    return `<div class="writing-rule"><span class="writing-rule-key">${labels[key] || key}</span><span class="writing-rule-val">${val}</span></div>`;
  }).join('');

  const channelRows = voiceData.channels.map(c => `
    <div class="voice-channel-row">
      <div class="voice-channel-name">${c.channel}</div>
      <div class="voice-channel-tone">${c.tone}</div>
      <div class="voice-channel-example">${c.example}</div>
    </div>`).join('');

  return `
    <p class="voice-intro">${voiceData.intro}</p>

    <div class="voice-section-label">Voice traits — Do/Don't</div>
    <div class="voice-traits">${traitCards}</div>

    <div class="voice-section-label">Writing rules</div>
    <div class="writing-rules">${writingRuleRows}</div>

    <div class="voice-section-label">Tone by channel</div>
    <div class="voice-channels">${channelRows}</div>

    <div class="voice-sample">
      <div class="voice-sample-label">Voice in action</div>
      <p class="voice-sample-text">${voiceData.sample}</p>
    </div>`;
}

/* ─────────────────────────────────────────────────────────────
   15. RENDER — TAGLINE
   ───────────────────────────────────────────────────────────── */

function renderTagline(taglines, selectedIdx = 0) {
  const primary = taglines[selectedIdx] || taglines[0];
  const variantItems = taglines.map((tl, i) => `
    <div class="tagline-variant ${i === selectedIdx ? 'selected' : ''}" data-idx="${i}">
      <span class="tagline-variant-text">${tl.text}</span>
      <span class="tagline-variant-type">${tl.type}</span>
      <button class="tagline-select-btn" onclick="selectTagline(${i})">${i === selectedIdx ? '✓ Selected' : 'Use this'}</button>
    </div>`).join('');

  return `
    <div class="tagline-primary">"${primary.text}"</div>
    <div class="tagline-type-badge">${primary.type}</div>
    <div class="tagline-variants-label">All variations</div>
    <div class="tagline-variants" id="tagline-variants">${variantItems}</div>`;
}

function selectTagline(idx) {
  kit.activeTagline = idx;
  document.getElementById('tagline-content').innerHTML = renderTagline(kit.taglines, idx);
  // Propagate new tagline to mockup and wordmark
  if (kit.palette && kit.fonts && kit.brandData) {
    document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...kit.brandData, taglines: kit.taglines });
    kit.wordmark = generateWordmark({ ...kit.brandData, taglines: kit.taglines }, kit.fonts, kit.palette);
    document.getElementById('wordmark-content').innerHTML = renderWordmark(kit.wordmark);
  }
}

/* ─────────────────────────────────────────────────────────────
   16. RENDER — VISUAL MOCKUPS (6 contexts)
   ───────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────
   WORDMARK GENERATOR & RENDERER
   ───────────────────────────────────────────────────────────── */

function generateWordmark(brandData, fonts, palette) {
  const { brandName, archetype = '', taglines = [] } = brandData;
  const arch = ARCHETYPES[archetype];
  const tagline = taglines[0]?.text || '';

  // Per-archetype letterform choices
  const wWeight    = arch?.wordmarkWeight || fonts.hw || '700';
  const wCase      = arch?.wordmarkCase  || (fonts.allCaps ? 'upper' : 'title');
  const wTracking  = fonts.wordmarkTracking || '0em';

  const displayName = wCase === 'upper' ? brandName.toUpperCase()
                    : wCase === 'lower' ? brandName.toLowerCase()
                    : brandName;

  // Initials for marked variant
  const initials = brandName.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  return { displayName, initials, tagline, wWeight, wCase, wTracking, fonts, palette };
}

function renderWordmark(wmData) {
  if (!wmData) return '<p class="voice-intro">Generate a brand kit first to see your wordmarks.</p>';
  const { displayName, initials, tagline, wWeight, wTracking, fonts, palette } = wmData;
  const p  = palette.primary.hex;
  const a  = palette.accent.hex;
  const lc = palette.light.hex;
  const dc = palette.dark.hex;
  const tp = textOnBg(p);
  const td = textOnBg(dc);
  const tl = textOnBg(lc);
  const hF = `'${fonts.heading}',Georgia,serif`;
  const shortTag = tagline.length > 50 ? tagline.slice(0, 50) + '…' : tagline;

  function wmCard(id, label, svgContent, desc) {
    return `
      <div class="wm-card" id="wm-card-${id}">
        <div class="wm-preview">${svgContent}</div>
        <div class="wm-card-foot">
          <div>
            <div class="wm-label">${label}</div>
            <div class="wm-desc">${desc}</div>
          </div>
          <button class="btn btn--ghost btn--sm wm-download-btn" onclick="downloadWordmark('${id}')">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg>
            PNG
          </button>
        </div>
      </div>`;
  }

  // 1. Logotype — name in heading font, natural case
  const logotypeSvg = `
    <svg id="svg-logotype" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" width="100%" height="100%">
      <rect width="480" height="160" fill="${lc}"/>
      <text x="240" y="100" font-family="${hF.replace(/'/g,'')}" font-weight="${wWeight}"
        font-size="56" letter-spacing="${wTracking}" fill="${p}"
        text-anchor="middle" dominant-baseline="middle">${displayName}</text>
    </svg>`;

  // 2. Display — all caps, tight track, on dark
  const displayStr = displayName.toUpperCase();
  const displaySvg = `
    <svg id="svg-display" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" width="100%" height="100%">
      <rect width="480" height="160" fill="${dc}"/>
      <text x="240" y="96" font-family="${hF.replace(/'/g,'')}" font-weight="900"
        font-size="52" letter-spacing="0.12em" fill="${a}"
        text-anchor="middle" dominant-baseline="middle">${displayStr}</text>
    </svg>`;

  // 3. Stacked — name + tagline, white bg
  const stackedSvg = `
    <svg id="svg-stacked" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" width="100%" height="100%">
      <rect width="480" height="160" fill="#ffffff"/>
      <line x1="60" y1="80" x2="420" y2="80" stroke="${a}" stroke-width="1" opacity="0.25"/>
      <text x="240" y="62" font-family="${hF.replace(/'/g,'')}" font-weight="${wWeight}"
        font-size="38" letter-spacing="${wTracking}" fill="${p}"
        text-anchor="middle" dominant-baseline="middle">${displayName}</text>
      <text x="240" y="100" font-family="Inter,system-ui,sans-serif" font-weight="400"
        font-size="13" letter-spacing="0.08em" fill="${textOnBg('#ffffff')}" opacity="0.55"
        text-anchor="middle" dominant-baseline="middle">${shortTag.toUpperCase()}</text>
    </svg>`;

  // 4. Marked — geometric shape + initials + name
  const markedSvg = `
    <svg id="svg-marked" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 480 160" width="100%" height="100%">
      <rect width="480" height="160" fill="${lc}"/>
      <rect x="48" y="40" width="80" height="80" rx="12" fill="${p}"/>
      <text x="88" y="82" font-family="${hF.replace(/'/g,'')}" font-weight="900"
        font-size="32" fill="${tp}" text-anchor="middle" dominant-baseline="middle">${initials}</text>
      <text x="162" y="74" font-family="${hF.replace(/'/g,'')}" font-weight="${wWeight}"
        font-size="38" letter-spacing="${wTracking}" fill="${p}"
        text-anchor="start" dominant-baseline="middle">${displayName}</text>
      <text x="163" y="107" font-family="Inter,system-ui,sans-serif" font-weight="500"
        font-size="12" letter-spacing="0.09em" fill="${tl}" opacity="0.5"
        text-anchor="start" dominant-baseline="middle">${shortTag || ''}</text>
    </svg>`;

  return `
    <div class="wm-grid">
      ${wmCard('logotype', 'Logotype', logotypeSvg, 'Heading font · natural case · standard tracking')}
      ${wmCard('display',  'Display',  displaySvg,  'All caps · heavy weight · accent colour on dark')}
      ${wmCard('stacked',  'Lockup',   stackedSvg,  'Name + tagline stacked · rule separator')}
      ${wmCard('marked',   'Mark + Name', markedSvg, 'Geometric mark with initials + wordmark')}
    </div>
    <p class="type-pairing-desc" style="margin-top:20px;">Wordmarks use <strong>${fonts.heading}</strong> — weight ${wWeight}, tracking ${wTracking}. Download each as PNG or copy the SVG source code from the browser inspector for vector use.</p>`;
}

async function downloadWordmark(variantId) {
  const svgEl = document.getElementById(`svg-${variantId}`);
  if (!svgEl) return;
  const svg = new XMLSerializer().serializeToString(svgEl);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `${(kit.brandData?.brandName || 'wordmark').replace(/\s+/g,'-').toLowerCase()}-${variantId}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}

function mockupCell(frameClass, innerHtml, label, context, cellId) {
  return `
    <div class="mockup-cell" id="mockup-cell-${cellId}">
      <div class="mockup-frame ${frameClass}">${innerHtml}</div>
      <div class="mockup-cell-actions">
        <button class="mockup-action-btn" onclick="regenMockupCell('${cellId}')" title="New layout variant">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M2.5 8a5.5 5.5 0 018.5-4.58M13.5 8a5.5 5.5 0 01-8.5 4.58M12 3.5l1.5 2-2 .5M4 12.5l-1.5-2 2-.5"/></svg>
        </button>
        <button class="mockup-action-btn mockup-action-btn--code" onclick="showCodeSnippet('${cellId}')" title="Download code snippet">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5.5 4.5L2 8l3.5 3.5M10.5 4.5L14 8l-3.5 3.5M9.5 3l-3 10"/></svg>
        </button>
      </div>
      <div class="mockup-meta">
        <span class="mockup-meta-label">${label}</span>
        <span class="mockup-meta-context">${context}</span>
      </div>
    </div>`;
}

function renderMockup(palette, fonts, brandData) {
  const { brandName, taglines = [] } = brandData;
  const taglineText = (taglines[0]?.text || brandName).replace(/"/g, '');
  const shortTag    = taglineText.length > 45 ? taglineText.slice(0, 45) + '…' : taglineText;
  const p  = palette.primary.hex;
  const s  = palette.secondary.hex;
  const a  = palette.accent.hex;
  const lc = palette.light.hex;
  const dc = palette.dark.hex;
  // Persist variant indices across live-updates; only reset on full regen
  const pv = kit.mockupVariants || {};
  const vCard    = pv.card    ?? Math.floor(Math.random() * 3);
  const vProfile = pv.profile ?? Math.floor(Math.random() * 2);
  const vFeed    = pv.feed    ?? Math.floor(Math.random() * 3);
  const vStory   = pv.story   ?? Math.floor(Math.random() * 2);
  const vHero    = pv.hero    ?? Math.floor(Math.random() * 3);
  const vEmail   = pv.email   ?? Math.floor(Math.random() * 2);
  kit.mockupVariants = { card: vCard, profile: vProfile, feed: vFeed, story: vStory, hero: vHero, email: vEmail };
  const tp = textOnBg(p);
  const ts = textOnBg(s);
  const tl = textOnBg(lc);
  const td = textOnBg(dc);
  const ta = textOnBg(a);
  const hF = `'${fonts.heading}',Georgia,serif`;
  const bF = `'${fonts.body}',system-ui,sans-serif`;
  const hw = fonts.hw;

  const handle = '@' + brandName.toLowerCase().replace(/\s+/g, '');
  const initials = brandName.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();

  // ── 1. Business Card (landscape 1.6:1) — 3 variants ───
  const cardVariants = [
    // V0: Classic split — primary left, light right
    `<div style="display:flex;width:100%;height:100%;">
      <div style="width:38%;background:${p};display:flex;flex-direction:column;justify-content:space-between;padding:11% 9%;">
        <div style="width:18px;height:18px;border-radius:3px;background:${a};opacity:0.85;"></div>
        <div>
          <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.9em,2.5vw,1.3em);color:${tp};line-height:1.15;letter-spacing:-0.01em;">${brandName}</div>
          <div style="width:22px;height:2px;background:${a};border-radius:2px;margin-top:8%;"></div>
        </div>
      </div>
      <div style="flex:1;background:${lc};display:flex;flex-direction:column;justify-content:center;padding:9% 11%;">
        <div style="font-family:${bF};font-size:clamp(0.5em,1.2vw,0.68em);color:${tl};opacity:0.55;line-height:1.55;margin-bottom:12%;">${shortTag}</div>
        <div style="font-family:${bF};font-size:clamp(0.4em,0.9vw,0.55em);font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${tl};opacity:0.28;">${handle}.com</div>
      </div>
    </div>`,
    // V1: All-dark editorial with name centred
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${dc};gap:6%;">
      <div style="font-family:${bF};font-size:clamp(0.38em,0.85vw,0.5em);font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${a};">${brandName.toUpperCase()}</div>
      <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.9em,2.4vw,1.4em);color:${td};line-height:1.15;letter-spacing:-0.02em;text-align:center;">${shortTag}</div>
      <div style="width:32px;height:1px;background:${a};opacity:0.6;"></div>
      <div style="font-family:${bF};font-size:clamp(0.38em,0.85vw,0.5em);color:${td};opacity:0.35;letter-spacing:0.06em;">${handle}.com</div>
    </div>`,
    // V2: Light with top accent stripe + right-aligned layout
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${lc};">
      <div style="height:5px;background:${a};flex-shrink:0;"></div>
      <div style="flex:1;display:flex;align-items:center;justify-content:space-between;padding:8% 10%;">
        <div>
          <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.85em,2.2vw,1.2em);color:${tl};letter-spacing:-0.01em;line-height:1.15;">${brandName}</div>
          <div style="font-family:${bF};font-size:clamp(0.42em,0.95vw,0.56em);color:${tl};opacity:0.5;margin-top:6%;">${shortTag}</div>
        </div>
        <div style="width:32px;height:32px;border-radius:6px;background:${p};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span style="font-family:${hF};font-size:12px;font-weight:900;color:${tp};">${initials[0]}</span>
        </div>
      </div>
    </div>`,
  ];
  const card = cardVariants[vCard];

  // ── 2. Profile Picture / Avatar (1:1) — 2 variants ────
  const profileVariants = [
    // V0: Light bg with circle avatar
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${lc};gap:8%;">
      <div style="width:48%;aspect-ratio:1/1;border-radius:50%;background:${p};border:3px solid ${a};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-family:${hF};font-weight:900;font-size:clamp(1.1em,3.5vw,2em);color:${tp};line-height:1;">${initials}</span>
      </div>
      <div style="text-align:center;padding:0 8%;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.65em,1.8vw,0.9em);color:${tl};letter-spacing:-0.01em;">${brandName}</div>
        <div style="font-family:${bF};font-size:clamp(0.4em,1vw,0.52em);color:${tl};opacity:0.4;letter-spacing:0.05em;text-transform:uppercase;margin-top:5%;">${handle}</div>
      </div>
    </div>`,
    // V1: Full primary bg with light circle
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${p};gap:8%;">
      <div style="width:46%;aspect-ratio:1/1;border-radius:50%;background:${lc};border:2px solid ${a};display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <span style="font-family:${hF};font-weight:900;font-size:clamp(1.1em,3.5vw,2em);color:${p};line-height:1;">${initials}</span>
      </div>
      <div style="text-align:center;padding:0 8%;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.65em,1.8vw,0.9em);color:${tp};letter-spacing:-0.01em;">${brandName}</div>
        <div style="font-family:${bF};font-size:clamp(0.4em,1vw,0.52em);color:${tp};opacity:0.5;letter-spacing:0.05em;text-transform:uppercase;margin-top:5%;">${handle}</div>
      </div>
    </div>`,
  ];
  const profile = profileVariants[vProfile];

  // ── 3. Instagram Feed Post (square 1:1) — 3 variants ──
  const feedVariants = [
    // V0: Primary image area with tagline centred
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${lc};">
      <div style="display:flex;align-items:center;gap:7px;padding:6% 7% 3%;">
        <div style="width:22px;height:22px;border-radius:50%;background:${p};border:1.5px solid ${a};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <span style="font-family:${hF};font-size:9px;font-weight:900;color:${tp};">${initials[0]}</span>
        </div>
        <span style="font-family:${bF};font-size:clamp(0.48em,1.1vw,0.62em);font-weight:700;color:${tl};letter-spacing:0.02em;">${brandName}</span>
      </div>
      <div style="flex:1;background:${p};display:flex;align-items:center;justify-content:center;padding:8%;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.8em,2.2vw,1.2em);color:${tp};line-height:1.2;letter-spacing:-0.01em;text-align:center;">${shortTag}</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:4% 7% 6%;">
        <div style="font-family:${bF};font-size:clamp(0.4em,0.95vw,0.55em);color:${tl};opacity:0.45;">${handle}</div>
        <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.38em,0.9vw,0.5em);font-weight:700;padding:3% 8%;border-radius:3px;">Follow</div>
      </div>
    </div>`,
    // V1: Editorial quote style — dark bg, large quote marks
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${dc};">
      <div style="display:flex;align-items:center;gap:7px;padding:6% 7% 3%;">
        <div style="width:20px;height:20px;border-radius:50%;background:${a};flex-shrink:0;"></div>
        <span style="font-family:${bF};font-size:clamp(0.45em,1vw,0.58em);font-weight:700;color:${a};letter-spacing:0.05em;text-transform:uppercase;">${brandName}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:4% 9%;">
        <div style="font-family:${hF};font-size:clamp(2em,6vw,4em);color:${a};line-height:0.7;margin-bottom:4%;opacity:0.8;">"</div>
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.78em,2vw,1.1em);color:${td};line-height:1.25;letter-spacing:-0.01em;">${shortTag}</div>
      </div>
      <div style="padding:4% 9% 7%;font-family:${bF};font-size:clamp(0.38em,0.9vw,0.52em);color:${td};opacity:0.35;">${handle}</div>
    </div>`,
    // V2: Minimal light — centred text, accent rule, no image area
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${lc};">
      <div style="width:24px;height:3px;background:${a};border-radius:2px;margin-bottom:10%;"></div>
      <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.8em,2.2vw,1.2em);color:${tl};line-height:1.2;letter-spacing:-0.01em;text-align:center;padding:0 10%;">${shortTag}</div>
      <div style="width:24px;height:3px;background:${a};border-radius:2px;margin-top:10%;"></div>
      <div style="font-family:${bF};font-size:clamp(0.38em,0.9vw,0.52em);font-weight:700;letter-spacing:0.07em;text-transform:uppercase;color:${tl};opacity:0.35;margin-top:8%;">${brandName}</div>
    </div>`,
  ];
  const feed = feedVariants[vFeed];

  // ── 4. Instagram Story (portrait 9:16) — 2 variants ───
  const storyVariants = [
    // V0: Dark with accent rule + swipe up
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${dc};">
      <div style="display:flex;align-items:center;gap:7px;padding:7% 6% 4%;">
        <div style="width:22px;height:22px;border-radius:50%;background:${p};border:2px solid ${a};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <span style="font-family:${hF};font-size:9px;font-weight:900;color:${tp};">${initials[0]}</span>
        </div>
        <span style="font-family:${bF};font-size:clamp(0.48em,1.2vw,0.62em);font-weight:700;color:${td};letter-spacing:0.02em;">${brandName}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:6% 8%;">
        <div style="width:28px;height:3px;background:${a};border-radius:2px;margin-bottom:8%;"></div>
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.9em,2.8vw,1.5em);color:${td};line-height:1.2;letter-spacing:-0.015em;">${shortTag}</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;padding-bottom:9%;gap:4%;">
        <div style="font-family:${bF};font-size:clamp(0.36em,0.85vw,0.5em);font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${a};">Swipe up ↑</div>
      </div>
    </div>`,
    // V1: Primary colour fill, bold centred layout
    `<div style="display:flex;flex-direction:column;width:100%;height:100%;background:${p};">
      <div style="display:flex;align-items:center;gap:7px;padding:7% 6% 4%;">
        <div style="width:22px;height:22px;border-radius:50%;background:${lc};flex-shrink:0;display:flex;align-items:center;justify-content:center;">
          <span style="font-family:${hF};font-size:9px;font-weight:900;color:${p};">${initials[0]}</span>
        </div>
        <span style="font-family:${bF};font-size:clamp(0.48em,1.2vw,0.62em);font-weight:700;color:${tp};letter-spacing:0.02em;opacity:0.85;">${brandName}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:6% 10%;text-align:center;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(1em,3vw,1.6em);color:${tp};line-height:1.15;letter-spacing:-0.015em;">${shortTag}</div>
        <div style="width:36px;height:2px;background:${tp};opacity:0.35;margin-top:10%;"></div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:center;padding-bottom:9%;">
        <div style="background:${lc};color:${tl};font-family:${bF};font-size:clamp(0.38em,0.9vw,0.52em);font-weight:700;padding:3% 10%;border-radius:20px;letter-spacing:0.05em;">Learn more →</div>
      </div>
    </div>`,
  ];
  const story = storyVariants[vStory];

  // ── 5. Web Hero (wide 2.4:1) — 3 variants ──────────────
  const heroVariants = [
    // V0: Dark + primary split
    `<div style="display:flex;width:100%;height:100%;">
      <div style="flex:1.3;background:${dc};display:flex;flex-direction:column;justify-content:center;padding:7% 8%;">
        <div style="font-family:${bF};font-size:clamp(0.36em,0.9vw,0.5em);font-weight:700;letter-spacing:0.11em;text-transform:uppercase;color:${a};margin-bottom:5%;">${brandName}</div>
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.72em,1.9vw,1.1em);color:${td};line-height:1.2;letter-spacing:-0.01em;margin-bottom:8%;">${shortTag}</div>
        <div style="display:inline-flex;gap:6px;">
          <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.48em);font-weight:700;padding:4% 10%;border-radius:3px;">Get started</div>
          <div style="border:1px solid rgba(255,255,255,0.2);color:${td};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.48em);font-weight:600;padding:4% 10%;border-radius:3px;">Learn more</div>
        </div>
      </div>
      <div style="flex:0.7;background:${p};"></div>
    </div>`,
    // V1: Full-width centred, light background
    `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;background:${lc};text-align:center;padding:6% 10%;">
      <div style="font-family:${bF};font-size:clamp(0.36em,0.9vw,0.5em);font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${a};margin-bottom:5%;">${brandName}</div>
      <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.8em,2.1vw,1.2em);color:${tl};line-height:1.15;letter-spacing:-0.015em;margin-bottom:8%;">${shortTag}</div>
      <div style="display:inline-flex;gap:8px;">
        <div style="background:${p};color:${tp};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.48em);font-weight:700;padding:4% 11%;border-radius:3px;">Get started</div>
        <div style="border:1.5px solid ${p};color:${tl};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.48em);font-weight:600;padding:4% 11%;border-radius:3px;">Learn more</div>
      </div>
    </div>`,
    // V2: Accent-filled with white text
    `<div style="display:flex;width:100%;height:100%;background:${a};">
      <div style="flex:1.4;display:flex;flex-direction:column;justify-content:center;padding:7% 9%;">
        <div style="font-family:${bF};font-size:clamp(0.36em,0.9vw,0.5em);font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${ta};opacity:0.6;margin-bottom:5%;">${brandName}</div>
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.72em,1.9vw,1.1em);color:${ta};line-height:1.2;letter-spacing:-0.01em;margin-bottom:8%;">${shortTag}</div>
        <div style="background:${ta};color:${a};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.48em);font-weight:700;padding:4% 10%;border-radius:3px;display:inline-block;max-width:fit-content;">Get started</div>
      </div>
      <div style="flex:0.6;display:flex;align-items:center;justify-content:center;">
        <div style="width:60%;aspect-ratio:1;border-radius:50%;background:${ta};opacity:0.08;"></div>
      </div>
    </div>`,
  ];
  const hero = heroVariants[vHero];

  // ── 6. Email Banner (very wide 4:1) — 2 variants ───────
  const emailVariants = [
    // V0: Secondary bg, three columns
    `<div style="display:flex;align-items:center;justify-content:space-between;width:100%;height:100%;background:${s};padding:0 5%;">
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div style="width:22px;height:22px;border-radius:4px;background:${p};flex-shrink:0;"></div>
        <span style="font-family:${hF};font-weight:${hw};font-size:clamp(0.56em,1.6vw,0.88em);color:${ts};letter-spacing:-0.01em;">${brandName}</span>
      </div>
      <div style="font-family:${bF};font-size:clamp(0.36em,0.95vw,0.56em);color:${ts};opacity:0.5;flex:1;text-align:center;padding:0 5%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${shortTag}</div>
      <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.5em);font-weight:700;padding:5% 10%;border-radius:3px;flex-shrink:0;white-space:nowrap;">Subscribe →</div>
    </div>`,
    // V1: Dark bg with left accent stripe
    `<div style="display:flex;align-items:center;width:100%;height:100%;background:${dc};">
      <div style="width:4px;height:100%;background:${a};flex-shrink:0;"></div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex:1;padding:0 5%;">
        <span style="font-family:${hF};font-weight:${hw};font-size:clamp(0.56em,1.6vw,0.88em);color:${td};letter-spacing:-0.01em;">${brandName}</span>
        <div style="font-family:${bF};font-size:clamp(0.36em,0.95vw,0.56em);color:${td};opacity:0.45;flex:1;text-align:center;padding:0 5%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${shortTag}</div>
        <div style="border:1px solid ${a};color:${a};font-family:${bF};font-size:clamp(0.34em,0.82vw,0.5em);font-weight:700;padding:5% 10%;border-radius:3px;flex-shrink:0;white-space:nowrap;">Subscribe →</div>
      </div>
    </div>`,
  ];
  const email = emailVariants[vEmail];

  return `
    <div class="mockup-grid">
      ${mockupCell('mockup-frame--card',    card,    'Business Card',    'Print / stationery',              'card')}
      ${mockupCell('mockup-frame--profile', profile, 'Profile Picture',  'Instagram · LinkedIn · Google',   'profile')}
      ${mockupCell('mockup-frame--feed',    feed,    'Feed Post',        'Instagram · Facebook',            'feed')}
      ${mockupCell('mockup-frame--story',   story,   'Instagram Story',  'Stories · Reels cover',           'story')}
      ${mockupCell('mockup-frame--hero',    hero,    'Web Hero',         'Landing page',                    'hero')}
      ${mockupCell('mockup-frame--email',   email,   'Email Banner',     'Newsletter header',               'email')}
    </div>`;
}

/* ─────────────────────────────────────────────────────────────
   17. MOCKUP — PER-CELL REGEN & CODE SNIPPET MODAL
   ───────────────────────────────────────────────────────────── */

function regenMockupCell(cellId) {
  if (!kit.palette || !kit.fonts || !kit.brandData) return;
  const counts = { card: 3, profile: 2, feed: 3, story: 2, hero: 3, email: 2 };
  const count  = counts[cellId] ?? 2;
  const current = (kit.mockupVariants || {})[cellId] ?? 0;
  let next = Math.floor(Math.random() * count);
  if (next === current && count > 1) next = (next + 1) % count;
  if (!kit.mockupVariants) kit.mockupVariants = {};
  kit.mockupVariants[cellId] = next;
  document.getElementById('mockup-content').innerHTML = renderMockup(
    kit.palette, kit.fonts, { ...kit.brandData, taglines: kit.taglines }
  );
}

let _snippetCellId = null;
let _snippetCode   = '';

function showCodeSnippet(cellId) {
  _snippetCellId = cellId;
  _snippetCode   = generateSnippetHTML(cellId);
  const labels   = { card: 'Business Card', profile: 'Profile Picture', feed: 'Feed Post', story: 'Instagram Story', hero: 'Web Hero', email: 'Email Banner' };
  const contexts = { card: 'Print / stationery', profile: 'Instagram · LinkedIn · Google', feed: 'Instagram · Facebook', story: 'Stories · Reels cover', hero: 'Landing page', email: 'Newsletter header' };
  document.getElementById('code-modal-title').textContent   = labels[cellId]   || cellId;
  document.getElementById('code-modal-sub').textContent     = contexts[cellId] || '';
  document.getElementById('code-modal-code').textContent    = _snippetCode;
  document.getElementById('code-modal').hidden = false;
  document.body.style.overflow = 'hidden';
}

function closeCodeModal() {
  document.getElementById('code-modal').hidden = true;
  document.body.style.overflow = '';
}

function copyCodeSnippet() {
  navigator.clipboard.writeText(_snippetCode).then(() => {
    const btn = document.getElementById('code-copy-btn');
    const orig = btn.textContent;
    btn.textContent = 'Copied!';
    setTimeout(() => { btn.textContent = orig; }, 1800);
  });
}

function downloadCodeSnippet() {
  const labels = { card: 'business-card', profile: 'profile-picture', feed: 'feed-post', story: 'instagram-story', hero: 'web-hero', email: 'email-banner' };
  const brand  = (kit.brandData?.brandName || 'brand').toLowerCase().replace(/\s+/g, '-');
  const fname  = `${brand}-${labels[_snippetCellId] || _snippetCellId}.html`;
  const blob   = new Blob([_snippetCode], { type: 'text/html' });
  const url    = URL.createObjectURL(blob);
  const a      = Object.assign(document.createElement('a'), { href: url, download: fname });
  a.click();
  URL.revokeObjectURL(url);
}

/* ─────────────────────────────────────────────────────────────
   17b. MOCKUP — SNIPPET GENERATOR
   ───────────────────────────────────────────────────────────── */

function generateSnippetHTML(cellId) {
  if (!kit.palette || !kit.fonts || !kit.brandData) return '';
  const { brandName, taglines = [] } = kit.brandData;
  const taglineText = (taglines[0]?.text || brandName).replace(/"/g, '');
  const shortTag    = taglineText.length > 55 ? taglineText.slice(0, 55) + '…' : taglineText;
  const p  = kit.palette.primary.hex;
  const s  = kit.palette.secondary.hex;
  const a  = kit.palette.accent.hex;
  const lc = kit.palette.light.hex;
  const dc = kit.palette.dark.hex;
  const tp = textOnBg(p), ts = textOnBg(s), tl = textOnBg(lc), td = textOnBg(dc), ta = textOnBg(a);
  const hFont  = kit.fonts.heading;
  const bFont  = kit.fonts.body;
  const hw     = kit.fonts.hw;
  const v      = (kit.mockupVariants || {})[cellId] ?? 0;
  const handle = '@' + brandName.toLowerCase().replace(/\s+/g, '');
  const initials = brandName.split(/\s+/).map(w => w[0] || '').join('').slice(0, 2).toUpperCase();
  const gFonts = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(hFont)}:wght@400;700;900&family=${encodeURIComponent(bFont)}:wght@400;500;600;700&display=swap`;

  const tokens = `  :root {
    --primary:        ${p};
    --secondary:      ${s};
    --accent:         ${a};
    --light:          ${lc};
    --dark:           ${dc};
    --on-primary:     ${tp};
    --on-secondary:   ${ts};
    --on-accent:      ${ta};
    --on-light:       ${tl};
    --on-dark:        ${td};
    --font-heading:   '${hFont}', Georgia, serif;
    --font-body:      '${bFont}', system-ui, sans-serif;
    --fw-heading:     ${hw};
  }`;

  const head = (title, extra = '') => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — ${brandName}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="${gFonts}" rel="stylesheet">
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
${tokens}${extra}`;

  // ── Business Card ────────────────────────────────────────────
  if (cellId === 'card') {
    if (v === 0) return head('Business Card', `
    /* 3.5 × 2 in standard business card */
    @page { size: 3.5in 2in; margin: 0; }
    body { width: 3.5in; height: 2in; font-family: var(--font-body); }
    .card { display: flex; width: 100%; height: 100%; }
    .card__brand {
      width: 38%; background: var(--primary); color: var(--on-primary);
      display: flex; flex-direction: column; justify-content: space-between;
      padding: 0.22in 0.18in;
    }
    .card__logo { width: 18px; height: 18px; border-radius: 3px; background: var(--accent); }
    .card__name {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 18px; line-height: 1.15; letter-spacing: -0.01em;
    }
    .card__rule { width: 22px; height: 2px; background: var(--accent); border-radius: 2px; margin-top: 8px; }
    .card__detail {
      flex: 1; background: var(--light); color: var(--on-light);
      display: flex; flex-direction: column; justify-content: center;
      padding: 0.18in 0.22in;
    }
    .card__tagline { font-size: 9px; opacity: 0.55; line-height: 1.55; margin-bottom: 18px; }
    .card__url { font-size: 8px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; opacity: 0.28; }
  </style>
</head>
<body>
  <div class="card">
    <div class="card__brand">
      <div class="card__logo"></div>
      <div>
        <div class="card__name">${brandName}</div>
        <div class="card__rule"></div>
      </div>
    </div>
    <div class="card__detail">
      <p class="card__tagline">${shortTag}</p>
      <p class="card__url">${handle}.com</p>
    </div>
  </div>
</body>
</html>`);

    if (v === 1) return head('Business Card', `
    @page { size: 3.5in 2in; margin: 0; }
    body { width: 3.5in; height: 2in; font-family: var(--font-body); }
    .card {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; width: 100%; height: 100%;
      background: var(--dark); color: var(--on-dark); gap: 10px;
      text-align: center; padding: 0.2in;
    }
    .card__eyebrow {
      font-size: 7px; font-weight: 700; letter-spacing: 0.14em;
      text-transform: uppercase; color: var(--accent);
    }
    .card__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 18px; line-height: 1.15; letter-spacing: -0.02em;
    }
    .card__rule { width: 32px; height: 1px; background: var(--accent); opacity: 0.6; }
    .card__url { font-size: 7px; opacity: 0.35; letter-spacing: 0.06em; }
  </style>
</head>
<body>
  <div class="card">
    <p class="card__eyebrow">${brandName.toUpperCase()}</p>
    <h1 class="card__tagline">${shortTag}</h1>
    <div class="card__rule"></div>
    <p class="card__url">${handle}.com</p>
  </div>
</body>
</html>`);

    /* v === 2 */
    return head('Business Card', `
    @page { size: 3.5in 2in; margin: 0; }
    body { width: 3.5in; height: 2in; font-family: var(--font-body); }
    .card { display: flex; flex-direction: column; width: 100%; height: 100%; background: var(--light); }
    .card__stripe { height: 5px; background: var(--accent); }
    .card__body {
      flex: 1; display: flex; align-items: center;
      justify-content: space-between; padding: 0.16in 0.2in; color: var(--on-light);
    }
    .card__name {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 17px; letter-spacing: -0.01em; line-height: 1.15;
    }
    .card__tagline { font-size: 8px; opacity: 0.5; margin-top: 6px; }
    .card__badge {
      width: 36px; height: 36px; border-radius: 7px;
      background: var(--primary); color: var(--on-primary);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-heading); font-size: 14px; font-weight: 900;
      flex-shrink: 0;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="card__stripe"></div>
    <div class="card__body">
      <div>
        <div class="card__name">${brandName}</div>
        <p class="card__tagline">${shortTag}</p>
      </div>
      <div class="card__badge">${initials[0]}</div>
    </div>
  </div>
</body>
</html>`);
  }

  // ── Profile Picture ──────────────────────────────────────────
  if (cellId === 'profile') {
    const bg   = v === 0 ? lc : p;
    const onBg = v === 0 ? tl : tp;
    const avatarBg   = v === 0 ? p  : lc;
    const avatarText = v === 0 ? tp : p;
    return head('Profile Picture', `
    body {
      display: flex; align-items: center; justify-content: center;
      min-height: 100vh; background: #f0f0f0; font-family: var(--font-body);
    }
    /* Render at 400×400 — export/crop to a circle for social media */
    .profile {
      width: 400px; height: 400px;
      background: ${bg}; color: ${onBg};
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; gap: 24px;
    }
    .profile__avatar {
      width: 160px; height: 160px; border-radius: 50%;
      background: ${avatarBg}; color: ${avatarText};
      border: ${v === 0 ? `4px solid ${a}` : `3px solid ${a}`};
      display: flex; align-items: center; justify-content: center;
    }
    .profile__initials {
      font-family: var(--font-heading); font-weight: 900;
      font-size: 56px; line-height: 1;
    }
    .profile__name {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 22px; letter-spacing: -0.01em; text-align: center;
    }
    .profile__handle {
      font-size: 13px; font-weight: 700; letter-spacing: 0.05em;
      text-transform: uppercase; opacity: 0.4; margin-top: -16px;
    }
  </style>
</head>
<body>
  <div class="profile">
    <div class="profile__avatar">
      <span class="profile__initials">${initials}</span>
    </div>
    <div>
      <p class="profile__name">${brandName}</p>
      <p class="profile__handle">${handle}</p>
    </div>
  </div>
</body>
</html>`);
  }

  // ── Feed Post ────────────────────────────────────────────────
  if (cellId === 'feed') {
    if (v === 0) return head('Instagram Feed Post', `
    /* 1080×1080px recommended export size */
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #e5e5e5; font-family: var(--font-body); }
    .post {
      width: 540px; height: 540px;
      background: var(--light); color: var(--on-light);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .post__header { display: flex; align-items: center; gap: 10px; padding: 18px 20px 10px; }
    .post__avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--primary); color: var(--on-primary); border: 2px solid var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-heading); font-size: 12px; font-weight: 900; flex-shrink: 0;
    }
    .post__username { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
    .post__image {
      flex: 1; background: var(--primary); color: var(--on-primary);
      display: flex; align-items: center; justify-content: center; padding: 32px;
    }
    .post__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 24px; line-height: 1.2; letter-spacing: -0.01em; text-align: center;
    }
    .post__footer { display: flex; align-items: center; justify-content: space-between; padding: 12px 20px 16px; }
    .post__handle { font-size: 11px; opacity: 0.45; }
    .post__cta {
      background: var(--accent); color: var(--on-accent);
      font-size: 11px; font-weight: 700; padding: 6px 14px; border-radius: 4px;
    }
  </style>
</head>
<body>
  <div class="post">
    <header class="post__header">
      <div class="post__avatar">${initials[0]}</div>
      <span class="post__username">${brandName}</span>
    </header>
    <div class="post__image">
      <p class="post__tagline">${shortTag}</p>
    </div>
    <footer class="post__footer">
      <span class="post__handle">${handle}</span>
      <span class="post__cta">Follow</span>
    </footer>
  </div>
</body>
</html>`);

    if (v === 1) return head('Instagram Feed Post', `
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #e5e5e5; font-family: var(--font-body); }
    .post {
      width: 540px; height: 540px;
      background: var(--dark); color: var(--on-dark);
      display: flex; flex-direction: column;
    }
    .post__header { display: flex; align-items: center; gap: 10px; padding: 18px 20px 10px; }
    .post__dot { width: 22px; height: 22px; border-radius: 50%; background: var(--accent); flex-shrink: 0; }
    .post__username { font-size: 11px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: var(--accent); }
    .post__body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 8px 36px; }
    .post__quote { font-family: var(--font-heading); font-size: 80px; color: var(--accent); line-height: 0.7; margin-bottom: 12px; opacity: 0.8; }
    .post__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 22px; line-height: 1.25; letter-spacing: -0.01em;
    }
    .post__handle { padding: 8px 36px 22px; font-size: 11px; opacity: 0.35; }
  </style>
</head>
<body>
  <div class="post">
    <header class="post__header">
      <div class="post__dot"></div>
      <span class="post__username">${brandName}</span>
    </header>
    <div class="post__body">
      <div class="post__quote">"</div>
      <p class="post__tagline">${shortTag}</p>
    </div>
    <p class="post__handle">${handle}</p>
  </div>
</body>
</html>`);

    /* v === 2 */
    return head('Instagram Feed Post', `
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #e5e5e5; font-family: var(--font-body); }
    .post {
      width: 540px; height: 540px;
      background: var(--light); color: var(--on-light);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center; text-align: center; padding: 48px;
    }
    .post__rule-top, .post__rule-bottom { width: 32px; height: 3px; background: var(--accent); border-radius: 2px; }
    .post__rule-top { margin-bottom: 28px; }
    .post__rule-bottom { margin-top: 28px; }
    .post__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 24px; line-height: 1.2; letter-spacing: -0.01em;
    }
    .post__brand { font-size: 10px; font-weight: 700; letter-spacing: 0.07em; text-transform: uppercase; opacity: 0.35; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="post">
    <div class="post__rule-top"></div>
    <p class="post__tagline">${shortTag}</p>
    <div class="post__rule-bottom"></div>
    <p class="post__brand">${brandName}</p>
  </div>
</body>
</html>`);
  }

  // ── Instagram Story ──────────────────────────────────────────
  if (cellId === 'story') {
    if (v === 0) return head('Instagram Story', `
    /* 1080×1920px — export at 2× for retina */
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #e5e5e5; font-family: var(--font-body); }
    .story {
      width: 390px; height: 693px;
      background: var(--dark); color: var(--on-dark);
      display: flex; flex-direction: column;
    }
    .story__header { display: flex; align-items: center; gap: 10px; padding: 28px 24px 16px; }
    .story__avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--primary); color: var(--on-primary); border: 2px solid var(--accent);
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-heading); font-size: 11px; font-weight: 900; flex-shrink: 0;
    }
    .story__username { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; }
    .story__body { flex: 1; display: flex; flex-direction: column; justify-content: center; padding: 24px 32px; }
    .story__rule { width: 32px; height: 3px; background: var(--accent); border-radius: 2px; margin-bottom: 24px; }
    .story__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 32px; line-height: 1.2; letter-spacing: -0.015em;
    }
    .story__footer { padding-bottom: 48px; display: flex; justify-content: center; }
    .story__cta { font-size: 11px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--accent); }
  </style>
</head>
<body>
  <div class="story">
    <header class="story__header">
      <div class="story__avatar">${initials[0]}</div>
      <span class="story__username">${brandName}</span>
    </header>
    <div class="story__body">
      <div class="story__rule"></div>
      <p class="story__tagline">${shortTag}</p>
    </div>
    <footer class="story__footer">
      <span class="story__cta">Swipe up ↑</span>
    </footer>
  </div>
</body>
</html>`);

    /* v === 1 */
    return head('Instagram Story', `
    body { display: flex; align-items: center; justify-content: center; min-height: 100vh; background: #e5e5e5; font-family: var(--font-body); }
    .story {
      width: 390px; height: 693px;
      background: var(--primary); color: var(--on-primary);
      display: flex; flex-direction: column;
    }
    .story__header { display: flex; align-items: center; gap: 10px; padding: 28px 24px 16px; }
    .story__avatar {
      width: 32px; height: 32px; border-radius: 50%;
      background: var(--light); border: 2px solid transparent;
      display: flex; align-items: center; justify-content: center;
      font-family: var(--font-heading); font-size: 11px; font-weight: 900;
      flex-shrink: 0; color: var(--primary);
    }
    .story__username { font-size: 13px; font-weight: 700; letter-spacing: 0.02em; opacity: 0.85; }
    .story__body {
      flex: 1; display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      text-align: center; padding: 24px 40px;
    }
    .story__tagline {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: 32px; line-height: 1.15; letter-spacing: -0.015em;
    }
    .story__divider { width: 40px; height: 2px; background: currentColor; opacity: 0.3; margin-top: 28px; }
    .story__footer { padding-bottom: 48px; display: flex; justify-content: center; }
    .story__cta {
      background: var(--light); color: var(--on-light);
      font-size: 12px; font-weight: 700; padding: 10px 28px;
      border-radius: 40px; letter-spacing: 0.04em;
    }
  </style>
</head>
<body>
  <div class="story">
    <header class="story__header">
      <div class="story__avatar">${initials[0]}</div>
      <span class="story__username">${brandName}</span>
    </header>
    <div class="story__body">
      <p class="story__tagline">${shortTag}</p>
      <div class="story__divider"></div>
    </div>
    <footer class="story__footer">
      <span class="story__cta">Learn more →</span>
    </footer>
  </div>
</body>
</html>`);
  }

  // ── Web Hero ─────────────────────────────────────────────────
  if (cellId === 'hero') {
    if (v === 0) return head('Web Hero Section', `
    body { font-family: var(--font-body); }
    .hero { display: flex; min-height: 500px; }
    .hero__content {
      flex: 1.3; background: var(--dark); color: var(--on-dark);
      display: flex; flex-direction: column; justify-content: center;
      padding: 80px 72px;
    }
    .hero__eyebrow {
      font-size: 11px; font-weight: 700; letter-spacing: 0.11em;
      text-transform: uppercase; color: var(--accent); margin-bottom: 20px;
    }
    .hero__heading {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: clamp(28px, 3.5vw, 48px); line-height: 1.15;
      letter-spacing: -0.02em; margin-bottom: 32px;
    }
    .hero__actions { display: flex; gap: 12px; flex-wrap: wrap; }
    .btn {
      font-family: var(--font-body); font-size: 14px; font-weight: 700;
      padding: 14px 28px; border-radius: 4px; text-decoration: none; cursor: pointer;
    }
    .btn--primary { background: var(--accent); color: var(--on-accent); border: none; }
    .btn--ghost { background: transparent; color: var(--on-dark); border: 1.5px solid rgba(255,255,255,0.25); }
    .hero__visual { flex: 0.7; background: var(--primary); }
  </style>
</head>
<body>
  <section class="hero">
    <div class="hero__content">
      <p class="hero__eyebrow">${brandName}</p>
      <h1 class="hero__heading">${shortTag}</h1>
      <div class="hero__actions">
        <a href="#" class="btn btn--primary">Get started</a>
        <a href="#" class="btn btn--ghost">Learn more</a>
      </div>
    </div>
    <div class="hero__visual" aria-hidden="true"></div>
  </section>
</body>
</html>`);

    if (v === 1) return head('Web Hero Section', `
    body { font-family: var(--font-body); }
    .hero {
      display: flex; flex-direction: column; align-items: center;
      justify-content: center; min-height: 500px; text-align: center;
      background: var(--light); color: var(--on-light); padding: 80px 48px;
    }
    .hero__eyebrow {
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; color: var(--accent); margin-bottom: 20px;
    }
    .hero__heading {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: clamp(28px, 3.5vw, 52px); line-height: 1.12;
      letter-spacing: -0.02em; max-width: 700px; margin: 0 auto 36px;
    }
    .hero__actions { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
    .btn {
      font-family: var(--font-body); font-size: 14px; font-weight: 700;
      padding: 14px 28px; border-radius: 4px; text-decoration: none; cursor: pointer;
    }
    .btn--primary { background: var(--primary); color: var(--on-primary); border: none; }
    .btn--outline { background: transparent; color: var(--on-light); border: 1.5px solid var(--primary); }
  </style>
</head>
<body>
  <section class="hero">
    <p class="hero__eyebrow">${brandName}</p>
    <h1 class="hero__heading">${shortTag}</h1>
    <div class="hero__actions">
      <a href="#" class="btn btn--primary">Get started</a>
      <a href="#" class="btn btn--outline">Learn more</a>
    </div>
  </section>
</body>
</html>`);

    /* v === 2 */
    return head('Web Hero Section', `
    body { font-family: var(--font-body); }
    .hero {
      display: flex; min-height: 500px;
      background: var(--accent); color: var(--on-accent);
    }
    .hero__content {
      flex: 1.4; display: flex; flex-direction: column;
      justify-content: center; padding: 80px 72px;
    }
    .hero__eyebrow {
      font-size: 11px; font-weight: 700; letter-spacing: 0.12em;
      text-transform: uppercase; opacity: 0.6; margin-bottom: 20px;
    }
    .hero__heading {
      font-family: var(--font-heading); font-weight: var(--fw-heading);
      font-size: clamp(28px, 3.5vw, 48px); line-height: 1.15;
      letter-spacing: -0.02em; margin-bottom: 32px;
    }
    .btn--primary {
      display: inline-block; background: var(--on-accent); color: var(--accent);
      font-family: var(--font-body); font-size: 14px; font-weight: 700;
      padding: 14px 28px; border-radius: 4px; text-decoration: none; cursor: pointer;
    }
    .hero__decor {
      flex: 0.6; display: flex; align-items: center; justify-content: center;
    }
    .hero__circle {
      width: 260px; height: 260px; border-radius: 50%;
      background: var(--on-accent); opacity: 0.08;
    }
  </style>
</head>
<body>
  <section class="hero">
    <div class="hero__content">
      <p class="hero__eyebrow">${brandName}</p>
      <h1 class="hero__heading">${shortTag}</h1>
      <a href="#" class="btn--primary">Get started</a>
    </div>
    <div class="hero__decor" aria-hidden="true">
      <div class="hero__circle"></div>
    </div>
  </section>
</body>
</html>`);
  }

  // ── Email Banner ─────────────────────────────────────────────
  if (cellId === 'email') {
    if (v === 0) return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Banner — ${brandName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'${bFont}',Arial,sans-serif;">
  <!-- Email banner: 600px wide, ~80px tall. Paste into email template. -->
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center"
         style="background:${s};border-radius:8px;overflow:hidden;">
    <tr>
      <!-- Logo + name -->
      <td width="200" style="padding:20px 20px 20px 24px;vertical-align:middle;">
        <table role="presentation" cellspacing="0" cellpadding="0" border="0">
          <tr>
            <td style="vertical-align:middle;padding-right:10px;">
              <div style="width:22px;height:22px;border-radius:4px;background:${p};"></div>
            </td>
            <td style="vertical-align:middle;">
              <span style="font-family:'${hFont}',Georgia,serif;font-weight:${hw};font-size:16px;color:${ts};letter-spacing:-0.01em;">${brandName}</span>
            </td>
          </tr>
        </table>
      </td>
      <!-- Tagline -->
      <td style="padding:20px 16px;vertical-align:middle;text-align:center;">
        <span style="font-family:'${bFont}',Arial,sans-serif;font-size:13px;color:${ts};opacity:0.6;">${shortTag}</span>
      </td>
      <!-- CTA -->
      <td width="140" style="padding:20px 24px 20px 16px;vertical-align:middle;text-align:right;">
        <a href="#" style="background:${a};color:${ta};font-family:'${bFont}',Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:4px;display:inline-block;">Subscribe →</a>
      </td>
    </tr>
  </table>
</body>
</html>`;

    /* v === 1 */
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Email Banner — ${brandName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:'${bFont}',Arial,sans-serif;">
  <!-- Email banner: 600px wide, ~80px tall. Paste into email template. -->
  <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" align="center"
         style="background:${dc};border-radius:8px;overflow:hidden;">
    <tr>
      <!-- Accent stripe -->
      <td width="4" style="background:${a};padding:0;line-height:0;" aria-hidden="true">&nbsp;</td>
      <!-- Brand name -->
      <td width="180" style="padding:20px 20px 20px 20px;vertical-align:middle;">
        <span style="font-family:'${hFont}',Georgia,serif;font-weight:${hw};font-size:16px;color:${td};letter-spacing:-0.01em;">${brandName}</span>
      </td>
      <!-- Tagline -->
      <td style="padding:20px 16px;vertical-align:middle;text-align:center;">
        <span style="font-family:'${bFont}',Arial,sans-serif;font-size:13px;color:${td};opacity:0.45;">${shortTag}</span>
      </td>
      <!-- CTA -->
      <td width="150" style="padding:20px 24px 20px 16px;vertical-align:middle;text-align:right;">
        <a href="#" style="border:1px solid ${a};color:${a};font-family:'${bFont}',Arial,sans-serif;font-size:12px;font-weight:700;text-decoration:none;padding:10px 18px;border-radius:4px;display:inline-block;">Subscribe →</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
  }

  return `<!-- No snippet available for "${cellId}" -->`;
}

/* ─────────────────────────────────────────────────────────────
   18. RENDER — CONTENT STRATEGY
   ───────────────────────────────────────────────────────────── */

function renderStrategy(strategy) {
  const pillars = strategy.pillars.map(p => `
    <div class="pillar-card">
      <div class="pillar-card-head">
        <span class="pillar-emoji">${p.emoji}</span>
        <div>
          <div class="pillar-name">${p.name}</div>
          <span class="pillar-goal">${p.goal}</span>
        </div>
      </div>
      <div class="pillar-desc">${p.desc}</div>
    </div>`).join('');

  const channels = strategy.channels.map(c => `
    <div class="channel-card">
      <span class="channel-fit-badge ${c.fit}">${c.fit}</span>
      <div class="channel-body">
        <div class="channel-name">${c.name}</div>
        <div class="channel-freq">${c.freq}</div>
        <div class="channel-rationale">${c.rationale}</div>
        <div class="channel-formats">${c.formats.map(f => `<span class="format-tag">${f}</span>`).join('')}</div>
      </div>
    </div>`).join('');

  const tips = strategy.postingTips.map(t => `<div class="posting-tip">${t}</div>`).join('');

  return `
    <div class="strategy-section-title">Content pillars</div>
    <div class="pillars-grid">${pillars}</div>

    <div class="strategy-section-title">Recommended channels</div>
    <div class="channels-list">${channels}</div>

    <div class="strategy-section-title">Posting tone guidance</div>
    <div class="tone-guidance-block">${strategy.toneGuidance}</div>

    <div class="strategy-section-title">Quick-win tactics</div>
    <div class="posting-tips">${tips}</div>`;
}

/* ─────────────────────────────────────────────────────────────
   18. APP STATE
   ───────────────────────────────────────────────────────────── */

const kit = {
  brandData:     null,
  palette:       null,
  fonts:         null,
  voice:         null,
  taglines:      [],
  activeTagline: 0,
  strategy:      null,
  wordmark:      null,
};

/* ─────────────────────────────────────────────────────────────
   19. SECTION REGENERATION
   ───────────────────────────────────────────────────────────── */

function regenSection(section) {
  const guidance = (document.getElementById(`${section}-guidance`)?.value || '').trim();
  const bd = kit.brandData;

  switch (section) {
    case 'palette': {
      kit.palette = applyPaletteGuidance(kit.palette, guidance, bd);
      document.getElementById('palette-content').innerHTML = renderPalette(kit.palette);
      // Refresh mockup too (palette change affects it)
      document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...bd, taglines: kit.taglines });
      break;
    }
    case 'typography': {
      const newFonts = selectFontPairing(bd, guidance);
      kit.fonts = newFonts;
      document.getElementById('typography-content').innerHTML = renderTypography(newFonts, { ...bd, taglines: kit.taglines });
      document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...bd, taglines: kit.taglines });
      break;
    }
    case 'voice': {
      kit.voice = generateBrandVoice(bd, guidance);
      document.getElementById('voice-content').innerHTML = renderVoice(kit.voice);
      break;
    }
    case 'tagline': {
      kit.taglines = generateTaglines(bd, guidance);
      kit.activeTagline = 0;
      document.getElementById('tagline-content').innerHTML = renderTagline(kit.taglines, 0);
      // Refresh mockup tagline
      document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...bd, taglines: kit.taglines });
      break;
    }
    case 'mockup': {
      kit.mockupVariants = null; // pick fresh random layouts
      document.getElementById('mockup-content').innerHTML = renderMockup(kit.palette, kit.fonts, { ...bd, taglines: kit.taglines });
      break;
    }
    case 'strategy': {
      kit.strategy = generateContentStrategy(bd, guidance);
      document.getElementById('strategy-content').innerHTML = renderStrategy(kit.strategy);
      break;
    }
    case 'wordmark': {
      kit.wordmark = generateWordmark({ ...bd, taglines: kit.taglines }, kit.fonts, kit.palette);
      document.getElementById('wordmark-content').innerHTML = renderWordmark(kit.wordmark);
      break;
    }
  }
  closeEdit(`${section}-edit`);
}

function closeEdit(panelId) {
  const panel = document.getElementById(panelId);
  if (panel) panel.hidden = true;
  // Reset toggle button state
  const section = panelId.replace('-edit', '');
  const btn = document.querySelector(`.edit-btn[data-target="${panelId}"]`);
  if (btn) { btn.classList.remove('active'); btn.setAttribute('aria-expanded', 'false'); }
}

/* ─────────────────────────────────────────────────────────────
   20. MAIN GENERATOR
   ───────────────────────────────────────────────────────────── */

function getBrandData() {
  const archetypeEl = document.querySelector('.archetype-card.selected');
  return {
    brandName:   document.getElementById('brand-name').value.trim(),
    industry:    document.getElementById('industry').value,
    description: document.getElementById('description').value.trim(),
    whatDoes:    document.getElementById('what-does').value.trim(),
    audience:    document.getElementById('audience').value.trim(),
    toneWords:   document.getElementById('tone').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    avoid:       document.getElementById('avoid').value.trim(),
    archetype:   archetypeEl?.dataset.archetype || '',
    formality:   parseInt(document.getElementById('slider-formality')?.value ?? 50, 10),
    enthusiasm:  parseInt(document.getElementById('slider-enthusiasm')?.value ?? 50, 10),
  };
}

function setLoadingLabel(text) {
  const el = document.getElementById('loading-label');
  if (el) el.textContent = text;
}

async function generateKit(brandData) {
  kit.brandData = brandData;

  // Show output section in loading state
  const outputSection = document.getElementById('output-section');
  const loadingState  = document.getElementById('loading-state');
  const results       = document.getElementById('results');
  outputSection.hidden = false;
  loadingState.hidden  = false;
  results.hidden       = true;
  outputSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Step 1: Extract colors
  setLoadingLabel('Extracting palette from photos…');
  await new Promise(r => setTimeout(r, 60));
  const extracted = await extractColorsFromUploadedImages();

  // Step 2: Palette
  setLoadingLabel('Building color palette…');
  await new Promise(r => setTimeout(r, 60));
  kit.palette = extracted.length >= 2
    ? buildPaletteFromExtracted(extracted, brandData)
    : generatePaletteFromIndustry(brandData.industry, brandData.toneWords, '', brandData.archetype);

  // Step 3: Fonts
  setLoadingLabel('Selecting typography…');
  await new Promise(r => setTimeout(r, 40));
  kit.fonts = selectFontPairing(brandData);

  // Step 4: Voice + Taglines + Strategy
  setLoadingLabel('Generating brand voice & content strategy…');
  await new Promise(r => setTimeout(r, 60));
  kit.voice    = generateBrandVoice(brandData);
  kit.taglines = generateTaglines(brandData);
  kit.activeTagline = 0;
  kit.strategy = generateContentStrategy(brandData);

  // Step 5: Render
  setLoadingLabel('Rendering your brand kit…');
  await new Promise(r => setTimeout(r, 40));

  document.getElementById('results-brand-name').textContent = brandData.brandName || 'Your Brand';
  document.getElementById('results-summary').textContent    = brandData.description || '';

  document.getElementById('palette-content').innerHTML    = renderPalette(kit.palette);
  document.getElementById('typography-content').innerHTML = renderTypography(kit.fonts, { ...brandData, taglines: kit.taglines });
  document.getElementById('voice-content').innerHTML      = renderVoice(kit.voice);
  document.getElementById('tagline-content').innerHTML    = renderTagline(kit.taglines, 0);
  document.getElementById('strategy-content').innerHTML   = renderStrategy(kit.strategy);

  // Mockup + wordmark need fonts — short wait for load
  await document.fonts.ready;
  kit.mockupVariants = null; // fresh random layouts on each full generation
  document.getElementById('mockup-content').innerHTML = renderMockup(
    kit.palette, kit.fonts, { ...brandData, taglines: kit.taglines }
  );

  kit.wordmark = generateWordmark({ ...brandData, taglines: kit.taglines }, kit.fonts, kit.palette);
  document.getElementById('wordmark-content').innerHTML = renderWordmark(kit.wordmark);

  loadingState.hidden = true;
  results.hidden      = false;
  switchTab('palette');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ─────────────────────────────────────────────────────────────
   21. RANDOMIZER
   ───────────────────────────────────────────────────────────── */

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function generateRandomData() {
  const industries = Object.keys(RAND.byIndustry);
  const industry   = pick(industries);
  const tmpl       = RAND.byIndustry[industry];
  const brandName  = `${pick(RAND.adj)} ${pick(RAND.noun)}`;
  const desc       = tmpl.desc.replace('{WHAT}', tmpl.what).replace('{WHO}', 'people');

  // Map industry to a likely archetype
  const industryArchetypeMap = {
    'technology': 'competence', 'food-beverage': 'sincerity', 'health-wellness': 'sincerity',
    'fashion-beauty': 'sophistication', 'finance': 'competence', 'education': 'sincerity',
    'arts-entertainment': 'excitement', 'real-estate': 'competence', 'travel-hospitality': 'excitement',
    'nonprofit': 'sincerity', 'retail': 'excitement', 'professional-services': 'competence',
  };
  const archetype = industryArchetypeMap[industry] || pick(Object.keys(ARCHETYPES));
  const arch = ARCHETYPES[archetype];

  return {
    brandName,
    industry,
    description: desc,
    whatDoes:    desc + ' We take pride in craft over convenience and community over scale.',
    audience:    tmpl.audience,
    toneWords:   tmpl.tone.split(',').map(s => s.trim()),
    avoid:       RAND.avoid[industry] || 'generic, corporate, impersonal',
    archetype,
    formality:   arch.formality,
    enthusiasm:  arch.enthusiasm,
  };
}

function fillForm(data) {
  document.getElementById('brand-name').value  = data.brandName  || '';
  document.getElementById('industry').value    = data.industry   || '';
  document.getElementById('description').value = data.description|| '';
  document.getElementById('what-does').value   = data.whatDoes   || '';
  document.getElementById('audience').value    = data.audience   || '';
  document.getElementById('tone').value        = Array.isArray(data.toneWords) ? data.toneWords.join(', ') : (data.tone || '');
  document.getElementById('avoid').value       = data.avoid      || '';
  // Archetype card
  document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
  if (data.archetype) {
    document.querySelector(`.archetype-card[data-archetype="${data.archetype}"]`)?.classList.add('selected');
  }
  // Tone sliders
  if (data.formality  !== undefined) { const s = document.getElementById('slider-formality');  if (s) { s.value = data.formality;  updateSliderLabel('formality',  data.formality);  } }
  if (data.enthusiasm !== undefined) { const s = document.getElementById('slider-enthusiasm'); if (s) { s.value = data.enthusiasm; updateSliderLabel('enthusiasm', data.enthusiasm); } }
}

/* ─────────────────────────────────────────────────────────────
   22. DEMO MODE
   ───────────────────────────────────────────────────────────── */

async function loadDemo() {
  // Fill form
  fillForm({ ...DEMO, toneWords: DEMO.tone.split(',').map(s => s.trim()) });

  // Load demo photos into the preview area
  clearPhotos();
  const previewEl = document.getElementById('photo-previews');
  document.getElementById('drop-idle').hidden = true;
  previewEl.hidden = false;

  let loadedCount = 0;
  for (const src of DEMO.photos) {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.className   = 'thumb-img';
    img.style.cssText = 'display:none';
    await new Promise(res => {
      img.onload  = res;
      img.onerror = res; // continue even if photo missing
      img.src = src;
    });
    if (img.naturalWidth > 0) {
      addPhotoThumb(img.src, img);
      loadedCount++;
    }
  }
  if (loadedCount === 0) {
    document.getElementById('drop-idle').hidden = false;
    previewEl.hidden = true;
  }

  // Auto-generate
  await generateKit({ ...DEMO, toneWords: DEMO.tone.split(',').map(s => s.trim()) });
}

function updateSliderLabel(type, val) {
  const el = document.getElementById(`slider-${type}-label`);
  if (!el) return;
  if (type === 'formality') {
    const pct = parseInt(val, 10);
    el.textContent = pct < 25 ? 'Very formal' : pct < 45 ? 'Formal' : pct < 55 ? 'Balanced' : pct < 75 ? 'Casual' : 'Very casual';
  } else {
    const pct = parseInt(val, 10);
    el.textContent = pct < 25 ? 'Very measured' : pct < 45 ? 'Measured' : pct < 55 ? 'Balanced' : pct < 75 ? 'Enthusiastic' : 'Very enthusiastic';
  }
}

/* ─────────────────────────────────────────────────────────────
   PHOTO UPLOAD HANDLING
   ───────────────────────────────────────────────────────────── */

const uploadedImages = []; // hidden img elements with loaded pixel data

function addPhotoThumb(src, imgEl) {
  if (uploadedImages.length >= 3) return;

  const previewEl = document.getElementById('photo-previews');
  const idleEl    = document.getElementById('drop-idle');

  // Store hidden img for color extraction
  const hidden = imgEl || new Image();
  if (!imgEl) { hidden.src = src; hidden.className = 'thumb-img'; }
  hidden.style.cssText = 'position:absolute;width:1px;height:1px;opacity:0;pointer-events:none;';
  document.body.appendChild(hidden);
  uploadedImages.push(hidden);

  // Visible thumb
  const thumb = document.createElement('div');
  thumb.className = 'photo-thumb';
  const visImg = document.createElement('img');
  visImg.src = src; visImg.alt = '';
  const removeBtn = document.createElement('button');
  removeBtn.className = 'photo-thumb-remove';
  removeBtn.textContent = '×';
  removeBtn.title = 'Remove photo';
  const idx = uploadedImages.length - 1;
  removeBtn.onclick = () => removePhoto(idx, thumb, hidden);
  thumb.appendChild(visImg);
  thumb.appendChild(removeBtn);
  previewEl.appendChild(thumb);

  idleEl.hidden   = true;
  previewEl.hidden = false;
}

function removePhoto(idx, thumbEl, hiddenEl) {
  thumbEl.remove();
  hiddenEl.remove();
  uploadedImages.splice(idx, 1);
  // Re-index remaining remove buttons
  document.querySelectorAll('.photo-thumb-remove').forEach((btn, i) => {
    const newHidden = uploadedImages[i];
    const newThumb  = btn.closest('.photo-thumb');
    btn.onclick = () => removePhoto(i, newThumb, newHidden);
  });
  if (uploadedImages.length === 0) {
    document.getElementById('drop-idle').hidden   = false;
    document.getElementById('photo-previews').hidden = true;
  }
}

function clearPhotos() {
  uploadedImages.forEach(el => el.remove());
  uploadedImages.length = 0;
  const prev = document.getElementById('photo-previews');
  prev.innerHTML = '';
  prev.hidden    = true;
  document.getElementById('drop-idle').hidden = false;
}

function handleFiles(files) {
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  Array.from(files).slice(0, 3 - uploadedImages.length).forEach(file => {
    if (!allowed.includes(file.type)) return;
    const reader = new FileReader();
    reader.onload = e => addPhotoThumb(e.target.result);
    reader.readAsDataURL(file);
  });
}

/* ─────────────────────────────────────────────────────────────
   24. PDF EXPORT
   ───────────────────────────────────────────────────────────── */

async function exportPDF() {
  const btn = document.getElementById('download-btn');
  btn.textContent = 'Preparing PDF…';
  btn.disabled = true;

  // Lazy-load html2canvas + jsPDF
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

  try {
    await document.fonts.ready;
    // Show all tab panels and hide UI chrome for clean capture
    const panels = document.querySelectorAll('.tab-panel');
    panels.forEach(p => { p.dataset.wasHidden = p.hidden; p.hidden = false; });
    document.querySelectorAll('.edit-panel,.edit-btn,.tab-bar-wrap,.panel-nav,.results-header-actions,.section-badge').forEach(el => {
      el.dataset.wasHidden = el.hidden || '';
      el.hidden = true;
    });

    const resultsEl = document.getElementById('results');
    const canvas = await window.html2canvas(resultsEl, {
      scale: 2,
      useCORS: true,
      backgroundColor: '#FAF9F7',
      logging: false,
    });

    // Restore UI
    panels.forEach(p => { p.hidden = p.dataset.wasHidden === 'true'; delete p.dataset.wasHidden; });
    document.querySelectorAll('[data-was-hidden]').forEach(el => {
      el.hidden = el.dataset.wasHidden === 'true';
      delete el.dataset.wasHidden;
    });
    switchTab(activeTab);

    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pdfW = pdf.internal.pageSize.getWidth();
    const pdfH = pdf.internal.pageSize.getHeight();
    const imgW = pdfW;
    const imgH = (canvas.height / canvas.width) * imgW;
    const pageCount = Math.ceil(imgH / pdfH);

    for (let page = 0; page < pageCount; page++) {
      if (page > 0) pdf.addPage();
      pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, -(page * pdfH), imgW, imgH);
    }

    const filename = (kit.brandData?.brandName || 'Brandkit').replace(/[^a-z0-9]/gi, '-').toLowerCase() + '-brand-kit.pdf';
    pdf.save(filename);
  } catch (err) {
    console.error('PDF export failed:', err);
    alert('PDF export encountered an issue. Try using File → Print → Save as PDF instead.');
  }

  btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"/></svg> Download PDF`;
  btn.disabled = false;
}

function loadScript(src) {
  if (document.querySelector(`script[src="${src}"]`)) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

/* ─────────────────────────────────────────────────────────────
   25. TAB NAVIGATION
   ───────────────────────────────────────────────────────────── */

const TAB_ORDER = ['palette', 'typography', 'voice', 'tagline', 'mockup', 'strategy', 'wordmark'];
let activeTab = 'palette';

function switchTab(tabId) {
  if (!TAB_ORDER.includes(tabId)) return;
  activeTab = tabId;

  // Update tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    const isActive = btn.dataset.tab === tabId;
    btn.classList.toggle('active', isActive);
    btn.setAttribute('aria-selected', String(isActive));
  });

  // Show/hide panels
  TAB_ORDER.forEach(id => {
    const panel = document.getElementById(`panel-${id}`);
    if (panel) panel.hidden = id !== tabId;
  });

  // Update prev/next state
  const idx = TAB_ORDER.indexOf(tabId);
  const prevBtn = document.getElementById('prev-tab-btn');
  const nextBtn = document.getElementById('next-tab-btn');
  if (prevBtn) prevBtn.disabled = idx === 0;
  if (nextBtn) nextBtn.disabled = idx === TAB_ORDER.length - 1;
  const countEl = document.getElementById('panel-nav-count');
  if (countEl) countEl.textContent = `${idx + 1} / ${TAB_ORDER.length}`;

  // Scroll tab button into view (for mobile overflow)
  document.querySelector(`.tab-btn[data-tab="${tabId}"]`)?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });

  // Close any open edit panel
  document.querySelectorAll('.edit-panel').forEach(p => p.hidden = true);
  document.querySelectorAll('.edit-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); });
}

/* ─────────────────────────────────────────────────────────────
   26. EVENT LISTENERS
   ───────────────────────────────────────────────────────────── */

document.addEventListener('DOMContentLoaded', () => {

  // Generate button
  document.getElementById('generate-btn').addEventListener('click', async () => {
    const bd = getBrandData();
    if (!bd.brandName) {
      document.getElementById('brand-name').focus();
      document.getElementById('brand-name').style.borderColor = '#e55';
      setTimeout(() => { document.getElementById('brand-name').style.borderColor = ''; }, 2000);
      return;
    }
    if (!bd.industry) {
      document.getElementById('industry').focus();
      return;
    }
    await generateKit(bd);
  });

  // Randomize button
  document.getElementById('randomize-btn').addEventListener('click', async () => {
    clearPhotos();
    const rd = generateRandomData();
    fillForm(rd);
    await generateKit(rd);
  });

  // Demo button
  document.getElementById('demo-btn').addEventListener('click', () => loadDemo());

  // Archetype cards
  document.addEventListener('click', e => {
    const card = e.target.closest('.archetype-card');
    if (!card) return;
    document.querySelectorAll('.archetype-card').forEach(c => c.classList.remove('selected'));
    card.classList.toggle('selected', true);
    // Pre-fill sliders from archetype defaults
    const archId = card.dataset.archetype;
    const arch = ARCHETYPES[archId];
    if (arch) {
      const fs = document.getElementById('slider-formality');
      const es = document.getElementById('slider-enthusiasm');
      if (fs) { fs.value = arch.formality;  updateSliderLabel('formality',  arch.formality);  }
      if (es) { es.value = arch.enthusiasm; updateSliderLabel('enthusiasm', arch.enthusiasm); }
    }
  });

  // Tone sliders
  ['formality','enthusiasm'].forEach(type => {
    document.getElementById(`slider-${type}`)?.addEventListener('input', e => updateSliderLabel(type, e.target.value));
  });

  // Photo browse
  document.getElementById('photo-browse-btn').addEventListener('click', e => {
    e.stopPropagation();
    document.getElementById('photo-input').click();
  });

  document.getElementById('photo-input').addEventListener('change', e => {
    handleFiles(e.target.files);
    e.target.value = '';
  });

  // Drop zone
  const dropZone = document.getElementById('drop-zone');
  dropZone.addEventListener('click', () => {
    if (uploadedImages.length < 3) document.getElementById('photo-input').click();
  });
  dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragging'); });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragging'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
    handleFiles(e.dataTransfer.files);
  });
  dropZone.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); document.getElementById('photo-input').click(); }
  });

  // Tab bar clicks (delegated — works for dynamically-rendered tabs too)
  document.getElementById('tab-bar')?.addEventListener('click', e => {
    const btn = e.target.closest('.tab-btn');
    if (btn?.dataset.tab) switchTab(btn.dataset.tab);
  });

  // Prev / Next
  document.getElementById('prev-tab-btn')?.addEventListener('click', () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx > 0) switchTab(TAB_ORDER[idx - 1]);
  });
  document.getElementById('next-tab-btn')?.addEventListener('click', () => {
    const idx = TAB_ORDER.indexOf(activeTab);
    if (idx < TAB_ORDER.length - 1) switchTab(TAB_ORDER[idx + 1]);
  });

  // Edit toggle buttons (delegated — panels are inside dynamically shown tabs)
  document.addEventListener('click', e => {
    const btn = e.target.closest('.edit-btn');
    if (!btn) return;
    const targetId = btn.dataset.target;
    const panel    = document.getElementById(targetId);
    if (!panel) return;
    const isOpen = !panel.hidden;
    document.querySelectorAll('.edit-panel').forEach(p => p.hidden = true);
    document.querySelectorAll('.edit-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-expanded', 'false'); });
    if (!isOpen) {
      panel.hidden = false;
      btn.classList.add('active');
      btn.setAttribute('aria-expanded', 'true');
      panel.querySelector('.edit-input')?.focus();
    }
  });

  // Enter key in edit inputs triggers regeneration (delegated)
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const input = e.target.closest('.edit-input');
    if (!input) return;
    const section = input.id.replace('-guidance', '');
    regenSection(section);
  });

  // PDF download
  document.getElementById('download-btn').addEventListener('click', exportPDF);

  // Reset
  document.getElementById('reset-btn').addEventListener('click', () => {
    document.getElementById('output-section').hidden = true;
    document.getElementById('input-section').scrollIntoView({ behavior: 'smooth' });
    clearPhotos();
  });

});
