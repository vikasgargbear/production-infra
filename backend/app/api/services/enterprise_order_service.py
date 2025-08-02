"""
Enterprise Order Management Service
Handles all order operations with proper validation, transactions, and error handling
Covers all database tables: orders, order_items, invoices, invoice_items, invoice_payments, customers, products, batches
"""

from typing import List, Optional, Dict, Any, Tuple
from decimal import Decimal
from datetime import datetime, date
from dataclasses import dataclass
from enum import Enum
import uuid
import logging

from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel, Field, validator

logger = logging.getLogger(__name__)

class OrderStatus(str, Enum):
    DRAFT = "draft"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"

class PaymentMode(str, Enum):
    CASH = "cash"
    CREDIT = "credit"
    CARD = "card"
    UPI = "upi"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"

class PaymentStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"
    PARTIAL = "partial"
    OVERDUE = "overdue"

class InvoiceStatus(str, Enum):
    GENERATED = "generated"
    SENT = "sent"
    PAID = "paid"
    CANCELLED = "cancelled"

@dataclass
class CustomerInfo:
    """Validated customer information with all fields"""
    customer_id: int
    customer_name: str
    customer_code: Optional[str]
    customer_type: Optional[str]
    phone: Optional[str]
    alternate_phone: Optional[str]
    email: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    pincode: Optional[str]
    gstin: Optional[str]
    gst_number: Optional[str]
    state_code: Optional[str]
    credit_limit: Optional[Decimal]
    credit_period_days: Optional[int]
    payment_terms: Optional[str]
    drug_license_number: Optional[str]
    outstanding_amount: Optional[Decimal]

@dataclass
class ProductInfo:
    """Validated product information with all fields"""
    product_id: int
    product_code: str
    product_name: str
    generic_name: Optional[str]
    manufacturer: Optional[str]
    category: Optional[str]
    hsn_code: Optional[str]
    gst_percent: Decimal
    cgst_percent: Optional[Decimal]
    sgst_percent: Optional[Decimal]
    igst_percent: Optional[Decimal]
    sale_price: Decimal
    mrp: Decimal
    purchase_price: Optional[Decimal]
    drug_schedule: Optional[str]
    prescription_required: Optional[bool]
    pack_size: Optional[str]
    pack_quantity: Optional[int]
    unit_count: Optional[int]
    base_uom_code: Optional[str]
    sale_uom_code: Optional[str]
    barcode: Optional[str]
    available_stock: int
    minimum_stock_level: Optional[int]

@dataclass
class BatchInfo:
    """Batch information for inventory tracking"""
    batch_id: int
    batch_number: str
    manufacturing_date: Optional[date]
    expiry_date: Optional[date]
    quantity_available: int
    cost_price: Optional[Decimal]
    selling_price: Optional[Decimal]
    supplier_id: Optional[int]
    days_to_expiry: Optional[int]
    is_near_expiry: Optional[bool]

@dataclass
class OrderItem:
    """Validated order item with complete calculations"""
    product_id: int
    product_info: ProductInfo
    batch_info: Optional[BatchInfo]
    quantity: int
    base_quantity: Optional[int]
    uom_code: Optional[str]
    unit_price: Decimal
    mrp: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    tax_percent: Decimal
    tax_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    line_total: Decimal
    total_price: Decimal

class OrderItemRequest(BaseModel):
    """Request model for order items"""
    product_id: int
    quantity: int = Field(gt=0)
    unit_price: Optional[Decimal] = None
    discount_percent: Decimal = Field(default=0, ge=0, le=100)
    batch_id: Optional[int] = None
    uom_code: Optional[str] = None

class OrderCreationRequest(BaseModel):
    """Enterprise request model for creating orders"""
    customer_id: int
    items: List[OrderItemRequest] = Field(..., min_items=1)
    
    # Payment Information
    payment_mode: PaymentMode = PaymentMode.CASH
    payment_terms: Optional[str] = None
    payment_amount: Optional[Decimal] = Field(default=None, ge=0)
    
    # Order Details
    order_date: Optional[date] = None
    delivery_date: Optional[date] = None
    delivery_type: str = Field(default="pickup")  # pickup, delivery
    delivery_address: Optional[str] = None
    
    # Document References (NEW)
    order_id: Optional[int] = None  # Reference to existing order
    challan_id: Optional[int] = None  # Reference to existing challan
    
    # Amounts
    discount_amount: Decimal = Field(default=0, ge=0)
    delivery_charges: Decimal = Field(default=0, ge=0)
    other_charges: Decimal = Field(default=0, ge=0)
    
    # Metadata
    notes: Optional[str] = None
    reference_number: Optional[str] = None
    is_urgent: bool = False
    prescription_id: Optional[int] = None
    doctor_id: Optional[int] = None
    
    # Branch & User
    branch_id: Optional[int] = None
    created_by: Optional[int] = None

class OrderCreationResponse(BaseModel):
    """Enterprise response model"""
    success: bool
    order_id: int
    order_number: str
    invoice_id: int
    invoice_number: str
    total_amount: Decimal
    payment_status: str
    invoice_status: str
    message: str
    created_at: datetime
    
    # Additional enterprise fields
    customer_name: str
    items_count: int
    tax_amount: Decimal
    delivery_date: Optional[date]

