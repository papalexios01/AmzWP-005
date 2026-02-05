import { AppConfig, ProductDetails } from '../types';
import { hashString } from '../utils';

export async function detectProductsAggressively(
  title: string,
  content: string,
  extractProductsPhase1: any,
  searchAmazonProduct: any,
  fetchProductByASIN: any,
  generateDefaultVerdict: any,
  generateDefaultClaims: any,
  generateDefaultFaqs: any,
  sleep: any,
  config: AppConfig
): Promise<ProductDetails[]> {
  console.log('=== AGGRESSIVE PRODUCT DETECTION ===');
  console.log('Title:', title.substring(0, 50));
  console.log('Content length:', content.length);
  console.log('Has SerpAPI key:', !!config.serpApiKey);

  const cleanContent = content.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

  // Phase 1: Pattern detection
  console.log('\n--- Phase 1: Pattern Detection ---');
  const phase1Products = extractProductsPhase1(content, cleanContent);
  console.log(`Found ${phase1Products.length} products via patterns:`);
  phase1Products.forEach((p: any, i: number) => {
    console.log(`  ${i + 1}. ${p.name} (${p.sourceType}${p.asin ? `, ASIN: ${p.asin}` : ''})`);
  });

  if (!config.serpApiKey) {
    console.error('✗ No SerpAPI key configured!');
    return [];
  }

  const products: ProductDetails[] = [];
  const maxProducts = 10;

  console.log('\n--- Phase 2: SerpAPI Enrichment ---');
  for (let i = 0; i < Math.min(phase1Products.length, maxProducts); i++) {
    const p1 = phase1Products[i];
    console.log(`\n[${i + 1}/${Math.min(phase1Products.length, maxProducts)}] Processing: ${p1.name}`);

    try {
      let productData: any = {};

      // Try ASIN first if available
      if (p1.asin) {
        console.log(`  → Fetching by ASIN: ${p1.asin}`);
        try {
          const result = await fetchProductByASIN(p1.asin, config.serpApiKey);
          if (result) {
            productData = result;
            console.log(`  ✓ Got product via ASIN`);
          }
        } catch (err: any) {
          console.log(`  ✗ ASIN fetch failed: ${err.message}`);
        }
      }

      // Try search if no ASIN or ASIN failed
      if (!productData.asin) {
        console.log(`  → Searching: "${p1.name}"`);
        try {
          productData = await searchAmazonProduct(p1.name, config.serpApiKey);
          if (productData.asin) {
            console.log(`  ✓ Got product via search`);
          }
        } catch (err: any) {
          console.log(`  ✗ Search failed: ${err.message}`);
        }
      }

      // Validate product data
      const hasAsin = !!productData.asin;
      const hasImage = !!productData.imageUrl;
      const hasPrice = productData.price && productData.price !== '$XX.XX';

      console.log(`  Data check: ASIN=${hasAsin}, Image=${hasImage}, Price=${hasPrice} (${productData.price})`);

      if (hasAsin && hasImage && hasPrice) {
        console.log(`  ✓✓✓ VALID PRODUCT ADDED`);
        products.push({
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
          deploymentMode: 'ELITE_BENTO' as any,
          faqs: generateDefaultFaqs(productData.title || p1.name),
          specs: {},
          confidence: p1.confidence,
        });
      } else {
        console.log(`  ✗ Invalid product data, skipping`);
      }

      // Rate limiting
      if (i < Math.min(phase1Products.length, maxProducts) - 1) {
        await sleep(200);
      }
    } catch (err: any) {
      console.error(`  ✗✗✗ Error processing product: ${err.message}`);
    }
  }

  console.log(`\n=== DETECTION COMPLETE ===`);
  console.log(`Final result: ${products.length} valid products found`);

  return products;
}
