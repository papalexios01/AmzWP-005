/**
 * ============================================================================
 * Precision Product Detection Engine v2.0
 * ============================================================================
 * Multi-layer detection with cross-validation, fuzzy matching,
 * calibrated confidence scoring, and contextual placement analysis.
 * 
 * DETECTION LAYERS:
 * 1. Structural Extraction (ASINs, links, HTML structure)
 * 2. NLP Pattern Matching (brands, models, product lines)
 * 3. Contextual Signal Analysis (headings, bold, lists, proximity)
 * 4. AI Deep Extraction (LLM with chain-of-thought)
 * 5. Cross-Validation & Deduplication (fuzzy merge, score calibration)
 * 6. Amazon Verification (SerpAPI with smart query optimization)
 * ============================================================================
 */

import { AppConfig, ProductDetails, DeploymentMode, FAQItem, ComparisonData } from '../types';
import {
  callAIProvider,
  searchAmazonProduct,
  fetchProductByASIN,
  IntelligenceCache,
  hashString,
} from '../utils';

// ============================================================================
// TYPES
// ============================================================================

export interface DetectedCandidate {
  /** Normalized canonical name */
  canonicalName: string;
  /** All raw name variants found */
  nameVariants: string[];
  /** ASIN if found in link */
  asin?: string;
  /** Brand if identified */
  brand?: string;
  /** Model identifier */
  model?: string;
  /** Detection sources */
  sources: DetectionSource[];
  /** Calibrated confidence 0-100 */
  confidence: number;
  /** Best search query for Amazon */
  searchQuery: string;
  /** Paragraph indices where mentioned */
  paragraphIndices: number[];
  /** Exact quote of first mention */
  firstMention: string;
  /** Content block index for placement */
  bestPlacementIndex: number;
  /** Category hint */
  categoryHint: string;
}

interface DetectionSource {
  type:
    | 'asin_link'
    | 'affiliate_anchor'
    | 'heading'
    | 'bold_mention'
    | 'numbered_list'
    | 'brand_model_regex'
    | 'standalone_product'
    | 'model_number'
    | 'ai_extraction'
    | 'contextual_signal';
  confidence: number;
  rawMatch: string;
  position: number;
}

interface ContextSignal {
  inHeading: boolean;
  headingLevel: number; // 1-6
  inBold: boolean;
  inList: boolean;
  listPosition: number; // 1-based (for "Top 10" type lists)
  inLink: boolean;
  nearPrice: boolean;
  nearRating: boolean;
  nearImage: boolean;
  mentionCount: number;
  firstMentionPosition: number; // 0-1 normalized (0=top, 1=bottom)
  surroundingProductDensity: number; // how many other products nearby
}

