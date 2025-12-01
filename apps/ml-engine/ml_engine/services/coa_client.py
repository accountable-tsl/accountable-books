"""Client for fetching company COA from Redis cache.

The Node.js API caches COA snapshots in Redis with versioned keys.
We fetch directly from Redis using the snapshot version from enriched_transaction.
"""

from __future__ import annotations

import json
import logging
from typing import Any, Dict, List

import redis.asyncio as redis

from ml_engine.core.redis_client import get_redis_client

logger = logging.getLogger(__name__)

async def fetch_coa_snapshot(
    company_uuid: str, snapshot_version: str
) -> list[dict]:
    """
    Fetch COA snapshot from Redis cache.
    
    Args:
        company_uuid: Company UUID
        snapshot_version: COA snapshot version (from enriched_transaction.context)
        
    Returns:
        List of COA account dictionaries
        
    Raises:
        ValueError: If COA snapshot not found in cache
        redis.Redis not configured
        redis.RedisError: If Redis operation fails
    """
    client = get_redis_client()
    cache_key = f"coa:snapshot:{company_uuid}:{snapshot_version}"
    
    try:
        cached_data = await client.get(cache_key)
        if not cached_data:
            raise ValueError(
                f"COA snapshot not found in cache: {cache_key}. "
                "Node.js API should cache it before calling ML Engine."
            )
        
        coa_data = json.loads(cached_data)
        logger.debug(
            {
                "company_uuid": company_uuid,
                "snapshot_version": snapshot_version,
                "account_count": len(coa_data),
            },
            "COA snapshot fetched from Redis",
        )
        
        return coa_data
        
    except redis.RedisError as e:
        logger.error(
            {
                "error": str(e),
                "company_uuid": company_uuid,
                "snapshot_version": snapshot_version,
                "cache_key": cache_key,
            },
            "Failed to fetch COA snapshot from Redis",
        )
        raise


class CoaClientError(RuntimeError):
    """Raised when COA retrieval fails."""


async def fetch_company_coa(
    company_uuid: str, snapshot_version: str
) -> List[Dict[str, Any]]:
    """
    Fetch company COA from Redis cache using snapshot version.
    
    Args:
        company_uuid: Company UUID
        snapshot_version: COA snapshot version (from enriched_transaction.context.coa_snapshot_version)
        
    Returns:
        List of COA account dictionaries
        
    Raises:
        CoaClientError: If COA retrieval fails
    """
    try:
        coa_data = await fetch_coa_snapshot(company_uuid, snapshot_version)
        logger.debug(
            {
                "company_uuid": company_uuid,
                "snapshot_version": snapshot_version,
                "account_count": len(coa_data),
            },
            "COA fetched from Redis cache",
        )
        return coa_data
    except Exception as e:
        logger.error(
            {
                "error": str(e),
                "company_uuid": company_uuid,
                "snapshot_version": snapshot_version,
            },
            "Failed to fetch COA from Redis",
        )
        raise CoaClientError(f"Failed to fetch COA: {str(e)}") from e