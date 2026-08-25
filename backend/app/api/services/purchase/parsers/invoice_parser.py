"""
Unified Invoice Parser
Modern, production-ready PDF invoice parser for pharmaceutical purchases
"""
from __future__ import annotations

from pathlib import Path
from typing import List, Dict, Optional, Tuple, Any
from decimal import Decimal
from datetime import datetime, date, timedelta
import re
import logging
import time

import pdfplumber

from .schemas import (
    ParseResult, ParsedInvoice, ParsedItem, 
    ParserConfidence, ParserDefaults
)

logger = logging.getLogger(__name__)


class ParserError(Exception):
    """Custom exception for parser errors"""
    pass


class InvoiceParser:
    """
    Production-ready PDF invoice parser using pattern recognition.
    
    Features:
    - Flexible pattern matching for various invoice formats
    - Smart column detection for table parsing
    - Confidence scoring for parsed results
    - Proper error handling with detailed logging
    
    Usage:
        parser = InvoiceParser()
        result = parser.parse("/path/to/invoice.pdf")
        if result.success:
            print(f"Found {len(result.extracted_data.items)} items")
    """
    
    # Pattern definitions with scores
    COMPANY_PATTERNS = [
        (r'\b(pharma|medical|healthcare|surgical|drug|medicine)\b', 10),
        (r'\b(enterprises|corporation|pvt|ltd|limited|llp)\b', 8),
        (r'\b(distributors?|suppliers?|traders?)\b', 6),
    ]
    
    INVOICE_PATTERNS = [
        (r'invoice\s*(?:no\.?|number|#)?\s*[:=]?\s*(\S+)', 10),
        (r'bill\s*(?:no\.?|number|#)?\s*[:=]?\s*(\S+)', 9),
        (r'(?:inv|bil)\s*[:=]?\s*(\S+)', 7),
    ]
    
    DATE_PATTERNS = [
        (r'(\d{1,2}[-/\.]\d{1,2}[-/\.]\d{4})', ['%d-%m-%Y', '%d/%m/%Y', '%d.%m.%Y']),
        (r'(\d{4}[-/\.]\d{1,2}[-/\.]\d{1,2})', ['%Y-%m-%d', '%Y/%m/%d']),
        (r'(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4})', ['%d %b %Y', '%d %B %Y']),
    ]
    
    GSTIN_PATTERN = r'\b\d{2}[A-Z]{5}\d{4}[A-Z]\d[A-Z]\d\b'
    
    ITEM_KEYWORDS = ['item', 'product', 'description', 'medicine', 'drug', 'particulars']
    QUANTITY_KEYWORDS = ['qty', 'quantity', 'nos', 'pack']
    PRICE_KEYWORDS = ['rate', 'price', 'mrp', 'amount', 'value', 'total']
    
    def __init__(self) -> None:
        self._text = ""
        self._tables: List[List[List[Any]]] = []
        self._result: Optional[ParseResult] = None
    
    def parse(self, pdf_path: str | Path) -> ParseResult:
        """
        Parse a PDF invoice and extract structured data.
        
        Args:
            pdf_path: Path to the PDF file
            
        Returns:
            ParseResult with extracted data and confidence score
            
        Raises:
            ParserError: If file not found or invalid PDF
        """
        start_time = time.time()
        pdf_path = Path(pdf_path)
        
        # Initialize result
        self._result = ParseResult()
        
        # Validate file
        if not pdf_path.exists():
            self._result.errors.append(f"File not found: {pdf_path}")
            return self._result
        
        if not pdf_path.suffix.lower() == '.pdf':
            self._result.errors.append(f"Not a PDF file: {pdf_path}")
            return self._result
        
        try:
            self._extract_pdf_content(pdf_path)
            self._parse_header()
            self._parse_items()
            self._parse_totals()
            
            # Calculate confidence and finalize
            self._result.calculate_confidence()
            self._result.processing_time_ms = int((time.time() - start_time) * 1000)
            
            logger.info(
                f"Parsed {pdf_path.name}: {len(self._result.extracted_data.items)} items, "
                f"confidence={self._result.confidence_score:.2f}"
            )
            
        except Exception as e:
            logger.exception(f"Error parsing {pdf_path}: {e}")
            self._result.errors.append(str(e))
            self._result.success = False
        
        return self._result
    
    def _extract_pdf_content(self, pdf_path: Path) -> None:
        """Extract text and tables from PDF"""
        self._text = ""
        self._tables = []
        
        try:
            with pdfplumber.open(pdf_path) as pdf:
                self._result.pages_processed = len(pdf.pages)
                
                for page in pdf.pages:
                    # Extract text
                    page_text = page.extract_text()
                    if page_text:
                        self._text += page_text + "\n"
                    
                    # Extract tables
                    page_tables = page.extract_tables()
                    if page_tables:
                        self._tables.extend(page_tables)
                        
        except Exception as e:
            raise ParserError(f"Failed to read PDF: {e}")
    
    def _parse_header(self) -> None:
        """Extract header information"""
        data = self._result.extracted_data
        lines = self._text.split('\n')
        
        # Find supplier name
        company_scores: List[Tuple[int, int, str]] = []
        for i, line in enumerate(lines[:ParserDefaults.MAX_HEADER_LINES]):
            if not line.strip() or len(line.strip()) < 3:
                continue
            score = self._score_company_name(line)
            if score > 0:
                company_scores.append((score, i, line.strip()))
        
        if company_scores:
            company_scores.sort(reverse=True)
            _, line_idx, company_name = company_scores[0]
            data.supplier_name = company_name
            
            # Get address from nearby lines
            address_lines = []
            for j in range(line_idx + 1, min(line_idx + 4, len(lines))):
                line = lines[j].strip()
                if line and not self._is_header_field(line):
                    address_lines.append(line)
                elif self._is_header_field(line):
                    break
            if address_lines:
                data.supplier_address = ", ".join(address_lines)
        
        # Extract invoice number
        data.invoice_number = self._extract_by_patterns(self.INVOICE_PATTERNS)
        
        # Extract date
        data.invoice_date = self._extract_date()
        
        # Extract GSTIN
        gstin_match = re.search(self.GSTIN_PATTERN, self._text)
        if gstin_match:
            data.supplier_gstin = gstin_match.group()
        
        # Extract drug license
        dl_patterns = [
            r'(?:Drug|D\.L\.?)\s*(?:Lic\.?|License)\s*(?:No\.?)?\s*[:=]?\s*([^\n]+)',
            r'DL\s*[:=]?\s*([^\n]+)'
        ]
        for pattern in dl_patterns:
            match = re.search(pattern, self._text, re.IGNORECASE)
            if match:
                data.drug_license = match.group(1).strip()[:50]
                break
    
    def _parse_items(self) -> None:
        """Extract line items from tables"""
        if not self._tables:
            self._result.warnings.append("No tables found in PDF")
            return
        
        for table in self._tables:
            if self._looks_like_item_table(table):
                self._extract_items_from_table(table)
    
    def _parse_totals(self) -> None:
        """Extract totals from text"""
        data = self._result.extracted_data
        
        # Grand total patterns
        total_patterns = [
            r'grand\s*total\s*[:=]?\s*([\d,]+\.?\d*)',
            r'net\s*amount\s*[:=]?\s*([\d,]+\.?\d*)',
            r'total\s*amount\s*[:=]?\s*([\d,]+\.?\d*)',
        ]
        
        for pattern in total_patterns:
            match = re.search(pattern, self._text, re.IGNORECASE)
            if match:
                data.grand_total = self._parse_amount(match.group(1))
                break
        
        # Tax patterns
        tax_patterns = [
            r'(?:cgst|sgst|igst)\s*[:=]?\s*([\d,]+\.?\d*)',
            r'tax\s*amount\s*[:=]?\s*([\d,]+\.?\d*)',
        ]
        
        tax_amounts: List[Decimal] = []
        for pattern in tax_patterns:
            for match in re.finditer(pattern, self._text, re.IGNORECASE):
                amount = self._parse_amount(match.group(1))
                if (
                    amount is not None
                    and amount > 0
                    and (data.grand_total is None or amount < data.grand_total)
                ):
                    tax_amounts.append(amount)
        data.tax_amount = sum(tax_amounts, Decimal("0")) if tax_amounts else None
        
        # Calculate subtotal from items if not extracted
        item_amounts = [item.amount for item in data.items]
        if data.items and data.subtotal is None and all(value is not None for value in item_amounts):
            data.subtotal = sum((value for value in item_amounts if value is not None), Decimal("0"))
    
    def _score_company_name(self, line: str) -> int:
        """Score a line for likelihood of being a company name"""
        score = 0
        line_lower = line.lower()
        
        for pattern, points in self.COMPANY_PATTERNS:
            if re.search(pattern, line_lower):
                score += points
        
        if line.istitle() or line.isupper():
            score += 3
        
        if len(line) > 80:
            score -= 5
        if '@' in line or 'www' in line.lower():
            score -= 10
        
        return score
    
    def _is_header_field(self, line: str) -> bool:
        """Check if line is a header field"""
        keywords = ['invoice', 'bill', 'date', 'gstin', 'phone', 'email', 'license']
        return any(kw in line.lower() for kw in keywords)
    
    def _extract_by_patterns(self, patterns: List[Tuple[str, int]]) -> str:
        """Extract field using weighted patterns"""
        matches: List[Tuple[int, str]] = []
        
        for pattern, score in patterns:
            for match in re.finditer(pattern, self._text, re.IGNORECASE | re.MULTILINE):
                if match.groups():
                    matches.append((score, match.group(1)))
        
        if matches:
            matches.sort(reverse=True)
            return matches[0][1]
        return ""
    
    def _extract_date(self) -> Optional[date]:
        """Extract invoice date"""
        for pattern, formats in self.DATE_PATTERNS:
            match = re.search(rf'(?:invoice|bill)\s*date\s*[:=]?\s*{pattern}', 
                            self._text, re.IGNORECASE)
            if match:
                date_str = match.group(1)
                for fmt in formats:
                    try:
                        return datetime.strptime(date_str.strip(), fmt).date()
                    except ValueError:
                        continue
        return None
    
    def _looks_like_item_table(self, table: List[List[Any]]) -> bool:
        """Determine if table contains items"""
        if not table or len(table) < 2:
            return False
        
        first_rows_text = " ".join(
            str(cell) for row in table[:3] for cell in row if cell
        ).lower()
        
        has_item_keyword = any(kw in first_rows_text for kw in self.ITEM_KEYWORDS)
        has_qty_keyword = any(kw in first_rows_text for kw in self.QUANTITY_KEYWORDS)
        has_price_keyword = any(kw in first_rows_text for kw in self.PRICE_KEYWORDS)
        
        return has_item_keyword and (has_qty_keyword or has_price_keyword)
    
    def _extract_items_from_table(self, table: List[List[Any]]) -> None:
        """Extract items from table"""
        col_map = self._identify_columns(table)
        header_row = self._find_header_row(table)
        
        for row_idx in range(header_row + 1, min(len(table), ParserDefaults.MAX_TABLE_ROWS)):
            row = table[row_idx]
            if self._is_data_row(row, col_map):
                item = self._extract_item(row, col_map)
                if item:
                    self._result.extracted_data.items.append(item)
    
    def _identify_columns(self, table: List[List[Any]]) -> Dict[str, int]:
        """Identify column types"""
        col_map = {
            'product': -1, 'hsn': -1, 'batch': -1, 'expiry': -1,
            'quantity': -1, 'rate': -1, 'mrp': -1, 'amount': -1
        }
        
        # Check first few rows for headers
        for row in table[:3]:
            for i, cell in enumerate(row):
                if not cell:
                    continue
                cell_lower = str(cell).lower()
                
                if any(x in cell_lower for x in ['product', 'description', 'item', 'medicine']):
                    col_map['product'] = i
                elif 'hsn' in cell_lower:
                    col_map['hsn'] = i
                elif any(x in cell_lower for x in ['batch', 'b.no']):
                    col_map['batch'] = i
                elif any(x in cell_lower for x in ['exp', 'expiry']):
                    col_map['expiry'] = i
                elif any(x in cell_lower for x in ['qty', 'quantity']):
                    col_map['quantity'] = i
                elif any(x in cell_lower for x in ['rate', 'price']) and 'mrp' not in cell_lower:
                    col_map['rate'] = i
                elif 'mrp' in cell_lower:
                    col_map['mrp'] = i
                elif any(x in cell_lower for x in ['amount', 'total', 'value']):
                    col_map['amount'] = i
        
        return col_map
    
    def _find_header_row(self, table: List[List[Any]]) -> int:
        """Find the header row index"""
        header_keywords = ['s.no', 'sr.no', 'item', 'product', 'qty', 'rate', 'batch']
        
        for i, row in enumerate(table[:5]):
            row_text = " ".join(str(cell) for cell in row if cell).lower()
            if sum(1 for kw in header_keywords if kw in row_text) >= 2:
                return i
        return 0
    
    def _is_data_row(self, row: List[Any], col_map: Dict[str, int]) -> bool:
        """Check if row contains item data"""
        if not row or len([c for c in row if c]) < 2:
            return False
        
        # Check for product column
        if col_map['product'] >= 0 and col_map['product'] < len(row):
            cell = row[col_map['product']]
            if cell and len(str(cell)) > 3:
                skip_words = ['total', 'grand', 'cgst', 'sgst', 'igst']
                if not any(sw in str(cell).lower() for sw in skip_words):
                    return True
        
        return False
    
    def _extract_item(self, row: List[Any], col_map: Dict[str, int]) -> Optional[ParsedItem]:
        """Extract single item from row"""
        def get_cell(col: str) -> str:
            idx = col_map.get(col, -1)
            if idx >= 0 and idx < len(row) and row[idx]:
                return str(row[idx]).strip()
            return ""
        
        product_name = get_cell('product')
        if not product_name:
            return None
        
        try:
            parsed_quantity = self._parse_amount(get_cell('quantity'))
            quantity = int(parsed_quantity) if parsed_quantity is not None else None
        except (ValueError, TypeError):
            quantity = None
        
        return ParsedItem(
            product_name=product_name,
            hsn_code=get_cell('hsn'),
            batch_number=get_cell('batch'),
            expiry_date=self._parse_expiry(get_cell('expiry')),
            quantity=quantity,
            mrp=self._parse_amount(get_cell('mrp')),
            cost_price=self._parse_amount(get_cell('rate')),
            amount=self._parse_amount(get_cell('amount'))
        )
    
    def _parse_amount(self, value: str) -> Optional[Decimal]:
        """Parse amount string to Decimal"""
        if not value:
            return None
        try:
            cleaned = value.replace(',', '').replace('₹', '').strip()
            return Decimal(cleaned)
        except Exception:
            return None
    
    def _parse_expiry(self, value: str) -> Optional[date]:
        """Parse expiry date"""
        if not value:
            return None
        
        # Handle MM/YY format
        match = re.match(r'(\d{1,2})/(\d{2,4})', value.strip())
        if match:
            month, year = int(match.group(1)), int(match.group(2))
            if year < 100:
                year += 2000
            if 1 <= month <= 12:
                try:
                    if month == 12:
                        return date(year + 1, 1, 1) - timedelta(days=1)
                    return date(year, month + 1, 1) - timedelta(days=1)
                except ValueError:
                    pass
        return None
