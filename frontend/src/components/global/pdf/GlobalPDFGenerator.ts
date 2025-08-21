import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { companyAPI } from '../../../services/api';

interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  gst: string;
  website: string;
}

interface PartyDetails {
  name: string;
  phone?: string;
  address?: string;
  gst?: string;
  email?: string;
}

interface SummaryData {
  subtotal: number;
  tax?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  discount?: number;
  roundOff?: number;
  total: number;
  currency?: string;
  taxBreakdown?: Array<{
    label: string;
    amount: number;
  }>;
}

interface BankDetails {
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
  upiId?: string;
}

interface ItemDetails {
  srNo?: number;
  name: string;
  description?: string;
  hsn?: string;
  batch?: string;
  expiry?: string;
  quantity: number;
  unit?: string;
  unitPrice: number;
  discount?: number;
  discountType?: 'percentage' | 'amount';
  taxPercent?: number;
  cgstPercent?: number;
  sgstPercent?: number;
  igstPercent?: number;
  lineTotal: number;
  notes?: string;
}

export type Theme = 'digital' | 'print' | 'modern' | 'classic';
export type PartyType = 'customer' | 'supplier';
export type DocumentType = 'invoice' | 'purchase' | 'challan' | 'quotation' | 'order' | 'receipt' | 'creditnote' | 'debitnote';

/**
 * Global PDF Generator with consistent branding and themes
 * Provides two templates: Print (minimal) and Digital (branded)
 */
class GlobalPDFGenerator {
  doc: jsPDF;
  theme: Theme;
  documentType: DocumentType;
  companyInfo: CompanyInfo;
  colors: Record<Theme, Record<string, number[]>>;
  currentY: number;
  pageWidth: number;
  pageHeight: number;
  margin: { left: number; right: number; top: number; bottom: number };
  
  constructor(theme: Theme = 'modern', documentType: DocumentType = 'invoice') {
    this.doc = new jsPDF();
    this.theme = theme;
    this.documentType = documentType;
    this.currentY = 0;
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    this.margin = { left: 15, right: 15, top: 15, bottom: 25 };
    // Will be loaded from backend via init() or loadCompanyInfo()
    this.companyInfo = {
      name: '',
      address: '',
      phone: '',
      email: '',
      gst: '',
      website: ''
    };
    this.loadCompanyInfo();
    this.colors = {
      digital: {
        primary: [59, 130, 246], // Blue
        secondary: [99, 102, 241], // Indigo
        accent: [16, 185, 129], // Green
        dark: [31, 41, 55], // Gray-800
        light: [243, 244, 246], // Gray-100
        white: [255, 255, 255],
        text: [17, 24, 39], // Gray-900
        textLight: [107, 114, 128], // Gray-500
        success: [16, 185, 129],
        warning: [245, 158, 11],
        danger: [239, 68, 68]
      },
      print: {
        primary: [0, 0, 0], // Black
        secondary: [75, 85, 99], // Gray-600
        accent: [31, 41, 55], // Gray-800
        dark: [0, 0, 0],
        light: [249, 250, 251], // Gray-50
        white: [255, 255, 255],
        text: [0, 0, 0],
        textLight: [107, 114, 128],
        success: [0, 0, 0],
        warning: [0, 0, 0],
        danger: [0, 0, 0]
      },
      modern: {
        primary: [37, 99, 235], // Blue-600
        secondary: [79, 70, 229], // Indigo-600
        accent: [6, 182, 212], // Cyan-500
        dark: [15, 23, 42], // Slate-900
        light: [248, 250, 252], // Slate-50
        white: [255, 255, 255],
        text: [15, 23, 42], // Slate-900
        textLight: [100, 116, 139], // Slate-500
        success: [34, 197, 94],
        warning: [251, 146, 60],
        danger: [239, 68, 68]
      },
      classic: {
        primary: [17, 24, 39], // Gray-900
        secondary: [55, 65, 81], // Gray-700
        accent: [75, 85, 99], // Gray-600
        dark: [0, 0, 0],
        light: [243, 244, 246], // Gray-100
        white: [255, 255, 255],
        text: [17, 24, 39],
        textLight: [107, 114, 128],
        success: [5, 150, 105],
        warning: [217, 119, 6],
        danger: [185, 28, 28]
      }
    } as Record<Theme, Record<string, number[]>>;
  }

