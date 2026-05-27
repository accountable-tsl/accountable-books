"""Redis client for ML Engine."""

import json
import logging
import os
from typing import Optional

import redis.asyncio as redis

logger = logging.getLogger(__name__)

# Redis connection singleton
_redis_client: Optional[redis.Redis] = None


def get_redis_client() -> redis.Redis:
    """
    Get or create Redis client singleton.
    
    Returns:
        Redis client instance
        
    Raises:
        ValueError: If REDIS_URL is not configured
    """
    global _redis_client
    
    if _redis_client is None:
        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            raise ValueError("REDIS_URL environment variable is not set")
        
        _redis_client = redis.from_url(
            redis_url,
            decode_responses=True,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
        )
        logger.info("Redis client initialized")
    
    return _redis_client
