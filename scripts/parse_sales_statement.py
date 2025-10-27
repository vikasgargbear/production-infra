import pandas as pd
import numpy as np
import re
from datetime import datetime

def parse_sales_statement(excel_path, sheet_name=0):
    """
    Parse sales statement Excel with customer headers and invoice tables.
    
    Returns:
        DataFrame with columns: customer_name, address, mr_name, invoice_no, 
        invoice_date, s_no, description, qty, cash, credit, exp_batch, remark
    """
    # Read Excel file as text
    df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
    
    # Initialize variables
    records = []
    current_customer = None
    current_address = None
    current_mr = None
    current_invoice = None
    current_invoice_date = None
    current_invoice_total = None
    
    # Process each row
    for idx, row in df_raw.iterrows():
        # Convert row to string for pattern matching
        row_text = ' '.join([str(cell) for cell in row if pd.notna(cell)])
        
        # Check for customer NAME
        if 'NAME :' in row_text or 'NAME:' in row_text:
            # Extract customer name
            match = re.search(r'NAME\s*:\s*(.+)', row_text, re.IGNORECASE)
            if match:
                current_customer = match.group(1).strip()
                current_invoice = None  # Reset invoice when new customer starts
        
        # Check for ADDRESS
        elif 'ADDRESS :' in row_text or 'ADDRESS:' in row_text:
            match = re.search(r'ADDRESS\s*:\s*(.+)', row_text, re.IGNORECASE)
            if match:
                current_address = match.group(1).strip()
        
        # Check for M.R.
        elif 'M.R. :' in row_text or 'M.R.:' in row_text:
            match = re.search(r'M\.R\.\s*:\s*(.+)', row_text, re.IGNORECASE)
            if match:
                current_mr = match.group(1).strip()
        
        # Check for invoice row (contains BILL NO like ASPL000084)
        elif pd.notna(row.iloc[0]) and isinstance(row.iloc[0], (int, float)):
            # This is likely a data row
            s_no = row.iloc[0]
            
            # Check if this row has invoice number (new invoice)
            invoice_match = re.search(r'(ASPL?\d+|[A-Z]+\d+)', row_text)
            if invoice_match:
                current_invoice = invoice_match.group(1)
                # Try to extract date
                date_match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})', row_text)
                if date_match:
                    current_invoice_date = date_match.group(1)
                # Extract total amount (credit) if present
                try:
                    # Check last columns for numeric values
                    for col in reversed(range(len(row))):
                        if pd.notna(row.iloc[col]) and isinstance(row.iloc[col], (int, float)):
                            current_invoice_total = row.iloc[col]
                            break
                except:
                    pass
            
            # Extract product description
            description = None
            for col in range(1, min(4, len(row))):
                if pd.notna(row.iloc[col]) and isinstance(row.iloc[col], str):
                    if not re.match(r'\d{2}[-/]\d{2}[-/]\d{4}', str(row.iloc[col])):
                        description = str(row.iloc[col]).strip()
                        break
            
            # Extract quantity (usually after description)
            qty = None
            for col in range(1, len(row)):
                cell = row.iloc[col]
                if pd.notna(cell):
                    # Check if it's a small integer (likely quantity)
                    if isinstance(cell, (int, float)) and 0 < cell < 1000 and cell == int(cell):
                        qty = int(cell)
                        break
            
            # Extract cash, credit, exp_batch
            cash = None
            credit = None
            exp_batch = None
            
            # Look for numeric values in later columns
            numeric_cols = []
            for col in range(len(row)):
                if pd.notna(row.iloc[col]) and isinstance(row.iloc[col], (int, float)):
                    numeric_cols.append((col, row.iloc[col]))
            
            # Typically: credit is large number, exp_batch might be numeric too
            if len(numeric_cols) >= 2:
                # Last or second-to-last large number is likely credit
                for col_idx, val in reversed(numeric_cols):
                    if val > 100:  # Credit amount
                        credit = val
                        break
            
            # Extract exp_batch (could be numeric or text)
            for col in range(len(row)):
                cell = row.iloc[col]
                if pd.notna(cell):
                    cell_str = str(cell)
                    # Batch numbers are often 7-8 digits
                    if re.match(r'^\d{6,8}$', cell_str):
                        exp_batch = cell_str
                        break
            
            # Add record if we have minimum required data
            if current_customer and description:
                records.append({
                    'customer_name': current_customer,
                    'address': current_address,
                    'mr_name': current_mr,
                    'invoice_no': current_invoice,
                    'invoice_date': current_invoice_date,
                    's_no': s_no,
                    'description': description,
                    'qty': qty,
                    'cash': cash,
                    'credit': credit,
                    'exp_batch': exp_batch,
                    'remark': None
                })
    
    # Create DataFrame
    df_result = pd.DataFrame(records)
    
    # Convert date strings to datetime
    if 'invoice_date' in df_result.columns:
        df_result['invoice_date'] = pd.to_datetime(df_result['invoice_date'], format='%d-%m-%Y', errors='coerce')
    
    return df_result


