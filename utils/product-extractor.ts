import { hashString } from '../utils';

export interface ExtractedProduct {
  name: string;
  brand?: string;
  model?: string;
  asin?: string;
  sourceType: 'amazon_link' | 'explicit_mention' | 'brand_model' | 'contextual';
  confidence: number;
  position: number;
  context: string;
  rawMatch: string;
}

export interface ProductExtractionResult {
  products: ExtractedProduct[];
  hasAmazonLinks: boolean;
  contentType: 'review' | 'listicle' | 'comparison' | 'how-to' | 'informational';
  productDensity: number;
}

const MAJOR_BRANDS = new Set([
  'apple', 'samsung', 'sony', 'lg', 'google', 'microsoft', 'amazon', 'nike', 'adidas',
  'nintendo', 'playstation', 'xbox', 'bose', 'jbl', 'beats', 'sennheiser', 'logitech',
  'razer', 'corsair', 'asus', 'acer', 'dell', 'hp', 'lenovo', 'dyson', 'shark', 'ninja',
  'kitchenaid', 'cuisinart', 'instant pot', 'vitamix', 'breville', 'keurig', 'nespresso',
  'philips', 'braun', 'oral-b', 'gillette', 'fitbit', 'garmin', 'polar', 'whoop',
  'canon', 'nikon', 'fujifilm', 'gopro', 'dji', 'anker', 'belkin', 'jabra', 'skullcandy',
  'under armour', 'the north face', 'patagonia', 'columbia', 'yeti', 'hydroflask',
  'roomba', 'irobot', 'eufy', 'ecovacs', 'roborock', 'weber', 'traeger', 'blackstone',
  'dewalt', 'makita', 'milwaukee', 'bosch', 'ryobi', 'craftsman', 'stanley', 'leatherman',
  'osprey', 'gregory', 'rei', 'kelty', 'thule', 'yakima', 'roku', 'fire tv', 'chromecast',
  'kindle', 'kobo', 'remarkable', 'oculus', 'meta quest', 'valve', 'steam deck',
  'secretlab', 'herman miller', 'steelcase', 'autonomous', 'flexispot', 'uplift',
  'peloton', 'nordictrack', 'bowflex', 'theragun', 'hypervolt', 'oura', 'whoop',
  'airpods', 'galaxy buds', 'pixel buds', 'raycon', 'nothing', 'oneplus', 'xiaomi',
  'oppo', 'realme', 'motorola', 'tcl', 'hisense', 'vizio', 'insignia', 'westinghouse',
]);

const PRODUCT_INDICATORS = [
  'review', 'tested', 'hands-on', 'unboxing', 'comparison', 'vs', 'versus',
  'best', 'top', 'recommend', 'pick', 'choice', 'favorite', 'worth',
  'buy', 'purchase', 'price', 'cost', 'deal', 'sale', 'discount',
  'features', 'specs', 'specifications', 'performance', 'battery life',
  'pros', 'cons', 'advantages', 'disadvantages', 'drawbacks',
  'rating', 'score', 'stars', 'verdict', 'conclusion',
];

export function extractAmazonASINs(content: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const seen = new Set<string>();

  const patterns = [
    /amazon\.com\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})(?:[\/\?\s]|$)/gi,
    /amzn\.to\/[a-zA-Z0-9]+/gi,
    /amazon\.com\/[^\/\s"'<>]+\/dp\/([A-Z0-9]{10})/gi,
    /\/(B0[A-Z0-9]{8})[\/\?\s"'<>]/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const asin = match[1]?.toUpperCase();
      if (asin && !seen.has(asin) && /^[A-Z0-9]{10}$/.test(asin)) {
        seen.add(asin);

        const startPos = Math.max(0, match.index - 100);
        const endPos = Math.min(content.length, match.index + match[0].length + 100);
        const context = content.substring(startPos, endPos);

        products.push({
          name: `Product ${asin}`,
          asin,
          sourceType: 'amazon_link',
          confidence: 100,
          position: match.index,
          context,
          rawMatch: match[0],
        });
      }
    }
  }

  return products;
}

