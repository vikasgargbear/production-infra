"""
Enhanced flexible parser using AI-like pattern recognition
"""
import re
from typing import List, Dict, Any, Optional, Tuple
import logging
from .base_parser import BaseInvoiceParser

logger = logging.getLogger(__name__)

class EnhancedFlexibleParser(BaseInvoiceParser):
    """
    Ultra-flexible parser that uses pattern recognition and scoring
    instead of rigid rules
    """
    
    def __init__(self):
        super().__init__()
        # Define flexible patterns with scores
        self.patterns = {
            'company_indicators': [
                (r'\b(pharma|medical|healthcare|surgical|drug|medicine)\b', 10),
                (r'\b(enterprises|corporation|pvt|ltd|limited|llp)\b', 8),
                (r'\b(distributors?|suppliers?|traders?)\b', 6),
                (r'\b(company|co\.?|corp\.?)\b', 5),
            ],
            'invoice_patterns': [
                (r'invoice\s*(?:no\.?|number|#)?\s*[:=]?\s*(\S+)', 10),
                (r'bill\s*(?:no\.?|number|#)?\s*[:=]?\s*(\S+)', 9),
                (r'(?:inv|bil)\s*[:=]?\s*(\S+)', 7),
                (r'(?:no\.?|#)\s*[:=]?\s*(\d+)', 5),
            ],
            'product_indicators': [
                (r'tablet|capsule|syrup|injection|cream|ointment|drops', 10),
                (r'mg|ml|gm|kg|units?|vial|bottle|tube|pack', 8),
                (r'strip|box|nos|pcs|pieces', 6),
            ],
            'batch_patterns': [
                (r'^[A-Z]{2,4}[-]?\d{3,6}$', 10),  # XX-12345
                (r'^[A-Z0-9]{4,10}$', 8),          # ABC123
                (r'^\d{6,10}$', 5),                # 123456
            ],
            'quantity_indicators': [
                (r'qty|quantity|nos|pieces|units', 10),
                (r'free|bonus|\+', 5),
            ]
        }
    
    def extract_header_info(self):
        """Extract header with intelligent pattern matching"""
        data = self.result["extracted_data"]
        lines = self.text.split('\n')
        
        # Score each line for being a company name
        company_scores = []
        for i, line in enumerate(lines[:20]):  # Check first 20 lines
            if not line.strip() or len(line.strip()) < 3:
                continue
                
            score = self._score_company_name(line)
            if score > 0:
                company_scores.append((score, i, line.strip()))
        
        # Pick the highest scoring line as company name
        if company_scores:
            company_scores.sort(reverse=True)
            best_score, line_idx, company_name = company_scores[0]
            
            data["supplier_name"] = company_name
            
            # Get address from nearby lines
            address_lines = []
            for j in range(line_idx + 1, min(line_idx + 5, len(lines))):
                line = lines[j].strip()
                if line and not self._is_header_field(line):
                    address_lines.append(line)
                elif self._is_header_field(line):
                    break
            
            if address_lines:
                data["supplier_address"] = ", ".join(address_lines)
        
        # Extract other fields with pattern matching
        self._extract_field_by_patterns(data, "invoice_number", self.patterns['invoice_patterns'])
        
        # Extract dates flexibly
        self._extract_dates(data)
        
        # Extract GSTIN
        gstin_match = re.search(r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d\b', self.text)
        if gstin_match:
            data["supplier_gstin"] = gstin_match.group()
    
    def extract_items(self):
        """Extract items using intelligent table analysis"""
        data = self.result["extracted_data"]
        
        if not self.tables:
            # Try to extract from text if no tables
            self._extract_items_from_text(data)
            return
        
        # Analyze each table
        for table in self.tables:
            if self._looks_like_item_table(table):
                self._extract_from_intelligent_table(table, data["items"])
    
    def _score_company_name(self, line: str) -> int:
        """Score a line for likelihood of being a company name"""
        score = 0
        line_lower = line.lower()
        
        # Check patterns
        for pattern, points in self.patterns['company_indicators']:
            if re.search(pattern, line_lower):
                score += points
        
        # Bonus for being in title case or all caps
        if line.istitle() or line.isupper():
            score += 3
        
        # Penalty for being too long or having special chars
        if len(line) > 100:
            score -= 5
        if line.count('@') > 0 or line.count('www') > 0:
            score -= 10
            
        return score
    
    def _is_header_field(self, line: str) -> bool:
        """Check if line is a header field like Invoice No, Date, etc."""
        header_keywords = ['invoice', 'bill', 'date', 'gstin', 'gst', 'phone', 
                          'email', 'state', 'code', 'license', 'drug']
        line_lower = line.lower()
        return any(keyword in line_lower for keyword in header_keywords)
    
    def _extract_field_by_patterns(self, data: dict, field: str, patterns: List[Tuple[str, int]]):
        """Extract field using weighted patterns"""
        matches = []
        
        for pattern, score in patterns:
            for match in re.finditer(pattern, self.text, re.IGNORECASE | re.MULTILINE):
                if match.groups():
                    matches.append((score, match.group(1)))
        
        if matches:
            # Sort by score and take the best match
            matches.sort(reverse=True)
            data[field] = matches[0][1]
    
    def _extract_dates(self, data: dict):
        """Extract dates flexibly"""
        # Common date patterns
        date_patterns = [
            # DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
            (r'(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{4})', 10),
            # YYYY-MM-DD
            (r'(\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2})', 9),
            # DD MMM YYYY
            (r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})', 8),
            # MM/DD/YYYY (American)
            (r'(\d{1,2}/\d{1,2}/\d{4})', 7),
        ]
        
        # Look for invoice date
        for pattern, score in date_patterns:
            match = re.search(rf'(?:invoice|bill)\s*date\s*[:=]?\s*{pattern}', 
                            self.text, re.IGNORECASE)
            if match:
                parsed_date = self._parse_date(match.group(1))
                if parsed_date:
                    data["invoice_date"] = parsed_date
                    break
    
    def _looks_like_item_table(self, table: List[List]) -> bool:
        """Determine if a table contains items using heuristics"""
        if not table or len(table) < 2:
            return False
        
        # Check for product-related headers
        header_score = 0
        first_rows_text = " ".join(str(cell) for row in table[:3] for cell in row if cell)
        first_rows_lower = first_rows_text.lower()
        
        item_keywords = ['item', 'product', 'description', 'medicine', 'drug', 
                        'particular', 'goods', 'article']
        quantity_keywords = ['qty', 'quantity', 'nos', 'pack']
        price_keywords = ['rate', 'price', 'mrp', 'amount', 'value', 'total']
        
        for keyword in item_keywords:
            if keyword in first_rows_lower:
                header_score += 10
        
        for keyword in quantity_keywords:
            if keyword in first_rows_lower:
                header_score += 5
                
        for keyword in price_keywords:
            if keyword in first_rows_lower:
                header_score += 5
        
        return header_score >= 10
    
    def _extract_from_intelligent_table(self, table: List[List], items_list: List[Dict]):
        """Extract items using intelligent column detection"""
        # First, identify what each column likely contains
        column_types = self._identify_column_types(table)
        
        # Then extract items based on identified columns
        header_rows = self._find_header_rows(table)
        
        for row_idx in range(max(header_rows) + 1, len(table)):
            row = table[row_idx]
            
            # Skip if row doesn't look like item data
            if not self._is_item_row(row, column_types):
                continue
            
            # Extract item based on column types
            item = self._extract_item_from_typed_row(row, column_types)
            if item and item.get("product_name"):
                items_list.append(item)
    
    def _identify_column_types(self, table: List[List]) -> Dict[int, str]:
        """Identify what each column contains"""
        column_types = {}
        num_cols = max(len(row) for row in table)
        
        for col_idx in range(num_cols):
            col_data = []
            for row in table:
                if col_idx < len(row) and row[col_idx]:
                    col_data.append(str(row[col_idx]))
            
            if col_data:
                column_types[col_idx] = self._guess_column_type(col_data)
        
        return column_types
    
    def _guess_column_type(self, col_data: List[str]) -> str:
        """Guess what type of data a column contains"""
        # Join all data for analysis
        combined = " ".join(col_data).lower()
        
        # Check for specific patterns
        if any(re.match(r'^\d+\.?$', cell) for cell in col_data[:10]):
            return 'serial'
        
        # Product names usually have more text
        avg_length = sum(len(cell) for cell in col_data) / len(col_data)
        if avg_length > 15 and any(word in combined for word in ['tablet', 'capsule', 'syrup']):
            return 'product'
        
        # Check for batch patterns
        batch_matches = sum(1 for cell in col_data 
                           if any(re.match(pattern, cell.strip()) 
                                 for pattern, _ in self.patterns['batch_patterns']))
        if batch_matches > len(col_data) * 0.3:
            return 'batch'
        
        # Check for dates
        date_matches = sum(1 for cell in col_data if re.search(r'\d+/\d+', cell))
        if date_matches > len(col_data) * 0.3:
            return 'expiry'
        
        # Check for quantities
        if any(keyword in combined for keyword in ['qty', 'quantity', 'nos']):
            return 'quantity'
        
        # Check for prices
        numeric_values = []
        for cell in col_data:
            try:
                val = float(cell.replace(',', '').replace('₹', '').strip())
                numeric_values.append(val)
            except:
                pass
        
        if numeric_values:
            avg_value = sum(numeric_values) / len(numeric_values)
            if avg_value > 100:
                return 'price'
            elif avg_value < 100:
                return 'quantity'
        
        # Check column headers
        if any(word in combined for word in ['hsn', 'sac', 'code']):
            return 'hsn'
        
        return 'unknown'
    
    def _find_header_rows(self, table: List[List]) -> List[int]:
        """Find rows that are likely headers"""
        header_rows = []
        
        for i, row in enumerate(table[:5]):  # Check first 5 rows
            row_text = " ".join(str(cell) for cell in row if cell).lower()
            
            # Count header keywords
            header_keywords = ['s.no', 'sr.no', 'item', 'product', 'description', 
                             'qty', 'quantity', 'rate', 'price', 'amount', 'batch', 'exp']
            
            keyword_count = sum(1 for keyword in header_keywords if keyword in row_text)
            
            if keyword_count >= 2:
                header_rows.append(i)
        
        return header_rows if header_rows else [0]
    
    def _is_item_row(self, row: List, column_types: Dict[int, str]) -> bool:
        """Check if row contains item data"""
        if not row or len([cell for cell in row if cell]) < 2:
            return False
        
        # Check if it has a product name
        product_cols = [idx for idx, typ in column_types.items() if typ == 'product']
        if product_cols:
            for col_idx in product_cols:
                if col_idx < len(row) and row[col_idx]:
                    product = str(row[col_idx]).strip()
                    if len(product) > 3 and not any(skip in product.lower() 
                                                   for skip in ['total', 'grand', 'amount', 'cgst', 'sgst']):
                        return True
        
        # Fallback: check if row has both text and numbers
        has_text = any(cell and not str(cell).replace('.', '').isdigit() for cell in row[:5])
        has_numbers = any(self._is_numeric(cell) for cell in row)
        
        return has_text and has_numbers
    
    def _extract_item_from_typed_row(self, row: List, column_types: Dict[int, str]) -> Optional[Dict]:
        """Extract item based on identified column types"""
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
        
        # Map column types to item fields
        for col_idx, col_type in column_types.items():
            if col_idx >= len(row) or not row[col_idx]:
                continue
            
            cell_value = str(row[col_idx]).strip()
            
            if col_type == 'product' and not item["product_name"]:
                item["product_name"] = cell_value
            
            elif col_type == 'hsn' and not item["hsn_code"]:
                item["hsn_code"] = cell_value
            
            elif col_type == 'batch' and not item["batch_number"]:
                item["batch_number"] = cell_value
            
            elif col_type == 'expiry' and not item["expiry_date"]:
                item["expiry_date"] = self._parse_expiry(cell_value)
            
            elif col_type == 'quantity':
                try:
                    item["quantity"] = int(self._parse_amount(cell_value))
                except:
                    pass
            
            elif col_type == 'price':
                value = self._parse_amount(cell_value)
                if value > 0:
                    # Guess if it's MRP or cost based on magnitude
                    if value > 1000:
                        item["mrp"] = value
                    else:
                        item["cost_price"] = value
        
        # If no product name found, try to find it in any text column
        if not item["product_name"]:
            for col_idx, cell in enumerate(row):
                if cell and len(str(cell)) > 5:
                    text = str(cell).strip()
                    # Check if it looks like a product name
                    if (not self._is_numeric(text) and 
                        not any(skip in text.lower() for skip in ['total', 'cgst', 'sgst'])):
                        item["product_name"] = text
                        break
        
        return item if item["product_name"] else None
    
    def _extract_items_from_text(self, data: dict):
        """Extract items from unstructured text when no tables found"""
        # This would use NLP-like techniques to find product mentions
        # For now, using pattern matching
        
        lines = self.text.split('\n')
        
        for line in lines:
            # Look for lines that might be products
            if self._looks_like_product_line(line):
                item = self._parse_product_line(line)
                if item:
                    data["items"].append(item)
    
    def _looks_like_product_line(self, line: str) -> bool:
        """Check if a line might contain product information"""
        line_lower = line.lower()
        
        # Must have some length
        if len(line.strip()) < 10:
            return False
        
        # Check for product indicators
        has_product_indicator = any(re.search(pattern, line_lower) 
                                   for pattern, _ in self.patterns['product_indicators'])
        
        # Check for numbers (quantity/price)
        has_numbers = bool(re.search(r'\d+', line))
        
        # Avoid header/footer lines
        skip_words = ['total', 'grand', 'subtotal', 'tax', 'cgst', 'sgst', 
                     'discount', 'invoice', 'bill', 'customer', 'address']
        has_skip_words = any(word in line_lower for word in skip_words)
        
        return has_product_indicator and has_numbers and not has_skip_words
    
    def _parse_product_line(self, line: str) -> Optional[Dict]:
        """Try to parse product information from a text line"""
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
        
        # Extract product name (usually at the beginning)
        # Remove common prefixes
        cleaned_line = re.sub(r'^\d+[\.\s]+', '', line)  # Remove serial numbers
        
        # Try to find where numbers start
        first_number_match = re.search(r'\d+', cleaned_line)
        if first_number_match:
            product_part = cleaned_line[:first_number_match.start()].strip()
            number_part = cleaned_line[first_number_match.start():].strip()
            
            if product_part:
                item["product_name"] = product_part
            
            # Extract numbers
            numbers = re.findall(r'\d+(?:\.\d+)?', number_part)
            if numbers:
                # Heuristics for number assignment
                for num_str in numbers:
                    num = float(num_str)
                    
                    if 1 <= num <= 9999 and item["quantity"] == 0:
                        item["quantity"] = int(num)
                    elif num > 100 and item["mrp"] == 0:
                        item["mrp"] = num
                    elif num < 100 and item["cost_price"] == 0:
                        item["cost_price"] = num
        
        return item if item["product_name"] and item["quantity"] > 0 else None
    
    def extract_totals(self):
        """Extract totals using pattern recognition"""
        data = self.result["extracted_data"]
        
        # Look for total patterns
        total_patterns = [
            (r'grand\s*total\s*[:=]?\s*([\d,]+\.?\d*)', 10),
            (r'net\s*amount\s*[:=]?\s*([\d,]+\.?\d*)', 9),
            (r'total\s*amount\s*[:=]?\s*([\d,]+\.?\d*)', 8),
            (r'total\s*[:=]?\s*([\d,]+\.?\d*)', 7),
        ]
        
        # Extract grand total
        for pattern, score in total_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                try:
                    data["grand_total"] = self._parse_amount(match.group(1))
                    break
                except:
                    pass
        
        # Extract tax
        tax_patterns = [
            (r'(?:cgst|sgst|igst|gst)\s*[:=]?\s*([\d,]+\.?\d*)', 8),
            (r'tax\s*amount\s*[:=]?\s*([\d,]+\.?\d*)', 7),
            (r'tax\s*[:=]?\s*([\d,]+\.?\d*)', 6),
        ]
        
        for pattern, score in tax_patterns:
            match = re.search(pattern, self.text, re.IGNORECASE)
            if match:
                try:
                    data["tax_amount"] = self._parse_amount(match.group(1))
                    break
                except:
                    pass
        
        # If we have items, calculate totals
        if data["items"]:
            calculated_total = sum(item["amount"] for item in data["items"])
            if not data.get("grand_total") or data["grand_total"] == 0:
                data["grand_total"] = calculated_total