interface ParagraphBlock {
  index: number;
  html: string;
  text: string;
  isHeading: boolean;
  headingLevel: number;
  hasBold: boolean;
  hasList: boolean;
  hasLink: boolean;
  hasImage: boolean;
  hasPrice: boolean;
  hasRating: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

/**
 * Expanded brand database with categories
 */
const BRAND_DATABASE: Record<string, { category: string; aliases: string[] }> = {
  // Tech / Electronics
  'apple': { category: 'Electronics', aliases: ['apple'] },
  'samsung': { category: 'Electronics', aliases: ['samsung', 'galaxy'] },
  'sony': { category: 'Electronics', aliases: ['sony'] },
  'google': { category: 'Electronics', aliases: ['google', 'pixel', 'nest'] },
  'microsoft': { category: 'Electronics', aliases: ['microsoft', 'surface'] },
  'amazon': { category: 'Electronics', aliases: ['amazon', 'echo', 'kindle', 'fire', 'ring', 'blink', 'eero'] },
  'bose': { category: 'Audio', aliases: ['bose'] },
  'jbl': { category: 'Audio', aliases: ['jbl'] },
  'beats': { category: 'Audio', aliases: ['beats'] },
  'sennheiser': { category: 'Audio', aliases: ['sennheiser'] },
  'audio-technica': { category: 'Audio', aliases: ['audio-technica', 'audio technica'] },
  'logitech': { category: 'Peripherals', aliases: ['logitech', 'logi'] },
  'razer': { category: 'Peripherals', aliases: ['razer'] },
  'corsair': { category: 'Peripherals', aliases: ['corsair'] },
  'steelseries': { category: 'Peripherals', aliases: ['steelseries'] },
  'hyperx': { category: 'Peripherals', aliases: ['hyperx'] },
  // Fitness
  'fitbit': { category: 'Fitness', aliases: ['fitbit'] },
  'garmin': { category: 'Fitness', aliases: ['garmin'] },
  'polar': { category: 'Fitness', aliases: ['polar'] },
  'suunto': { category: 'Fitness', aliases: ['suunto'] },
  'coros': { category: 'Fitness', aliases: ['coros'] },
  'amazfit': { category: 'Fitness', aliases: ['amazfit'] },
  'whoop': { category: 'Fitness', aliases: ['whoop'] },
  'oura': { category: 'Fitness', aliases: ['oura'] },
  'theragun': { category: 'Fitness', aliases: ['theragun', 'therabody'] },
  'hyperice': { category: 'Fitness', aliases: ['hyperice', 'hypervolt'] },
  'peloton': { category: 'Fitness', aliases: ['peloton'] },
  'nordictrack': { category: 'Fitness', aliases: ['nordictrack'] },
  'bowflex': { category: 'Fitness', aliases: ['bowflex'] },
  // Footwear
  'nike': { category: 'Footwear', aliases: ['nike'] },
  'adidas': { category: 'Footwear', aliases: ['adidas'] },
  'under armour': { category: 'Footwear', aliases: ['under armour', 'ua'] },
  'asics': { category: 'Footwear', aliases: ['asics'] },
  'brooks': { category: 'Footwear', aliases: ['brooks'] },
  'new balance': { category: 'Footwear', aliases: ['new balance', 'nb'] },
  'hoka': { category: 'Footwear', aliases: ['hoka', 'hoka one one'] },
  'saucony': { category: 'Footwear', aliases: ['saucony'] },
  'on': { category: 'Footwear', aliases: ['on cloud', 'on running'] },
  // Kitchen
  'ninja': { category: 'Kitchen', aliases: ['ninja'] },
  'vitamix': { category: 'Kitchen', aliases: ['vitamix'] },
  'kitchenaid': { category: 'Kitchen', aliases: ['kitchenaid', 'kitchen aid'] },
  'cuisinart': { category: 'Kitchen', aliases: ['cuisinart'] },
  'breville': { category: 'Kitchen', aliases: ['breville'] },
  'instant pot': { category: 'Kitchen', aliases: ['instant pot', 'instantpot'] },
  'nutribullet': { category: 'Kitchen', aliases: ['nutribullet', 'nutri bullet'] },
  'keurig': { category: 'Kitchen', aliases: ['keurig'] },
  'nespresso': { category: 'Kitchen', aliases: ['nespresso'] },
  // Home
  'dyson': { category: 'Home', aliases: ['dyson'] },
  'shark': { category: 'Home', aliases: ['shark'] },
  'irobot': { category: 'Home', aliases: ['irobot', 'roomba'] },
  'roborock': { category: 'Home', aliases: ['roborock'] },
  'eufy': { category: 'Home', aliases: ['eufy'] },
  'ecovacs': { category: 'Home', aliases: ['ecovacs', 'deebot'] },
  'sonos': { category: 'Home', aliases: ['sonos'] },
  'philips hue': { category: 'Home', aliases: ['philips hue', 'hue'] },
  'nanoleaf': { category: 'Home', aliases: ['nanoleaf'] },
  'govee': { category: 'Home', aliases: ['govee'] },
  // Camera / Drone
  'canon': { category: 'Camera', aliases: ['canon'] },
  'nikon': { category: 'Camera', aliases: ['nikon'] },
  'gopro': { category: 'Camera', aliases: ['gopro', 'go pro'] },
  'dji': { category: 'Camera', aliases: ['dji'] },
  'fujifilm': { category: 'Camera', aliases: ['fujifilm', 'fuji'] },
  // Outdoor
  'yeti': { category: 'Outdoor', aliases: ['yeti'] },
  'hydro flask': { category: 'Outdoor', aliases: ['hydro flask', 'hydroflask'] },
  'stanley': { category: 'Outdoor', aliases: ['stanley'] },
  'osprey': { category: 'Outdoor', aliases: ['osprey'] },
  'thule': { category: 'Outdoor', aliases: ['thule'] },
  'rei': { category: 'Outdoor', aliases: ['rei'] },
  // Gaming
  'nintendo': { category: 'Gaming', aliases: ['nintendo'] },
  'playstation': { category: 'Gaming', aliases: ['playstation', 'ps5', 'ps4'] },
  'xbox': { category: 'Gaming', aliases: ['xbox'] },
  'valve': { category: 'Gaming', aliases: ['valve', 'steam deck'] },
  'meta': { category: 'Gaming', aliases: ['meta', 'meta quest', 'oculus'] },
  // Supplements
  'optimum nutrition': { category: 'Supplements', aliases: ['optimum nutrition', 'on gold standard'] },
  'myprotein': { category: 'Supplements', aliases: ['myprotein'] },
  'ghost': { category: 'Supplements', aliases: ['ghost'] },
  'transparent labs': { category: 'Supplements', aliases: ['transparent labs'] },
  'lmnt': { category: 'Supplements', aliases: ['lmnt'] },
  // Power / Charging
  'anker': { category: 'Electronics', aliases: ['anker'] },
  'belkin': { category: 'Electronics', aliases: ['belkin'] },
  'ugreen': { category: 'Electronics', aliases: ['ugreen'] },
  'jackery': { category: 'Electronics', aliases: ['jackery'] },
  'ecoflow': { category: 'Electronics', aliases: ['ecoflow'] },
  // Furniture / Office
  'secretlab': { category: 'Furniture', aliases: ['secretlab'] },
  'herman miller': { category: 'Furniture', aliases: ['herman miller'] },
  'steelcase': { category: 'Furniture', aliases: ['steelcase'] },
  'flexispot': { category: 'Furniture', aliases: ['flexispot'] },
};

// Flatten aliases for quick lookup
const BRAND_ALIAS_MAP = new Map<string, string>();
for (const [brand, config] of Object.entries(BRAND_DATABASE)) {
  for (const alias of config.aliases) {
    BRAND_ALIAS_MAP.set(alias.toLowerCase(), brand);
  }
}

/**
 * Product line patterns that don't need a brand prefix
 * (they ARE the product)
 */
const STANDALONE_PRODUCT_PATTERNS: Array<{ pattern: RegExp; category: string }> = [
  { pattern: /\b(AirPods(?:\s*(?:Pro|Max))?(?:\s*\(?(?:2nd|3rd|4th)\s*(?:gen(?:eration)?)\)?)?(?:\s*\d)?)\b/gi, category: 'Audio' },
  { pattern: /\b(Galaxy\s*(?:Buds|Watch|Tab|S\d{2}|Z\s*(?:Fold|Flip)|Fit|Ring)(?:\s*\d+)?(?:\s*(?:Pro|Plus|Ultra|FE|SE))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(Pixel\s*(?:\d+[a]?|Buds|Watch|Tablet)(?:\s*(?:Pro|a|XL))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(iPhone\s*(?:\d{2,})?(?:\s*(?:Pro|Max|Plus|SE|mini))*)\b/gi, category: 'Electronics' },
  { pattern: /\b(iPad\s*(?:Pro|Air|Mini)?(?:\s*(?:\d+|M\d))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(MacBook\s*(?:Air|Pro)?(?:\s*(?:\d+|M\d))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(Apple\s*Watch(?:\s*(?:Series|SE|Ultra)\s*\d*)?)\b/gi, category: 'Fitness' },
  { pattern: /\b(Echo\s*(?:Dot|Show|Studio|Pop|Hub)?(?:\s*(?:\d+|Gen\s*\d+))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(Kindle\s*(?:Paperwhite|Oasis|Scribe|Colorsoft|Kids)?)\b/gi, category: 'Electronics' },
  { pattern: /\b(Fire\s*(?:TV|Stick|Tablet|HD|Max)(?:\s*\d+)?(?:\s*(?:Lite|Max|Kids|Plus))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(PlayStation\s*(?:\d|VR\d*)(?:\s*(?:Pro|Slim|Digital))?)\b/gi, category: 'Gaming' },
  { pattern: /\b(Xbox\s*(?:Series\s*[XS]|One(?:\s*[XS])?))\b/gi, category: 'Gaming' },
  { pattern: /\b(Nintendo\s*Switch(?:\s*(?:OLED|Lite|2))?)\b/gi, category: 'Gaming' },
  { pattern: /\b(Steam\s*Deck(?:\s*(?:OLED|LCD))?)\b/gi, category: 'Gaming' },
  { pattern: /\b(Meta\s*Quest\s*\d+(?:\s*S)?)\b/gi, category: 'Gaming' },
  { pattern: /\b(Instant\s*Pot(?:\s*(?:Duo|Pro|Ultra|Vortex|Slim|Plus))?(?:\s*\d+)?)\b/gi, category: 'Kitchen' },
  { pattern: /\b(Roomba\s*(?:[a-z]?\d{3,4}|Combo|j\d+|s\d+|i\d+|e\d+))\b/gi, category: 'Home' },
  { pattern: /\b(Fitbit\s*(?:Charge|Versa|Sense|Luxe|Inspire|Ace)\s*\d*(?:\s*(?:SE|Special))?)\b/gi, category: 'Fitness' },
  { pattern: /\b(Garmin\s*(?:Forerunner|Fenix|Venu|Instinct|Enduro|Lily|Vivomove|Vivoactive|Epix|Descent)\s*\d*(?:\s*[A-Za-z]+)?)\b/gi, category: 'Fitness' },
  { pattern: /\b(Dyson\s*(?:V\d+|Airwrap|Supersonic|Pure|Big\s*Quiet|Zone|Airstrait|Corrale)(?:\s*(?:Absolute|Animal|Motorhead|Detect|Complete|Origin))?)\b/gi, category: 'Home' },
  { pattern: /\b(Sonos\s*(?:One|Beam|Arc|Sub|Move|Roam|Era|Port|Amp|Ray)\s*\d*(?:\s*(?:SL|Gen\s*\d+))?)\b/gi, category: 'Audio' },
  { pattern: /\b(Oura\s*Ring\s*(?:Gen\s*\d+|\d+)?)\b/gi, category: 'Fitness' },
  { pattern: /\b(Ring\s*(?:Doorbell|Camera|Alarm|Floodlight|Spotlight|Stick\s*Up)(?:\s*(?:Pro|Plus|Elite|Wired|\d+))?)\b/gi, category: 'Home' },
  { pattern: /\b(Nest\s*(?:Thermostat|Cam|Doorbell|Hub|Mini|Audio|Wifi|Learning)(?:\s*(?:Pro|Max|Indoor|Outdoor|\d+))?)\b/gi, category: 'Home' },
  { pattern: /\b(Surface\s*(?:Pro|Laptop|Go|Studio|Book|Duo)\s*\d*)\b/gi, category: 'Electronics' },
  { pattern: /\b(ThinkPad\s*[A-Z]\d+(?:\s*(?:Gen\s*\d+|s|i|Carbon))?)\b/gi, category: 'Electronics' },
  { pattern: /\b(YETI\s*(?:Rambler|Tundra|Roadie|Hopper|Panga|LoadOut|Flip)(?:\s*\d+)?)\b/gi, category: 'Outdoor' },
  { pattern: /\b(Hydro\s*Flask\s*(?:\d+\s*oz|Wide|Standard|Trail|Coffee)?)\b/gi, category: 'Outdoor' },
  { pattern: /\b(Stanley\s*(?:Quencher|Classic|IceFlow|Adventure|Quick\s*Flip)(?:\s*\d+\s*oz)?)\b/gi, category: 'Outdoor' },
  { pattern: /\b(WH-1000XM\d)\b/gi, category: 'Audio' },
  { pattern: /\b(QC\s*(?:\d+|Ultra|Earbuds|45))\b/gi, category: 'Audio' },
];

// ============================================================================
// LAYER 1: STRUCTURAL EXTRACTION
// ============================================================================

function parseIntoParagraphs(html: string): ParagraphBlock[] {
  const blocks: ParagraphBlock[] = [];
  
  // Split on block-level elements
  const blockRegex = /(<(?:p|h[1-6]|div|li|tr|blockquote|figcaption|dt|dd)[^>]*>[\s\S]*?<\/(?:p|h[1-6]|div|li|tr|blockquote|figcaption|dt|dd)>)/gi;
  const parts = html.split(blockRegex).filter(p => p && p.trim().length > 5);
  
  let index = 0;
  for (const part of parts) {
    const text = part.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    if (text.length < 3) continue;
    
    const headingMatch = part.match(/<h(\d)/i);
    const isHeading = !!headingMatch;
    const headingLevel = headingMatch ? parseInt(headingMatch[1]) : 0;
    
    blocks.push({
      index,
      html: part,
      text,
      isHeading,
      headingLevel,
      hasBold: /<(?:strong|b)\b/i.test(part),
      hasList: /<(?:ul|ol|li)\b/i.test(part),
      hasLink: /<a\b/i.test(part),
      hasImage: /<img\b/i.test(part),
      hasPrice: /\$\d+(?:\.\d{2})?|\d+\.\d{2}\s*(?:USD|dollars?)/i.test(text),
      hasRating: /\d+(?:\.\d+)?\s*(?:\/\s*5|stars?|⭐|★)/i.test(text),
    });
    index++;
  }
  
  return blocks;
}

function extractAsinCandidates(html: string, paragraphs: ParagraphBlock[]): DetectedCandidate[] {
  const candidates: DetectedCandidate[] = [];
  const seenAsins = new Set<string>();
  
  const asinPatterns = [
    /amazon\.[a-z.]+\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/gi,
    /\/dp\/([A-Z0-9]{10})/gi,
    /\/(B0[A-Z0-9]{8})(?:[\/\?\s"'&<]|$)/gi,
    /data-asin="([A-Z0-9]{10})"/gi,
    /asin[=:]"?([A-Z0-9]{10})"?/gi,
  ];
  
  for (const pattern of asinPatterns) {
    let match;
    while ((match = pattern.exec(html)) !== null) {
      const asin = match[1]?.toUpperCase();
      if (!asin || !/^[A-Z0-9]{10}$/.test(asin) || seenAsins.has(asin)) continue;
      seenAsins.add(asin);
      
      // Try to get anchor text for this ASIN's link
      const linkRegex = new RegExp(
        `<a[^>]*href="[^"]*${asin}[^"]*"[^>]*>([^<]{4,100})<\\/a>`,
        'i'
      );
      const linkMatch = html.match(linkRegex);
      const anchorText = linkMatch?.[1]?.trim() || '';
      
      // Find which paragraph contains this ASIN
      const paraIdx = findParagraphForPosition(match.index, html, paragraphs);
      
      candidates.push({
        canonicalName: anchorText || `ASIN:${asin}`,
        nameVariants: anchorText ? [anchorText, `ASIN:${asin}`] : [`ASIN:${asin}`],
        asin,
        sources: [{
          type: 'asin_link',
          confidence: 100,
          rawMatch: match[0],
          position: match.index,
        }],
        confidence: 100, // ASIN links are definitive
        searchQuery: anchorText || asin,
        paragraphIndices: paraIdx >= 0 ? [paraIdx] : [0],
        firstMention: anchorText || asin,
        bestPlacementIndex: paraIdx >= 0 ? paraIdx : 0,
        categoryHint: '',
      });
    }
  }
  
  return candidates;
}

// ============================================================================
// LAYER 2: NLP PATTERN MATCHING
// ============================================================================

function extractBrandModelCandidates(
  paragraphs: ParagraphBlock[]
): DetectedCandidate[] {
  const candidates: DetectedCandidate[] = [];
  const seen = new Set<string>();
  
  for (const para of paragraphs) {
    const text = para.text;
    
    // --- Standalone product patterns ---
    for (const { pattern, category } of STANDALONE_PRODUCT_PATTERNS) {
      // Reset lastIndex for each paragraph
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const name = match[1]?.trim();
        if (!name || name.length < 4) continue;
        
        const key = fuzzyKey(name);
        if (seen.has(key)) {
          // Update existing candidate with additional paragraph
          const existing = candidates.find(c => fuzzyKey(c.canonicalName) === key);
          if (existing && !existing.paragraphIndices.includes(para.index)) {
            existing.paragraphIndices.push(para.index);
            existing.sources.push({
              type: 'standalone_product',
              confidence: 92,
              rawMatch: name,
              position: match.index,
            });
          }
          continue;
        }
        seen.add(key);
        
        const contextScore = scoreContext(para);
        
        candidates.push({
          canonicalName: name,
          nameVariants: [name],
          brand: detectBrandFromName(name),
          sources: [{
            type: 'standalone_product',
            confidence: 92,
            rawMatch: name,
            position: match.index,
          }],
          confidence: 0, // Will be calibrated later
          searchQuery: name,
          paragraphIndices: [para.index],
          firstMention: extractQuote(text, match.index, name.length),
          bestPlacementIndex: para.index,
          categoryHint: category,
        });
      }
    }
    
    // --- Brand + Model patterns ---
    for (const [brandKey, brandConfig] of Object.entries(BRAND_DATABASE)) {
      for (const alias of brandConfig.aliases) {
        // Build a regex that matches the brand alias followed by a product name
        const escapedAlias = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const brandModelRegex = new RegExp(
          `\\b(${escapedAlias})\\s+([A-Za-z0-9][\\w\\s\\-\\.&']{1,50}?)(?=[\\.,!?;:\\)\\]"'<]|\\s+(?:is|are|was|were|has|have|had|with|for|and|or|but|features|offers|comes|includes|provides|delivers|boasts|review|vs|versus|compared)|\\s*$)`,
          'gi'
        );
        
        let match;
        while ((match = brandModelRegex.exec(text)) !== null) {
          const fullMatch = match[0].trim().replace(/[.,!?;:]+$/, '');
          if (fullMatch.length < 5 || fullMatch.length > 70) continue;
          
          const key = fuzzyKey(fullMatch);
          if (seen.has(key)) {
            const existing = candidates.find(c => fuzzyKey(c.canonicalName) === key);
            if (existing && !existing.paragraphIndices.includes(para.index)) {
              existing.paragraphIndices.push(para.index);
            }
            continue;
          }
          seen.add(key);
          
          candidates.push({
            canonicalName: fullMatch,
            nameVariants: [fullMatch],
            brand: brandKey,
            model: match[2]?.trim(),
            sources: [{
              type: 'brand_model_regex',
              confidence: 85,
              rawMatch: fullMatch,
              position: match.index,
            }],
            confidence: 0,
            searchQuery: fullMatch,
            paragraphIndices: [para.index],
            firstMention: extractQuote(text, match.index, fullMatch.length),
            bestPlacementIndex: para.index,
            categoryHint: brandConfig.category,
          });
        }
      }
    }
    
    // --- Model Number pattern (catches things like "WH-1000XM5", "BL610") ---
    const modelRegex = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+((?:[A-Z]{1,4}[-]?\d{2,5}[A-Za-z]*|\d{3,5}[A-Za-z]+)(?:\s*(?:Pro|Max|Plus|Ultra|Mini|SE|Gen\s*\d+))?)\b/g;
    let modelMatch;
    while ((modelMatch = modelRegex.exec(text)) !== null) {
      const fullMatch = modelMatch[0].trim();
      if (fullMatch.length < 5 || fullMatch.length > 60) continue;
      const key = fuzzyKey(fullMatch);
      if (seen.has(key)) continue;
      seen.add(key);
      
      candidates.push({
        canonicalName: fullMatch,
        nameVariants: [fullMatch],
        brand: modelMatch[1],
        model: modelMatch[2],
        sources: [{
          type: 'model_number',
          confidence: 82,
          rawMatch: fullMatch,
          position: modelMatch.index,
        }],
        confidence: 0,
        searchQuery: fullMatch,
        paragraphIndices: [para.index],
        firstMention: extractQuote(text, modelMatch.index, fullMatch.length),
        bestPlacementIndex: para.index,
        categoryHint: '',
      });
    }
    
    // --- Products in headings (high confidence) ---
    if (para.isHeading && para.headingLevel >= 2 && para.headingLevel <= 4) {
      const headerText = para.text
        .replace(/^\d+[\.\)]\s*/, '')
        .replace(/^(?:Best|Top|Our|The|Why|How)\s+/i, '')
        .replace(/\s*[-–—]\s*(?:Best|Review|Comparison|Guide|Honest|Complete|Full|In-Depth).*$/i, '')
        .trim();
      
      if (headerText.length >= 5 && headerText.length <= 100) {
        const hasProductSignal =
          /[A-Z][a-z]+\s+[A-Z0-9]/.test(headerText) ||
          /\d/.test(headerText) ||
          detectBrandFromName(headerText) !== undefined;
        
        if (hasProductSignal) {
          const key = fuzzyKey(headerText);
          if (!seen.has(key)) {
            seen.add(key);
            candidates.push({
              canonicalName: headerText,
              nameVariants: [headerText],
              brand: detectBrandFromName(headerText),
              sources: [{
                type: 'heading',
                confidence: 90,
                rawMatch: headerText,
                position: 0,
              }],
              confidence: 0,
              searchQuery: headerText,
              paragraphIndices: [para.index],
              firstMention: headerText,
              bestPlacementIndex: para.index,
              categoryHint: '',
            });
          }
        }
      }
    }
    
    // --- Products in bold text ---
    const boldRegex = /<(?:strong|b)[^>]*>([^<]{5,80})<\/(?:strong|b)>/gi;
    let boldMatch;
    while ((boldMatch = boldRegex.exec(para.html)) !== null) {
      const boldText = boldMatch[1]?.trim()
        .replace(/&amp;/g, '&')
        .replace(/&#\d+;/g, '');
      if (!boldText || boldText.length < 5) continue;
      
      const hasProductSignal =
        /[A-Z][a-z]+\s+[A-Z0-9]/.test(boldText) ||
        /\d/.test(boldText) ||
        detectBrandFromName(boldText) !== undefined;
      
      const wordCount = boldText.split(/\s+/).length;
      const startsWithCommonWord = /^(?:the|this|that|these|those|what|why|how|our|my|your)\b/i.test(boldText);
      
      if (hasProductSignal && wordCount <= 8 && !startsWithCommonWord) {
        const key = fuzzyKey(boldText);
        if (!seen.has(key)) {
          seen.add(key);
          candidates.push({
            canonicalName: boldText,
            nameVariants: [boldText],
            brand: detectBrandFromName(boldText),
            sources: [{
              type: 'bold_mention',
              confidence: 78,
              rawMatch: boldText,
              position: boldMatch.index,
            }],
            confidence: 0,
            searchQuery: boldText,
            paragraphIndices: [para.index],
            firstMention: boldText,
            bestPlacementIndex: para.index,
            categoryHint: '',
          });
        }
      }
    }
  }
  
  return candidates;
}

// ============================================================================
// LAYER 3: CONTEXTUAL SIGNAL ANALYSIS
// ============================================================================

function scoreContext(para: ParagraphBlock): number {
  let score = 0;
  if (para.isHeading) score += 25;
  if (para.hasBold) score += 10;
  if (para.hasList) score += 5;
  if (para.hasLink) score += 15;
  if (para.hasPrice) score += 20;
  if (para.hasRating) score += 20;
  if (para.hasImage) score += 10;
  return score;
}

function calibrateConfidence(
  candidate: DetectedCandidate,
  paragraphs: ParagraphBlock[],
  totalCandidates: number
): number {
  let score = 0;
  
  // --- Source quality (max 40 points) ---
  const bestSourceConf = Math.max(...candidate.sources.map(s => s.confidence));
  if (candidate.asin) {
    score += 40; // ASIN = definitive
  } else if (bestSourceConf >= 90) {
    score += 35;
  } else if (bestSourceConf >= 80) {
    score += 28;
  } else if (bestSourceConf >= 70) {
    score += 20;
  } else {
    score += 12;
  }
  
  // --- Brand recognition (max 15 points) ---
  if (candidate.brand && BRAND_DATABASE[candidate.brand]) {
    score += 15;
  } else if (candidate.brand) {
    score += 8;
  }
  
  // --- Name quality (max 15 points) ---
  const name = candidate.canonicalName;
  if (/\d/.test(name)) score += 7;  // Has model number
  if (/[A-Z]{2,}/.test(name)) score += 4; // Has uppercase acronym
  if (name.split(/\s+/).length >= 2 && name.split(/\s+/).length <= 6) score += 4; // Good length
  
  // --- Contextual signals (max 20 points) ---
  let contextTotal = 0;
  for (const paraIdx of candidate.paragraphIndices) {
    const para = paragraphs[paraIdx];
    if (!para) continue;
    contextTotal += scoreContext(para);
  }
  score += Math.min(contextTotal, 20);
  
  // --- Mention frequency (max 10 points) ---
  const mentionCount = candidate.paragraphIndices.length;
  score += Math.min(mentionCount * 3, 10);
  
  // --- Multi-source bonus ---
  const uniqueSourceTypes = new Set(candidate.sources.map(s => s.type));
  if (uniqueSourceTypes.size >= 2) score += 5;
  if (uniqueSourceTypes.size >= 3) score += 5;
  
  return Math.min(Math.max(score, 5), 100);
}

// ============================================================================
// LAYER 4: AI DEEP EXTRACTION
// ============================================================================

const PRECISION_SYSTEM_PROMPT = `You are a precision product identification engine. Your ONLY job is to find real, purchasable products mentioned in content.

RULES:
1. A product MUST have a brand name, model name, or specific product identifier
2. Generic categories are NOT products ("wireless earbuds" ≠ product, "AirPods Pro 2" = product)
3. If content says "best running shoes" without naming specific shoes, that's NOT a product
4. Look for products in: headings, bold text, numbered lists, comparison sections, inline mentions
5. Extract the EXACT text as it appears in the content
6. Each product must be searchable on Amazon

OUTPUT FORMAT - Return ONLY valid JSON:
{
  "products": [
    {
      "name": "exact product name as written",
      "brand": "brand name",
      "model": "model identifier if any",
      "searchQuery": "optimized Amazon search query",
      "mentionQuote": "exact 10-40 char quote from content showing mention",
      "paragraphNumber": 0,
      "confidence": 85,
      "reasoning": "brief reason why this is a real product"
    }
  ],
  "contentType": "review|listicle|comparison|how-to|informational",
  "comparisonDetected": false
}`;

const PRECISION_USER_PROMPT = `TITLE: {{TITLE}}

CONTENT (with paragraph numbers):
{{NUMBERED_CONTENT}}

PREVIOUSLY DETECTED (verify these):
{{PRE_DETECTED}}

Find ALL purchasable products. Be thorough but precise.`;

async function aiDeepExtraction(
  title: string,
  paragraphs: ParagraphBlock[],
  existingCandidates: DetectedCandidate[],
  config: AppConfig
): Promise<{
  aiCandidates: Array<{
    name: string;
    brand?: string;
    model?: string;
    searchQuery: string;
    paragraphNumber: number;
    confidence: number;
  }>;
  contentType: string;
  comparisonDetected: boolean;
}> {
  // Build numbered content for precise paragraph references
  const numberedContent = paragraphs
    .map((p, i) => `[P${i}] ${p.text}`)
    .join('\n\n');
  
  const preDetectedList = existingCandidates.length > 0
    ? existingCandidates.map((c, i) =>
        `${i + 1}. "${c.canonicalName}" (${c.sources[0]?.type}, conf: ${c.confidence})`
      ).join('\n')
    : 'None pre-detected';
  
  const prompt = PRECISION_USER_PROMPT
    .replace('{{TITLE}}', title)
    .replace('{{NUMBERED_CONTENT}}', numberedContent.substring(0, 15000))
    .replace('{{PRE_DETECTED}}', preDetectedList);
  
  try {
    const response = await callAIProvider(
      config,
      PRECISION_SYSTEM_PROMPT,
      prompt,
      { temperature: 0.2, jsonMode: true, maxTokens: 4096 }
    );
    
    const jsonMatch = response.text.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response.text);
    
    return {
      aiCandidates: parsed.products || [],
      contentType: parsed.contentType || 'informational',
      comparisonDetected: parsed.comparisonDetected || false,
    };
  } catch {
    return { aiCandidates: [], contentType: 'informational', comparisonDetected: false };
  }
}

// ============================================================================
// LAYER 5: CROSS-VALIDATION & DEDUPLICATION
// ============================================================================

function fuzzyKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(w => w.length > 1)
    .slice(0, 5)
    .join('_');
}

function fuzzyMatch(a: string, b: string): number {
  const keyA = fuzzyKey(a);
  const keyB = fuzzyKey(b);
  
  if (keyA === keyB) return 1.0;
  
  const wordsA = keyA.split('_');
  const wordsB = keyB.split('_');
  
  // Check if one is a subset of the other
  const intersection = wordsA.filter(w => wordsB.includes(w));
  const union = new Set([...wordsA, ...wordsB]);
  
  // Jaccard similarity
  const jaccard = intersection.length / union.size;
  
  // Also check if shorter is contained in longer
  const shorter = keyA.length < keyB.length ? keyA : keyB;
  const longer = keyA.length < keyB.length ? keyB : keyA;
  const containment = longer.includes(shorter) ? 0.3 : 0;
  
  return Math.min(jaccard + containment, 1.0);
}

function mergeCandidates(candidates: DetectedCandidate[]): DetectedCandidate[] {
  const merged: DetectedCandidate[] = [];
  const used = new Set<number>();
  
  for (let i = 0; i < candidates.length; i++) {
    if (used.has(i)) continue;
    
    let primary = { ...candidates[i] };
    primary.nameVariants = [...primary.nameVariants];
    primary.sources = [...primary.sources];
    primary.paragraphIndices = [...primary.paragraphIndices];
    
    for (let j = i + 1; j < candidates.length; j++) {
      if (used.has(j)) continue;
      
      const similarity = fuzzyMatch(primary.canonicalName, candidates[j].canonicalName);
      const sameAsin = primary.asin && candidates[j].asin && primary.asin === candidates[j].asin;
      
      if (similarity >= 0.6 || sameAsin) {
        used.add(j);
        
        // Merge into primary
        primary.nameVariants.push(...candidates[j].nameVariants);
        primary.sources.push(...candidates[j].sources);
        
        for (const pIdx of candidates[j].paragraphIndices) {
          if (!primary.paragraphIndices.includes(pIdx)) {
            primary.paragraphIndices.push(pIdx);
          }
        }
        
        // Take ASIN if we don't have one
        if (!primary.asin && candidates[j].asin) {
          primary.asin = candidates[j].asin;
        }
        
        // Take the more specific brand
        if (!primary.brand && candidates[j].brand) {
          primary.brand = candidates[j].brand;
        }
        
        // Take the longer/better name
        if (candidates[j].canonicalName.length > primary.canonicalName.length) {
          primary.canonicalName = candidates[j].canonicalName;
        }
        
        // Take category hint
        if (!primary.categoryHint && candidates[j].categoryHint) {
          primary.categoryHint = candidates[j].categoryHint;
        }
      }
    }
    
    // Deduplicate name variants
    primary.nameVariants = [...new Set(primary.nameVariants)];
    primary.paragraphIndices.sort((a, b) => a - b);
    
    // Pick best search query
    primary.searchQuery = buildOptimalSearchQuery(primary);
    
    merged.push(primary);
  }
  
  return merged;
}

function buildOptimalSearchQuery(candidate: DetectedCandidate): string {
  // If we have a clean brand + model, use that
  if (candidate.brand && candidate.model) {
    const brandName = BRAND_DATABASE[candidate.brand]?.aliases[0] || candidate.brand;
    return `${brandName} ${candidate.model}`.trim();
  }
  
  // Otherwise clean the canonical name
  let query = candidate.canonicalName
    .replace(/\([^)]*\)/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  
  const stopWords = new Set(['the', 'a', 'an', 'new', 'best', 'top', 'review', 'our', 'my', 'your', 'this', 'that', 'with', 'for']);
  const words = query.split(' ').filter(w => !stopWords.has(w.toLowerCase()));
  
  return words.slice(0, 7).join(' ');
}

// ============================================================================
// LAYER 6: AMAZON VERIFICATION
// ============================================================================

class SerpApiError extends Error {
  public readonly isFatal: boolean;
  constructor(message: string, isFatal: boolean = false) {
    super(message);
    this.name = 'SerpApiError';
    this.isFatal = isFatal;
  }
}

async function verifyWithAmazon(
  candidates: DetectedCandidate[],
  config: AppConfig,
  onProgress?: (current: number, total: number) => void
): Promise<ProductDetails[]> {
  if (!config.serpApiKey?.trim()) {
    throw new Error('SerpAPI key is required for product verification. Add it in Settings > Amazon.');
  }
  
  const products: ProductDetails[] = [];
  const total = Math.min(candidates.length, 15);
  let fatalError: string | null = null;
  
  // Process in batches of 3 with delays
  for (let i = 0; i < total; i++) {
    if (fatalError) break;
    
    const candidate = candidates[i];
    onProgress?.(i + 1, total);
    
    try {
      let productData: Partial<ProductDetails> = {};
      
      // Try ASIN first if available
      if (candidate.asin) {
        try {
          const result = await fetchProductByASIN(candidate.asin, config.serpApiKey!);
          if (result) productData = result;
        } catch (e: any) {
          if (e.message?.includes('401') || e.message?.includes('Invalid')) {
            fatalError = e.message;
            break;
          }
        }
      }
      
      // Search if no ASIN result
      if (!productData.asin) {
        try {
          productData = await searchAmazonProduct(
            candidate.searchQuery,
            config.serpApiKey!
          );
        } catch (e: any) {
          if (e.message?.includes('401') || e.message?.includes('Invalid')) {
            fatalError = e.message;
            break;
          }
          continue;
        }
      }
      
      if (!productData.asin) continue;
      
      const product: ProductDetails = {
        id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: productData.title || candidate.canonicalName,
        asin: productData.asin!,
        price: (productData.price && productData.price !== '$XX.XX') ? productData.price : 'See Price',
        imageUrl: productData.imageUrl || '',
        rating: productData.rating || 4.5,
        reviewCount: productData.reviewCount || 0,
        verdict: productData.verdict || '',
        evidenceClaims: productData.evidenceClaims || [],
        brand: productData.brand || candidate.brand || '',
        category: candidate.categoryHint || 'General',
        prime: productData.prime ?? true,
        insertionIndex: candidate.bestPlacementIndex,
        deploymentMode: 'ELITE_BENTO' as DeploymentMode,
        faqs: productData.faqs || [],
        specs: productData.specs || {},
        confidence: candidate.confidence,
        exactMention: candidate.firstMention,
        paragraphIndex: candidate.paragraphIndices[0] ?? 0,
      };
      
      products.push(product);
      
      // Rate limit
      if (i < total - 1) {
        await new Promise(r => setTimeout(r, 150));
      }
    } catch {
      continue;
    }
  }
  
  if (fatalError && products.length === 0) {
    throw new Error(`SerpAPI Error: ${fatalError}`);
  }
  
  return products;
}

// ============================================================================
// HELPERS
// ============================================================================

function detectBrandFromName(name: string): string | undefined {
  const lower = name.toLowerCase();
  
  // Check multi-word brands first (longer match wins)
  const sortedAliases = [...BRAND_ALIAS_MAP.entries()]
    .sort((a, b) => b[0].length - a[0].length);
  
  for (const [alias, brand] of sortedAliases) {
    if (lower.includes(alias)) {
      return brand;
    }
  }
  
  return undefined;
}

function findParagraphForPosition(
  position: number,
  fullHtml: string,
  paragraphs: ParagraphBlock[]
): number {
  let charCount = 0;
  for (const para of paragraphs) {
    const paraStart = fullHtml.indexOf(para.html, charCount);
    if (paraStart === -1) continue;
    const paraEnd = paraStart + para.html.length;
    if (position >= paraStart && position <= paraEnd) {
      return para.index;
    }
    charCount = paraEnd;
  }
  return 0;
}

function extractQuote(text: string, position: number, matchLength: number): string {
  const start = Math.max(0, position - 15);
  const end = Math.min(text.length, position + matchLength + 15);
  return text.substring(start, end).trim();
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

export async function detectProductsPrecision(
  title: string,
  htmlContent: string,
  config: AppConfig,
  options?: {
    onProgress?: (stage: string, current: number, total: number) => void;
    skipAI?: boolean;
  }
): Promise<{
  products: ProductDetails[];
  comparison?: ComparisonData;
  contentType: string;
  candidateCount: number;
}> {
  const { onProgress, skipAI = false } = options || {};
  
  // === STAGE 1: Parse content into paragraphs ===
  onProgress?.('Parsing content structure...', 0, 6);
  const paragraphs = parseIntoParagraphs(htmlContent);
  
  // === STAGE 2: Structural extraction (ASINs, links) ===
  onProgress?.('Extracting structural signals...', 1, 6);
  const asinCandidates = extractAsinCandidates(htmlContent, paragraphs);
  
  // === STAGE 3: NLP pattern matching ===
  onProgress?.('Pattern matching brands & models...', 2, 6);
  const patternCandidates = extractBrandModelCandidates(paragraphs);
  
  // === STAGE 4: Merge structural + pattern candidates ===
  let allCandidates = mergeCandidates([...asinCandidates, ...patternCandidates]);
  
  // === STAGE 5: AI deep extraction (optional) ===
  if (!skipAI && config.aiProvider) {
    onProgress?.('AI deep analysis...', 3, 6);
    try {
      const { aiCandidates, contentType, comparisonDetected } = await aiDeepExtraction(
        title, paragraphs, allCandidates, config
      );
      
      // Convert AI candidates to DetectedCandidate format
      const aiDetected: DetectedCandidate[] = aiCandidates
        .filter(ai => ai.confidence >= 50)
        .map(ai => ({
          canonicalName: ai.name,
          nameVariants: [ai.name],
          brand: ai.brand || detectBrandFromName(ai.name),
          model: ai.model,
          sources: [{
            type: 'ai_extraction' as const,
            confidence: ai.confidence,
            rawMatch: ai.name,
            position: 0,
          }],
          confidence: 0,
          searchQuery: ai.searchQuery || ai.name,
          paragraphIndices: [ai.paragraphNumber || 0],
          firstMention: ai.name,
          bestPlacementIndex: ai.paragraphNumber || 0,
          categoryHint: '',
        }));
      
      // Re-merge with AI results
      allCandidates = mergeCandidates([...allCandidates, ...aiDetected]);
    } catch {
      // AI failed, continue with pattern-only results
    }
  }
  
  // === STAGE 6: Calibrate confidence scores ===
  onProgress?.('Calibrating confidence scores...', 4, 6);
  for (const candidate of allCandidates) {
    candidate.confidence = calibrateConfidence(candidate, paragraphs, allCandidates.length);
  }
  
  // Sort by confidence (highest first)
  allCandidates.sort((a, b) => b.confidence - a.confidence);
  
  // Filter low-confidence candidates
  const viableCandidates = allCandidates.filter(c => c.confidence >= 35);
  
  // === STAGE 7: Amazon verification ===
  onProgress?.('Verifying with Amazon...', 5, 6);
  const products = await verifyWithAmazon(viableCandidates, config, (current, total) => {
    onProgress?.(`Verifying product ${current}/${total}...`, 5, 6);
  });
  
  // Build comparison if applicable
  let comparison: ComparisonData | undefined;
  if (products.length >= 3) {
    comparison = {
      title: `${title} - Product Comparison`,
      productIds: products.slice(0, 10).map(p => p.id),
      specs: ['Price', 'Rating', 'Reviews'],
    };
  }
  
  return {
    products,
    comparison,
    contentType: 'informational',
    candidateCount: allCandidates.length,
  };
}

