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
        lines = self.text.split('\n')
        
        # Supplier name - usually first line
        if "ARPII HEALTH CARE" in self.text:
            data["supplier_name"] = "ARPII HEALTH CARE"
            
            # Get supplier address - lines immediately after company name (not from bottom)
            for i, line in enumerate(lines):
                if "ARPII HEALTH CARE" in line:
                    # Get next 3-4 lines as address, skip empty lines
                    address_parts = []
                    for j in range(i + 1, min(i + 5, len(lines))):
                        if lines[j].strip() and not any(skip in lines[j].upper() for skip in ['PHONE', 'GST', 'INVOICE', 'TO:', 'GSTIN']):
                            address_parts.append(lines[j].strip())
                    if address_parts:
                        data["supplier_address"] = ', '.join(address_parts)
                    break
        
        # Invoice number
        invoice_match = re.search(r'Invoice\s+No\s*\.?\s*:\s*([A-Z0-9\-]+)', self.text)
        if invoice_match:
            data["invoice_number"] = invoice_match.group(1)
        
        # Invoice date
        date_match = re.search(r'Invoice\s+Date\s*:\s*(\d{2}-\d{2}-\d{4})', self.text)
        if date_match:
            data["invoice_date"] = self._parse_date(date_match.group(1))
        
        # Extract SUPPLIER's GSTIN and DL - they appear in the BOTTOM section, not top
        # The top section has OUR company info, bottom has supplier's
        supplier_gstin_found = False
        supplier_dl_found = False
        
        # Look through all lines, but prefer later occurrences (supplier's info)
        gstin_candidates = []
        dl_candidates = []
        
        for i, line in enumerate(lines):
            # Collect all GSTIN occurrences
            if 'GSTIN' in line and ':' in line:
                gstin_match = re.search(r'GSTIN\s*:?\s*([A-Z0-9]+)', line)
                if gstin_match:
                    gstin_candidates.append((i, gstin_match.group(1)))
            
            # Collect all DL occurrences  
            if 'D.L.' in line and 'No.' in line:
                dl_match = re.search(r'D\.L\.\s*No\.\s*:\s*([A-Z0-9\/\-]+)', line)
                if dl_match:
                    dl_candidates.append((i, dl_match.group(1).strip()))
        
        # Take the LAST occurrence (supplier's info is at bottom)
        if gstin_candidates:
            data["supplier_gstin"] = gstin_candidates[-1][1]
        
        if dl_candidates:
            data["drug_license"] = dl_candidates[-1][1]
        
        # Extract phone numbers
        phone_numbers = self._extract_phone_numbers(lines)
        if phone_numbers:
            data["phone"] = phone_numbers[0]  # Primary phone
            if len(phone_numbers) > 1:
                data["phone_secondary"] = phone_numbers[1]  # Secondary phone
        
        # Extract supplier bank information
        bank_info = self._extract_bank_info(lines)
        if bank_info:
            data["supplier_bank_info"] = bank_info
        
        # Extract financial totals
        self._extract_totals(lines)
    
    def _extract_bank_info(self, lines):
        """Extract supplier bank information"""
        bank_info = {}
        
        for i, line in enumerate(lines):
            if 'BANK' in line.upper() and 'DETAIL' in line.upper():
                # Look for bank details in next few lines
                for j in range(i + 1, min(i + 5, len(lines))):
                    line_text = lines[j].strip()
                    
                    # Bank name (like CANARA BANK)
                    if any(bank in line_text.upper() for bank in ['CANARA', 'SBI', 'HDFC', 'ICICI', 'AXIS', 'BANK']):
                        if 'A/C' not in line_text and 'IFSC' not in line_text:
                            bank_info["bank_name"] = line_text
                    
                    # Account number
                    acc_match = re.search(r'A/C\s*No\.?\s*:\s*([0-9]+)', line_text)
                    if acc_match:
                        bank_info["account_number"] = acc_match.group(1)
                    
                    # IFSC code
                    ifsc_match = re.search(r'IFSC\s*CODE?\s*:\s*([A-Z0-9]+)', line_text)
                    if ifsc_match:
                        bank_info["ifsc_code"] = ifsc_match.group(1)
                
                break
        
        return bank_info if bank_info else None
    
    def _extract_phone_numbers(self, lines):
        """Extract phone numbers from supplier info"""
        phone_numbers = []
        
        for line in lines[:10]:  # Check first 10 lines for supplier info
            if 'Phone' in line or 'PHONE' in line:
                # Extract phone numbers from line like "Phone : 9649017054,9828506516"
                phones = re.findall(r'[6-9]\d{9}', line)  # Indian mobile pattern
                phone_numbers.extend(phones)
                break
        
        return phone_numbers
    
    def _extract_totals(self, lines):
        """Extract financial totals with correct tax calculation"""
        data = self.result["extracted_data"]
        
        # Look for the totals line with pattern: "base_amount 0.00 base_amount cgst sgst"
        # Like: "Rs. Eight Thousand Four Hundred Fifty Five Only 7549.00 0.00 7549.00 452.94 452.94"
        for i, line in enumerate(lines):
            # Look for line with amounts in format: amount1 amount2 amount3 tax1 tax2
            amounts = re.findall(r'\b(\d+\.\d{2})\b', line)
            if len(amounts) >= 5:
                # Pattern: [base, discount, base_again, cgst, sgst]
                try:
                    base_amount = float(amounts[0])
                    discount = float(amounts[1])
                    cgst = float(amounts[3])
                    sgst = float(amounts[4])
                    
                    data["subtotal"] = base_amount
                    data["discount_amount"] = discount
                    data["tax_amount"] = cgst + sgst  # Total tax
                    break
                except:
                    continue
            
            # Also look for GST 12% line for base amount
            if 'GST 12%' in line and ':' in line:
                gst12_match = re.search(r'GST 12%\s*:\s*([\d,]+\.?\d*)', line)
                if gst12_match:
                    subtotal = float(gst12_match.group(1).replace(',', ''))
                    data["subtotal"] = subtotal
                    # Calculate tax: 12% GST = 6% CGST + 6% SGST
                    data["tax_amount"] = subtotal * 0.12
            
            # Look for grand total
            if 'Grand Total' in line:
                total_match = re.search(r'Grand Total\s+([\d,]+\.?\d*)', line)
                if total_match:
                    data["grand_total"] = float(total_match.group(1).replace(',', ''))
    
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
                "free_quantity": 0,  # For capturing free items
                "pack_size": 1,      # For pack information (1*100 means pack of 100)
                "pack_type": "STRIP", # STRIP, BOX, etc.
                "total_units": 0,    # Total units (quantity * pack_size + free)
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
            
            # Parse pack information from pack column (like 1*100)
            if i < len(packs) and packs[i]:
                pack_text = packs[i].strip()
                # Parse pack format like "1*100" (1 box of 100 units)
                pack_match = re.search(r'(\d+)\*(\d+)', pack_text)
                if pack_match:
                    item["pack_size"] = int(pack_match.group(2))  # 100 units per pack
                    item["pack_type"] = "BOX" if int(pack_match.group(2)) > 10 else "STRIP"
                else:
                    # Try to extract just pack size number
                    pack_num_match = re.search(r'(\d+)', pack_text)
                    if pack_num_match:
                        item["pack_size"] = int(pack_num_match.group(1))
            
            # Parse quantities (may include free quantities)
            if i < len(quantities) and quantities[i]:
                qty_text = quantities[i].strip()
                # Look for patterns like "500+50" (500 regular + 50 free)
                free_match = re.search(r'(\d+)\+(\d+)', qty_text)
                if free_match:
                    item["quantity"] = int(free_match.group(1))
                    item["free_quantity"] = int(free_match.group(2))
                else:
                    # Regular quantity
                    try:
                        item["quantity"] = int(re.sub(r'[^\d]', '', qty_text))
                    except:
                        pass
                
                # Calculate total units
                item["total_units"] = (item["quantity"] * item["pack_size"]) + (item["free_quantity"] * item["pack_size"])
            
            if i < len(mrps) and mrps[i]:
                item["mrp"] = self._parse_amount(mrps[i])
            
            if i < len(rates) and rates[i]:
                item["cost_price"] = self._parse_amount(rates[i])
            
            if i < len(amounts) and amounts[i]:
                item["amount"] = self._parse_amount(amounts[i])
            
            # Only add if we have quantity and amount
            if item["quantity"] > 0 and item["amount"] > 0:
                items_list.append(item)