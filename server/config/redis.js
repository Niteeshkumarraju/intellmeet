const Redis = require('ioredis');

let redisClient = null;

const getRedisClient = () => {
  if (redisClient) return redisClient;

  const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';

  redisClient = new Redis(redisUrl, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    retryStrategy(times) {
      if (times > 3) {
        console.warn('[Redis] Max retry attempts reached. Running without Redis cache.');
        return null; // stop retrying
      }
      return Math.min(times * 200, 2000);
    },
    reconnectOnError(err) {
      console.warn('[Redis] Connection error:', err.message);
      return false;
    },
  });

  redisClient.on('connect', () => console.log('[Redis] Connected successfully'));
  redisClient.on('error', (err) => {
    if (!err.message.includes('ECONNREFUSED')) {
      console.warn('[Redis] Error:', err.message);
    }
  });

  return redisClient;
};

// Safe get — returns null on error (app continues without cache)
const cacheGet = async (key) => {
  try {
    const client = getRedisClient();
    const val = await client.get(key);
    return val ? JSON.parse(val) : null;
  } catch {
    return null;
  }
};

// Safe set — silently fails if Redis is down
const cacheSet = async (key, value, ttlSeconds = 60) => {
  try {
    const client = getRedisClient();
    await client.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch {
    // Redis unavailable — continue without caching
  }
};

// Safe delete
const cacheDel = async (key) => {
  try {
    const client = getRedisClient();
    await client.del(key);
  } catch {
    // silently fail
  }
};

// Delete by pattern
const cacheDelPattern = async (pattern) => {
  try {
    const client = getRedisClient();
    const keys = await client.keys(pattern);
    if (keys.length > 0) await client.del(...keys);
  } catch {
    // silently fail
  }
};

module.exports = { getRedisClient, cacheGet, cacheSet, cacheDel, cacheDelPattern };