  /**
   * Helper method to apply color arrays
   */
  private applyColor(method: 'setTextColor' | 'setFillColor' | 'setDrawColor', color: number[]): void {
    (this.doc as any)[method](color[0], color[1], color[2]);
  }

  /**
   * Load company info from backend
   */
  private async loadCompanyInfo(): Promise<void> {
    try {
      const response = await companyAPI.getCompanyInfo();
      if (response && response.data) {
        this.companyInfo = {
          name: response.data.name || '',
          address: response.data.address || '',
          phone: response.data.phone || '',
          email: response.data.email || '',
          gst: response.data.gst || '',
          website: response.data.website || ''
        };
      }
    } catch (error) {
      console.error('Error loading company info from backend:', error);
      // Company info stays empty if backend fails
    }
  }

  /**
   * Initialize PDF with company info
   */
  async init(
    theme: Theme = 'modern', 
    documentType: DocumentType = 'invoice',
    orientation: 'portrait' | 'landscape' = 'portrait'
  ): Promise<this> {
    this.theme = theme;
    this.documentType = documentType;
    this.doc = new jsPDF(orientation);
    this.pageWidth = this.doc.internal.pageSize.getWidth();
    this.pageHeight = this.doc.internal.pageSize.getHeight();
    
    // Ensure company info is loaded
    await this.loadCompanyInfo();
    
    return this;
  }

  /**
   * Get document title based on type
   */
  private getDocumentTitle(): string {
    const titles: Record<DocumentType, string> = {
      invoice: 'TAX INVOICE',
      purchase: 'PURCHASE INVOICE',
      challan: 'DELIVERY CHALLAN',
      quotation: 'QUOTATION',
      order: 'PURCHASE ORDER',
      receipt: 'PAYMENT RECEIPT',
      creditnote: 'CREDIT NOTE',
      debitnote: 'DEBIT NOTE'
    };
    return titles[this.documentType] || 'DOCUMENT';
  }

  /**
   * Add centered text helper
   */
  private addCenteredText(text: string, y: number, fontSize: number = 12, fontStyle: string = 'normal'): void {
    this.doc.setFontSize(fontSize);
    this.doc.setFont('helvetica', fontStyle);
    const textWidth = this.doc.getTextWidth(text);
    this.doc.text(text, (this.pageWidth - textWidth) / 2, y);
  }

  /**
   * Add line helper
   */
  private addLine(startX: number, startY: number, endX: number, endY: number, width: number = 0.2): void {
    this.doc.setLineWidth(width);
    this.doc.line(startX, startY, endX, endY);
  }

  /**
   * Check if new page is needed
   */
  private checkNewPage(requiredSpace: number = 30): void {
    if (this.currentY + requiredSpace > this.pageHeight - this.margin.bottom) {
      this.doc.addPage();
      this.currentY = this.margin.top;
      this.addPageNumber();
    }
  }