export function extractBrandProductMentions(content: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const seen = new Set<string>();
  const contentLower = content.toLowerCase();

  const brandModelPatterns = [
    /\b(Apple|Samsung|Sony|Google|Microsoft|Amazon|Nike|Nintendo|Bose|JBL|Dyson|Ninja|KitchenAid|Canon|Nikon|GoPro|DJI|Anker|Fitbit|Garmin|Roku)\s+([A-Za-z0-9][\w\s\-\.]+?)(?=[\.\,\!\?\;\:\)\]\"\']|\s+(?:is|are|was|were|has|have|with|for|and|or|but|features|offers|comes|includes|provides|delivers|boasts))/gi,

    /\b(AirPods|Galaxy\s*(?:Buds|Watch|Tab|S\d+|Z\s*(?:Fold|Flip))|Pixel\s*(?:\d+|Buds|Watch)|Surface\s*(?:Pro|Laptop|Go|Book)|Fire\s*(?:TV|Stick|Tablet)|Echo\s*(?:Dot|Show|Studio)?|Kindle\s*(?:Paperwhite|Oasis|Scribe)?|PlayStation\s*\d*|Xbox\s*(?:Series\s*[XS])?|Switch\s*(?:OLED|Lite)?|Quest\s*\d*|MacBook\s*(?:Air|Pro)?|iPad\s*(?:Pro|Air|Mini)?|iMac|iPhone\s*(?:\d+)?|Apple\s*Watch)\s*(?:\d+)?(?:\s*(?:Pro|Max|Ultra|Plus|Mini|SE|Gen\s*\d+))?/gi,

    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+((?:[A-Z]{2,}[\-]?[A-Z0-9]*|[A-Z][a-z]*\d+[A-Za-z]*|\d{3,4}[A-Za-z]+)(?:\s+(?:Pro|Max|Ultra|Plus|Mini|SE|Gen\s*\d+))?)/g,

    /\b(Instant\s*Pot|Vitamix|Breville|KitchenAid|Cuisinart|Ninja|Nutribullet)\s+([\w\s\-]+?)(?=[\.\,\!\?]|\s+(?:is|are|was|has|with|for))/gi,

    /\b(Roomba|iRobot|Eufy|Ecovacs|Roborock|Shark)\s+([\w\s\d]+?)(?=[\.\,\!\?]|\s+(?:is|are|was|has|with|for|robot))/gi,
  ];

  for (const pattern of brandModelPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const fullMatch = match[0].trim();
      const normalizedKey = fullMatch.toLowerCase().replace(/\s+/g, ' ');

      if (seen.has(normalizedKey) || fullMatch.length < 4) continue;

      const words = fullMatch.split(/\s+/);
      if (words.length < 2 && !MAJOR_BRANDS.has(words[0]?.toLowerCase())) continue;

      seen.add(normalizedKey);

      const startPos = Math.max(0, match.index - 150);
      const endPos = Math.min(content.length, match.index + fullMatch.length + 150);
      const context = content.substring(startPos, endPos);

      const brand = match[1] || '';
      const model = match[2] || '';

      let confidence = 70;
      if (MAJOR_BRANDS.has(brand.toLowerCase())) confidence += 15;
      if (/\d/.test(fullMatch)) confidence += 10;
      if (model.length > 2) confidence += 5;

      const contextLower = context.toLowerCase();
      const indicatorCount = PRODUCT_INDICATORS.filter(ind => contextLower.includes(ind)).length;
      confidence += Math.min(indicatorCount * 3, 15);

      confidence = Math.min(confidence, 98);

      products.push({
        name: fullMatch,
        brand,
        model,
        sourceType: 'brand_model',
        confidence,
        position: match.index,
        context,
        rawMatch: fullMatch,
      });
    }
  }

  return products;
}

export function extractProductListItems(content: string): ExtractedProduct[] {
  const products: ExtractedProduct[] = [];
  const seen = new Set<string>();

  const listPatterns = [
    /(?:^|\n)\s*(?:\d+[\.\)\:]|[\*\-\•])\s*\*?\*?([A-Z][A-Za-z0-9\s\-]+?(?:\s+(?:Pro|Max|Ultra|Plus|Mini|SE|\d+))?)\*?\*?\s*[\-\–\—:]/gm,
    /<h[2-4][^>]*>(?:<[^>]+>)*([^<]+(?:Pro|Max|Ultra|Plus|Mini|SE|\d+)?[^<]*)(?:<[^>]+>)*<\/h[2-4]>/gi,
    /\b(?:the\s+)?(?:new\s+)?([A-Z][A-Za-z]+(?:\s+[A-Z][a-z]+)*\s+(?:[A-Z]{2,}[\-]?\d*[A-Za-z]*|\d{3,}[A-Za-z]*))\b/g,
  ];

  for (const pattern of listPatterns) {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const productName = (match[1] || '').trim()
        .replace(/<[^>]+>/g, '')
        .replace(/\*+/g, '')
        .trim();

      if (!productName || productName.length < 5 || productName.length > 80) continue;

      const normalizedKey = productName.toLowerCase().replace(/\s+/g, ' ');
      if (seen.has(normalizedKey)) continue;

      const words = productName.split(/\s+/);
      const hasNumber = /\d/.test(productName);
      const hasUppercase = /[A-Z]/.test(productName.slice(1));

      if (words.length < 2 && !hasNumber) continue;

      seen.add(normalizedKey);

      const startPos = Math.max(0, match.index - 100);
      const endPos = Math.min(content.length, match.index + match[0].length + 100);
      const context = content.substring(startPos, endPos);

      let confidence = 60;
      if (hasNumber) confidence += 15;
      if (hasUppercase) confidence += 10;

      const firstWord = words[0]?.toLowerCase() || '';
      if (MAJOR_BRANDS.has(firstWord)) confidence += 20;

      products.push({
        name: productName,
        sourceType: 'contextual',
        confidence: Math.min(confidence, 90),
        position: match.index,
        context,
        rawMatch: match[0],
      });
    }
  }

  return products;
}

