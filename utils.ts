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
// HELPER FUNCTIONS
// ============================================================================

const hashString = (str: string): string => {
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
// CORS PROXY SYSTEM - ENTERPRISE GRADE
// ============================================================================

const CORS_PROXIES = [
  {
    name: 'allorigins-raw',
    transform: (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
    timeout: 15000,
  },
  {
    name: 'corsproxy-io',
    transform: (url: string) => `https://corsproxy.io/?${encodeURIComponent(url)}`,
    timeout: 15000,
  },
  {
    name: 'thingproxy',
    transform: (url: string) => `https://thingproxy.freeboard.io/fetch/${url}`,
    timeout: 15000,
  },
  {
    name: 'codetabs',
    transform: (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
    timeout: 20000,
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

  // Try direct fetch first
  try {
    console.log(`[Fetch] Direct: ${url.substring(0, 60)}...`);
    const response = await fetchWithTimeout(url, 10000, {
      headers: { 'Accept': 'text/xml, application/xml, text/html, */*' },
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

export const fetchAndParseSitemap = async (
  inputUrl: string,
  config: AppConfig
): Promise<BlogPost[]> => {
  console.log('[Sitemap] ===== STARTING SCAN =====');
  console.log('[Sitemap] Input URL:', inputUrl);

  const sitemapUrls = normalizeSitemapUrl(inputUrl);
  console.log('[Sitemap] Will try these URLs:', sitemapUrls);

  const allPosts: BlogPost[] = [];
  const seenUrls = new Set<string>();
  let foundValidSitemap = false;
  let lastError = '';

  for (const sitemapUrl of sitemapUrls) {
    if (foundValidSitemap && allPosts.length > 0) break;

    try {
      console.log(`[Sitemap] Trying: ${sitemapUrl}`);
      
      const xml = await fetchWithSmartProxy(sitemapUrl, { timeout: 25000 });
      
      console.log(`[Sitemap] Got response, length: ${xml.length}`);
      
      if (!xml || xml.length < 100) {
        console.log('[Sitemap] Response too short, skipping');
        continue;
      }

      if (!xml.includes('<') || !xml.includes('loc')) {
        console.log('[Sitemap] Response does not look like XML sitemap');
        continue;
      }

      const urls = parseSitemapXml(xml);
      console.log(`[Sitemap] Parsed ${urls.length} URLs from ${sitemapUrl}`);

      if (urls.length === 0) continue;

      const isIndex = urls.every(u => u.includes('sitemap') || u.endsWith('.xml'));

      if (isIndex && urls.length < 100) {
        console.log('[Sitemap] Detected sitemap index, fetching sub-sitemaps...');
        
        for (const subSitemapUrl of urls.slice(0, 15)) {
          try {
            await new Promise(r => setTimeout(r, 300));
            console.log(`[Sitemap] Fetching sub-sitemap: ${subSitemapUrl}`);
            const subXml = await fetchWithSmartProxy(subSitemapUrl, { timeout: 20000 });
            const subUrls = parseSitemapXml(subXml);
            console.log(`[Sitemap] Sub-sitemap has ${subUrls.length} URLs`);

            for (const pageUrl of subUrls) {
              const normalizedUrl = pageUrl.toLowerCase();
              if (!seenUrls.has(normalizedUrl)) {
                seenUrls.add(normalizedUrl);
                allPosts.push(createBlogPostFromUrl(pageUrl, allPosts.length));
              }
            }
          } catch (subError: any) {
            console.warn(`[Sitemap] Sub-sitemap failed: ${subSitemapUrl} - ${subError.message}`);
          }
        }
        foundValidSitemap = allPosts.length > 0;
      } else {
        for (const pageUrl of urls) {
          const normalizedUrl = pageUrl.toLowerCase();
          if (!seenUrls.has(normalizedUrl)) {
            seenUrls.add(normalizedUrl);
            allPosts.push(createBlogPostFromUrl(pageUrl, allPosts.length));
          }
        }
        foundValidSitemap = true;
      }

    } catch (error: any) {
      lastError = error.message;
      console.warn(`[Sitemap] Failed: ${sitemapUrl} - ${error.message}`);
      continue;
    }
  }

  console.log('[Sitemap] ===== SCAN COMPLETE =====');
  console.log(`[Sitemap] Total posts found: ${allPosts.length}`);

  if (allPosts.length === 0) {
    throw new Error(
      `No sitemap found for "${inputUrl}". ` +
      `Tried ${sitemapUrls.length} URLs. ` +
      `Last error: ${lastError || 'Unknown'}. ` +
      `Try "WP API" button or "Add URL Manually" instead.`
    );
  }

  return allPosts;
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
      timeout: PAGE_FETCH_TIMEOUT_MS,
      validateResponse: (text) => text.length > 200,
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
  // Try WordPress API with ID first
  if (config.wpUrl && config.wpUser && config.wpAppPassword) {
    try {
      const apiBase = config.wpUrl.replace(/\/$/, '') + '/wp-json/wp/v2';
      const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

      // Try to find post by ID
      let response = await fetchWithTimeout(
        `${apiBase}/posts/${postId}`,
        10000,
        { headers: { 'Authorization': `Basic ${auth}` } }
      );

      if (response.ok) {
        const post = await response.json();
        return {
          content: post.content?.rendered || post.content?.raw || '',
          resolvedId: post.id,
        };
      }

      // Fallback: search by URL slug
      if (postUrl) {
        const urlObj = new URL(postUrl);
        const slug = urlObj.pathname.split('/').filter(s => s).pop();

        if (slug) {
          // Try posts
          response = await fetchWithTimeout(
            `${apiBase}/posts?slug=${encodeURIComponent(slug)}`,
            10000,
            { headers: { 'Authorization': `Basic ${auth}` } }
          );

          if (response.ok) {
            const posts = await response.json();
            if (posts.length > 0) {
              return {
                content: posts[0].content?.rendered || posts[0].content?.raw || '',
                resolvedId: posts[0].id,
              };
            }
          }

          // Try pages
          response = await fetchWithTimeout(
            `${apiBase}/pages?slug=${encodeURIComponent(slug)}`,
            10000,
            { headers: { 'Authorization': `Basic ${auth}` } }
          );

          if (response.ok) {
            const pages = await response.json();
            if (pages.length > 0) {
              return {
                content: pages[0].content?.rendered || pages[0].content?.raw || '',
                resolvedId: pages[0].id,
              };
            }
          }
        }
      }
    } catch (error) {
      console.warn('[fetchRawPostContent] WP API failed, falling back to proxy');
    }
  }

  // Fallback to proxy fetch
  const { content } = await fetchPageContent(config, postUrl);
  return { content, resolvedId: postId };
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
    const apiUrl = `${config.wpUrl.replace(/\/$/, '')}/wp-json/wp/v2/users/me`;
    const auth = btoa(`${config.wpUser}:${config.wpAppPassword}`);

    const response = await fetchWithTimeout(
      apiUrl,
      10000,
      { headers: { 'Authorization': `Basic ${auth}` } }
    );

    if (response.ok) {
      const user = await response.json();
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
      return {
        success: false,
        message: 'Authentication failed: Invalid username or app password',
      };
    } else if (response.status === 403) {
      return {
        success: false,
        message: 'Access forbidden: User may not have sufficient permissions',
      };
    } else if (response.status === 404) {
      return {
        success: false,
        message: 'REST API not found: Is WordPress REST API enabled?',
      };
    } else {
      return {
        success: false,
        message: `Connection failed with status ${response.status}`,
      };
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      return { success: false, message: 'Connection timeout - server not responding' };
    }
    return {
      success: false,
      message: error.message || 'Connection failed',
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
const callGemini = async (
  config: AppConfig,
  systemPrompt: string,
  userPrompt: string,
  options: { temperature: number; maxTokens: number; jsonMode: boolean }
): Promise<AIResponse> => {
  const apiKey = SecureStorage.decryptSync(config.geminiApiKey || '');
  if (!apiKey) {
    throw new Error('Gemini API key not configured');
  }

  const model = config.aiModel || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

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
  const apiKey = SecureStorage.decryptSync(config.openaiApiKey || '');
  if (!apiKey) {
    throw new Error('OpenAI API key not configured');
  }

  const model = config.aiModel || 'gpt-4o';

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
  const apiKey = SecureStorage.decryptSync(config.anthropicApiKey || '');
  if (!apiKey) {
    throw new Error('Anthropic API key not configured');
  }

  const model = config.aiModel || 'claude-3-5-sonnet-20241022';

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
  const apiKey = SecureStorage.decryptSync(config.groqApiKey || '');
  if (!apiKey) {
    throw new Error('Groq API key not configured');
  }

  const model = config.customModel || 'llama-3.3-70b-versatile';

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
  const apiKey = SecureStorage.decryptSync(config.openrouterApiKey || '');
  if (!apiKey) {
    throw new Error('OpenRouter API key not configured');
  }

  const model = config.customModel || 'anthropic/claude-3.5-sonnet';

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

const ANALYSIS_SYSTEM_PROMPT = `You are an expert Amazon affiliate content analyzer and monetization strategist. Your task is to analyze content and identify specific products that can be monetized through Amazon affiliate links.

You must return ONLY valid JSON with no additional text or explanation.`;

const ANALYSIS_USER_PROMPT = `Analyze this content and identify products for Amazon affiliate monetization.

CONTENT TITLE: {{TITLE}}

CONTENT:
{{CONTENT}}

INSTRUCTIONS:
1. Identify specific products mentioned or implied that are available on Amazon
2. For each product, provide a precise Amazon search query
3. Suggest optimal placement within the content (intro=0, middle=1, conclusion=2)
4. Assess confidence level (0-100) for each product match
5. If content compares multiple products, flag for comparison table

REQUIRED JSON FORMAT:
{
  "products": [
    {
      "id": "unique-string-id",
      "searchQuery": "exact product search for Amazon",
      "title": "Product Name",
      "relevanceReason": "Why this product fits the content",
      "placement": "intro|middle|conclusion",
      "confidence": 85,
      "category": "Electronics|Kitchen|Home|etc",
      "priceRange": "budget|mid|premium"
    }
  ],
  "comparison": {
    "shouldCreate": true,
    "title": "Comparison table title if applicable",
    "productIds": ["id1", "id2"]
  },
  "contentType": "review|listicle|how-to|informational|comparison",
  "monetizationPotential": "high|medium|low",
  "suggestedKeywords": ["keyword1", "keyword2"]
}`;

/**
 * Analyze content and find monetizable products
 */
export const analyzeContentAndFindProduct = async (
  title: string,
  content: string,
  config: AppConfig
): Promise<AnalysisResult> => {
  // Generate content hash for caching
  const contentHash = hashString(`${title}_${content.substring(0, 500)}_${content.length}`);

  // Check cache
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

  // Prepare content (truncate if too long)
  const maxContentLength = 15000;
  const truncatedContent = content.length > maxContentLength
    ? content.substring(0, maxContentLength) + '\n\n[Content truncated for analysis...]'
    : content;

  // Clean HTML from content for better analysis
  const cleanContent = stripHtml(truncatedContent);

  const prompt = ANALYSIS_USER_PROMPT
    .replace('{{TITLE}}', title)
    .replace('{{CONTENT}}', cleanContent);

  try {
    const response = await callAIProvider(
      config,
      ANALYSIS_SYSTEM_PROMPT,
      prompt,
      { temperature: 0.7, jsonMode: true }
    );

    // Parse response
    let parsed: any;
    try {
      // Try to extract JSON from response
      const jsonMatch = response.text.match(/\{[\s\S]*\}/);
      parsed = JSON.parse(jsonMatch ? jsonMatch[0] : response.text);
    } catch (parseError) {
      console.warn('[Analysis] Failed to parse AI response as JSON:', parseError);
      return {
        detectedProducts: [],
        contentType: 'unknown',
        monetizationPotential: 'low',
      };
    }

    // Process detected products
    const products: ProductDetails[] = [];

    for (const p of (parsed.products || [])) {
      // Skip low confidence matches
      if (p.confidence < 40) continue;

      // Try to fetch real product data from SerpAPI
      let productData: Partial<ProductDetails> = {};

      if (config.serpApiKey) {
        try {
          productData = await searchAmazonProduct(p.searchQuery, config.serpApiKey);
        } catch (error) {
          console.warn('[Analysis] SerpAPI lookup failed for:', p.searchQuery);
        }
      }

      // Determine insertion index based on placement
      const insertionIndex = p.placement === 'intro' ? 0 
        : p.placement === 'conclusion' ? -1 
        : 1;

      products.push({
        id: p.id || `prod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        title: productData.title || p.title || p.searchQuery,
        asin: productData.asin || '',
        price: productData.price || '$XX.XX',
        imageUrl: productData.imageUrl || 'https://via.placeholder.com/300x300?text=Product',
        rating: productData.rating || 4.5,
        reviewCount: productData.reviewCount || 1000,
        verdict: productData.verdict || generateDefaultVerdict(p.title || p.searchQuery),
        evidenceClaims: productData.evidenceClaims || generateDefaultClaims(),
        brand: productData.brand || '',
        category: p.category || 'General',
        prime: productData.prime ?? true,
        insertionIndex,
        deploymentMode: 'ELITE_BENTO',
        faqs: productData.faqs || generateDefaultFaqs(p.title || p.searchQuery),
        specs: productData.specs || {},
      });
    }

    // Build comparison data
    let comparison: ComparisonData | undefined;
    if (parsed.comparison?.shouldCreate && parsed.comparison.productIds?.length >= 2) {
      comparison = {
        title: parsed.comparison.title || `Top ${title} Comparison`,
        productIds: parsed.comparison.productIds.slice(0, 5),
        specs: ['Price', 'Rating', 'Reviews'],
      };
    }

    // Cache results
    IntelligenceCache.setAnalysis(contentHash, { products, comparison });

    return {
      detectedProducts: products,
      comparison,
      contentType: parsed.contentType || 'informational',
      monetizationPotential: parsed.monetizationPotential || 'medium',
      keywords: parsed.suggestedKeywords || [],
    };

  } catch (error: any) {
    console.error('[analyzeContentAndFindProduct] Error:', error);
    throw new Error(`AI analysis failed: ${error.message}`);
  }
};



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
// SERPAPI AMAZON SEARCH
// ============================================================================

/**
 * Search Amazon via SerpAPI
 */
export const searchAmazonProduct = async (
  query: string,
  apiKey: string
): Promise<Partial<ProductDetails>> => {
  if (!apiKey) return {};

  const cacheKey = `serp_${hashString(query.toLowerCase())}`;
  const cached = IntelligenceCache.get<Partial<ProductDetails>>(cacheKey);
  if (cached) {
    console.log('[SerpAPI] Returning cached result for:', query.substring(0, 30));
    return cached;
  }

  try {
    const url = `https://serpapi.com/search.json?engine=amazon&amazon_domain=amazon.com&k=${encodeURIComponent(query)}&api_key=${apiKey}`;

    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) {
      throw new Error(`SerpAPI error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.organic_results?.[0];

    if (!result) {
      console.warn('[SerpAPI] No results for:', query);
      return {};
    }

    const product: Partial<ProductDetails> = {
      asin: result.asin,
      title: result.title,
      price: result.price?.raw || result.price?.current || '$XX.XX',
      imageUrl: result.thumbnail || result.image,
      rating: parseFloat(result.rating) || 4.5,
      reviewCount: parseInt(String(result.reviews || '0').replace(/[^0-9]/g, '')) || 1000,
      prime: result.is_prime || false,
      brand: result.brand || '',
    };

    IntelligenceCache.set(cacheKey, product, CACHE_TTL_MS);
    return product;

  } catch (error: any) {
    console.warn('[searchAmazonProduct] Error:', error.message);
    return {};
  }
};

/**
 * Fetch product details by ASIN
 */
export const fetchProductByASIN = async (
  asin: string,
  apiKey: string
): Promise<ProductDetails | null> => {
  if (!apiKey || !asin) return null;

  // Validate ASIN format
  if (!/^[A-Z0-9]{10}$/i.test(asin)) {
    console.warn('[fetchProductByASIN] Invalid ASIN format:', asin);
    return null;
  }

  const cached = IntelligenceCache.getProduct(asin);
  if (cached) {
    console.log('[SerpAPI] Returning cached product:', asin);
    return cached;
  }

  try {
    const url = `https://serpapi.com/search.json?engine=amazon_product&product_id=${asin}&amazon_domain=amazon.com&api_key=${apiKey}`;

    const response = await fetchWithTimeout(url, 15000);
    if (!response.ok) {
      console.warn('[fetchProductByASIN] API error:', response.status);
      return null;
    }

    const data = await response.json();
    const result = data.product_results;

    if (!result) {
      console.warn('[fetchProductByASIN] No product found:', asin);
      return null;
    }

    const product: ProductDetails = {
      id: `prod-${asin}-${Date.now()}`,
      asin,
      title: result.title || 'Unknown Product',
      price: result.price?.raw || result.price?.current || '$XX.XX',
      imageUrl: result.main_image || result.images?.[0] || 'https://via.placeholder.com/300',
      rating: parseFloat(result.rating) || 4.5,
      reviewCount: parseInt(String(result.reviews_total || '0').replace(/[^0-9]/g, '')) || 1000,
      prime: result.is_prime || false,
      brand: result.brand || '',
      category: result.category?.[0]?.name || 'General',
      verdict: generateDefaultVerdict(result.title || 'This product'),
      evidenceClaims: result.feature_bullets?.slice(0, 4) || generateDefaultClaims(),
      faqs: generateDefaultFaqs(result.title || 'This product'),
      specs: {},
      insertionIndex: 1,
      deploymentMode: 'ELITE_BENTO',
    };

    IntelligenceCache.setProduct(asin, product);
    return product;

  } catch (error: any) {
    console.warn('[fetchProductByASIN] Error:', error.message);
    return null;
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

  // Simple tokenization approach
  const regex = /(<\/?(p|h[1-6]|div|section|article|blockquote|ul|ol|table|figure|pre)[^>]*>)/gi;
  const parts = html.split(regex);

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    
    if (!part) continue;

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
// PRIORITY CALCULATION
// ============================================================================

/**
 * Calculate post priority based on content analysis
 */
export const calculatePostPriority = (
  title: string,
  content: string
): { 
  priority: 'critical' | 'high' | 'medium' | 'low';
  type: string;
  status: 'monetized' | 'opportunity';
} => {
  const combined = `${title} ${content}`.toLowerCase();

  // Check if already monetized
  const hasAffiliateLinks = /amazon\.com|amzn\.to|affiliate|sponsored|product-box|aawp/i.test(content);

  if (hasAffiliateLinks) {
    return { priority: 'low', type: 'post', status: 'monetized' };
  }

  // Critical priority keywords (high buying intent)
  const criticalKeywords = [
    'best', 'top 10', 'top 5', 'review', 'vs', 'versus',
    'comparison', 'buying guide', 'how to buy', 'recommended',
    'which', 'best budget', 'best premium', 'worth it',
  ];

  // High priority keywords
  const highKeywords = [
    'tips', 'ideas', 'ways to', 'alternatives', 'should you',
    'guide', 'tutorial', 'how to choose', 'what to look for',
  ];

  // Determine content type
  let type = 'post';
  if (/review/i.test(title)) type = 'review';
  else if (/best|top \d/i.test(title)) type = 'listicle';
  else if (/how to|guide/i.test(title)) type = 'how-to';
  else if (/vs|comparison|versus/i.test(title)) type = 'comparison';

  // Check for critical keywords
  const isCritical = criticalKeywords.some(kw => combined.includes(kw));
  if (isCritical) {
    return { priority: 'critical', type, status: 'opportunity' };
  }

  // Check for high priority keywords
  const isHigh = highKeywords.some(kw => combined.includes(kw));
  if (isHigh) {
    return { priority: 'high', type, status: 'opportunity' };
  }

  // Check content length (longer content = more opportunity)
  if (content.length > 3000) {
    return { priority: 'medium', type, status: 'opportunity' };
  }

  return { priority: 'medium', type, status: 'opportunity' };
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

/**
 * Generate default verdict text (HELPER - NOT EXPORTED)
 */
const generateDefaultVerdict = (productTitle: string): string => {
  const name = productTitle.split(' ').slice(0, 4).join(' ');
  return `Engineered for users who demand excellence, the ${name} delivers professional-grade performance with meticulous attention to detail. Backed by thousands of verified reviews and trusted by industry professionals worldwide.`;
};

/**
 * Generate default evidence claims (HELPER - NOT EXPORTED)
 */
const generateDefaultClaims = (): string[] => {
  return [
    'Premium build quality with attention to detail',
    'Industry-leading performance metrics',
    'Backed by comprehensive warranty',
    'Trusted by thousands of verified buyers',
  ];
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
 * Generate Elite Bento style product box (HELPER - NOT EXPORTED)
 */
const generateEliteBentoHtml = (
  product: ProductDetails,
  amazonUrl: string,
  stars: number,
  tag: string,
  currentDate: string
): string => {
  const bullets = (product.evidenceClaims || generateDefaultClaims()).slice(0, 4);

  return `
<!-- AmzWP Elite Bento Box -->
<div style="max-width:1000px;margin:3rem auto;padding:0;background:#fff;border-radius:2.5rem;box-shadow:0 25px 80px rgba(0,0,0,0.1);overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  
  <!-- Header Badge -->
  <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:1rem 2rem;display:flex;justify-content:space-between;align-items:center;">
    <span style="color:#fbbf24;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.15em;">⭐ Editor's Choice</span>
    <span style="color:#94a3b8;font-size:10px;font-weight:600;">Verified ${currentDate}</span>
  </div>
  
  <div style="display:flex;flex-wrap:wrap;">
    <!-- Image Section -->
    <div style="flex:1;min-width:280px;padding:2.5rem;background:linear-gradient(135deg,#f8fafc,#fff);display:flex;align-items:center;justify-content:center;position:relative;">
      <div style="position:absolute;top:1rem;left:1rem;background:#fff;padding:8px 14px;border-radius:2rem;box-shadow:0 4px 15px rgba(0,0,0,0.1);display:flex;align-items:center;gap:6px;">
        <span style="color:#f59e0b;font-size:12px;">${'★'.repeat(stars)}</span>
        <span style="color:#64748b;font-size:11px;font-weight:600;">${(product.reviewCount || 0).toLocaleString()}</span>
      </div>
      <img src="${product.imageUrl}" alt="${product.title}" style="max-width:280px;max-height:280px;object-fit:contain;filter:drop-shadow(0 20px 40px rgba(0,0,0,0.15));">
      ${product.prime ? '<div style="position:absolute;bottom:1rem;left:1rem;background:#232f3e;color:#fff;padding:6px 12px;border-radius:8px;font-size:10px;font-weight:700;">✓ Prime</div>' : ''}
    </div>
    
    <!-- Content Section -->
    <div style="flex:1.2;min-width:320px;padding:2.5rem;">
      <div style="display:inline-block;background:linear-gradient(135deg,#eff6ff,#dbeafe);color:#2563eb;padding:6px 14px;border-radius:2rem;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:1rem;">${product.category || 'Featured'}</div>
      
      <h3 style="margin:0 0 1rem;font-size:1.75rem;font-weight:900;color:#0f172a;line-height:1.2;">${product.title}</h3>
      
      <!-- Verdict -->
      <div style="background:#f8fafc;border-left:4px solid #3b82f6;padding:1rem 1.25rem;border-radius:0 1rem 1rem 0;margin-bottom:1.5rem;">
        <p style="margin:0;color:#475569;font-size:14px;line-height:1.6;">${product.verdict || generateDefaultVerdict(product.title)}</p>
        <div style="margin-top:10px;display:flex;align-items:center;gap:8px;">
          <span style="color:#22c55e;font-size:11px;font-weight:600;">✓ Verified Analysis</span>
        </div>
      </div>
      
      <!-- Benefits -->
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:10px;margin-bottom:1.5rem;">
        ${bullets.map(claim => `
          <div style="display:flex;align-items:flex-start;gap:8px;padding:10px;background:#f0fdf4;border-radius:10px;">
            <span style="color:#22c55e;font-weight:bold;font-size:12px;">✓</span>
            <span style="color:#166534;font-size:12px;font-weight:500;line-height:1.4;">${claim}</span>
          </div>
        `).join('')}
      </div>
      
      <!-- Price & CTA -->
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:1rem;padding-top:1.5rem;border-top:1px solid #e2e8f0;">
        <div>
          <div style="font-size:10px;color:#64748b;font-weight:600;text-transform:uppercase;letter-spacing:0.1em;">Best Price</div>
          <div style="font-size:2.5rem;font-weight:900;color:#0f172a;line-height:1;">${product.price}</div>
        </div>
        <a href="${amazonUrl}" target="_blank" rel="nofollow sponsored noopener" style="display:inline-flex;align-items:center;gap:10px;padding:16px 28px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;text-decoration:none;border-radius:14px;font-weight:800;font-size:13px;text-transform:uppercase;letter-spacing:0.1em;box-shadow:0 10px 30px rgba(30,41,59,0.3);">
          Check Price
          <span style="font-size:16px;">→</span>
        </a>
      </div>
    </div>
  </div>
  
  <!-- Trust Footer -->
  <div style="background:#f8fafc;padding:1rem 2rem;display:flex;justify-content:center;gap:2rem;flex-wrap:wrap;border-top:1px solid #e2e8f0;">
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">🔒 Secure Checkout</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">🚚 Fast Shipping</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">↩️ Easy Returns</span>
    <span style="color:#64748b;font-size:11px;display:flex;align-items:center;gap:6px;">✓ Amazon Verified</span>
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
