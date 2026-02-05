/**
 * ============================================================================
 * AmzWP-Automator | Enterprise Utility Module v90.0
 * ============================================================================
 * 
 * SOTA Features:
 * - Smart CORS Proxy System with Latency Tracking & Failover
 * - Request Deduplication & Concurrent Processing
 * - Intelligent LRU Caching (localStorage + IndexedDB ready)
 * - Exponential Backoff Retry Logic
 * - Secure Storage (Web Crypto API + Sync Fallback)
 * - Multi-Provider AI Abstraction Layer
 * - WordPress REST API Integration
 * - SerpAPI Amazon Product Search
 * - Content Analysis & Product Detection
 * - Product Box HTML Generation (Multiple Styles)
 * - Comparison Table Generation
 * - Schema.org JSON-LD Generation
 * - URL Validation & Normalization
 * 
 * ============================================================================
 */

import { 
  AppConfig, 
  BlogPost, 
  ProductDetails, 
  DeploymentMode, 
  AIProvider, 
  ComparisonData, 
  FAQItem,
  BoxStyle 
} from './types';

// ============================================================================
// CACHE & STORAGE CLASSES
// ============================================================================

/**
 * Intelligent LRU Cache with localStorage persistence
 */
class IntelligenceCacheClass {
  private cache = new Map<string, CacheEntry<unknown>>();
  private maxSize = 500;

  get<T>(key: string): T | null {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const entry = this.cache.get(fullKey);
    
    if (entry) {
      const ttl = entry.ttl || CACHE_TTL_MS;
      if (Date.now() - entry.timestamp < ttl && entry.version === CACHE_VERSION) {
        return entry.data as T;
      }
      this.cache.delete(fullKey);
    }
    
    // Try localStorage
    try {
      const stored = localStorage.getItem(fullKey);
      if (stored) {
        const parsed: CacheEntry<T> = JSON.parse(stored);
        const ttl = parsed.ttl || CACHE_TTL_MS;
        if (Date.now() - parsed.timestamp < ttl && parsed.version === CACHE_VERSION) {
          this.cache.set(fullKey, parsed);
          return parsed.data;
        }
        localStorage.removeItem(fullKey);
      }
    } catch {}
    
    return null;
  }

  set<T>(key: string, data: T, ttl?: number): void {
    const fullKey = `${CACHE_PREFIX}${key}`;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION,
      ttl,
    };
    
    this.cache.set(fullKey, entry);
    
    // Persist to localStorage
    try {
      localStorage.setItem(fullKey, JSON.stringify(entry));
    } catch {}
    
    // LRU eviction
    if (this.cache.size > this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
        try {
          localStorage.removeItem(firstKey);
        } catch {}
      }
    }
  }

  getAnalysis(hash: string): { products: ProductDetails[]; comparison?: ComparisonData } | null {
    return this.get(`analysis_${hash}`);
  }

  setAnalysis(hash: string, data: { products: ProductDetails[]; comparison?: ComparisonData }): void {
    this.set(`analysis_${hash}`, data, CACHE_TTL_SHORT_MS);
  }

  getProduct(asin: string): ProductDetails | null {
    return this.get(`product_${asin}`);
  }

  setProduct(asin: string, product: ProductDetails): void {
    this.set(`product_${asin}`, product, CACHE_TTL_MS);
  }

  deleteProduct(asin: string): void {
    const key = `${CACHE_PREFIX}product_${asin}`;
    this.cache.delete(key);
    try {
      localStorage.removeItem(key);
    } catch {}
  }

  clear(): void {
    this.cache.clear();
    try {
      const keys = Object.keys(localStorage).filter(k => k.startsWith(CACHE_PREFIX));
      keys.forEach(k => localStorage.removeItem(k));
    } catch {}
  }
}


export const IntelligenceCache = new IntelligenceCacheClass();

/**
 * Secure Storage with Web Crypto API (simplified - sync fallback)
 */
class SecureStorageClass {
  // For simplicity, using base64 encoding as "encryption"
  // In production, implement proper Web Crypto API encryption
  
  encryptSync(text: string): string {
    if (!text) return '';
    try {
      return btoa(text);
    } catch {
      return text;
    }
  }

  decryptSync(encrypted: string): string {
    if (!encrypted) return '';
    try {
      return atob(encrypted);
    } catch {
      return encrypted;
    }
  }
}

export   const SecureStorage = new SecureStorageClass();




// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

export const hashString = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
};

const truncate = (str: string, maxLength: number): string => {
  if (!str) return '';
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

const stripHtml = (html: string): string => {
  if (!html) return '';
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
};

const sleep = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms));




// ============================================================================
// CONSTANTS & CONFIGURATION
// ============================================================================

const CACHE_PREFIX = 'amzwp_cache_v6_';
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_TTL_SHORT_MS = 60 * 60 * 1000; // 1 hour for volatile data
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 1000;
const MAX_CONCURRENT_REQUESTS = 10;
const SITEMAP_FETCH_TIMEOUT_MS = 20000;
const PAGE_FETCH_TIMEOUT_MS = 15000;
const API_TIMEOUT_MS = 30000;

// Version for cache invalidation
const CACHE_VERSION = 'v6';

const upgradeAmazonImageToHighRes = (imageUrl: string): string => {
  if (!imageUrl || typeof imageUrl !== 'string') return '';

  const amazonImagePatterns = [
    /\._[A-Z]{2}_[A-Z]{2}\d+_\./i,
    /\._[A-Z]{2}_[A-Z]+\d+[A-Z]*_\./i,
    /\._[A-Z]{2}\d+_\./i,
    /\._S[LXYZ]\d+_\./i,
    /\._U[SXYZ]\d+_\./i,
    /\._[A-Z]+\d+[A-Z]*_\./i,
  ];

  let upgradedUrl = imageUrl;

  for (const pattern of amazonImagePatterns) {
    if (pattern.test(upgradedUrl)) {
      upgradedUrl = upgradedUrl.replace(pattern, '._AC_SL1500_.');
      break;
    }
  }

  if (upgradedUrl === imageUrl && imageUrl.includes('m.media-amazon.com')) {
    const lastDotIndex = imageUrl.lastIndexOf('.');
    const secondLastDotIndex = imageUrl.lastIndexOf('.', lastDotIndex - 1);
    if (secondLastDotIndex > 0) {
      const beforeModifier = imageUrl.substring(0, secondLastDotIndex);
      const extension = imageUrl.substring(lastDotIndex);
      upgradedUrl = `${beforeModifier}._AC_SL1500_${extension}`;
    }
  }

  console.log('[ImageUpgrade] Original:', imageUrl.substring(0, 80), '-> High-res:', upgradedUrl.substring(0, 80));
  return upgradedUrl;
};

// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

interface ProxyConfig {
  name: string;
  transform: (url: string) => string;
  timeout: number;
  priority: number;
  headers?: Record<string, string>;
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: string;
  ttl?: number;
}

interface AIResponse {
  text: string;
  usage?: { 
    promptTokens: number; 
    completionTokens: number;
    totalTokens?: number;
  };
  model?: string;
  finishReason?: string;
}

interface AnalysisResult {
  detectedProducts: ProductDetails[];
  comparison?: ComparisonData;
  contentType: string;
  monetizationPotential: 'high' | 'medium' | 'low';
  keywords?: string[];
  suggestedPlacements?: number[];
}

interface ConnectionTestResult {
  success: boolean;
  message: string;
  userInfo?: {
    id: number;
    name: string;
    roles: string[];
  };
  siteInfo?: {
    name: string;
    url: string;
    version: string;
  };
}

// ============================================================================
// CORS PROXY SYSTEM - ENTERPRISE GRADE WITH MULTIPLE FALLBACKS
// ============================================================================

const CORS_PROXIES = [
  {
    name: 'corsproxy-org',
    transform: (url: string) => `https://corsproxy.org/?${encodeURIComponent(url)}`,
    timeout: 12000,
  },
  {
    name: 'allorigins-raw',
    transform: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    timeout: 15000,
  },
  {
    name: 'cors-anywhere-herokuapp',
    transform: (url: string) => `https://cors-anywhere.herokuapp.com/${url}`,
    timeout: 12000,
  },
  {
    name: 'crossorigin-me',
    transform: (url: string) => `https://crossorigin.me/${url}`,
    timeout: 12000,
  },
  {
    name: 'allorigins-get',
    transform: (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}`,
    timeout: 15000,
    parseJson: true,
  },
];

const proxyLatencyMap = new Map<string, number>();
const proxyFailureCount = new Map<string, number>();
const proxySuccessCount = new Map<string, number>();

const getSortedProxies = () => {
  return [...CORS_PROXIES].sort((a, b) => {
    const failuresA = proxyFailureCount.get(a.name) ?? 0;
    const failuresB = proxyFailureCount.get(b.name) ?? 0;
    if (failuresA !== failuresB) return failuresA - failuresB;
    const latencyA = proxyLatencyMap.get(a.name) ?? 999999;
    const latencyB = proxyLatencyMap.get(b.name) ?? 999999;
    return latencyA - latencyB;
  });
};

const fetchWithTimeout = async (url: string, timeout: number, options: RequestInit = {}): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    throw error;
  }
};

export const fetchWithSmartProxy = async (url: string, options: { timeout?: number } = {}): Promise<string> => {
  const { timeout = 20000 } = options;
  const sortedProxies = getSortedProxies();
  const errors: string[] = [];

  // Try direct fetch first (for same-origin or CORS-enabled sites)
  try {
    console.log(`[Fetch] Direct: ${url.substring(0, 60)}...`);
    const response = await fetchWithTimeout(url, 8000, {
      headers: { 'Accept': 'text/xml, application/xml, text/html, */*' },
      mode: 'cors',
    });
    if (response.ok) {
      const text = await response.text();
      if (text && text.length > 50 && text.includes('<')) {
        console.log(`[Fetch] Direct succeeded!`);
        return text;
      }
    }
  } catch (e: any) {
    console.log(`[Fetch] Direct failed: ${e.message}`);
  }

  // Try each proxy
  for (const proxy of sortedProxies) {
    const startTime = Date.now();
    try {
      const proxyUrl = proxy.transform(url);
      console.log(`[Proxy] ${proxy.name}: ${url.substring(0, 50)}...`);

      const response = await fetchWithTimeout(proxyUrl, proxy.timeout || timeout, {
        headers: { 'Accept': 'text/xml, application/xml, text/html, application/json, */*' },
      });

      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      let text = await response.text();

      if ((proxy as any).parseJson && text.startsWith('{')) {
        try {
          const json = JSON.parse(text);
          text = json.contents || json.data || text;
        } catch {}
      }

      if (!text || text.length < 50) throw new Error('Empty response');

      const latency = Date.now() - startTime;
      proxyLatencyMap.set(proxy.name, latency);
      proxyFailureCount.set(proxy.name, 0);
      proxySuccessCount.set(proxy.name, (proxySuccessCount.get(proxy.name) ?? 0) + 1);
      console.log(`[Proxy] ${proxy.name} OK in ${latency}ms`);
      return text;

    } catch (error: any) {
      const errorMsg = error.name === 'AbortError' ? 'Timeout' : error.message;
      errors.push(`${proxy.name}: ${errorMsg}`);
      console.warn(`[Proxy] ${proxy.name} FAIL: ${errorMsg}`);
      proxyFailureCount.set(proxy.name, (proxyFailureCount.get(proxy.name) ?? 0) + 1);
      proxyLatencyMap.set(proxy.name, 999999);
    }
  }

  throw new Error(`All proxies failed: ${errors.join(', ')}`);
};

export const normalizeSitemapUrl = (input: string): string[] => {
  let url = input.trim().replace(/\/+$/, '');
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  if (url.includes('sitemap') && url.endsWith('.xml')) {
    return [url];
  }
  let baseUrl: string;
  try {
    const urlObj = new URL(url);
    baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    baseUrl = url;
  }
  return [
    `${baseUrl}/sitemap.xml`,
    `${baseUrl}/sitemap_index.xml`,
    `${baseUrl}/wp-sitemap.xml`,
    `${baseUrl}/sitemap-index.xml`,
    `${baseUrl}/post-sitemap.xml`,
    `${baseUrl}/page-sitemap.xml`,
    `${baseUrl}/sitemap-posts.xml`,
    `${baseUrl}/sitemap/sitemap.xml`,
    `${baseUrl}/sitemaps/sitemap.xml`,
    `${baseUrl}/sitemap1.xml`,
  ];
};

export const parseSitemapXml = (xml: string): string[] => {
  const urls: string[] = [];
  const sitemapMatches = xml.matchAll(/<sitemap[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/sitemap>/gi);
  const subSitemaps: string[] = [];
  for (const match of sitemapMatches) {
    const loc = match[1]?.trim();
    if (loc) subSitemaps.push(loc);
  }
  if (subSitemaps.length > 0) {
    return subSitemaps;
  }
  const urlMatches = xml.matchAll(/<url[^>]*>[\s\S]*?<loc>([^<]+)<\/loc>[\s\S]*?<\/url>/gi);
  for (const match of urlMatches) {
    const loc = match[1]?.trim();
    if (loc && !/\.(jpg|jpeg|png|gif|webp|svg|pdf|mp4|mp3|zip)$/i.test(loc)) {
      urls.push(loc);
    }
  }
  if (urls.length === 0) {
    const locMatches = xml.matchAll(/<loc>([^<]+)<\/loc>/gi);
    for (const match of locMatches) {
      const loc = match[1]?.trim();
      if (loc && loc.startsWith('http') && !/\.(jpg|jpeg|png|gif|webp|svg|pdf)$/i.test(loc)) {
        urls.push(loc);
      }
    }
  }
  return [...new Set(urls)];
};

const extractTitleFromUrl = (url: string): string => {
  try {
    const urlObj = new URL(url);
    const segments = urlObj.pathname.split('/').filter(s => s);
    const lastSegment = segments[segments.length - 1] || '';
    return lastSegment
      .replace(/[-_]/g, ' ')
      .replace(/\.\w+$/, '')
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ')
      .trim() || 'Untitled Page';
  } catch {
    return 'Untitled Page';
  }
};

export const createBlogPostFromUrl = (url: string, index: number): BlogPost => {
  return {
    id: Date.now() + index + Math.floor(Math.random() * 10000),
    title: extractTitleFromUrl(url),
    url: url.trim(),
    postType: 'post',
    priority: 'medium',
    monetizationStatus: 'opportunity',
  };
};

/**
 * Enterprise-grade sitemap fetching with WordPress REST API as primary method
 */
export const fetchAndParseSitemap = async (
  inputUrl: string,
  config: AppConfig
): Promise<BlogPost[]> => {
  console.log('[Sitemap] ===== STARTING ENTERPRISE SCAN =====');
  console.log('[Sitemap] Input URL:', inputUrl);

  // Extract base URL from input
  let baseUrl = inputUrl.trim().replace(/\/+$/, '');
  if (!baseUrl.startsWith('http://') && !baseUrl.startsWith('https://')) {
    baseUrl = 'https://' + baseUrl;
  }

  try {
    const urlObj = new URL(baseUrl);
    baseUrl = `${urlObj.protocol}//${urlObj.host}`;
  } catch {
    // Keep as-is if URL parsing fails
  }

  console.log('[Sitemap] Base URL:', baseUrl);

  // STRATEGY 1: WordPress REST API (Primary - Most Reliable, No CORS Issues)
  if (config.wpUrl && config.wpUser && config.wpAppPassword) {
    console.log('[Sitemap] Attempting WordPress REST API fetch...');
    try {
      const wpPosts = await fetchAllPostsViaWordPressAPI(config);
      if (wpPosts.length > 0) {
        console.log(`[Sitemap] WordPress REST API returned ${wpPosts.length} posts`);
        return wpPosts;
      }
    } catch (wpError: any) {
      console.warn('[Sitemap] WordPress REST API failed:', wpError.message);
    }
  }

  // STRATEGY 2: Try sitemap XML with proxies
  const sitemapUrls = normalizeSitemapUrl(inputUrl);
  const allPosts: BlogPost[] = [];
  const seenUrls = new Set<string>();
  let lastError = '';

  for (const sitemapUrl of sitemapUrls) {
    if (allPosts.length > 0) break;

    try {
      console.log(`[Sitemap] Trying: ${sitemapUrl}`);

      const xml = await fetchWithSmartProxy(sitemapUrl, { timeout: 30000 });

      if (!xml || xml.length < 100 || !xml.includes('<') || !xml.includes('loc')) {
        console.log('[Sitemap] Invalid response, skipping');
        continue;
      }

      const urls = parseSitemapXml(xml);
      console.log(`[Sitemap] Parsed ${urls.length} URLs from ${sitemapUrl}`);

      if (urls.length === 0) continue;

      // Check if this is a sitemap index
      const isIndex = urls.every(u => u.includes('sitemap') || u.endsWith('.xml'));

      if (isIndex) {
        console.log('[Sitemap] Detected sitemap index, fetching all sub-sitemaps...');

        // Fetch ALL sub-sitemaps concurrently for speed
        const subSitemapResults = await Promise.allSettled(
          urls.map(async (subUrl, idx) => {
            await sleep(idx * 100); // Stagger requests slightly
            console.log(`[Sitemap] Fetching sub-sitemap ${idx + 1}/${urls.length}: ${subUrl}`);
            const subXml = await fetchWithSmartProxy(subUrl, { timeout: 25000 });
            return parseSitemapXml(subXml);
          })
        );

        for (const result of subSitemapResults) {
          if (result.status === 'fulfilled' && result.value.length > 0) {
            for (const pageUrl of result.value) {
              const normalizedUrl = pageUrl.toLowerCase();
              if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                allPosts.push(createBlogPostFromUrl(pageUrl, allPosts.length));
              }
            }
          }
        }
      } else {
        for (const pageUrl of urls) {
          const normalizedUrl = pageUrl.toLowerCase();
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            allPosts.push(createBlogPostFromUrl(pageUrl, allPosts.length));
          }
        }
      }

    } catch (error: any) {
      lastError = error.message;
      console.warn(`[Sitemap] Failed: ${sitemapUrl} - ${error.message}`);
    }
  }

  console.log('[Sitemap] ===== SCAN COMPLETE =====');
  console.log(`[Sitemap] Total posts found: ${allPosts.length}`);

  if (allPosts.length === 0) {
    throw new Error(
      `Could not fetch posts from "${inputUrl}". ` +
      `For best results, configure WordPress REST API credentials. ` +
      `Last error: ${lastError || 'All methods failed'}`
    );
  }

  return allPosts;
};