def parse_sales_statement_v2(excel_path, sheet_name=0):
    """
    Enhanced parser with better column detection.
    Uses column positions to extract data more accurately.
    """
    # Read Excel file
    df_raw = pd.read_excel(excel_path, sheet_name=sheet_name, header=None)
    
    records = []
    current_customer = None
    current_address = None
    current_mr = None
    current_invoice = None
    current_invoice_date = None
    
    for idx, row in df_raw.iterrows():
        first_col = str(row.iloc[0]).strip() if pd.notna(row.iloc[0]) else ''
        
        # Check for customer info headers
        if 'NAME' in first_col.upper() and ':' in first_col:
            # Combine all columns to get full name
            name_text = ' '.join([str(cell) for cell in row if pd.notna(cell)])
            match = re.search(r'NAME\s*:\s*(.+?)(?:\s+Unnamed|$)', name_text, re.IGNORECASE)
            if match:
                current_customer = match.group(1).strip()
                current_invoice = None
        
        elif 'ADDRESS' in first_col.upper() and ':' in first_col:
            addr_text = ' '.join([str(cell) for cell in row if pd.notna(cell)])
            match = re.search(r'ADDRESS\s*:\s*(.+?)(?:\s+Unnamed|$)', addr_text, re.IGNORECASE)
            if match:
                current_address = match.group(1).strip()
        
        elif 'M.R.' in first_col.upper() or 'M R' in first_col.upper():
            mr_text = ' '.join([str(cell) for cell in row if pd.notna(cell)])
            match = re.search(r'M\.?R\.?\s*:\s*(.+?)(?:\s+Unnamed|$)', mr_text, re.IGNORECASE)
            if match:
                current_mr = match.group(1).strip()
        
        # Check if this is a data row (s_no is numeric)
        elif pd.notna(row.iloc[0]) and str(row.iloc[0]).replace('.', '', 1).isdigit():
            try:
                s_no = float(row.iloc[0])
            except:
                continue
            
            # Get all row text to find invoice number and date
            row_text = ' '.join([str(cell) for cell in row if pd.notna(cell)])
            
            # Check for invoice number pattern
            invoice_match = re.search(r'(ASP[IL]\d+|[A-Z]{3,4}\d{5,})', row_text)
            date_match = re.search(r'(\d{2}[-/]\d{2}[-/]\d{4})', row_text)
            
            if invoice_match:
                current_invoice = invoice_match.group(1)
            if date_match:
                current_invoice_date = date_match.group(1)
            
            # Extract description (column 1 usually)
            description = None
            if pd.notna(row.iloc[1]) and isinstance(row.iloc[1], str):
                description = row.iloc[1].strip()
            
            # Extract qty (column 2 usually, small integer)
            qty = None
            if len(row) > 2 and pd.notna(row.iloc[2]):
                try:
                    qty_val = float(row.iloc[2])
                    if 0 < qty_val < 1000:
                        qty = int(qty_val)
                except:
                    pass
            
            # Extract credit (usually column 3 or later, larger number)
            credit = None
            cash = None
            exp_batch = None
            
            for col_idx in range(3, len(row)):
                val = row.iloc[col_idx]
                if pd.notna(val):
                    # Check if it's a large number (likely credit/cash)
                    if isinstance(val, (int, float)) and val > 100:
                        if credit is None:
                            credit = val
                        elif cash is None:
                            cash = val
                    # Check if it's batch number (6-8 digits)
                    elif isinstance(val, (int, float)) and 100000 <= val <= 99999999:
                        exp_batch = str(int(val))
                    elif isinstance(val, str) and re.match(r'^\d{6,8}$', val):
                        exp_batch = val
            
            # Add record
            if current_customer and description:
                records.append({
                    'customer_name': current_customer,
                    'address': current_address,
                    'mr_name': current_mr,
                    'invoice_no': current_invoice,
                    'invoice_date': current_invoice_date,
                    's_no': int(s_no) if s_no == int(s_no) else s_no,
                    'description': description,
                    'qty': qty,
                    'cash': cash,
                    'credit': credit,
                    'exp_batch': exp_batch,
                    'remark': None
                })
    
    # Create DataFrame
    df_result = pd.DataFrame(records)
    
    # Convert dates
    if not df_result.empty and 'invoice_date' in df_result.columns:
        df_result['invoice_date'] = pd.to_datetime(
            df_result['invoice_date'], 
            format='%d-%m-%Y', 
            errors='coerce'
        )
    
    return df_result


# Example usage
if __name__ == '__main__':
    # Replace with your Excel file path
    excel_file = 'path/to/your/sales_statement.xlsx'
    
    # Try version 2 parser (recommended)
    df = parse_sales_statement_v2(excel_file)
    
    print(f"Parsed {len(df)} records")
    print(f"\nFirst few rows:")
    print(df.head(20))
    
    print(f"\nDataFrame Info:")
    print(df.info())
    
    print(f"\nUnique customers: {df['customer_name'].nunique()}")
    print(f"Unique invoices: {df['invoice_no'].nunique()}")
    
    # Save to CSV
    output_file = excel_file.replace('.xlsx', '_parsed.csv')
    df.to_csv(output_file, index=False)
    print(f"\nSaved to: {output_file}")
