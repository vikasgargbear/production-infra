"""
Collection of specific invoice parsers
"""
from .arpii_healthcare_parser import ArpiiHealthCareParser
from .pharma_biological_parser import PharmaBiologicalParser
from .polestar_parser import PolestarParser
from .generic_parser import GenericPharmaParser

__all__ = [
    'ArpiiHealthCareParser',
    'PharmaBiologicalParser',
    'PolestarParser',
    'GenericPharmaParser'
]