/* eslint-disable no-restricted-globals */

// Service Worker for Pharma ERP - Offline Support
// Version: Update this when making changes to force update
const CACHE_VERSION = 'v2'; // Incremented after fixing POST handling
const CACHE_NAME = `pharma-erp-${CACHE_VERSION}`;
const DATA_CACHE_NAME = `pharma-data-${CACHE_VERSION}`;
const OFFLINE_URL = '/offline.html';

// URLs to cache on install
const urlsToCache = [
  '/',
  '/static/css/main.css',
  '/static/js/bundle.js',
  '/manifest.json',
  '/favicon.ico'
];

// Install event - cache essential files
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('[ServiceWorker] Pre-caching offline page');
        return cache.addAll(urlsToCache);
      })
      .then(() => self.skipWaiting())
  );
});

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME && cacheName !== DATA_CACHE_NAME) {
            console.log('[ServiceWorker] Removing old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - serve from cache when offline
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Handle API calls
  if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/pg/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // IMPORTANT: Pass through the response for POST/PUT/DELETE
          // Only cache GET requests
          if (request.method === 'GET' && response.status === 200) {
            const responseToCache = response.clone();
            caches.open(DATA_CACHE_NAME).then((cache) => {
              cache.put(request, responseToCache);
            });
          }
          
          // Always return the network response (don't modify it)
          return response;
        })
        .catch(() => {
          // If network fails, try to get from cache
          if (request.method === 'GET') {
            return caches.match(request).then((response) => {
              if (response) {
                console.log('[ServiceWorker] Serving from cache:', request.url);
                return response;
              }
              // Return offline response for failed API calls
              return new Response(
                JSON.stringify({ 
                  offline: true, 
                  message: 'You are offline. This data will sync when connection returns.' 
                }),
                {
                  headers: { 'Content-Type': 'application/json' },
                  status: 503
                }
              );
            });
          }
          
          // For non-GET requests when offline, return error response
          // Don't try to queue - just fail gracefully
          return new Response(
            JSON.stringify({ 
              error: 'Network unavailable',
              message: 'Cannot perform this action while offline. Please check your connection.' 
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 503
            }
          );
        })
    );
    return;
  }

  // Handle static assets
  event.respondWith(
    caches.match(request)
      .then((response) => {
        // Cache hit - return response
        if (response) {
          return response;
        }

        // Clone the request
        const fetchRequest = request.clone();

        return fetch(fetchRequest).then((response) => {
          // Check if valid response
          if (!response || response.status !== 200 || response.type !== 'basic') {
            return response;
          }

          // Clone the response
          const responseToCache = response.clone();

          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });

          return response;
        });
      })
      .catch(() => {
        // Return offline page for navigation requests
        if (request.mode === 'navigate') {
          return caches.match(OFFLINE_URL);
        }
      })
  );
});

// Background sync event
self.addEventListener('sync', (event) => {
  if (event.tag === 'sync-queue') {
    event.waitUntil(syncQueue());
  }
});

// Queue request for later sync
async function queueRequest(method, url, body) {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  
  await store.add({
    method,
    url,
    body,
    timestamp: new Date().toISOString(),
    attempts: 0
  });
  
  // Register for background sync
  if ('sync' in self.registration) {
    await self.registration.sync.register('sync-queue');
  }
  
  return new Response(
    JSON.stringify({ 
      queued: true, 
      message: 'Request queued. Will sync when online.' 
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 202
    }
  );
}

// Sync queued requests
async function syncQueue() {
  const db = await openDB();
  const tx = db.transaction('sync_queue', 'readwrite');
  const store = tx.objectStore('sync_queue');
  const requests = await store.getAll();
  
  for (const request of requests) {
    try {
      const response = await fetch(request.url, {
        method: request.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.body)
      });
      
      if (response.ok) {
        // Remove from queue if successful
        await store.delete(request.id);
        
        // Notify clients of successful sync
        self.clients.matchAll().then(clients => {
          clients.forEach(client => {
            client.postMessage({
              type: 'SYNC_SUCCESS',
              request: request
            });
          });
        });
      } else {
        // Increment attempts
        request.attempts++;
        if (request.attempts >= 3) {
          // Move to failed queue after 3 attempts
          await store.delete(request.id);
          // Could store in a 'failed' store for manual retry
        } else {
          await store.put(request);
        }
      }
    } catch (error) {
      console.error('[ServiceWorker] Sync failed:', error);
      // Keep in queue for next sync
    }
  }
}

// Simple IndexedDB helper for service worker
function openDB() {
  return new Promise((resolve, reject) => {
    const request = self.indexedDB.open('PharmaERPSync', 1);
    
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains('sync_queue')) {
        const store = db.createObjectStore('sync_queue', { 
          keyPath: 'id', 
          autoIncrement: true 
        });
        store.createIndex('timestamp', 'timestamp');
      }
    };
  });
}

// Listen for skip waiting message
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});