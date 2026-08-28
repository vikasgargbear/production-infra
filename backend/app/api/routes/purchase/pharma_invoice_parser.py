"""
Custom pharmaceutical invoice parser for better extraction
"""
import pdfplumber
import re
from datetime import datetime, timedelta
from decimal import Decimal
from typing import List, Dict, Any, Optional
import logging

from ....core.money import money_json

logger = logging.getLogger(__name__)

def parse_pharma_invoice(pdf_path: str) -> Dict[str, Any]:
    """
    Parse pharmaceutical invoices with custom logic
    """
    try:
        with pdfplumber.open(pdf_path) as pdf:
            # Extract from first page
            page = pdf.pages[0]
            text = page.extract_text()
            tables = page.extract_tables()
            
            # Initialize result
            result = {
                "success": True,
                "extracted_data": {
                    "invoice_number": "",
                    "invoice_date": None,
                    "supplier_name": "",
                    "supplier_gstin": "",
                    "supplier_address": "",
                    "drug_license": "",
                    "subtotal": None,
                    "tax_amount": None,
                    "discount_amount": None,
                    "grand_total": None,
                    "items": []
                },
                "confidence_score": 0.8,
                "manual_review_required": True
            }
            
            # Extract header information using regex
            invoice_match = re.search(r'Invoice No\.?\s*:?\s*([A-Z0-9\-]+)', text, re.IGNORECASE)
            if invoice_match:
                result["extracted_data"]["invoice_number"] = invoice_match.group(1)
            
            # Try multiple date formats
            date_match = re.search(r'Date\s*:\s*(\d{2}-\d{2}-\d{4})', text)
            if date_match:
                try:
                    date_obj = datetime.strptime(date_match.group(1), '%d-%m-%Y')
                    result["extracted_data"]["invoice_date"] = date_obj.strftime('%Y-%m-%d')
                except:
                    pass
            
            gstin_match = re.search(r'GSTIN\s*:?\s*([A-Z0-9]+)', text, re.IGNORECASE)
            if gstin_match:
                result["extracted_data"]["supplier_gstin"] = gstin_match.group(1)
            
            dl_match = re.search(r'D\.?L\.?\s*No\.?\s*:\s*([^\n]+)', text)
            if dl_match:
                dl_value = dl_match.group(1).strip()
                if dl_value and dl_value != ':':
                    result["extracted_data"]["drug_license"] = dl_value
            
            # Extract supplier name from header - look for company name pattern
            lines = text.split('\n')
            for i, line in enumerate(lines[:15]):  # Check first 15 lines
                # Look for lines with company indicators
                if line.strip() and ('HEALTH' in line.upper() or 'PHARMA' in line.upper() or 
                                   'MEDICAL' in line.upper() or 'SURGICAL' in line.upper()):
                    # This is likely the supplier name
                    supplier_name = line.strip()
                    # Remove extra text like invoice numbers
                    supplier_name = re.sub(r'Invoice No\.?\s*:?\s*[A-Z0-9\-]+', '', supplier_name, flags=re.IGNORECASE)
                    supplier_name = supplier_name.replace('Original for Buyer', '').strip()
                    if supplier_name and 'GST INVOICE' not in supplier_name:
                        result["extracted_data"]["supplier_name"] = supplier_name
                        # Get address from next non-empty lines
                        address_parts = []
                        for j in range(i + 1, min(i + 5, len(lines))):
                            line_text = lines[j].strip()
                            if line_text and not any(skip in line_text for skip in ['Phone', 'GST INVOICE', 'Date', 'GSTIN', 'Invoice', 'Reverse Charge', 'FSSAI', 'STATE', 'TEL', 'Email', 'PAN NO']):
                                # Clean up the line
                                line_text = re.sub(r'Reverse Charge.*', '', line_text).strip()
                                if line_text:
                                    address_parts.append(line_text)
                        if address_parts:
                            result["extracted_data"]["supplier_address"] = ', '.join(address_parts)
                        break
            
            # Extract items from table
            if tables and len(tables) > 0:
                table = tables[0]
                
                # Find header row - look for both "Item Name" and "Item Description"
                header_row_idx = -1
                for i, row in enumerate(table):
                    if row and any(cell and ('Item Name' in str(cell) or 'Item Description' in str(cell)) for cell in row):
                        header_row_idx = i
                        break
                
                if header_row_idx >= 0:
                    # Process items (start from next row after header)
                    for row_idx in range(header_row_idx + 1, len(table)):
                        row = table[row_idx]
                        
                        # Skip summary rows
                        if not row or not row[0] or 'Rs.' in str(row[0]) or 'CLASS' in str(row[0]) or 'Term' in str(row[0]):
                            continue
                        
                        try:
                            # Parse the complex multi-line cell structure
                            # Columns: S.No(0), CODE(1), Item Description(2), Hsn(3), PKG(4), Qty(5), Batch(7), Exp(8), MRP(9), RATE(11), AMOUNT(17)
                            item_names = str(row[2]).split('\n') if len(row) > 2 and row[2] else []
                            hsns = str(row[3]).split('\n') if len(row) > 3 and row[3] else []
                            packs = str(row[4]).split('\n') if len(row) > 4 and row[4] else []
                            quantities = str(row[5]).split('\n') if len(row) > 5 and row[5] else []
                            batches = str(row[7]).split('\n') if len(row) > 7 and row[7] else []
                            expiries = str(row[8]).split('\n') if len(row) > 8 and row[8] else []
                            mrps = str(row[9]).split('\n') if len(row) > 9 and row[9] else []
                            rates = str(row[11]).split('\n') if len(row) > 11 and row[11] else []
                            amounts = str(row[17]).split('\n') if len(row) > 17 and row[17] else []
                            
                            # Process each product in the multi-line cell
                            for i in range(len(item_names)):
                                if not item_names[i] or len(item_names[i]) < 3:
                                    continue
                                
                                item = {
                                    "product_name": item_names[i].strip(),
                                    "hsn_code": hsns[i].strip() if i < len(hsns) else "",
                                    "batch_number": batches[i].strip() if i < len(batches) else "",
                                    "expiry_date": "",
                                    "quantity": None,
                                    "unit": None,
                                    "cost_price": None,
                                    "mrp": None,
                                    "discount_percent": None,
                                    "tax_percent": None,
                                    "amount": None,
                                }
                            
                                # Parse expiry date for this item
                                if i < len(expiries) and expiries[i]:
                                    exp_str = expiries[i].strip()
                                    # Handle format like "11/26" or "1/26" (month/year)
                                    exp_match = re.search(r'(\d+)/(\d+)', exp_str)
                                    if exp_match:
                                        month = int(exp_match.group(1))
                                        year = int(exp_match.group(2))
                                        # Convert 2-digit year to 4-digit
                                        if year < 100:
                                            year += 2000
                                        # Use last day of month
                                        try:
                                            exp_date = datetime(year, month, 1) + timedelta(days=32)
                                            exp_date = exp_date.replace(day=1) - timedelta(days=1)
                                            item["expiry_date"] = exp_date.strftime('%Y-%m-%d')
                                        except:
                                            pass
                                
                                # Parse numeric values for this item
                                if i < len(mrps) and mrps[i]:
                                    try:
                                        item["mrp"] = Decimal(mrps[i].replace(',', ''))
                                    except:
                                        pass
                                
                                if i < len(quantities) and quantities[i]:
                                    try:
                                        item["quantity"] = int(quantities[i].replace(',', ''))
                                    except:
                                        pass
                                
                                if i < len(rates) and rates[i]:
                                    try:
                                        item["cost_price"] = Decimal(rates[i].replace(',', ''))
                                    except:
                                        pass
                                
                                if i < len(amounts) and amounts[i]:
                                    try:
                                        item["amount"] = Decimal(amounts[i].replace(',', ''))
                                    except:
                                        pass
                                
                                # Only add if we have a valid product item (not footer text)
                                if (item["product_name"] and 
                                    len(item["product_name"]) > 2 and
                                    item["quantity"] is not None and item["quantity"] > 0 and
                                    item["amount"] is not None and item["amount"] > 0 and
                                    not any(keyword in item["product_name"].lower() for keyword in 
                                           ['bank', 'gst', 'ifsc', 'terms', 'condition', 'dispute', 
                                            'tax declaration', 'ack.', 'a/c no', 'bill'])): 
                                    result["extracted_data"]["items"].append(item)
                        
                        except Exception as e:
                            logger.warning(f"Error parsing row {row_idx}: {e}")
                            continue
            
            # Extract totals
            grand_total_match = re.search(r'Grand Total\s+(\d+(?:\.\d+)?)', text)
            if grand_total_match:
                result["extracted_data"]["grand_total"] = Decimal(grand_total_match.group(1))
            
            # Calculate subtotal from items
            if result["extracted_data"]["items"]:
                result["extracted_data"]["subtotal"] = sum(
                    item.get("amount", 0) for item in result["extracted_data"]["items"]
                )
            
            # Extract tax amounts - look for both percentage and amount patterns
            cgst_amount = None
            sgst_amount = None
            
            # Look for tax amounts in format "C.G.S.T. 6.0 452.94"
            cgst_matches = re.findall(r'C\.?G\.?S\.?T\.?\s*\d+\.?\d*\s+(\d+(?:\.\d+)?)', text)
            if cgst_matches:
                cgst_amount = sum((Decimal(x) for x in cgst_matches), Decimal("0"))
            
            sgst_matches = re.findall(r'S\.?G\.?S\.?T\.?\s*\d+\.?\d*\s+(\d+(?:\.\d+)?)', text)
            if sgst_matches:
                sgst_amount = sum((Decimal(x) for x in sgst_matches), Decimal("0"))
            
            if cgst_amount is not None or sgst_amount is not None:
                result["extracted_data"]["tax_amount"] = (
                    (cgst_amount or Decimal("0")) + (sgst_amount or Decimal("0"))
                )

            for item in result["extracted_data"]["items"]:
                for field in ("cost_price", "mrp", "amount"):
                    if item.get(field) is not None:
                        item[field] = money_json(item[field])
            for field in ("subtotal", "tax_amount", "discount_amount", "grand_total"):
                if result["extracted_data"].get(field) is not None:
                    result["extracted_data"][field] = money_json(
                        result["extracted_data"][field]
                    )
            
            return result
    
    except Exception as e:
        logger.error(f"Error parsing pharmaceutical invoice: {e}")
        return {
            "success": False,
            "message": "Failed to parse invoice. Please enter details manually.",
            "extracted_data": {
                "invoice_number": "",
                "invoice_date": None,
                "supplier_name": "",
                "supplier_gstin": "",
                "supplier_address": "",
                "drug_license": "",
                "subtotal": None,
                "tax_amount": None,
                "discount_amount": None,
                "grand_total": None,
                "items": []
            },
            "confidence_score": 0,
            "manual_review_required": True,
            "error": str(e)
        }
