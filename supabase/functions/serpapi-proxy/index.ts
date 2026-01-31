import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface SearchRequest {
  query?: string;
  asin?: string;
  apiKey: string;
  type: 'search' | 'product';
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const { query, asin, apiKey, type }: SearchRequest = await req.json();

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "API key is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    let serpApiUrl: string;

    if (type === 'product' && asin) {
      serpApiUrl = `https://serpapi.com/search.json?engine=amazon_product&product_id=${encodeURIComponent(asin)}&amazon_domain=amazon.com&api_key=${encodeURIComponent(apiKey)}`;
    } else if (type === 'search' && query) {
      serpApiUrl = `https://serpapi.com/search.json?engine=amazon&amazon_domain=amazon.com&k=${encodeURIComponent(query)}&api_key=${encodeURIComponent(apiKey)}`;
    } else {
      return new Response(
        JSON.stringify({ error: "Invalid request - provide query or asin" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`[SerpAPI Proxy] Making request for ${type}:`, query || asin);

    const response = await fetch(serpApiUrl, {
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[SerpAPI Proxy] API error: ${response.status}`, errorText);
      return new Response(
        JSON.stringify({
          error: `SerpAPI error: ${response.status}`,
          details: errorText.substring(0, 200)
        }),
        {
          status: response.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const data = await response.json();
    console.log(`[SerpAPI Proxy] Success - got ${data.organic_results?.length || 0} results`);

    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error: any) {
    console.error("[SerpAPI Proxy] Error:", error.message);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
