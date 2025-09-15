"""
Factory for selecting appropriate invoice parser
"""
import pdfplumber
import logging
from typing import Dict, Any, Optional
from datetime import datetime

logger = logging.getLogger(__name__)

# Import the comprehensive parser components
try:
    from .parsers_complete.base_parser import BaseInvoiceParser
    from .parsers_complete.parsers import (
        ArpiiHealthCareParser,
        PharmaBiologicalParser,
        PolestarParser,
        GenericPharmaParser
    )
    from .parsers_complete.enhanced_parser import EnhancedFlexibleParser
    PARSERS_AVAILABLE = True
except ImportError as e:
    logger.warning(f"Could not import specialized parsers: {e}")
    PARSERS_AVAILABLE = False
    BaseInvoiceParser = None
    ArpiiHealthCareParser = None
    PharmaBiologicalParser = None
    PolestarParser = None
    GenericPharmaParser = None
    EnhancedFlexibleParser = None

class InvoiceParserFactory:
    """
    Factory class to select the appropriate parser based on invoice content
    """
    
    @staticmethod
    def get_parser(pdf_path: str):
        """
        Analyze PDF and return appropriate parser
        """
        if not PARSERS_AVAILABLE:
            logger.warning("Specialized parsers not available, returning None")
            return None
            
        try:
            # Extract text to identify invoice type
            text = ""
            with pdfplumber.open(pdf_path) as pdf:
                for page in pdf.pages[:2]:  # Check first 2 pages
                    page_text = page.extract_text()
                    if page_text:
                        text += page_text
            
            # Identify parser based on content
            text_upper = text.upper()
            
            if "ARPII HEALTH CARE" in text_upper:
                logger.info("Detected ARPII HEALTH CARE invoice format")
                return ArpiiHealthCareParser()
            
            elif "PHARMA BIO LOGICAL" in text_upper:
                logger.info("Detected PHARMA BIO LOGICAL invoice format")
                return PharmaBiologicalParser()
            
            elif "POLESTAR POWER INDUSTRIES" in text_upper:
                logger.info("Detected POLESTAR invoice format")
                return PolestarParser()
            
            else:
                logger.info("Using generic pharmaceutical parser")
                return GenericPharmaParser()
                
        except Exception as e:
            logger.error(f"Error identifying parser: {e}")
            # Default to generic parser
            if PARSERS_AVAILABLE:
                return GenericPharmaParser()
            return None
    
    @staticmethod
    def parse_invoice(pdf_path: str, use_enhanced_fallback: bool = True) -> Dict[str, Any]:
        """
        Parse invoice using appropriate parser
        """
        if not PARSERS_AVAILABLE:
            logger.warning("Parsers not available, returning template")
            return {
                "success": False,
                "message": "Specialized parsers not available",
                "extracted_data": {
                    "invoice_number": "",
                    "invoice_date": datetime.now().isoformat()[:10],
                    "supplier_name": "",
                    "supplier_gstin": "",
                    "supplier_address": "",
                    "drug_license": "",
                    "subtotal": 0,
                    "tax_amount": 0,
                    "discount_amount": 0,
                    "grand_total": 0,
                    "items": []
                }
            }
            
        try:
            parser = InvoiceParserFactory.get_parser(pdf_path)
            if not parser:
                return {
                    "success": False,
                    "message": "Could not initialize parser",
                    "extracted_data": {
                        "invoice_number": "",
                        "invoice_date": datetime.now().isoformat()[:10],
                        "supplier_name": "",
                        "supplier_gstin": "",
                        "supplier_address": "",
                        "drug_license": "",
                        "subtotal": 0,
                        "tax_amount": 0,
                        "discount_amount": 0,
                        "grand_total": 0,
                        "items": []
                    }
                }
                
            result = parser.parse(pdf_path)
            
            # Add parser info to result
            result["parser_used"] = parser.__class__.__name__
            
            # If no items found and enhanced fallback enabled, try enhanced parser
            if use_enhanced_fallback and (not result.get("success") or not result["extracted_data"]["items"]):
                logger.info("No items found with specific parser, trying enhanced flexible parser...")
                enhanced_parser = EnhancedFlexibleParser()
                enhanced_result = enhanced_parser.parse(pdf_path)
                
                # If enhanced parser found items, use its result
                if enhanced_result.get("success") and enhanced_result["extracted_data"]["items"]:
                    enhanced_result["parser_used"] = "EnhancedFlexibleParser (fallback)"
                    enhanced_result["original_parser_attempted"] = parser.__class__.__name__
                    return enhanced_result
            
            return result
            
        except Exception as e:
            logger.error(f"Error parsing invoice: {e}")
            return {
                "success": False,
                "error": str(e),
                "extracted_data": {
                    "invoice_number": "",
                    "invoice_date": datetime.now().isoformat()[:10],
                    "supplier_name": "",
                    "supplier_gstin": "",
                    "supplier_address": "",
                    "drug_license": "",
                    "subtotal": 0,
                    "tax_amount": 0,
                    "discount_amount": 0,
                    "grand_total": 0,
                    "items": []
                }
            }

    @staticmethod
    def create_parser(vendor_name: str):
        """Create parser for specific vendor - backward compatibility"""
        if not PARSERS_AVAILABLE:
            return None
            
        vendor_upper = vendor_name.upper() if vendor_name else ""
        
        if "ARPII" in vendor_upper:
            return ArpiiHealthCareParser()
        elif "PHARMA BIO" in vendor_upper:
            return PharmaBiologicalParser()
        elif "POLESTAR" in vendor_upper:
            return PolestarParser()
        else:
            return GenericPharmaParser()