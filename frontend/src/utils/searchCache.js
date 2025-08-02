// Fast search implementation with caching and indexing
class SearchCache {
  constructor(maxAge = 10 * 60 * 1000) { // 10 minutes
    this.cache = new Map();
    this.indexes = new Map();
    this.maxAge = maxAge;
    this.preloadedData = new Map();
    this.pendingRequests = new Map(); // Prevent duplicate requests
  }

  // Generate cache key from search params
  getCacheKey(prefix, params) {
    return `${prefix}:${JSON.stringify(params || {})}`;
  }

  // Get cached data if valid
  get(prefix, params) {
    const key = this.getCacheKey(prefix, params);
    const cached = this.cache.get(key);
    
    if (!cached) return null;
    
    // Check if cache is expired
    if (Date.now() - cached.timestamp > this.maxAge) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  // Set cache data
  set(prefix, params, data) {
    const key = this.getCacheKey(prefix, params);
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  // Create search index for fast client-side search
  createIndex(type, data) {
    const index = new Map();
    
    data.forEach(item => {
      // Index by various fields for fast lookup
      const searchableFields = this.getSearchableFields(type, item);
      
      searchableFields.forEach(field => {
        if (field) {
          // Create tokens for search
          const tokens = this.tokenize(field.toLowerCase());
          tokens.forEach(token => {
            if (!index.has(token)) {
              index.set(token, new Set());
            }
            index.get(token).add(item);
          });
        }
      });
    });
    
    this.indexes.set(type, index);
    return index;
  }

  // Get searchable fields based on type
  getSearchableFields(type, item) {
    switch (type) {
      case 'customers':
        return [
          item.customer_name,
          item.phone,
          item.email,
          item.city,
          item.state,
          item.gst_number
        ].filter(Boolean);
      
      case 'products':
        return [
          item.product_name,
          item.product_code,
          item.hsn_code,
          item.category,
          item.manufacturer
        ].filter(Boolean);
      
      case 'suppliers':
        return [
          item.supplier_name,
          item.phone,
          item.email,
          item.city,
          item.state,
          item.gst_number
        ].filter(Boolean);
      
      default:
        return Object.values(item).filter(val => typeof val === 'string');
    }
  }

  // Tokenize string for indexing
  tokenize(str) {
    const tokens = new Set();
    
    // Add full string
    tokens.add(str);
    
    // Add each word
    str.split(/\s+/).forEach(word => {
      if (word.length >= 2) {
        tokens.add(word);
        // Add prefixes for autocomplete
        for (let i = 2; i <= word.length; i++) {
          tokens.add(word.substring(0, i));
        }
      }
    });
    
    return tokens;
  }

  // Fast client-side search
  searchLocal(type, query, limit = 20) {
    if (!query || query.length < 2) {
      // Return most recent/popular items if no query
      const allData = this.preloadedData.get(type) || [];
      return Array.isArray(allData) ? allData.slice(0, limit) : [];
    }
    
    const index = this.indexes.get(type);
    if (!index) {
      return [];
    }
    
    const queryLower = query.toLowerCase();
    const results = new Set();
    
    // Search in index
    const tokens = this.tokenize(queryLower);
    tokens.forEach(token => {
      const matches = index.get(token);
      if (matches) {
        matches.forEach(item => results.add(item));
      }
    });
    
    // Score and sort results
    const scoredResults = Array.from(results).map(item => {
      const score = this.calculateScore(type, item, queryLower);
      return { item, score };
    });
    
    // Sort by score and return top results
    return scoredResults
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map(result => result.item);
  }

  // Calculate relevance score
  calculateScore(type, item, query) {
    let score = 0;
    const fields = this.getSearchableFields(type, item);
    
    fields.forEach(field => {
      if (field) {
        const fieldLower = field.toLowerCase();
        
        // Exact match
        if (fieldLower === query) {
          score += 100;
        }
        // Starts with query
        else if (fieldLower.startsWith(query)) {
          score += 50;
        }
        // Contains query
        else if (fieldLower.includes(query)) {
          score += 20;
        }
      }
    });
    
    return score;
  }

  // Preload common data
  async preloadData(type, fetchFunction) {
    try {
      // Check if already preloading
      if (this.pendingRequests.has(type)) {
        return this.pendingRequests.get(type);
      }

      // Create promise for this request
      const promise = fetchFunction().then(response => {
        // Handle different response structures
        let data = [];
        if (response && response.data) {
          if (Array.isArray(response.data)) {
            data = response.data;
          } else if (response.data.results && Array.isArray(response.data.results)) {
            data = response.data.results;
          } else if (response.data.data && Array.isArray(response.data.data)) {
            data = response.data.data;
          } else if (response.data[type] && Array.isArray(response.data[type])) {
            data = response.data[type];
          }
        }
        
        
        // Store in preloaded data
        this.preloadedData.set(type, data);
        
        // Create search index
        this.createIndex(type, data);
        
        // Remove from pending
        this.pendingRequests.delete(type);
        
        return data;
      }).catch(error => {
        console.error(`Failed to preload ${type}:`, error);
        this.pendingRequests.delete(type);
        return [];
      });

      // Store pending request
      this.pendingRequests.set(type, promise);
      
      return promise;
    } catch (error) {
      console.error(`Failed to preload ${type}:`, error);
      return [];
    }
  }

  // Get preloaded data
  getPreloadedData(type) {
    const data = this.preloadedData.get(type) || [];
    return Array.isArray(data) ? data : [];
  }

  // Clear cache
  clear() {
    this.cache.clear();
    this.indexes.clear();
    this.preloadedData.clear();
    this.pendingRequests.clear();
  }

  // Clear specific type
  clearType(type) {
    // Clear cache entries for this type
    const keysToDelete = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(type + ':')) {
        keysToDelete.push(key);
      }
    }
    keysToDelete.forEach(key => this.cache.delete(key));
    
    // Clear index and preloaded data
    this.indexes.delete(type);
    this.preloadedData.delete(type);
  }
}

