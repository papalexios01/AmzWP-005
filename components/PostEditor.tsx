
import React, { useState, useEffect, useCallback, useMemo, useRef, Dispatch, SetStateAction } from 'react';
import { BlogPost, ProductDetails, AppConfig, DeploymentMode, ComparisonData, BoxStyle } from '../types';
import { pushToWordPress, fetchRawPostContent, analyzeContentAndFindProduct, splitContentIntoBlocks, IntelligenceCache, generateProductBoxHtml, generateComparisonTableHtml, fetchProductByASIN } from '../utils';
import { ProductBoxPreview } from './ProductBoxPreview';
import { PremiumProductBox } from './PremiumProductBox';
import { ComparisonTablePreview } from './ComparisonTablePreview';
import { useHistory } from '../hooks/useHistory';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';
import { useReducedMotion } from '../hooks/useReducedMotion';
import { toast } from 'sonner';

// ============================================================================
// AUTO-SAVE CONFIGURATION
// ============================================================================
const AUTO_SAVE_INTERVAL_MS = 30000;
const AUTO_SAVE_KEY_PREFIX = 'amzwp_autosave_';

interface PostEditorProps {
    post: BlogPost;
    config: AppConfig;
    onBack: () => void;
    allPosts?: BlogPost[];
    onSwitchPost?: Dispatch<SetStateAction<BlogPost | null>>;
}

interface EditorNode {
    id: string;
    type: 'HTML' | 'PRODUCT' | 'COMPARISON';
    content?: string;
    productId?: string;
    comparisonData?: ComparisonData; // Only for COMPARISON type
}