/**
 * Fetch ALL posts via WordPress REST API with pagination
 */
const fetchAllPostsViaWordPressAPI = async (config: AppConfig): Promise<BlogPost[]> => {
  if (!config.wpUrl || !config.wpUser || !config.wpAppPassword) {
    throw new Error('WordPress credentials not configured');
  }

  const apiBase = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
  const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
  const allPosts: BlogPost[] = [];
  let page = 1;
  const perPage = 100;
  let hasMore = true;

  console.log('[WP-API] Fetching all posts with pagination...');

  while (hasMore) {
    try {
      const url = `${apiBase}/posts?page=${page}&per_page=${perPage}&status=publish&_fields=id,title,link,content`;

      console.log(`[WP-API] Fetching page ${page}...`);

      const response = await fetchWithTimeout(url, 20000, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      });

      if (!response.ok) {
        if (response.status === 400) {
          // No more pages
          hasMore = false;
          break;
        }
        throw new Error(`HTTP ${response.status}`);
      }

      const posts = await response.json();

      if (!posts || posts.length === 0) {
        hasMore = false;
        break;
      }

      console.log(`[WP-API] Page ${page}: Got ${posts.length} posts`);

      for (const post of posts) {
        const title = post.title?.rendered || 'Untitled';
        const content = post.content?.rendered || '';
        const link = post.link || '';

        // Calculate proper priority based on content analysis
        const analysis = analyzePostForPriority(title, content);

        allPosts.push({
          id: post.id,
          title: decodeHtmlEntities(title),
          url: link,
          postType: 'post',
          priority: analysis.priority,
          monetizationStatus: analysis.status,
        });
      }

      // Check if there are more pages
      const totalPages = parseInt(response.headers.get('X-WP-TotalPages') || '1', 10);
      hasMore = page < totalPages;
      page++;

      // Small delay between pages
      if (hasMore) await sleep(200);

    } catch (error: any) {
      console.error(`[WP-API] Page ${page} failed:`, error.message);
      hasMore = false;
    }
  }

  console.log(`[WP-API] Total posts fetched: ${allPosts.length}`);
  return allPosts;
};

/**
 * Decode HTML entities in string
 */
const decodeHtmlEntities = (text: string): string => {
  if (!text) return '';
  return text
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ');
};

/**
 * PURCHASABLE PRODUCTS - Physical items you can buy on Amazon
 * STRICT LIST: Only actual product types, not concepts/methods
 */
const PURCHASABLE_PRODUCTS = [
  'fitness tracker', 'fitness trackers', 'activity tracker', 'activity trackers',
  'smartwatch', 'smartwatches', 'smart watch', 'smart watches',
  'running shoes', 'running shoe', 'walking shoes', 'training shoes', 'cross trainers',
  'headphones', 'earbuds', 'earphones', 'bluetooth speaker', 'speakers',
  'heart rate monitor', 'hrm', 'chest strap', 'gps watch', 'running watch',
  'yoga mat', 'yoga mats', 'exercise mat', 'gym mat',
  'water bottle', 'water bottles', 'shaker bottle', 'protein shaker',
  'gym bag', 'gym bags', 'duffel bag', 'backpack', 'backpacks',
  'dumbbell', 'dumbbells', 'kettlebell', 'kettlebells', 'barbell', 'barbells',
  'weight plates', 'weight bench', 'squat rack', 'pull-up bar', 'power rack',
  'resistance band', 'resistance bands', 'exercise bands', 'loop bands',
  'foam roller', 'foam rollers', 'massage ball', 'lacrosse ball',
  'jump rope', 'jump ropes', 'speed rope', 'weighted rope',
  'treadmill', 'treadmills', 'elliptical', 'exercise bike', 'stationary bike', 'spin bike',
  'rowing machine', 'rowing machines', 'rower',
  'massage gun', 'massage guns', 'percussion massager', 'theragun', 'hypervolt',
  'blender', 'blenders', 'nutribullet', 'vitamix', 'ninja blender',
  'air fryer', 'instant pot', 'pressure cooker', 'food processor',
  'protein powder', 'whey protein', 'pre-workout', 'creatine', 'bcaa', 'supplements',
  'fitness gloves', 'lifting gloves', 'workout gloves', 'weight belt', 'lifting belt',
  'knee sleeves', 'wrist wraps', 'lifting straps', 'ab roller', 'ab wheel',
  'scale', 'scales', 'smart scale', 'body fat scale', 'weight scale',
  'sleep tracker', 'oura ring', 'whoop band', 'whoop strap',
  'compression socks', 'compression sleeves', 'arm sleeves',
];

/**
 * PRODUCT BRAND NAMES - Specific brands that make products
 */
const PRODUCT_BRANDS = [
  'fitbit', 'garmin', 'polar', 'suunto', 'coros', 'amazfit',
  'apple watch', 'samsung galaxy watch', 'google pixel watch',
  'whoop', 'oura', 'withings',
  'nike', 'adidas', 'under armour', 'reebok', 'puma',
  'asics', 'brooks', 'new balance', 'hoka', 'saucony', 'on cloud',
  'peloton', 'bowflex', 'nordictrack', 'proform', 'sole', 'schwinn',
  'rogue fitness', 'titan fitness', 'rep fitness', 'eleiko',
  'theragun', 'hyperice', 'hypervolt', 'timpro',
  'vitamix', 'nutribullet', 'ninja', 'cuisinart', 'kitchenaid',
  'optimum nutrition', 'myprotein', 'ghost', 'transparent labs',
  'bose', 'sony', 'jabra', 'beats', 'jbl', 'airpods',
];

/**
 * Check if title contains a purchasable product
 */
const titleContainsProduct = (title: string): boolean => {
  const t = title.toLowerCase();
  return PURCHASABLE_PRODUCTS.some(p => t.includes(p)) ||
         PRODUCT_BRANDS.some(b => t.includes(b.toLowerCase()));
};

/**
 * Extract what comes after "best/top X" in a title
 */
const extractBestSubject = (title: string): string | null => {
  const t = title.toLowerCase();
  const match = t.match(/(?:best|top)\s+(?:\d+\s+)?(.+?)(?:\s+for\s|\s+in\s|\s+of\s|\s+\d{4}|\s*[-:|]|\s*$)/i);
  return match ? match[1].trim() : null;
};

/**
 * Check if a subject is a purchasable product category
 */
const isProductSubject = (subject: string): boolean => {
  if (!subject) return false;
  const s = subject.toLowerCase();
  return PURCHASABLE_PRODUCTS.some(p => s.includes(p) || p.includes(s)) ||
         PRODUCT_BRANDS.some(b => s.includes(b.toLowerCase()));
};

/**
 * Analyze post to determine priority - STRICT PRODUCT-ONLY LOGIC
 */
const analyzePostForPriority = (title: string, content: string): {
  priority: 'critical' | 'high' | 'medium' | 'low';
  status: 'monetized' | 'opportunity';
} => {
  const titleLower = title.toLowerCase();
  const contentLower = content.toLowerCase();

  // Check for existing affiliate links (already monetized)
  const affiliatePatterns = [
    /amazon\.com\/.*?tag=/i,
    /amzn\.to\//i,
    /data-asin="[A-Z0-9]{10}"/i,
    /aawp-product/i,
    /wp-block-flavor/i,
    /class="[^"]*product-?box/i,
  ];

  if (affiliatePatterns.some(p => p.test(content))) {
    return { priority: 'low', status: 'monetized' };
  }

  // CRITICAL: "Best/Top X [PRODUCT]" where [PRODUCT] is purchasable
  const bestSubject = extractBestSubject(titleLower);
  if (bestSubject && isProductSubject(bestSubject)) {
    return { priority: 'critical', status: 'opportunity' };
  }

  // CRITICAL: "[PRODUCT] Review" or "[BRAND] Review"
  if (/\breview\b/i.test(titleLower) && titleContainsProduct(titleLower)) {
    return { priority: 'critical', status: 'opportunity' };
  }

  // CRITICAL: "[PRODUCT/BRAND] vs [PRODUCT/BRAND]"
  const vsMatch = titleLower.match(/(.+?)\s+(?:vs\.?|versus)\s+(.+?)(?:\s*[-:|]|\s*$)/i);
  if (vsMatch) {
    const p1 = vsMatch[1].trim();
    const p2 = vsMatch[2].trim();
    if ((titleContainsProduct(p1) || titleContainsProduct(p2)) &&
        !(/running|walking|swimming|cycling|cardio|hiit|yoga|diet|fasting/i.test(p1 + ' ' + p2))) {
      return { priority: 'critical', status: 'opportunity' };
    }
  }

  // CRITICAL: "Buying Guide" + product mentioned
  if (/buying\s+guide|buyer'?s?\s+guide/i.test(titleLower) && titleContainsProduct(titleLower)) {
    return { priority: 'critical', status: 'opportunity' };
  }

  // HIGH: Title mentions a specific product or brand
  if (titleContainsProduct(titleLower)) {
    return { priority: 'high', status: 'opportunity' };
  }

  // HIGH: Content mentions 5+ different products
  const productMentions = PURCHASABLE_PRODUCTS.filter(p =>
    contentLower.includes(p)
  ).length;

  if (productMentions >= 5) {
    return { priority: 'high', status: 'opportunity' };
  }

  // MEDIUM: How-to or guide that mentions at least one product
  if (/\bhow\s+to\b|\bguide\b|\bessential/i.test(titleLower)) {
    if (productMentions >= 1) {
      return { priority: 'medium', status: 'opportunity' };
    }
  }

  // LOW: Everything else (informational, lifestyle, tips, etc.)
  return { priority: 'low', status: 'opportunity' };
};


export const resetProxyStats = (): void => {
  proxyLatencyMap.clear();
  proxyFailureCount.clear();
  proxySuccessCount.clear();
};



// ============================================================================
// PAGE CONTENT FETCHING
// ============================================================================

/**
 * Fetch page content with multiple fallback strategies
 */
