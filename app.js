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
  { id: 'editorial',  heading: 'Playfair Display', body: 'Lato',              hw: '700', bw: '400', desc: 'Elegant serif headings with clean humanist body text.', keywords: ['elegant','luxury','editorial','sophisticated','premium','fashion','boutique','artisan','refined'], industries: ['fashion-beauty','arts-entertainment','food-beverage'] },
  { id: 'bold',       heading: 'Oswald',            body: 'Merriweather',      hw: '700', bw: '400', desc: 'Condensed sans headings with solid slab-serif body — strong and readable.', keywords: ['bold','strong','powerful','impactful','energetic','assertive','direct'], industries: ['sports','fitness','construction'] },
  { id: 'modern',     heading: 'Montserrat',        body: 'Open Sans',         hw: '700', bw: '400', desc: 'Geometric sans-serif throughout — modern, neutral, universal.', keywords: ['modern','clean','professional','corporate','neutral','polished'], industries: ['technology','finance','consulting','professional-services'] },
  { id: 'friendly',   heading: 'Nunito',            body: 'Nunito Sans',       hw: '700', bw: '400', desc: 'Rounded letterforms that feel warm, welcoming, and approachable.', keywords: ['friendly','approachable','playful','warm','cheerful','fun','community','inclusive'], industries: ['education','nonprofit','children'] },
  { id: 'artisan',    heading: 'Cormorant Garamond',body: 'Proza Libre',       hw: '700', bw: '400', desc: 'Refined old-style serifs — artisan character with excellent readability.', keywords: ['artisan','craft','traditional','heritage','organic','natural','honest','earthy'], industries: ['food-beverage','health-wellness'] },
  { id: 'tech',       heading: 'IBM Plex Sans',     body: 'IBM Plex Mono',     hw: '600', bw: '400', desc: 'Systematic type system — precise, technical, trustworthy.', keywords: ['technical','precise','systematic','developer','engineering','data','code'], industries: ['technology'] },
  { id: 'creative',   heading: 'Raleway',           body: 'Source Sans 3',     hw: '700', bw: '400', desc: 'Art-deco inspired headings with clear, open body text.', keywords: ['creative','artistic','expressive','design','agency','photography','unconventional'], industries: ['design','agency','arts-entertainment'] },
  { id: 'startup',    heading: 'Inter',             body: 'Inter',             hw: '700', bw: '400', desc: 'Optimised for screens — clean, functional, efficient.', keywords: ['startup','digital','functional','efficient','innovative','saas','minimal'], industries: ['technology','retail'] },
  { id: 'classic',    heading: 'Libre Baskerville', body: 'Source Sans 3',     hw: '700', bw: '400', desc: 'Classic serif heading with modern sans body — timeless and trustworthy.', keywords: ['classic','trustworthy','academic','established','reliable','authoritative'], industries: ['education','finance','real-estate','professional-services'] },
  { id: 'geometric',  heading: 'Josefin Sans',      body: 'Josefin Slab',      hw: '700', bw: '400', desc: 'Geometric pair with 1920s art-deco character — structured and stylish.', keywords: ['geometric','vintage','retro','architectural','structured','distinctive'], industries: ['real-estate','travel-hospitality','fashion-beauty'] },
];

