/**
 * ============================================================================
 * SitemapScanner | Enterprise Content Discovery v100.0
 * ============================================================================
 * Features:
 * - Multiple discovery methods (Sitemap, WP API, Manual)
 * - Real-time progress feedback
 * - Smart error handling with actionable suggestions
 * - Filtering and search
 * - Batch processing integration
 * - Deep content audit
 * ============================================================================
 */

import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { BlogPost, AppConfig, SitemapState } from '../types';
import { 
  fetchAndParseSitemap, 
  fetchPostsFromWordPressAPI,
  validateManualUrl, 
  createBlogPostFromUrl,
  calculatePostPriority,
  fetchPageContent,
  getProxyStats,
} from '../utils';
import { toast } from 'sonner';

// ============================================================================
// TYPES
// ============================================================================

interface SitemapScannerProps {
  onPostSelect: (post: BlogPost) => void;
  savedState: SitemapState;
  onStateChange: (state: SitemapState) => void;
  config: AppConfig;
}

type ScanStatus = 'idle' | 'scanning' | 'auditing' | 'complete' | 'error';
type DiscoveryMethod = 'sitemap' | 'wordpress' | 'manual';
type FilterTab = 'all' | 'critical' | 'high' | 'medium' | 'low' | 'monetized';

// ============================================================================
// TOAST HELPER
// ============================================================================