  /**
   * Add branded header with logo and company info
   */
  addHeader(title?: string, subtitle: string = ''): number {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const docTitle = title || this.getDocumentTitle();
    
    if (this.theme === 'digital' || this.theme === 'modern') {
      // Digital theme - colorful header
      // Add gradient background
      this.doc.setFillColor(colors.primary[0], colors.primary[1], colors.primary[2]);
      this.doc.rect(0, 0, pageWidth, 45, 'F');
      
      // Add secondary accent
      this.doc.setFillColor(colors.secondary[0], colors.secondary[1], colors.secondary[2]);
      this.doc.rect(0, 40, pageWidth, 5, 'F');
      
      // Company name - large and bold
      this.applyColor('setTextColor', colors.white);
      this.doc.setFontSize(24);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.companyInfo.name, 15, 20);
      
      // Document title
      this.doc.setFontSize(14);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(docTitle, 15, 30);
      
      if (subtitle) {
        this.doc.setFontSize(10);
        this.doc.text(subtitle, 15, 36);
      }
      
      // Company contact info on the right
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      const contactInfo = [
        this.companyInfo.phone,
        this.companyInfo.email,
        this.companyInfo.website || ''
      ];
      
      let yPos = 15;
      contactInfo.forEach(info => {
        const textWidth = this.doc.getTextWidth(info);
        this.doc.text(info, pageWidth - textWidth - 15, yPos);
        yPos += 5;
      });
      
      // Add decorative elements
      this.applyColor('setDrawColor', colors.accent);
      this.doc.setLineWidth(0.5);
      this.doc.line(15, 47, pageWidth - 15, 47);
      
      this.currentY = 55;
      return this.currentY;
    } else {
      // Print theme - minimal header
      this.applyColor('setTextColor', colors.text);
      
      // Company name
      this.doc.setFontSize(16);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(this.companyInfo.name, 15, 15);
      
      // Document title
      this.doc.setFontSize(12);
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(docTitle, 15, 22);
      
      if (subtitle) {
        this.doc.setFontSize(10);
        this.doc.text(subtitle, 15, 27);
      }
      
      // Simple line separator
      this.applyColor('setDrawColor', colors.secondary);
      this.doc.setLineWidth(0.2);
      this.doc.line(15, 30, pageWidth - 15, 30);
      
      this.currentY = 35;
      return this.currentY;
    }
  }

  /**
   * Add customer/party details section
   */
  addPartyDetails(party: PartyDetails, type: PartyType = 'customer', yPos: number = 60): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (this.theme === 'digital') {
      // Colored background for party details
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(15, yPos, (pageWidth - 30) / 2 - 5, 35, 3, 3, 'F');
      
      // Label
      this.applyColor('setTextColor', colors.primary);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(type === 'customer' ? 'BILL TO' : 'SUPPLIER', 20, yPos + 7);
      
      // Party details
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(11);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(party.name || 'N/A', 20, yPos + 14);
      
      this.doc.setFontSize(9);
      this.doc.setFont('helvetica', 'normal');
      this.applyColor('setTextColor', colors.textLight);
      
      let detailY = yPos + 20;
      if (party.phone) {
        this.doc.text(`Phone: ${party.phone}`, 20, detailY);
        detailY += 5;
      }
      if (party.address) {
        const lines = this.doc.splitTextToSize(party.address, (pageWidth - 30) / 2 - 15);
        this.doc.text(lines, 20, detailY);
        detailY += lines.length * 4;
      }
      if (party.gst) {
        this.doc.text(`GST: ${party.gst}`, 20, detailY + 2);
      }
    } else {
      // Print theme - simple text
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      this.doc.text(type === 'customer' ? 'Bill To:' : 'Supplier:', 15, yPos);
      
      this.doc.setFont('helvetica', 'normal');
      this.doc.text(party.name || 'N/A', 15, yPos + 6);
      
      this.doc.setFontSize(9);
      if (party.phone) this.doc.text(party.phone, 15, yPos + 11);
      if (party.address) {
        const lines = this.doc.splitTextToSize(party.address, 80);
        this.doc.text(lines, 15, yPos + 16);
      }
    }
  }

  /**
   * Add document info (invoice number, date, etc.)
   */
  addDocumentInfo(info: any, yPos: number = 60): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const xPos = pageWidth / 2 + 10;
    
    if (this.theme === 'digital') {
      // Colored background
      this.applyColor('setFillColor', colors.secondary);
      this.applyColor('setTextColor', colors.white);
      this.doc.roundedRect(xPos, yPos, (pageWidth - 30) / 2 - 5, 35, 3, 3, 'F');
      
      // Document details
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      
      const details = [
        { label: info.numberLabel || 'Invoice #', value: info.number },
        { label: 'Date', value: info.date },
        { label: 'Due Date', value: info.dueDate },
        { label: 'Status', value: info.status }
      ].filter(d => d.value);
      
      let detailY = yPos + 8;
      details.forEach(detail => {
        this.doc.text(`${detail.label}:`, xPos + 5, detailY);
        const valueWidth = this.doc.getTextWidth(detail.value);
        this.doc.text(detail.value, pageWidth - 20 - valueWidth, detailY);
        detailY += 7;
      });
    } else {
      // Print theme
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      this.doc.setFont('helvetica', 'bold');
      
      const details = [
        { label: info.numberLabel || 'Invoice #', value: info.number },
        { label: 'Date', value: info.date },
        { label: 'Due Date', value: info.dueDate }
      ].filter(d => d.value);
      
      let detailY = yPos;
      details.forEach(detail => {
        this.doc.text(`${detail.label}: ${detail.value}`, xPos, detailY);
        detailY += 6;
      });
    }
  }

  /**
   * Add simple table with headers and rows
   */
  addTable(headers: string[], rows: any[][], type: PartyType = 'customer'): void {
    const colors = this.colors[this.theme];
    const yPos = (this.doc as any).lastAutoTable?.finalY || 100;
    
    autoTable(this.doc, {
      startY: yPos + 10,
      head: [headers],
      body: rows,
      theme: this.theme === 'digital' ? 'grid' : 'plain',
      headStyles: {
        fillColor: this.theme === 'digital' ? colors.primary : colors.white,
        textColor: this.theme === 'digital' ? colors.white : colors.text,
        fontSize: 10,
        fontStyle: 'bold'
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9
      },
      alternateRowStyles: this.theme === 'digital' ? {
        fillColor: colors.light
      } : {},
      margin: { left: 15, right: 15 }
    } as any);
  }

  /**
   * Add items table with enhanced styling
   */
  addItemsTable(items: any[], columns: any[], yPos: number = 100): number {
    const colors = this.colors[this.theme];
    
    const tableConfig = {
      startY: yPos,
      head: [columns.map(col => col.header)],
      body: items.map(item => columns.map(col => {
        const value = typeof col.field === 'function' ? col.field(item) : item[col.field];
        return col.format ? col.format(value) : value;
      })),
      theme: this.theme === 'digital' ? 'grid' : 'plain',
      headStyles: {
        fillColor: this.theme === 'digital' ? colors.primary : colors.white,
        textColor: this.theme === 'digital' ? colors.white : colors.text,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left'
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9,
        cellPadding: this.theme === 'digital' ? 5 : 3
      },
      alternateRowStyles: this.theme === 'digital' ? {
        fillColor: colors.light
      } : {},
      columnStyles: {},
      margin: { left: 15, right: 15 },
      didDrawPage: (data) => {
        // Add page number
        this.addPageNumber();
      }
    };
    
    // Set column alignments
    columns.forEach((col, index) => {
      if (col.align) {
        tableConfig.columnStyles[index] = { halign: col.align };
      }
    });
    
    autoTable(this.doc, tableConfig as any);
    
    return (this.doc as any).lastAutoTable.finalY;
  }

  /**
   * Add summary section with totals
   */
  addSummary(summary: SummaryData, yPos?: number): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const startY = yPos || this.currentY || 150;
    
    this.checkNewPage(80);
    
    if (this.theme === 'digital' || this.theme === 'modern') {
      // Gradient background for summary (simplified as gradient API may not be available)
      // Just use solid color instead
      
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(pageWidth - 100, startY, 85, 80, 3, 3, 'F');
      
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      
      let summaryY = startY + 10;
      
      // Summary items - format currency values
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: summary.currency || 'INR'
        }).format(amount);
      };
      
      const items: Array<{ label: string; value: string; bold: boolean }> = [];
      
      // Add subtotal
      items.push({ label: 'Subtotal', value: formatCurrency(summary.subtotal), bold: false });
      
      // Add discount if present
      if (summary.discount !== undefined && summary.discount > 0) {
        items.push({ label: 'Discount', value: `-${formatCurrency(summary.discount)}`, bold: false });
      }
      
      // Add tax breakdown
      if (summary.cgst !== undefined && summary.cgst > 0) {
        items.push({ label: 'CGST', value: formatCurrency(summary.cgst), bold: false });
      }
      if (summary.sgst !== undefined && summary.sgst > 0) {
        items.push({ label: 'SGST', value: formatCurrency(summary.sgst), bold: false });
      }
      if (summary.igst !== undefined && summary.igst > 0) {
        items.push({ label: 'IGST', value: formatCurrency(summary.igst), bold: false });
      }
      if (summary.tax !== undefined && summary.tax > 0 && !summary.cgst && !summary.sgst && !summary.igst) {
        items.push({ label: 'Tax', value: formatCurrency(summary.tax), bold: false });
      }
      
      // Add custom tax breakdown if provided
      if (summary.taxBreakdown) {
        summary.taxBreakdown.forEach(tax => {
          items.push({ label: tax.label, value: formatCurrency(tax.amount), bold: false });
        });
      }
      
      // Add round off if present
      if (summary.roundOff !== undefined && summary.roundOff !== 0) {
        items.push({ label: 'Round Off', value: formatCurrency(summary.roundOff), bold: false });
      }
      
      // Add total
      items.push({ label: 'Total', value: formatCurrency(summary.total), bold: true });
      
      items.forEach(item => {
        this.doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
        this.doc.setFontSize(item.bold ? 12 : 10);
        
        if (item.bold) {
          this.applyColor('setFillColor', colors.primary);
          this.doc.rect(pageWidth - 100, summaryY - 5, 85, 12, 'F');
          this.applyColor('setTextColor', colors.white);
        } else {
          this.applyColor('setTextColor', colors.text);
        }
        
        this.doc.text(item.label + ':', pageWidth - 95, summaryY);
        const valueWidth = this.doc.getTextWidth(item.value);
        this.doc.text(item.value, pageWidth - 20 - valueWidth, summaryY);
        summaryY += item.bold ? 15 : 10;
      });
    } else {
      // Print theme - simple summary
      this.applyColor('setTextColor', colors.text);
      this.doc.setFontSize(10);
      
      const formatCurrency = (amount: number) => {
        return new Intl.NumberFormat('en-IN', {
          style: 'currency',
          currency: summary.currency || 'INR'
        }).format(amount);
      };
      
      let summaryY = startY;
      const items: Array<{ label: string; value: string; bold: boolean }> = [];
      
      // Add subtotal
      items.push({ label: 'Subtotal', value: formatCurrency(summary.subtotal), bold: false });
      
      // Add discount if present
      if (summary.discount && summary.discount > 0) {
        items.push({ label: 'Discount', value: `-${formatCurrency(summary.discount)}`, bold: false });
      }
      
      // Add tax breakdown
      if (summary.cgst && summary.cgst > 0) {
        items.push({ label: 'CGST', value: formatCurrency(summary.cgst), bold: false });
      }
      if (summary.sgst && summary.sgst > 0) {
        items.push({ label: 'SGST', value: formatCurrency(summary.sgst), bold: false });
      }
      if (summary.igst && summary.igst > 0) {
        items.push({ label: 'IGST', value: formatCurrency(summary.igst), bold: false });
      }
      if (summary.tax && !summary.cgst && !summary.sgst && !summary.igst) {
        items.push({ label: 'Tax', value: formatCurrency(summary.tax), bold: false });
      }
      
      // Add round off if present
      if (summary.roundOff !== undefined && summary.roundOff !== 0) {
        items.push({ label: 'Round Off', value: formatCurrency(summary.roundOff), bold: false });
      }
      
      // Add total
      items.push({ label: 'Total', value: formatCurrency(summary.total), bold: true });
      
      items.forEach(item => {
        this.doc.setFont('helvetica', item.bold ? 'bold' : 'normal');
        this.doc.text(`${item.label}:`, pageWidth - 80, summaryY);
        const valueWidth = this.doc.getTextWidth(item.value);
        this.doc.text(item.value, pageWidth - 15 - valueWidth, summaryY);
        summaryY += 7;
      });
    }
  }

  /**
   * Add notes/terms section
   */
  addNotes(notes: string, yPos: number = 200): number {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    
    if (!notes) return yPos;
    
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(9);
    this.doc.setFont('helvetica', 'normal');
    
    if (this.theme === 'digital') {
      // Add background
      const lines = this.doc.splitTextToSize(notes, pageWidth - 130);
      const height = lines.length * 5 + 10;
      
      this.applyColor('setFillColor', colors.light);
      this.doc.roundedRect(15, yPos, pageWidth - 130, height, 3, 3, 'F');
      
      this.doc.text('Notes:', 20, yPos + 8);
      this.doc.text(lines, 20, yPos + 15);
    } else {
      this.doc.text('Notes:', 15, yPos);
      const lines = this.doc.splitTextToSize(notes, pageWidth - 130);
      this.doc.text(lines, 15, yPos + 7);
    }
    
    return yPos + 30;
  }

  /**
   * Add footer with branding
   */
  addFooter(): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    
    if (this.theme === 'digital') {
      // Colorful footer
      this.applyColor('setFillColor', colors.primary);
      this.doc.rect(0, pageHeight - 20, pageWidth, 20, 'F');
      
      this.applyColor('setTextColor', colors.white);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      
      // Thank you message
      const thankYou = 'Thank you for your business!';
      const thankYouWidth = this.doc.getTextWidth(thankYou);
      this.doc.text(thankYou, (pageWidth - thankYouWidth) / 2, pageHeight - 12);
      
      // Website
      if (this.companyInfo.website) {
        this.doc.setFont('helvetica', 'bold');
        const websiteWidth = this.doc.getTextWidth(this.companyInfo.website);
        this.doc.text(this.companyInfo.website, (pageWidth - websiteWidth) / 2, pageHeight - 6);
      }
      
      // Social icons placeholder
      this.applyColor('setFillColor', colors.white);
      const iconY = pageHeight - 10;
      const iconSpacing = 15;
      const startX = pageWidth - 60;
      
      // Add small circles as social media placeholders
      for (let i = 0; i < 3; i++) {
        this.doc.circle(startX + (i * iconSpacing), iconY, 3, 'F');
      }
    } else {
      // Print theme - minimal footer
      this.applyColor('setDrawColor', colors.secondary);
      this.doc.setLineWidth(0.2);
      this.doc.line(15, pageHeight - 25, pageWidth - 15, pageHeight - 25);
      
      this.applyColor('setTextColor', colors.textLight);
      this.doc.setFontSize(8);
      this.doc.setFont('helvetica', 'normal');
      
      const footerText = `${this.companyInfo.name} | ${this.companyInfo.phone} | ${this.companyInfo.email}`;
      const footerWidth = this.doc.getTextWidth(footerText);
      this.doc.text(footerText, (pageWidth - footerWidth) / 2, pageHeight - 18);
    }
  }

  /**
   * Add page numbers
   */
  addPageNumber(): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    const pageNumber = (this.doc as any).internal.getCurrentPageInfo ? (this.doc as any).internal.getCurrentPageInfo().pageNumber : 1;
    const totalPages = (this.doc as any).internal.getNumberOfPages ? (this.doc as any).internal.getNumberOfPages() : 1;
    
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(8);
    this.doc.setFont('helvetica', 'normal');
    
    const pageText = `Page ${pageNumber} of ${totalPages}`;
    const pageTextWidth = this.doc.getTextWidth(pageText);
    this.doc.text(pageText, pageWidth - pageTextWidth - 15, pageHeight - 28);
  }

  /**
   * Add watermark
   */
  addWatermark(text: string): void {
    const colors = this.colors[this.theme];
    const pageWidth = this.doc.internal.pageSize.getWidth();
    const pageHeight = this.doc.internal.pageSize.getHeight();
    
    this.doc.saveGraphicsState();
    this.doc.setGState(this.doc.GState({ opacity: 0.1 }));
    this.applyColor('setTextColor', colors.textLight);
    this.doc.setFontSize(60);
    this.doc.setFont('helvetica', 'bold');
    
    // Center and rotate
    this.doc.text(text, pageWidth / 2, pageHeight / 2, {
      align: 'center',
      angle: -45
    });
    
    this.doc.restoreGraphicsState();
  }

  /**
   * Add enhanced items table with all details
   */
  addEnhancedItemsTable(items: ItemDetails[], showBatchInfo: boolean = true): number {
    const colors = this.colors[this.theme];
    const startY = this.currentY || 100;
    
    // Table headers
    const headers = ['S.No', 'Product'];
    if (showBatchInfo) headers.push('HSN');
    headers.push('Qty', 'Rate', 'Tax%', 'Amount');
    
    // Prepare table rows
    const rows = items.map((item, index) => {
      const row = [
        String(item.srNo || index + 1),
        item.name.length > 30 ? item.name.substring(0, 30) + '...' : item.name
      ];
      if (showBatchInfo) row.push(item.hsn || '');
      row.push(
        `${item.quantity}${item.unit ? ' ' + item.unit : ''}`,
        `₹${item.unitPrice.toFixed(2)}`,
        `${item.taxPercent || 0}%`,
        `₹${item.lineTotal.toFixed(2)}`
      );
      return row;
    });
    
    // Add batch/expiry info as additional rows if needed
    const bodyRows: any[] = [];
    items.forEach((item, index) => {
      bodyRows.push(rows[index]);
      if (showBatchInfo && (item.batch || item.expiry)) {
        const batchRow = ['', `  Batch: ${item.batch || 'N/A'} | Exp: ${item.expiry || 'N/A'}`, ''];
        if (showBatchInfo) batchRow.push('');
        batchRow.push('', '', '', '');
        bodyRows.push(batchRow);
      }
    });
    
    autoTable(this.doc, {
      startY,
      head: [headers],
      body: bodyRows,
      theme: this.theme === 'print' ? 'plain' : 'grid',
      headStyles: {
        fillColor: this.theme === 'print' ? colors.white : colors.primary,
        textColor: this.theme === 'print' ? colors.text : colors.white,
        fontSize: 10,
        fontStyle: 'bold',
        halign: 'left'
      },
      bodyStyles: {
        textColor: colors.text,
        fontSize: 9,
        cellPadding: 3
      },
      alternateRowStyles: this.theme !== 'print' ? {
        fillColor: colors.light
      } : {},
      columnStyles: {
        0: { cellWidth: 15, halign: 'center' },
        1: { cellWidth: 'auto' },
        2: { cellWidth: 20, halign: 'center' },
        3: { cellWidth: 20, halign: 'right' },
        4: { cellWidth: 25, halign: 'right' },
        5: { cellWidth: 20, halign: 'center' },
        6: { cellWidth: 30, halign: 'right' }
      },
      margin: { left: this.margin.left, right: this.margin.right },
      didDrawPage: () => {
        this.addPageNumber();
      }
    } as any);
    
    this.currentY = (this.doc as any).lastAutoTable.finalY;
    return this.currentY;
  }

  /**
   * Add bank details section
   */
  addBankDetails(bankDetails: BankDetails, yPos?: number): number {
    const colors = this.colors[this.theme];
    const startY = yPos || this.currentY || 150;
    
    this.checkNewPage(40);
    
    this.doc.setFontSize(10);
    this.doc.setFont('helvetica', 'bold');
    this.applyColor('setTextColor', colors.text);
    this.doc.text('Bank Details:', this.margin.left, startY);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(9);
    let currentY = startY + 6;
    
    if (bankDetails.bankName) {
      this.doc.text(`Bank: ${bankDetails.bankName}`, this.margin.left, currentY);
      currentY += 5;
    }
    if (bankDetails.accountNumber) {
      this.doc.text(`A/C: ${bankDetails.accountNumber}`, this.margin.left, currentY);
      currentY += 5;
    }
    if (bankDetails.ifscCode) {
      this.doc.text(`IFSC: ${bankDetails.ifscCode}`, this.margin.left, currentY);
      currentY += 5;
    }
    if (bankDetails.branch) {
      this.doc.text(`Branch: ${bankDetails.branch}`, this.margin.left, currentY);
      currentY += 5;
    }
    if (bankDetails.upiId) {
      this.doc.text(`UPI: ${bankDetails.upiId}`, this.margin.left, currentY);
      currentY += 5;
    }
    
    this.currentY = currentY + 5;
    return this.currentY;
  }

  /**
   * Add terms and conditions
   */
  addTermsAndConditions(terms: string, yPos?: number): number {
    const colors = this.colors[this.theme];
    const startY = yPos || this.currentY || 180;
    
    this.checkNewPage(30);
    
    this.doc.setFont('helvetica', 'bold');
    this.doc.setFontSize(10);
    this.applyColor('setTextColor', colors.text);
    this.doc.text('Terms & Conditions:', this.margin.left, startY);
    
    this.doc.setFont('helvetica', 'normal');
    this.doc.setFontSize(8);
    this.applyColor('setTextColor', colors.textLight);
    const termsLines = this.doc.splitTextToSize(terms, this.pageWidth - this.margin.left - this.margin.right);
    this.doc.text(termsLines, this.margin.left, startY + 6);
    
    this.currentY = startY + 6 + (termsLines.length * 4) + 5;
    return this.currentY;
  }

  /**
   * Download PDF directly
   */
  download(filename: string): void {
    const blob = this.getBlob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /**
   * Get PDF as base64 string
   */
  async getBase64(): Promise<string> {
    const blob = this.getBlob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result?.toString().split(',')[1] || '';
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  /**
   * Save or preview the PDF
   */
  save(filename: string): void {
    this.doc.save(filename);
  }

  /**
   * Get PDF as blob for preview
   */
  getBlob(): Blob {
    return this.doc.output('blob');
  }

  /**
   * Open PDF in new window
   */
  preview(): void {
    const pdfUrl = this.doc.output('bloburl');
    window.open(pdfUrl, '_blank');
  }

  /**
   * Print PDF directly
   */
  print(): void {
    const pdfUrl = this.doc.output('bloburl');
    const printWindow = window.open(pdfUrl, '_blank');
    if (printWindow) {
      printWindow.onload = () => {
        printWindow.print();
      };
    }
  }
}

export default GlobalPDFGenerator;