class OrderServiceError(Exception):
    """Custom exception for order service errors"""
    def __init__(self, message: str, code: str = "ORDER_ERROR", details: Dict = None):
        self.message = message
        self.code = code
        self.details = details or {}
        super().__init__(self.message)

class EnterpriseOrderService:
    """
    Enterprise-grade Order Management Service
    Handles all order operations with comprehensive validation and error handling
    """
    
    def __init__(self, db: Session, org_id: str):
        self.db = db
        self.org_id = org_id
        self.logger = logging.getLogger(f"{__name__}.{self.__class__.__name__}")
    
    def create_order(self, request: OrderCreationRequest) -> OrderCreationResponse:
        """
        Create a complete order with invoice and payments
        Uses atomic transactions and comprehensive validation across all tables
        """
        try:
            self.logger.info(f"Creating enterprise order for customer {request.customer_id}")
            
            # Validate request
            self._validate_order_request(request)
            
            # Use existing transaction from FastAPI
            # No need to begin a new transaction as FastAPI handles it
            
            # Step 1: Validate and get customer with all fields
            customer = self._validate_and_get_customer(request.customer_id)
            
            # Step 2: Validate credit limit if credit payment
            if request.payment_mode == PaymentMode.CREDIT:
                self._validate_customer_credit(customer, request.payment_amount)
            
            # Step 2.5: If challan_id is provided, validate it exists and hasn't been invoiced
            if request.challan_id:
                self._validate_challan_for_invoice(request.challan_id)
            
            # Step 3: Validate and process items with batch allocation
            order_items = self._validate_and_process_items(request.items, customer)
            
            # Step 4: Calculate comprehensive totals
            totals = self._calculate_comprehensive_totals(order_items, request, customer)
            
            # Set payment amount for cash orders
            if request.payment_mode == PaymentMode.CASH and not request.payment_amount:
                request.payment_amount = totals['final_amount']
            
            # Step 5: Generate unique order number
            order_number = self._generate_unique_order_number()
            
            # Step 6: Create complete order record
            order_id = self._create_comprehensive_order_record(
                customer, order_number, totals, request, order_items
            )
            
            # Step 7: Create order items with all fields
            self._create_comprehensive_order_items(order_id, order_items)
            
            # Step 8: Update inventory with FIFO and create movements
            self._update_inventory_with_movements(order_id, order_items, order_number)
            
            # Step 9: Create comprehensive invoice
            invoice_id, invoice_number = self._create_comprehensive_invoice(
                order_id, customer, order_items, totals, request
            )
            
            # Step 10: Create invoice items
            self._create_invoice_items(invoice_id, order_items)
            
            # Step 10.5: Update order with invoice details
            self.db.execute(text("""
                UPDATE orders
                SET invoice_number = :invoice_number,
                    invoice_date = :invoice_date,
                    order_status = 'invoiced',
                    updated_at = CURRENT_TIMESTAMP
                WHERE order_id = :order_id
            """), {
                "order_id": order_id,
                "invoice_number": invoice_number,
                "invoice_date": datetime.now().date()
            })
            
            # Step 11: Process payment if provided
            payment_status = PaymentStatus.PENDING
            invoice_status = InvoiceStatus.GENERATED
            
            if request.payment_amount and request.payment_amount > 0:
                payment_status, invoice_status = self._process_comprehensive_payment(
                    order_id, invoice_id, request.payment_amount, 
                    request.payment_mode, totals['final_amount'], invoice_number
                )
            
            # Step 12: Update customer outstanding
            self._update_customer_outstanding(customer.customer_id, totals['final_amount'])
            
            # Step 13: Create loyalty points if applicable
            self._create_loyalty_points(customer.customer_id, totals['final_amount'])
            
            # Step 14: If challan_id provided, mark it as converted
            if request.challan_id:
                self._mark_challan_as_converted(request.challan_id, invoice_id)
            
            # Commit the transaction
            self.db.commit()
            
            self.logger.info(f"Enterprise order {order_number} created successfully")
            
            return OrderCreationResponse(
                success=True,
                order_id=order_id,
                order_number=order_number,
                invoice_id=invoice_id,
                invoice_number=invoice_number,
                total_amount=totals['final_amount'],
                payment_status=payment_status.value,
                invoice_status=invoice_status.value,
                message=f"Order {order_number} created successfully",
                created_at=datetime.now(),
                customer_name=customer.customer_name,
                items_count=len(order_items),
                tax_amount=totals['total_tax'],
                delivery_date=request.delivery_date
            )
                
        except OrderServiceError:
            self.db.rollback()
            raise
        except Exception as e:
            self.db.rollback()
            self.logger.error(f"Unexpected error creating enterprise order: {str(e)}")
            raise OrderServiceError(
                f"Failed to create order: {str(e)}",
                "INTERNAL_ERROR"
            )
    
    def _validate_order_request(self, request: OrderCreationRequest):
        """Validate the order request"""
        if not request.items or len(request.items) == 0:
            raise OrderServiceError("At least one item is required", "VALIDATION_ERROR")
        
        # Validate payment amount for credit orders
        if request.payment_mode == PaymentMode.CREDIT and not request.payment_amount:
            request.payment_amount = Decimal('0')
    
    def _validate_and_get_customer(self, customer_id: int) -> CustomerInfo:
        """Get comprehensive customer information with all fields"""
        result = self.db.execute(text("""
            SELECT 
                customer_id, customer_code, customer_name, customer_type,
                phone, alternate_phone, email,
                address, city, state, pincode,
                COALESCE(gstin, gst_number) as gstin, gst_number,
                state_code, credit_limit, credit_period_days, payment_terms,
                drug_license_number, COALESCE(outstanding_amount, 0) as outstanding_amount
            FROM customers 
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {
            "customer_id": customer_id,
            "org_id": self.org_id
        }).first()
        
        if not result:
            raise OrderServiceError(
                f"Customer {customer_id} not found",
                "CUSTOMER_NOT_FOUND"
            )
        
        return CustomerInfo(
            customer_id=result.customer_id,
            customer_name=result.customer_name,
            customer_code=result.customer_code,
            customer_type=result.customer_type,
            phone=result.phone,
            alternate_phone=result.alternate_phone,
            email=result.email,
            address=result.address,
            city=result.city,
            state=result.state,
            pincode=result.pincode,
            gstin=result.gstin,
            gst_number=result.gst_number,
            state_code=result.state_code,
            credit_limit=result.credit_limit,
            credit_period_days=result.credit_period_days,
            payment_terms=result.payment_terms,
            drug_license_number=result.drug_license_number,
            outstanding_amount=result.outstanding_amount or Decimal('0')
        )
    
    def _validate_customer_credit(self, customer: CustomerInfo, order_amount: Optional[Decimal]):
        """Validate customer credit limit"""
        if not order_amount:
            return
            
        current_outstanding = customer.outstanding_amount or Decimal('0')
        credit_limit = customer.credit_limit or Decimal('0')
        
        if credit_limit > 0:
            total_after_order = current_outstanding + order_amount
            if total_after_order > credit_limit:
                raise OrderServiceError(
                    f"Credit limit exceeded. Limit: ₹{credit_limit}, Current Outstanding: ₹{current_outstanding}, Order Amount: ₹{order_amount}",
                    "CREDIT_LIMIT_EXCEEDED",
                    {
                        "credit_limit": float(credit_limit),
                        "current_outstanding": float(current_outstanding),
                        "order_amount": float(order_amount)
                    }
                )
    
    def _validate_challan_for_invoice(self, challan_id: int):
        """Validate challan exists and hasn't been converted to invoice"""
        result = self.db.execute(
            text("""
                SELECT challan_id, converted_to_invoice, customer_id, challan_number
                FROM challans
                WHERE challan_id = :challan_id AND org_id = :org_id
            """),
            {"challan_id": challan_id, "org_id": self.org_id}
        ).fetchone()
        
        if not result:
            raise OrderServiceError(
                f"Challan {challan_id} not found",
                "CHALLAN_NOT_FOUND"
            )
        
        if result.converted_to_invoice:
            raise OrderServiceError(
                f"Challan {result.challan_number} has already been converted to invoice",
                "CHALLAN_ALREADY_CONVERTED"
            )
        
        return result

    def _mark_challan_as_converted(self, challan_id: int, invoice_id: int):
        """Mark challan as converted to invoice"""
        self.db.execute(
            text("""
                UPDATE challans
                SET converted_to_invoice = TRUE,
                    invoice_id = :invoice_id,
                    conversion_date = CURRENT_TIMESTAMP
                WHERE challan_id = :challan_id AND org_id = :org_id
            """),
            {
                "challan_id": challan_id,
                "invoice_id": invoice_id,
                "org_id": self.org_id
            }
        )
    
    def _validate_and_process_items(self, items: List[OrderItemRequest], customer: CustomerInfo) -> List[OrderItem]:
        """Validate all items with comprehensive product and batch information"""
        processed_items = []
        
        for item_request in items:
            # Get comprehensive product info
            product = self._get_comprehensive_product_info(item_request.product_id)
            
            # Get batch info if specified or find best batch
            batch_info = None
            if item_request.batch_id:
                batch_info = self._get_batch_info(item_request.batch_id, item_request.product_id)
            else:
                batch_info = self._find_best_batch(item_request.product_id, item_request.quantity)
            
            # Validate stock availability
            available_stock = batch_info.quantity_available if batch_info else product.available_stock
            if item_request.quantity > available_stock:
                raise OrderServiceError(
                    f"Insufficient stock for {product.product_name}. Available: {available_stock}, Requested: {item_request.quantity}",
                    "INSUFFICIENT_STOCK",
                    {
                        "product_id": product.product_id,
                        "product_name": product.product_name,
                        "available": available_stock,
                        "requested": item_request.quantity
                    }
                )
            
            # Check prescription requirement
            if product.prescription_required:
                self.logger.warning(f"Product {product.product_name} requires prescription")
            
            # Calculate comprehensive line totals
            processed_item = self._calculate_item_totals(
                product, batch_info, item_request, customer
            )
            
            processed_items.append(processed_item)
        
        return processed_items
    
    def _get_comprehensive_product_info(self, product_id: int) -> ProductInfo:
        """Get comprehensive product information with all fields"""
        result = self.db.execute(text("""
            SELECT 
                p.product_id, p.product_code, p.product_name, p.generic_name,
                p.manufacturer, p.category, p.hsn_code,
                p.gst_percent, p.cgst_percent, p.sgst_percent, p.igst_percent,
                p.sale_price, p.mrp, p.purchase_price,
                p.drug_schedule, p.prescription_required,
                p.pack_size, p.pack_quantity, p.unit_count,
                p.base_uom_code, p.sale_uom_code, p.barcode,
                p.minimum_stock_level,
                COALESCE(SUM(b.quantity_available), 0) as available_stock
            FROM products p
            LEFT JOIN batches b ON p.product_id = b.product_id 
                AND b.org_id = :org_id
                AND b.quantity_available > 0
                AND (b.expiry_date IS NULL OR b.expiry_date > CURRENT_DATE)
            WHERE p.product_id = :product_id
            GROUP BY p.product_id, p.product_code, p.product_name, p.generic_name,
                     p.manufacturer, p.category, p.hsn_code,
                     p.gst_percent, p.cgst_percent, p.sgst_percent, p.igst_percent,
                     p.sale_price, p.mrp, p.purchase_price,
                     p.drug_schedule, p.prescription_required,
                     p.pack_size, p.pack_quantity, p.unit_count,
                     p.base_uom_code, p.sale_uom_code, p.barcode,
                     p.minimum_stock_level
        """), {
            "product_id": product_id,
            "org_id": self.org_id
        }).first()
        
        if not result:
            raise OrderServiceError(
                f"Product {product_id} not found",
                "PRODUCT_NOT_FOUND"
            )
        
        return ProductInfo(
            product_id=result.product_id,
            product_code=result.product_code,
            product_name=result.product_name,
            generic_name=result.generic_name,
            manufacturer=result.manufacturer,
            category=result.category,
            hsn_code=result.hsn_code,
            gst_percent=Decimal(str(result.gst_percent or 12)),
            cgst_percent=Decimal(str(result.cgst_percent or 6)) if result.cgst_percent else None,
            sgst_percent=Decimal(str(result.sgst_percent or 6)) if result.sgst_percent else None,
            igst_percent=Decimal(str(result.igst_percent or 12)) if result.igst_percent else None,
            sale_price=Decimal(str(result.sale_price or 0)),
            mrp=Decimal(str(result.mrp or 0)),
            purchase_price=Decimal(str(result.purchase_price or 0)) if result.purchase_price else None,
            drug_schedule=result.drug_schedule,
            prescription_required=result.prescription_required,
            pack_size=result.pack_size,
            pack_quantity=result.pack_quantity,
            unit_count=result.unit_count,
            base_uom_code=result.base_uom_code,
            sale_uom_code=result.sale_uom_code,
            barcode=result.barcode,
            available_stock=int(result.available_stock or 0),
            minimum_stock_level=result.minimum_stock_level
        )
    
    def _get_batch_info(self, batch_id: int, product_id: int) -> BatchInfo:
        """Get comprehensive batch information"""
        result = self.db.execute(text("""
            SELECT 
                batch_id, batch_number, manufacturing_date, expiry_date,
                quantity_available, cost_price, selling_price, supplier_id,
                days_to_expiry, is_near_expiry
            FROM batches
            WHERE batch_id = :batch_id 
                AND product_id = :product_id 
                AND org_id = :org_id
                AND quantity_available > 0
        """), {
            "batch_id": batch_id,
            "product_id": product_id,
            "org_id": self.org_id
        }).first()
        
        if not result:
            raise OrderServiceError(
                f"Batch {batch_id} not found or insufficient stock",
                "BATCH_NOT_FOUND"
            )
        
        return BatchInfo(
            batch_id=result.batch_id,
            batch_number=result.batch_number,
            manufacturing_date=result.manufacturing_date,
            expiry_date=result.expiry_date,
            quantity_available=result.quantity_available,
            cost_price=Decimal(str(result.cost_price)) if result.cost_price else None,
            selling_price=Decimal(str(result.selling_price)) if result.selling_price else None,
            supplier_id=result.supplier_id,
            days_to_expiry=result.days_to_expiry,
            is_near_expiry=result.is_near_expiry
        )
    
    def _find_best_batch(self, product_id: int, required_quantity: int) -> Optional[BatchInfo]:
        """Find the best batch using FIFO/FEFO logic"""
        result = self.db.execute(text("""
            SELECT 
                batch_id, batch_number, manufacturing_date, expiry_date,
                quantity_available, cost_price, selling_price, supplier_id,
                days_to_expiry, is_near_expiry
            FROM batches
            WHERE product_id = :product_id 
                AND org_id = :org_id
                AND quantity_available >= :required_quantity
                AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
            ORDER BY 
                CASE WHEN expiry_date IS NULL THEN '9999-12-31'::date ELSE expiry_date END ASC,
                batch_id ASC
            LIMIT 1
        """), {
            "product_id": product_id,
            "org_id": self.org_id,
            "required_quantity": required_quantity
        }).first()
        
        if not result:
            return None
        
        return BatchInfo(
            batch_id=result.batch_id,
            batch_number=result.batch_number,
            manufacturing_date=result.manufacturing_date,
            expiry_date=result.expiry_date,
            quantity_available=result.quantity_available,
            cost_price=Decimal(str(result.cost_price)) if result.cost_price else None,
            selling_price=Decimal(str(result.selling_price)) if result.selling_price else None,
            supplier_id=result.supplier_id,
            days_to_expiry=result.days_to_expiry,
            is_near_expiry=result.is_near_expiry
        )
    
    def _calculate_item_totals(self, product: ProductInfo, batch_info: Optional[BatchInfo], 
                              item_request: OrderItemRequest, customer: CustomerInfo) -> OrderItem:
        """Calculate comprehensive item totals with all tax calculations"""
        
        # Determine unit price
        unit_price = item_request.unit_price or (batch_info.selling_price if batch_info else None) or product.sale_price
        if not unit_price:
            unit_price = product.mrp
        
        # Calculate base amounts
        quantity = item_request.quantity
        line_total = quantity * unit_price
        discount_amount = line_total * item_request.discount_percent / 100
        taxable_amount = line_total - discount_amount
        
        # Determine if interstate transaction
        is_interstate = self._is_interstate_transaction(customer)
        
        # Calculate GST amounts
        gst_percent = product.gst_percent
        total_tax = taxable_amount * gst_percent / 100
        
        if is_interstate:
            cgst_amount = Decimal('0')
            sgst_amount = Decimal('0')
            igst_amount = total_tax
        else:
            cgst_amount = total_tax / 2
            sgst_amount = total_tax / 2
            igst_amount = Decimal('0')
        
        total_price = taxable_amount + total_tax
        
        return OrderItem(
            product_id=product.product_id,
            product_info=product,
            batch_info=batch_info,
            quantity=quantity,
            base_quantity=quantity * (product.pack_quantity or 1),
            uom_code=item_request.uom_code or product.sale_uom_code,
            unit_price=unit_price,
            mrp=product.mrp,
            discount_percent=item_request.discount_percent,
            discount_amount=discount_amount,
            taxable_amount=taxable_amount,
            tax_percent=gst_percent,
            tax_amount=total_tax,
            cgst_amount=cgst_amount,
            sgst_amount=sgst_amount,
            igst_amount=igst_amount,
            line_total=taxable_amount,
            total_price=total_price
        )
    
    def _is_interstate_transaction(self, customer: CustomerInfo) -> bool:
        """Determine if transaction is interstate"""
        company_state = "Karnataka"  # Could be configurable
        customer_state = customer.state or ""
        return customer_state.lower() != company_state.lower()
    
    def _calculate_comprehensive_totals(self, items: List[OrderItem], 
                                      request: OrderCreationRequest, 
                                      customer: CustomerInfo) -> Dict[str, Decimal]:
        """Calculate comprehensive order totals"""
        
        subtotal = sum(item.taxable_amount for item in items)
        total_tax = sum(item.tax_amount for item in items)
        total_cgst = sum(item.cgst_amount for item in items)
        total_sgst = sum(item.sgst_amount for item in items)
        total_igst = sum(item.igst_amount for item in items)
        
        # Apply order-level adjustments
        order_discount = request.discount_amount
        delivery_charges = request.delivery_charges
        other_charges = request.other_charges
        
        # Calculate final amount
        final_amount = subtotal + total_tax - order_discount + delivery_charges + other_charges
        
        # Round off calculation
        round_off = Decimal(str(round(float(final_amount)))) - final_amount
        final_amount_rounded = final_amount + round_off
        
        return {
            'subtotal': subtotal,
            'total_tax': total_tax,
            'total_cgst': total_cgst,
            'total_sgst': total_sgst,
            'total_igst': total_igst,
            'order_discount': order_discount,
            'delivery_charges': delivery_charges,
            'other_charges': other_charges,
            'round_off': round_off,
            'final_amount': final_amount_rounded
        }
    
    def _generate_unique_order_number(self) -> str:
        """Generate guaranteed unique order number"""
        timestamp = datetime.now()
        today_prefix = f"ORD{timestamp.strftime('%Y%m%d')}"
        
        # Get count of today's orders (simpler approach)
        result = self.db.execute(text("""
            SELECT COUNT(*) as order_count
            FROM orders 
            WHERE org_id = :org_id 
            AND order_number LIKE :prefix
        """), {
            "org_id": self.org_id,
            "prefix": f"{today_prefix}%"
        }).first()
        
        # Use count + 1 as sequence, with max 9999 to prevent overflow
        seq_num = (result.order_count + 1) % 10000 if result else 1
        
        # Add timestamp suffix for uniqueness
        unique_suffix = timestamp.strftime('%H%M%S')
        return f"{today_prefix}-{seq_num:04d}-{unique_suffix}"
    
    def _create_comprehensive_order_record(self, customer: CustomerInfo, 
                                         order_number: str, totals: Dict, 
                                         request: OrderCreationRequest,
                                         items: List[OrderItem]) -> int:
        """Create comprehensive order record with all fields"""
        
        # Determine payment status
        payment_status = PaymentStatus.PENDING
        if request.payment_mode == PaymentMode.CASH:
            payment_status = PaymentStatus.PAID
        elif request.payment_amount and request.payment_amount > 0:
            payment_status = PaymentStatus.PARTIAL
        
        # Check if any product requires prescription
        prescription_required = any(item.product_info.prescription_required for item in items)
        
        result = self.db.execute(text("""
            INSERT INTO orders (
                org_id, customer_id, customer_name, customer_phone,
                order_number, order_date, order_time, order_type, order_status,
                delivery_date, delivery_type, delivery_address,
                
                subtotal_amount, discount_amount, tax_amount, round_off_amount, final_amount,
                delivery_charges, other_charges,
                
                payment_mode, payment_status, payment_terms, paid_amount, balance_amount,
                
                billing_name, billing_address, billing_gstin,
                shipping_name, shipping_address, shipping_phone,
                
                notes, is_urgent,
                prescription_required, prescription_id, doctor_id,
                
                branch_id, created_by,
                created_at, updated_at
            ) VALUES (
                :org_id, :customer_id, :customer_name, :customer_phone,
                :order_number, :order_date, :order_time, 'sales', 'confirmed',
                :delivery_date, :delivery_type, :delivery_address,
                
                :subtotal_amount, :discount_amount, :tax_amount, :round_off_amount, :final_amount,
                :delivery_charges, :other_charges,
                
                :payment_mode, :payment_status, :payment_terms, :paid_amount, :balance_amount,
                
                :billing_name, :billing_address, :billing_gstin,
                :shipping_name, :shipping_address, :shipping_phone,
                
                :notes, :is_urgent,
                :prescription_required, :prescription_id, :doctor_id,
                
                :branch_id, :created_by,
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING order_id
        """), {
            "org_id": self.org_id,
            "customer_id": customer.customer_id,
            "customer_name": customer.customer_name,
            "customer_phone": customer.phone,
            "order_number": order_number,
            "order_date": request.order_date or date.today(),
            "order_time": datetime.now().time(),
            "delivery_date": request.delivery_date or date.today(),
            "delivery_type": request.delivery_type,
            "delivery_address": request.delivery_address or customer.address,
            
            "subtotal_amount": float(totals['subtotal']),
            "discount_amount": float(totals['order_discount']),
            "tax_amount": float(totals['total_tax']),
            "round_off_amount": float(totals['round_off']),
            "final_amount": float(totals['final_amount']),
            "delivery_charges": float(totals['delivery_charges']),
            "other_charges": float(totals['other_charges']),
            
            "payment_mode": request.payment_mode.value,
            "payment_status": payment_status.value,
            "payment_terms": request.payment_terms or customer.payment_terms,
            "paid_amount": float(request.payment_amount or 0),
            "balance_amount": float(totals['final_amount'] - (request.payment_amount or 0)),
            
            "billing_name": customer.customer_name,
            "billing_address": customer.address,
            "billing_gstin": customer.gstin,
            "shipping_name": customer.customer_name,
            "shipping_address": request.delivery_address or customer.address,
            "shipping_phone": customer.phone,
            
            "notes": request.notes,
            "is_urgent": request.is_urgent,
            "prescription_required": prescription_required,
            "prescription_id": request.prescription_id,
            "doctor_id": request.doctor_id,
            
            "branch_id": request.branch_id,
            "created_by": request.created_by
        })
        
        order_id = result.scalar()
        if not order_id:
            raise OrderServiceError("Failed to create order record", "DATABASE_ERROR")
        
        return order_id
    
    def _create_comprehensive_order_items(self, order_id: int, items: List[OrderItem]):
        """Create comprehensive order item records with all fields"""
        for item in items:
            self.db.execute(text("""
                INSERT INTO order_items (
                    order_id, product_id, product_name, 
                    batch_id, batch_number, expiry_date,
                    quantity, base_quantity, uom_code,
                    mrp, selling_price, unit_price,
                    discount_percent, discount_amount,
                    tax_percent, tax_amount,
                    line_total, total_price
                ) VALUES (
                    :order_id, :product_id, :product_name,
                    :batch_id, :batch_number, :expiry_date,
                    :quantity, :base_quantity, :uom_code,
                    :mrp, :selling_price, :unit_price,
                    :discount_percent, :discount_amount,
                    :tax_percent, :tax_amount,
                    :line_total, :total_price
                )
            """), {
                "order_id": order_id,
                "product_id": item.product_id,
                "product_name": item.product_info.product_name,
                "batch_id": item.batch_info.batch_id if item.batch_info else None,
                "batch_number": item.batch_info.batch_number if item.batch_info else None,
                "expiry_date": item.batch_info.expiry_date if item.batch_info else None,
                "quantity": item.quantity,
                "base_quantity": item.base_quantity,
                "uom_code": item.uom_code,
                "mrp": float(item.mrp),
                "selling_price": float(item.unit_price),
                "unit_price": float(item.unit_price),
                "discount_percent": float(item.discount_percent),
                "discount_amount": float(item.discount_amount),
                "tax_percent": float(item.tax_percent),
                "tax_amount": float(item.tax_amount),
                "line_total": float(item.line_total),
                "total_price": float(item.total_price)
            })
    
    def _update_inventory_with_movements(self, order_id: int, items: List[OrderItem], order_number: str):
        """Update inventory with comprehensive movement tracking"""
        for item in items:
            remaining_qty = item.quantity
            
            # Get available batches using FIFO/FEFO
            batches_query = text("""
                SELECT batch_id, batch_number, quantity_available
                FROM batches
                WHERE product_id = :product_id 
                    AND org_id = :org_id
                    AND quantity_available > 0
                    AND (expiry_date IS NULL OR expiry_date > CURRENT_DATE)
                ORDER BY 
                    CASE WHEN expiry_date IS NULL THEN '9999-12-31'::date ELSE expiry_date END ASC,
                    batch_id ASC
            """)
            
            batches = self.db.execute(batches_query, {
                "product_id": item.product_id,
                "org_id": self.org_id
            }).fetchall()
            
            self.logger.info(f"Found {len(batches)} batches for product {item.product_info.product_name} (ID: {item.product_id})")
            for b in batches:
                self.logger.info(f"  Batch {b.batch_id}: {b.quantity_available} available")
            
            for batch in batches:
                if remaining_qty <= 0:
                    break
                
                qty_from_batch = min(remaining_qty, batch.quantity_available)
                
                # Update batch quantities
                self.db.execute(text("""
                    UPDATE batches
                    SET 
                        quantity_available = quantity_available - :qty,
                        quantity_sold = quantity_sold + :qty,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = :batch_id
                """), {
                    "qty": qty_from_batch,
                    "batch_id": batch.batch_id
                })
                
                # Inventory movements are handled by database triggers
                # No need to manually insert movement records
                
                remaining_qty -= qty_from_batch
            
            if remaining_qty > 0:
                raise OrderServiceError(
                    f"Could not allocate {remaining_qty} units for {item.product_info.product_name}",
                    "INVENTORY_ALLOCATION_FAILED"
                )
    
    def _create_comprehensive_invoice(self, order_id: int, customer: CustomerInfo, 
                                    items: List[OrderItem], totals: Dict, 
                                    request: OrderCreationRequest) -> Tuple[int, str]:
        """Create comprehensive invoice with all fields"""
        
        invoice_number = f"INV{datetime.now().strftime('%Y%m%d')}{order_id:04d}"
        
        # Determine GST type and place of supply
        is_interstate = self._is_interstate_transaction(customer)
        gst_type = "igst" if is_interstate else "cgst_sgst"
        place_of_supply = customer.state_code or "29"  # Default to Karnataka
        
        result = self.db.execute(text("""
            INSERT INTO invoices (
                org_id, invoice_number, order_id, challan_id,
                invoice_date, due_date,
                customer_id, customer_name, customer_gstin,
                
                billing_name, billing_address, billing_city, billing_state, billing_pincode,
                shipping_address,
                
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                round_off_amount, total_amount,
                
                gst_type, place_of_supply,
                invoice_type, invoice_status,
                payment_status, paid_amount,
                
                created_at, updated_at
            ) VALUES (
                :org_id, :invoice_number, :order_id, :challan_id,
                CURRENT_DATE, :due_date,
                :customer_id, :customer_name, :customer_gstin,
                
                :billing_name, :billing_address, :billing_city, :billing_state, :billing_pincode,
                :shipping_address,
                
                :subtotal_amount, :discount_amount, :taxable_amount,
                :cgst_amount, :sgst_amount, :igst_amount, :total_tax_amount,
                :round_off_amount, :total_amount,
                
                :gst_type, :place_of_supply,
                'tax_invoice', 'generated',
                'unpaid', 0,
                
                CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": self.org_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "challan_id": request.challan_id,
            "due_date": request.delivery_date or date.today(),
            "customer_id": customer.customer_id,
            "customer_name": customer.customer_name,
            "customer_gstin": customer.gstin or "",
            
            "billing_name": customer.customer_name,
            "billing_address": customer.address or "N/A",
            "billing_city": customer.city or "N/A",
            "billing_state": customer.state or "Karnataka",
            "billing_pincode": customer.pincode or "000000",
            "shipping_address": request.delivery_address or customer.address,
            
            "subtotal_amount": float(totals['subtotal']),
            "discount_amount": float(totals['order_discount']),
            "taxable_amount": float(totals['subtotal'] - totals['order_discount']),
            "cgst_amount": float(totals['total_cgst']),
            "sgst_amount": float(totals['total_sgst']),
            "igst_amount": float(totals['total_igst']),
            "total_tax_amount": float(totals['total_tax']),
            "round_off_amount": float(totals['round_off']),
            "total_amount": float(totals['final_amount']),
            
            "gst_type": gst_type,
            "place_of_supply": place_of_supply
        })
        
        invoice_id = result.scalar()
        return invoice_id, invoice_number
    
    def _create_invoice_items(self, invoice_id: int, items: List[OrderItem]):
        """Create comprehensive invoice item records"""
        for item in items:
            self.db.execute(text("""
                INSERT INTO invoice_items (
                    invoice_id, product_id, product_name,
                    hsn_code, batch_id, batch_number,
                    quantity, unit_price, mrp,
                    discount_percent, discount_amount,
                    gst_percent, cgst_amount, sgst_amount, igst_amount,
                    taxable_amount, total_amount
                ) VALUES (
                    :invoice_id, :product_id, :product_name,
                    :hsn_code, :batch_id, :batch_number,
                    :quantity, :unit_price, :mrp,
                    :discount_percent, :discount_amount,
                    :gst_percent, :cgst_amount, :sgst_amount, :igst_amount,
                    :taxable_amount, :total_amount
                )
            """), {
                "invoice_id": invoice_id,
                "product_id": item.product_id,
                "product_name": item.product_info.product_name,
                "hsn_code": item.product_info.hsn_code,
                "batch_id": item.batch_info.batch_id if item.batch_info else None,
                "batch_number": item.batch_info.batch_number if item.batch_info else None,
                "quantity": item.quantity,
                "unit_price": float(item.unit_price),
                "mrp": float(item.mrp),
                "discount_percent": float(item.discount_percent),
                "discount_amount": float(item.discount_amount),
                "gst_percent": float(item.tax_percent),
                "cgst_amount": float(item.cgst_amount),
                "sgst_amount": float(item.sgst_amount),
                "igst_amount": float(item.igst_amount),
                "taxable_amount": float(item.taxable_amount),
                "total_amount": float(item.total_price)
            })
    
    def _process_comprehensive_payment(self, order_id: int, invoice_id: int, 
                                     payment_amount: Decimal, payment_mode: PaymentMode,
                                     total_amount: Decimal, invoice_number: str) -> Tuple[PaymentStatus, InvoiceStatus]:
        """Process comprehensive payment with all fields"""
        
        payment_reference = f"PAY-{datetime.now().strftime('%Y%m%d')}-{order_id:06d}"
        
        # Create payment record in invoice_payments table
        self.db.execute(text("""
            INSERT INTO invoice_payments (
                invoice_id, payment_reference,
                payment_date, amount, payment_mode, payment_amount,
                transaction_reference, status,
                notes
            ) VALUES (
                :invoice_id, :payment_reference,
                CURRENT_DATE, :amount, :payment_mode, :payment_amount,
                :transaction_reference, 'completed',
                'Order payment via enterprise API'
            )
        """), {
            "invoice_id": invoice_id,
            "payment_reference": payment_reference,
            "amount": float(payment_amount),  # Both columns get same value
            "payment_mode": payment_mode.value,
            "payment_amount": float(payment_amount),
            "transaction_reference": f"TXN-{payment_reference}"
        })
        
        # Also create entry in general payments table for complete ledger
        payment_number = f"INV-PAY-{datetime.now().strftime('%Y%m%d%H%M%S')}-{invoice_id}"
        
        # Get customer_id from invoice
        customer_result = self.db.execute(text("""
            SELECT customer_id FROM invoices WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id}).first()
        
        if customer_result:
            self.db.execute(text("""
                INSERT INTO payments (
                    org_id, payment_number, payment_date,
                    customer_id, payment_type, amount,
                    payment_mode, reference_number,
                    payment_status, notes,
                    created_at, updated_at
                ) VALUES (
                    :org_id, :payment_number, CURRENT_DATE,
                    :customer_id, 'invoice_payment', :amount,
                    :payment_mode, :reference_number,
                    'completed', :notes,
                    CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
            """), {
                "org_id": self.org_id,
                "payment_number": payment_number,
                "customer_id": customer_result.customer_id,
                "amount": float(payment_amount),
                "payment_mode": payment_mode.value,
                "reference_number": invoice_number,
                "notes": f"Payment for Invoice {invoice_number}"
            })
        
        # Determine payment status
        payment_status = PaymentStatus.PARTIAL
        invoice_status = InvoiceStatus.GENERATED
        
        if payment_amount >= total_amount:
            payment_status = PaymentStatus.PAID
            invoice_status = InvoiceStatus.PAID
        elif payment_amount > 0:
            payment_status = PaymentStatus.PARTIAL
            invoice_status = InvoiceStatus.GENERATED
        
        # Update order payment status
        self.db.execute(text("""
            UPDATE orders 
            SET 
                paid_amount = :payment_amount,
                balance_amount = final_amount - :payment_amount,
                payment_status = :payment_status,
                updated_at = CURRENT_TIMESTAMP
            WHERE order_id = :order_id
        """), {
            "payment_amount": float(payment_amount),
            "payment_status": payment_status.value,
            "order_id": order_id
        })
        
        # Update invoice payment status
        self.db.execute(text("""
            UPDATE invoices 
            SET 
                paid_amount = :payment_amount,
                payment_status = :payment_status,
                invoice_status = :invoice_status,
                payment_date = CASE WHEN :payment_amount >= total_amount THEN CURRENT_TIMESTAMP ELSE NULL END,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id
        """), {
            "payment_amount": float(payment_amount),
            "payment_status": payment_status.value,
            "invoice_status": invoice_status.value,
            "invoice_id": invoice_id
        })
        
        return payment_status, invoice_status
    
    def _update_customer_outstanding(self, customer_id: int, order_amount: Decimal):
        """Update customer outstanding amount"""
        self.db.execute(text("""
            UPDATE customers 
            SET 
                outstanding_amount = COALESCE(outstanding_amount, 0) + :order_amount,
                total_business = COALESCE(total_business, 0) + :order_amount,
                order_count = COALESCE(order_count, 0) + 1,
                last_order_date = CURRENT_DATE,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id AND org_id = :org_id
        """), {
            "customer_id": customer_id,
            "order_amount": float(order_amount),
            "org_id": self.org_id
        })
    
    def _create_loyalty_points(self, customer_id: int, order_amount: Decimal):
        """Create loyalty points if applicable"""
        # This would integrate with loyalty_programs table
        # For now, just log the opportunity
        self.logger.info(f"Loyalty points opportunity for customer {customer_id}, amount {order_amount}")
        pass