const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info' = 'info') => {
    toast[type](message);
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const SitemapScanner: React.FC<SitemapScannerProps> = ({
  onPostSelect,
  savedState,
  onStateChange,
  config,
}) => {
  // ========== STATE ==========
  const [sitemapUrl, setSitemapUrl] = useState(savedState.url || '');
  const [posts, setPosts] = useState<BlogPost[]>(savedState.posts || []);
  const [status, setStatus] = useState<ScanStatus>('idle');
  const [filterTab, setFilterTab] = useState<FilterTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualUrl, setManualUrl] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [auditProgress, setAuditProgress] = useState({ current: 0, total: 0 });
  const [discoveryMethod, setDiscoveryMethod] = useState<DiscoveryMethod>('sitemap');

  // ========== REFS ==========
  const abortControllerRef = useRef<AbortController | null>(null);

  // ========== SYNC STATE ==========
  useEffect(() => {
    if (posts.length > 0 || sitemapUrl) {
      onStateChange({
        url: sitemapUrl,
        posts,
        lastScanned: Date.now(),
      });
    }
  }, [posts, sitemapUrl]);

  // ========== FILTERED POSTS ==========
  const filteredPosts = useMemo(() => {
    let result = [...posts];

    if (filterTab !== 'all') {
      if (filterTab === 'monetized') {
        result = result.filter(p => p.monetizationStatus === 'monetized');
      } else {
        result = result.filter(p => p.priority === filterTab && p.monetizationStatus === 'opportunity');
      }
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(p => 
        p.title.toLowerCase().includes(query) || 
        p.url.toLowerCase().includes(query)
      );
    }

    return result;
  }, [posts, filterTab, searchQuery]);

  // ========== STATS ==========
  const stats = useMemo(() => ({
    total: posts.length,
    critical: posts.filter(p => p.priority === 'critical' && p.monetizationStatus === 'opportunity').length,
    high: posts.filter(p => p.priority === 'high' && p.monetizationStatus === 'opportunity').length,
    medium: posts.filter(p => p.priority === 'medium' && p.monetizationStatus === 'opportunity').length,
    low: posts.filter(p => p.priority === 'low' && p.monetizationStatus === 'opportunity').length,
    monetized: posts.filter(p => p.monetizationStatus === 'monetized').length,
  }), [posts]);

  // ========== SITEMAP DISCOVERY ==========
  const handleSitemapFetch = async () => {
    const trimmedUrl = sitemapUrl.trim();
    if (!trimmedUrl) {
      showToast('Please enter a domain or sitemap URL', 'warning');
      return;
    }

    abortControllerRef.current?.abort();
    abortControllerRef.current = new AbortController();

    setStatus('scanning');
    setErrorMessage(null);
    
    console.log('[Scanner] Starting sitemap discovery for:', trimmedUrl);

    try {
      const discoveredPosts = await fetchAndParseSitemap(trimmedUrl, config);
      
      console.log('[Scanner] Discovered posts:', discoveredPosts.length);
      
      if (discoveredPosts.length === 0) {
        throw new Error('No posts found');
      }
      
      setPosts(discoveredPosts);
      setStatus('complete');
      showToast(`✓ Found ${discoveredPosts.length} pages!`, 'success');
      
    } catch (error: any) {
      console.error('[Scanner] Error:', error);
      setErrorMessage(error.message || 'Discovery failed');
      setStatus('error');
      showToast('Discovery failed - see error details below', 'error');
    }
  };

  // ========== WORDPRESS API DISCOVERY ==========
  const handleWordPressAPI = async () => {
    if (!config.wpUrl || !config.wpUser || !config.wpAppPassword) {
      showToast('Configure WordPress credentials first (click ⚙️ icon)', 'warning');
      return;
    }

    setStatus('scanning');
    setErrorMessage(null);
    setDiscoveryMethod('wordpress');

    try {
      const discoveredPosts = await fetchPostsFromWordPressAPI(config);
      
      setPosts(discoveredPosts);
      setSitemapUrl(config.wpUrl);
      setStatus('complete');
      showToast(`✓ Found ${discoveredPosts.length} posts via WordPress API!`, 'success');
      
    } catch (error: any) {
      console.error('[WordPress API] Error:', error);
      setErrorMessage(`WordPress API Error: ${error.message}`);
      setStatus('error');
      showToast('WordPress API failed - check credentials', 'error');
    }
  };

  // ========== MANUAL ADD ==========
  const handleManualAdd = () => {
    const validation = validateManualUrl(manualUrl);
    
    if (!validation.isValid) {
      showToast(validation.error || 'Invalid URL', 'error');
      return;
    }

        if (validation.normalizedUrl && posts.some(p => p.url.toLowerCase() === validation.normalizedUrl!.toLowerCase())) {
      showToast('URL already in list', 'warning');
      return;
    }

    const newPost = createBlogPostFromUrl(validation.normalizedUrl!, posts.length);
    setPosts(prev => [newPost, ...prev]);
    setManualUrl('');
    setShowManualAdd(false);
    showToast('URL added successfully', 'success');
  };

  // ========== DEEP AUDIT ==========
  const runDeepAudit = async () => {
    if (posts.length === 0) return;
    
    setStatus('auditing');
    setAuditProgress({ current: 0, total: posts.length });
    
    const updatedPosts = [...posts];
    let completed = 0;

    for (let i = 0; i < updatedPosts.length; i++) {
      try {
        const { content } = await fetchPageContent(config, updatedPosts[i].url);
        const { priority, type, status: monetizationStatus } = calculatePostPriority(
          updatedPosts[i].title,
          content
        );
        
        updatedPosts[i] = {
          ...updatedPosts[i],
          priority,
          postType: type,
          monetizationStatus,
        };
      } catch {}
      
      completed++;
      setAuditProgress({ current: completed, total: posts.length });
    }

    setPosts(updatedPosts);
    setStatus('complete');
    showToast('Content audit complete!', 'success');
  };

  // ========== DEBUG INFO ==========
  const showDebugInfo = () => {
    const stats = getProxyStats();
    console.log('[Debug] Proxy Statistics:', stats);
    alert(`Proxy Statistics:\n${JSON.stringify(stats, null, 2)}`);
  };

  // ========== RENDER ==========
  return (
    <div className="h-full flex flex-col bg-dark-950">
      {/* ========== HEADER ========== */}
      <header className="flex-shrink-0 p-6 md:p-8 border-b border-dark-800 bg-dark-900/50">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-3xl md:text-4xl font-black text-white tracking-tight">
                Content Discovery
              </h1>
              <p className="text-gray-500 text-sm mt-1">
                Find and analyze your content for monetization opportunities
              </p>
            </div>
            
            {/* Debug Button */}
            <button
              onClick={showDebugInfo}
              className="text-gray-600 hover:text-gray-400 text-xs"
              title="Show debug info"
            >
              <i className="fa-solid fa-bug" />
            </button>
          </div>
          
          {/* ========== SEARCH FORM ========== */}
          <div className="flex gap-3 flex-wrap">
            <div className="flex-1 min-w-[280px]">
              <input
                type="text"
                value={sitemapUrl}
                onChange={e => setSitemapUrl(e.target.value)}
                placeholder="Enter domain (example.com) or full sitemap URL"
                className="w-full bg-dark-800 border border-dark-700 rounded-2xl px-6 py-4 text-white placeholder-gray-500 focus:border-brand-500 focus:ring-2 focus:ring-brand-500/20 outline-none transition-all"
                disabled={status === 'scanning' || status === 'auditing'}
                onKeyDown={e => e.key === 'Enter' && handleSitemapFetch()}
              />
            </div>
            
            {/* Sitemap Discover Button */}
            <button
              onClick={handleSitemapFetch}
              disabled={status === 'scanning' || status === 'auditing' || !sitemapUrl.trim()}
              className="px-8 py-4 bg-gradient-to-r from-brand-600 to-purple-600 hover:from-brand-500 hover:to-purple-500 text-white font-black rounded-2xl transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 shadow-xl hover:shadow-brand-500/25"
            >
              {status === 'scanning' ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" />
                  Scanning...
                </>
              ) : status === 'auditing' ? (
                <>
                  <i className="fa-solid fa-spinner fa-spin" />
                  Auditing {auditProgress.current}/{auditProgress.total}
                </>
              ) : (
                <>
                  <i className="fa-solid fa-satellite-dish" />
                  Discover
                </>
              )}
            </button>

            {/* WordPress API Button */}
            <button
              onClick={handleWordPressAPI}
              disabled={status === 'scanning' || status === 'auditing'}
              className="px-6 py-4 bg-dark-800 hover:bg-dark-700 text-white font-bold rounded-2xl transition-all border border-dark-700 hover:border-brand-500/50 disabled:opacity-50 flex items-center gap-2"
              title="Fetch posts directly from WordPress REST API"
            >
              <i className="fa-brands fa-wordpress text-lg" />
              <span className="hidden md:inline">WP API</span>
            </button>

            {/* Manual Add Button */}
            <button
              onClick={() => setShowManualAdd(true)}
              disabled={status === 'scanning' || status === 'auditing'}
              className="px-6 py-4 bg-dark-800 hover:bg-dark-700 text-white font-bold rounded-2xl transition-all border border-dark-700 hover:border-green-500/50 disabled:opacity-50 flex items-center gap-2"
            >
              <i className="fa-solid fa-plus" />
              <span className="hidden md:inline">Add URL</span>
            </button>
          </div>

          {/* ========== ERROR MESSAGE ========== */}
          {errorMessage && (
            <div className="mt-4 p-4 bg-red-500/10 border border-red-500/30 rounded-2xl">
              <div className="flex items-start gap-3">
                <i className="fa-solid fa-exclamation-triangle text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm text-red-400 font-medium">Discovery Error</p>
                  <p className="text-xs text-gray-400 mt-1">{errorMessage}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      onClick={handleWordPressAPI}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 text-xs font-bold rounded-lg transition-all"
                    >
                      Try WordPress API →
                    </button>
                    <button
                      onClick={() => setShowManualAdd(true)}
                      className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 text-xs font-bold rounded-lg transition-all"
                    >
                      Add URLs Manually →
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </header>

      {/* ========== FILTER TABS ========== */}
      {posts.length > 0 && (
        <div className="flex-shrink-0 border-b border-dark-800 bg-dark-900/30">
          <div className="max-w-6xl mx-auto px-6 md:px-8">
            <div className="flex gap-2 overflow-x-auto py-4 scrollbar-hide">
              {[
                { id: 'all' as FilterTab, label: 'All', count: stats.total, icon: 'fa-layer-group' },
                { id: 'critical' as FilterTab, label: 'Critical', count: stats.critical, icon: 'fa-fire', color: 'red' },
                { id: 'high' as FilterTab, label: 'High', count: stats.high, icon: 'fa-arrow-up', color: 'orange' },
                { id: 'medium' as FilterTab, label: 'Medium', count: stats.medium, icon: 'fa-minus', color: 'yellow' },
                { id: 'low' as FilterTab, label: 'Low', count: stats.low, icon: 'fa-arrow-down', color: 'green' },
                { id: 'monetized' as FilterTab, label: 'Monetized', count: stats.monetized, icon: 'fa-check', color: 'purple' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilterTab(tab.id)}
                  className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 whitespace-nowrap ${
                    filterTab === tab.id
                      ? 'bg-brand-500 text-white shadow-lg shadow-brand-500/25'
                      : 'bg-dark-800 text-gray-400 hover:bg-dark-700 hover:text-white'
                  }`}
                >
                  <i className={`fa-solid ${tab.icon}`} />
                  {tab.label}
                  <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                    filterTab === tab.id ? 'bg-white/20' : 'bg-dark-700'
                  }`}>
                    {tab.count}
                  </span>
                </button>
              ))}
              
              {/* Deep Audit Button */}
              <button
                onClick={runDeepAudit}
                disabled={status === 'auditing' || posts.length === 0}
                className="ml-auto px-4 py-2 bg-violet-500/20 hover:bg-violet-500/30 text-violet-400 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-2"
              >
                <i className="fa-solid fa-microscope" />
                Deep Audit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========== POST LIST ========== */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto p-6 md:p-8">
          {posts.length === 0 ? (
            <div className="py-20 text-center">
              <div className="w-24 h-24 mx-auto mb-6 rounded-3xl bg-dark-800 flex items-center justify-center">
                <i className="fa-solid fa-map text-4xl text-dark-600" />
              </div>
              <h2 className="text-2xl font-black text-white mb-2">No Content Discovered</h2>
              <p className="text-gray-500 max-w-md mx-auto mb-6">
                Enter your domain above and click "Discover" to scan your sitemap,
                or use "WP API" if you have WordPress credentials configured.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setSitemapUrl('example.com')}
                  className="px-4 py-2 bg-dark-800 hover:bg-dark-700 text-gray-400 hover:text-white rounded-lg text-sm transition-all"
                >
                  Try example.com
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Search Bar */}
              <div className="flex gap-4 mb-6">
                <div className="flex-1 relative">
                  <i className="fa-solid fa-search absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search posts..."
                    className="w-full bg-dark-800 border border-dark-700 rounded-xl pl-12 pr-4 py-3 text-white placeholder-gray-500 focus:border-brand-500 outline-none"
                  />
                </div>
                <div className="text-sm text-gray-500 flex items-center">
                  Showing {filteredPosts.length} of {posts.length}
                </div>
              </div>

              {/* Posts Grid */}
              <div className="space-y-3">
                {filteredPosts.map(post => (
                  <div
                    key={post.id}
                    onClick={() => onPostSelect(post)}
                    className="p-4 md:p-5 bg-dark-800 hover:bg-dark-750 border border-dark-700 hover:border-brand-500/50 rounded-2xl cursor-pointer transition-all group"
                  >
                    <div className="flex items-center gap-4">
                      {/* Priority Badge */}
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 ${
                        post.monetizationStatus === 'monetized' 
                          ? 'bg-purple-500/20 text-purple-400'
                          : post.priority === 'critical'
                          ? 'bg-red-500/20 text-red-400'
                          : post.priority === 'high'
                          ? 'bg-orange-500/20 text-orange-400'
                          : post.priority === 'medium'
                          ? 'bg-yellow-500/20 text-yellow-400'
                          : 'bg-green-500/20 text-green-400'
                      }`}>
                        <i className={`fa-solid ${
                          post.monetizationStatus === 'monetized' ? 'fa-check' : 'fa-dollar-sign'
                        } text-lg`} />
                      </div>

                      {/* Content */}
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-white group-hover:text-brand-400 transition-colors truncate">
                          {post.title}
                        </h3>
                        <a
                          href={post.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-xs text-gray-500 hover:text-brand-400 truncate mt-1 block underline decoration-dotted underline-offset-2"
                        >
                          {post.url}
                        </a>
                      </div>

                      {/* Type Badge */}
                      <div className="hidden md:block px-3 py-1 bg-dark-700 rounded-lg text-xs font-bold text-gray-400 uppercase">
                        {post.postType}
                      </div>

                      {/* Arrow */}
                      <div className="text-gray-600 group-hover:text-brand-400 group-hover:translate-x-1 transition-all">
                        <i className="fa-solid fa-chevron-right" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* ========== MANUAL ADD MODAL ========== */}
      {showManualAdd && (
        <div 
          className="fixed inset-0 z-[100] bg-black/90 backdrop-blur-xl flex items-center justify-center p-4"
          onClick={e => e.target === e.currentTarget && setShowManualAdd(false)}
        >
          <div className="bg-dark-900 border border-dark-700 rounded-3xl p-8 max-w-lg w-full shadow-2xl">
            <h2 className="text-2xl font-black text-white mb-2">Add URL Manually</h2>
            <p className="text-sm text-gray-500 mb-6">
              Enter the full URL of a page you want to monetize
            </p>
            
            <input
              type="text"
              value={manualUrl}
              onChange={e => setManualUrl(e.target.value)}
              placeholder="https://example.com/blog-post-title"
              className="w-full bg-dark-800 border border-dark-700 rounded-xl px-4 py-4 text-white placeholder-gray-500 focus:border-brand-500 outline-none mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleManualAdd()}
            />
            
            <div className="flex gap-3">
              <button
                onClick={() => setShowManualAdd(false)}
                className="flex-1 px-6 py-4 bg-dark-800 text-white font-bold rounded-xl hover:bg-dark-700 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleManualAdd}
                className="flex-1 px-6 py-4 bg-brand-600 hover:bg-brand-500 text-white font-black rounded-xl transition-all"
              >
                Add URL
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SitemapScanner;
