"""
Response Validation Middleware

Validates API responses against defined JSON schemas to catch data integrity issues.
"""
import logging
from typing import Callable
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
import jsonschema
from jsonschema import validate, ValidationError
import json

from .schemas import get_schema

logger = logging.getLogger(__name__)


class ResponseValidationMiddleware(BaseHTTPMiddleware):
    """
    Middleware to validate API responses against schemas.
    Logs validation errors but doesn't block responses (monitoring mode).
    """
    
    # Endpoints to validate
    VALIDATION_MAP = {
        "/api/sales/invoices": "invoice",
        "/api/payments": "payment",
        "/api/inventory/batches": "batch",
        "/api/returns": "return"
    }
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Validate response if endpoint is in validation map"""
        response = await call_next(request)
        
        # Only validate successful responses
        if response.status_code not in [200, 201]:
            return response
        
        # Check if URL should be validated
        path = request.url.path
        schema_name = None
        
        for endpoint, schema in self.VALIDATION_MAP.items():
            if path.startswith(endpoint):
                schema_name = schema
                break
        
        if not schema_name:
            return response
        
        # Read response body
        try:
            response_body = b""
            async for chunk in response.body_iterator:
                response_body += chunk
            
            response_data = json.loads(response_body)
            
            # Get schema and validate
            schema = get_schema(schema_name)
            if schema:
                try:
                    # If response is a list, validate each item
                    if isinstance(response_data, list):
                        for i, item in enumerate(response_data):
                            validate(instance=item, schema=schema)
                    else:
                        validate(instance=response_data, schema=schema)
                    
                    logger.debug(f"✓ Response validation passed for {path}")
                
                except ValidationError as e:
                    # Log validation error but don't block response
                    logger.error(
                        f"❌ Response validation failed for {path}: {e.message}",
                        extra={
                            "path": path,
                            "schema": schema_name,
                            "validation_error": str(e),
                            "failed_value": e.instance if hasattr(e, 'instance') else None
                        }
                    )
            
            # Recreate response with same body
            return Response(
                content=response_body,
                status_code=response.status_code,
                headers=dict(response.headers),
                media_type=response.media_type
            )
        
        except Exception as e:
            logger.warning(f"Could not validate response for {path}: {e}")
            return response


# Enable/disable validation
ENABLE_RESPONSE_VALIDATION = True  # Set to False to disable


def add_validation_middleware(app):
    """Add validation middleware to FastAPI app"""
    if ENABLE_RESPONSE_VALIDATION:
        app.add_middleware(ResponseValidationMiddleware)
        logger.info("✓ Response validation middleware enabled")
