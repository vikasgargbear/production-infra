"""
Master Data Services Module
Business logic for master data operations (products, customers, etc.)
"""
from .product_service import ProductService
from .customer_service import CustomerService

__all__ = ['ProductService', 'CustomerService']