export const PostEditor: React.FC<PostEditorProps> = ({ post, config, onBack }) => {
    // Core State with History (Undo/Redo)
    const {
        state: editorNodes,
        set: setEditorNodesWithHistory,
        undo,
        redo,
        canUndo,
        canRedo,
        historyLength,
        reset: resetHistory,
    } = useHistory<EditorNode[]>([]);
    
    // Direct setter for initialization (bypasses history)
    const setEditorNodes = useCallback((nodes: EditorNode[] | ((prev: EditorNode[]) => EditorNode[])) => {
        if (typeof nodes === 'function') {
            setEditorNodesWithHistory(nodes);
        } else {
            setEditorNodesWithHistory(nodes);
        }
    }, [setEditorNodesWithHistory]);
    
    const [productMap, setProductMap] = useState<Record<string, ProductDetails>>({});
    const [currentId, setCurrentId] = useState<number>(post.id);
    const [status, setStatus] = useState<'idle' | 'fetching' | 'analyzing' | 'pushing' | 'error'>('idle');
    const [viewTab, setViewTab] = useState<'visual' | 'code'>('visual');
    const [hoveredNode, setHoveredNode] = useState<string | null>(null);
    const [manualAsin, setManualAsin] = useState<string>('');
    const [addingProduct, setAddingProduct] = useState<boolean>(false);
    
    // Reduced Motion Preference
    const prefersReducedMotion = useReducedMotion();
    
    useKeyboardShortcuts({
        'ctrl+z': () => { if (canUndo) { undo(); toast('Undo', { duration: 1500, style: { background: '#0ea5e9' } }); } },
        'meta+z': () => { if (canUndo) { undo(); toast('Undo', { duration: 1500, style: { background: '#0ea5e9' } }); } },
        'ctrl+shift+z': () => { if (canRedo) { redo(); toast('Redo', { duration: 1500, style: { background: '#0ea5e9' } }); } },
        'meta+shift+z': () => { if (canRedo) { redo(); toast('Redo', { duration: 1500, style: { background: '#0ea5e9' } }); } },
        'ctrl+y': () => { if (canRedo) { redo(); toast('Redo', { duration: 1500, style: { background: '#0ea5e9' } }); } },
    }, { ignoreInputs: true });

    // Initialization Logic
    useEffect(() => {
        let isMounted = true;

        const init = async () => {
            setStatus('fetching');

            try {
                console.log('[PostEditor] Starting initialization for post:', post.id);

                // 1. Fetch Content
                const result = await fetchRawPostContent(config, post.id, post.url || "");

                if (!isMounted) return;

                console.log('[PostEditor] Fetched content, length:', result.content?.length || 0);

                if (!result.content || result.content.length < 10) {
                    throw new Error('No content received from WordPress API');
                }

                setCurrentId(result.resolvedId);

                // 2. Hydrate Products from Cache or Props
                let initialProducts = post.activeProducts || [];
                const contentHash = `v3_${post.title}_${result.content.length}`;
                const cached = IntelligenceCache.getAnalysis(contentHash);

                let initialComparison: ComparisonData | undefined = undefined;

                if (cached) {
                    if (initialProducts.length === 0) initialProducts = cached.products;
                    if (cached.comparison) initialComparison = cached.comparison;
                }

                // 3. Build Product Map
                const pMap: Record<string, ProductDetails> = {};
                initialProducts.forEach(p => pMap[p.id] = p);

                if (!isMounted) return;

                setProductMap(pMap);

                // 4. Construct Editor Nodes
                const rawBlocks = splitContentIntoBlocks(result.content || '');

                console.log('[PostEditor] Split into', rawBlocks.length, 'blocks');

                if (rawBlocks.length === 0) {
                    throw new Error('Failed to parse content into blocks');
                }

                const nodes: EditorNode[] = [];

                rawBlocks.forEach((block, idx) => {
                    nodes.push({ id: `block-${Date.now()}-${idx}`, type: 'HTML', content: block });
                });

                // Initial Placement Strategy
                const placedProducts = initialProducts.filter(p => p.insertionIndex > -1).sort((a, b) => a.insertionIndex - b.insertionIndex);

                let offset = 0;
                placedProducts.forEach(p => {
                    const targetIndex = Math.min(p.insertionIndex + offset, nodes.length);
                    nodes.splice(targetIndex, 0, { id: `prod-node-${p.id}`, type: 'PRODUCT', productId: p.id });
                    offset++;
                });

                // Auto-inject comparison table if detected and not present
                if (initialComparison) {
                    nodes.splice(1, 0, {
                        id: `comp-table-${Date.now()}`,
                        type: 'COMPARISON',
                        comparisonData: initialComparison
                    });
                    offset++;
                }

                if (!isMounted) return;

                console.log('[PostEditor] Initializing with', nodes.length, 'nodes');

                // Use resetHistory to set initial state without creating undo history
                resetHistory(nodes);
                setStatus('idle');

                console.log('[PostEditor] Initialization complete');
            } catch (e: any) {
                if (!isMounted) return;

                console.error('[PostEditor] Initialization failed:', e);
                setStatus('error');
                toast(`Failed to load content: ${e.message}`);
            }
        };

        init();

        return () => {
            isMounted = false;
        };
    }, [post.id]);

    // --- AUTO-SAVE SYSTEM ---
    
    const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
    const lastSaveRef = useRef<number>(0);
    
    const saveToLocalStorage = useCallback(() => {
        try {
            const state = {
                editorNodes,
                productMap,
                timestamp: Date.now(),
            };
            localStorage.setItem(`${AUTO_SAVE_KEY_PREFIX}${post.id}`, JSON.stringify(state));
            lastSaveRef.current = Date.now();
        } catch (error) {
            console.warn('[AutoSave] Failed to save:', error);
        }
    }, [editorNodes, productMap, post.id]);
    
    const loadFromLocalStorage = useCallback((): { editorNodes: EditorNode[]; productMap: Record<string, ProductDetails> } | null => {
        try {
            const saved = localStorage.getItem(`${AUTO_SAVE_KEY_PREFIX}${post.id}`);
            if (saved) {
                const parsed = JSON.parse(saved);
                const age = Date.now() - (parsed.timestamp || 0);
                if (age < 24 * 60 * 60 * 1000) {
                    return { editorNodes: parsed.editorNodes, productMap: parsed.productMap };
                }
            }
        } catch (error) {
            console.warn('[AutoSave] Failed to load:', error);
        }
        return null;
    }, [post.id]);
    
    const clearAutoSave = useCallback(() => {
        localStorage.removeItem(`${AUTO_SAVE_KEY_PREFIX}${post.id}`);
    }, [post.id]);
    
    useEffect(() => {
        autoSaveTimerRef.current = setInterval(() => {
            if (editorNodes.length > 0) {
                saveToLocalStorage();
            }
        }, AUTO_SAVE_INTERVAL_MS);
        
        return () => {
            if (autoSaveTimerRef.current) {
                clearInterval(autoSaveTimerRef.current);
            }
        };
    }, [editorNodes, productMap, saveToLocalStorage]);

    // --- MEMOIZED RELEVANCE ENGINE ---
    
    const relevanceCache = useRef<Map<string, number>>(new Map());
    
    const calculateRelevance = useCallback((text: string, product: ProductDetails): number => {
        const cacheKey = `${text.slice(0, 100)}_${product.id}`;

        if (relevanceCache.current.has(cacheKey)) {
            return relevanceCache.current.get(cacheKey)!;
        }

        const cleanText = text.toLowerCase();
        let score = 0;

        // PRIORITY 1: Check if the exact mention quote is in this block (highest priority)
        if (product.exactMention) {
            const mentionLower = product.exactMention.toLowerCase();
            const mentionWords = mentionLower.split(/\s+/).filter(w => w.length > 3);
            const matchCount = mentionWords.filter(w => cleanText.includes(w)).length;
            const matchRatio = mentionWords.length > 0 ? matchCount / mentionWords.length : 0;

            if (matchRatio > 0.7) {
                score += 1000; // Very high score for exact match
            }
        }

        // PRIORITY 2: Full title match
        if (cleanText.includes(product.title.toLowerCase())) {
            score += 100;
        }

        // PRIORITY 3: Brand match
        const brand = product.brand?.toLowerCase();
        if (brand && cleanText.includes(brand)) {
            score += 50;
        }

        // PRIORITY 4: Title word matches
        const titleWords = product.title.toLowerCase().split(/\s+/).filter(w => w.length > 3);
        titleWords.forEach(word => {
            if (cleanText.includes(word)) score += 10;
        });

        if (text.length < 50 && score < 50) score -= 10;

        relevanceCache.current.set(cacheKey, score);

        if (relevanceCache.current.size > 1000) {
            const keys = Array.from(relevanceCache.current.keys()).slice(0, 500);
            keys.forEach(k => relevanceCache.current.delete(k));
        }

        return score;
    }, []);

    const findBestInsertionIndex = useCallback((product: ProductDetails, nodesSnapshot: EditorNode[]): number => {
        // PRECISION: If we have a paragraph index, use it directly
        if (typeof product.paragraphIndex === 'number' && product.paragraphIndex >= 0) {
            let htmlBlockCount = 0;
            for (let i = 0; i < nodesSnapshot.length; i++) {
                if (nodesSnapshot[i].type === 'HTML') {
                    if (htmlBlockCount === product.paragraphIndex) {
                        return i + 1;
                    }
                    htmlBlockCount++;
                }
            }
        }

        // Fallback: Use content matching
        let bestIndex = 0;
        let maxScore = -1;

        nodesSnapshot.forEach((node, idx) => {
            if (node.type === 'HTML' && node.content) {
                const score = calculateRelevance(node.content, product);
                if (score > maxScore) {
                    maxScore = score;
                    bestIndex = idx;
                }
            }
        });

        return bestIndex + 1;
    }, [calculateRelevance]);

    const getUnplacedProducts = useCallback(() => {
        const placedIds = new Set(editorNodes.filter(n => n.type === 'PRODUCT').map(n => n.productId));
        return Object.values(productMap).filter(p => !placedIds.has(p.id));
    }, [editorNodes, productMap]);

    const getContextualProducts = useCallback((nodeIndex: number) => {
        const unplaced = getUnplacedProducts();
        const prevNode = editorNodes[nodeIndex];
        
        if (!prevNode || prevNode.type !== 'HTML' || !prevNode.content) return unplaced;

        return [...unplaced].sort((a, b) => {
            const scoreA = calculateRelevance(prevNode.content!, a);
            const scoreB = calculateRelevance(prevNode.content!, b);
            return scoreB - scoreA;
        });
    }, [editorNodes, getUnplacedProducts, calculateRelevance]);
    
    const memoizedContextualProducts = useMemo(() => {
        const cache: Record<number, ProductDetails[]> = {};
        return (nodeIndex: number) => {
            if (cache[nodeIndex]) return cache[nodeIndex];
            cache[nodeIndex] = getContextualProducts(nodeIndex);
            return cache[nodeIndex];
        };
    }, [getContextualProducts]);

    // --- ACTIONS ---

    const injectProduct = (productId: string, index: number) => {
        const newNode: EditorNode = { id: `prod-node-${productId}-${Date.now()}`, type: 'PRODUCT', productId };
        const newNodes = [...editorNodes];
        newNodes.splice(index, 0, newNode);
        setEditorNodes(newNodes);
        toast("Asset Injected to Canvas");
    };

    const smartInjectProduct = (productId: string) => {
        const product = productMap[productId];
        if (!product) return;
        
        const targetIndex = findBestInsertionIndex(product, editorNodes);
        injectProduct(productId, targetIndex);
        toast(`Auto-Placed: ${product.title.substring(0, 20)}...`, { style: { background: "#0ea5e9" } });
    };

    const handleAutoPopulate = () => {
        const unplaced = getUnplacedProducts();
        if (unplaced.length === 0) {
            toast("All Assets Already Deployed");
            return;
        }

        let newNodes = [...editorNodes];
        let injectedCount = 0;

        // Sort by paragraph index to insert in order (prevents index shifting issues)
        const sortedUnplaced = [...unplaced].sort((a, b) => {
            const aIdx = a.paragraphIndex ?? Infinity;
            const bIdx = b.paragraphIndex ?? Infinity;
            return bIdx - aIdx; // Reverse order so we insert from bottom to top
        });

        sortedUnplaced.forEach(p => {
            let bestIdx = 0;
            let maxScore = -1;

            // PRECISION: If we have a paragraph index, try to use it directly
            if (typeof p.paragraphIndex === 'number' && p.paragraphIndex >= 0) {
                // Find HTML blocks and map to paragraph indices
                let htmlBlockCount = 0;
                for (let i = 0; i < newNodes.length; i++) {
                    if (newNodes[i].type === 'HTML') {
                        if (htmlBlockCount === p.paragraphIndex) {
                            bestIdx = i;
                            maxScore = 10000; // Use paragraph index directly
                            break;
                        }
                        htmlBlockCount++;
                    }
                }
            }

            // Fallback: Use content matching if paragraph index didn't work
            if (maxScore < 10000) {
                newNodes.forEach((node, idx) => {
                    if (node.type === 'HTML' && node.content) {
                        const score = calculateRelevance(node.content, p);
                        if (score > maxScore) {
                            maxScore = score;
                            bestIdx = idx;
                        }
                    }
                });
            }

            // Only inject if we found a reasonable match
            if (maxScore > 0) {
                const newNode: EditorNode = { id: `prod-node-${p.id}-${Date.now()}`, type: 'PRODUCT', productId: p.id };
                newNodes.splice(bestIdx + 1, 0, newNode);
                injectedCount++;
            }
        });

        setEditorNodes(newNodes);
        toast(`Precision Deploy: ${injectedCount} Assets Placed`, { style: { background: "#0ea5e9" } });
    };

    // --- STANDARD OPERATIONS ---

    const runDeepScan = async () => {
        setStatus('analyzing');

        try {
            console.log('[PostEditor] Starting deep scan...');

            // Validate AI configuration
            if (!config.aiProvider) {
                throw new Error('AI provider not configured. Please configure AI settings.');
            }

            const currentHtml = editorNodes.filter(n => n.type === 'HTML').map(n => n.content).join('');

            if (!currentHtml || currentHtml.trim().length < 50) {
                throw new Error('Insufficient content for analysis. Please ensure content is loaded.');
            }

            console.log('[PostEditor] Analyzing', currentHtml.length, 'characters of content');

            const res = await analyzeContentAndFindProduct(post.title, currentHtml, config);

            console.log('[PostEditor] Analysis complete. Found', res.detectedProducts.length, 'products');

            if (res.detectedProducts.length > 0) {
                const newPMap = { ...productMap };
                res.detectedProducts.forEach(p => newPMap[p.id] = p);
                setProductMap(newPMap);
                toast(`Deep Scan Complete: ${res.detectedProducts.length} Products Found`, { style: { background: "#0ea5e9" }, duration: 3000 });
            } else {
                toast("No products detected. Try a more product-focused article.", { duration: 4000 });
            }

            // Handle Comparison Table
            if (res.comparison) {
                const newNodes = [...editorNodes];
                // Inject near top
                newNodes.splice(1, 0, {
                    id: `comp-table-${Date.now()}`,
                    type: 'COMPARISON',
                    comparisonData: res.comparison
                });
                setEditorNodes(newNodes);
                toast("Comparison Table Added", { style: { background: "#0ea5e9" } });
            }

        } catch (e: any) {
            console.error('[PostEditor] Deep scan failed:', e);
            const errorMsg = e.message || "Unknown error";
            const displayMsg = errorMsg.length > 100 ? errorMsg.substring(0, 97) + "..." : errorMsg;
            toast(`Scan Failed: ${displayMsg}`, { duration: 6000 });
        } finally {
            setStatus('idle');
        }
    };

    const deleteNode = (id: string) => {
        setEditorNodes(prev => prev.filter(n => n.id !== id));
        toast("Block Extinguished");
    };

    const moveNode = (index: number, direction: -1 | 1) => {
        const newNodes = [...editorNodes];
        if (index + direction < 0 || index + direction >= newNodes.length) return;
        [newNodes[index], newNodes[index + direction]] = [newNodes[index + direction], newNodes[index]];
        setEditorNodes(newNodes);
    };

    const updateHtmlNode = (id: string, newContent: string) => {
        setEditorNodes(prev => prev.map(n => n.id === id ? { ...n, content: newContent } : n));
    };

    const cleanImagesFromBlock = (id: string) => {
        const node = editorNodes.find(n => n.id === id);
        if (!node || !node.content) return;
        const cleanContent = node.content.replace(/<img[^>]*>/g, "");
        updateHtmlNode(id, cleanContent);
        toast("Visual Artifacts Purged from Block");
    };

    const updateProductMode = (id: string, mode: DeploymentMode) => {
        setProductMap(prev => ({ ...prev, [id]: { ...prev[id], deploymentMode: mode } }));
    };

    const extractASIN = (input: string): string | null => {
        const trimmed = input.trim();

        // Direct ASIN (10 alphanumeric characters)
        if (/^[A-Z0-9]{10}$/i.test(trimmed)) {
            return trimmed.toUpperCase();
        }

        // Standard Amazon product URLs: /dp/ASIN, /gp/product/ASIN, /ASIN/ASIN
        const patterns = [
            /amazon\.[a-z.]+\/(?:dp|gp\/product|gp\/aw\/d|exec\/obidos\/ASIN)\/([A-Z0-9]{10})/i,
            /\/dp\/([A-Z0-9]{10})/i,
            /\/product\/([A-Z0-9]{10})/i,
            /[?&]ASIN=([A-Z0-9]{10})/i,
            /\/([A-Z0-9]{10})(?:\/|\?|$)/i,
        ];

        for (const pattern of patterns) {
            const match = trimmed.match(pattern);
            if (match && match[1]) {
                const potentialAsin = match[1].toUpperCase();
                // Validate it looks like an ASIN (starts with B0 for most products)
                if (/^[A-Z0-9]{10}$/.test(potentialAsin)) {
                    return potentialAsin;
                }
            }
        }

        return null;
    };

    const handleAddManualProduct = async () => {
        const asin = extractASIN(manualAsin);
        if (!asin) {
            toast("Invalid ASIN or Amazon URL. Enter a 10-character ASIN or full Amazon product URL.");
            return;
        }

        if (!config.serpApiKey) {
            toast("SerpAPI key required. Configure it in Settings.");
            return;
        }

        const existingProduct = Object.values(productMap).find(p => p.asin === asin);
        if (existingProduct) {
            toast("Product already in staging area");
            setManualAsin('');
            return;
        }

        setAddingProduct(true);
        try {
            const product = await fetchProductByASIN(asin, config.serpApiKey);
            if (product && product.asin) {
                setProductMap(prev => ({ ...prev, [product.id]: product }));
                toast(`Added: ${product.title.substring(0, 40)}...`);
                setManualAsin('');
            } else {
                toast("Product not found on Amazon. Check the ASIN and try again.");
            }
        } catch (e: any) {
            const errorMsg = e?.message || 'Unknown error';
            console.error('[ManualAdd] Full error:', e);
            console.error('[ManualAdd] Error message:', errorMsg);
            if (errorMsg.includes('timeout') || errorMsg.includes('Timeout')) {
                toast("Request timed out. Try again.");
            } else if (errorMsg.includes('401') || errorMsg.includes('Invalid API')) {
                toast("Invalid SerpAPI key. Check your key in Settings.");
            } else if (errorMsg.includes('429')) {
                toast("SerpAPI rate limit exceeded. Wait and try again.");
            } else {
                toast(`Error: ${errorMsg.substring(0, 80)}`);
            }
        } finally {
            setAddingProduct(false);
        }
    };

    const generateFinalHtml = () => {
        return editorNodes.map(node => {
            if (node.type === 'HTML') return node.content;
            if (node.type === 'PRODUCT' && node.productId && productMap[node.productId]) {
                return generateProductBoxHtml(productMap[node.productId], config.amazonTag, productMap[node.productId].deploymentMode);
            }
            if (node.type === 'COMPARISON' && node.comparisonData) {
                return generateComparisonTableHtml(node.comparisonData, Object.values(productMap), config.amazonTag);
            }
            return '';
        }).join('\n\n');
    };

    const handlePush = async () => {
        setStatus('pushing');
        try {
            const html = generateFinalHtml();
            const link = await pushToWordPress(config, currentId, html);
            toast("Production Sync Successful");
            window.open(link, '_blank');
        } catch (e: any) {
            console.error(e);
            const msg = e.message.length > 100 ? e.message.substring(0, 97) + "..." : e.message;
            toast(msg, { duration: 5000 });
        } finally { setStatus('idle'); }
    };

    return (
        <div className="flex h-full bg-dark-950 flex-col md:flex-row overflow-hidden animate-fade-in font-sans">
            
            {/* --- LEFT CONTROL PANEL --- */}
            <div className="w-full md:w-[420px] bg-[#0b1121] border-r border-dark-800 flex flex-col h-full z-40 shadow-[10px_0_30px_rgba(0,0,0,0.3)]">
                {/* Header */}
                <div className="p-8 border-b border-dark-800 bg-dark-950/50 backdrop-blur-md">
                    <button onClick={onBack} className="text-gray-500 text-[10px] font-black uppercase tracking-[4px] hover:text-white transition-all flex items-center gap-3 group mb-6">
                        <i className="fa-solid fa-arrow-left group-hover:-translate-x-1 transition-transform"></i> Return to Command
                    </button>
                    <div className="flex items-center justify-between">
                        <h1 className="text-xl font-black text-white tracking-tight">Assets <span className="text-brand-500">deck</span></h1>
                        <div className="flex gap-2 items-center">
                            {/* Undo/Redo Controls */}
                            <div className="flex items-center gap-1 bg-dark-800/50 rounded-full px-2 py-1">
                                <button 
                                    onClick={undo} 
                                    disabled={!canUndo}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${canUndo ? 'hover:bg-dark-700 text-white' : 'text-dark-600 cursor-not-allowed'}`}
                                    title="Undo (Ctrl+Z)"
                                >
                                    <i className="fa-solid fa-rotate-left text-xs" />
                                </button>
                                <span className="text-[10px] font-bold text-dark-500 min-w-[2ch] text-center">{historyLength}</span>
                                <button 
                                    onClick={redo} 
                                    disabled={!canRedo}
                                    className={`w-7 h-7 rounded-full flex items-center justify-center transition-all ${canRedo ? 'hover:bg-dark-700 text-white' : 'text-dark-600 cursor-not-allowed'}`}
                                    title="Redo (Ctrl+Shift+Z)"
                                >
                                    <i className="fa-solid fa-rotate-right text-xs" />
                                </button>
                            </div>
                            <button onClick={() => { IntelligenceCache.clear(); window.location.reload(); }} className="w-8 h-8 rounded-full bg-dark-800 hover:bg-red-500/20 text-gray-400 hover:text-red-500 flex items-center justify-center transition-all" title="Clear Cache"><i className="fa-solid fa-trash-can text-xs"></i></button>
                        </div>
                    </div>
                </div>

                {/* Scan & Unused Assets */}
                <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar">
                    
                    {/* Deep Scan Card */}
                    <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-brand-900/20 to-dark-900 border border-brand-500/20 p-8 group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-brand-500/10 blur-[60px] rounded-full"></div>
                        <h3 className="text-brand-400 font-black uppercase tracking-[4px] text-[11px] mb-2">Deep Intelligence</h3>
                        <p className="text-slate-400 text-xs mb-6 leading-relaxed">Analyze content DNA to extract monetization nodes.</p>
                        <div className="flex gap-2">
                             <button onClick={runDeepScan} disabled={status !== 'idle'} className="flex-1 py-4 bg-brand-600 hover:bg-brand-500 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2">
                                {status === 'analyzing' ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-bolt"></i>}
                                <span>Scan</span>
                            </button>
                        </div>
                    </div>

                    {/* Manual Product Add Card */}
                    <div className="relative overflow-hidden rounded-[32px] bg-gradient-to-br from-orange-900/20 to-dark-900 border border-orange-500/20 p-8 group">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-orange-500/10 blur-[60px] rounded-full"></div>
                        <h3 className="text-orange-400 font-black uppercase tracking-[4px] text-[11px] mb-2">Manual Add</h3>
                        <p className="text-slate-400 text-xs mb-4 leading-relaxed">Add any Amazon product by ASIN or URL.</p>
                        <div className="flex gap-2">
                            <input 
                                type="text" 
                                value={manualAsin}
                                onChange={(e) => setManualAsin(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddManualProduct()}
                                placeholder="ASIN or Amazon URL"
                                className="flex-1 px-4 py-3 bg-dark-800 border border-dark-700 rounded-xl text-white text-xs placeholder-dark-500 focus:outline-none focus:border-orange-500 transition-all"
                            />
                            <button 
                                onClick={handleAddManualProduct} 
                                disabled={addingProduct || !manualAsin.trim()}
                                className="px-6 py-3 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:hover:bg-orange-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center justify-center gap-2"
                            >
                                {addingProduct ? <i className="fa-solid fa-spinner fa-spin"></i> : <i className="fa-solid fa-plus"></i>}
                            </button>
                        </div>
                    </div>

                    {/* Draggable/Injectable Assets */}
                    <div>
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-gray-500 font-black uppercase tracking-[4px] text-[10px]">Staging Area</h3>
                            <span className="bg-dark-800 text-gray-400 px-3 py-1 rounded-full text-[10px] font-bold">{getUnplacedProducts().length}</span>
                        </div>
                        
                        <div className="space-y-4">
                            {getUnplacedProducts().length === 0 ? (
                                <div className="p-8 border-2 border-dashed border-dark-800 rounded-3xl text-center">
                                    <div className="text-dark-700 mb-2 text-2xl"><i className="fa-brands fa-dropbox"></i></div>
                                    <div className="text-dark-600 text-[10px] font-black uppercase tracking-widest">Queue Empty</div>
                                </div>
                            ) : (
                                getUnplacedProducts().map(p => (
                                    <div key={p.id} className="bg-dark-900 border border-dark-700 p-4 rounded-2xl flex items-center gap-4 group hover:border-brand-500 transition-all">
                                        <img src={p.imageUrl} className="w-12 h-12 object-contain bg-white rounded-lg p-1" />
                                        <div className="flex-1 min-w-0">
                                            <div className="text-white font-bold text-sm truncate">{p.title}</div>
                                            <div className="text-brand-400 text-[10px] font-black tracking-wider">{p.price}</div>
                                        </div>
                                        <button 
                                            onClick={() => smartInjectProduct(p.id)} 
                                            className="w-8 h-8 rounded-full bg-brand-600 text-white flex items-center justify-center shadow-lg hover:scale-110 transition-transform hover:bg-white hover:text-brand-600"
                                            title="Smart Auto-Inject"
                                        >
                                            <i className="fa-solid fa-wand-magic-sparkles text-xs"></i>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>

                {/* Push Action */}
                <div className="p-8 bg-dark-950 border-t border-dark-800">
                    <button onClick={handlePush} disabled={status !== 'idle'} className="w-full py-6 bg-white text-dark-950 rounded-[20px] font-black uppercase tracking-[4px] text-sm shadow-[0_0_30px_rgba(255,255,255,0.1)] hover:shadow-[0_0_50px_rgba(255,255,255,0.2)] hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                        {status === 'pushing' ? <i className="fa-solid fa-circle-notch fa-spin"></i> : <i className="fa-solid fa-cloud-arrow-up"></i>}
                        <span>Deploy Live</span>
                    </button>
                </div>
            </div>

            {/* --- RIGHT VISUAL ARCHITECT --- */}
            <div className="flex-1 bg-slate-50 relative flex flex-col h-full overflow-hidden">
                
                {/* Global Toolbar */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-4">
                     {/* View Toggles */}
                    <div className="bg-white/80 backdrop-blur-xl border border-white/20 shadow-2xl rounded-full p-1.5 flex gap-2">
                        {['visual', 'code'].map((v) => (
                            <button 
                                key={v}
                                onClick={() => setViewTab(v as any)}
                                className={`px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-[3px] transition-all ${viewTab === v ? 'bg-dark-950 text-white shadow-lg' : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}`}
                            >
                                {v === 'visual' ? 'Visual Architect' : 'Code Matrix'}
                            </button>
                        ))}
                    </div>

                    {/* Auto-Deploy Button */}
                    <button 
                        onClick={handleAutoPopulate}
                        disabled={getUnplacedProducts().length === 0}
                        className="h-[46px] px-8 bg-brand-600 text-white rounded-full text-[10px] font-black uppercase tracking-[3px] shadow-2xl hover:bg-brand-500 hover:scale-105 disabled:opacity-50 disabled:scale-100 transition-all flex items-center gap-2"
                        title="Automatically place ALL products based on context"
                    >
                         <i className="fa-solid fa-wand-magic-sparkles"></i> Auto-Deploy All
                    </button>
                </div>

                {/* Canvas Area */}
                <div className="flex-1 overflow-y-auto overflow-x-hidden p-8 md:p-20 custom-scrollbar">
                    {viewTab === 'visual' ? (
                        <div className="max-w-[1000px] mx-auto min-h-screen bg-white rounded-[60px] shadow-[0_40px_100px_-30px_rgba(0,0,0,0.08)] border border-slate-100 p-12 md:p-24 relative">
                            
                            {/* Document Title (Read Only Preview) */}
                            <h1 className="text-4xl md:text-6xl font-black text-slate-900 tracking-tighter mb-16 leading-tight border-b border-slate-100 pb-10">
                                {post.title}
                            </h1>

                            <div className="space-y-4">
                                {editorNodes.map((node, index) => (
                                    <div 
                                        key={node.id}
                                        onMouseEnter={() => setHoveredNode(node.id)}
                                        onMouseLeave={() => setHoveredNode(null)}
                                        className={`relative group/node transition-all duration-300 rounded-[32px] border-2 ${hoveredNode === node.id ? 'border-brand-100 bg-brand-50/10' : 'border-transparent'}`}
                                    >
                                        
                                        {/* --- BLOCK CONTROLS (Floating Glass) --- */}
                                        <div className={`absolute -right-14 top-4 flex flex-col gap-2 transition-all duration-300 z-30 ${hoveredNode === node.id ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4 pointer-events-none'}`}>
                                            <button onClick={() => moveNode(index, -1)} className="w-10 h-10 rounded-full bg-white text-slate-400 hover:text-brand-500 shadow-xl border border-slate-100 flex items-center justify-center transition-all hover:scale-110" title="Move Up"><i className="fa-solid fa-arrow-up text-xs"></i></button>
                                            <button onClick={() => moveNode(index, 1)} className="w-10 h-10 rounded-full bg-white text-slate-400 hover:text-brand-500 shadow-xl border border-slate-100 flex items-center justify-center transition-all hover:scale-110" title="Move Down"><i className="fa-solid fa-arrow-down text-xs"></i></button>
                                            <button onClick={() => deleteNode(node.id)} className="w-10 h-10 rounded-full bg-white text-slate-400 hover:text-red-500 shadow-xl border border-slate-100 flex items-center justify-center transition-all hover:scale-110" title="Delete Block"><i className="fa-solid fa-trash-can text-xs"></i></button>
                                            
                                            {/* Special Media Cleaner for HTML Blocks */}
                                            {node.type === 'HTML' && node.content && (node.content.includes('<img') || node.content.includes('figure')) && (
                                                <button onClick={() => cleanImagesFromBlock(node.id)} className="w-10 h-10 rounded-full bg-white text-orange-400 hover:text-orange-600 shadow-xl border border-slate-100 flex items-center justify-center transition-all hover:scale-110" title="Remove Images Only"><i className="fa-solid fa-image-slash text-xs"></i></button>
                                            )}
                                        </div>

                                        {/* --- RENDER CONTENT --- */}
                                        <div className="p-2 md:p-6">
                                            {node.type === 'HTML' ? (
                                                <div 
                                                    className="prose prose-xl prose-slate max-w-none focus:outline-none focus:ring-2 focus:ring-brand-100 rounded-xl p-2 transition-all"
                                                    contentEditable
                                                    suppressContentEditableWarning
                                                    onBlur={(e) => updateHtmlNode(node.id, e.currentTarget.innerHTML)}
                                                    dangerouslySetInnerHTML={{ __html: node.content || '' }}
                                                />
                                            ) : node.type === 'COMPARISON' && node.comparisonData ? (
                                                <ComparisonTablePreview 
                                                    data={node.comparisonData} 
                                                    products={Object.values(productMap)} 
                                                    affiliateTag={config.amazonTag} 
                                                />
                                            ) : (
                                                node.productId && productMap[node.productId] ? (
                                                    <div className="relative">
                                                        {config.boxStyle === 'PREMIUM' ? (
                                                            <PremiumProductBox 
                                                                product={productMap[node.productId]} 
                                                                affiliateTag={config.amazonTag} 
                                                                mode={productMap[node.productId].deploymentMode}
                                                            />
                                                        ) : (
                                                            <ProductBoxPreview 
                                                                product={productMap[node.productId]} 
                                                                affiliateTag={config.amazonTag} 
                                                                mode={productMap[node.productId].deploymentMode} 
                                                            />
                                                        )}
                                                        
                                                        {/* Product Specific Controls */}
                                                        {hoveredNode === node.id && (
                                                            <div className="absolute top-6 right-6 flex gap-3 z-30 animate-fade-in-up">
                                                                <button 
                                                                    onClick={() => updateProductMode(node.productId!, 'ELITE_BENTO')} 
                                                                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg transition-all ${productMap[node.productId!].deploymentMode === 'ELITE_BENTO' ? 'bg-dark-950 text-white' : 'bg-white text-slate-500'}`}
                                                                >Bento</button>
                                                                <button 
                                                                    onClick={() => updateProductMode(node.productId!, 'TACTICAL_LINK')} 
                                                                    className={`px-4 py-2 rounded-full text-[10px] font-black uppercase tracking-wider shadow-lg transition-all ${productMap[node.productId!].deploymentMode === 'TACTICAL_LINK' ? 'bg-dark-950 text-white' : 'bg-white text-slate-500'}`}
                                                                >Tactical</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : <div className="p-8 bg-red-50 text-red-400 font-mono text-xs text-center border border-red-100 rounded-2xl">Asset Data Corrupted</div>
                                            )}
                                        </div>

                                        {/* --- INJECTION POINTS --- */}
                                        <div className={`h-8 flex items-center justify-center opacity-0 group-hover/node:opacity-100 transition-all z-20`}>
                                            <div className="relative group/add">
                                                <button className="w-8 h-8 rounded-full bg-brand-50 text-brand-500 border border-brand-200 flex items-center justify-center shadow-sm hover:scale-110 transition-transform"><i className="fa-solid fa-plus text-[10px]"></i></button>
                                                
                                                {/* Mini Injection Menu */}
                                                <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white border border-slate-100 shadow-2xl rounded-xl p-2 flex flex-col gap-1 w-64 opacity-0 group-hover/add:opacity-100 pointer-events-none group-hover/add:pointer-events-auto transition-all transform origin-top scale-95 group-hover/add:scale-100 z-50 max-h-64 overflow-y-auto custom-scrollbar">
                                                    <div className="text-[9px] font-black uppercase text-slate-300 px-3 py-1">Insert Node</div>
                                                    <button onClick={() => {
                                                        const newNodes = [...editorNodes];
                                                        newNodes.splice(index + 1, 0, { id: `html-${Date.now()}`, type: 'HTML', content: '<p>Write something brilliant...</p>' });
                                                        setEditorNodes(newNodes);
                                                    }} className="text-left px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 rounded-lg transition-colors">Text Block</button>
                                                    
                                                    <div className="h-px bg-slate-100 my-1"></div>
                                                    <div className="text-[9px] font-black uppercase text-brand-300 px-3 py-1">Relevant Assets</div>
                                                    
                                                    {getContextualProducts(index).map(p => (
                                                        <button key={p.id} onClick={() => injectProduct(p.id, index + 1)} className="text-left px-3 py-2 text-xs font-bold text-brand-600 hover:bg-brand-50 rounded-lg transition-colors truncate w-full flex items-center gap-2">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-brand-400 flex-shrink-0"></span> {p.title}
                                                        </button>
                                                    ))}
                                                    
                                                    {getContextualProducts(index).length === 0 && (
                                                        <div className="px-3 py-2 text-[10px] text-slate-400 italic">No assets available</div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>

                                    </div>
                                ))}
                                
                                {/* Empty State / End Injection */}
                                {editorNodes.length === 0 && (
                                    <div className="py-40 text-center border-2 border-dashed border-slate-200 rounded-[40px]">
                                        <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-4">Canvas Empty</p>
                                        <button onClick={() => setEditorNodes([{id: 'init', type:'HTML', content:'<p>Start writing...</p>'}])} className="text-brand-500 font-black underline">Initialize Block</button>
                                    </div>
                                )}
                            </div>
                        </div>
                    ) : (
                        // Code View
                        <div className="max-w-4xl mx-auto h-full">
                            <div className="bg-[#1e1e1e] text-blue-300 p-10 rounded-[40px] shadow-2xl font-mono text-sm leading-relaxed overflow-auto min-h-[80vh] border border-white/10">
                                {generateFinalHtml()}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
