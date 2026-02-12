import React, { useState, useCallback, useMemo } from 'react';
import { ComparisonData, ProductDetails } from '../types';
import { toast } from 'sonner';

interface ComparisonTablePreviewProps {
  data: ComparisonData;
  products: ProductDetails[];
  affiliateTag: string;
  /** All available products (for the "add" picker) */
  allProducts?: ProductDetails[];
  /** Callback when comparison data changes (product add/remove/reorder) */
  onUpdate?: (updatedData: ComparisonData) => void;
  /** Whether editing controls are visible */
  editable?: boolean;
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const StarRating: React.FC<{ rating: number }> = ({ rating }) => {
  const full = Math.floor(rating);
  const hasHalf = rating - full >= 0.3;
  return (
    <div className="flex items-center gap-1">
      <div className="flex">
        {Array.from({ length: 5 }, (_, i) => (
          <span
            key={i}
            className={`text-sm ${
              i < full
                ? 'text-amber-400'
                : i === full && hasHalf
                ? 'text-amber-300'
                : 'text-slate-200'
            }`}
          >
            &#9733;
          </span>
        ))}
      </div>
      <span className="text-xs font-bold text-slate-500 ml-1">
        {rating.toFixed(1)}
      </span>
    </div>
  );
};

const PrimeBadge: React.FC = () => (
  <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-[#232F3E] text-white text-[10px] font-bold rounded">
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
    Prime
  </span>
);

// ============================================================================
// PRODUCT PICKER (Add to Comparison)
// ============================================================================

interface ProductPickerProps {
  availableProducts: ProductDetails[];
  onSelect: (productId: string) => void;
  onClose: () => void;
}

const ProductPicker: React.FC<ProductPickerProps> = ({
  availableProducts,
  onSelect,
  onClose,
}) => {
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return availableProducts;
    const q = search.toLowerCase();
    return availableProducts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.brand?.toLowerCase().includes(q) ||
        p.asin.toLowerCase().includes(q)
    );
  }, [availableProducts, search]);

  return (
    <div className="absolute top-full left-0 right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden max-h-80 flex flex-col animate-fade-in">
      {/* Search */}
      <div className="p-3 border-b border-slate-100 sticky top-0 bg-white z-10">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products to add..."
          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          autoFocus
        />
      </div>

      {/* Product list */}
      <div className="overflow-y-auto flex-1">
        {filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-400 text-sm">
            {availableProducts.length === 0
              ? 'No products available. Run a Deep Scan first.'
              : 'No matching products found.'}
          </div>
        ) : (
          filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className="w-full p-3 flex items-center gap-3 hover:bg-blue-50 transition-colors text-left border-b border-slate-50 last:border-0"
            >
              {p.imageUrl ? (
                <img
                  src={p.imageUrl}
                  alt=""
                  className="w-10 h-10 object-contain rounded-lg bg-slate-50 p-0.5 flex-shrink-0"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-10 h-10 bg-slate-100 rounded-lg flex items-center justify-center flex-shrink-0">
                  <span className="text-slate-300 text-[8px]">IMG</span>
                </div>
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold text-slate-900 truncate">
                  {p.title}
                </div>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-xs font-bold text-slate-500">
                    {p.price}
                  </span>
                  {p.rating && (
                    <span className="text-xs text-amber-500">
                      ★ {p.rating.toFixed(1)}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-400">
                    {p.asin}
                  </span>
                </div>
              </div>
              <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-200 transition-colors">
                <i className="fa-solid fa-plus text-xs" />
              </div>
            </button>
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-2 border-t border-slate-100 bg-slate-50 flex justify-end">
        <button
          onClick={onClose}
          className="px-4 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// SPEC EDITOR (Add/Remove comparison rows)
// ============================================================================

interface SpecEditorProps {
  specs: string[];
  onUpdate: (specs: string[]) => void;
  onClose: () => void;
}

const SpecEditor: React.FC<SpecEditorProps> = ({ specs, onUpdate, onClose }) => {
  const [newSpec, setNewSpec] = useState('');

  const addSpec = () => {
    const trimmed = newSpec.trim();
    if (!trimmed || specs.includes(trimmed)) return;
    onUpdate([...specs, trimmed]);
    setNewSpec('');
  };

  const removeSpec = (specToRemove: string) => {
    const coreSpecs = ['Rating', 'Reviews', 'Price', 'Prime'];
    if (coreSpecs.map((s) => s.toLowerCase()).includes(specToRemove.toLowerCase())) {
      toast('Cannot remove core specs (Rating, Reviews, Price, Prime)');
      return;
    }
    onUpdate(specs.filter((s) => s !== specToRemove));
  };

  return (
    <div className="absolute top-full right-0 mt-2 z-50 bg-white border border-slate-200 rounded-2xl shadow-2xl overflow-hidden w-72 animate-fade-in">
      <div className="p-4 border-b border-slate-100">
        <h4 className="text-sm font-bold text-slate-900 mb-3">
          Comparison Specs
        </h4>
        <div className="space-y-2">
          {specs.map((spec) => (
            <div
              key={spec}
              className="flex items-center justify-between px-3 py-2 bg-slate-50 rounded-lg"
            >
              <span className="text-xs font-medium text-slate-700">{spec}</span>
              <button
                onClick={() => removeSpec(spec)}
                className="w-5 h-5 rounded-full hover:bg-red-100 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors"
                title="Remove spec"
              >
                <i className="fa-solid fa-times text-[8px]" />
              </button>
            </div>
          ))}
        </div>
      </div>
      <div className="p-3 flex gap-2">
        <input
          type="text"
          value={newSpec}
          onChange={(e) => setNewSpec(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addSpec()}
          placeholder="Add new spec..."
          className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-400"
        />
        <button
          onClick={addSpec}
          disabled={!newSpec.trim()}
          className="px-3 py-2 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-all"
        >
          Add
        </button>
      </div>
      <div className="p-2 border-t border-slate-100 flex justify-end">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700"
        >
          Done
        </button>
      </div>
    </div>
  );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export const ComparisonTablePreview: React.FC<ComparisonTablePreviewProps> = ({
  data,
  products,
  affiliateTag,
  allProducts,
  onUpdate,
  editable = true,
}) => {
  const [showPicker, setShowPicker] = useState(false);
  const [showSpecEditor, setShowSpecEditor] = useState(false);
  const [hoveredCol, setHoveredCol] = useState<string | null>(null);

  const finalTag = (affiliateTag || 'tag-20').trim();

  // Resolve product objects from IDs
  const sortedProducts = useMemo(
    () =>
      data.productIds
        .map((id) => products.find((p) => p.id === id))
        .filter(Boolean) as ProductDetails[],
    [data.productIds, products]
  );

  // Products available to add (not already in comparison)
  const addableProducts = useMemo(() => {
    const inTable = new Set(data.productIds);
    const source = allProducts || products;
    return source.filter((p) => !inTable.has(p.id));
  }, [allProducts, products, data.productIds]);

  // --- HANDLERS ---

  const handleAddProduct = useCallback(
    (productId: string) => {
      if (data.productIds.includes(productId)) {
        toast('Product already in comparison');
        return;
      }
      onUpdate?.({
        ...data,
        productIds: [...data.productIds, productId],
      });
      setShowPicker(false);
      toast('Product added to comparison');
    },
    [data, onUpdate]
  );

  const handleRemoveProduct = useCallback(
    (productId: string) => {
      if (data.productIds.length <= 2) {
        toast('Comparison table needs at least 2 products');
        return;
      }
      const newIds = data.productIds.filter((id) => id !== productId);
      const newWinnerId =
        data.winnerId === productId ? newIds[0] : data.winnerId;
      onUpdate?.({
        ...data,
        productIds: newIds,
        winnerId: newWinnerId,
      });
      toast('Product removed from comparison');
    },
    [data, onUpdate]
  );

  const handleMoveProduct = useCallback(
    (productId: string, direction: -1 | 1) => {
      const idx = data.productIds.indexOf(productId);
      if (idx === -1) return;
      const newIdx = idx + direction;
      if (newIdx < 0 || newIdx >= data.productIds.length) return;

      const newIds = [...data.productIds];
      [newIds[idx], newIds[newIdx]] = [newIds[newIdx], newIds[idx]];
      onUpdate?.({ ...data, productIds: newIds });
    },
    [data, onUpdate]
  );

  const handleSetWinner = useCallback(
    (productId: string) => {
      onUpdate?.({ ...data, winnerId: productId });
      toast('Top Pick updated');
    },
    [data, onUpdate]
  );

  const handleUpdateSpecs = useCallback(
    (newSpecs: string[]) => {
      onUpdate?.({ ...data, specs: newSpecs });
    },
    [data, onUpdate]
  );

  const handleUpdateTitle = useCallback(
    (newTitle: string) => {
      onUpdate?.({ ...data, title: newTitle });
    },
    [data, onUpdate]
  );

  // --- RENDERING ---

  if (sortedProducts.length === 0) {
    return (
      <div className="w-full max-w-[1100px] mx-auto my-10 p-8 bg-slate-50 border-2 border-dashed border-slate-200 rounded-3xl text-center">
        <p className="text-slate-400 font-bold mb-4">Comparison table has no products</p>
        {editable && onUpdate && (
          <div className="relative inline-block">
            <button
              onClick={() => setShowPicker(true)}
              className="px-6 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-500 transition-all"
            >
              <i className="fa-solid fa-plus mr-2" />
              Add Products
            </button>
            {showPicker && (
              <ProductPicker
                availableProducts={addableProducts}
                onSelect={handleAddProduct}
                onClose={() => setShowPicker(false)}
              />
            )}
          </div>
        )}
      </div>
    );
  }

  const winnerId = data.winnerId || sortedProducts[0]?.id;

  const customSpecs = (data.specs || []).filter(
    (s) =>
      !['rating', 'reviews', 'price', 'prime'].includes(s.toLowerCase())
  );

  const getSpecValue = (
    product: ProductDetails,
    spec: string
  ): React.ReactNode => {
    const key = spec.toLowerCase();
    if (key === 'rating')
      return <StarRating rating={product.rating || 0} />;
    if (key === 'reviews')
      return (
        <span className="font-semibold text-slate-700">
          {(product.reviewCount || 0).toLocaleString()}
        </span>
      );
    if (key === 'price')
      return (
        <span className="text-lg font-black text-slate-900">
          {product.price}
        </span>
      );
    if (key === 'prime')
      return product.prime ? (
        <PrimeBadge />
      ) : (
        <span className="text-slate-400 text-xs">Not available</span>
      );
    const val = product.specs?.[spec];
    if (val)
      return (
        <span className="font-semibold text-slate-700">{val}</span>
      );
    return <span className="text-slate-300">&mdash;</span>;
  };

  return (
    <div className="w-full max-w-[1100px] mx-auto my-10 font-sans animate-fade-in">
      <div className="bg-white border border-slate-200 rounded-3xl shadow-[0_20px_60px_-15px_rgba(0,0,0,0.1)] overflow-hidden">
        {/* ===== HEADER ===== */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              {editable && onUpdate ? (
                <input
                  type="text"
                  value={data.title}
                  onChange={(e) => handleUpdateTitle(e.target.value)}
                  className="bg-transparent text-white font-black text-lg tracking-tight border-none outline-none w-full placeholder-slate-500 focus:ring-0"
                  placeholder="Comparison Table Title..."
                />
              ) : (
                <h3 className="text-white font-black text-lg tracking-tight">
                  {data.title}
                </h3>
              )}
              <p className="text-slate-400 text-xs mt-1">
                {sortedProducts.length} products compared
              </p>
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-slate-400 text-[10px] font-bold uppercase tracking-wider">
                  Live Prices
                </span>
              </div>

              {/* Edit Controls */}
              {editable && onUpdate && (
                <div className="flex items-center gap-2 ml-4">
                  {/* Add Product Button */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowPicker(!showPicker);
                        setShowSpecEditor(false);
                      }}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                      title="Add product to comparison"
                    >
                      <i className="fa-solid fa-plus text-xs" />
                    </button>
                    {showPicker && (
                      <div className="absolute top-full right-0 mt-2 w-80">
                        <ProductPicker
                          availableProducts={addableProducts}
                          onSelect={handleAddProduct}
                          onClose={() => setShowPicker(false)}
                        />
                      </div>
                    )}
                  </div>

                  {/* Edit Specs Button */}
                  <div className="relative">
                    <button
                      onClick={() => {
                        setShowSpecEditor(!showSpecEditor);
                        setShowPicker(false);
                      }}
                      className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-all"
                      title="Edit comparison specs"
                    >
                      <i className="fa-solid fa-sliders text-xs" />
                    </button>
                    {showSpecEditor && (
                      <SpecEditor
                        specs={data.specs || []}
                        onUpdate={handleUpdateSpecs}
                        onClose={() => setShowSpecEditor(false)}
                      />
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ===== PRODUCT COLUMNS ===== */}
        <div className="overflow-x-auto">
          <div
            style={{
              minWidth: `${Math.max(600, sortedProducts.length * 220)}px`,
            }}
          >
            <div
              className="grid divide-x divide-slate-100"
              style={{
                gridTemplateColumns: `repeat(${sortedProducts.length}, 1fr)`,
              }}
            >
              {sortedProducts.map((p, idx) => {
                const isWinner = p.id === winnerId;
                const isHovered = hoveredCol === p.id;

                return (
                  <div
                    key={p.id}
                    className={`relative p-6 text-center transition-colors ${
                      isWinner
                        ? 'bg-blue-50/50'
                        : 'bg-white hover:bg-slate-50/50'
                    }`}
                    onMouseEnter={() => setHoveredCol(p.id)}
                    onMouseLeave={() => setHoveredCol(null)}
                  >
                    {/* Winner Badge */}
                    {isWinner && (
                      <div className="absolute -top-0 left-1/2 -translate-x-1/2 z-10">
                        <span className="inline-flex items-center gap-1.5 bg-blue-600 text-white text-[10px] font-black uppercase tracking-wider px-4 py-1.5 rounded-b-xl shadow-lg shadow-blue-500/25">
                          <svg
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="currentColor"
                          >
                            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                          </svg>
                          Top Pick
                        </span>
                      </div>
                    )}

                    {/* === EDIT CONTROLS (per column) === */}
                    {editable && onUpdate && isHovered && (
                      <div className="absolute top-2 right-2 z-20 flex gap-1 animate-fade-in">
                        {/* Set as Winner */}
                        {!isWinner && (
                          <button
                            onClick={() => handleSetWinner(p.id)}
                            className="w-7 h-7 rounded-full bg-amber-100 text-amber-600 hover:bg-amber-200 flex items-center justify-center transition-all shadow-sm"
                            title="Set as Top Pick"
                          >
                            <i className="fa-solid fa-crown text-[9px]" />
                          </button>
                        )}
                        {/* Move Left */}
                        {idx > 0 && (
                          <button
                            onClick={() => handleMoveProduct(p.id, -1)}
                            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all shadow-sm"
                            title="Move left"
                          >
                            <i className="fa-solid fa-arrow-left text-[9px]" />
                          </button>
                        )}
                        {/* Move Right */}
                        {idx < sortedProducts.length - 1 && (
                          <button
                            onClick={() => handleMoveProduct(p.id, 1)}
                            className="w-7 h-7 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200 flex items-center justify-center transition-all shadow-sm"
                            title="Move right"
                          >
                            <i className="fa-solid fa-arrow-right text-[9px]" />
                          </button>
                        )}
                        {/* Remove */}
                        <button
                          onClick={() => handleRemoveProduct(p.id)}
                          className="w-7 h-7 rounded-full bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center transition-all shadow-sm"
                          title="Remove from comparison"
                        >
                          <i className="fa-solid fa-times text-[9px]" />
                        </button>
                      </div>
                    )}

                    {/* Product Image */}
                    <div className="h-36 flex items-center justify-center mb-4 mt-2">
                      {p.imageUrl ? (
                        <img
                          src={p.imageUrl}
                          className="max-h-full max-w-full object-contain drop-shadow-md hover:scale-105 transition-transform duration-300"
                          alt={p.title}
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-24 h-24 bg-slate-100 rounded-2xl flex items-center justify-center">
                          <span className="text-slate-300 text-xs">
                            No image
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Title */}
                    <h4 className="text-sm font-bold text-slate-900 leading-snug mb-3 line-clamp-2 min-h-[40px]">
                      {p.title}
                    </h4>

                    {/* Rating */}
                    <div className="flex justify-center mb-3">
                      <StarRating rating={p.rating || 0} />
                    </div>

                    {/* Price */}
                    <div className="text-2xl font-black text-slate-900 tracking-tight mb-1">
                      {p.price}
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium mb-4">
                      {(p.reviewCount || 0).toLocaleString()} verified ratings
                    </div>

                    {/* CTA */}
                    <a
                      href={`https://www.amazon.com/dp/${p.asin}?tag=${finalTag}`}
                      target="_blank"
                      rel="nofollow sponsored noopener"
                      className={`inline-flex items-center justify-center w-full gap-2 py-3 rounded-xl text-[11px] font-black uppercase tracking-wider transition-all shadow-md hover:shadow-lg hover:-translate-y-0.5 ${
                        isWinner
                          ? 'bg-blue-600 text-white hover:bg-blue-500'
                          : 'bg-slate-900 text-white hover:bg-slate-700'
                      }`}
                    >
                      Check Price
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      >
                        <path d="M7 17l9.2-9.2M17 17V8H8" />
                      </svg>
                    </a>
                  </div>
                );
              })}
            </div>

            {/* ===== CUSTOM SPEC ROWS ===== */}
            {customSpecs.length > 0 && (
              <div className="border-t border-slate-100">
                {customSpecs.map((spec, sIdx) => (
                  <div
                    key={spec}
                    className={`grid divide-x divide-slate-100 ${
                      sIdx % 2 === 0 ? 'bg-slate-50/50' : 'bg-white'
                    }`}
                    style={{
                      gridTemplateColumns: `repeat(${sortedProducts.length}, 1fr)`,
                    }}
                  >
                    {sortedProducts.map((p) => (
                      <div
                        key={p.id}
                        className="px-6 py-4 text-center"
                      >
                        <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                          {spec}
                        </div>
                        <div className="text-sm">
                          {getSpecValue(p, spec)}
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}

            {/* Prime Row */}
            {sortedProducts.some((p) => p.prime) && (
              <div
                className="grid divide-x divide-slate-100 border-t border-slate-100 bg-slate-50/30"
                style={{
                  gridTemplateColumns: `repeat(${sortedProducts.length}, 1fr)`,
                }}
              >
                {sortedProducts.map((p) => (
                  <div key={p.id} className="px-6 py-3 text-center">
                    <div className="text-[10px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">
                      Shipping
                    </div>
                    <div className="text-sm">
                      {p.prime ? (
                        <PrimeBadge />
                      ) : (
                        <span className="text-slate-400 text-xs">
                          Standard
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ===== FOOTER ===== */}
        <div className="bg-slate-50 px-8 py-3 border-t border-slate-100 flex items-center justify-between">
          <p className="text-[10px] text-slate-400">
            Prices and availability are accurate as of the date/time
            indicated and are subject to change.
          </p>
          {editable && onUpdate && (
            <button
              onClick={() => setShowPicker(true)}
              className="text-[10px] font-bold text-blue-500 hover:text-blue-600 uppercase tracking-wider transition-colors flex items-center gap-1"
            >
              <i className="fa-solid fa-plus text-[8px]" />
              Add Product
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