/* ─────────────────────────────────────────────────────────────
   4. INDUSTRY BASE HUES + CONTENT STRATEGY DATA
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
  if (!secondary) secondary = lighten(primary, 18);
  if (!accent)    accent    = complementary(primary);
  // Nudge accent to be more vibrant
  const aHsl = hexToHsl(accent);
  accent = hslToHex(aHsl.h, Math.max(aHsl.s, 60), Math.min(Math.max(aHsl.l, 35), 55));

  return assemblePalette(primary, secondary, accent, brandData);
}

function generatePaletteFromIndustry(industry, toneWords, guidance = '') {
  const toneStr = (toneWords.join(' ') + ' ' + guidance).toLowerCase();
  let baseH = INDUSTRY_BASE_HUES[industry] ?? 210;
  let sat   = 62, lit = 44;

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

  const primary   = hslToHex(baseH, sat, lit);
  const secondary = hslToHex((baseH + 28) % 360, sat - 14, lit + 12);
  const accent    = hslToHex((baseH + 180) % 360, sat + 8, lit);

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
  const primaryHex = currentPalette.primary.hex;
  const { h, s, l } = hexToHsl(primaryHex);
  const newPrimary  = hslToHex(h, s, l); // start point
  // generatePaletteFromIndustry re-parses guidance keywords
  return generatePaletteFromIndustry(brandData.industry, brandData.toneWords, guidance);
}

/* ─────────────────────────────────────────────────────────────
   8. FONT SELECTION
   ───────────────────────────────────────────────────────────── */

function selectFontPairing(brandData, guidance = '') {
  const { toneWords = [], industry = '' } = brandData;
  const words = [...toneWords, ...(guidance.toLowerCase().split(/\W+/))];
  const scores = FONT_PAIRINGS.map(pair => {
    let score = 0;
    words.forEach(w => { if (pair.keywords.includes(w)) score += 3; });
    if (pair.industries.includes(industry)) score += 4;
    return { pair, score };
  });
  scores.sort((a, b) => b.score - a.score);
  return scores[0].pair;
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
  bold:          { desc: 'Direct and confident in every claim', not: 'not aggressive or dismissive' },
  warm:          { desc: 'Speaks like a trusted friend, not a vendor', not: 'not cloying or overly familiar' },
  professional:  { desc: 'Polished and credible in all communications', not: 'not stuffy or inaccessible' },
  playful:       { desc: 'Light-hearted and creative in tone', not: 'not juvenile or unserious' },
  elegant:       { desc: 'Refined and intentional in word choice', not: 'not pretentious or cold' },
  honest:        { desc: 'Transparent and straightforward about what we offer', not: 'not blunt or harsh' },
  energetic:     { desc: 'Enthusiastic and active in phrasing', not: 'not frantic or overwhelming' },
  calm:          { desc: 'Measured and reassuring in all contexts', not: 'not flat or emotionless' },
  authoritative: { desc: 'Expert-led, evidence-backed messaging', not: 'not preachy or condescending' },
  creative:      { desc: 'Unexpected angles and fresh perspectives', not: 'not confusing or inaccessible' },
  trustworthy:   { desc: 'Consistent, accurate, and reliable messaging', not: 'not boring or corporate' },
  luxurious:     { desc: 'Elevated and aspirational language', not: 'not ostentatious or exclusionary' },
  organic:       { desc: 'Natural, earthy language that feels unforced', not: 'not preachy or greenwashing' },
  minimal:       { desc: 'Every word earns its place — no filler', not: 'not terse or cold' },
  approachable:  { desc: 'Accessible language everyone can understand', not: 'not dumbed-down' },
  sophisticated: { desc: 'Intelligent and nuanced communication', not: 'not inaccessible or elitist' },
  friendly:      { desc: 'Inviting and genuine across all touchpoints', not: 'not fake-cheerful' },
  technical:     { desc: 'Precise and domain-accurate terminology', not: 'not jargon-heavy for lay audiences' },
  edgy:          { desc: 'Pushes conventions and takes risks with language', not: 'not offensive or alienating' },
  classic:       { desc: 'Timeless language that doesn\'t chase trends', not: 'not dated or stiff' },
  clear:         { desc: 'Unambiguous and easy to act on', not: 'not blunt to the point of feeling dismissive' },
  direct:        { desc: 'Says what it means without hedging or padding', not: 'not aggressive or terse' },
  encouraging:   { desc: 'Uplifts and motivates without being saccharine', not: 'not patronising or hollow' },
  inclusive:     { desc: 'Language that makes everyone feel seen and welcome', not: 'not so cautious it loses personality' },
  genuine:       { desc: 'Authentic and free from marketing jargon', not: 'not rough or unpolished' },
  inspiring:     { desc: 'Sparks curiosity and makes people want to act', not: 'not hyperbolic or ungrounded' },
  fresh:         { desc: 'Contemporary language that feels current, not trendy', not: 'not chasing slang that will date badly' },
  considered:    { desc: 'Thoughtful and measured — speaks carefully about big ideas', not: 'not slow or equivocating' },
  grounded:      { desc: 'Rooted in reality and practical outcomes', not: 'not dry or uninspiring' },
  candid:        { desc: 'Straight-talking, even on hard topics', not: 'not blunt to the point of rudeness' },
  evocative:     { desc: 'Sensory, specific language that creates mental images', not: 'not purple prose or overwrought' },
  practical:     { desc: 'Action-oriented and focused on tangible results', not: 'not dry or overly procedural' },
};

