"""
Factory for selecting appropriate invoice parser
"""
import pdfplumber
import logging
from typing import Dict, Any, Optional
from .base_parser import BaseInvoiceParser
from .parsers import (
    ArpiiHealthCareParser,
    PharmaBiologicalParser,
    PolestarParser,
    GenericPharmaParser
)
from .enhanced_parser import EnhancedFlexibleParser

logger = logging.getLogger(__name__)

class InvoiceParserFactory:
    """
    Factory class to select the appropriate parser based on invoice content
    """
    
    @staticmethod
    def get_parser(pdf_path: str) -> BaseInvoiceParser:
        """
        Analyze PDF and return appropriate parser
        """
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
            return GenericPharmaParser()
    
    @staticmethod
    def parse_invoice(pdf_path: str, use_enhanced_fallback: bool = True) -> Dict[str, Any]:
        """
        Parse invoice using appropriate parser
        """
        try:
            parser = InvoiceParserFactory.get_parser(pdf_path)
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
                    "invoice_date": "",
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