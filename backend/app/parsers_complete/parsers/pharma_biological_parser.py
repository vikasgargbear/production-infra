"""
Parser for PHARMA BIO LOGICAL invoices
"""
import re
from typing import List, Dict, Any
import logging
from ..base_parser import BaseInvoiceParser

logger = logging.getLogger(__name__)

class PharmaBiologicalParser(BaseInvoiceParser):
    """
    Handles PHARMA BIO LOGICAL invoice format
    - Standard table format
    - Clear product rows
    """
    
    def extract_header_info(self):
        """Extract header information"""
        data = self.result["extracted_data"]
        
        # Supplier name
        if "PHARMA BIO LOGICAL" in self.text:
            data["supplier_name"] = "PHARMA BIO LOGICAL"
            
            # Get address - multi-line after company name
            lines = self.text.split('\n')
            address_parts = []
            capture = False
            
            for line in lines:
                if "PHARMA BIO LOGICAL" in line:
                    capture = True
                    continue
                if capture and "GSTIN" in line:
                    break
                if capture and line.strip():
                    address_parts.append(line.strip())
            
            if address_parts:
                data["supplier_address"] = ", ".join(address_parts[:3])  # First 3 lines
        
        # Invoice number - format: PB-000561
        invoice_match = re.search(r'Invoice\s+No\.\s*:\s*([A-Z\-0-9]+)', self.text)
        if invoice_match:
            data["invoice_number"] = invoice_match.group(1)
        
        # Date
        date_match = re.search(r'Date\s*:\s*(\d{2}-\d{2}-\d{4})', self.text)
        if date_match:
            data["invoice_date"] = self._parse_date(date_match.group(1))
        
        # GSTIN
        gstin_match = re.search(r'GSTIN\s*:\s*(\w+)', self.text)
        if gstin_match:
            data["supplier_gstin"] = gstin_match.group(1)
        
        # FSSAI number (food safety license)
        fssai_match = re.search(r'FSSAI\s+No\.\s*:\s*(\d+)', self.text)
        if fssai_match:
            data["drug_license"] = f"FSSAI: {fssai_match.group(1)}"
    
    def extract_items(self):
        """Extract items from standard table format"""
        data = self.result["extracted_data"]
        
        if not self.tables:
            return
        
        # Find the items table
        items_table = None
        header_row_idx = -1
        
        for table in self.tables:
            if not table:
                continue
            
            # Look for header with S.No, Product Description, etc.
            for i, row in enumerate(table):
                if row and any(cell and ("Product Description" in str(cell) or 
                                       "S.No" in str(cell)) for cell in row):
                    items_table = table
                    header_row_idx = i
                    break
            
            if items_table:
                break
        
        if not items_table or header_row_idx < 0:
            return
        
        # Process item rows
        for row_idx in range(header_row_idx + 1, len(items_table)):
            row = items_table[row_idx]
            
            if not row or len(row) < 5:
                continue
            
            # Skip summary rows - check first part of serial column
            serial = str(row[0]).strip() if row[0] else ""
            # Handle multi-line serial numbers like "1.\n1."
            serial_parts = serial.split('\n')
            first_part = serial_parts[0].strip('.') if serial_parts else ""
            
            # Check if it starts with a digit
            if not first_part or not any(c.isdigit() for c in first_part):
                continue
            
            self._parse_item_row(row, data["items"])
    
    def _parse_item_row(self, row: List, items_list: List[Dict]):
        """Parse a standard item row"""
        try:
            # Skip if row is too short
            if len(row) < 5:
                return
                
            # Handle multi-line cells (product info might be split with \n)
            serial_col = str(row[0]).strip() if row[0] else ""
            
            # Check if it's a valid item row
            if not any(c.isdigit() for c in serial_col.split('\n')[0]):
                return
            
            # Parse multi-line cells based on actual structure
            # Col 2: Item Description, Col 3: HSN, Col 5: Qty+Free
            # Col 7: Batch, Col 8: Exp, Col 9: MRP, Col 11: Rate, Col 17: Amount
            
            descriptions = str(row[2]).split('\n') if row[2] else []
            hsns = str(row[3]).split('\n') if row[3] else []
            
            # Clean descriptions - remove MFG DATE lines and extra info
            clean_descriptions = []
            for desc in descriptions:
                if desc and not any(skip in desc.upper() for skip in ['MFG DATE', 'ADD FREIGHT']):
                    clean_descriptions.append(desc.strip())
            
            # Sometimes multiple products are in one row
            num_items = max(len(clean_descriptions), 1)
            
            for i in range(num_items):
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
                    "tax_percent": 18,  # Default 18% GST
                    "amount": 0
                }
                
                # Extract product name
                if i < len(clean_descriptions) and clean_descriptions[i]:
                    item["product_name"] = clean_descriptions[i]
                
                # Extract HSN
                if i < len(hsns) and hsns[i]:
                    item["hsn_code"] = hsns[i].strip()
                
                # Quantity from column 5
                if len(row) > 5 and row[5]:
                    qty_str = str(row[5]).strip()
                    # Handle multi-line quantities
                    qty_lines = qty_str.split('\n')
                    if i < len(qty_lines):
                        # Extract first number from the line
                        qty_match = re.search(r'(\d+)', qty_lines[i])
                        if qty_match:
                            item["quantity"] = int(qty_match.group(1))
                
                # Batch from column 7
                if len(row) > 7 and row[7]:
                    batch_str = str(row[7]).strip()
                    batch_lines = batch_str.split('\n') if '\n' in batch_str else [batch_str]
                    if i < len(batch_lines) and batch_lines[i]:
                        item["batch_number"] = batch_lines[i].strip()
                
                # Expiry from column 8
                if len(row) > 8 and row[8]:
                    exp_str = str(row[8]).strip()
                    exp_lines = exp_str.split('\n') if '\n' in exp_str else [exp_str]
                    if i < len(exp_lines) and exp_lines[i]:
                        item["expiry_date"] = self._parse_expiry(exp_lines[i])
                
                # MRP from column 9
                if len(row) > 9 and row[9]:
                    mrp_str = str(row[9]).strip()
                    mrp_lines = mrp_str.split('\n') if '\n' in mrp_str else [mrp_str]
                    if i < len(mrp_lines):
                        mrp_match = re.search(r'(\d+(?:\.\d+)?)', mrp_lines[i])
                        if mrp_match:
                            item["mrp"] = self._parse_amount(mrp_match.group(1))
                
                # Rate/Cost price from column 11
                if len(row) > 11 and row[11]:
                    rate_str = str(row[11]).strip()
                    rate_lines = rate_str.split('\n') if '\n' in rate_str else [rate_str]
                    if i < len(rate_lines):
                        rate_match = re.search(r'(\d+(?:\.\d+)?)', rate_lines[i])
                        if rate_match:
                            item["cost_price"] = self._parse_amount(rate_match.group(1))
                
                # Amount from column 17
                if len(row) > 17 and row[17]:
                    amt_str = str(row[17]).strip()
                    amt_lines = amt_str.split('\n') if '\n' in amt_str else [amt_str]
                    if i < len(amt_lines):
                        amt_match = re.search(r'(\d+(?:\.\d+)?)', amt_lines[i])
                        if amt_match:
                            item["amount"] = self._parse_amount(amt_match.group(1))
                
                # Extract tax percentage from columns 14-16 (CGST/SGST/IGST)
                tax_percent = 0
                for col_idx in [14, 15, 16]:  # CGST, SGST, IGST columns
                    if len(row) > col_idx and row[col_idx]:
                        tax_str = str(row[col_idx]).strip()
                        tax_match = re.search(r'(\d+(?:\.\d+)?)', tax_str)
                        if tax_match:
                            tax_val = float(tax_match.group(1))
                            if tax_val > 0:
                                tax_percent += tax_val
                
                if tax_percent > 0:
                    item["tax_percent"] = tax_percent
                
                # Only add if we have valid data
                if item["product_name"] and len(item["product_name"]) > 3:
                    # Set default quantity if missing
                    if item["quantity"] == 0:
                        item["quantity"] = 1
                    items_list.append(item)
                    
        except Exception as e:
            logger.warning(f"Error parsing item row: {e}")