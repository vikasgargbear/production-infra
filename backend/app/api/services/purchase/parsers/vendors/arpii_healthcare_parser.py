"""
Parser for ARPII HEALTH CARE invoices
"""
import re
from typing import List, Dict, Any
import logging
from ..base_parser import BaseInvoiceParser

logger = logging.getLogger(__name__)

class ArpiiHealthCareParser(BaseInvoiceParser):
    """
    Handles ARPII HEALTH CARE invoice format
    - Multi-line cells in tables
    - Products grouped in single cells
    """
    
    def extract_header_info(self):
        """Extract header information specific to Arpii format"""
        data = self.result["extracted_data"]
        
        # Supplier name - usually first line
        if "ARPII HEALTH CARE" in self.text:
            data["supplier_name"] = "ARPII HEALTH CARE"
            
            # Get address
            lines = self.text.split('\n')
            for i, line in enumerate(lines):
                if "ARPII HEALTH CARE" in line:
                    if i + 1 < len(lines):
                        data["supplier_address"] = lines[i + 1].strip()
                    break
        
        # Invoice number
        invoice_match = re.search(r'Invoice\s+No\s*:\s*(\w+)', self.text)
        if invoice_match:
            data["invoice_number"] = invoice_match.group(1)
        
        # Invoice date
        date_match = re.search(r'Invoice\s+Date\s*:\s*(\d{2}-\d{2}-\d{4})', self.text)
        if date_match:
            data["invoice_date"] = self._parse_date(date_match.group(1))
        
        # GSTIN
        gstin_match = re.search(r'GSTIN\s+No\.\s*:\s*(\w+)', self.text)
        if gstin_match:
            data["supplier_gstin"] = gstin_match.group(1)
        
        # Drug License
        dl_match = re.search(r'D\.L\.\s*No\.\s*:\s*([^\n]+)', self.text)
        if dl_match:
            data["drug_license"] = dl_match.group(1).strip()
    
    def extract_items(self):
        """Extract items from Arpii's multi-line cell format"""
        data = self.result["extracted_data"]
        
        if not self.tables:
            return
        
        # Find the main items table
        items_table = None
        header_row_idx = -1
        
        for table in self.tables:
            if not table:
                continue
                
            # Look for header row with "Item Name", "Batch No.", etc.
            for i, row in enumerate(table):
                if row and any(cell and "Item Name" in str(cell) for cell in row):
                    items_table = table
                    header_row_idx = i
                    break
            
            if items_table:
                break
        
        if not items_table or header_row_idx < 0:
            return
        
        # Process rows after header (skip header + 1 for sub-header)
        for row_idx in range(header_row_idx + 2, len(items_table)):
            row = items_table[row_idx]
            
            # Skip summary rows
            if not row or not row[0] or 'Rs.' in str(row[0]):
                continue
            
            # Parse multi-line cells
            self._parse_multi_line_row(row, data["items"])
    
    def _parse_multi_line_row(self, row: List, items_list: List[Dict]):
        """Parse a row with multiple products in single cells"""
        # Extract multi-line data from each column
        item_names = str(row[0]).split('\n') if row[0] else []
        packs = str(row[1]).split('\n') if len(row) > 1 and row[1] else []
        mfgs = str(row[2]).split('\n') if len(row) > 2 and row[2] else []
        hsns = str(row[3]).split('\n') if len(row) > 3 and row[3] else []
        batches = str(row[4]).split('\n') if len(row) > 4 and row[4] else []
        expiries = str(row[6]).split('\n') if len(row) > 6 and row[6] else []
        mrps = str(row[7]).split('\n') if len(row) > 7 and row[7] else []
        quantities = str(row[8]).split('\n') if len(row) > 8 and row[8] else []
        rates = str(row[10]).split('\n') if len(row) > 10 and row[10] else []
        amounts = str(row[11]).split('\n') if len(row) > 11 and row[11] else []
        
        # Process each product
        num_items = max(len(item_names), 1)
        
        for i in range(num_items):
            # Skip if no product name
            if i >= len(item_names) or not item_names[i].strip():
                continue
            
            # Skip non-product lines
            product_name = item_names[i].strip()
            if len(product_name) < 3 or any(skip in product_name.lower() for skip in 
                ['bank', 'gst', 'ifsc', 'terms', 'condition', 'bill']):
                continue
            
            item = {
                "product_name": product_name,
                "hsn_code": hsns[i].strip() if i < len(hsns) else "",
                "batch_number": batches[i].strip() if i < len(batches) else "",
                "expiry_date": "",
                "quantity": 0,
                "unit": "strip",
                "cost_price": 0,
                "mrp": 0,
                "discount_percent": 0,
                "tax_percent": 12,
                "amount": 0
            }
            
            # Parse expiry
            if i < len(expiries) and expiries[i]:
                item["expiry_date"] = self._parse_expiry(expiries[i].strip())
            
            # Parse numeric values
            if i < len(quantities) and quantities[i]:
                try:
                    item["quantity"] = int(quantities[i].replace(',', ''))
                except:
                    pass
            
            if i < len(mrps) and mrps[i]:
                item["mrp"] = self._parse_amount(mrps[i])
            
            if i < len(rates) and rates[i]:
                item["cost_price"] = self._parse_amount(rates[i])
            
            if i < len(amounts) and amounts[i]:
                item["amount"] = self._parse_amount(amounts[i])
            
            # Only add if we have quantity and amount
            if item["quantity"] > 0 and item["amount"] > 0:
                items_list.append(item)