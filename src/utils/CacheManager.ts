import NodeCache from 'node-cache';
import { Logger } from './Logger.js';

export class CacheManager {
  private cache: NodeCache;
  private logger: Logger;

  constructor() {
    const ttl = parseInt(process.env.CACHE_TTL || '300'); // 5 minutes default
    const checkPeriod = parseInt(process.env.CACHE_CHECK_PERIOD || '60'); // 1 minute default

    this.cache = new NodeCache({
      stdTTL: ttl,
      checkperiod: checkPeriod,
      useClones: false, // For better performance
    });

    this.logger = new Logger('CacheManager');

    // Log cache statistics periodically
    setInterval(() => {
      const stats = this.cache.getStats();
      this.logger.debug('Cache statistics', stats);
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  set(key: string, value: any, ttl?: number): boolean {
    try {
      const success = this.cache.set(key, value, ttl ?? 0);
      if (success) {
        this.logger.debug(`Cache set: ${key}`);
      }
      return success;
    } catch (error) {
      this.logger.error(`Failed to set cache key ${key}:`, error);
      return false;
    }
  }

  get<T = any>(key: string): T | undefined {
    try {
      const value = this.cache.get<T>(key);
      if (value !== undefined) {
        this.logger.debug(`Cache hit: ${key}`);
      } else {
        this.logger.debug(`Cache miss: ${key}`);
      }
      return value;
    } catch (error) {
      this.logger.error(`Failed to get cache key ${key}:`, error);
      return undefined;
    }
  }

  has(key: string): boolean {
    return this.cache.has(key);
  }

  delete(key: string): number {
    try {
      const result = this.cache.del(key);
      this.logger.debug(`Cache delete: ${key}`);
      return result;
    } catch (error) {
      this.logger.error(`Failed to delete cache key ${key}:`, error);
      return 0;
    }
  }

  flush(): void {
    try {
      this.cache.flushAll();
      this.logger.info('Cache flushed');
    } catch (error) {
      this.logger.error('Failed to flush cache:', error);
    }
  }

  getStats(): any {
    return this.cache.getStats();
  }

  // Account-specific cache methods
  setAccountCache(email: string, key: string, value: any, ttl?: number): boolean {
    return this.set(`${email}:${key}`, value, ttl);
  }

  getAccountCache<T = any>(email: string, key: string): T | undefined {
    return this.get<T>(`${email}:${key}`);
  }

  deleteAccountCache(email: string, key?: string): number {
    if (key) {
      return this.delete(`${email}:${key}`);
    } else {
      // Delete all cache entries for this account
      const keys = this.cache.keys().filter(k => k.startsWith(`${email}:`));
      let deleted = 0;
      for (const key of keys) {
        deleted += this.delete(key);
      }
      return deleted;
    }
  }

  // Batch operations
  setBatch(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): boolean {
    try {
      let allSuccess = true;
      for (const { key, value, ttl } of keyValuePairs) {
        const success = this.set(key, value, ttl);
        if (!success) {
          allSuccess = false;
        }
      }
      return allSuccess;
    } catch (error) {
      this.logger.error('Failed to set batch cache:', error);
      return false;
    }
  }

  getBatch<T = any>(keys: string[]): Record<string, T | undefined> {
    const results: Record<string, T | undefined> = {};
    for (const key of keys) {
      results[key] = this.get<T>(key);
    }
    return results;
  }

  deleteBatch(keys: string[]): number {
    let deleted = 0;
    for (const key of keys) {
      deleted += this.delete(key);
    }
    return deleted;
  }

  // Pattern-based operations
  deletePattern(pattern: RegExp): number {
    const keys = this.cache.keys().filter(key => pattern.test(key));
    return this.deleteBatch(keys);
  }

  getKeys(pattern?: RegExp): string[] {
    const keys = this.cache.keys();
    return pattern ? keys.filter(key => pattern.test(key)) : keys;
  }

  // Memory management
  getMemoryUsage(): { size: number; keys: number } {
    return {
      size: this.cache.getStats().ksize,
      keys: this.cache.getStats().keys,
    };
  }

  // Cache warming utilities
  async warmCache(warmFunction: () => Promise<void>): Promise<void> {
    try {
      this.logger.info('Starting cache warm-up');
      await warmFunction();
      this.logger.info('Cache warm-up completed');
    } catch (error) {
      this.logger.error('Cache warm-up failed:', error);
    }
  }
}