// Create singleton instance
export const searchCache = new SearchCache();

// Helper to perform cached search with fallback to API
export const smartSearch = async (type, query, apiSearchFunction, options = {}) => {
  const { 
    useLocalSearch = true, 
    limit = 20,
    minQueryLength = 2,
    preloadIfEmpty = true
  } = options;

  // If query is too short, return empty or preloaded data
  if (!query || query.length < minQueryLength) {
    if (preloadIfEmpty) {
      const preloaded = searchCache.getPreloadedData(type);
      return Array.isArray(preloaded) ? preloaded.slice(0, limit) : [];
    }
    return [];
  }

  // Try local search first if enabled and data is preloaded
  const preloadedData = searchCache.getPreloadedData(type);
  if (useLocalSearch && Array.isArray(preloadedData) && preloadedData.length > 0) {
    const localResults = searchCache.searchLocal(type, query, limit);
    if (Array.isArray(localResults) && localResults.length > 0) {
      return localResults;
    }
  }

  // Check API cache
  const cached = searchCache.get(type, { search: query });
  if (cached) {
    return cached;
  }

  // Fallback to API search
  try {
    const response = await apiSearchFunction(query);
    // Handle different API response structures
    let results = [];
    if (response && response.data) {
      if (Array.isArray(response.data)) {
        results = response.data;
      } else if (response.data.results && Array.isArray(response.data.results)) {
        results = response.data.results;
      } else if (response.data.data && Array.isArray(response.data.data)) {
        results = response.data.data;
      } else if (response.data[type] && Array.isArray(response.data[type])) {
        results = response.data[type];
      }
    }
    
    // Cache the results
    searchCache.set(type, { search: query }, results);
    
    return results;
  } catch (error) {
    console.error(`Search failed for ${type}:`, error);
    return [];
  }
};

export default searchCache;