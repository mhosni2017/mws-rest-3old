import idb from "idb";
/*self.importScripts('idb.js');*/
/* code used here from the udacity course and google developers Caching Files with Service Worker samples*/

const dbPromise = idb.open("rest-db",1, upgradeDB => {
  switch (upgradeDB.oldVersion) {
    case 0: upgradeDB.createObjectStore("restaurants" , {keyPath :'id'});
    case 1:
      {
        const reviewsStore = upgradeDB.createObjectStore("reviews", {keyPath: "id"});
        reviewsStore.createIndex("restaurant_id", "restaurant_id");
      }
      case 2:
        upgradeDB.createObjectStore("pending", {
          keyPath: "id",
          autoIncrement: true
        });

  }
});
let staticCacheName = 'mws-restaurant-cache-1';
var allCaches = [
  staticCacheName
];
let urlsToCache = [
  '/index.html',
  '/restaurant.html',
  'css/styles.css',
  'js/main.js',
  'js/dbhelper.js',
  'js/restaurant_info.js'
];


self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(staticCacheName).then(function(cache) {
      console.log("inside install")
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('activate', function(event) {
  console.log("inside activate")
  event.waitUntil(
    caches.keys().then(function(cacheNames) {
      return Promise.all(
        cacheNames.filter(function(cacheName) {
          return cacheName.startsWith('mws-') &&
                 !allCaches.includes(cacheName);
        }).map(function(cacheName) {
          return caches.delete(cacheName);
        })
      );
    })
  );
});

// Requests going to the API get handled separately from those // going to other destirations twist
self.addEventListener('fetch', function(event) {
  let cacheRequest = event.request;
  let requestUrl = new URL(event.request.url);
  if (event.request.url.indexOf("restaurant.html") >-1 ) {
    const cacheURL = "restaurant.html";
    cacheRequest = new Request(cacheURL);
  }
  if (requestUrl.port ==='1337') {
   const parts = requestUrl.pathname.split("/");
   const id = parts[parts.length - 1] === "restaurants" ? "-1" : parts[parts.length - 1];
      handleAJAXEvent(event, id);
    } else { handleNonAJAXEvent(event,cacheRequest);
    }
 }) ;
/*
const handleAJAXEvent = (event, id) => { // Check the IndexedDB to see if the JSON for the API
event.respondWith( dbPromise.then(db => {
    return db.transaction("restaurants").objectStore("restaurants").get(id);
    }).then(data => {
    return ( (data && data.data) || fetch(event.request).then(fetchResponse => fetchResponse.json()).then(
      json => {
        return dbPromise.then(db => {
          const tx = db.transaction("restaurants","readwrite");
          tx.objectStore("restaurants").put({
            id: id,
            data: json
          });
          return json; }); })
        ); }).then( finalResponse=> {
             return new Response(JSON.stringify(finalResponse));
          }).catch(error => { return new Response("Frror fetching data", { status: 500});
        })
      ); };
*/
  const handleAJAXEvent = (event, id) => {
    // Only use caching for GET events
    if (event.request.method !== "GET") {
      return fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return json
        });
    }

    // Split these request for handling restaurants vs reviews
    if (event.request.url.indexOf("reviews") > -1) {
      handleReviewsEvent(event, id);
    } else {
      handleRestaurantEvent(event, id);
    }
  }

  const handleReviewsEvent = (event, id) => {
    event.respondWith(dbPromise.then(db => {
      return db
        .transaction("reviews")
        .objectStore("reviews")
        .index("restaurant_id")
        .getAll(id);
    }).then(data => {
      return (data.length && data) || fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(data => {
          return dbPromise.then(idb => {
            const itx = idb.transaction("reviews", "readwrite");
            const store = itx.objectStore("reviews");
            data.forEach(review => {
              store.put({id: review.id, "restaurant_id": review["restaurant_id"], data: review});
            })
            return data;
          })
        })
    }).then(finalResponse => {
      if (finalResponse[0].data) {
        // Need to transform the data to the proper format
        const mapResponse = finalResponse.map(review => review.data);
        return new Response(JSON.stringify(mapResponse));
      }
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response("Error fetching data", {status: 500})
    }))
  }

  const handleRestaurantEvent = (event, id) => {
    // Check the IndexedDB to see if the JSON for the API has already been stored
    // there. If so, return that. If not, request it from the API, store it, and
    // then return it back.
    event.respondWith(dbPromise.then(db => {
      return db
        .transaction("restaurants")
        .objectStore("restaurants")
        .get(id);
    }).then(data => {
      return (data && data.data) || fetch(event.request)
        .then(fetchResponse => fetchResponse.json())
        .then(json => {
          return dbPromise.then(db => {
            const tx = db.transaction("restaurants", "readwrite");
            const store = tx.objectStore("restaurants");
            store.put({id: id, data: json});
            return json;
          });
        });
    }).then(finalResponse => {
      return new Response(JSON.stringify(finalResponse));
    }).catch(error => {
      return new Response("Error fetching data", {status: 500});
    }));
  };


const handleNonAJAXEvent = (event,cacheRequest) => {

  event.respondWith(
    caches.open(staticCacheName).then(function(cache) {
      return caches.match(cacheRequest).then(function(response) {
        return response || fetch(event.request).then(function(response) {
          cache.put(event.request, response.clone());
          return response;
        });
      }).catch( error=> {
        if (event.request.url.indexOf(".jpg">=1)) {
          return caches.match("/img/na.png");
        }
        return new Response (
          "Application is not connected to internet" ,
           {
             status: 404,
             statusText : "Application is not connected to internet"
           }

        );
        })

    })
  );
};