export function deduplicateProducts(products: ExtractedProduct[]): ExtractedProduct[] {
  const grouped = new Map<string, ExtractedProduct[]>();

  for (const product of products) {
    const key = normalizeProductKey(product.name);
    const existing = grouped.get(key) || [];
    existing.push(product);
    grouped.set(key, existing);
  }

  const deduplicated: ExtractedProduct[] = [];

  for (const [, group] of grouped) {
    group.sort((a, b) => b.confidence - a.confidence);
    const best = group[0];

    if (group.length > 1) {
      best.confidence = Math.min(best.confidence + 5, 100);
    }

    const asinProduct = group.find(p => p.asin);
    if (asinProduct && best !== asinProduct) {
      best.asin = asinProduct.asin;
      best.confidence = Math.min(best.confidence + 10, 100);
    }

    deduplicated.push(best);
  }

  return deduplicated.sort((a, b) => a.position - b.position);
}

function normalizeProductKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .slice(0, 4)
    .join('_');
}

export function detectContentType(content: string): 'review' | 'listicle' | 'comparison' | 'how-to' | 'informational' {
  const contentLower = content.toLowerCase();

  const comparisonIndicators = ['vs', 'versus', 'compared to', 'comparison', 'which is better', 'difference between'];
  if (comparisonIndicators.some(ind => contentLower.includes(ind))) {
    return 'comparison';
  }

  const listiclePatterns = [
    /\b(?:top|best)\s+\d+\b/i,
    /\d+\s+(?:best|top|must-have)/i,
    /(?:^|\n)\s*(?:\d+[\.\)]|[\*\-\•])\s*[A-Z]/gm,
  ];
  let listItemCount = 0;
  for (const pattern of listiclePatterns) {
    const matches = content.match(pattern);
    if (matches) listItemCount += matches.length;
  }
  if (listItemCount >= 5) {
    return 'listicle';
  }

  const reviewIndicators = ['review', 'tested', 'hands-on', 'verdict', 'pros and cons', 'our take', 'final thoughts'];
  if (reviewIndicators.some(ind => contentLower.includes(ind))) {
    return 'review';
  }

  const howToIndicators = ['how to', 'step by step', 'tutorial', 'guide', 'instructions', 'steps:'];
  if (howToIndicators.some(ind => contentLower.includes(ind))) {
    return 'how-to';
  }

  return 'informational';
}

export function extractAllProducts(content: string): ProductExtractionResult {
  const asinProducts = extractAmazonASINs(content);
  const brandProducts = extractBrandProductMentions(content);
  const listProducts = extractProductListItems(content);

  const allProducts = [...asinProducts, ...brandProducts, ...listProducts];
  const deduplicated = deduplicateProducts(allProducts);

  const contentType = detectContentType(content);
  const wordCount = content.split(/\s+/).length;
  const productDensity = deduplicated.length / (wordCount / 500);

  return {
    products: deduplicated,
    hasAmazonLinks: asinProducts.length > 0,
    contentType,
    productDensity,
  };
}

export function buildOptimalSearchQuery(product: ExtractedProduct): string {
  if (product.brand && product.model) {
    return `${product.brand} ${product.model}`.trim();
  }

  let query = product.name
    .replace(/\([^)]*\)/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopWords = ['the', 'a', 'an', 'new', 'best', 'top', 'review', 'our', 'my', 'your'];
  const words = query.split(' ').filter(w => !stopWords.includes(w.toLowerCase()));

  return words.slice(0, 6).join(' ');
}