const CHANNEL_TONE_SHIFTS = [
  { channel: 'Instagram / TikTok',    tone: 'Casual, high energy, visual-first. Short captions. Lean into emotion and storytelling over information.' },
  { channel: 'LinkedIn',              tone: 'Professional but personal. Lead with insight. Longer-form is fine if the value is genuine.' },
  { channel: 'Email',                 tone: 'Friendly and direct. Write to one person, not a list. Subject lines reward the click, not bait it.' },
  { channel: 'Blog / Long-form',      tone: 'Informative and considered. Show your thinking. Avoid padding — every paragraph earns its place.' },
  { channel: 'Product / UI copy',     tone: 'Clear, minimal, instructive. Reduce cognitive load. Never be clever at the expense of clarity.' },
  { channel: 'Customer support',      tone: 'Empathetic, calm, solution-focused. Never defensive. Treat problems as opportunities to build trust.' },
];

const VOICE_SAMPLES = {
  'technology':          (n, t) => `"We built ${n} because we were frustrated with the complexity. Here's what we learned — and what we're still figuring out."`,
  'food-beverage':       (n, t) => `"This week's menu comes from a conversation with our farmer about what's actually ready right now. It changed everything."`,
  'health-wellness':     (n, t) => `"We don't believe in perfect. We believe in consistent. ${n} is built for real life — not the highlight reel version of it."`,
  'fashion-beauty':      (n, t) => `"This piece took six months to get right. Not because we're perfectionists, but because the details matter to the people who will wear it every day."`,
  'finance':             (n, t) => `"Here's what the fine print actually means, in plain language. No catches. No hidden conditions."`,
  'education':           (n, t) => `"You don't need to have it all figured out before you start. ${n} is designed for exactly where you are right now."`,
  'arts-entertainment':  (n, t) => `"This project started as a mistake. Here's why we're glad it did."`,
  'real-estate':         (n, t) => `"The market has shifted. Here's what that actually means if you're thinking about buying in the next six months."`,
  'travel-hospitality':  (n, t) => `"The best version of this trip isn't on TripAdvisor. We'll show you where to actually go."`,
  'nonprofit':           (n, t) => `"Last month, 847 families accessed fresh produce for the first time in years. This is what that looked like."`,
  'retail':              (n, t) => `"We made fewer units this season. Not because of supply — because we wanted to make sure each one was worth keeping."`,
  'professional-services':(n, t) => `"Most strategies fail in execution, not in planning. Here's where we see it go wrong — and how we prevent it."`,
};

