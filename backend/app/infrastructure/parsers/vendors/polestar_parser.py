"""
Parser for POLESTAR POWER INDUSTRIES invoices
"""
import re
from typing import List, Dict, Any
import logging
from ..base_parser import BaseInvoiceParser

logger = logging.getLogger(__name__)

class PolestarParser(BaseInvoiceParser):
    """
    Handles POLESTAR POWER INDUSTRIES (PHARMA DIVISION) invoices
    - Performa Invoice format
    - Different date format (DD/MM/YYYY)
    """
    
    def extract_header_info(self):
        """Extract header information"""
        data = self.result["extracted_data"]
        
        # Company name
        if "POLESTAR POWER INDUSTRIES" in self.text:
            data["supplier_name"] = "POLESTAR POWER INDUSTRIES (PHARMA DIVISION)"
            
            # Address extraction
            lines = self.text.split('\n')
            for i, line in enumerate(lines):
                if "POLESTAR POWER INDUSTRIES" in line:
                    # Next few lines contain address
                    address_parts = []
                    for j in range(i + 2, min(i + 5, len(lines))):
                        if lines[j].strip() and "Drug Lic" not in lines[j]:
                            address_parts.append(lines[j].strip())
                    
                    if address_parts:
                        data["supplier_address"] = ", ".join(address_parts)
                    break
        
        # Invoice number
        invoice_match = re.search(r'Invoice\s+No\.\s*:\s*(\d+)', self.text)
        if invoice_match:
            data["invoice_number"] = invoice_match.group(1)
        
        # Invoice date - format: DD/MM/YYYY
        date_match = re.search(r'Invoice\s+Date\s*:\s*(\d{1,2}/\d{1,2}/\d{4})', self.text)
        if date_match:
            data["invoice_date"] = self._parse_date(date_match.group(1))
        
        # GSTIN - might be in party details
        gstin_match = re.search(r'GSTIN\s+No\.\s*:\s*(\w+)', self.text)
        if gstin_match:
            data["supplier_gstin"] = gstin_match.group(1)
        
        # Drug License
        drug_match = re.search(r'Drug\s+Lic\.\s+No\.\s*:\s*([^\n]+)', self.text)
        if drug_match:
            data["drug_license"] = drug_match.group(1).strip()
    
    def extract_items(self):
        """Extract items from Polestar format"""
        data = self.result["extracted_data"]
        
        if not self.tables:
            return
        
        # Find items table
        items_table = None
        header_row_idx = -1
        
        for table in self.tables:
            if not table:
                continue
            
            # Look for header with Sr.No, Description of Goods, etc.
            for i, row in enumerate(table):
                if row and any(cell and ("Description" in str(cell) or 
                                       "Sr.No" in str(cell) or
                                       "Product" in str(cell)) for cell in row):
                    items_table = table
                    header_row_idx = i
                    break
            
            if items_table:
                break
        
        if not items_table or header_row_idx < 0:
            return
        
        # Process rows
        for row_idx in range(header_row_idx + 1, len(items_table)):
            row = items_table[row_idx]
            
            if not row:
                continue
            
            # Check if it's a valid item row
            if len(row) > 0 and str(row[0]).strip().isdigit():
                self._parse_item_row(row, data["items"])
    
    def _parse_item_row(self, row: List, items_list: List[Dict]):
        """Parse item row from Polestar format"""
        item = {
            "product_name": "",
            "hsn_code": "",
            "batch_number": "",
            "expiry_date": "",
            "quantity": 0,
            "unit": "strip",
            "cost_price": 0,
            "mrp": 0,
            "discount_percent": 0,
            "tax_percent": 12,
            "amount": 0
        }
        
        # Column mapping (adjust based on actual format observed)
        # Typical: Sr.No, Description, HSN, Qty, Unit, Rate, Amount
        
        if len(row) > 1 and row[1]:
            # Product description might include additional info
            desc = str(row[1]).strip()
            # Extract product name (before any batch/exp info)
            item["product_name"] = desc.split('\n')[0] if '\n' in desc else desc
        
        # Look for HSN code
        for i in range(2, min(len(row), 4)):
            cell = str(row[i]).strip()
            if cell and len(cell) >= 4 and cell.isdigit():
                item["hsn_code"] = cell
                break
        
        # Extract quantity, rate, amount from remaining columns
        numeric_values = []
        for i in range(2, len(row)):
            try:
                val = self._parse_amount(str(row[i]))
                if val > 0:
                    numeric_values.append((i, val))
            except:
                pass
        
        # Identify columns by value patterns
        for idx, val in numeric_values:
            if val < 1000 and item["quantity"] == 0:  # Likely quantity
                item["quantity"] = int(val)
            elif val < 10000 and item["cost_price"] == 0:  # Likely rate
                item["cost_price"] = val
            elif val > item["quantity"] * item["cost_price"] * 0.8:  # Likely amount
                item["amount"] = val
        
        # Try to extract batch/expiry from description or other cells
        full_text = " ".join(str(cell) for cell in row)
        
        # Batch pattern
        batch_match = re.search(r'(?:Batch|B\.No\.?)\s*[:=]?\s*(\w+)', full_text, re.IGNORECASE)
        if batch_match:
            item["batch_number"] = batch_match.group(1)
        
        # Expiry pattern
        exp_match = re.search(r'(?:Exp|Expiry)\s*[:=]?\s*(\d{1,2}/\d{1,2}/\d{2,4})', full_text, re.IGNORECASE)
        if exp_match:
            item["expiry_date"] = self._parse_expiry(exp_match.group(1))
        
        # Only add valid items
        if item["product_name"] and item["quantity"] > 0:
            items_list.append(item)