export const fetchPageContent = async (
  config: AppConfig,
  url: string
): Promise<{ content: string; title: string }> => {
  const cacheKey = `content_${hashString(url)}`;

  // Check cache
  const cached = IntelligenceCache.get<{ content: string; title: string }>(cacheKey);
  if (cached) {
    console.log('[Content] Returning cached content for:', url.substring(0, 50));
    return cached;
  }

  try {
    // Strategy 1: Try WordPress REST API first (most reliable)
    if (config.wpUrl && config.wpUser && config.wpAppPassword) {
      const wpContent = await fetchViaWordPressAPI(config, url);
      if (wpContent && wpContent.content.length > 100) {
        IntelligenceCache.set(cacheKey, wpContent, CACHE_TTL_SHORT_MS);
        return wpContent;
      }
    }

    // Strategy 2: Proxy fetch
    const html = await fetchWithSmartProxy(url, { 
      timeout: PAGE_FETCH_TIMEOUT_MS
      });
    // Extract title
const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        let title = titleMatch 
      ? titleMatch[1].trim()
        .replace(/\s*[|\-–—]\s*.+$/, '') // Remove site name suffix
        .replace(/&#[0-9]+;/g, '') // Remove HTML entities
      : extractTitleFromUrl(url);

    // Extract main content using multiple selectors
    let content = html;

    // Try to find article content
    const contentSelectors = [
      /<article[^>]*>([\s\S]*?)<\/article>/i,
      /<main[^>]*>([\s\S]*?)<\/main>/i,
      /<div[^>]*class="[^"]*(?:entry-content|post-content|article-content|content)[^"]*"[^>]*>([\s\S]*?)<\/div>/i,
      /<div[^>]*id="content"[^>]*>([\s\S]*?)<\/div>/i,
    ];

    for (const selector of contentSelectors) {
      const match = html.match(selector);
      if (match && match[1].length > 200) {
        content = match[1];
        break;
      }
    }

    // Clean content
    content = cleanHtmlContent(content);

    const result = { content, title };
    IntelligenceCache.set(cacheKey, result, CACHE_TTL_SHORT_MS);
    return result;

  } catch (error: any) {
    console.error('[fetchPageContent] Failed:', error.message);
    return { content: '', title: extractTitleFromUrl(url) };
  }
};

/**
 * Clean HTML content by removing scripts, styles, navigation, etc.
 */
const cleanHtmlContent = (html: string): string => {
  return html
    // Remove scripts
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    // Remove styles
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    // Remove navigation
    .replace(/<nav[\s\S]*?<\/nav>/gi, '')
    // Remove header
    .replace(/<header[\s\S]*?<\/header>/gi, '')
    // Remove footer
    .replace(/<footer[\s\S]*?<\/footer>/gi, '')
    // Remove aside
    .replace(/<aside[\s\S]*?<\/aside>/gi, '')
    // Remove comments
    .replace(/<!--[\s\S]*?-->/g, '')
    // Remove noscript
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
    // Remove forms
    .replace(/<form[\s\S]*?<\/form>/gi, '')
    // Remove iframes
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    // Clean up whitespace
    .replace(/\s+/g, ' ')
    .trim();
};

// ============================================================================
// WORDPRESS API INTEGRATION
// ============================================================================

/**
 * Fetch content via WordPress REST API
 */
const fetchViaWordPressAPI = async (
  config: AppConfig,
  url: string
): Promise<{ content: string; title: string } | null> => {
  if (!config.wpUrl || !config.wpUser || !config.wpAppPassword) {
    return null;
  }

  try {
    const urlObj = new URL(url);
    const slug = urlObj.pathname.split('/').filter(s => s).pop() || '';

    if (!slug) return null;

    const apiBase = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

    // Try posts first
    let response = await fetchWithTimeout(
      `${apiBase}/posts?slug=${encodeURIComponent(slug)}`,
      10000,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );

    let posts = [];
    if (response.ok) {
      posts = await response.json();
    }

    // Try pages if no posts found
    if (posts.length === 0) {
      response = await fetchWithTimeout(
        `${apiBase}/pages?slug=${encodeURIComponent(slug)}`,
        10000,
        { headers: { 'Authorization': `Basic ${auth}` } }
      );
      if (response.ok) {
        posts = await response.json();
      }
    }

    if (posts.length === 0) return null;

    return {
      content: posts[0].content?.rendered || posts[0].content?.raw || '',
      title: posts[0].title?.rendered || posts[0].title?.raw || '',
    };
  } catch (error) {
    console.warn('[fetchViaWordPressAPI] Failed:', error);
    return null;
  }
};

/**
 * Fetch raw post content by ID or URL
 */
export const fetchRawPostContent = async (
  config: AppConfig,
  postId: number,
  postUrl: string
): Promise<{ content: string; resolvedId: number }> => {
  console.log('[fetchRawPostContent] Fetching post:', postId, postUrl);

  // Try WordPress API with ID first
  if (config.wpUrl && config.wpUser && config.wpAppPassword) {
    try {
      const apiBase = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
      const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

      // Try to find post by ID
      console.log('[fetchRawPostContent] Trying to fetch post by ID:', postId);

      let response = await fetchWithTimeout(
        `${apiBase}/posts/${postId}`,
        15000,
        {
          headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
          }
        }
      );

      if (response.ok) {
        const post = await response.json();
        const content = post.content?.rendered || post.content?.raw || '';
        console.log('[fetchRawPostContent] Successfully fetched by ID, content length:', content.length);

        if (content.length > 50) {
          return {
            content,
            resolvedId: post.id,
          };
        }
      }

      // Fallback: search by URL slug
      if (postUrl) {
        console.log('[fetchRawPostContent] Trying to fetch by URL slug');

        try {
          const urlObj = new URL(postUrl);
          const slug = urlObj.pathname.split('/').filter(s => s).pop();

          if (slug) {
            // Try posts
            response = await fetchWithTimeout(
              `${apiBase}/posts?slug=${encodeURIComponent(slug)}`,
              15000,
              {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Accept': 'application/json'
                }
              }
            );

            if (response.ok) {
              const posts = await response.json();
              if (posts.length > 0) {
                const content = posts[0].content?.rendered || posts[0].content?.raw || '';
                console.log('[fetchRawPostContent] Found post by slug, content length:', content.length);

                if (content.length > 50) {
                  return {
                    content,
                    resolvedId: posts[0].id,
                  };
                }
              }
            }

            // Try pages
            response = await fetchWithTimeout(
              `${apiBase}/pages?slug=${encodeURIComponent(slug)}`,
              15000,
              {
                headers: {
                  'Authorization': `Basic ${auth}`,
                  'Accept': 'application/json'
                }
              }
            );

            if (response.ok) {
              const pages = await response.json();
              if (pages.length > 0) {
                const content = pages[0].content?.rendered || pages[0].content?.raw || '';
                console.log('[fetchRawPostContent] Found page by slug, content length:', content.length);

                if (content.length > 50) {
                  return {
                    content,
                    resolvedId: pages[0].id,
                  };
                }
              }
            }
          }
        } catch (slugError) {
          console.warn('[fetchRawPostContent] Slug parsing failed:', slugError);
        }
      }
    } catch (error: any) {
      console.warn('[fetchRawPostContent] WP API failed:', error.message);
    }
  }

  // Fallback to proxy fetch if we have a URL
  if (postUrl) {
    console.log('[fetchRawPostContent] Falling back to proxy fetch for:', postUrl);
    try {
      const { content } = await fetchPageContent(config, postUrl);

      if (content && content.length > 50) {
        console.log('[fetchRawPostContent] Proxy fetch successful, content length:', content.length);
        return { content, resolvedId: postId };
      }
    } catch (proxyError: any) {
      console.error('[fetchRawPostContent] Proxy fetch failed:', proxyError);
    }
  }

  throw new Error('Failed to fetch post content from all available sources. Please check your WordPress credentials and post URL.');
};

/**
 * Push updated content to WordPress
 */
export const pushToWordPress = async (
  config: AppConfig,
  postId: number,
  content: string
): Promise<string> => {
  if (!config.wpUrl || !config.wpUser || !config.wpAppPassword) {
    throw new Error('WordPress credentials not configured. Please configure in Settings.');
  }

  const apiUrl = `${config.wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/posts/${postId}`;
  const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

  const response = await fetchWithTimeout(
    apiUrl,
    15000,
    {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        content,
        status: 'publish',
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`WordPress update failed: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const result = await response.json();
  return result.link || `${config.wpUrl}/?p=${postId}`;
};

// ============================================================================
// CONNECTION TEST
// ============================================================================

/**
 * Test WordPress connection and credentials
 */
export const testConnection = async (
  config: AppConfig
): Promise<ConnectionTestResult> => {
  console.log('[testConnection] Testing WordPress connection...');

  if (!config.wpUrl) {
    return { success: false, message: 'WordPress URL is required' };
  }

  if (!config.wpUser) {
    return { success: false, message: 'Username is required' };
  }

  if (!config.wpAppPassword) {
    return { success: false, message: 'App Password is required' };
  }

  try {
    const baseUrl = config.wpUrl.replace(/\/$/, '');
    const apiUrl = `${baseUrl}/wp-json/wp/v2/users/me`;

    console.log('[testConnection] Connecting to:', apiUrl);

    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

    const response = await fetchWithTimeout(
      apiUrl,
      10000,
      {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Accept': 'application/json'
        }
      }
    );

    console.log('[testConnection] Response status:', response.status);

    if (response.ok) {
      const user = await response.json();
      console.log('[testConnection] Successfully connected as:', user.name || user.slug);
      return {
        success: true,
        message: `Connected as ${user.name || user.slug}`,
        userInfo: {
          id: user.id,
          name: user.name || user.slug,
          roles: user.roles || [],
        },
      };
    } else if (response.status === 401) {
      console.warn('[testConnection] Authentication failed');
      return {
        success: false,
        message: 'Invalid credentials: Check your username and app password',
      };
    } else if (response.status === 403) {
      console.warn('[testConnection] Access forbidden');
      return {
        success: false,
        message: 'Access denied: User lacks required permissions',
      };
    } else if (response.status === 404) {
      console.warn('[testConnection] REST API not found');
      return {
        success: false,
        message: 'WordPress REST API not found. Check your site URL.',
      };
    } else {
      const errorText = await response.text().catch(() => 'Unknown error');
      console.error('[testConnection] Failed with status:', response.status, errorText);
      return {
        success: false,
        message: `Connection failed (${response.status}): ${errorText.substring(0, 50)}`,
      };
    }
  } catch (error: any) {
    console.error('[testConnection] Exception:', error);

    if (error.name === 'AbortError') {
      return { success: false, message: 'Connection timeout - server not responding' };
    }

    if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
      return {
        success: false,
        message: 'Network error: Unable to reach WordPress site. Check the URL.',
      };
    }

    return {
      success: false,
      message: `Connection error: ${error.message || 'Unknown error'}`,
    };
  }
};

// ============================================================================
// AI PROVIDER ABSTRACTION LAYER
// ============================================================================

/**
 * Call AI provider with automatic provider selection and error handling
 */
export const callAIProvider = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: {
    temperature?: number;
    maxTokens?: number;
    jsonMode?: boolean;
  } = {}
): Promise<AIResponse> => {
  const provider = config.aiProvider || 'gemini';
  const { temperature = 0.7, maxTokens = 8192, jsonMode = true } = options;

  console.log(`[AI] Calling ${provider} with model ${config.aiModel || 'default'}`);

  switch (provider) {
    case 'gemini':
      return callGemini(config, systemPrompt, userPrompt, { temperature, maxTokens, jsonMode });
    case 'openai':
      return callOpenAI(config, systemPrompt, userPrompt, { temperature, maxTokens, jsonMode });
    case 'anthropic':
      return callAnthropic(config, systemPrompt, userPrompt, { temperature, maxTokens });
    case 'groq':
      return callGroq(config, systemPrompt, userPrompt, { temperature, maxTokens, jsonMode });
    case 'openrouter':
      return callOpenRouter(config, systemPrompt, userPrompt, { temperature, maxTokens });
    default:
      throw new Error(`Unknown AI provider: ${provider}`);
  }
};

/**
 * Call Google Gemini API
 */
const extractApiKey = (rawKey: string | undefined, prefix?: string): string => {
  if (!rawKey) return '';

  const decrypted = SecureStorage.decryptSync(rawKey);

  if (prefix) {
    if (decrypted.startsWith(prefix)) return decrypted;
    if (rawKey.startsWith(prefix)) return rawKey;
  }

  return decrypted || rawKey;
};

const callGemini = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<AIResponse> => {
  const apiKey = extractApiKey(config.geminiApiKey, 'AIza');

  if (!apiKey) {
    throw new Error('Gemini API key not configured. Please add your API key in Settings > Brain Core.');
  }

  const model = config.aiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  console.log('[Gemini] Calling API with model:', model);

  const response = await fetchWithTimeout(
    url,
    API_TIMEOUT_MS,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          { role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] },
        ],
        generationConfig: {
          temperature: options.temperature,
          maxOutputTokens: options.maxTokens,
          responseMimeType: options.jsonMode ? 'application/json' : 'text/plain',
        },
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 400 && errorText.includes('API_KEY')) {
      throw new Error('Gemini API key is invalid. Please check your API key in Settings.');
    }
    if (response.status === 403) {
      throw new Error('Gemini API key does not have access to this model. Please check your API key permissions.');
    }
    if (response.status === 429) {
      throw new Error('Gemini rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`Gemini API error: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
  const finishReason = data.candidates?.[0]?.finishReason || '';

  return {
    text,
    model,
    finishReason,
    usage: data.usageMetadata ? {
      promptTokens: data.usageMetadata.promptTokenCount || 0,
      completionTokens: data.usageMetadata.candidatesTokenCount || 0,
      totalTokens: data.usageMetadata.totalTokenCount || 0,
    } : undefined,
  };
};

/**
 * Call OpenAI API
 */
const callOpenAI = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<AIResponse> => {
  const apiKey = extractApiKey(config.openaiApiKey, 'sk-');

  if (!apiKey) {
    throw new Error('OpenAI API key not configured. Please add your API key in Settings > Brain Core.');
  }

  const model = config.aiModel || 'gpt-4o';

  console.log('[OpenAI] Calling API with model:', model);

  const response = await fetchWithTimeout(
    'https://api.openai.com/v1/chat/completions',
    API_TIMEOUT_MS,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 401) {
      throw new Error('OpenAI API key is invalid. Please check your API key in Settings.');
    }
    if (response.status === 429) {
      throw new Error('OpenAI rate limit exceeded. Please wait a moment and try again.');
    }
    if (response.status === 402 || errorText.includes('billing')) {
      throw new Error('OpenAI account has insufficient credits. Please add credits to your account.');
    }

    throw new Error(`OpenAI API error: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    model: data.model,
    finishReason: data.choices?.[0]?.finish_reason,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
      totalTokens: data.usage.total_tokens,
    } : undefined,
  };
};

/**
 * Call Anthropic Claude API
 */
const callAnthropic = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<AIResponse> => {
  const apiKey = extractApiKey(config.anthropicApiKey, 'sk-ant-');

  if (!apiKey) {
    throw new Error('Anthropic API key not configured. Please add your API key in Settings > Brain Core.');
  }

  const model = config.aiModel || 'claude-3-5-sonnet-20241022';

  console.log('[Anthropic] Calling API with model:', model);

  const response = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    API_TIMEOUT_MS,
    {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        temperature: options.temperature,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 401) {
      throw new Error('Anthropic API key is invalid. Please check your API key in Settings.');
    }
    if (response.status === 429) {
      throw new Error('Anthropic rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`Anthropic API error: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const data = await response.json();
  return {
    text: data.content?.[0]?.text || '',
    model: data.model,
    finishReason: data.stop_reason,
    usage: data.usage ? {
      promptTokens: data.usage.input_tokens,
      completionTokens: data.usage.output_tokens,
    } : undefined,
  };
};

/**
 * Call Groq API
 */
const callGroq = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<AIResponse> => {
  const apiKey = extractApiKey(config.groqApiKey, 'gsk_');

  if (!apiKey) {
    throw new Error('Groq API key not configured. Please add your API key in Settings > Brain Core.');
  }

  const model = config.customModel || 'llama-3.3-70b-versatile';

  console.log('[Groq] Calling API with model:', model);

  const response = await fetchWithTimeout(
    'https://api.groq.com/openai/v1/chat/completions',
    API_TIMEOUT_MS,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
        response_format: options.jsonMode ? { type: 'json_object' } : undefined,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 401) {
      throw new Error('Groq API key is invalid. Please check your API key in Settings.');
    }
    if (response.status === 429) {
      throw new Error('Groq rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`Groq API error: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    model: data.model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  };
};

/**
 * Call OpenRouter API
 */
const callOpenRouter = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number }
): Promise<AIResponse> => {
  const apiKey = extractApiKey(config.openrouterApiKey, 'sk-or-');

  if (!apiKey) {
    throw new Error('OpenRouter API key not configured. Please add your API key in Settings > Brain Core.');
  }

  if (!apiKey.startsWith('sk-or-')) {
    console.warn('[OpenRouter] API key format may be invalid. Expected format: sk-or-v1-...');
  }

  const model = config.customModel || 'anthropic/claude-3.5-sonnet';

  console.log('[OpenRouter] Calling API with model:', model);

  const response = await fetchWithTimeout(
    'https://openrouter.ai/api/v1/chat/completions',
    API_TIMEOUT_MS,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': typeof window !== 'undefined' ? window.location.origin : 'https://amzwp-automator.app',
        'X-Title': 'AmzWP-Automator',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: options.temperature,
        max_tokens: options.maxTokens,
      }),
    }
  );

  if (!response.ok) {
    const errorText = await response.text();

    if (response.status === 401) {
      throw new Error('OpenRouter API key is invalid or expired. Please check your API key in Settings.');
    }
    if (response.status === 402) {
      throw new Error('OpenRouter account has insufficient credits. Please add credits to your account.');
    }
    if (response.status === 429) {
      throw new Error('OpenRouter rate limit exceeded. Please wait a moment and try again.');
    }

    throw new Error(`OpenRouter API error: ${response.status} - ${truncate(errorText, 100)}`);
  }

  const data = await response.json();
  return {
    text: data.choices?.[0]?.message?.content || '',
    model: data.model,
    usage: data.usage ? {
      promptTokens: data.usage.prompt_tokens,
      completionTokens: data.usage.completion_tokens,
    } : undefined,
  };
};

