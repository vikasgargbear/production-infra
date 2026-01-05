"""
Master Data Services Module
Business logic for master data operations (products, customers, etc.)
"""
from .product.service import ProductService
from .customer.service import CustomerService

__all__ = ['ProductService', 'CustomerService']
