"""
Base invoice parser class
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
import pdfplumber
import re
from datetime import datetime, timedelta
import logging

logger = logging.getLogger(__name__)

class BaseInvoiceParser(ABC):
    """
    Abstract base class for invoice parsers
    """
    
    def __init__(self):
        self.text = ""
        self.tables = []
        self.result = self._get_empty_result()
    
    def _get_empty_result(self) -> Dict[str, Any]:
        """Get empty result template"""
        return {
            "success": False,
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
            },
            "confidence_score": 0.5,
            "manual_review_required": True
        }
    
    def parse(self, pdf_path: str) -> Dict[str, Any]:
        """Main parsing method"""
        try:
            with pdfplumber.open(pdf_path) as pdf:
                # Extract text and tables from all pages
                self.text = ""
                self.tables = []
                
                for page in pdf.pages:
                    page_text = page.extract_text()
                    if page_text:
                        self.text += page_text + "\n"
                    
                    page_tables = page.extract_tables()
                    if page_tables:
                        self.tables.extend(page_tables)
                
                # Call specific parser methods
                self.extract_header_info()
                self.extract_items()
                self.extract_totals()
                self.calculate_tax()
                
                # Mark as successful if we found key data
                if (self.result["extracted_data"]["supplier_name"] and 
                    len(self.result["extracted_data"]["items"]) > 0):
                    self.result["success"] = True
                    self.result["confidence_score"] = 0.8
                
                return self.result
                
        except Exception as e:
            logger.error(f"Error parsing invoice: {e}")
            self.result["success"] = False
            self.result["error"] = str(e)
            return self.result
    
    @abstractmethod
    def extract_header_info(self):
        """Extract supplier info, invoice number, date etc."""
        pass
    
    @abstractmethod
    def extract_items(self):
        """Extract line items from invoice"""
        pass
    
    def extract_totals(self):
        """Extract totals - common implementation"""
        data = self.result["extracted_data"]
        
        # Grand total patterns
        total_patterns = [
            r'Grand\s+Total.*?(\d+(?:,\d+)*(?:\.\d+)?)',
            r'Total.*?(\d+(?:,\d+)*(?:\.\d+)?)\s*$',
            r'Net\s+Amount.*?(\d+(?:,\d+)*(?:\.\d+)?)',
            r'Bill\s+Amount.*?(\d+(?:,\d+)*(?:\.\d+)?)'
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE | re.MULTILINE)
            if match:
                data["grand_total"] = self._parse_amount(match.group(1))
                break
        
        # Calculate subtotal from items if not found
        if data["items"] and data["subtotal"] == 0:
            data["subtotal"] = sum(item.get("amount", 0) for item in data["items"])
    
    def calculate_tax(self):
        """Calculate tax from CGST/SGST/IGST"""
        data = self.result["extracted_data"]
        
        # Tax patterns
        tax_patterns = [
            (r'CGST.*?(\d+(?:,\d+)*(?:\.\d+)?)', 'cgst'),
            (r'SGST.*?(\d+(?:,\d+)*(?:\.\d+)?)', 'sgst'),
            (r'IGST.*?(\d+(?:,\d+)*(?:\.\d+)?)', 'igst'),
            (r'GST.*?(\d+(?:,\d+)*(?:\.\d+)?)', 'gst')
        ]
        
        total_tax = 0
        for pattern, tax_type in tax_patterns:
            matches = re.findall(pattern, self.text, re.IGNORECASE)
            for match in matches:
                amount = self._parse_amount(match)
                if amount > 0 and amount < data["grand_total"]:  # Sanity check
                    total_tax += amount
        
        data["tax_amount"] = total_tax
    
    def _parse_amount(self, amount_str: str) -> float:
        """Parse amount string to float"""
        try:
            # Remove commas and convert
            cleaned = amount_str.replace(',', '').strip()
            return float(cleaned)
        except:
            return 0
    
    def _parse_date(self, date_str: str) -> Optional[str]:
        """Parse various date formats"""
        if not date_str:
            return None
            
        # Common date formats
        formats = [
            '%d-%m-%Y',
            '%d/%m/%Y',
            '%d.%m.%Y',
            '%d-%m-%y',
            '%d/%m/%y',
            '%Y-%m-%d',
            '%d %b %Y',
            '%d %B %Y'
        ]
        
        for fmt in formats:
            try:
                date_obj = datetime.strptime(date_str.strip(), fmt)
                return date_obj.strftime('%Y-%m-%d')
            except:
                continue
        
        return None
    
    def _parse_expiry(self, expiry_str: str) -> Optional[str]:
        """Parse expiry date in various formats"""
        if not expiry_str:
            return None
        
        # Handle MM/YY format
        match = re.match(r'(\d{1,2})/(\d{2,4})', expiry_str.strip())
        if match:
            month = int(match.group(1))
            year = int(match.group(2))
            
            # Handle 2-digit year
            if year < 100:
                year += 2000
            
            # Validate month
            if 1 <= month <= 12:
                # Use last day of month
                try:
                    exp_date = datetime(year, month, 1) + timedelta(days=32)
                    exp_date = exp_date.replace(day=1) - timedelta(days=1)
                    return exp_date.strftime('%Y-%m-%d')
                except:
                    pass
        
        # Try standard date parsing
        return self._parse_date(expiry_str)