// ============================================================================
// CONTENT ANALYSIS & PRODUCT DETECTION
// ============================================================================

const ANALYSIS_SYSTEM_PROMPT = `You are an expert product identification system for affiliate marketing. Your task is to accurately identify ALL purchasable products mentioned in content.

IDENTIFICATION GUIDELINES:
1. Extract products that have identifiable brand names, model names, or specific product identifiers
2. Include products even if only the brand OR model is mentioned (e.g., "AirPods" alone is valid)
3. Include products mentioned in lists, headings, comparisons, or inline text
4. Include product variations (Pro, Max, Plus, Gen 2, etc.)
5. If a product name could reasonably be searched on Amazon, include it
6. DO NOT invent products - only extract what is actually written in the content
7. Be thorough - better to include borderline cases than miss valid products

PRODUCT DETECTION PATTERNS:
- Brand + Model: "Sony WH-1000XM5", "Ninja BL610"
- Brand + Product Line: "AirPods Pro", "Galaxy Buds"
- Standalone Recognized Products: "Kindle", "Echo Dot", "Instant Pot"
- Products with identifiers: "Model 3", "Series 9", "Gen 5"

Return ONLY valid JSON with no additional text.`;

const ANALYSIS_USER_PROMPT = `Analyze this content and extract ALL identifiable products that could be found on Amazon.

TITLE: {{TITLE}}

CONTENT:
{{CONTENT}}

PRE-DETECTED PRODUCTS (verify these exist in content):
{{PRE_DETECTED}}

EXTRACTION INSTRUCTIONS:
1. Verify each pre-detected product actually appears in the content
2. Find any additional products missed by pattern matching
3. For each product, provide the search query that would find it on Amazon
4. Include a short quote (10-50 chars) showing where the product appears
5. Rate confidence 60-100 based on how clearly the product is named

WHAT TO EXTRACT:
- Products with brand names: Apple, Samsung, Sony, Nike, Dyson, Ninja, etc.
- Products with model identifiers: XM5, BL610, Series 9, Gen 3
- Well-known product lines: AirPods, Galaxy Buds, Kindle, Echo
- Products in listicles or comparison sections
- Products mentioned as recommendations or reviews

WHAT NOT TO EXTRACT:
- Generic categories without brands: "wireless earbuds", "blender", "laptop"
- Descriptive phrases: "the best headphones", "a quality speaker"
- Services or subscriptions (unless physical products)

JSON FORMAT:
{
  "products": [
    {
      "id": "prod-1",
      "searchQuery": "optimized Amazon search query",
      "title": "Product name as mentioned",
      "exactQuote": "short quote showing mention",
      "paragraphNumber": 0,
      "confidence": 85,
      "category": "Electronics"
    }
  ],
  "comparison": {
    "shouldCreate": true,
    "productIds": ["prod-1", "prod-2"],
    "title": "Comparison title if applicable"
  },
  "contentType": "review|listicle|comparison|how-to|informational",
  "totalProductsMentioned": 1
}

Return empty products array ONLY if there are truly no identifiable products in the content.`;

/**
 * Analyze content and find monetizable products - SOTA Multi-Phase Detection
 */
