import { defineCloudflareConfig } from '@opennextjs/cloudflare'
import r2IncrementalCache from '@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache'
import { withRegionalCache } from '@opennextjs/cloudflare/overrides/incremental-cache/regional-cache'
import doQueue from '@opennextjs/cloudflare/overrides/queue/do-queue'
import queueCache from '@opennextjs/cloudflare/overrides/queue/queue-cache'
import doShardedTagCache from '@opennextjs/cloudflare/overrides/tag-cache/do-sharded-tag-cache'

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, {
    mode: 'long-lived',
    shouldLazilyUpdateOnCacheHit: true,
  }),
  tagCache: doShardedTagCache({ baseShardSize: 12, regionalCache: true }),
  queue: queueCache(doQueue, {
    regionalCacheTtlSec: 5, // The TTL for the regional cache, defaults to 5 seconds

    // Whether to wait for the queue to acknowledge the request before returning
    // When set to false, the cache will be populated asap and the queue will be called after.
    // When set to true, the cache will be populated only after the queue ack is received.
    waitForQueueAck: true,
  }),
})
