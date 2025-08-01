"""
Generic pharmaceutical invoice parser
Fallback parser for unknown formats
"""
import re
from typing import List, Dict, Any, Optional
import logging
from ..base_parser import BaseInvoiceParser

logger = logging.getLogger(__name__)

class GenericPharmaParser(BaseInvoiceParser):
    """
    Generic parser that uses common patterns found in pharmaceutical invoices
    """
    
    def extract_header_info(self):
        """Extract header using common patterns"""
        data = self.result["extracted_data"]
        lines = self.text.split('\n')
        
        # Try to find company name (usually in first few lines)
        for i, line in enumerate(lines[:10]):
            if (line.strip() and 
                not any(skip in line.lower() for skip in ['invoice', 'bill', 'receipt', 'original']) and
                len(line.strip()) > 5):
                
                # Check if it looks like a company name
                if any(keyword in line.upper() for keyword in 
                      ['PHARMA', 'MEDICAL', 'HEALTHCARE', 'SURGICAL', 'ENTERPRISES', 
                       'CORPORATION', 'PVT', 'LTD', 'LIMITED']):
                    data["supplier_name"] = line.strip()
                    
                    # Get next non-empty line as address
                    for j in range(i + 1, min(i + 5, len(lines))):
                        if lines[j].strip():
                            data["supplier_address"] = lines[j].strip()
                            break
                    break
        
        # Invoice number patterns
        invoice_patterns = [
            r'Invoice\s*(?:No\.?|Number)\s*[:=]\s*(\w+)',
            r'Bill\s*(?:No\.?|Number)\s*[:=]\s*(\w+)',
            r'(?:Invoice|Bill)\s*[:=]\s*(\w+)',
            r'No\.\s*[:=]\s*(\w+)'
        ]
        
        for pattern in invoice_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                data["invoice_number"] = match.group(1)
                break
        
        # Date patterns
        date_patterns = [
            r'(?:Invoice|Bill)\s*Date\s*[:=]\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})',
            r'Date\s*[:=]\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})',
            r'Dated?\s*[:=]\s*(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{2,4})'
        ]
        
        for pattern in date_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                parsed_date = self._parse_date(match.group(1))
                if parsed_date:
                    data["invoice_date"] = parsed_date
                    break
        
        # GSTIN
        gstin_match = re.search(r'(?:GSTIN|GST\s*No\.?)\s*[:=]\s*(\w{15})', self.text, re.IGNORECASE)
        if gstin_match:
            data["supplier_gstin"] = gstin_match.group(1)
        
        # Drug License
        drug_patterns = [
            r'(?:Drug|D\.L\.?)\s*(?:Lic\.?|License)\s*(?:No\.?|Number)?\s*[:=]\s*([^\n]+)',
            r'License\s*No\.?\s*[:=]\s*([^\n]+)',
            r'DL\s*[:=]\s*([^\n]+)'
        ]
        
        for pattern in drug_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                data["drug_license"] = match.group(1).strip()
                break
    
    def extract_items(self):
        """Extract items using generic table parsing"""
        data = self.result["extracted_data"]
        
        if not self.tables:
            return
        
        # Try each table
        for table in self.tables:
            if self._process_table(table, data["items"]):
                break
    
    def _process_table(self, table: List, items_list: List[Dict]) -> bool:
        """Process a table and return True if items were found"""
        if not table or len(table) < 2:
            return False
        
        # Find header row
        header_idx = -1
        item_keywords = ['item', 'product', 'description', 'medicine', 'drug', 'particulars']
        
        for i, row in enumerate(table[:5]):  # Check first 5 rows
            if row and any(str(cell).lower() for cell in row):
                row_text = " ".join(str(cell).lower() for cell in row if cell)
                if any(keyword in row_text for keyword in item_keywords):
                    header_idx = i
                    break
        
        if header_idx < 0:
            return False
        
        # Identify column indices
        header_row = table[header_idx]
        col_map = self._identify_columns(header_row)
        
        # Process data rows
        items_before = len(items_list)
        
        for row_idx in range(header_idx + 1, len(table)):
            row = table[row_idx]
            if self._is_data_row(row):
                item = self._extract_item_from_row(row, col_map)
                if item and item["product_name"] and item["quantity"] > 0:
                    items_list.append(item)
        
        return len(items_list) > items_before
    
    def _identify_columns(self, header_row: List) -> Dict[str, int]:
        """Identify which column contains what data"""
        col_map = {
            'serial': -1,
            'product': -1,
            'hsn': -1,
            'batch': -1,
            'expiry': -1,
            'quantity': -1,
            'rate': -1,
            'mrp': -1,
            'amount': -1
        }
        
        for i, cell in enumerate(header_row):
            if not cell:
                continue
                
            cell_lower = str(cell).lower()
            
            if any(x in cell_lower for x in ['s.no', 'sr.no', 'sl.no', 'serial']):
                col_map['serial'] = i
            elif any(x in cell_lower for x in ['product', 'description', 'item', 'medicine', 'particulars']):
                col_map['product'] = i
            elif 'hsn' in cell_lower:
                col_map['hsn'] = i
            elif any(x in cell_lower for x in ['batch', 'b.no']):
                col_map['batch'] = i
            elif any(x in cell_lower for x in ['exp', 'expiry']):
                col_map['expiry'] = i
            elif any(x in cell_lower for x in ['qty', 'quantity', 'nos']):
                col_map['quantity'] = i
            elif any(x in cell_lower for x in ['rate', 'price']):
                col_map['rate'] = i
            elif 'mrp' in cell_lower:
                col_map['mrp'] = i
            elif any(x in cell_lower for x in ['amount', 'total', 'value']):
                col_map['amount'] = i
        
        return col_map
    
    def _is_data_row(self, row: List) -> bool:
        """Check if row contains item data"""
        if not row or len(row) < 2:
            return False
        
        # Check if first cell is a number (serial)
        if str(row[0]).strip().isdigit():
            return True
        
        # Check if row has product-like content
        has_text = any(cell and len(str(cell).strip()) > 3 for cell in row[:3])
        has_numbers = any(self._is_numeric(cell) for cell in row[3:])
        
        return has_text and has_numbers
    
    def _is_numeric(self, value: Any) -> bool:
        """Check if value is numeric"""
        try:
            float(str(value).replace(',', ''))
            return True
        except:
            return False
    
    def _extract_item_from_row(self, row: List, col_map: Dict[str, int]) -> Optional[Dict]:
        """Extract item data from row using column map"""
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
        
        # Extract based on identified columns
        if col_map['product'] >= 0 and col_map['product'] < len(row):
            item["product_name"] = str(row[col_map['product']]).strip()
        
        if col_map['hsn'] >= 0 and col_map['hsn'] < len(row):
            item["hsn_code"] = str(row[col_map['hsn']]).strip()
        
        if col_map['batch'] >= 0 and col_map['batch'] < len(row):
            item["batch_number"] = str(row[col_map['batch']]).strip()
        
        if col_map['expiry'] >= 0 and col_map['expiry'] < len(row):
            item["expiry_date"] = self._parse_expiry(str(row[col_map['expiry']]))
        
        # Numeric fields
        if col_map['quantity'] >= 0 and col_map['quantity'] < len(row):
            try:
                item["quantity"] = int(self._parse_amount(str(row[col_map['quantity']])))
            except:
                pass
        
        if col_map['rate'] >= 0 and col_map['rate'] < len(row):
            item["cost_price"] = self._parse_amount(str(row[col_map['rate']]))
        
        if col_map['mrp'] >= 0 and col_map['mrp'] < len(row):
            item["mrp"] = self._parse_amount(str(row[col_map['mrp']]))
        
        if col_map['amount'] >= 0 and col_map['amount'] < len(row):
            item["amount"] = self._parse_amount(str(row[col_map['amount']]))
        
        # If no product name found in designated column, try other columns
        if not item["product_name"]:
            for i, cell in enumerate(row):
                if cell and len(str(cell)) > 5 and not self._is_numeric(cell):
                    item["product_name"] = str(cell).strip()
                    break
        
        return item if item["product_name"] else None