export const analyzeContentAndFindProduct = async (
  title: string,
  content: string,
  config: AppConfig
): Promise<AnalysisResult> => {
  const contentHash = hashString(`${title}_${content.substring(0, 500)}_${content.length}_v2`);

  const cached = IntelligenceCache.getAnalysis(contentHash);
  if (cached) {
    console.log('[Analysis] Returning cached analysis');
    return {
      detectedProducts: cached.products,
      comparison: cached.comparison,
      contentType: 'cached',
      monetizationPotential: 'medium',
    };
  }

  const maxContentLength = 20000;
  const truncatedContent = content.length > maxContentLength
    ? content.substring(0, maxContentLength)
    : content;

  const cleanContent = stripHtml(truncatedContent);
  const contentLower = cleanContent.toLowerCase();

  console.log('=== PHASE 1: Pattern Detection ===');
  const phase1Products = extractProductsPhase1(truncatedContent, cleanContent);
  console.log('[Phase 1] Found:', phase1Products.length, 'potential products');
  phase1Products.forEach((p: any, i: number) => {
    console.log(`  ${i + 1}. ${p.name} (${p.sourceType}, conf: ${p.confidence}${p.asin ? ', ASIN: ' + p.asin : ''})`);
  });

  // AGGRESSIVE: If we have Phase 1 products and SerpAPI, use them directly
  if (phase1Products.length > 0 && config.serpApiKey) {
    console.log('[Phase 1] ⚡ Using Phase 1 products directly with SerpAPI enrichment');
    const quickProducts: ProductDetails[] = [];

    for (let i = 0; i < Math.min(phase1Products.length, 10); i++) {
      const p1 = phase1Products[i];
      console.log(`[Phase 1 Enrich ${i + 1}/${Math.min(phase1Products.length, 10)}] ${p1.name}`);

      try {
        let productData: Partial<ProductDetails> = {};

        if (p1.asin) {
          console.log(`  → ASIN lookup: ${p1.asin}`);
          const result = await fetchProductByASIN(p1.asin, config.serpApiKey);
          if (result) productData = result;
        }

        if (!productData.asin) {
          console.log(`  → Search: "${p1.name}"`);
          productData = await searchAmazonProduct(p1.name, config.serpApiKey);
        }

        console.log(`  → Result: ASIN=${!!productData.asin}, Image=${!!productData.imageUrl}, Price=${productData.price}`);

        if (productData.asin && productData.imageUrl && productData.price && productData.price !== '$XX.XX') {
          console.log(`  ✓ VALID PRODUCT`);
          quickProducts.push({
            id: `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            title: productData.title || p1.name,
            asin: productData.asin,
            price: productData.price,
            imageUrl: productData.imageUrl,
            rating: productData.rating || 4.5,
            reviewCount: productData.reviewCount || 0,
            verdict: generateDefaultVerdict(productData.title || p1.name),
            evidenceClaims: generateDefaultClaims(),
            brand: productData.brand || '',
            category: 'General',
            prime: productData.prime ?? true,
            insertionIndex: 0,
            deploymentMode: 'ELITE_BENTO',
            faqs: generateDefaultFaqs(productData.title || p1.name),
            specs: {},
            confidence: p1.confidence,
          });
        } else {
          console.log(`  ✗ Incomplete data`);
        }

        if (i < Math.min(phase1Products.length, 10) - 1) {
          await sleep(150);
        }
      } catch (err: any) {
        console.error(`  ✗ Error: ${err.message}`);
      }
    }

    if (quickProducts.length > 0) {
      console.log(`[Phase 1] ✓✓✓ SUCCESS! ${quickProducts.length} products found`);
      IntelligenceCache.setAnalysis(contentHash, { products: quickProducts });
      return {
        detectedProducts: quickProducts,
        contentType: 'informational',
        monetizationPotential: quickProducts.length >= 3 ? 'high' : 'medium',
      };
    } else {
      console.log(`[Phase 1] ✗ No valid products after enrichment`);
    }
  }

  const preDetectedList = phase1Products.length > 0
    ? phase1Products.map((p, i) => `${i + 1}. "${p.name}" (${p.sourceType}, confidence: ${p.confidence})`).join('\n')
    : 'None pre-detected - scan content thoroughly';

  const prompt = ANALYSIS_USER_PROMPT
    .replace('{{TITLE}}', title)
    .replace('{{CONTENT}}', cleanContent.substring(0, 12000))
    .replace('{{PRE_DETECTED}}', preDetectedList);

  try {
    console.log('[Analysis] Phase 2: AI-powered product verification and discovery');
    const response = await callAIProvider(
      config,
      ANALYSIS_SYSTEM_PROMPT,
      prompt,
      { temperature: 0.3, jsonMode: true }
    );

    let parsed: any;
    try {
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response.text);
    } catch (parseError) {
      console.warn('[Analysis] Failed to parse AI response, using Phase 1 results');
      parsed = { products: [], contentType: 'informational' };
    }

    console.log('[Analysis] AI found:', parsed.products?.length || 0, 'products');

    const validatedProducts = new Map<string, any>();

    for (const p of (parsed.products || [])) {
      if (p.confidence < 30) {
        console.log('[Analysis] Skipping very low confidence:', p.title, p.confidence);
        continue;
      }

      const searchTerms = (p.searchQuery || p.title || '').toLowerCase();
      const searchWords = searchTerms.split(/\s+/).filter((w: string) => w.length > 2);

      const foundInContent = searchWords.some((word: string) => {
        if (word.length < 3) return false;
        return contentLower.includes(word);
      });

      if (!foundInContent && searchWords.length > 0) {
        const hasAnyMatch = searchWords.filter((w: string) => w.length > 3)
          .some((word: string) => contentLower.includes(word));
        if (!hasAnyMatch) {
          console.log('[Analysis] Product not found in content:', p.title);
          continue;
        }
      }

      const key = normalizeProductName(p.searchQuery || p.title);
      if (!validatedProducts.has(key)) {
        validatedProducts.set(key, p);
      }
    }

    for (const p1 of phase1Products) {
      const key = normalizeProductName(p1.name);
      if (!validatedProducts.has(key) && p1.confidence >= 50) {
        validatedProducts.set(key, {
          id: `phase1-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          searchQuery: p1.name,
          title: p1.name,
          asin: p1.asin,
          confidence: p1.confidence,
          category: 'General',
          paragraphNumber: 0,
        });
      }
    }

    console.log('[Analysis] Phase 3: SerpAPI enrichment for', validatedProducts.size, 'products');

    const products: ProductDetails[] = [];
    const serpApiQueue: Array<{ key: string; product: any; asin?: string }> = [];

    for (const [key, p] of validatedProducts) {
      const phase1Match = phase1Products.find(p1 => normalizeProductName(p1.name) === key);
      if (phase1Match?.asin) {
        serpApiQueue.push({ key, product: p, asin: phase1Match.asin });
      } else {
        serpApiQueue.push({ key, product: p });
      }
    }

    const batchSize = 3;
    for (let i = 0; i < serpApiQueue.length; i += batchSize) {
      const batch = serpApiQueue.slice(i, i + batchSize);

      const batchPromises = batch.map(async ({ key, product, asin }) => {
        let productData: Partial<ProductDetails> = {};

        if (config.serpApiKey) {
          try {
            if (asin) {
              console.log('[Analysis] Fetching by ASIN:', asin);
              const asinResult = await fetchProductByASIN(asin, config.serpApiKey);
              if (asinResult) {
                productData = asinResult;
              }
            }

            if (!productData.asin) {
              const searchQuery = optimizeSearchQuery(product.searchQuery || product.title);
              console.log('[Analysis] Searching:', searchQuery);
              productData = await searchAmazonProduct(searchQuery, config.serpApiKey);
            }
          } catch (error: any) {
            console.error('[Analysis] SerpAPI error for:', product.title, error.message);
          }
        }

        return { key, product, productData };
      });

      const batchResults = await Promise.all(batchPromises);

      for (const { product, productData } of batchResults) {
        if (!productData.asin || !productData.imageUrl || productData.price === '$XX.XX') {
          console.log('[Analysis] Skipping product with incomplete data:', product.title, {
            hasAsin: !!productData.asin,
            hasImage: !!productData.imageUrl,
            price: productData.price
          });
          continue;
        }

        const insertionIndex = typeof product.paragraphNumber === 'number' ? product.paragraphNumber : 0;

        products.push({
          id: product.id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          title: productData.title || product.title || product.searchQuery,
          asin: productData.asin!,
          price: productData.price!,
          imageUrl: productData.imageUrl!,
          rating: productData.rating || 4.5,
          reviewCount: productData.reviewCount || 0,
          verdict: productData.verdict || generateDefaultVerdict(product.title || product.searchQuery),
          evidenceClaims: productData.evidenceClaims || generateDefaultClaims(),
          brand: productData.brand || '',
          category: product.category || 'General',
          prime: productData.prime ?? true,
          insertionIndex,
          deploymentMode: 'ELITE_BENTO',
          faqs: productData.faqs || generateDefaultFaqs(product.title || product.searchQuery),
          specs: productData.specs || {},
          confidence: product.confidence,
          exactMention: product.exactQuote || '',
          paragraphIndex: product.paragraphNumber,
        });
      }

      if (i + batchSize < serpApiQueue.length) {
        await sleep(200);
      }
    }

    let comparison: ComparisonData | undefined;
    if (parsed.comparison?.shouldCreate && products.length >= 2) {
      const productIds = products.slice(0, 5).map(p => p.id);
      comparison = {
        title: parsed.comparison.title || `Top ${title} Comparison`,
        productIds,
        specs: ['Price', 'Rating', 'Reviews'],
      };
    } else if (products.length >= 3) {
      const productIds = products.slice(0, 5).map(p => p.id);
      comparison = {
        title: `${title} - Product Comparison`,
        productIds,
        specs: ['Price', 'Rating', 'Reviews'],
      };
    }

    IntelligenceCache.setAnalysis(contentHash, { products, comparison });

    console.log('[Analysis] Complete:', products.length, 'products found');

    return {
      detectedProducts: products,
      comparison,
      contentType: parsed.contentType || 'informational',
      monetizationPotential: products.length >= 3 ? 'high' : products.length > 0 ? 'medium' : 'low',
      keywords: parsed.suggestedKeywords || [],
    };

  } catch (error: any) {
    console.error('[analyzeContentAndFindProduct] Error:', error);

    if (phase1Products.length > 0 && config.serpApiKey) {
      console.log('[Analysis] Falling back to Phase 1 products');
      const fallbackProducts: ProductDetails[] = [];

      for (const p1 of phase1Products.slice(0, 5)) {
        try {
          let productData: Partial<ProductDetails> = {};
          if (p1.asin) {
            const asinResult = await fetchProductByASIN(p1.asin, config.serpApiKey);
            if (asinResult) {
              productData = asinResult;
            }
          } else {
            productData = await searchAmazonProduct(p1.name, config.serpApiKey);
          }

          if (productData.asin && productData.imageUrl && productData.price && productData.price !== '$XX.XX') {
            fallbackProducts.push({
              id: `fallback-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
              title: productData.title || p1.name,
              asin: productData.asin,
              price: productData.price,
              imageUrl: productData.imageUrl,
              rating: productData.rating || 4.5,
              reviewCount: productData.reviewCount || 0,
              verdict: generateDefaultVerdict(p1.name),
              evidenceClaims: generateDefaultClaims(),
              brand: productData.brand || '',
              category: 'General',
              prime: productData.prime ?? true,
              insertionIndex: 0,
              deploymentMode: 'ELITE_BENTO',
              faqs: generateDefaultFaqs(p1.name),
              specs: {},
              confidence: p1.confidence,
            });
          }
        } catch {}
      }

      if (fallbackProducts.length > 0) {
        return {
          detectedProducts: fallbackProducts,
          contentType: 'informational',
          monetizationPotential: 'medium',
        };
      }
    }

    throw new Error(`AI analysis failed: ${error.message}`);
  }
};

interface Phase1Product {
  name: string;
  asin?: string;
  sourceType: string;
  confidence: number;
}

function extractProductsPhase1(htmlContent: string, textContent: string): Phase1Product[] {
  const products: Phase1Product[] = [];
  const seen = new Set<string>();

  const asinPatterns = [
    /amazon\.com\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})/gi,
    /\/dp\/([A-Z0-9]{10})/gi,
    /\/(B0[A-Z0-9]{8})(?:[\/\?\s"']|$)/gi,
  ];

  for (const pattern of asinPatterns) {
    let match;
    while ((match = pattern.exec(htmlContent)) !== null) {
      const asin = match[1]?.toUpperCase();
      if (asin && !seen.has(asin) && /^[A-Z0-9]{10}$/.test(asin)) {
        seen.add(asin);
        products.push({
          name: `ASIN: ${asin}`,
          asin,
          sourceType: 'amazon_link',
          confidence: 100,
        });
      }
    }
  }

  const brandPatterns = [
    /\b(Apple|Samsung|Sony|Google|Microsoft|Amazon|Nike|Adidas|Nintendo|Bose|JBL|Beats|Sennheiser|Logitech|Razer|Corsair|ASUS|Acer|Dell|HP|Lenovo|Dyson|Shark|Ninja|KitchenAid|Cuisinart|Breville|Vitamix|Instant\s*Pot|Fitbit|Garmin|Canon|Nikon|GoPro|DJI|Anker|Jabra|Philips|Braun|Oral-B|Roomba|iRobot|Eufy|Roborock|Weber|DeWalt|Makita|Milwaukee|Roku|Kindle|Echo|AirPods|PlayStation|Xbox)\s+([A-Za-z0-9][\w\s\-\.]{1,40}?)(?=[\.\,\!\?\;\:\)\]\"\']|\s+(?:is|are|was|were|has|have|with|for|features|offers|comes|includes|provides)|\s*$)/gi,
  ];

  for (const pattern of brandPatterns) {
    let match;
    while ((match = pattern.exec(textContent)) !== null) {
      const fullMatch = match[0].trim().replace(/[\.\,\!\?\;]+$/, '');
      const key = fullMatch.toLowerCase().replace(/\s+/g, '_');

      if (seen.has(key) || fullMatch.length < 5 || fullMatch.length > 60) continue;
      seen.add(key);

      products.push({
        name: fullMatch,
        sourceType: 'brand_model',
        confidence: 85,
      });
    }
  }

  const standaloneProducts = [
    /\b(AirPods(?:\s*(?:Pro|Max))?(?:\s*\d+)?)\b/gi,
    /\b(Galaxy\s*(?:Buds|Watch|Tab|S\d+|Z\s*(?:Fold|Flip))(?:\s*\d+)?(?:\s*(?:Pro|Plus|Ultra|FE))?)\b/gi,
    /\b(Pixel\s*(?:\d+|Buds|Watch)(?:\s*(?:Pro|a))?)\b/gi,
    /\b(iPhone\s*(?:\d+)?(?:\s*(?:Pro|Max|Plus|SE))?)\b/gi,
    /\b(iPad\s*(?:Pro|Air|Mini)?(?:\s*\d+)?)\b/gi,
    /\b(MacBook\s*(?:Air|Pro)?(?:\s*\d+)?)\b/gi,
    /\b(Apple\s*Watch(?:\s*(?:Series|SE|Ultra)\s*\d*)?)\b/gi,
    /\b(Echo\s*(?:Dot|Show|Studio|Pop)?(?:\s*\d+)?)\b/gi,
    /\b(Kindle\s*(?:Paperwhite|Oasis|Scribe)?)\b/gi,
    /\b(Fire\s*(?:TV|Stick|Tablet)(?:\s*\d+)?(?:\s*(?:Lite|Max|Kids))?)\b/gi,
    /\b(PlayStation\s*\d+)\b/gi,
    /\b(Xbox\s*(?:Series\s*[XS]|One))\b/gi,
    /\b(Nintendo\s*Switch(?:\s*(?:OLED|Lite))?)\b/gi,
    /\b(Quest\s*\d+)\b/gi,
    /\b(Instant\s*Pot(?:\s*(?:Duo|Pro|Ultra))?)\b/gi,
    /\b(Roomba\s*[a-z]?\d+)\b/gi,
    /\b(Fitbit\s*(?:Charge|Versa|Sense|Luxe|Inspire)\s*\d*)\b/gi,
    /\b(Garmin\s*(?:Forerunner|Fenix|Venu|Instinct)\s*\d*(?:\s*[A-Za-z]+)?)\b/gi,
  ];

  for (const pattern of standaloneProducts) {
    let match;
    while ((match = pattern.exec(textContent)) !== null) {
      const fullMatch = match[1]?.trim();
      if (!fullMatch) continue;

      const key = fullMatch.toLowerCase().replace(/\s+/g, '_');
      if (seen.has(key) || fullMatch.length < 4) continue;
      seen.add(key);

      products.push({
        name: fullMatch,
        sourceType: 'standalone',
        confidence: 90,
      });
    }
  }

  return products;
}

function normalizeProductName(name: string): string {
  return (name || '')
    .toLowerCase()
    .replace(/[^\w\s]/g, '')
    .replace(/\s+/g, '_')
    .trim()
    .split('_')
    .slice(0, 4)
    .join('_');
}

function optimizeSearchQuery(query: string): string {
  if (!query) return '';

  let optimized = query
    .replace(/\([^)]*\)/g, '')
    .replace(/[-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const stopWords = ['the', 'a', 'an', 'new', 'best', 'top', 'review', 'our', 'my', 'your', 'this', 'that'];
  const words = optimized.split(' ').filter(w => !stopWords.includes(w.toLowerCase()));

  return words.slice(0, 6).join(' ');
}



/**
 * Generate default FAQs
 */
const generateDefaultFaqs = (productTitle: string): FAQItem[] => {
  return [
    {
      question: 'Is this product covered by warranty?',
      answer: 'Yes, this product comes with a comprehensive manufacturer warranty for complete peace of mind.',
    },
    {
      question: 'How fast is shipping?',
      answer: 'Prime eligible for fast, free delivery with easy returns within 30 days.',
    },
    {
      question: 'Is this worth the investment?',
      answer: `Based on thousands of positive reviews, the ${productTitle.split(' ').slice(0, 3).join(' ')} is a proven choice for discerning buyers.`,
    },
  ];
};

// ============================================================================
// SERPAPI AMAZON SEARCH - VIA EDGE FUNCTION (CORS BYPASS)
// ============================================================================

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

/**
 * Get raw API key - just return it as-is
 */
const getApiKey = (key: string): string => {
  if (!key) return '';

  const trimmed = key.trim();
  const decrypted = SecureStorage.decryptSync(trimmed);

  if (decrypted && decrypted.length > 10) {
    return decrypted;
  }

  return trimmed;
};

/**
 * Call SerpAPI via Edge Function (bypasses CORS)
 */
const callSerpApiProxy = async (params: {
  type: 'search' | 'product';
  query?: string;
  asin?: string;
  apiKey: string;
}): Promise<any> => {
  const edgeFunctionUrl = `${SUPABASE_URL}/functions/v1/serpapi-proxy`;

  console.log('[SerpAPI Proxy] Calling edge function for', params.type);

  const response = await fetchWithTimeout(edgeFunctionUrl, 30000, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `Edge function error: ${response.status}`);
  }

  return response.json();
};

const extractPrice = (result: any): string => {
  const priceFields = [
    result.price?.raw,
    result.price?.current,
    result.price?.value,
    result.price_string,
    result.extracted_price ? `$${result.extracted_price}` : null,
    result.buybox_winner?.price?.raw,
    result.buybox_winner?.price?.value ? `$${result.buybox_winner.price.value}` : null,
    result.typical_price?.raw,
    typeof result.price === 'string' ? result.price : null,
    typeof result.price === 'number' ? `$${result.price.toFixed(2)}` : null,
  ];

  for (const field of priceFields) {
    if (field && typeof field === 'string' && field.includes('$')) {
      return field;
    }
  }

  return '$XX.XX';
};

const extractImage = (result: any): string => {
  const imageFields = [
    result.main_image,
    result.thumbnail,
    result.image,
    result.primary_image,
    result.images?.[0]?.link,
    result.images?.[0]?.url,
    typeof result.images?.[0] === 'string' ? result.images[0] : null,
    result.media?.[0]?.link,
    result.gallery?.[0],
  ];

  for (const field of imageFields) {
    if (field && typeof field === 'string' && (field.includes('amazon') || field.includes('http'))) {
      return upgradeAmazonImageToHighRes(field);
    }
  }

  return '';
};

const extractRating = (result: any): number => {
  const rating = parseFloat(result.rating) ||
    parseFloat(result.stars) ||
    result.rating_breakdown?.average ||
    4.5;
  return Math.min(Math.max(rating, 1), 5);
};

const extractReviewCount = (result: any): number => {
  const reviewStr = String(
    result.reviews ||
    result.reviews_total ||
    result.ratings_total ||
    result.global_ratings ||
    '0'
  );
  return parseInt(reviewStr.replace(/[^0-9]/g, '')) || 0;
};

/**
 * Search Amazon via SerpAPI Edge Function - Enterprise Grade
 */
export const searchAmazonProduct = async (
  query: string,
  apiKey: string
): Promise<Partial<ProductDetails>> => {
  const cleanKey = getApiKey(apiKey);

  if (!cleanKey) {
    console.warn('[SerpAPI] No API key provided');
    return {};
  }

  console.log('[SerpAPI] Using API key:', cleanKey.substring(0, 8) + '...');

  const cacheKey = `serp_${hashString(query.toLowerCase())}`;
  const cached = IntelligenceCache.get<Partial<ProductDetails>>(cacheKey);
  if (cached && cached.asin && cached.price !== '$XX.XX' && cached.imageUrl) {
    console.log('[SerpAPI] Returning cached result for:', query.substring(0, 30));
    return cached;
  }

  console.log('[SerpAPI] Searching for:', query.substring(0, 50));

  try {
    const data = await callSerpApiProxy({
      type: 'search',
      query,
      apiKey: cleanKey,
    });

    console.log('[SerpAPI] Response keys:', Object.keys(data));
    console.log('[SerpAPI] organic_results:', data.organic_results?.length || 0);
    console.log('[SerpAPI] shopping_results:', data.shopping_results?.length || 0);

    const allResults = [
      ...(data.organic_results || []),
      ...(data.shopping_results || []),
    ];

    if (allResults.length === 0) {
      console.warn('[SerpAPI] No results for:', query);
      return {};
    }

    const result = allResults.find(r => r.asin && (extractImage(r) || r.thumbnail)) || allResults[0];

    console.log('[SerpAPI] Selected result:', {
      asin: result.asin,
      title: result.title?.substring(0, 40),
      hasImage: !!extractImage(result),
      priceFields: Object.keys(result).filter(k => k.includes('price'))
    });

    const product: Partial<ProductDetails> = {
      asin: result.asin || '',
      title: result.title || query,
      price: extractPrice(result),
      imageUrl: extractImage(result),
      rating: extractRating(result),
      reviewCount: extractReviewCount(result),
      prime: result.is_prime || result.prime || false,
      brand: result.brand || '',
    };

    console.log('[SerpAPI] Final product:', {
      asin: product.asin,
      price: product.price,
      hasImage: !!product.imageUrl,
      rating: product.rating
    });

    if (product.asin && product.price !== '$XX.XX') {
      IntelligenceCache.set(cacheKey, product, CACHE_TTL_MS);
    }

    return product;

  } catch (error: any) {
    console.error('[searchAmazonProduct] Error:', error.message);
    return {};
  }
};

const extractProductPrice = (result: any): string => {
  const priceFields = [
    result.buybox_winner?.price?.raw,
    result.buybox_winner?.price?.value ? `$${result.buybox_winner.price.value}` : null,
    result.price?.raw,
    result.price?.current,
    result.price?.value ? `$${result.price.value}` : null,
    typeof result.price === 'string' && result.price.includes('$') ? result.price : null,
    result.pricing?.[0]?.price?.raw,
    result.price_string,
    result.typical_price?.raw,
  ];

  for (const field of priceFields) {
    if (field && typeof field === 'string' && field.includes('$')) {
      console.log('[SerpAPI] Found price:', field);
      return field;
    }
  }

  return '$XX.XX';
};

const extractProductImage = (result: any): string => {
  const imageFields = [
    result.main_image?.link,
    typeof result.main_image === 'string' ? result.main_image : null,
    result.images?.[0]?.link,
    result.images?.[0]?.url,
    result.images?.[0]?.large,
    result.images?.[0]?.medium,
    typeof result.images?.[0] === 'string' ? result.images[0] : null,
    result.thumbnail,
    result.image,
    result.media?.images?.[0]?.link,
    typeof result.media?.images?.[0] === 'string' ? result.media.images[0] : null,
  ];

  for (const field of imageFields) {
    if (field && typeof field === 'string' && field.startsWith('http')) {
      console.log('[SerpAPI] Found image:', field.substring(0, 60));
      return upgradeAmazonImageToHighRes(field);
    }
  }

  return '';
};

/**
 * Fetch product details by ASIN via Edge Function - Enterprise Grade
 */
export const fetchProductByASIN = async (
  asin: string,
  apiKey: string
): Promise<ProductDetails | null> => {
  const cleanKey = getApiKey(apiKey);

  if (!cleanKey || !asin) {
    console.warn('[fetchProductByASIN] Missing API key or ASIN');
    throw new Error('Missing API key or ASIN');
  }

  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    console.warn('[fetchProductByASIN] Invalid ASIN format:', asin);
    throw new Error('Invalid ASIN format');
  }

  const cached = IntelligenceCache.getProduct(asin);
  if (cached && cached.price !== '$XX.XX' && cached.imageUrl) {
    console.log('[SerpAPI] Returning cached product:', asin);
    return cached;
  }

  console.log('[SerpAPI] Fetching product by ASIN:', asin);

  try {
    const data = await callSerpApiProxy({
      type: 'product',
      asin,
      apiKey: cleanKey,
    });

    console.log('[fetchProductByASIN] Response keys:', Object.keys(data));

    const result = data.product_results || data.product_result;

    if (!result) {
      if (data.error) {
        throw new Error(data.error);
      }
      throw new Error('Product not found or invalid ASIN');
    }

    console.log('[SerpAPI] Found product:', result.title?.substring(0, 50));

    const price = extractProductPrice(result);
    const imageUrl = extractProductImage(result);

    const product: ProductDetails = {
      id: `prod-${asin}-${Date.now()}`,
      asin,
      title: result.title || 'Unknown Product',
      price,
      imageUrl,
      rating: parseFloat(result.rating) || 4.5,
      reviewCount: extractReviewCount(result),
      prime: result.is_prime || result.buybox_winner?.is_prime || false,
      brand: result.brand || '',
      category: result.categories_flat || result.category?.[0]?.name || 'General',
      verdict: generateDefaultVerdict(result.title || 'This product'),
      evidenceClaims: result.feature_bullets?.slice(0, 4) || result.about_item?.slice(0, 4) || generateDefaultClaims(),
      faqs: generateDefaultFaqs(result.title || 'This product'),
      specs: result.specifications_flat || {},
      insertionIndex: 1,
      deploymentMode: 'ELITE_BENTO',
    };

    console.log('[SerpAPI] Final product:', {
      asin: product.asin,
      title: product.title?.substring(0, 40),
      price: product.price,
      hasImage: !!product.imageUrl
    });

    if (product.price !== '$XX.XX' && product.imageUrl) {
      IntelligenceCache.setProduct(asin, product);
    }

    return product;

  } catch (error: any) {
    console.error('[fetchProductByASIN] Error:', error.message);
    throw error;
  }
};

// ============================================================================
// CONTENT BLOCK SPLITTING
// ============================================================================

/**
 * Split HTML content into blocks for the visual editor
 */
export const splitContentIntoBlocks = (html: string): string[] => {
  if (!html || html.trim().length === 0) return [];

  // Block-level elements to split on
  const blockEndTags = [
    '</p>', '</h1>', '</h2>', '</h3>', '</h4>', '</h5>', '</h6>',
    '</div>', '</section>', '</article>', '</blockquote>',
    '</ul>', '</ol>', '</table>', '</figure>', '</pre>',
  ];

  const blocks: string[] = [];
  let currentBlock = '';

  // Simple tokenization approach - use NON-CAPTURING group (?:) for tag names
  // to prevent tag names from being included in split results
  const regex = /(<\/?(?:p|h[1-6]|div|section|article|blockquote|ul|ol|table|figure|pre)[^>]*>)/gi;
  const parts = html.split(regex);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];

    if (!part) continue;

    // Skip bare tag names that may have leaked through (safety check)
    if (/^(p|h[1-6]|div|section|article|blockquote|ul|ol|table|figure|pre)$/i.test(part.trim())) {
      continue;
    }

    // Check if this is an end tag
    const isEndTag = blockEndTags.some(tag =>
      part.toLowerCase() === tag.toLowerCase()
    );

    currentBlock += part;

    if (isEndTag && currentBlock.trim().length > 0) {
      blocks.push(currentBlock.trim());
      currentBlock = '';
    }
  }

  // Add any remaining content
  if (currentBlock.trim().length > 0) {
    blocks.push(currentBlock.trim());
  }

  // Merge very small blocks
  const mergedBlocks: string[] = [];
  let buffer = '';

  for (const block of blocks) {
    buffer += (buffer ? '\n' : '') + block;

    // Keep block if it's substantial or contains a heading
    if (buffer.length > 150 || /<h[1-6]/i.test(block)) {
      mergedBlocks.push(buffer);
      buffer = '';
    }
  }

  // Add remaining buffer
  if (buffer.trim().length > 0) {
    if (mergedBlocks.length > 0) {
      mergedBlocks[mergedBlocks.length - 1] += '\n' + buffer;
    } else {
      mergedBlocks.push(buffer);
    }
  }

  return mergedBlocks.filter(b => b.trim().length > 0);
};

// ============================================================================
// PRIORITY CALCULATION - STRICT PRODUCT-ONLY LOGIC
// ============================================================================

/**
 * Calculate post priority - ONLY marks ACTUAL PRODUCT posts as critical
 * "Best Fitness Trackers" = CRITICAL (fitness trackers are products)
 * "Best Weight Loss Diets" = LOW (diets are methods, not products)
 * "Best Running Tips" = LOW (tips are not products)
 */
export const calculatePostPriority = (
  title: string,
  content: string
): {
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  status: 'monetized' | 'opportunity';
} => {
  const result = analyzePostForPriority(title, content);

  let type = 'post';
  const titleLower = title.toLowerCase();
  if (/review/i.test(titleLower) && titleContainsProduct(titleLower)) type = 'review';
  else if (/best|top \d/i.test(titleLower) && titleContainsProduct(titleLower)) type = 'listicle';
  else if (/vs|versus/i.test(titleLower) && titleContainsProduct(titleLower)) type = 'comparison';
  else if (/how to|guide/i.test(titleLower)) type = 'how-to';

  return { ...result, type };
};

// ============================================================================
// CONCURRENT PROCESSING
// ============================================================================

/**
 * Run async tasks with concurrency limit
 */
export const runConcurrent = async <T, R>(
  items: T[],
  concurrency: number,
  processor: (item: T, index: number) => Promise<R>,
  options: {
    onProgress?: (completed: number, total: number) => void;
    onError?: (error: any, item: T, index: number) => void;
  } = {}
): Promise<R[]> => {
  const { onProgress, onError } = options;
  const results: R[] = new Array(items.length);
  const executing: Promise<void>[] = [];
  let completed = 0;

  const execute = async (item: T, idx: number) => {
    try {
      const result = await processor(item, idx);
      results[idx] = result;
    } catch (error) {
      console.warn(`[runConcurrent] Item ${idx} failed:`, error);
      onError?.(error, item, idx);
      results[idx] = undefined as any;
    } finally {
      completed++;
      onProgress?.(completed, items.length);
    }
  };

  for (let i = 0; i < items.length; i++) {
    const promise = execute(items[i], i).then(() => {
      executing.splice(executing.indexOf(promise), 1);
    });
    executing.push(promise);

    // Wait if we've reached concurrency limit
    if (executing.length >= concurrency) {
      await Promise.race(executing);
    }
  }

  // Wait for all remaining tasks
  await Promise.all(executing);

  return results;
};

// ============================================================================
// DEBOUNCE & THROTTLE UTILITIES
// ============================================================================

/**
 * Debounce function calls
 */
export const debounce = <T extends (...args: any[]) => any>(
  func: T,
  wait: number
): ((...args: Parameters<T>) => void) & { cancel: () => void } => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;

  const debouncedFn = (...args: Parameters<T>) => {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
    timeoutId = setTimeout(() => {
      func(...args);
      timeoutId = null;
    }, wait);
  };

  debouncedFn.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
  };

  return debouncedFn;
};

/**
 * Throttle function calls
 */
export const throttle = <T extends (...args: any[]) => any>(
  func: T,
  limit: number
): (...args: Parameters<T>) => void => {
  let inThrottle = false;

  return (...args: Parameters<T>) => {
    if (!inThrottle) {
      func(...args);
      inThrottle = true;
      setTimeout(() => {
        inThrottle = false;
      }, limit);
    }
  };
};

// ============================================================================
// PRODUCT BOX HTML GENERATION
// ============================================================================

const PRODUCT_CATEGORIES: Record<string, { benefits: string[]; verdictTemplate: string; faqs: Array<{q: string; a: string}> }> = {
  fitness_tracker: {
    benefits: ['Tracks heart rate, steps, and calories accurately', 'Water-resistant for swimming and workouts', 'Long battery life for extended use', 'Syncs with smartphone apps'],
    verdictTemplate: 'This fitness tracker delivers comprehensive health monitoring with {rating}-star accuracy. With {reviews} verified reviews and {prime} shipping, it provides real-time tracking of your workouts, sleep patterns, and daily activity goals.',
    faqs: [
      { q: 'How accurate is the heart rate monitor?', a: 'Uses optical sensors with clinical-grade accuracy within 2-3 BPM of medical devices.' },
      { q: 'Is it waterproof for swimming?', a: 'Water-resistant up to 50m, suitable for swimming, showering, and water sports.' },
      { q: 'How long does the battery last?', a: 'Typical battery life is 5-7 days with normal use, depending on features enabled.' },
      { q: 'Does it work with iPhone and Android?', a: 'Compatible with both iOS (iPhone 8+) and Android (6.0+) smartphones.' }
    ]
  },
  smartwatch: {
    benefits: ['Advanced health monitoring sensors', 'GPS tracking for outdoor activities', 'Customizable watch faces and bands', 'Smartphone notifications on your wrist'],
    verdictTemplate: 'This smartwatch combines style with functionality, earning a {rating}-star rating from {reviews} users. Features {prime} delivery and includes advanced sensors for fitness tracking, GPS navigation, and seamless smartphone integration.',
    faqs: [
      { q: 'Can I make calls from the watch?', a: 'Supports Bluetooth calls when paired with your phone, some models have LTE capability.' },
      { q: 'How do I change watch faces?', a: 'Choose from hundreds of customizable faces through the companion app or watch settings.' },
      { q: 'Is it compatible with my phone?', a: 'Works with iPhone (iOS 14+) and Android (8.0+) devices via Bluetooth connection.' },
      { q: 'What health metrics does it track?', a: 'Monitors heart rate, SpO2, sleep quality, stress levels, and workout performance.' }
    ]
  },
  headphones: {
    benefits: ['Active noise cancellation technology', 'Premium audio drivers for clear sound', 'Comfortable fit for all-day wear', 'Long wireless battery life'],
    verdictTemplate: 'Rated {rating} stars by {reviews} audiophiles, these headphones deliver exceptional sound quality with premium drivers and active noise cancellation. {prime} eligible with industry-leading comfort for extended listening sessions.',
    faqs: [
      { q: 'How effective is the noise cancellation?', a: 'ANC reduces ambient noise by up to 95%, ideal for flights, commutes, and focus work.' },
      { q: 'What is the battery life?', a: 'Up to 30+ hours of playback with ANC on, quick charge gives 5 hours in 10 minutes.' },
      { q: 'Are they comfortable for long sessions?', a: 'Memory foam ear cushions and adjustable headband provide all-day comfort.' },
      { q: 'Can I use them for phone calls?', a: 'Built-in microphones with noise isolation ensure crystal-clear call quality.' }
    ]
  },
  supplement: {
    benefits: ['Third-party tested for purity', 'No artificial fillers or additives', 'Optimal dosage per serving', 'Fast absorption formula'],
    verdictTemplate: 'With {rating} stars from {reviews} verified buyers, this supplement meets the highest quality standards. Third-party tested for purity and potency, {prime} shipping ensures fresh delivery directly to your door.',
    faqs: [
      { q: 'Is this third-party tested?', a: 'Yes, independently tested by certified labs for purity, potency, and contaminants.' },
      { q: 'When should I take this supplement?', a: 'Best taken with food for optimal absorption, follow label directions for timing.' },
      { q: 'Are there any allergens?', a: 'Check product label for specific allergen information including gluten, dairy, and soy.' },
      { q: 'How long until I see results?', a: 'Most users notice benefits within 2-4 weeks of consistent daily use.' }
    ]
  },
  running_shoes: {
    benefits: ['Responsive cushioning for impact protection', 'Breathable mesh upper keeps feet cool', 'Durable outsole for long mileage', 'Lightweight design reduces fatigue'],
    verdictTemplate: 'These running shoes earn {rating} stars from {reviews} runners for their exceptional comfort and performance. Featuring advanced cushioning technology and {prime} delivery, they support miles of training and racing.',
    faqs: [
      { q: 'Are these good for long distance running?', a: 'Designed for 400+ miles with cushioning that maintains responsiveness over time.' },
      { q: 'Do they run true to size?', a: 'Most runners find them true to size, consider half size up for wide feet.' },
      { q: 'Are they suitable for road and trail?', a: 'Optimized for road running, some models offer trail-specific versions.' },
      { q: 'How much do they weigh?', a: 'Lightweight design at approximately 9-10 oz for mens, 7-8 oz for womens.' }
    ]
  },
  electrolyte: {
    benefits: ['Zero sugar, no artificial sweeteners', 'Optimal sodium and potassium ratio', 'Fast hydration during workouts', 'Keto and paleo friendly formula'],
    verdictTemplate: 'Rated {rating} stars by {reviews} athletes, this electrolyte formula provides essential minerals without sugar or artificial ingredients. Perfect for keto dieters and endurance athletes, with {prime} availability.',
    faqs: [
      { q: 'Is this keto friendly?', a: 'Yes, zero carbs and zero sugar, designed specifically for low-carb and keto lifestyles.' },
      { q: 'How much sodium is in each serving?', a: 'Contains 1000mg sodium per serving, matching sports science recommendations.' },
      { q: 'When should I drink this?', a: 'Before, during, or after workouts, or anytime you need hydration support.' },
      { q: 'Does it taste salty?', a: 'Naturally flavored with a mild taste, not overly salty despite high sodium content.' }
    ]
  },
  protein_powder: {
    benefits: ['High protein per serving (20-30g)', 'Complete amino acid profile', 'Mixes easily without clumps', 'Great taste with natural flavors'],
    verdictTemplate: 'This protein powder delivers {rating}-star quality according to {reviews} fitness enthusiasts. Features premium protein sources with complete amino acids for muscle recovery, {prime} eligible for fast delivery.',
    faqs: [
      { q: 'How much protein per serving?', a: 'Each serving provides 20-30g of high-quality protein depending on flavor.' },
      { q: 'Is it good for building muscle?', a: 'Complete amino acid profile supports muscle protein synthesis and recovery.' },
      { q: 'Does it mix well?', a: 'Instantized formula mixes smoothly in water, milk, or smoothies without clumping.' },
      { q: 'Is it suitable for lactose intolerant people?', a: 'Check label for whey isolate versions which contain minimal lactose.' }
    ]
  },
  kitchen_appliance: {
    benefits: ['Easy to clean and maintain', 'Multiple cooking functions', 'Energy efficient operation', 'Durable construction for daily use'],
    verdictTemplate: 'Home cooks rate this {rating} stars across {reviews} reviews for its versatility and reliability. Simplifies meal prep with multiple functions and easy cleanup, available with {prime} delivery.',
    faqs: [
      { q: 'Is it dishwasher safe?', a: 'Removable parts are typically dishwasher safe, check manual for specific components.' },
      { q: 'How many servings can it make?', a: 'Capacity varies by model, most handle 4-8 servings for family meals.' },
      { q: 'What is the warranty?', a: 'Includes manufacturer warranty, typically 1-2 years with registration.' },
      { q: 'Is it easy to store?', a: 'Compact design fits in standard cabinets, cord storage included on most models.' }
    ]
  },
  generic: {
    benefits: ['Highly rated by verified buyers', 'Quality materials and construction', 'Excellent value for the price', 'Fast and reliable delivery'],
    verdictTemplate: 'With {rating} stars from {reviews} verified purchasers, this product consistently exceeds expectations. Combines quality construction with excellent value, {prime} shipping ensures quick delivery.',
    faqs: [
      { q: 'Is this worth the price?', a: 'Highly rated for value, offering quality that matches or exceeds more expensive alternatives.' },
      { q: 'How is the build quality?', a: 'Constructed with durable materials designed for long-term daily use.' },
      { q: 'What if I need to return it?', a: 'Amazon offers hassle-free returns within 30 days of purchase.' },
      { q: 'Is this the latest version?', a: 'Check product listing for model year and any updated versions available.' }
    ]
  }
};

const detectProductCategory = (title: string, brand?: string): string => {
  const t = title.toLowerCase();
  const b = (brand || '').toLowerCase();

  if (/fitbit|garmin|whoop|oura|apple watch|samsung watch|amazfit/i.test(t) || /tracker|fitness band/i.test(t)) {
    return /watch/i.test(t) ? 'smartwatch' : 'fitness_tracker';
  }
  if (/smartwatch|watch\s*(series|ultra|se)|galaxy watch/i.test(t)) return 'smartwatch';
  if (/headphone|earbuds|airpods|earbud|over-ear|wireless.*audio/i.test(t)) return 'headphones';
  if (/electrolyte|lmnt|liquid iv|nuun|hydration/i.test(t)) return 'electrolyte';
  if (/protein|whey|casein|mass gainer/i.test(t)) return 'protein_powder';
  if (/vitamin|supplement|capsule|tablet|probiotic|omega|magnesium|zinc|creatine/i.test(t)) return 'supplement';
  if (/running shoe|trainer|sneaker|marathon|racing flat/i.test(t) || /nike|asics|hoka|brooks|saucony|new balance/i.test(b)) return 'running_shoes';
  if (/blender|air fryer|instant pot|pressure cooker|food processor|mixer/i.test(t)) return 'kitchen_appliance';

  return 'generic';
};

const generateSmartVerdict = (product: ProductDetails): string => {
  const category = detectProductCategory(product.title, product.brand);
  const template = PRODUCT_CATEGORIES[category]?.verdictTemplate || PRODUCT_CATEGORIES.generic.verdictTemplate;

  const rating = product.rating?.toFixed(1) || '4.5';
  const reviews = (product.reviewCount || 0).toLocaleString();
  const prime = product.prime ? 'Prime' : 'standard';

  return template
    .replace('{rating}', rating)
    .replace('{reviews}', reviews)
    .replace('{prime}', prime);
};

const generateSmartClaims = (product: ProductDetails): string[] => {
  const category = detectProductCategory(product.title, product.brand);
  return PRODUCT_CATEGORIES[category]?.benefits || PRODUCT_CATEGORIES.generic.benefits;
};

const generateProductFaqs = (product: ProductDetails): Array<{q: string; a: string}> => {
  const category = detectProductCategory(product.title, product.brand);
  return PRODUCT_CATEGORIES[category]?.faqs || PRODUCT_CATEGORIES.generic.faqs;
};

const generateDefaultVerdict = (title: string): string => {
  const category = detectProductCategory(title, '');
  const template = PRODUCT_CATEGORIES[category]?.verdictTemplate || PRODUCT_CATEGORIES.generic.verdictTemplate;
  return template.replace('{rating}', '4.5').replace('{reviews}', '1,000+').replace('{prime}', 'Prime');
};

const generateDefaultClaims = (): string[] => {
  return PRODUCT_CATEGORIES.generic.benefits;
};

/**
 * Generate Tactical Link style product box (HELPER - NOT EXPORTED)
 */
const generateTacticalLinkHtml = (
  product: ProductDetails,
  amazonUrl: string,
  stars: number,
  tag: string
): string => {
  return `
<!-- AmzWP Tactical Link -->
<div style="max-width:900px;margin:2rem auto;padding:1.5rem;background:linear-gradient(135deg,#fff,#f8fafc);border:1px solid #e2e8f0;border-radius:1.5rem;display:flex;align-items:center;gap:1.5rem;flex-wrap:wrap;box-shadow:0 10px 40px rgba(0,0,0,0.08);font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="position:relative;">
    <img src="${product.imageUrl}" alt="${product.title}" style="width:100px;height:100px;object-fit:contain;background:#fff;border-radius:1rem;padding:0.5rem;border:1px solid #e2e8f0;">
    ${product.prime ? '<div style="position:absolute;bottom:-5px;left:50%;transform:translateX(-50%);background:#232f3e;color:#fff;padding:2px 8px;border-radius:4px;font-size:9px;font-weight:700;">✓ Prime</div>' : ''}
  </div>
  <div style="flex:1;min-width:200px;">
    <div style="font-size:10px;color:#3b82f6;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:4px;">⭐ Top Rated</div>
    <h4 style="margin:0;font-size:1.1rem;font-weight:800;color:#1e293b;line-height:1.3;">${product.title}</h4>
    <div style="display:flex;align-items:center;gap:8px;margin-top:6px;">
      <span style="color:#f59e0b;font-size:14px;">${'★'.repeat(stars)}${'☆'.repeat(5-stars)}</span>
      <span style="color:#64748b;font-size:11px;font-weight:600;">(${(product.reviewCount || 0).toLocaleString()} reviews)</span>
    </div>
  </div>
  <div style="text-align:center;">
    <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px;">Best Price</div>
    <div style="font-size:1.75rem;font-weight:900;color:#1e293b;line-height:1;">${product.price}</div>
    <a href="${amazonUrl}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-block;margin-top:12px;padding:12px 24px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:12px;text-transform:uppercase;letter-spacing:0.05em;box-shadow:0 4px 15px rgba(0,0,0,0.2);transition:transform 0.2s;">Check Price →</a>
  </div>
</div>
<!-- /AmzWP Tactical Link -->`;
};

/**
 * Generate Elite Bento style product box with FAQs (HELPER - NOT EXPORTED)
 */
const generateEliteBentoHtml = (
  product: ProductDetails,
  amazonUrl: string,
  stars: number,
  tag: string,
  currentDate: string
): string => {
  const bullets = product.evidenceClaims?.length ? product.evidenceClaims.slice(0, 4) : generateSmartClaims(product);
  const verdict = product.verdict || generateSmartVerdict(product);
  const faqs = generateProductFaqs(product);

  const faqHtml = faqs.map((faq, idx) => `
    <div style="border-bottom:${idx < faqs.length - 1 ? '1px solid #e2e8f0' : 'none'};padding:12px 0;">
      <div style="font-weight:700;color:#1e293b;font-size:13px;margin-bottom:6px;">${faq.q}</div>
      <div style="color:#64748b;font-size:12px;line-height:1.5;">${faq.a}</div>
    </div>
  `).join('');

  return `
<!-- AmzWP Elite Bento Box -->
<div style="max-width:1000px;margin:3rem auto;padding:0;background:#fff;border-radius:2.5rem;box-shadow:0 25px 80px rgba(0,0,0,0.1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">

  <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#fbbf24;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;">Editor's Choice</span>
    <span style="color:#94a3b8;font-size:10px;font-weight:600;">Verified ${currentDate}</span>
  </div>

  <div style="display:flex;flex-wrap:wrap;">
    <div style="flex:1;min-width:280px;padding:2.5rem;background:linear-gradient(135deg,#f8fafc,#fff);display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="position:absolute;top:1rem;left:1rem;background:#fff;padding:8px 14px;border-radius:2rem;box-shadow:0 4px 15px rgba(0,0,0,0.1);display:flex;align-items:center;gap:6px;">
        <span style="color:#f59e0b;font-size:12px;">${'★'.repeat(stars)}</span>
        <span style="color:#64748b;font-size:11px;font-weight:600;">${(product.reviewCount || 0).toLocaleString()}</span>
      </div>
      <img src="${product.imageUrl}" alt="${product.title}" style="max-width:280px;max-height:280px;object-fit:contain;filter:drop-shadow(0 20px 40px rgba(0,0,0,0.15));">
      ${product.prime ? '<div style="position:absolute;bottom:1rem;left:1rem;background:#232f3e;color:#fff;padding:6px 12px;border-radius:8px;font-size:10px;font-weight:700;">Prime</div>' : ''}
    </div>

    <div style="flex:1.2;min-width:320px;padding:2.5rem;">
      <div style="display:inline-block;background:linear-gradient(135deg,#eff6ff,#dbeafe);color:#2563eb;padding:6px 14px;border-radius:2rem;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1rem;">${product.category || 'Featured'}</div>

      <h3 style="margin:0 0 1rem;font-size:1.75rem;font-weight:900;color:#0f172a;line-height:1.2;">${product.title}</h3>

      <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:1rem 1.25rem;border-radius:0 1rem 1rem 0;margin-bottom:1.5rem;">
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${verdict}</p>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
          <span style="color:#22c55e;font-size:11px;font-weight:600;">Verified Analysis</span>
        </div>
      </div>

      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:1.5rem;">
        ${bullets.map(claim => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:#f0fdf4;border-radius:10px;">
            <span style="color:#22c55e;font-weight:bold;font-size:12px;">+</span>
            <span style="color:#166534;font-size:12px;font-weight:500;line-height:1.4;">${claim}</span>
          </div>
        `).join('')}
      </div>

      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;padding-top:1.5rem;border-top:1px solid #e2e8f0;">
        <div>
          <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">Best Price</div>
          <div style="font-size:2.5rem;font-weight:900;color:#0f172a;line-height:1;">${product.price}</div>
        </div>
        <a href="${amazonUrl}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-flex;align-items:center;gap:10px;padding:16px 28px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-decoration:none;border-radius:14px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;box-shadow:0 10px 30px rgba(30,41,59,0.3);">
          Check Price
          <span style="font-size:16px;">-></span>
        </a>
      </div>
    </div>
  </div>

  <div style="background:#f8fafc;padding:1.5rem 2rem;border-top:1px solid #e2e8f0;">
    <div style="font-size:12px;font-weight:800;color:#1e293b;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1rem;">Frequently Asked Questions</div>
    ${faqHtml}
  </div>

  <div style="background:#fff;padding:1rem 2rem;display:flex;justify-content:center;gap:2rem;flex-wrap:wrap;border-top:1px solid #e2e8f0;">
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">Secure Checkout</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">Fast Shipping</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">Easy Returns</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">Amazon Verified</span>
  </div>
</div>
<!-- /AmzWP Elite Bento Box -->`;
};

/**
 * Generate product box HTML based on deployment mode (EXPORTED)
 */
export const generateProductBoxHtml = (
  product: ProductDetails,
  affiliateTag: string,
  mode: DeploymentMode = 'ELITE_BENTO'
): string => {
  const tag = affiliateTag || 'amzwp-20';
  const amazonUrl = `https://www.amazon.com/dp/${product.asin}?tag=${tag}`;
  const stars = Math.min(5, Math.max(0, Math.round(product.rating || 4.5)));
  const currentDate = new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' });

  if (mode === 'TACTICAL_LINK') {
    return generateTacticalLinkHtml(product, amazonUrl, stars, tag);
  }

  return generateEliteBentoHtml(product, amazonUrl, stars, tag, currentDate);
};

// ============================================================================
// COMPARISON TABLE HTML GENERATION
// ============================================================================

/**
 * Truncate string to specified length (HELPER)
 */
const truncateString = (str: string, maxLength: number): string => {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
};

/**
 * Generate comparison table HTML (EXPORTED)
 */
export const generateComparisonTableHtml = (
  data: ComparisonData,
  products: ProductDetails[],
  affiliateTag: string
): string => {
  const tag = affiliateTag || 'amzwp-20';
  const tableProducts = data.productIds
    .map(id => products.find(p => p.id === id))
    .filter(Boolean) as ProductDetails[];

  if (tableProducts.length < 2) return '';

  const specRows = (data.specs || ['Rating', 'Reviews', 'Prime']).map((spec, idx) => {
    return `
      <tr style="background:${idx % 2 === 0 ? '#f8fafc' : '#fff'};">
        ${tableProducts.map(p => {
          let value = p.specs?.[spec] || '';
          if (spec.toLowerCase() === 'rating') value = `${p.rating}/5 ★`;
          if (spec.toLowerCase() === 'reviews') value = `${(p.reviewCount || 0).toLocaleString()} reviews`;
          if (spec.toLowerCase() === 'prime') value = p.prime ? '✓ Yes' : '✗ No';
          
          return `
            <td style="padding:1rem;text-align:center;border-right:1px solid #e2e8f0;">
              <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;margin-bottom:4px;">${spec}</div>
              <div style="font-size:14px;font-weight:600;color:#0f172a;">${value || '-'}</div>
            </td>
          `;
        }).join('')}
      </tr>
    `;
  }).join('');

  return `
<!-- AmzWP Comparison Table -->
<div style="max-width:1100px;margin:3rem auto;background:#fff;border-radius:2rem;box-shadow:0 25px 80px rgba(0,0,0,0.1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  
  <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:1.5rem 2rem;text-align:center;">
    <h3 style="margin:0;color:#fff;font-size:1.1rem;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;">${data.title}</h3>
  </div>
  
  <div style="overflow-x:auto;">
    <table style="width:100%;border-collapse:collapse;min-width:600px;">
      <tbody>
        <!-- Product Row -->
        <tr>
          ${tableProducts.map((p, idx) => `
            <td style="padding:2rem;text-align:center;background:${idx === 0 ? 'linear-gradient(180deg,#eff6ff,#fff)' : '#fff'};border-right:1px solid #e2e8f0;position:relative;">
              ${idx === 0 ? '<div style="position:absolute;top:8px;left:50%;transform:translateX(-50%);background:#3b82f6;color:#fff;padding:4px 12px;border-radius:1rem;font-size:9px;font-weight:700;text-transform:uppercase;">Top Pick</div>' : ''}
              <img src="${p.imageUrl}" alt="${p.title}" style="max-width:150px;max-height:150px;object-fit:contain;margin-bottom:1rem;">
              <h4 style="margin:0 0 8px;font-size:14px;font-weight:700;color:#0f172a;line-height:1.3;">${truncateString(p.title, 50)}</h4>
              <div style="color:#f59e0b;margin-bottom:8px;font-size:12px;">${'★'.repeat(Math.round(p.rating || 4.5))}</div>
              <div style="font-size:1.5rem;font-weight:900;color:#0f172a;margin-bottom:1rem;">${p.price}</div>
              <a href="https://www.amazon.com/dp/${p.asin}?tag=${tag}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-block;padding:10px 20px;background:#1e293b;color:#fff;text-decoration:none;border-radius:8px;font-weight:700;font-size:11px;text-transform:uppercase;">Check Price</a>
            </td>
          `).join('')}
        </tr>
        
        <!-- Spec Rows -->
        ${specRows}
      </tbody>
    </table>
  </div>
</div>
<!-- /AmzWP Comparison Table -->`;
};

// ============================================================================
// SCHEMA.ORG JSON-LD GENERATION
// ============================================================================

/**
 * Generate JSON-LD schema for product (EXPORTED)
 */
export const generateProductSchema = (
  product: ProductDetails,
  affiliateTag: string
): string => {
  const amazonUrl = `https://www.amazon.com/dp/${product.asin}?tag=${affiliateTag}`;

  const schema = {
    '@context': 'https://schema.org/',
    '@type': 'Product',
    name: product.title,
    image: product.imageUrl,
    description: product.verdict || `High-quality ${product.title} available on Amazon`,
    brand: product.brand ? {
      '@type': 'Brand',
      name: product.brand,
    } : undefined,
    aggregateRating: {
      '@type': 'AggregateRating',
      ratingValue: product.rating || 4.5,
      reviewCount: product.reviewCount || 100,
      bestRating: 5,
      worstRating: 1,
    },
    offers: {
      '@type': 'Offer',
      url: amazonUrl,
      priceCurrency: 'USD',
      price: product.price?.replace(/[^0-9.]/g, '') || '0',
      availability: 'https://schema.org/InStock',
      seller: {
        '@type': 'Organization',
        name: 'Amazon',
      },
    },
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
};

/**
 * Generate FAQ schema (EXPORTED)
 */
export const generateFaqSchema = (faqs: FAQItem[]): string => {
  if (!faqs || faqs.length === 0) return '';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faqs.map(faq => ({
      '@type': 'Question',
      name: faq.question,
      acceptedAnswer: {
        '@type': 'Answer',
        text: faq.answer,
      },
    })),
  };

  return `<script type="application/ld+json">${JSON.stringify(schema)}</script>`;
};

// ============================================================================
// ASIN EXTRACTION
// ============================================================================

/**
 * Extract ASIN from Amazon URL or raw ASIN string (EXPORTED)
 */
export const extractASIN = (input: string): string | null => {
  const trimmed = input.trim();

  if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
    return trimmed.toUpperCase();
  }

  const patterns = [
    /amazon\.com\/(?:dp|gp\/product|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i,
    /\/dp\/([A-Z0-9]{10})/i,
    /\/product\/([A-Z0-9]{10})/i,
    /ASIN[=:]([A-Z0-9]{10})/i,
    /asin[=:]([A-Z0-9]{10})/i,
  ];

  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match) {
      return match[1].toUpperCase();
    }
  }

  return null;
};

// ============================================================================
// PRE-EXTRACT AMAZON PRODUCTS
// ============================================================================

/**
 * Pre-extract existing Amazon products from HTML content (EXPORTED)
 */
export const preExtractAmazonProducts = (html: string): { asin: string; context: string }[] => {
  const products: { asin: string; context: string }[] = [];
  const seenAsins = new Set<string>();

  const urlPattern = /amazon\.com\/(?:dp|gp\/product)\/([A-Z0-9]{10})/gi;
  const matches = html.matchAll(urlPattern);
  
  for (const match of matches) {
    const asin = match[1];
    if (asin && !seenAsins.has(asin)) {
      seenAsins.add(asin);
      const start = Math.max(0, match.index! - 100);
      const end = Math.min(html.length, match.index! + match[0].length + 100);
      const context = html.substring(start, end).replace(/<[^>]+>/g, ' ').trim();
      products.push({ asin, context });
    }
  }

  const asinPattern = /(?:asin|product-id|data-asin)[=:]["']?([A-Z0-9]{10})/gi;
  const asinMatches = html.matchAll(asinPattern);
  
  for (const match of asinMatches) {
    const asin = match[1];
    if (asin && !seenAsins.has(asin)) {
      seenAsins.add(asin);
      products.push({ asin, context: '' });
    }
  }

  return products;
};

// ============================================================================
// PROXY STATS
// ============================================================================

/**
 * Get proxy performance statistics (EXPORTED)
 */
export const getProxyStats = (): Record<string, { latency: number; failures: number; successes: number }> => {
  const stats: Record<string, { latency: number; failures: number; successes: number }> = {};

  for (const proxy of CORS_PROXIES) {
    stats[proxy.name] = {
      latency: proxyLatencyMap.get(proxy.name) ?? -1,
      failures: proxyFailureCount.get(proxy.name) ?? 0,
      successes: proxySuccessCount.get(proxy.name) ?? 0,
    };
  }

  return stats;
};

// ============================================================================
// ADDITIONAL HELPER FUNCTIONS
// ============================================================================

/**
 * Validate and normalize manually entered URL
 */
export const validateManualUrl = (url: string): { isValid: boolean; normalizedUrl?: string; error?: string } => {
  const trimmed = url.trim();
  
  if (!trimmed) {
    return { isValid: false, error: 'URL cannot be empty' };
  }
  
  // Add https:// if no protocol
  let normalized = trimmed;
  if (!normalized.match(/^https?:\/\//i)) {
    normalized = 'https://' + normalized;
  }
  
  // Validate URL format
  try {
    const urlObj = new URL(normalized);
    if (!urlObj.hostname || urlObj.hostname.length < 3) {
      return { isValid: false, error: 'Invalid hostname' };
    }
    return { isValid: true, normalizedUrl: normalized };
  } catch {
    return { isValid: false, error: 'Invalid URL format' };
  }
};

/**
 * Fetch ALL posts from WordPress REST API with pagination
 */
export const fetchPostsFromWordPressAPI = async (
  config: AppConfig,
  onProgress?: (current: number, total: number) => void
): Promise<BlogPost[]> => {
  if (!config.wpUrl) {
    throw new Error('WordPress URL not configured');
  }

  const allPosts: BlogPost[] = [];
  const perPage = 100;
  let currentPage = 1;
  let totalPages = 1;
  let totalPosts = 0;

  const apiBase = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2';

  const headers: Record<string, string> = {};
  if (config.wpUser && config.wpAppPassword) {
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);
    headers['Authorization'] = `Basic ${auth}`;
  }

  try {
    while (currentPage <= totalPages) {
      const url = `${apiBase}/posts?page=${currentPage}&per_page=${perPage}&_embed=false`;

      console.log(`[WP API] Fetching page ${currentPage}/${totalPages}...`);

      const response = await fetchWithTimeout(url, 30000, { headers });

      if (!response.ok) {
        if (response.status === 400 && currentPage > 1) {
          break;
        }
        throw new Error(`WordPress API error: ${response.status}`);
      }

      if (currentPage === 1) {
        const totalPagesHeader = response.headers.get('X-WP-TotalPages');
        const totalPostsHeader = response.headers.get('X-WP-Total');
        totalPages = totalPagesHeader ? parseInt(totalPagesHeader, 10) : 1;
        totalPosts = totalPostsHeader ? parseInt(totalPostsHeader, 10) : 0;
        console.log(`[WP API] Total posts: ${totalPosts}, Total pages: ${totalPages}`);
      }

      const posts = await response.json();

      if (!Array.isArray(posts) || posts.length === 0) {
        break;
      }

      for (const post of posts) {
        const { priority, type, status } = calculatePostPriority(
          post.title?.rendered || '',
          post.content?.rendered || ''
        );

        allPosts.push({
          id: post.id,
          title: decodeHtmlEntities(post.title?.rendered || 'Untitled'),
          url: post.link || '',
          postType: post.type || 'post',
          priority,
          monetizationStatus: status,
        });
      }

      if (onProgress) {
        onProgress(allPosts.length, totalPosts);
      }

      currentPage++;

      if (currentPage <= totalPages) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log(`[WP API] Fetched ${allPosts.length} total posts`);
    return allPosts;

  } catch (error: any) {
    console.error('[fetchPostsFromWordPressAPI] Error:', error);
    if (allPosts.length > 0) {
      console.log(`[WP API] Returning ${allPosts.length} posts fetched before error`);
      return allPosts;
    }
    throw new Error(`Failed to fetch posts from WordPress: ${error.message}`);
  }
};



// ============================================================================
// DEFAULT EXPORT (Optional - for backward compatibility)
// ============================================================================

export default {
  SecureStorage,
  IntelligenceCache,
  fetchWithSmartProxy,
  getProxyStats,
  resetProxyStats,
  fetchAndParseSitemap,
  normalizeSitemapUrl,
  parseSitemapXml,
  fetchPageContent,
  fetchRawPostContent,
  splitContentIntoBlocks,
  preExtractAmazonProducts,
  pushToWordPress,
  testConnection,
  callAIProvider,
  analyzeContentAndFindProduct,
  searchAmazonProduct,
  fetchProductByASIN,
  extractASIN,
  generateProductBoxHtml,
  generateComparisonTableHtml,
  generateProductSchema,
  generateFaqSchema,
  calculatePostPriority,
  runConcurrent,
  debounce,
  throttle,
  validateManualUrl,
  createBlogPostFromUrl,
};

// ============================================================================
// DEBUG UTILITIES - Available in browser console as window.amzDebug
// ============================================================================
if (typeof window !== 'undefined') {
  (window as any).amzDebug = {
    clearCache: () => {
      IntelligenceCache.clear();
      console.log('[DEBUG] Cache cleared');
    },
    clearProduct: (asin: string) => {
      IntelligenceCache.deleteProduct(asin);
      console.log(`[DEBUG] Cleared cache for product: ${asin}`);
    },
    viewCache: () => {
      console.log('[DEBUG] Cache not directly accessible, but you can clear specific products with clearProduct(asin)');
    }
  };
  console.log('[AMZ] Debug utilities available: window.amzDebug.clearCache(), window.amzDebug.clearProduct(asin)');
}
2240