function generateBrandVoice(brandData, guidance = '') {
  const { brandName, toneWords = [], industry = 'technology', audience = '', avoid = '' } = brandData;
  const toneStr = (toneWords.join(' ') + ' ' + guidance).toLowerCase();

  // Resolve up to 4 voice traits
  const resolved = toneWords
    .map(w => w.trim().toLowerCase())
    .filter(w => TRAIT_LIBRARY[w])
    .slice(0, 4);
  // Fill with closest known traits if < 4
  if (resolved.length < 4) {
    const fallbacks = ['honest','clear','professional','friendly'].filter(f => !resolved.includes(f));
    while (resolved.length < 4 && fallbacks.length) resolved.push(fallbacks.shift());
  }
  const traits = resolved.map(w => ({ word: w, ...TRAIT_LIBRARY[w] }));

  // Intro paragraph
  const t = traits.map(t => t.word);
  const connector = toneStr.includes('professional') ? 'confident' : (toneStr.includes('warm') ? 'warm' : 'consistent');
  const audienceClause = audience ? ` for ${audience.split(',')[0].trim().toLowerCase()}` : '';
  const intro = `${brandName}'s voice is ${t[0]}, ${t[1]}, and ${t[2]}${t[3] ? ` — and always ${t[3]}` : ''}. Every communication${audienceClause} should feel like it comes from a ${connector}, knowledgeable source who has something worth saying. ${avoid ? `We never ${avoid.split(',')[0].trim().toLowerCase()}.` : ''}`;

  const sampleFn = VOICE_SAMPLES[industry] || VOICE_SAMPLES['technology'];
  const sample   = sampleFn(brandName, toneWords);

  return { intro, traits, channels: CHANNEL_TONE_SHIFTS, sample };
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

  const pool = [
    { text: `${n}. ${verb} ${obj}.`,                             type: 'Action' },
    { text: `Less ${contrast}. More ${t0.toLowerCase()}.`,       type: 'Contrast' },
    { text: `The ${generic} for ${shortAud} who mean it.`,       type: 'Audience' },
    { text: `${t0}. ${t1}. Always ${n}.`,                        type: 'Traits' },
    { text: `${verb} ${obj}, ${t0.toLowerCase()}ly.`,            type: 'Adverb' },
    { text: `Not just a ${generic}. ${n}.`,                      type: 'Differentiation' },
    { text: `${cap(shortDesc)}, by ${n}.`,                       type: 'Descriptive' },
    { text: `${n} — where ${t0.toLowerCase()} meets ${t1.toLowerCase()}.`, type: 'Intersection' },
    { text: `The ${t0.toLowerCase()} choice for ${shortAud}.`,   type: 'Positioning' },
    { text: `${verb} differently. Live ${t0.toLowerCase()}ly.`,  type: 'Manifesto' },
  ];

  // Guidance filters
  let sorted = [...pool];
  if (guidanceLower.includes('short') || guidanceLower.includes('punchy')) sorted.sort((a, b) => a.text.length - b.text.length);
  if (guidanceLower.includes('aspir')) sorted = sorted.filter(t => ['Action','Manifesto','Intersection'].includes(t.type)).concat(sorted);
  if (guidanceLower.includes('direct') || guidanceLower.includes('benefit')) sorted = sorted.filter(t => ['Action','Audience','Positioning'].includes(t.type)).concat(sorted);
  if (guidanceLower.includes('clever') || guidanceLower.includes('wordplay')) sorted = sorted.filter(t => ['Contrast','Intersection','Adverb'].includes(t.type)).concat(sorted);

  // De-duplicate by text and return 6
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
  const entries = Object.values(palette);
  const swatches = entries.map(({ hex, role, usage }) => {
    const fg = textOnBg(hex);
    return `
      <div class="swatch">
        <div class="swatch-block" style="background:${hex}">
          <button class="swatch-copy" style="color:${fg}" onclick="copyHex('${hex}',this)" title="Copy ${hex}">Copy</button>
        </div>
        <div class="swatch-info">
          <div class="swatch-hex">${hex.toUpperCase()}</div>
          <div class="swatch-role">${role}</div>
          <div class="swatch-usage">${usage}</div>
        </div>
      </div>`;
  }).join('');

  const primary = palette.primary.hex;
  const onPrimary = textOnBg(primary);
  const cr = contrastRatio(palette.neutral.hex, palette.light.hex).toFixed(1);

  return `
    <div class="palette-swatches">${swatches}</div>
    <div class="palette-note">
      <strong>60-30-10 rule:</strong> Light (${palette.light.hex}) fills 60% of surfaces. Primary + Secondary carry 30%. Accent (${palette.accent.hex.toUpperCase()}) is reserved for calls-to-action and links only — never as a background fill.
      Body text (${palette.neutral.hex.toUpperCase()}) on light background passes WCAG AA at ${cr}:1 contrast.
    </div>`;
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

function renderTypography(pair, brandName) {
  loadGoogleFont(pair.heading, `${pair.hw}`);
  if (pair.body !== pair.heading) loadGoogleFont(pair.body, `${pair.bw};400;600`);

  const hStyle = `font-family:'${pair.heading}',serif;font-weight:${pair.hw};`;
  const bStyle = `font-family:'${pair.body}',sans-serif;font-weight:${pair.bw};`;

  const scaleRows = [
    { label: 'Heading 1', size: '48px', weight: pair.hw, sample: brandName || 'Heading One', font: pair.heading },
    { label: 'Heading 2', size: '32px', weight: pair.hw, sample: 'Section Title',            font: pair.heading },
    { label: 'Heading 3', size: '22px', weight: pair.hw, sample: 'Subsection Heading',        font: pair.heading },
    { label: 'Body',      size: '16px', weight: pair.bw, sample: 'Body text — clear, readable, at 1.6 line-height.', font: pair.body },
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
        <div class="type-card-details">Weight ${pair.hw} · Serif display</div>
        <div class="type-sample-heading" style="${hStyle}font-size:clamp(1.4rem,4vw,2rem);line-height:1.2;">The quick brown fox jumps over the lazy dog.</div>
      </div>
      <div class="type-card">
        <div class="type-card-label">Body Font</div>
        <div class="type-card-family">${pair.body}</div>
        <div class="type-card-details">Weight ${pair.bw} · Body text</div>
        <div class="type-sample-body" style="${bStyle}font-size:15px;line-height:1.65;">Great typography is invisible. It carries the reader from word to word, idea to idea, without calling attention to itself.</div>
      </div>
    </div>
    <div class="type-scale">${scaleRows}</div>
    <p class="type-pairing-desc">Pairing: <strong>${pair.heading} + ${pair.body}</strong> — ${pair.desc} Use headings for hierarchy signals, body for readability. Maintain a minimum 4.5:1 contrast ratio on all body text.</p>`;
}

/* ─────────────────────────────────────────────────────────────
   14. RENDER — BRAND VOICE
   ───────────────────────────────────────────────────────────── */

function renderVoice(voiceData) {
  const traitCards = voiceData.traits.map(t => `
    <div class="voice-trait">
      <div class="voice-trait-name">${cap(t.word)}</div>
      <div class="voice-trait-desc">${t.desc}</div>
      <div class="voice-trait-not"><strong>But:</strong> ${t.not}</div>
    </div>`).join('');

  const channelRows = voiceData.channels.map(c => `
    <tr>
      <td><span class="channel-name">${c.channel}</span></td>
      <td>${c.tone}</td>
    </tr>`).join('');

  return `
    <p class="voice-intro">${voiceData.intro}</p>
    <div class="voice-traits">${traitCards}</div>
    <p class="strategy-section-title">Tone by channel</p>
    <table class="voice-channel-table">
      <thead><tr><th>Channel</th><th>How tone shifts</th></tr></thead>
      <tbody>${channelRows}</tbody>
    </table>
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
}

/* ─────────────────────────────────────────────────────────────
   16. RENDER — VISUAL MOCKUPS (5 distinct contexts)
   ───────────────────────────────────────────────────────────── */

function mockupCell(frameClass, innerHtml, label, context) {
  return `
    <div class="mockup-cell">
      <div class="mockup-frame ${frameClass}">${innerHtml}</div>
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
  const tp = textOnBg(p);
  const ts = textOnBg(s);
  const tl = textOnBg(lc);
  const td = textOnBg(dc);
  const ta = textOnBg(a);
  const hF = `'${fonts.heading}',Georgia,serif`;
  const bF = `'${fonts.body}',system-ui,sans-serif`;
  const hw = fonts.hw;

  // ── 1. Business Card (landscape 1.6:1) ─────────────────
  const card = `
    <div style="display:flex;width:100%;height:100%;">
      <div style="width:38%;background:${p};display:flex;flex-direction:column;justify-content:space-between;padding:11% 9%;">
        <div style="width:20px;height:20px;border-radius:3px;background:${a};opacity:0.85;"></div>
        <div>
          <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.9em,2.5vw,1.3em);color:${tp};line-height:1.15;letter-spacing:-0.01em;">${brandName}</div>
          <div style="width:22px;height:2.5px;background:${a};border-radius:2px;margin-top:8%;"></div>
        </div>
      </div>
      <div style="flex:1;background:${lc};display:flex;flex-direction:column;justify-content:center;padding:9% 11%;">
        <div style="font-family:${bF};font-size:clamp(0.55em,1.4vw,0.78em);color:${tl};opacity:0.65;line-height:1.55;margin-bottom:12%;">${shortTag}</div>
        <div style="font-family:${bF};font-size:clamp(0.45em,1vw,0.6em);font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${tl};opacity:0.35;">${brandName.toLowerCase().replace(/\s+/g,'')}.com</div>
      </div>
    </div>`;

  // ── 2. Instagram Post (square 1:1) ──────────────────────
  const social = `
    <div style="display:flex;flex-direction:column;width:100%;height:100%;background:${lc};">
      <div style="height:7px;background:${a};flex-shrink:0;"></div>
      <div style="display:flex;align-items:center;gap:7px;padding:7% 8% 4%;">
        <div style="width:20px;height:20px;border-radius:50%;background:${p};flex-shrink:0;"></div>
        <span style="font-family:${bF};font-size:clamp(0.5em,1.2vw,0.65em);font-weight:700;color:${tl};letter-spacing:0.02em;">${brandName.toUpperCase()}</span>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;justify-content:center;padding:2% 10%;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.85em,2.5vw,1.35em);color:${tl};line-height:1.2;letter-spacing:-0.01em;">"${shortTag}"</div>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;padding:5% 8% 7%;">
        <div style="width:18px;height:2px;background:${p};border-radius:2px;"></div>
        <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.42em,1vw,0.58em);font-weight:700;padding:4% 9%;border-radius:3px;letter-spacing:0.03em;">Follow →</div>
      </div>
    </div>`;

  // ── 3. Web Hero (wide 2.4:1) ────────────────────────────
  const hero = `
    <div style="display:flex;width:100%;height:100%;">
      <div style="flex:1.3;background:${dc};display:flex;flex-direction:column;justify-content:center;padding:7% 8%;">
        <div style="font-family:${bF};font-size:clamp(0.4em,1vw,0.55em);font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${a};margin-bottom:5%;">${brandName}</div>
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.75em,2vw,1.15em);color:${td};line-height:1.2;letter-spacing:-0.01em;margin-bottom:8%;">${shortTag}</div>
        <div style="display:inline-flex;gap:6px;">
          <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.38em,0.9vw,0.52em);font-weight:700;padding:4% 10%;border-radius:3px;">Get started</div>
          <div style="border:1px solid rgba(255,255,255,0.2);color:${td};font-family:${bF};font-size:clamp(0.38em,0.9vw,0.52em);font-weight:600;padding:4% 10%;border-radius:3px;">Learn more</div>
        </div>
      </div>
      <div style="flex:0.7;background:${p};"></div>
    </div>`;

  // ── 4. Email Banner (very wide 4:1) ─────────────────────
  const email = `
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;height:100%;background:${s};padding:0 5%;">
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        <div style="width:22px;height:22px;border-radius:4px;background:${p};flex-shrink:0;"></div>
        <span style="font-family:${hF};font-weight:${hw};font-size:clamp(0.6em,1.8vw,0.95em);color:${ts};letter-spacing:-0.01em;">${brandName}</span>
      </div>
      <div style="font-family:${bF};font-size:clamp(0.4em,1.1vw,0.62em);color:${ts};opacity:0.6;flex:1;text-align:center;padding:0 5%;overflow:hidden;white-space:nowrap;text-overflow:ellipsis;">${shortTag}</div>
      <div style="background:${a};color:${ta};font-family:${bF};font-size:clamp(0.38em,0.9vw,0.55em);font-weight:700;padding:5% 10%;border-radius:3px;flex-shrink:0;white-space:nowrap;">Subscribe →</div>
    </div>`;

  // ── 5. Product / Packaging Label (square 1:1) ───────────
  const label = `
    <div style="display:flex;flex-direction:column;width:100%;height:100%;background:#fff;">
      <div style="background:${p};padding:14% 8% 12%;text-align:center;">
        <div style="font-family:${hF};font-weight:${hw};font-size:clamp(0.8em,2.2vw,1.1em);color:${tp};line-height:1.15;letter-spacing:-0.01em;">${brandName}</div>
      </div>
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:8%;">
        <div style="width:18px;height:18px;border-radius:50%;background:${a};margin-bottom:8%;"></div>
        <div style="font-family:${bF};font-size:clamp(0.45em,1.1vw,0.62em);color:#444;text-align:center;line-height:1.5;">${shortTag}</div>
      </div>
      <div style="height:5px;background:${a};"></div>
    </div>`;

  return `
    <div class="mockup-grid">
      ${mockupCell('mockup-frame--card',   card,   'Business Card', 'Print / stationery')}
      ${mockupCell('mockup-frame--social', social, 'Social Post',   'Instagram / LinkedIn')}
      ${mockupCell('mockup-frame--hero',   hero,   'Web Hero',      'Landing page')}
      ${mockupCell('mockup-frame--email',  email,  'Email Banner',  'Newsletter header')}
      ${mockupCell('mockup-frame--label',  label,  'Product Label', 'Packaging / tags')}
    </div>`;
}

/* ─────────────────────────────────────────────────────────────
   17. RENDER — CONTENT STRATEGY
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
      document.getElementById('typography-content').innerHTML = renderTypography(newFonts, bd.brandName);
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
    case 'strategy': {
      kit.strategy = generateContentStrategy(bd, guidance);
      document.getElementById('strategy-content').innerHTML = renderStrategy(kit.strategy);
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
  return {
    brandName:   document.getElementById('brand-name').value.trim(),
    industry:    document.getElementById('industry').value,
    description: document.getElementById('description').value.trim(),
    whatDoes:    document.getElementById('what-does').value.trim(),
    audience:    document.getElementById('audience').value.trim(),
    toneWords:   document.getElementById('tone').value.split(',').map(s => s.trim().toLowerCase()).filter(Boolean),
    avoid:       document.getElementById('avoid').value.trim(),
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
    : generatePaletteFromIndustry(brandData.industry, brandData.toneWords);

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
  document.getElementById('typography-content').innerHTML = renderTypography(kit.fonts, brandData.brandName);
  document.getElementById('voice-content').innerHTML      = renderVoice(kit.voice);
  document.getElementById('tagline-content').innerHTML    = renderTagline(kit.taglines, 0);
  document.getElementById('strategy-content').innerHTML   = renderStrategy(kit.strategy);

  // Mockup needs fonts — short wait for load
  await document.fonts.ready;
  document.getElementById('mockup-content').innerHTML = renderMockup(
    kit.palette, kit.fonts, { ...brandData, taglines: kit.taglines }
  );

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
  return {
    brandName,
    industry,
    description: desc,
    whatDoes:    desc + ' We take pride in craft over convenience and community over scale.',
    audience:    tmpl.audience,
    toneWords:   tmpl.tone.split(',').map(s => s.trim()),
    avoid:       RAND.avoid[industry] || 'generic, corporate, impersonal',
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

/* ─────────────────────────────────────────────────────────────
   23. PHOTO UPLOAD HANDLING
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

const TAB_ORDER = ['palette', 'typography', 'voice', 'tagline', 'mockup', 'strategy'];
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
