"""
Master Data Services Module
Business logic for master data operations (products, customers, etc.)
"""
from .customer.service import CustomerService

__all__ = ['CustomerService']
